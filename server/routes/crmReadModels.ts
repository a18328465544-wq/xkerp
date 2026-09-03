import type {Express, Request, RequestHandler} from "express";
import type {AppState, createStoreActions} from "../store.ts";

type CrmReadDependencies = {
  requireMenu: (menuId: string) => RequestHandler;
  getState: () => AppState;
  actions: (req: Request) => ReturnType<typeof createStoreActions>;
  paginated: <T>(items: T[], req: Request) => unknown;
  matchesKeyword: (values: unknown[], keyword: string) => boolean;
};

/** Legacy CRM list projections remain compatible, but their filtering is kept
 * out of the application composition root until the normalized query migration
 * is complete. */
export function registerCrmReadModelRoutes(app: Express, dependencies: CrmReadDependencies) {
  app.get("/api/gpu_erp/crm/customers", dependencies.requireMenu("crm"), (req, res) => {
    const state = dependencies.getState();
    const filtered = state.customers.filter((item) => {
      const search = String(req.query.search || "").trim();
      const matchSearch = dependencies.matchesKeyword([item.id, item.name, item.phone, item.wechat, item.remarks, item.source, item.type], search);
      const matchOwner = !req.query.owner || (item.owner || "未分配") === req.query.owner;
      const matchStatus = !req.query.status || (item.crmStatus || "线索") === req.query.status;
      const matchIntent = !req.query.intent || (item.intent || "中") === req.query.intent;
      return matchSearch && matchOwner && matchStatus && matchIntent;
    });
    res.json(dependencies.paginated(filtered, req));
  });

  app.get("/api/gpu_erp/crm/follow-ups", dependencies.requireMenu("crm"), (req, res) => {
    const filtered = dependencies.getState().crmFollowUps.filter((item) => {
      const matchCustomer = !req.query.customerId || item.customerId === req.query.customerId;
      const matchHandler = !req.query.handler || item.handler === req.query.handler;
      const matchResult = !req.query.result || item.result === req.query.result;
      return matchCustomer && matchHandler && matchResult;
    });
    res.json(dependencies.paginated(filtered, req));
  });

  app.get("/api/gpu_erp/crm/requirements", dependencies.requireMenu("crm"), (req, res) => {
    const filtered = dependencies.getState().crmRequirements.filter((item) => {
      const matchCustomer = !req.query.customerId || item.customerId === req.query.customerId;
      const matchHandler = !req.query.handler || item.handler === req.query.handler;
      const matchIntent = !req.query.intent || item.intent === req.query.intent;
      const matchStage = !req.query.stage || item.stage === req.query.stage;
      return matchCustomer && matchHandler && matchIntent && matchStage;
    });
    res.json(dependencies.paginated(filtered, req));
  });

  app.get("/api/gpu_erp/crm/summary", dependencies.requireMenu("crm"), (req, res) => {
    res.json({data: dependencies.actions(req).getCrmSummary(req.query as Record<string, string>)});
  });
}
