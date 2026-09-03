import type {Express, Request, RequestHandler} from "express";
import type {AuthenticatedRequest} from "../httpAuth.ts";
import {listCrmAccounts, listCrmTimeline} from "../crmRepository.ts";
import {listQuickCaptureLeads} from "../crmQuickCaptureRepository.ts";

type CrmNormalizedReadDependencies = {
  requireMenu: (menuId: string) => RequestHandler;
  asyncRoute: (handler: RequestHandler) => RequestHandler;
};

/** PostgreSQL-backed CRM projections with bounded, tenant-scoped pagination. */
export function registerCrmNormalizedReadRoutes(app: Express, dependencies: CrmNormalizedReadDependencies) {
  app.get(
    "/api/gpu_erp/crm/accounts",
    dependencies.requireMenu("crm"),
    dependencies.asyncRoute(async (req, res) => {
        const authRequest = req as AuthenticatedRequest<unknown>;
        const result = await listCrmAccounts({
          tenantId: authRequest.tenantId,
          page: Number(req.query.page || 1),
          pageSize: Number(req.query.pageSize || req.query.per_page || 30),
          keyword: String(req.query.keyword || req.query.search || ""),
          role: String(req.query.role || ""),
          ownerId: String(req.query.ownerId || req.query.owner || ""),
          status: String(req.query.status || ""),
        });
        // Keep the standard API envelope while returning both page rows and
        // metadata through the browser adapter.
        res.json({data: {items: result.data, meta: result.meta}});
    }),
  );

  app.get(
    "/api/gpu_erp/crm/accounts/:id/timeline",
    dependencies.requireMenu("crm"),
    dependencies.asyncRoute(async (req, res) => {
        const authRequest = req as AuthenticatedRequest<unknown>;
        const result = await listCrmTimeline(req.params.id!, {
          tenantId: authRequest.tenantId,
          page: Number(req.query.page || 1),
          pageSize: Number(req.query.pageSize || req.query.per_page || 50),
        });
        res.json({data: {items: result.data, meta: result.meta}});
    }),
  );

  app.get(
    "/api/gpu_erp/crm/quick-capture/leads",
    dependencies.requireMenu("crm"),
    dependencies.asyncRoute(async (req, res) => {
        const result = await listQuickCaptureLeads({
          page: Number(req.query.page || 1),
          pageSize: Number(req.query.pageSize || req.query.per_page || 20),
          keyword: String(req.query.keyword || req.query.search || ""),
          stage: String(req.query.stage || ""),
        });
        res.json({data: result});
    }),
  );
}
