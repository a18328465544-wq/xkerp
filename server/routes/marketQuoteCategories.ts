import type {Express, Request, RequestHandler} from "express";
import type {PoolClient} from "pg";
import type {AuthenticatedRequest} from "../httpAuth.ts";
import {DEFAULT_TENANT_ID} from "../commercialConstants.ts";
import {saveStateRecords, type StateRecordTransactionHook} from "../db.ts";
import {createMarketQuoteCategory, updateMarketQuoteCategory, type MarketQuoteCategory} from "../marketQuoteCategoryRepository.ts";
import {marketQuoteCategoryCreateDto, marketQuoteCategoryUpdateDto, parseHttpDto} from "../httpDto.ts";
import {statePatchResponse} from "../statePatch.ts";
import type {AppState, createStoreActions} from "../store.ts";

type CategoryRequest = AuthenticatedRequest<unknown>;

type MarketQuoteCategoryRouteDependencies = {
  requireMenu: (menuId: string) => RequestHandler;
  asyncRoute: (handler: RequestHandler) => RequestHandler;
  getState: () => AppState;
  actions: (req: Request) => ReturnType<typeof createStoreActions>;
  actorForRequest: (req: CategoryRequest) => string;
  listCategories: (tenantId: string) => Promise<MarketQuoteCategory[]>;
};

async function persistCategoryMutation<T>(
  req: CategoryRequest,
  dependencies: MarketQuoteCategoryRouteDependencies,
  action: string,
  target: string,
  after: string,
  operation: (client: PoolClient, tenantId: string, actor: string) => Promise<T>,
) {
  const state = dependencies.getState();
  const previousLogs = state.logs;
  const tenantId = req.tenantId || DEFAULT_TENANT_ID;
  const actor = dependencies.actorForRequest(req);
  dependencies.actions(req).addLog(actor, "行情参考", action, target, undefined, after);
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

export function registerMarketQuoteCategoryRoutes(app: Express, dependencies: MarketQuoteCategoryRouteDependencies) {
  app.get(
    "/api/market-quote-categories",
    dependencies.requireMenu("quotes"),
    dependencies.asyncRoute(async (req, res) => {
      const tenantId = (req as CategoryRequest).tenantId || DEFAULT_TENANT_ID;
      res.json({data: await dependencies.listCategories(tenantId)});
    }),
  );

  app.post(
    "/api/market-quote-categories",
    dependencies.requireMenu("quotes"),
    dependencies.asyncRoute(async (req, res) => {
      const command = parseHttpDto(marketQuoteCategoryCreateDto, req.body);
      const {result, stateMerge} = await persistCategoryMutation(
        req as CategoryRequest,
        dependencies,
        "新增行情分类",
        command.name,
        command.name,
        (client, tenantId, actor) => createMarketQuoteCategory(client, tenantId, command.name, actor),
      );
      res.status(201).json(statePatchResponse(result, stateMerge));
    }),
  );

  app.patch(
    "/api/market-quote-categories/:id",
    dependencies.requireMenu("quotes"),
    dependencies.asyncRoute(async (req, res) => {
      const updates = parseHttpDto(marketQuoteCategoryUpdateDto, req.body);
      const action = updates.isActive === false ? "停用行情分类" : updates.isActive === true ? "启用行情分类" : "重命名行情分类";
      const {result, stateMerge} = await persistCategoryMutation<MarketQuoteCategory>(
        req as CategoryRequest,
        dependencies,
        action,
        req.params.id || "未知分类",
        updates.name || String(updates.isActive),
        (client, tenantId, actor) => updateMarketQuoteCategory(client, tenantId, req.params.id || "", updates, actor),
      );
      res.json(statePatchResponse(result, stateMerge));
    }),
  );
}
