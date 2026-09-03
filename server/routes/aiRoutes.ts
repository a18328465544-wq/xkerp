import type {Express, Request, RequestHandler} from "express";
import type {AuthenticatedRequest} from "../httpAuth.ts";
import {deleteAiInsightAction, listAiInsightActions, saveAiInsightAction} from "../db.ts";
import {getDashboardAiInsights} from "../aiInsights.ts";
import {runCopilotTurn, type CopilotMessage} from "../aiCopilot.ts";
import type {CopilotContext} from "../../src/utils/copilotTools.ts";
import type {AppState} from "../store.ts";
import type {SystemUserAccount} from "../../src/types.ts";

type AiRequest = AuthenticatedRequest<SystemUserAccount>;

type AiRouteDependencies = {
  requireAnyMenu: (menuIds: string[]) => RequestHandler;
  requireBoss: RequestHandler;
  requireMenu: (menuId: string) => RequestHandler;
  asyncRoute: (handler: RequestHandler) => RequestHandler;
  loadState: (tenantId?: string, storeId?: string) => Promise<AppState>;
  replaceState: (state: AppState) => void;
  reloadState: () => Promise<void>;
  getState: () => AppState;
  featureEnabled: (tenantId: string, feature: string) => Promise<boolean>;
  recordUsage: (input: {tenantId: string; metric: string; quantity: number}) => Promise<unknown>;
  estimateUsageUnits: (messages: CopilotMessage[]) => number;
  actorForRequest: (req: AiRequest) => string;
  sendApiError: (req: Request, res: Parameters<RequestHandler>[1], status: number, code: string, message: string, expose?: boolean) => void;
  logRequestError: (req: Request, error: unknown, code: string) => void;
  defaultTenantId: string;
};

const copilotMenuIds = ["dashboard", "ai_insights", "inventory", "customers", "vendors", "finance", "purchase_add", "sales_add", "quotes"];

/** AI endpoints own only orchestration and transport; business writes remain in domain actions. */
export function registerAiRoutes(app: Express, dependencies: AiRouteDependencies) {
  // AI only receives a compact, anonymized business snapshot. Suggestions may
  // route a user to work, but never alter a price, order, inventory or ledger.
  app.get(
    "/api/ai/insights",
    dependencies.requireAnyMenu(["dashboard", "ai_insights"]),
    dependencies.asyncRoute(async (req, res) => {
      const authRequest = req as AiRequest;
      dependencies.replaceState(await dependencies.loadState(authRequest.tenantId, authRequest.storeId));
      res.json({data: await getDashboardAiInsights(dependencies.getState())});
    }),
  );

  app.post(
    "/api/ai/insights/refresh",
    dependencies.requireBoss,
    dependencies.requireAnyMenu(["dashboard", "ai_insights"]),
    dependencies.asyncRoute(async (req, res) => {
      const authRequest = req as AiRequest;
      dependencies.replaceState(await dependencies.loadState(authRequest.tenantId, authRequest.storeId));
      res.json({data: await getDashboardAiInsights(dependencies.getState(), {force: true})});
    }),
  );

  // OneERP Copilot uses a small SSE contract instead of exposing provider-
  // specific stream formats to the browser.
  app.post(
    "/api/ai/copilot",
    dependencies.requireAnyMenu(copilotMenuIds),
    async (req, res) => {
      const authRequest = req as AiRequest;
      const rawMessages = Array.isArray(req.body?.messages) ? req.body.messages : [];
      const messages: CopilotMessage[] = rawMessages.slice(-20).map((message: unknown) => {
        const item = message && typeof message === "object" ? message as Record<string, unknown> : {};
        const role = item.role === "assistant" || item.role === "tool" ? item.role : "user";
        return {
          role,
          content: String(item.content || "").slice(0, 6000),
          toolName: item.toolName ? String(item.toolName).slice(0, 80) : undefined,
        };
      }).filter((message: CopilotMessage) => message.content || message.role !== "user");
      const rawContext = req.body?.context && typeof req.body.context === "object" ? req.body.context as Record<string, unknown> : {};
      const context: CopilotContext = {
        currentTab: String(rawContext.currentTab || "dashboard").slice(0, 80),
        currentTabLabel: String(rawContext.currentTabLabel || "").slice(0, 80) || undefined,
        currentUser: String(rawContext.currentUser || "").slice(0, 80) || undefined,
        selectedInventoryId: String(rawContext.selectedInventoryId || "").slice(0, 120) || undefined,
        selectedCustomerId: String(rawContext.selectedCustomerId || "").slice(0, 120) || undefined,
        selectedDocumentNo: String(rawContext.selectedDocumentNo || "").slice(0, 120) || undefined,
        filters: rawContext.filters && typeof rawContext.filters === "object"
          ? Object.fromEntries(
            Object.entries(rawContext.filters as Record<string, unknown>)
              .slice(0, 20)
              .map(([key, value]) => [
                String(key).slice(0, 40),
                typeof value === "string" || typeof value === "number" || typeof value === "boolean" ? value : undefined,
              ]),
          )
          : undefined,
      };
      const tenantId = authRequest.tenantId || authRequest.authUser?.tenantId || dependencies.defaultTenantId;
      if (!(await dependencies.featureEnabled(tenantId, "ai_assist"))) {
        dependencies.sendApiError(req, res, 403, "FEATURE_NOT_INCLUDED", "当前套餐未包含 AI 助手能力", true);
        return;
      }
      res.status(200);
      res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
      res.setHeader("Cache-Control", "no-cache, no-transform");
      res.setHeader("Connection", "keep-alive");
      res.setHeader("X-Accel-Buffering", "no");
      res.flushHeaders?.();
      const emit = (event: unknown) => {
        if (!res.writableEnded) res.write(`data: ${JSON.stringify(event)}\n\n`);
      };
      try {
        // Reserve a conservative input budget before invoking a provider. The
        // database counter is locked transactionally per tenant.
        await dependencies.recordUsage({tenantId, metric: "ai_tokens", quantity: dependencies.estimateUsageUnits(messages)});
        await dependencies.reloadState();
        await runCopilotTurn({messages, context}, dependencies.getState(), emit);
      } catch (error) {
        dependencies.logRequestError(req, error, "AI_COPILOT_ERROR");
        emit({type: "error", message: "Copilot 请求失败，请稍后重试"});
      } finally {
        if (!res.writableEnded) res.end();
      }
    },
  );

  app.get(
    "/api/ai/insight-actions",
    dependencies.requireMenu("ai_insights"),
    dependencies.asyncRoute(async (req, res) => {
      const authRequest = req as AiRequest;
      res.json({data: await listAiInsightActions(authRequest.tenantId)});
    }),
  );

  app.put(
    "/api/ai/insight-actions/:id",
    dependencies.requireBoss,
    dependencies.requireMenu("ai_insights"),
    dependencies.asyncRoute(async (req, res) => {
      const authRequest = req as AiRequest;
      const insightId = String(req.params.id || "").trim();
      const status = req.body?.status;
      if (!insightId || insightId.length > 180) {
        dependencies.sendApiError(req, res, 400, "VALIDATION_ERROR", "经营建议标识不合法");
        return;
      }
      if (status === "pending") {
        await deleteAiInsightAction(insightId, authRequest.tenantId);
        res.json({data: {insightId, status: "pending"}});
        return;
      }
      if (status !== "done" && status !== "ignored") {
        dependencies.sendApiError(req, res, 400, "VALIDATION_ERROR", "经营建议状态不合法");
        return;
      }
      res.json({data: await saveAiInsightAction({insightId, status, updatedBy: dependencies.actorForRequest(authRequest)}, authRequest.tenantId)});
    }),
  );
}
