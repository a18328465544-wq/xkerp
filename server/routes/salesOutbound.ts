import type {Express, RequestHandler} from "express";
import type {AuthenticatedRequest} from "../httpAuth.ts";
import {listSalesOutboundPage} from "../salesOutboundRepository.ts";

type SalesOutboundRouteDependencies = {
  requireMenu: (menuId: string) => RequestHandler;
};

export function registerSalesOutboundRoutes(app: Express, dependencies: SalesOutboundRouteDependencies) {
  app.get("/api/sales-invoices/outbound", dependencies.requireMenu("sales_outbound"), async (req, res, next) => {
    try {
      const authRequest = req as AuthenticatedRequest<unknown>;
      const result = await listSalesOutboundPage({
        tenantId: authRequest.tenantId,
        storeId: authRequest.storeId,
        page: Number(req.query.page || 1),
        pageSize: Number(req.query.pageSize || 20),
        keyword: String(req.query.keyword || ""),
      });
      res.json(result);
    } catch (error) {
      next(error);
    }
  });
}
