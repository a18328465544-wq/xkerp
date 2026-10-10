import type {Express, Request, RequestHandler} from "express";
import type {PoolClient} from "pg";
import type {AuthenticatedRequest} from "../httpAuth.ts";
import {DEFAULT_TENANT_ID} from "../commercialConstants.ts";
import {saveStateRecords, type StateRecordTransactionHook} from "../db.ts";
import {createCustomerCategory, updateCustomerCategory, type CustomerCategory} from "../customerCategoryRepository.ts";
import {customerCategoryCreateDto, customerCategoryUpdateDto, parseHttpDto} from "../httpDto.ts";
import {statePatchResponse} from "../statePatch.ts";
import type {AppState, createStoreActions} from "../store.ts";

type CategoryRequest = AuthenticatedRequest<unknown>;

type CustomerCategoryRouteDependencies = {
  requireMenu: (menuId: string) => RequestHandler;
  asyncRoute: (handler: RequestHandler) => RequestHandler;
  getState: () => AppState;
  actions: (req: Request) => ReturnType<typeof createStoreActions>;
  actorForRequest: (req: CategoryRequest) => string;
};

async function persistCategoryMutation<T>(
  req: CategoryRequest,
  dependencies: CustomerCategoryRouteDependencies,
  action: string,
  target: string,
  after: string,
  operation: (client: PoolClient, tenantId: string, actor: string) => Promise<T>,
) {
  const state = dependencies.getState();
  const previousLogs = state.logs;
  const tenantId = req.tenantId || DEFAULT_TENANT_ID;
  const actor = dependencies.actorForRequest(req);
  dependencies.actions(req).addLog(actor, "客户档案", action, target, undefined, after);
  let result!: T;
  try {
    const transactionHook: StateRecordTransactionHook = async (client) => {
      result = await operation(client, tenantId, actor);
    };
    await saveStateRecords([{key: "logs", items: state.logs.slice(0, 1)}], transactionHook, tenantId);
  } catch (error) {
    state.logs = previousLogs;
    throw error;
  }
  return {result, stateMerge: {logs: state.logs.slice(0, 1)}};
}

export function registerCustomerCategoryRoutes(app: Express, dependencies: CustomerCategoryRouteDependencies) {
  app.post(
    "/api/customer-categories",
    dependencies.requireMenu("crm"),
    dependencies.asyncRoute(async (req, res) => {
      const command = parseHttpDto(customerCategoryCreateDto, req.body);
      const {result, stateMerge} = await persistCategoryMutation(
        req as CategoryRequest,
        dependencies,
        "新增客户分类",
        command.name,
        command.name,
        (client, tenantId, actor) => createCustomerCategory(client, tenantId, command.name, actor),
      );
      res.status(201).json(statePatchResponse(result, stateMerge));
    }),
  );

  app.patch(
    "/api/customer-categories/:id",
    dependencies.requireMenu("crm"),
    dependencies.asyncRoute(async (req, res) => {
      const updates = parseHttpDto(customerCategoryUpdateDto, req.body);
      const action = updates.isActive === false ? "停用客户分类" : updates.isActive === true ? "启用客户分类" : "重命名客户分类";
      const {result, stateMerge} = await persistCategoryMutation<CustomerCategory>(
        req as CategoryRequest,
        dependencies,
        action,
        req.params.id || "未知分类",
        updates.name || String(updates.isActive),
        (client, tenantId, actor) => updateCustomerCategory(client, tenantId, req.params.id || "", updates, actor),
      );
      res.json(statePatchResponse(result, stateMerge));
    }),
  );
}
