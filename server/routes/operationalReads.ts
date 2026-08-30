import type {Express, Request, RequestHandler} from "express";
import {getAftersalesWorkspace, getAssemblyReference, getInspectionWorkspace, getReturnReference, listAssemblyOperations, listReturnOrders} from "../operationalReadRepository.ts";

type AuthenticatedRequest = Request & {tenantId?: string; storeId?: string};
type Dependencies = {
  requireMenu: (menuId: string) => RequestHandler;
  requireAnyMenu: (menuIds: string[]) => RequestHandler;
  permissionsForRequest: (req: Request) => {showCost?: boolean; showProfit?: boolean; allowedMenus: string[]};
};

function hasMenu(permissions: {allowedMenus: string[]}, menu: string) {
  return permissions.allowedMenus.includes("all") || permissions.allowedMenus.includes(menu);
}

function numberQuery(value: unknown, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function registerOperationalReadRoutes(app: Express, dependencies: Dependencies) {
  app.get("/api/inspections/workspace", dependencies.requireMenu("inspections"), async (req: AuthenticatedRequest, res, next) => {
    try {
      const permissions = dependencies.permissionsForRequest(req);
      res.json(await getInspectionWorkspace({tenantId: req.tenantId, storeId: req.storeId}, {showCost: permissions.showCost === true, showProfit: permissions.showProfit === true}));
    } catch (error) {next(error);}
  });

  app.get("/api/assembly-operations", dependencies.requireMenu("assembly"), async (req: AuthenticatedRequest, res, next) => {
    try {
      const permissions = dependencies.permissionsForRequest(req);
      res.json(await listAssemblyOperations({tenantId: req.tenantId, storeId: req.storeId}, {page: numberQuery(req.query.page, 1), pageSize: numberQuery(req.query.pageSize, 20), keyword: String(req.query.search || ""), type: String(req.query.type || ""), handler: String(req.query.handler || "")}, {showCost: permissions.showCost === true, showProfit: permissions.showProfit === true}));
    } catch (error) {next(error);}
  });

  app.get("/api/assembly-operations/reference", dependencies.requireMenu("assembly"), async (req: AuthenticatedRequest, res, next) => {
    try {
      const permissions = dependencies.permissionsForRequest(req);
      res.json(await getAssemblyReference({tenantId: req.tenantId, storeId: req.storeId}, {showCost: permissions.showCost === true, showProfit: permissions.showProfit === true}, String(req.query.keyword || "")));
    } catch (error) {next(error);}
  });

  app.get("/api/aftersales/workspace", dependencies.requireMenu("aftersales"), async (req: AuthenticatedRequest, res, next) => {
    try {res.json(await getAftersalesWorkspace({tenantId: req.tenantId, storeId: req.storeId}));} catch (error) {next(error);}
  });

  const returnMenus = ["return_sales", "return_purchase", "return_orders"];
  app.get("/api/returns", dependencies.requireAnyMenu(returnMenus), async (req: AuthenticatedRequest, res, next) => {
    try {
      const permissions = dependencies.permissionsForRequest(req);
      const allowedTypes = hasMenu(permissions, "return_orders") ? ["销售退货", "进货退货"] : [hasMenu(permissions, "return_sales") ? "销售退货" : "", hasMenu(permissions, "return_purchase") ? "进货退货" : ""].filter(Boolean);
      res.json(await listReturnOrders({tenantId: req.tenantId, storeId: req.storeId}, {page: numberQuery(req.query.page, 1), pageSize: numberQuery(req.query.pageSize, 20), keyword: String(req.query.keyword || ""), type: String(req.query.type || ""), status: String(req.query.status || ""), allowedTypes}));
    } catch (error) {next(error);}
  });

  app.get("/api/returns/reference", dependencies.requireAnyMenu(returnMenus), async (req: AuthenticatedRequest, res, next) => {
    try {
      const permissions = dependencies.permissionsForRequest(req);
      const type = req.query.type === "sales" || req.query.type === "purchase" ? req.query.type : undefined;
      res.json(await getReturnReference(
        {tenantId: req.tenantId, storeId: req.storeId},
        {showCost: permissions.showCost === true, showProfit: permissions.showProfit === true},
        {type, keyword: String(req.query.keyword || ""), selectedDocNo: String(req.query.selectedDocNo || "")},
      ));
    } catch (error) {next(error);}
  });
}
