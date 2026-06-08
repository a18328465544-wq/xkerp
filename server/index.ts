import express from "express";
import { createManualBackup, dataFilePath, listBackups, loadState, saveState } from "./db.ts";
import { createStoreActions, type AppState } from "./store.ts";
import { buildExport } from "./export.ts";
import { createSessionManager, sanitizeAppStateForClient } from "./security.ts";
import type { SystemUserAccount } from "../src/types.ts";

const PORT = Number(process.env.API_PORT || process.env.PORT || 3001);

const app = express();
app.use(express.json({ limit: "2mb" }));

let state: AppState = await loadState();
const sessions = createSessionManager();

type AuthRequest = express.Request & {
  authToken?: string;
  authUser?: SystemUserAccount;
};

function actions() {
  return createStoreActions(state);
}

async function persist<T>(result: T) {
  await saveState(state);
  return result;
}

function ok(data: unknown = null) {
  return { data, state: publicState() };
}

function publicState() {
  return sanitizeAppStateForClient(state);
}

function paginated<T>(items: T[], req: express.Request) {
  const page = Math.max(1, Number(req.query.page || 1));
  const pageSize = Math.max(1, Math.min(200, Number(req.query.pageSize || req.query.per_page || 20)));
  const start = (page - 1) * pageSize;
  return {
    data: items.slice(start, start + pageSize),
    meta: {
      page,
      pageSize,
      total: items.length,
    },
  };
}

function asyncRoute(handler: express.RequestHandler): express.RequestHandler {
  return (req, res, next) => {
    Promise.resolve(handler(req, res, next)).catch(next);
  };
}

function getBearerToken(req: express.Request) {
  const header = req.headers.authorization || "";
  const [type, token] = header.split(" ");
  return type?.toLowerCase() === "bearer" ? token : null;
}

function applyAuthenticatedUser(userId: string) {
  const user = state.systemUsers.find((item) => item.id === userId);
  if (!user?.enabled) return null;
  state.currentUserId = user.id;
  state.currentRole = user.role;
  return user;
}

function requireAuth(req: AuthRequest, res: express.Response, next: express.NextFunction) {
  const token = getBearerToken(req);
  const session = sessions.resolve(token);
  if (!session) {
    res.status(401).json({ error: { code: "UNAUTHORIZED", message: "请先登录系统" } });
    return;
  }
  const user = applyAuthenticatedUser(session.userId);
  if (!user) {
    sessions.revoke(token);
    res.status(401).json({ error: { code: "UNAUTHORIZED", message: "账号已停用或不存在" } });
    return;
  }
  req.authToken = token || undefined;
  req.authUser = user;
  next();
}

function requireBoss(req: AuthRequest, res: express.Response, next: express.NextFunction) {
  if (req.authUser?.role !== "老板") {
    res.status(403).json({ error: { code: "FORBIDDEN", message: "仅老板账号可执行该操作" } });
    return;
  }
  next();
}

function requireDeletePermission(_req: AuthRequest, res: express.Response, next: express.NextFunction) {
  if (!actions().getPermissions().canDelete) {
    res.status(403).json({ error: { code: "FORBIDDEN", message: "当前账号没有删除权限" } });
    return;
  }
  next();
}

function requireHistoryEditPermission(req: AuthRequest, res: express.Response, next: express.NextFunction) {
  const permissions = actions().getPermissions();
  if (req.authUser?.role !== "老板" && !permissions.canEditHistory) {
    res.status(403).json({ error: { code: "FORBIDDEN", message: "当前账号没有日志管理权限" } });
    return;
  }
  next();
}

app.get("/api/health", (_req, res) => {
  res.json({ data: { ok: true, dataFile: dataFilePath } });
});

app.post("/api/auth/login", asyncRoute(async (req, res) => {
  try {
    const user = actions().login(req.body);
    const token = sessions.create(user.id);
    await persist(user);
    res.json(ok({ user, token }));
  } catch (error) {
    const message = error instanceof Error ? error.message : "登录失败";
    res.status(401).json({ error: { code: "LOGIN_FAILED", message } });
  }
}));

app.use(requireAuth);

app.get("/api/state", (_req, res) => {
  res.json({ data: publicState() });
});

app.get("/api/auth/me", (req: AuthRequest, res) => {
  res.json(ok(req.authUser ? actions().getCurrentUser() : null));
});

app.post("/api/auth/logout", asyncRoute(async (req: AuthRequest, res) => {
  sessions.revoke(req.authToken);
  res.json(ok(await persist(actions().logout())));
}));

app.get("/api/users", requireBoss, (_req, res) => {
  res.json(ok(actions().listUsers()));
});

app.post("/api/users", requireBoss, asyncRoute(async (req, res) => {
  res.status(201).json(ok(await persist(actions().createUser(req.body))));
}));

app.put("/api/users/:id", requireBoss, asyncRoute(async (req, res) => {
  res.json(ok(await persist(actions().updateUser(req.params.id, req.body))));
}));

app.get("/api/gpu_erp/finance/settlement-accounts", (req, res) => {
  res.json(paginated(state.settlementAccounts, req));
});

app.post("/api/gpu_erp/finance/settlement-account/create", asyncRoute(async (req, res) => {
  res.status(201).json(ok(await persist(actions().createSettlementAccount(req.body))));
}));

app.get("/api/gpu_erp/finance/settlement-ledger", (req, res) => {
  const filtered = state.settlementLedger.filter((item) => {
    const matchAccount = !req.query.accountId || item.accountId === req.query.accountId;
    const matchHandler = !req.query.handler || item.handler === req.query.handler;
    const matchBusinessType = !req.query.businessType || item.businessType === req.query.businessType;
    const matchDirection = !req.query.direction || item.direction === req.query.direction;
    const matchDoc = !req.query.relatedDocNo || item.relatedDocNo === req.query.relatedDocNo;
    const matchCustomer = !req.query.customerName || item.customerName === req.query.customerName;
    const matchSupplier = !req.query.supplierName || item.supplierName === req.query.supplierName;
    return matchAccount && matchHandler && matchBusinessType && matchDirection && matchDoc && matchCustomer && matchSupplier;
  });
  res.json(paginated(filtered, req));
});

app.post("/api/gpu_erp/finance/payment-in/create", asyncRoute(async (req, res) => {
  res.status(201).json(ok(await persist(actions().createPaymentIn(req.body))));
}));

app.put("/api/gpu_erp/finance/payment-in/:id", asyncRoute(async (req, res) => {
  res.json(ok(await persist(actions().updatePaymentIn(req.params.id, req.body))));
}));

app.delete("/api/gpu_erp/finance/payment-in/:id", requireDeletePermission, asyncRoute(async (req, res) => {
  res.json(ok(await persist(actions().deletePaymentIn(req.params.id))));
}));

app.post("/api/gpu_erp/finance/payment-out/create", asyncRoute(async (req, res) => {
  res.status(201).json(ok(await persist(actions().createPaymentOut(req.body))));
}));

app.put("/api/gpu_erp/finance/payment-out/:id", asyncRoute(async (req, res) => {
  res.json(ok(await persist(actions().updatePaymentOut(req.params.id, req.body))));
}));

app.delete("/api/gpu_erp/finance/payment-out/:id", requireDeletePermission, asyncRoute(async (req, res) => {
  res.json(ok(await persist(actions().deletePaymentOut(req.params.id))));
}));

app.post("/api/gpu_erp/finance/account-transfer/create", asyncRoute(async (req, res) => {
  res.status(201).json(ok(await persist(actions().createAccountTransfer(req.body))));
}));

app.put("/api/gpu_erp/finance/account-transfer/:id", asyncRoute(async (req, res) => {
  res.json(ok(await persist(actions().updateAccountTransfer(req.params.id, req.body))));
}));

app.delete("/api/gpu_erp/finance/account-transfer/:id", requireDeletePermission, asyncRoute(async (req, res) => {
  res.json(ok(await persist(actions().deleteAccountTransfer(req.params.id))));
}));

app.get("/api/gpu_erp/finance/account-summary", (req, res) => {
  res.json({ data: actions().getAccountSummary(req.query as Record<string, string>) });
});

app.get("/api/gpu_erp/reports/employee-payment-summary", (req, res) => {
  const summary = actions().getAccountSummary(req.query as Record<string, string>).employeeSummary;
  res.json(paginated(summary, req));
});

app.get("/api/gpu_erp/crm/customers", (req, res) => {
  const filtered = state.customers.filter((item) => {
    const search = String(req.query.search || "").trim();
    const matchSearch = !search || item.name.includes(search) || item.phone.includes(search) || (item.wechat || "").includes(search);
    const matchOwner = !req.query.owner || (item.owner || "未分配") === req.query.owner;
    const matchStatus = !req.query.status || (item.crmStatus || "线索") === req.query.status;
    const matchIntent = !req.query.intent || (item.intent || "中") === req.query.intent;
    return matchSearch && matchOwner && matchStatus && matchIntent;
  });
  res.json(paginated(filtered, req));
});

app.post("/api/gpu_erp/crm/customer/create", asyncRoute(async (req, res) => {
  res.status(201).json(ok(await persist(actions().createCustomer(req.body))));
}));

app.patch("/api/gpu_erp/crm/customer/:id", asyncRoute(async (req, res) => {
  const updated = actions().updateCrmCustomer(req.params.id, req.body);
  await persist(updated);
  res.status(updated ? 200 : 404).json(ok(updated));
}));

app.get("/api/gpu_erp/crm/follow-ups", (req, res) => {
  const filtered = state.crmFollowUps.filter((item) => {
    const matchCustomer = !req.query.customerId || item.customerId === req.query.customerId;
    const matchHandler = !req.query.handler || item.handler === req.query.handler;
    const matchResult = !req.query.result || item.result === req.query.result;
    return matchCustomer && matchHandler && matchResult;
  });
  res.json(paginated(filtered, req));
});

app.post("/api/gpu_erp/crm/follow-up/create", asyncRoute(async (req, res) => {
  res.status(201).json(ok(await persist(actions().createCrmFollowUp(req.body))));
}));

app.get("/api/gpu_erp/crm/requirements", (req, res) => {
  const filtered = state.crmRequirements.filter((item) => {
    const matchCustomer = !req.query.customerId || item.customerId === req.query.customerId;
    const matchHandler = !req.query.handler || item.handler === req.query.handler;
    const matchIntent = !req.query.intent || item.intent === req.query.intent;
    const matchStage = !req.query.stage || item.stage === req.query.stage;
    return matchCustomer && matchHandler && matchIntent && matchStage;
  });
  res.json(paginated(filtered, req));
});

app.post("/api/gpu_erp/crm/requirement/create", asyncRoute(async (req, res) => {
  res.status(201).json(ok(await persist(actions().createCrmRequirement(req.body))));
}));

app.get("/api/gpu_erp/crm/summary", (req, res) => {
  res.json({ data: actions().getCrmSummary(req.query as Record<string, string>) });
});

app.post("/api/products", asyncRoute(async (req, res) => {
  res.status(201).json(ok(await persist(actions().addProductTemplate(req.body))));
}));

app.put("/api/products/:id", asyncRoute(async (req, res) => {
  res.json(ok(await persist(actions().updateProductTemplate({ ...req.body, id: req.params.id }))));
}));

app.delete("/api/products/:id", requireDeletePermission, asyncRoute(async (req, res) => {
  const deleted = actions().deleteProductTemplate(req.params.id);
  await persist(deleted);
  res.status(deleted ? 200 : 404).json(ok(deleted));
}));

app.post("/api/purchase-invoices", asyncRoute(async (req, res) => {
  res.status(201).json(ok(await persist(actions().createPurchaseInvoice(req.body))));
}));

app.put("/api/purchase-invoices/:id", asyncRoute(async (req, res) => {
  res.json(ok(await persist(actions().updatePurchaseInvoice(req.params.id, req.body))));
}));

app.delete("/api/purchase-invoices/:id", requireDeletePermission, asyncRoute(async (req, res) => {
  res.json(ok(await persist(actions().deletePurchaseInvoice(req.params.id))));
}));

app.post("/api/inspections", asyncRoute(async (req, res) => {
  res.status(201).json(ok(await persist(actions().submitInspection(req.body))));
}));

app.get("/api/assembly-operations", (req, res) => {
  const keyword = String(req.query.search || "").trim().toLowerCase();
  const filtered = state.assemblyOperations.filter((item) => {
    const matchType = !req.query.type || item.type === req.query.type;
    const matchHandler = !req.query.handler || item.handler === req.query.handler;
    const matchKeyword = !keyword || [
      item.id,
      item.beforeSn,
      item.beforeProductName,
      item.afterSn,
      item.afterProductName,
      ...item.beforeParts.map((part) => `${part.partName} ${part.sn}`),
      ...item.afterParts.map((part) => `${part.partName} ${part.sn}`)
    ].filter(Boolean).join(" ").toLowerCase().includes(keyword);
    return matchType && matchHandler && matchKeyword;
  });
  res.json(paginated(filtered, req));
});

app.post("/api/assembly-operations", asyncRoute(async (req, res) => {
  res.status(201).json(ok(await persist(actions().createAssemblyOperation(req.body))));
}));

app.delete("/api/assembly-operations/:id", requireDeletePermission, asyncRoute(async (req, res) => {
  res.json(ok(await persist(actions().deleteAssemblyOperation(req.params.id))));
}));

app.post("/api/sales-invoices", asyncRoute(async (req, res) => {
  res.status(201).json(ok(await persist(actions().createSalesInvoice(req.body))));
}));

app.put("/api/sales-invoices/:id", asyncRoute(async (req, res) => {
  res.json(ok(await persist(actions().updateSalesInvoice(req.params.id, req.body))));
}));

app.delete("/api/sales-invoices/:id", requireDeletePermission, asyncRoute(async (req, res) => {
  res.json(ok(await persist(actions().deleteSalesInvoice(req.params.id))));
}));

app.post("/api/sales-invoices/:id/outbound", asyncRoute(async (req, res) => {
  res.json(ok(await persist(actions().confirmSalesOutbound(req.params.id, req.body))));
}));

app.post("/api/aftersales", asyncRoute(async (req, res) => {
  res.status(201).json(ok(await persist(actions().addAftersalesClaim(req.body))));
}));

app.patch("/api/aftersales/:id", asyncRoute(async (req, res) => {
  const updated = actions().updateAftersalesStatus(req.params.id, req.body);
  await persist(updated);
  res.status(updated ? 200 : 404).json(ok(updated));
}));

app.post("/api/market-quotes", asyncRoute(async (req, res) => {
  res.status(201).json(ok(await persist(actions().createMarketQuote(req.body))));
}));

app.patch("/api/market-quotes/:id", asyncRoute(async (req, res) => {
  const updated = actions().updateMarketPrice(req.params.id, req.body.todayBuyPrice, req.body.todaySellPrice, req.body.remarks);
  await persist(updated);
  res.status(updated ? 200 : 404).json(ok(updated));
}));

app.patch("/api/inventory/batch", asyncRoute(async (req, res) => {
  const updated = actions().batchUpdateInventory(req.body.ids || [], req.body.updates || {});
  await persist(updated);
  res.json(ok(updated));
}));

app.get("/api/inventory/summary", (req, res) => {
  res.json({ data: actions().getInventorySummary(req.query as Record<string, string>) });
});

app.post("/api/inventory/import", asyncRoute(async (req, res) => {
  res.status(201).json(ok(await persist(actions().importInventoryRows(req.body.rows || [], req.body.handler))));
}));

app.post("/api/inventory/scan-flow", asyncRoute(async (req, res) => {
  res.json(ok(await persist(actions().scanInventoryFlow(req.body))));
}));

app.post("/api/customers", asyncRoute(async (req, res) => {
  res.status(201).json(ok(await persist(actions().createCustomer(req.body))));
}));

app.post("/api/vendors", asyncRoute(async (req, res) => {
  res.status(201).json(ok(await persist(actions().createVendor(req.body))));
}));

app.post("/api/logs", asyncRoute(async (req, res) => {
  const { user, module, type, target, beforeVal, afterVal } = req.body;
  res.status(201).json(ok(await persist(actions().addLog(user, module, type, target, beforeVal, afterVal))));
}));

app.delete("/api/logs", requireHistoryEditPermission, asyncRoute(async (_req, res) => {
  actions().clearAllLogs();
  await persist(null);
  res.json(ok(null));
}));

app.patch("/api/finance-ledger/:id/reconcile", asyncRoute(async (req, res) => {
  const updated = actions().reconcileLedgerItem(req.params.id);
  await persist(updated);
  res.status(updated ? 200 : 404).json(ok(updated));
}));

app.patch("/api/permissions/:key/toggle", requireBoss, asyncRoute(async (req, res) => {
  res.json(ok(await persist(actions().togglePermission(req.params.key as never))));
}));

app.patch("/api/role", requireBoss, asyncRoute(async (req, res) => {
  res.json(ok(await persist(actions().setRole(req.body.role))));
}));

app.post("/api/reset", requireBoss, asyncRoute(async (_req, res) => {
  if (process.env.NODE_ENV === "production" && process.env.ALLOW_PRODUCTION_RESET !== "true") {
    res.status(403).json({ error: { code: "FORBIDDEN", message: "生产环境已禁用数据初始化接口" } });
    return;
  }
  state = actions().resetToInitialMock();
  await saveState(state);
  res.json(ok(state));
}));

// 业务数据导出(CSV)。成本/毛利列受 showCost 权限控制。
app.get("/api/export/:dataset", (req: AuthRequest, res) => {
  try {
    const showCost = Boolean(actions().getPermissions().showCost);
    const { filename, csv } = buildExport(state, req.params.dataset, { showCost });
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`);
    res.send(`﻿${csv}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : "导出失败";
    res.status(400).json({ error: { code: "EXPORT_FAILED", message } });
  }
});

// 触发一次手动备份(老板权限)。
app.post("/api/backup", requireBoss, asyncRoute(async (_req, res) => {
  const result = await createManualBackup();
  res.status(201).json(ok({ file: result.file }));
}));

// 备份清单(老板权限)。
app.get("/api/backup", requireBoss, asyncRoute(async (_req, res) => {
  res.json(ok(await listBackups()));
}));

// 全量数据下载,用于异地备份/迁移(老板权限,含完整账号信息)。
app.get("/api/backup/download", requireBoss, (_req, res) => {
  const stamp = new Date().toISOString().slice(0, 10);
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="app-state-backup-${stamp}.json"`);
  res.send(JSON.stringify({ ...state, currentUserId: undefined }, null, 2));
});

app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  const message = err instanceof Error ? err.message : "Unknown server error";
  res.status(500).json({ error: { code: "SERVER_ERROR", message } });
});

app.listen(PORT, () => {
  console.log(`Backend API listening on http://localhost:${PORT}`);
});
