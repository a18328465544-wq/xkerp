import type { Express, Request, RequestHandler, Response } from "express";
import path from "node:path";
import {
  CommercialValidationError,
  createCommercialTenant,
  createCommercialStore,
  createCommercialExport,
  processCommercialExport,
  commercialFeatureEnabled,
  getCommercialContext,
  getCommercialDiagnostics,
  getCommercialExport,
  getCommercialSubscription,
  listCommercialMembers,
  listCommercialStores,
  recordCommercialUsage,
  assertCommercialTenantActive,
  updateCommercialMembership,
  updateCommercialStore,
  updateCommercialSubscription,
  upsertCommercialMembership,
  commercialExportTenantDirectory,
} from "../commercialRepository.ts";
import { DEFAULT_STORE_ID, DEFAULT_TENANT_ID } from "../commercialConstants.ts";

type CommercialRequest = Request & {
  requestId?: string;
  authToken?: string;
  authUser?: {
    id: string;
    role?: string;
    tenantId?: string;
    storeId?: string;
    username?: string;
    displayName?: string;
  };
};

type Dependencies = {
  requireBoss: RequestHandler;
  requireAnyMenu: (menuIds: string[]) => RequestHandler;
  asyncRoute: (handler: RequestHandler) => RequestHandler;
  createSession?: (userId: string, scope: { tenantId: string; storeId: string }) => Promise<string>;
  revokeSession?: (token: string | null | undefined) => Promise<void>;
  setSessionCookie?: (res: Response, token: string) => void;
  createCsrfToken?: (token: string) => string;
};

function actor(req: CommercialRequest) {
  return req.authUser?.displayName || req.authUser?.username || req.authUser?.id || "system";
}

function tenantId(req: CommercialRequest) {
  return req.authUser?.tenantId?.trim() || DEFAULT_TENANT_ID;
}

function storeId(req: CommercialRequest) {
  return req.authUser?.storeId?.trim() || DEFAULT_STORE_ID;
}

function sendCommercialError(req: Request, res: Response, error: unknown) {
  if (error instanceof CommercialValidationError) {
    res.status(error.status).json({ error: { code: error.code, message: error.message, requestId: (req as CommercialRequest).requestId } });
    return true;
  }
  return false;
}

function bodyRecord(req: Request) {
  return req.body && typeof req.body === "object" && !Array.isArray(req.body) ? req.body as Record<string, unknown> : {};
}

/**
 * Commercial control-plane endpoints are deliberately separate from the
 * legacy business routes. They expose tenant/store/seat/quota state and can
 * be switched off at the edge without changing purchase, sales or inventory
 * contracts.
 */
export function registerCommercialRoutes(app: Express, dependencies: Dependencies) {
  app.post("/api/commercial/context/switch", dependencies.asyncRoute(async (req, res) => {
    const request = req as CommercialRequest;
    const body = bodyRecord(req);
    const targetTenantId = String(body.tenantId || "").trim();
    const targetStoreId = String(body.storeId || "").trim() || DEFAULT_STORE_ID;
    const userId = request.authUser?.id;
    if (!userId || !targetTenantId) {
      res.status(400).json({ error: { code: "INVALID_TENANT_CONTEXT", message: "企业和门店不能为空", requestId: request.requestId } });
      return;
    }
    const context = await getCommercialContext(userId, targetTenantId, targetStoreId);
    if (!context) {
      res.status(403).json({ error: { code: "TENANT_MEMBERSHIP_REQUIRED", message: "当前账号没有目标企业成员关系", requestId: request.requestId } });
      return;
    }
    await assertCommercialTenantActive(targetTenantId);
    if (!dependencies.createSession || !dependencies.setSessionCookie) {
      res.status(503).json({ error: { code: "TENANT_SWITCH_UNAVAILABLE", message: "当前部署未启用企业切换", requestId: request.requestId } });
      return;
    }
    const token = await dependencies.createSession(userId, { tenantId: targetTenantId, storeId: context.store.id });
    // Rotate first, then revoke the old session. If issuing the new token fails,
    // the current login remains usable and the client can retry safely.
    await dependencies.revokeSession?.(request.authToken);
    dependencies.setSessionCookie(res, token);
    res.json({ data: { tenant: context.tenant, store: context.store, membership: context.membership, csrfToken: dependencies.createCsrfToken?.(token) } });
  }));

  app.post("/api/commercial/tenants", dependencies.requireBoss, dependencies.asyncRoute(async (req, res) => {
    try {
      const request = req as CommercialRequest;
      const body = bodyRecord(req);
      const data = await createCommercialTenant({
        slug: String(body.slug || ""),
        name: String(body.name || ""),
        planCode: body.planCode as "pilot" | "standard" | "pro" | "enterprise" | undefined,
        ownerUserId: body.ownerUserId === undefined ? request.authUser?.id : String(body.ownerUserId),
        ownerRole: body.ownerRole === undefined ? "老板" : String(body.ownerRole),
      });
      res.status(201).json({ data });
    } catch (error) {
      if (!sendCommercialError(req, res, error)) throw error;
    }
  }));

  app.get("/api/commercial/context", dependencies.requireAnyMenu(["dashboard", "inventory", "finance", "permissions"]), dependencies.asyncRoute(async (req, res) => {
    const request = req as CommercialRequest;
    const userId = request.authUser?.id;
    if (!userId) {
      res.status(401).json({ error: { code: "UNAUTHORIZED", message: "请先登录系统", requestId: request.requestId } });
      return;
    }
    const context = await getCommercialContext(userId, tenantId(request), storeId(request));
    if (!context) {
      res.status(403).json({ error: { code: "TENANT_MEMBERSHIP_REQUIRED", message: "当前账号没有有效企业成员关系", requestId: request.requestId } });
      return;
    }
    res.json({ data: context });
  }));

  app.get("/api/commercial/stores", dependencies.requireBoss, dependencies.asyncRoute(async (req, res) => {
    res.json({ data: await listCommercialStores(tenantId(req as CommercialRequest)) });
  }));

  app.post("/api/commercial/stores", dependencies.requireBoss, dependencies.asyncRoute(async (req, res) => {
    try {
      const body = bodyRecord(req);
      const data = await createCommercialStore({
        tenantId: tenantId(req as CommercialRequest),
        code: String(body.code || ""),
        name: String(body.name || ""),
        timezone: body.timezone === undefined ? undefined : String(body.timezone),
        currency: body.currency === undefined ? undefined : String(body.currency),
      });
      res.status(201).json({ data });
    } catch (error) {
      if (!sendCommercialError(req, res, error)) throw error;
    }
  }));

  app.patch("/api/commercial/stores/:id", dependencies.requireBoss, dependencies.asyncRoute(async (req, res) => {
    try {
      const body = bodyRecord(req);
      const data = await updateCommercialStore(tenantId(req as CommercialRequest), String(req.params.id || ""), {
        name: body.name === undefined ? undefined : String(body.name),
        timezone: body.timezone === undefined ? undefined : String(body.timezone),
        currency: body.currency === undefined ? undefined : String(body.currency),
        status: body.status as "active" | "archived" | undefined,
      });
      res.json({ data });
    } catch (error) {
      if (!sendCommercialError(req, res, error)) throw error;
    }
  }));

  app.get("/api/commercial/members", dependencies.requireBoss, dependencies.asyncRoute(async (req, res) => {
    res.json({ data: await listCommercialMembers(tenantId(req as CommercialRequest)) });
  }));

  app.post("/api/commercial/members", dependencies.requireBoss, dependencies.asyncRoute(async (req, res) => {
    try {
      const body = bodyRecord(req);
      const result = await upsertCommercialMembership({
        tenantId: tenantId(req as CommercialRequest),
        userId: String(body.userId || ""),
        storeId: String(body.storeId || storeId(req as CommercialRequest)),
        role: String(body.role || "店员"),
        status: body.status as "active" | "invited" | "deactivated" | undefined,
        permissions: body.permissions && typeof body.permissions === "object" ? body.permissions as Record<string, unknown> : undefined,
        invitedBy: actor(req as CommercialRequest),
      });
      res.status(201).json({ data: result });
    } catch (error) {
      if (!sendCommercialError(req, res, error)) throw error;
    }
  }));

  app.patch("/api/commercial/members/:userId", dependencies.requireBoss, dependencies.asyncRoute(async (req, res) => {
    try {
      const body = bodyRecord(req);
      const result = await updateCommercialMembership(
        tenantId(req as CommercialRequest),
        String(req.params.userId || ""),
        {
          status: body.status as "active" | "invited" | "deactivated" | undefined,
          role: body.role === undefined ? undefined : String(body.role),
          permissions: body.permissions && typeof body.permissions === "object" ? body.permissions as Record<string, unknown> : undefined,
        },
        String(body.storeId || storeId(req as CommercialRequest)),
      );
      res.json({ data: result });
    } catch (error) {
      if (!sendCommercialError(req, res, error)) throw error;
    }
  }));

  app.get("/api/commercial/subscription", dependencies.requireBoss, dependencies.asyncRoute(async (req, res) => {
    const subscription = await getCommercialSubscription(tenantId(req as CommercialRequest));
    if (!subscription) {
      res.status(404).json({ error: { code: "SUBSCRIPTION_NOT_FOUND", message: "企业订阅不存在", requestId: (req as CommercialRequest).requestId } });
      return;
    }
    res.json({ data: subscription });
  }));

  app.patch("/api/commercial/subscription", dependencies.requireBoss, dependencies.asyncRoute(async (req, res) => {
    try {
      const body = bodyRecord(req);
      const data = await updateCommercialSubscription(tenantId(req as CommercialRequest), {
        planCode: body.planCode as "pilot" | "standard" | "pro" | "enterprise" | undefined,
        status: body.status as "trialing" | "active" | "past_due" | "canceled" | undefined,
        seatLimit: body.seatLimit === undefined ? undefined : Number(body.seatLimit),
        mediaBytesLimit: body.mediaBytesLimit === undefined ? undefined : Number(body.mediaBytesLimit),
        aiTokensLimit: body.aiTokensLimit === undefined ? undefined : Number(body.aiTokensLimit),
        currentPeriodStart: body.currentPeriodStart === undefined ? undefined : String(body.currentPeriodStart),
        currentPeriodEnd: body.currentPeriodEnd === undefined ? undefined : String(body.currentPeriodEnd),
      });
      res.json({ data });
    } catch (error) {
      if (!sendCommercialError(req, res, error)) throw error;
    }
  }));

  app.get("/api/commercial/usage", dependencies.requireBoss, dependencies.asyncRoute(async (req, res) => {
    const context = await getCommercialContext((req as CommercialRequest).authUser?.id || "", tenantId(req as CommercialRequest), storeId(req as CommercialRequest));
    if (!context) {
      res.status(403).json({ error: { code: "TENANT_MEMBERSHIP_REQUIRED", message: "当前账号没有有效企业成员关系", requestId: (req as CommercialRequest).requestId } });
      return;
    }
    res.json({ data: context.usage, meta: { subscription: context.subscription } });
  }));

  app.post("/api/commercial/usage", dependencies.requireBoss, dependencies.asyncRoute(async (req, res) => {
    try {
      const body = bodyRecord(req);
      const data = await recordCommercialUsage({
        tenantId: tenantId(req as CommercialRequest),
        metric: String(body.metric || ""),
        quantity: Number(body.quantity),
        periodStart: body.periodStart === undefined ? undefined : String(body.periodStart),
      });
      res.status(201).json({ data });
    } catch (error) {
      if (!sendCommercialError(req, res, error)) throw error;
    }
  }));

  app.post("/api/commercial/exports", dependencies.requireBoss, dependencies.asyncRoute(async (req, res) => {
    try {
      const requestedTenantId = tenantId(req as CommercialRequest);
      if (!(await commercialFeatureEnabled(requestedTenantId, "exports"))) {
        res.status(403).json({ error: { code: "FEATURE_NOT_INCLUDED", message: "当前套餐未包含数据导出能力", requestId: (req as CommercialRequest).requestId } });
        return;
      }
      const body = bodyRecord(req);
      const data = await createCommercialExport({
        tenantId: requestedTenantId,
        requestedBy: actor(req as CommercialRequest),
        format: body.format === "csv" ? "csv" : "json",
      });
      const completed = await processCommercialExport(data.id, requestedTenantId);
      res.status(201).json({ data: completed || data });
    } catch (error) {
      if (!sendCommercialError(req, res, error)) throw error;
    }
  }));

  app.get("/api/commercial/exports/:id", dependencies.requireBoss, dependencies.asyncRoute(async (req, res) => {
    const data = await getCommercialExport(String(req.params.id || ""), tenantId(req as CommercialRequest));
    if (!data) {
      res.status(404).json({ error: { code: "EXPORT_NOT_FOUND", message: "导出任务不存在", requestId: (req as CommercialRequest).requestId } });
      return;
    }
    res.json({ data });
  }));

  app.get("/api/commercial/exports/:id/download", dependencies.requireBoss, dependencies.asyncRoute(async (req, res) => {
    const data = await getCommercialExport(String(req.params.id || ""), tenantId(req as CommercialRequest));
    if (!data) {
      res.status(404).json({ error: { code: "EXPORT_NOT_FOUND", message: "导出任务不存在", requestId: (req as CommercialRequest).requestId } });
      return;
    }
    if (data.status !== "completed" || !data.filePath) {
      res.status(409).json({ error: { code: "EXPORT_NOT_READY", message: "导出文件尚未生成", requestId: (req as CommercialRequest).requestId } });
      return;
    }
    const relativePath = data.filePath.replace(/^[/\\]+/, "");
    const exportRoot = commercialExportTenantDirectory(tenantId(req as CommercialRequest));
    const absolutePath = path.resolve(process.cwd(), relativePath);
    const relativeToRoot = path.relative(exportRoot, absolutePath);
    const isInsideTenantRoot = relativeToRoot !== "" && !relativeToRoot.startsWith("..") && !path.isAbsolute(relativeToRoot);
    if (!relativePath.startsWith("data/exports/") || !isInsideTenantRoot) {
      res.status(500).json({ error: { code: "EXPORT_PATH_INVALID", message: "导出文件路径无效", requestId: (req as CommercialRequest).requestId } });
      return;
    }
    res.download(absolutePath, `${data.id}.${data.format}`, (error) => {
      if (error && !res.headersSent) res.status(404).json({ error: { code: "EXPORT_FILE_MISSING", message: "导出文件不存在", requestId: (req as CommercialRequest).requestId } });
    });
  }));

  app.get("/api/commercial/diagnostics", dependencies.requireBoss, dependencies.asyncRoute(async (req, res) => {
    res.json({ data: await getCommercialDiagnostics(tenantId(req as CommercialRequest)) });
  }));
}
