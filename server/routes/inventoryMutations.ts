import type {Express, Request, RequestHandler} from "express";
import type {AuthenticatedRequest} from "../httpAuth.ts";
import {queryInventoryPage, saveStateRecords} from "../db.ts";
import {runStateCommand} from "../stateCommand.ts";
import {compactStateMerge, stateMergeRecords, statePatchResponse, type StateMergePatch} from "../statePatch.ts";
import type {AppState, createStoreActions} from "../store.ts";
import type {CardInventory, InventoryScanResult, SystemUserAccount} from "../../src/types.ts";

type InventoryRequest = AuthenticatedRequest<SystemUserAccount>;

type InventoryMutationDependencies = {
  requireMenu: (menuId: string) => RequestHandler;
  asyncRoute: (handler: RequestHandler) => RequestHandler;
  getState: () => AppState;
  actions: (req: Request) => ReturnType<typeof createStoreActions>;
  sanitizeInventoryRows: (inventory: CardInventory[], user?: SystemUserAccount) => CardInventory[];
};

function okMerge(data: unknown, stateMerge: StateMergePatch) {
  return statePatchResponse(data, stateMerge);
}

function recordsByIds<T extends {id: string}>(items: T[], ids: Iterable<string | undefined>) {
  const idSet = new Set(Array.from(ids).filter(Boolean));
  return idSet.size ? items.filter((item) => idSet.has(item.id)) : [];
}

function relatedProducts(state: AppState, inventory: CardInventory[]) {
  return recordsByIds(state.products, inventory.map((item) => item.productId));
}

export function inventoryRecordsMerge(state: AppState, inventory: CardInventory[]): StateMergePatch {
  return compactStateMerge({
    inventory,
    products: relatedProducts(state, inventory),
    salesInvoices: state.salesInvoices.filter((invoice) =>
      invoice.items.some((item) => inventory.some((card) => card.id === item.inventoryId))
    ),
    purchaseCommissions: state.purchaseCommissions.filter((item) => inventory.some((card) => card.id === item.inventoryId)),
    logs: state.logs.slice(0, 1),
  });
}

export function scanFlowMerge(
  state: AppState,
  result: {results: InventoryScanResult[]},
  salesInvoiceId?: string,
): StateMergePatch {
  const inventoryIds = new Set(result.results.map((item) => item.inventoryId).filter(Boolean));
  const inventory = state.inventory.filter((item) => inventoryIds.has(item.id));
  const relatedSalesInvoiceIds = new Set([
    salesInvoiceId,
    ...inventory.map((item) => item.salesInvoiceId),
  ].filter(Boolean));
  return compactStateMerge({
    inventory,
    products: relatedProducts(state, inventory),
    salesInvoices: state.salesInvoices.filter((item) => relatedSalesInvoiceIds.has(item.id) || relatedSalesInvoiceIds.has(item.invoiceNo)),
    purchaseCommissions: state.purchaseCommissions.filter((item) => inventoryIds.has(item.inventoryId)),
    logs: state.logs.slice(0, 1),
  });
}

/** Inventory writes and the paginated read stay together so scan flows share one patch contract. */
export function registerInventoryMutationRoutes(app: Express, dependencies: InventoryMutationDependencies) {
  app.patch(
    "/api/inventory/batch",
    dependencies.requireMenu("inventory"),
    dependencies.asyncRoute(async (req, res) => {
      const {data: updated, stateMerge} = await runStateCommand(
        () => dependencies.actions(req).batchUpdateInventory(req.body.ids || [], req.body.updates || {}),
        (inventory) => inventoryRecordsMerge(dependencies.getState(), inventory),
      );
      res.json(okMerge(updated, stateMerge));
    }),
  );

  app.get(
    "/api/inventory/summary",
    dependencies.requireMenu("inventory"),
    (req, res) => {
      res.json({data: dependencies.actions(req).getInventorySummary(req.query as Record<string, string>)});
    },
  );

  app.get(
    "/api/inventory/items",
    dependencies.requireMenu("inventory"),
    dependencies.asyncRoute(async (req, res) => {
      const authRequest = req as InventoryRequest;
      const page = await queryInventoryPage<CardInventory>({
        tenantId: authRequest.tenantId,
        storeId: authRequest.storeId,
        page: Number(req.query.page || 1),
        pageSize: Number(req.query.pageSize || 50),
        keyword: String(req.query.keyword || req.query.search || ""),
        status: String(req.query.status || ""),
        category: String(req.query.category || ""),
        brand: String(req.query.brand || ""),
        risk: req.query.risk === "mined" || req.query.risk === "upturned" || req.query.risk === "high" ? req.query.risk : undefined,
        minStorageDays: Number(req.query.minStorageDays || 0),
        maxStorageDays: req.query.maxStorageDays === undefined ? undefined : Number(req.query.maxStorageDays),
        minProfitMargin: Number(req.query.minProfitMargin || 0),
        activeOnly: String(req.query.activeOnly || "") === "true",
        warehouseLocation: String(req.query.warehouseLocation || ""),
        includeSold: String(req.query.includeSold || "") === "true",
        sortKey: String(req.query.sortKey || ""),
        sortDirection: req.query.sortDirection === "asc" ? "asc" : "desc",
      });
      res.json({data: dependencies.sanitizeInventoryRows(page.data, authRequest.authUser), meta: page.meta});
    }),
  );

  app.post(
    "/api/inventory/import",
    dependencies.requireMenu("inventory"),
    dependencies.asyncRoute(async (req, res) => {
      const {data: created, stateMerge} = await runStateCommand(
        () => dependencies.actions(req).importInventoryRows(req.body.rows || [], req.body.handler),
        (inventory) => inventoryRecordsMerge(dependencies.getState(), inventory),
      );
      res.status(201).json(okMerge(created, stateMerge));
    }),
  );

  app.post(
    "/api/inventory/scan-flow",
    dependencies.requireMenu("inventory"),
    dependencies.asyncRoute(async (req, res) => {
      const result = dependencies.actions(req).scanInventoryFlow(req.body);
      const stateMerge = scanFlowMerge(dependencies.getState(), result, req.body?.salesInvoiceId);
      await saveStateRecords(stateMergeRecords(stateMerge));
      res.json(okMerge(result, stateMerge));
    }),
  );
}
