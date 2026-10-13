import type {Express, RequestHandler} from "express";
import {z} from "zod";
import {saveStateRecords} from "../db.ts";
import {stateMergeRecords, statePatchResponse} from "../statePatch.ts";
import {DEFAULT_STORE_ID, DEFAULT_TENANT_ID} from "../commercialConstants.ts";
import type {AuthenticatedRequest} from "../httpAuth.ts";
import type {SystemUserAccount} from "../../src/types.ts";
import type {AppState, createStoreActions} from "../store.ts";
import type {StateCommandTransactionHook} from "../stateCommand.ts";
import {canAccessMenu, getPermissionsForUser, publicStateMergeForUser} from "../publicState.ts";
import {ForbiddenError} from "../errors.ts";
import {parseHttpDto} from "../httpDto.ts";
import {gpuMemoryTypeValues, gpuVendorValues} from "../../src/types/gpuCore.ts";
import {canonicalGpuCore} from "../../src/utils/gpuCoreCatalog.ts";
import {addGpuCoreSpec, createGpuCore, currentGpuCoreCatalog} from "../gpuCoreCatalog.ts";

type IdempotencyContext = {request: {tenantId: string; route: string; key: string; requestHash: string}; replay?: {statusCode: number; response: unknown}};
type Dependencies = {
  asyncRoute: (handler: RequestHandler) => RequestHandler;
  getState: () => AppState;
  actions: (req: AuthenticatedRequest<SystemUserAccount>) => ReturnType<typeof createStoreActions>;
  claimMutationIdempotency: (req: AuthenticatedRequest<SystemUserAccount>) => Promise<IdempotencyContext | null>;
  releaseMutationIdempotency: (context: IdempotencyContext | null) => Promise<void>;
  transactionHookWithIdempotency: <T>(context: IdempotencyContext | null, statusCode: number) => StateCommandTransactionHook<T> | undefined;
  saveRecords?: typeof saveStateRecords;
};
export const gpuSpecDto = z.object({capacityGb: z.number().int().min(1).max(512), memoryType: z.enum(gpuMemoryTypeValues), revision: z.string().trim().max(30).default("")}).strict();
export const gpuCoreCreateDto = z.object({vendor: z.enum(gpuVendorValues), model: z.string().trim().min(1).max(80), specs: z.array(gpuSpecDto).max(16).default([])}).strict();

export function canManageGpuCoreCatalog(state: AppState, user?: SystemUserAccount) {
  return Boolean(user && (user.role === "老板" || canAccessMenu(getPermissionsForUser(state, user), "permissions")));
}
function canRead(state: AppState, user?: SystemUserAccount) {
  return Boolean(user && ["products", "quotes", "purchase_add", "sales_add", "inventory"].some(menu => canAccessMenu(getPermissionsForUser(state, user), menu)));
}

/** Reference metadata has no price fields; store extensions use the existing scoped transaction. */
export function registerGpuCoreCatalogRoutes(app: Express, dependencies: Dependencies) {
  app.get("/api/gpu-cores", dependencies.asyncRoute((req, res) => {
    const user = (req as AuthenticatedRequest<SystemUserAccount>).authUser;
    const state = dependencies.getState();
    if (!canRead(state, user)) throw new ForbiddenError("当前账号没有查看核心型号的权限");
    res.json({data: {cores: currentGpuCoreCatalog(state), canManage: canManageGpuCoreCatalog(state, user)}});
  }));
  const mutation = (addingSpec: boolean): RequestHandler => async (raw, res) => {
    const req = raw as AuthenticatedRequest<SystemUserAccount>;
    const state = dependencies.getState();
    if (!canRead(state, req.authUser) || !canManageGpuCoreCatalog(state, req.authUser)) throw new ForbiddenError("当前账号没有维护核心型号的权限，请联系管理员开通");
    const coreInput = addingSpec ? undefined : parseHttpDto(gpuCoreCreateDto, req.body);
    const specInput = addingSpec ? parseHttpDto(gpuSpecDto, req.body) : undefined;
    const identity = coreInput && canonicalGpuCore(coreInput.vendor, coreInput.model);
    req.body = coreInput ? {...coreInput, model: identity?.model || coreInput.model, specs: coreInput.specs.map(spec => ({...spec, revision: spec.revision.toUpperCase()})).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)))} : {...specInput, revision: specInput!.revision.toUpperCase()};
    req.body = {...req.body, __catalogStore: req.storeId || DEFAULT_STORE_ID};
    const context = await dependencies.claimMutationIdempotency(req);
    if (context?.replay) {res.status(context.replay.statusCode).json(context.replay.response); return;}
    const previous = {gpuCores: state.gpuCores, logs: state.logs, products: state.products};
    try {
      const actor = req.authUser!.displayName;
      const created = addingSpec ? addGpuCoreSpec(state, String(req.params.id), specInput!, actor) : createGpuCore(state, coreInput!, actor);
      dependencies.actions(req).addLog(actor, "商品库", addingSpec ? "新增核心显存规格" : "新建核心型号", created.model, undefined, JSON.stringify({id: created.id, specs: created.specs}));
      state.products = previous.products;
      const previousIds = new Set(previous.logs.map(log => log.id));
      const patch = {gpuCores: [created], logs: state.logs.filter(log => !previousIds.has(log.id))};
      const hook = dependencies.transactionHookWithIdempotency(context, 201);
      await (dependencies.saveRecords || saveStateRecords)(stateMergeRecords(patch), hook ? client => hook(client, created, {stateMerge: patch}) : undefined, req.tenantId || DEFAULT_TENANT_ID, req.storeId);
      res.status(201).json(statePatchResponse(created, publicStateMergeForUser(state, patch, req.authUser)));
    } catch (error) {
      state.gpuCores = previous.gpuCores;
      state.logs = previous.logs;
      state.products = previous.products;
      await dependencies.releaseMutationIdempotency(context);
      throw error;
    }
  };
  app.post("/api/gpu-cores", dependencies.asyncRoute(mutation(false)));
  app.post("/api/gpu-cores/:id/specs", dependencies.asyncRoute(mutation(true)));
}
