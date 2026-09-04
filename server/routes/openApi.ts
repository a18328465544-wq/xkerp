import type {Express, Request, RequestHandler} from "express";
import express from "express";
import type {CardInventory} from "../../src/types.ts";
import {storeDateDiffDays} from "../../src/utils/storeTime.ts";
import {matchesKeyword, normalizeSearchText} from "../../src/utils/search.ts";
import {findInventoryRecord, findInventoryRecordBySn, queryInventoryPage, type CollectionPage, type InventoryPageFilters, saveStateRecords} from "../db.ts";
import type {StateCollectionKey} from "../db.ts";
import {marketQuotePriceChanges, snapshotMarketQuote} from "../marketQuoteNotifications.ts";
import {stateMergeRecords} from "../statePatch.ts";
import {scanFlowMerge} from "./inventoryMutations.ts";
import type {AppState, createStoreActions, StoreActionContext} from "../store.ts";
import {productPriceSyncMerge} from "../productStateMerges.ts";

type OpenApiDependencies = {
  openApiRateLimiter: RequestHandler;
  requireOpenApiToken: RequestHandler;
  asyncRoute: (handler: RequestHandler) => RequestHandler;
  reloadStateCollections: (keys: StateCollectionKey[]) => Promise<void>;
  getState: () => AppState;
  actions: (context: StoreActionContext) => ReturnType<typeof createStoreActions>;
  notifyMarketQuotePriceChanged: (changes: Parameters<typeof import("../feishu.ts").notifyFeishuMarketQuotePriceChanged>[0]) => void | Promise<unknown>;
  sendApiError: (req: Request, res: Parameters<RequestHandler>[1], status: number, code: string, message: string) => void;
  paginated: <T>(items: T[], req: Request) => unknown;
  defaultTenantId: string;
  defaultStoreId: string;
  queryInventoryPage?: <T = unknown>(filters: InventoryPageFilters) => Promise<CollectionPage<T>>;
  findInventoryRecord?: <T = unknown>(id: string, tenantId?: string, storeId?: string) => Promise<T | null>;
  findInventoryRecordBySn?: <T = unknown>(sn: string, tenantId?: string, storeId?: string) => Promise<T | null>;
};

function openInventoryItem(card: CardInventory) {
  return {
    id: card.id,
    productId: card.productId,
    productName: card.productName,
    category: card.category || "显卡",
    model: card.model,
    brand: card.brand,
    version: card.version,
    vram: card.vram,
    sn: card.sn,
    expressNo: card.expressNo,
    sourceType: card.sourceType,
    supplierName: card.supplierName,
    costPrice: card.costPrice,
    estSellPrice: card.estSellPrice,
    marketPrice: card.marketPrice,
    priceSource: card.priceSource,
    priceUpdatedAt: card.priceUpdatedAt,
    status: card.status,
    condition: card.condition,
    inWarranty: card.inWarranty,
    warrantyDate: card.warrantyDate,
    repaired: card.repaired,
    gpuRisk: card.gpuRisk,
    fullBox: card.fullBox,
    warehouseLocation: card.warehouseLocation,
    entryTime: card.entryTime,
    storageDays: storeDateDiffDays(card.entryTime),
    remarks: card.remarks,
    salesPrice: card.salesPrice,
    salesTime: card.salesTime,
    salesInvoiceId: card.salesInvoiceId,
    buyerName: card.buyerName,
  };
}

const defaultQueryInventoryPage = queryInventoryPage;
const defaultFindInventoryRecord = findInventoryRecord;
const defaultFindInventoryRecordBySn = findInventoryRecordBySn;

/** Public, token-protected inventory and market-price endpoints. */
export function registerOpenApiRoutes(app: Express, dependencies: OpenApiDependencies) {
  const queryInventory = dependencies.queryInventoryPage || defaultQueryInventoryPage;
  const findInventory = dependencies.findInventoryRecord || defaultFindInventoryRecord;
  const findInventoryBySn = dependencies.findInventoryRecordBySn || defaultFindInventoryRecordBySn;
  const openInventoryRouter = express.Router();
  openInventoryRouter.use(dependencies.openApiRateLimiter, dependencies.requireOpenApiToken);

  openInventoryRouter.get("/items", dependencies.asyncRoute(async (req, res) => {
    const page = await queryInventory<CardInventory>({
      tenantId: dependencies.defaultTenantId,
      storeId: dependencies.defaultStoreId,
      page: Number(req.query.page || 1),
      pageSize: Number(req.query.pageSize || req.query.per_page || 20),
      keyword: String(req.query.keyword || req.query.search || ""),
      status: String(req.query.status || ""),
      category: String(req.query.category || ""),
      warehouseLocation: String(req.query.warehouseLocation || ""),
      includeSold: String(req.query.includeSold || "") === "true",
      sortKey: String(req.query.sortKey || ""),
      sortDirection: req.query.sortDirection === "asc" ? "asc" : "desc",
    });
    res.json({data: page.data.map(openInventoryItem), meta: page.meta});
  }));

  openInventoryRouter.get("/items/:id", dependencies.asyncRoute(async (req, res) => {
    const card = await findInventory<CardInventory>(req.params.id!, dependencies.defaultTenantId, dependencies.defaultStoreId);
    if (!card) {
      dependencies.sendApiError(req, res, 404, "INVENTORY_NOT_FOUND", "库存档案不存在");
      return;
    }
    res.json({data: openInventoryItem(card)});
  }));

  openInventoryRouter.get("/by-sn/:sn", dependencies.asyncRoute(async (req, res) => {
    const card = await findInventoryBySn<CardInventory>(
      req.params.sn!.trim(),
      dependencies.defaultTenantId,
      dependencies.defaultStoreId,
    );
    if (!card) {
      dependencies.sendApiError(req, res, 404, "INVENTORY_SN_NOT_FOUND", "未找到该 SN 对应库存");
      return;
    }
    res.json({data: openInventoryItem(card)});
  }));

  openInventoryRouter.get("/summary", dependencies.asyncRoute(async (req, res) => {
    await dependencies.reloadStateCollections(["inventory"]);
    const rows = dependencies.actions({role: "财务", actor: "OpenAPI"}).getInventorySummary(req.query as Record<string, string>);
    res.json(dependencies.paginated(rows, req));
  }));

  const scan = (mode: "入库" | "出库" | "移库") => dependencies.asyncRoute(async (req, res) => {
    await dependencies.reloadStateCollections(["inventory", "products", "salesInvoices", "logs"]);
    const result = dependencies.actions({role: "财务", actor: "OpenAPI"}).scanInventoryFlow({
      ...req.body,
      mode,
      handler: req.body?.handler || "OpenAPI",
    });
    const stateMerge = scanFlowMerge(dependencies.getState(), result, mode === "出库" ? req.body?.salesInvoiceId : undefined);
    await saveStateRecords(stateMergeRecords(stateMerge));
    res.json({data: result});
  });
  openInventoryRouter.post("/scan-in", scan("入库"));
  openInventoryRouter.post("/scan-out", scan("出库"));
  openInventoryRouter.post("/relocate", scan("移库"));

  app.use("/api/open/inventory", openInventoryRouter);

  const openPricesRouter = express.Router();
  openPricesRouter.use(dependencies.openApiRateLimiter, dependencies.requireOpenApiToken);
  openPricesRouter.post("/sync-est-sell", dependencies.asyncRoute(async (req, res) => {
    await dependencies.reloadStateCollections(["products", "inventory", "marketQuotes", "logs"]);
    const state = dependencies.getState();
    const body = req.body || {};
    const beforeQuotes = new Map(
      state.marketQuotes
        .filter((quote) => quote.productId === String(body.productId || "").trim())
        .map((quote) => [quote.id, snapshotMarketQuote(quote)] as const),
    );
    const result = dependencies.actions({role: "财务", actor: "OpenAPI"}).syncEstimatedSellPrice({
      productId: String(body.productId || ""),
      estSellPrice: Number(body.estSellPrice ?? body.suggestSellPrice ?? body.refSellPrice ?? body.todaySellPrice),
      priceSource: body.priceSource || body.source,
      remarks: body.remarks,
    });
    const stateMerge = productPriceSyncMerge(state, result.productId);
    await saveStateRecords(stateMergeRecords(stateMerge));
    void dependencies.notifyMarketQuotePriceChanged(marketQuotePriceChanges(beforeQuotes, state.marketQuotes.filter((quote) => quote.productId === result.productId)));
    res.json({data: result});
  }));

  openPricesRouter.get("/market-quotes", dependencies.asyncRoute(async (req, res) => {
    await dependencies.reloadStateCollections(["marketQuotes"]);
    const state = dependencies.getState();
    const keyword = String(req.query.q || req.query.search || "").trim();
    const brand = normalizeSearchText(req.query.brand);
    const rows = state.marketQuotes
      .filter((quote) => {
        const matchSearch = matchesKeyword([quote.model, quote.productName, quote.brand], keyword);
        const matchesBrand = !brand || normalizeSearchText(quote.brand) === brand;
        return matchSearch && matchesBrand;
      })
      .sort((a, b) => String(b.updateTime || b.date || "").localeCompare(String(a.updateTime || a.date || "")))
      .map((quote) => ({
        id: quote.id,
        productId: quote.productId,
        productName: quote.productName,
        model: quote.model,
        brand: quote.brand,
        refBuyPrice: quote.refBuyPrice ?? quote.todayBuyPrice ?? quote.yestBuyPrice ?? 0,
        refSellPrice: quote.refSellPrice ?? quote.todaySellPrice ?? quote.maxPrice ?? 0,
        trend: quote.trend,
        changeAmount: quote.changeAmount,
        fluctuation: quote.fluctuation || quote.remarks,
        updateTime: quote.updateTime || quote.date,
        history: quote.history || [],
      }));
    res.json(dependencies.paginated(rows, req));
  }));

  app.use("/api/open/prices", openPricesRouter);
}

export {openInventoryItem};
