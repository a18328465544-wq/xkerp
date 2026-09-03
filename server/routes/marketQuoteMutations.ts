import type {Express, Request, RequestHandler} from "express";
import {saveStateRecords} from "../db.ts";
import {marketQuotePriceChange, marketQuotePriceChanges, snapshotMarketQuote} from "../marketQuoteNotifications.ts";
import {stateDeleteRecords, stateMergeRecords, statePatchResponse, type StateMergePatch} from "../statePatch.ts";
import type {MarketQuote} from "../../src/types.ts";
import type {AppState, createStoreActions} from "../store.ts";

type MarketQuoteMutationDependencies = {
  requireMenu: (menuId: string) => RequestHandler;
  requireDeletePermission: RequestHandler;
  asyncRoute: (handler: RequestHandler) => RequestHandler;
  getState: () => AppState;
  actions: (req: Request) => ReturnType<typeof createStoreActions>;
  deleteMerge: () => StateMergePatch;
  notifyPriceChanged: (change: Exclude<ReturnType<typeof marketQuotePriceChange>, null>) => void | Promise<unknown>;
  notifyPriceChanges: (changes: ReturnType<typeof marketQuotePriceChanges>) => void | Promise<unknown>;
  sendValidationError: (req: Request, res: Parameters<RequestHandler>[1], message: string) => void;
};

function okMerge(data: unknown, stateMerge: StateMergePatch) {
  return statePatchResponse(data, stateMerge);
}

function recordsByIds<T extends {id: string}>(items: T[], ids: Iterable<string | undefined>) {
  const idSet = new Set(Array.from(ids).filter(Boolean));
  return idSet.size ? items.filter((item) => idSet.has(item.id)) : [];
}

function marketQuotesMerge(state: AppState, records: MarketQuote[]) {
  if (records.length === 0) return {logs: state.logs.slice(0, 1)} satisfies StateMergePatch;
  const productIds = new Set(records.map((record) => record.productId).filter(Boolean));
  return {
    marketQuotes: records,
    inventory: state.inventory.filter((item) => productIds.has(item.productId)),
    products: recordsByIds(state.products, Array.from(productIds)),
    logs: state.logs.slice(0, 1),
  } satisfies StateMergePatch;
}

function marketQuoteMerge(state: AppState, record: MarketQuote | null) {
  return marketQuotesMerge(state, record ? [record] : []);
}

/** Market quote writes stay isolated so notification side effects remain auditable. */
export function registerMarketQuoteMutationRoutes(app: Express, dependencies: MarketQuoteMutationDependencies) {
  app.post(
    "/api/market-quotes",
    dependencies.requireMenu("quotes"),
    dependencies.asyncRoute(async (req, res) => {
      const created = dependencies.actions(req).createMarketQuote(req.body);
      const stateMerge = marketQuoteMerge(dependencies.getState(), created);
      await saveStateRecords(stateMergeRecords(stateMerge));
      res.status(201).json(okMerge(created, stateMerge));
    }),
  );

  app.post(
    "/api/market-quotes/import",
    dependencies.requireMenu("quotes"),
    dependencies.asyncRoute(async (req, res) => {
      const quotes = Array.isArray(req.body?.quotes) ? req.body.quotes : [];
      if (quotes.length === 0) {
        dependencies.sendValidationError(req, res, "请至少提供一条行情参考数据。");
        return;
      }
      if (quotes.length > 2000) {
        dependencies.sendValidationError(req, res, "单次最多导入 2000 条行情参考。");
        return;
      }
      const beforeQuotes = new Map(dependencies.getState().marketQuotes.map((quote) => [quote.id, snapshotMarketQuote(quote)] as const));
      const result = dependencies.actions(req).importMarketQuotes(quotes);
      const stateMerge = marketQuotesMerge(dependencies.getState(), result.quotes);
      await saveStateRecords(stateMergeRecords(stateMerge));
      void dependencies.notifyPriceChanges(marketQuotePriceChanges(beforeQuotes, result.quotes));
      res.status(201).json(okMerge(result, stateMerge));
    }),
  );

  app.patch(
    "/api/market-quotes/:id",
    dependencies.requireMenu("quotes"),
    dependencies.asyncRoute(async (req, res) => {
      const existing = dependencies.getState().marketQuotes.find((quote) => quote.id === req.params.id!);
      const beforeQuote = existing ? snapshotMarketQuote(existing) : undefined;
      const updated = dependencies.actions(req).updateMarketPrice(req.params.id!, req.body.todayBuyPrice, req.body.todaySellPrice, req.body.remarks);
      const stateMerge = marketQuoteMerge(dependencies.getState(), updated);
      await saveStateRecords(stateMergeRecords(stateMerge));
      const priceChange = marketQuotePriceChange(beforeQuote, updated || undefined);
      if (priceChange) void dependencies.notifyPriceChanged(priceChange);
      res.status(updated ? 200 : 404).json(okMerge(updated, stateMerge));
    }),
  );

  app.delete(
    "/api/market-quotes/:id",
    dependencies.requireMenu("quotes"),
    dependencies.requireDeletePermission,
    dependencies.asyncRoute(async (req, res) => {
      const deleted = dependencies.actions(req).deleteMarketQuote(req.params.id!);
      const stateMerge = dependencies.deleteMerge();
      const stateDelete = {marketQuotes: deleted?.id ? [deleted.id] : []};
      await saveStateRecords([...stateMergeRecords(stateMerge), ...stateDeleteRecords(stateDelete)]);
      res.status(deleted ? 200 : 404).json(statePatchResponse(deleted, stateMerge, stateDelete));
    }),
  );
}
