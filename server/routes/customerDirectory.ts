import type {Express, Request, RequestHandler} from "express";
import type {AuthenticatedRequest} from "../httpAuth.ts";
import {listCustomerDirectoryPage} from "../customerDirectoryRepository.ts";

type CustomerDirectoryRouteDependencies = {
  requireMenu: (menuId: string) => RequestHandler;
  permissionsForRequest: (req: Request) => {showProfit?: boolean};
};

export function registerCustomerDirectoryRoutes(app: Express, dependencies: CustomerDirectoryRouteDependencies) {
  app.get("/api/customers/page", dependencies.requireMenu("customers"), async (req, res, next) => {
    try {
      const authRequest = req as AuthenticatedRequest<unknown>;
      const result = await listCustomerDirectoryPage({
        tenantId: authRequest.tenantId,
        page: Number(req.query.page || 1),
        pageSize: Number(req.query.pageSize || 20),
        keyword: String(req.query.keyword || ""),
        type: String(req.query.type || "all"),
        channel: String(req.query.channel || "all"),
        level: String(req.query.level || "all"),
        sortKey: String(req.query.sortKey || ""),
        sortDirection: req.query.sortDirection === "asc" ? "asc" : "desc",
      });
      const showProfit = dependencies.permissionsForRequest(req).showProfit === true;
      res.json({
        data: {items: result.data.map((item) => showProfit ? item : {...item, totalProfit: undefined})},
        meta: result.meta,
      });
    } catch (error) {
      next(error);
    }
  });
}
