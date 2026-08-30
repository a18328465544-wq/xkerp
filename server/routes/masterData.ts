import type {Express, Request, RequestHandler} from "express";
import {listProductPage, listVendorPage} from "../masterDataRepository.ts";

type AuthenticatedRequest = Request & {tenantId?: string; storeId?: string};
type MasterDataDependencies = {
  requireMenu: (menuId: string) => RequestHandler;
  requireAnyMenu: (menuIds: string[]) => RequestHandler;
  permissionsForRequest: (req: Request) => {showCost?: boolean; showProfit?: boolean};
};

function queryNumber(value: unknown, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function registerMasterDataRoutes(app: Express, dependencies: MasterDataDependencies) {
  app.get("/api/vendors", dependencies.requireMenu("vendors"), async (req: AuthenticatedRequest, res, next) => {
    try {
      const permissions = dependencies.permissionsForRequest(req);
      res.json(await listVendorPage({tenantId: req.tenantId, storeId: req.storeId, page: queryNumber(req.query.page, 1), pageSize: queryNumber(req.query.pageSize, 20), keyword: String(req.query.keyword || ""), type: String(req.query.type || "all"), level: String(req.query.level || "all"), balance: String(req.query.balance || "all"), sortKey: String(req.query.sortKey || ""), sortDirection: String(req.query.sortDirection || "desc")}, {showProfit: permissions.showProfit === true}));
    } catch (error) { next(error); }
  });

  app.get("/api/products", dependencies.requireAnyMenu(["products", "purchase_add", "sales_add", "assembly", "quotes", "finance_reports"]), async (req: AuthenticatedRequest, res, next) => {
    try {
      const permissions = dependencies.permissionsForRequest(req);
      res.json(await listProductPage({tenantId: req.tenantId, storeId: req.storeId, page: queryNumber(req.query.page, 1), pageSize: queryNumber(req.query.pageSize, 20), keyword: String(req.query.keyword || ""), category: String(req.query.category || "all"), brand: String(req.query.brand || "all"), sortKey: String(req.query.sortKey || ""), sortDirection: String(req.query.sortDirection || "desc")}, {showCost: permissions.showCost === true, showProfit: permissions.showProfit === true}));
    } catch (error) { next(error); }
  });
}
