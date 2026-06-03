import express from "express";
import { dataFilePath, loadState, saveState } from "./db.ts";
import { createStoreActions, type AppState } from "./store.ts";

const PORT = Number(process.env.API_PORT || process.env.PORT || 3001);

const app = express();
app.use(express.json({ limit: "2mb" }));

let state: AppState = await loadState();

function actions() {
  return createStoreActions(state);
}

async function persist<T>(result: T) {
  await saveState(state);
  return result;
}

function ok(data: unknown = null) {
  return { data, state };
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

app.get("/api/health", (_req, res) => {
  res.json({ data: { ok: true, dataFile: dataFilePath } });
});

app.get("/api/state", (_req, res) => {
  res.json({ data: state });
});

app.get("/api/auth/me", (_req, res) => {
  res.json(ok(actions().getCurrentUser()));
});

app.post("/api/auth/login", asyncRoute(async (req, res) => {
  res.json(ok(await persist(actions().login(req.body))));
}));

app.post("/api/auth/logout", asyncRoute(async (_req, res) => {
  res.json(ok(await persist(actions().logout())));
}));

app.get("/api/users", (_req, res) => {
  res.json(ok(actions().listUsers()));
});

app.post("/api/users", asyncRoute(async (req, res) => {
  res.status(201).json(ok(await persist(actions().createUser(req.body))));
}));

app.put("/api/users/:id", asyncRoute(async (req, res) => {
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

app.post("/api/gpu_erp/finance/payment-out/create", asyncRoute(async (req, res) => {
  res.status(201).json(ok(await persist(actions().createPaymentOut(req.body))));
}));

app.put("/api/gpu_erp/finance/payment-out/:id", asyncRoute(async (req, res) => {
  res.json(ok(await persist(actions().updatePaymentOut(req.params.id, req.body))));
}));

app.post("/api/gpu_erp/finance/account-transfer/create", asyncRoute(async (req, res) => {
  res.status(201).json(ok(await persist(actions().createAccountTransfer(req.body))));
}));

app.put("/api/gpu_erp/finance/account-transfer/:id", asyncRoute(async (req, res) => {
  res.json(ok(await persist(actions().updateAccountTransfer(req.params.id, req.body))));
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

app.delete("/api/products/:id", asyncRoute(async (req, res) => {
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

app.post("/api/inspections", asyncRoute(async (req, res) => {
  res.status(201).json(ok(await persist(actions().submitInspection(req.body))));
}));

app.post("/api/sales-invoices", asyncRoute(async (req, res) => {
  res.status(201).json(ok(await persist(actions().createSalesInvoice(req.body))));
}));

app.put("/api/sales-invoices/:id", asyncRoute(async (req, res) => {
  res.json(ok(await persist(actions().updateSalesInvoice(req.params.id, req.body))));
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

app.delete("/api/logs", asyncRoute(async (_req, res) => {
  actions().clearAllLogs();
  await persist(null);
  res.json(ok(null));
}));

app.patch("/api/finance-ledger/:id/reconcile", asyncRoute(async (req, res) => {
  const updated = actions().reconcileLedgerItem(req.params.id);
  await persist(updated);
  res.status(updated ? 200 : 404).json(ok(updated));
}));

app.patch("/api/permissions/:key/toggle", asyncRoute(async (req, res) => {
  res.json(ok(await persist(actions().togglePermission(req.params.key as never))));
}));

app.patch("/api/role", asyncRoute(async (req, res) => {
  res.json(ok(await persist(actions().setRole(req.body.role))));
}));

app.post("/api/reset", asyncRoute(async (_req, res) => {
  state = actions().resetToInitialMock();
  await saveState(state);
  res.json(ok(state));
}));

app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  const message = err instanceof Error ? err.message : "Unknown server error";
  res.status(500).json({ error: { code: "SERVER_ERROR", message } });
});

app.listen(PORT, () => {
  console.log(`Backend API listening on http://localhost:${PORT}`);
});
