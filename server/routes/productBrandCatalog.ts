import type {Express, RequestHandler} from "express";
import {z} from "zod";
import type {AppState, createStoreActions} from "../store.ts";
import type {SystemUserAccount} from "../../src/types.ts";
import type {AuthenticatedRequest} from "../httpAuth.ts";
import type {StateCommandTransactionHook} from "../stateCommand.ts";
import {saveStateRecords} from "../db.ts";
import {parseHttpDto} from "../httpDto.ts";
import {canAccessMenu, getPermissionsForUser, publicStateMergeForUser} from "../publicState.ts";
import {ForbiddenError} from "../errors.ts";
import {DEFAULT_STORE_ID, DEFAULT_TENANT_ID} from "../commercialConstants.ts";
import {stateMergeRecords, statePatchResponse} from "../statePatch.ts";
import {addProductBrandAliases, bindLegacyProductBrands, createProductBrand, currentProductBrandCatalog} from "../productBrandCatalog.ts";
import {resolveProductBrand} from "../../src/utils/productBrandCatalog.ts";

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
const aliasesDto = z.array(z.string().trim().min(1).max(80)).max(30);
export const productBrandCreateDto = z.object({name: z.string().trim().min(1).max(80), aliases: aliasesDto.default([])}).strict();
export const productBrandAliasesDto = z.object({aliases: aliasesDto.min(1)}).strict();
export const productBrandBindingsDto = z.object({bindings: z.array(z.object({productId: z.string().min(1).max(120), brandId: z.string().min(1).max(160), expectedBrand: z.string().max(120)}).strict()).min(1).max(200)}).strict();

export function canManageProductBrands(state: AppState, user?: SystemUserAccount) {
  return Boolean(user && (user.role === "老板" || canAccessMenu(getPermissionsForUser(state, user), "permissions")));
}
const canRead = (state: AppState, user?: SystemUserAccount) => Boolean(user && ["products", "purchase_add", "sales_add", "inventory"].some(menu => canAccessMenu(getPermissionsForUser(state, user), menu)));

/** The global mutation guard supplies the transaction lock and fresh tenant/store state. */
export function registerProductBrandCatalogRoutes(app: Express, dependencies: Dependencies) {
  app.get("/api/product-brands", dependencies.asyncRoute((raw, res) => {
    const req = raw as AuthenticatedRequest<SystemUserAccount>, state = dependencies.getState();
    if (!canRead(state, req.authUser)) throw new ForbiddenError("当前账号没有查看品牌的权限，请联系管理员开通");
    const brands = currentProductBrandCatalog(state);
    res.json({data: {brands, canManage: canManageProductBrands(state, req.authUser), legacyMatches: []}});
  }));
  app.get("/api/product-brands/legacy-matches", dependencies.asyncRoute((raw, res) => {
    const req = raw as AuthenticatedRequest<SystemUserAccount>, state = dependencies.getState();
    if (!req.authUser || !canAccessMenu(getPermissionsForUser(state, req.authUser), "products")) throw new ForbiddenError("当前账号没有查看商品品牌匹配的权限，请联系管理员开通");
    const brands = currentProductBrandCatalog(state);
    res.json({data: state.products.filter(product => !product.brandId).map(product => ({productId: product.id, productName: product.name, originalBrand: product.brand, suggestedBrandId: resolveProductBrand(product.brand, brands)?.id}))});
  }));
  const mutation = (kind: "create" | "aliases" | "bindings"): RequestHandler => async (raw, res) => {
    const req = raw as AuthenticatedRequest<SystemUserAccount>, state = dependencies.getState();
    if (!canRead(state, req.authUser) || !canManageProductBrands(state, req.authUser) || kind === "bindings" && !canAccessMenu(getPermissionsForUser(state, req.authUser!), "products")) throw new ForbiddenError("当前账号没有维护品牌的权限，请联系管理员开通");
    const input = kind === "create" ? parseHttpDto(productBrandCreateDto, req.body) : kind === "aliases" ? parseHttpDto(productBrandAliasesDto, req.body) : parseHttpDto(productBrandBindingsDto, req.body);
    req.body = {...input, __catalogStore: req.storeId || DEFAULT_STORE_ID};
    const context = await dependencies.claimMutationIdempotency(req);
    if (context?.replay) {res.status(context.replay.statusCode).json(context.replay.response); return;}
    const previous = {productBrands: state.productBrands, products: state.products, logs: state.logs};
    try {
      const actor = req.authUser!.displayName;
      const saved = kind === "create" ? createProductBrand(state, input as z.infer<typeof productBrandCreateDto>, actor) : kind === "aliases" ? addProductBrandAliases(state, String(req.params.id), (input as z.infer<typeof productBrandAliasesDto>).aliases, actor) : bindLegacyProductBrands(state, (input as z.infer<typeof productBrandBindingsDto>).bindings);
      const nextProducts = state.products;
      const responseData = Array.isArray(saved) ? saved.map(product => ({productId: product.id, brandId: product.brandId})) : saved;
      dependencies.actions(req).addLog(actor, "商品库", kind === "bindings" ? "确认商品品牌绑定" : kind === "aliases" ? "新增品牌别名" : "新建商品品牌", Array.isArray(saved) ? `确认 ${saved.length} 款商品` : saved.name, kind === "bindings" ? JSON.stringify((input as z.infer<typeof productBrandBindingsDto>).bindings) : undefined, JSON.stringify(responseData));
      state.products = nextProducts;
      const oldLogIds = new Set(previous.logs.map(log => log.id));
      const patch = {productBrands: Array.isArray(saved) ? [] : [saved], products: Array.isArray(saved) ? saved : [], logs: state.logs.filter(log => !oldLogIds.has(log.id))};
      const hook = dependencies.transactionHookWithIdempotency(context, 201);
      // Metadata maintenance never needs to expose product prices, including idempotent replays.
      const publicPatch = {productBrands: patch.productBrands, logs: patch.logs};
      await (dependencies.saveRecords || saveStateRecords)(stateMergeRecords(patch), hook ? client => hook(client, responseData, {stateMerge: publicPatch}) : undefined, req.tenantId || DEFAULT_TENANT_ID, req.storeId);
      res.status(201).json(statePatchResponse(responseData, publicStateMergeForUser(state, publicPatch, req.authUser)));
    } catch (error) {
      state.productBrands = previous.productBrands; state.products = previous.products; state.logs = previous.logs;
      await dependencies.releaseMutationIdempotency(context);
      throw error;
    }
  };
  app.post("/api/product-brands", dependencies.asyncRoute(mutation("create")));
  app.post("/api/product-brands/:id/aliases", dependencies.asyncRoute(mutation("aliases")));
  app.post("/api/product-brands/bindings", dependencies.asyncRoute(mutation("bindings")));
}
