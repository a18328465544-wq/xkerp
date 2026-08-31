import express from "express";
import compression from "compression";
import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import rateLimit from "express-rate-limit";
import helmet from "helmet";
import { acquireAuthWriteLock, acquireStateWriteLock, appendInspectionVersionInTransaction, createDatabaseSessionStore, dataFilePath, deleteAiInsightAction, findActiveTenantMembership, findInventoryRecord, findInventoryRecordBySn, findSystemUserById, findSystemUserByUsername, getStateRevision, listAiInsightActions, listInspectionVersions, loadState, loadStateCollections, queryInventoryPage, queryLogsPage, saveAiInsightAction, saveState, saveStateCollections, saveStateRecords } from "./db.ts";
import type { StateCollectionKey } from "./db.ts";
import { createStoreActions, type AppState, type StoreActionContext } from "./store.ts";
import { notifyFeishuSalesInvoiceCreated } from "./feishu.ts";
import { getDashboardAiInsights } from "./aiInsights.ts";
import { runCopilotTurn, type CopilotMessage } from "./aiCopilot.ts";
import type { CopilotContext } from "../src/utils/copilotTools.ts";
import { createSessionManager } from "./security.ts";
import { assertPurchaseUpdateScope } from "./purchaseEditAccess.ts";
import { createRequireAuth, createRequireCsrf, createRequireOpenApiToken } from "./httpAuth.ts";
import { AppError, NotFoundError, toDomainError, UnauthorizedError } from "./errors.ts";
import {
  getPermissionsForUser as getScopedPermissions,
  publicCollectionForUser as getPublicCollection,
  publicStateForUser as getPublicState,
  type PublicStateMode,
} from "./publicState.ts";
import {
  getPersistenceKeysForRequest,
  getReloadKeysForRequest,
  getStatePatchKeysForRequest,
  INITIAL_STATE_RELOAD_KEYS,
  shouldAttachFreshStateToResponse,
  shouldReloadStateFromDatabase,
} from "./requestStatePolicy.ts";
import {
  compactStateMerge,
  replacedLinkedPaymentDeletePatch,
  stateDeleteRecords,
  stateMergeRecords,
  statePatchResponse,
  type StateDeletePatch,
  type StateMergePatch,
} from "./statePatch.ts";
import { runStateCommand, type StateCommandTransactionHook } from "./stateCommand.ts";
import { storeDate, storeDateDiffDays, storeDateTime } from "../src/utils/storeTime.ts";
import { addDateDays, startOfMonth } from "../src/lib/dateRangePickerUtils.ts";
import { matchesKeyword, normalizeSearchText } from "../src/utils/search.ts";
import { isInventoryLinkedToAssembly, isInventoryLinkedToPurchase } from "../src/utils/inventoryRelations.ts";
import { listCrmAccounts, listCrmTimeline } from "./crmRepository.ts";
import { ensureCrmCustomerAccount, upsertCrmCustomerAccount } from "./crmAccountRepository.ts";
import { createSerializedMutationRunner, isMutationAbortedError } from "./mutationQueue.ts";
import { createAuthMutationRunner } from "./authMutation.ts";
import { requiresStateSerialization } from "./mutationPolicy.ts";
import { createRequestMetrics, redactRequestPath, safeErrorMessage } from "./observability.ts";
import { syncCrmFollowUp, syncCrmQuote, syncCrmRequirement } from "./crmCommandRepository.ts";
import {
  confirmQuickCaptureAuditInTransaction,
  findQuickCaptureAudit,
  findLeadByIdempotencyKey,
  insertQuickCaptureLead,
  insertQuickCaptureTask,
  listQuickCaptureLeads,
  saveQuickCaptureAudit,
  saveQuickCaptureAuditInTransaction,
} from "./crmQuickCaptureRepository.ts";
import {
  createQuickCaptureLeadId,
  createQuickCaptureTaskId,
  parseQuickCaptureText,
  validateQuickCaptureConfirm,
  QuickCaptureValidationError,
} from "./crmQuickCapture.ts";
import { buildCustomerLeadPreview, normalizeCustomerLeadInput } from "./crmCustomerLead.ts";
import { registerMasterDataRoutes } from "./routes/masterData.ts";
import { registerPurchaseReadRoutes } from "./routes/purchaseRead.ts";
import { registerOperationalReadRoutes } from "./routes/operationalReads.ts";
import { registerFinanceClosingRoutes } from "./routes/financeClosing.ts";
import {registerPagedRecordRoutes} from "./routes/pagedRecords.ts";
import { registerSystemRoutes } from "./routes/system.ts";
import { registerFinanceCommissionRoutes } from "./routes/financeCommissions.ts";
import { syncCrmPurchaseInvoiceLink, syncCrmSalesInvoiceLink } from "./crmEntityRepository.ts";
import { getMediaAsset, listEntityImages, MEDIA_MAX_BYTES, MEDIA_TARGET_BYTES, MediaValidationError, replaceEntityImages } from "./mediaRepository.ts";
import {clearSessionCookie, createCsrfToken, setSessionCookie} from "./authCookies.ts";
import {assertStateRuntimeMode} from "./runtimeConfig.ts";
import {registerInventoryJourneyRoutes} from "./routes/inventoryJourney.ts";
import { registerSalesProductCandidateRoutes } from "./routes/salesProductCandidates.ts";
import { registerSalesCustomerRoutes } from "./routes/salesCustomers.ts";
import {registerSalesOutboundRoutes} from "./routes/salesOutbound.ts";
import {registerCustomerDirectoryRoutes} from "./routes/customerDirectory.ts";
import { registerProductLedgerRoutes } from "./routes/productLedger.ts";
import { registerMarketQuoteRoutes } from "./routes/marketQuotes.ts";
import { registerCommercialRoutes } from "./routes/commercial.ts";
import { registerBackupRoutes } from "./routes/backup.ts";
import { registerStateRevisionRoute, registerStateRoutes } from "./routes/state.ts";
import { registerFinanceReadModelRoutes } from "./routes/financeReadModels.ts";
import { CommercialValidationError, assertCommercialTenantActive, assertSeatAvailable, claimIdempotencyKey, completeIdempotencyKeyInTransaction, commercialFeatureEnabled, estimateAiUsageUnits, hashIdempotencyPayload, recordCommercialUsage, releaseIdempotencyKey, releaseInventoryReservationsInTransaction, reserveSalesOutboundInventoryInTransaction, upsertCommercialMembershipInTransaction } from "./commercialRepository.ts";
import { createStateProxy, getFallbackState, replaceCurrentState, runTenantContext } from "./requestTenantContext.ts";
import { DEFAULT_STORE_ID, DEFAULT_TENANT_ID } from "./commercialConstants.ts";
import {
  inspectionCreateDto,
  inspectionUpdateDto,
  parseHttpDto,
  paymentInCreateDto,
  paymentInUpdateDto,
  paymentOutCreateDto,
  paymentOutUpdateDto,
  purchaseInvoiceCreateDto,
  purchaseInvoiceUpdateDto,
} from "./httpDto.ts";
import type {
  AccountTransferRecord,
  AssemblyOperationRecord,
  CardInventory,
  CrmFollowUpRecord,
  CrmQuote,
  CrmRequirement,
  InspectionRecord,
  InventoryScanResult,
  MarketQuote,
  PaymentInRecord,
  PaymentOutRecord,
  ProductTemplate,
  SalesInvoice,
  SystemUserAccount,
} from "../src/types.ts";
const PORT = Number(process.env.API_PORT || process.env.PORT || 3001);
const LOGIN_RATE_LIMIT_WINDOW_MS = Number(process.env.LOGIN_RATE_LIMIT_WINDOW_MS || 15 * 60 * 1000);
const LOGIN_RATE_LIMIT_MAX = Number(process.env.LOGIN_RATE_LIMIT_MAX || 8);
const OPEN_API_TOKEN = process.env.OPEN_API_TOKEN || "";
const OPEN_API_RATE_LIMIT_WINDOW_MS = Number(process.env.OPEN_API_RATE_LIMIT_WINDOW_MS || 60 * 1000);
const OPEN_API_RATE_LIMIT_MAX = Number(process.env.OPEN_API_RATE_LIMIT_MAX || 240);
export const app = express();
const requestMetrics = createRequestMetrics();
app.disable("x-powered-by");
app.set("trust proxy", "loopback");
app.use(helmet());
// Generate the request id before parsers or route handlers so even malformed/oversized payloads
// can be correlated with a structured error response.
app.use(requestContext);
app.use(requestMetrics.middleware);
// State snapshots and analytics payloads can grow with inventory and invoice
// history. Compress only responses large enough to benefit; compression
// handles content negotiation and skips downloads/already encoded responses.
app.use(compression({threshold: 1024}));
app.use(express.json({ limit: "2mb" }));
app.use((req, _res, next) => {
  // Liveness must remain useful while PostgreSQL is unavailable. Authenticated and
  // business routes still initialize state before reaching their handlers.
  if (req.path === "/api/health" || req.path === "/api/ready") {
    next();
    return;
  }
  void ensureStateReady().then(() => next()).catch(next);
});
const loginRateLimiter = rateLimit({
  windowMs: LOGIN_RATE_LIMIT_WINDOW_MS,
  limit: LOGIN_RATE_LIMIT_MAX,
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  handler: (req, res) => sendApiError(req, res, 429, "LOGIN_RATE_LIMITED", "登录尝试过多，请稍后再试。", true),
});
const openApiRateLimiter = rateLimit({
  windowMs: OPEN_API_RATE_LIMIT_WINDOW_MS,
  limit: OPEN_API_RATE_LIMIT_MAX,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => sendApiError(req, res, 429, "OPEN_API_RATE_LIMITED", "开放接口请求过于频繁，请稍后再试。", true),
});
// Keep module import side-effect free with respect to PostgreSQL. The first request initializes
// the state, which keeps HTTP tests and app composition independent from a database connection
// at import time.
const state = createStateProxy<AppState>();
let stateRevision = 0;
let stateReady: Promise<void> | undefined;
const sessions = createSessionManager(createDatabaseSessionStore(), {cleanupIntervalMs: Number(process.env.SESSION_CLEANUP_INTERVAL_MS || 15 * 60 * 1_000)});
type AuthRequest = express.Request & {
  authToken?: string;
  authMode?: "bearer" | "cookie";
  authUser?: SystemUserAccount;
  requestId?: string;
  requestStartedAt?: number;
  tenantId?: string;
  storeId?: string;
};
async function ensureStateReady() {
  if (!stateReady) {
    stateReady = (async () => {
      if (process.env.NODE_ENV === "production") assertStateRuntimeMode();
      replaceCurrentState(await loadState());
      stateRevision = await getStateRevision();
    })().catch((error) => {
      stateReady = undefined;
      throw error;
    });
  }
  await stateReady;
}
const runSerializedStateMutation = createSerializedMutationRunner(
  acquireStateWriteLock,
  async () => {
    await reloadStateFromDatabase();
  },
);
const runSerializedAuthMutation = createAuthMutationRunner(
  acquireAuthWriteLock,
  async () => {
    await reloadStateFromDatabase();
  },
);
function createMutationRequestSignal(req: express.Request, res: express.Response) {
  const controller = new AbortController();
  let responseFinished = false;
  let disposed = false;
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    req.off("aborted", abort);
    res.off("finish", finished);
    res.off("close", closed);
  };
  const abort = () => {
    if (!responseFinished) controller.abort();
  };
  const finished = () => {
    responseFinished = true;
    dispose();
  };
  const closed = () => {
    abort();
    dispose();
  };
  req.once("aborted", abort);
  res.once("finish", finished);
  res.once("close", closed);
  if (req.aborted || res.destroyed) controller.abort();

  return { signal: controller.signal, dispose };
}

async function withStateMutation<T>(req: AuthRequest | undefined, res: express.Response | undefined, operation: () => T | PromiseLike<T>) {
  const requestSignal = req && res ? createMutationRequestSignal(req, res) : undefined;
  try {
    return await runSerializedStateMutation(async () => {
      // The request-level reload middleware deliberately runs outside this lock. Reload again
      // here so every mutation calculates from the committed snapshot it actually owns.
      await reloadStateFromDatabase();
      if (req?.authUser) {
        const freshUser = await applyAuthenticatedUser(req.authUser.id, { tenantId: req.tenantId });
        if (!freshUser) {
          await sessions.revoke(req.authToken);
          throw new UnauthorizedError("账号已停用或不存在");
        }
        req.authUser = freshUser;
      }
      return operation();
    }, { signal: requestSignal?.signal });
  } finally {
    requestSignal?.dispose();
  }
}

async function withAuthMutation<T>(req: AuthRequest, res: express.Response, operation: () => T | PromiseLike<T>) {
  const requestSignal = createMutationRequestSignal(req, res);
  try {
    return await runSerializedAuthMutation(async () => {
      // Login/logout only need these two collections. Refresh them while holding the
      // auth lock so two processes cannot calculate audit/account writes from stale rows.
      const username = typeof req.body?.username === "string" ? req.body.username.trim() : "";
      // A tenant member may share a username with another tenant.  The optional
      // tenantId is therefore used only as a lookup scope; it never grants access
      // by itself because the session still requires an active membership below.
      const requestedTenantId = typeof req.body?.tenantId === "string" ? req.body.tenantId.trim() : undefined;
      const candidate = username ? await findSystemUserByUsername(username, requestedTenantId) : null;
      const tenantId = requestedTenantId || candidate?.tenantId || req.tenantId || DEFAULT_TENANT_ID;
      const storeId = candidate?.storeId || req.storeId || DEFAULT_STORE_ID;
      const baseState = getFallbackState<AppState>() || state;
      const authState = tenantId === DEFAULT_TENANT_ID
        ? await loadStateCollections(baseState, ["systemUsers", "logs"], tenantId, storeId)
        : await loadState(tenantId, storeId);
      return runTenantContext({ tenantId, storeId, state: authState }, operation);
    }, { signal: requestSignal.signal });
  } finally {
    requestSignal.dispose();
  }
}

function normalizeRequestId(value: string | string[] | undefined) {
  const candidate = Array.isArray(value) ? value[0] : value;
  return candidate && /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(candidate)
    ? candidate
    : randomUUID();
}

function requestContext(req: express.Request, res: express.Response, next: express.NextFunction) {
  const requestId = normalizeRequestId(req.headers["x-request-id"]);
  const authRequest = req as AuthRequest;
  authRequest.requestId = requestId;
  authRequest.requestStartedAt = Date.now();
  res.setHeader("X-Request-Id", requestId);
  next();
}

function requestIdFor(req: express.Request) {
  return (req as AuthRequest).requestId || randomUUID();
}

function logRequestError(req: express.Request, error: unknown, code: string) {
  console.error(JSON.stringify({
    event: "api_error",
    requestId: requestIdFor(req),
    method: req.method,
    path: redactRequestPath(req.originalUrl || req.url),
    userId: (req as AuthRequest).authUser?.id || null,
    username: (req as AuthRequest).authUser?.username || null,
    durationMs: Math.max(0, Date.now() - ((req as AuthRequest).requestStartedAt || Date.now())),
    name: error instanceof Error ? error.name : "UnknownError",
    code,
    message: safeErrorMessage(error),
  }));
}

function logSecurityDenial(req: express.Request, details: { status: number; code: string }) {
  console.warn(JSON.stringify({
    event: "security_denied",
    requestId: requestIdFor(req),
    method: req.method,
    path: redactRequestPath(req.originalUrl || req.url),
    userId: (req as AuthRequest).authUser?.id || null,
    username: (req as AuthRequest).authUser?.username || null,
    status: details.status,
    code: details.code,
  }));
}

function sendApiError(
  req: express.Request,
  res: express.Response,
  status: number,
  code: string,
  message: string,
  audit = false,
) {
  if (audit) logSecurityDenial(req, { status, code });
  res.status(status).json({ error: { code, message, requestId: requestIdFor(req) } });
}

function isPublicApiPath(pathname: string) {
  return pathname === "/api/health"
    || pathname === "/api/ready"
    || /^\/api\/auth\/login\/?$/.test(pathname)
    || pathname.startsWith("/api/open/");
}

// Authentication is applied before every private API route. Public health/login/open routes
// opt out explicitly, while open routes still enforce their own token middleware below.
function requireApiAuthentication(req: express.Request, res: express.Response, next: express.NextFunction) {
  if (!req.path.startsWith("/api/") || isPublicApiPath(req.path)) {
    next();
    return;
  }
  requireAuth(req as AuthRequest, res, () => {
    const authRequest = req as AuthRequest;
    const tenantId = authRequest.tenantId || authRequest.authUser?.tenantId || DEFAULT_TENANT_ID;
    const storeId = authRequest.storeId || authRequest.authUser?.storeId || DEFAULT_STORE_ID;
    void assertCommercialTenantActive(tenantId)
      .then(() => loadState(tenantId, storeId))
      .then((tenantState) => runTenantContext({ tenantId, storeId, state: tenantState }, next))
      .catch(next);
  });
}

app.use(requireApiAuthentication);
app.use(createRequireCsrf({onDenied: logSecurityDenial}));

function actions(req?: AuthRequest, context?: StoreActionContext) {
  const storeActions = createStoreActions(
    state,
    req?.authUser ? {
      userId: req.authUser.id,
      role: req.authUser.role,
      tenantId: req.tenantId || req.authUser.tenantId,
      storeId: req.storeId || req.authUser.storeId,
      requestId: req.requestId,
    } : context,
  );
  return new Proxy(storeActions, {
    get(target, property, receiver) {
      const value = Reflect.get(target, property, receiver);
      if (typeof value !== "function") return value;
      return (...args: unknown[]) => {
        try {
          return Reflect.apply(value, target, args);
        } catch (error) {
          throw toDomainError(error);
        }
      };
    },
  });
}

function isUniqueViolation(error: unknown) {
  return Boolean(error && typeof error === "object" && "code" in error && (error as { code?: unknown }).code === "23505");
}

async function persist<T>(result: T, keys?: StateCollectionKey[] | null) {
  if (keys?.length) {
    await saveStateCollections(state, keys);
    return result;
  } else {
    await saveState(state);
  }
  replaceCurrentState(await loadState());
  return result;
}

async function persistRequest<T>(req: AuthRequest, result: T) {
  return persist(result, getPersistenceKeysForRequest(req.method, req.path));
}

async function persistUserWithMembership(req: AuthRequest, user: SystemUserAccount) {
  // Store the canonical in-memory record rather than the sanitized response.
  // `createUser`/`updateUser` intentionally strip the password from their return
  // value; persisting that response would silently erase the credential and make
  // the next login fail.  The membership transaction still receives the safe
  // projection below, while the state record retains the hashed password.
  const persistedUser = state.systemUsers.find((item) => item.id === user.id) || user;
  await saveStateRecords(
    [
      { key: "systemUsers", items: [persistedUser] },
      { key: "logs", items: state.logs.slice(0, 1) },
    ],
    (client) => upsertCommercialMembershipInTransaction(client, {
      tenantId: user.tenantId,
      userId: user.id,
      storeId: user.storeId,
      role: user.role,
      status: user.enabled ? "active" : "deactivated",
      permissions: user.permissionOverrides as Record<string, unknown> | undefined,
      invitedBy: req.authUser?.id,
    }),
    req.tenantId,
  );
  return user;
}

async function reloadStateFromDatabase() {
  replaceCurrentState(await loadState());
  stateRevision = await getStateRevision();
}

async function reloadRequestStateFromDatabase(req: AuthRequest) {
  // The client deliberately requests `mode=initial` during login, focus and background sync.
  // Do not turn that lightweight response into a full database read by loading audit/ledger
  // histories first; those collections have their own on-demand endpoints.
  if (req.path === "/api/state" && req.query.mode === "initial") {
    replaceCurrentState(await loadStateCollections(state, INITIAL_STATE_RELOAD_KEYS));
    stateRevision = await getStateRevision();
    return;
  }
  const keys = getReloadKeysForRequest(req.method, req.path);
  // PostgreSQL-backed list endpoints return an empty key list because they
  // query their read model directly. Their request tenant state was already
  // loaded by authentication; replacing it with the shared state proxy here
  // would create a self-referencing proxy and overflow on the next read.
  if (keys === null) replaceCurrentState(await loadState());
  else if (keys.length) replaceCurrentState(await loadStateCollections(state, keys));
  stateRevision = await getStateRevision();
}

function getPermissionsForUser(user?: SystemUserAccount) {
  return getScopedPermissions(state, user);
}

function ok(data: unknown = null, user?: SystemUserAccount, mode: PublicStateMode = "full") {
  return user ? { data, state: getPublicState(state, user, mode) } : { data };
}

function publicState(req?: AuthRequest, mode: PublicStateMode = "full") {
  return getPublicState(state, req?.authUser, mode);
}

function publicCollectionForUser(key: StateCollectionKey, user?: SystemUserAccount) {
  return getPublicCollection(state, key, user);
}

function publicStatePatch(req: AuthRequest, keys: StateCollectionKey[]) {
  return Object.fromEntries(
    Array.from(new Set(keys))
      .map((key) => [key, publicCollectionForUser(key, req.authUser)])
      .filter(([, value]) => value !== undefined),
  );
}

function okMerge(data: unknown, stateMerge: StateMergePatch, stateDelete: StateDeletePatch = {}) {
  return statePatchResponse(data, stateMerge, stateDelete);
}

type IdempotencyContext = {
  request: {
    tenantId: string;
    route: string;
    key: string;
    requestHash: string;
  };
  replay?: {statusCode: number; response: unknown};
};

function idempotencyContext(req: AuthRequest): IdempotencyContext | null {
  const raw = req.headers["idempotency-key"];
  const key = String(Array.isArray(raw) ? raw[0] || "" : raw || "").trim();
  if (!key) return null;
  return {
    request: {
      tenantId: req.tenantId || req.authUser?.tenantId || DEFAULT_TENANT_ID,
      route: (req.originalUrl || req.path).split("?", 1)[0] || req.path,
      key,
      requestHash: hashIdempotencyPayload(req.body ?? null),
    },
  };
}

async function claimMutationIdempotency(req: AuthRequest) {
  const context = idempotencyContext(req);
  if (!context) return null;
  const claim = await claimIdempotencyKey(context.request);
  if (claim.replay) context.replay = {statusCode: claim.statusCode, response: claim.response};
  return context;
}

async function releaseMutationIdempotency(context: IdempotencyContext | null) {
  if (!context || context.replay) return;
  await releaseIdempotencyKey(context.request).catch(() => undefined);
}

function transactionHookWithIdempotency<T>(
  context: IdempotencyContext | null,
  statusCode: number,
  hook?: (client: Parameters<StateCommandTransactionHook<T>>[0], data: T, patch?: {stateMerge: StateMergePatch; stateDelete?: StateDeletePatch}) => void | Promise<unknown>,
) {
  if (!context && !hook) return undefined;
  return async (
    client: Parameters<StateCommandTransactionHook<T>>[0],
    data: T,
    patch?: {stateMerge: StateMergePatch; stateDelete?: StateDeletePatch},
  ) => {
    await hook?.(client, data, patch);
    if (context && patch) {
      await completeIdempotencyKeyInTransaction(client, context.request, statusCode, okMerge(data, patch.stateMerge, patch.stateDelete || {}));
    }
  };
}

function deleteMerge(logs = state.logs.slice(0, 1)) {
  return compactStateMerge({ logs });
}

function purchaseInvoiceCreateMerge(invoice: { id: string; invoiceNo: string; sourceType: string; sourcePartnerId?: string; supplierName: string; settlementAccountId?: string; images?: string[] }) {
  const relatedDocNos = new Set([invoice.id, invoice.invoiceNo].filter(Boolean));
  const inventory = state.inventory.filter((item) => isInventoryLinkedToPurchase(item, invoice));
  const paymentOutRecords = state.paymentOutRecords.filter((item) => item.relatedDocNo && relatedDocNos.has(item.relatedDocNo));
  const settlementLedgerIds = new Set(paymentOutRecords.map((item) => item.settlementLedgerId).filter(Boolean));
  const financeLedgerIds = new Set(paymentOutRecords.map((item) => item.financeLedgerId).filter(Boolean));
  const settlementLedger = state.settlementLedger.filter((item) =>
    settlementLedgerIds.has(item.id) || (item.relatedDocNo ? relatedDocNos.has(item.relatedDocNo) : false)
  );
  const financeLedger = state.financeLedger.filter((item) =>
    financeLedgerIds.has(item.id) || (item.relatedId ? relatedDocNos.has(item.relatedId) : false)
  );
  const accountIds = new Set([
    invoice.settlementAccountId,
    ...paymentOutRecords.map((item) => item.accountId),
    ...settlementLedger.map((item) => item.accountId),
    ...financeLedger.map((item) => item.settlementAccountId),
  ].filter(Boolean));
  const settlementAccounts = state.settlementAccounts.filter((item) => accountIds.has(item.id));
  const isPersonalSource = ["个人回收", "客户置换"].includes(invoice.sourceType);

  return compactStateMerge({
    purchaseInvoices: state.purchaseInvoices.filter((item) => item.id === invoice.id || item.invoiceNo === invoice.invoiceNo),
    inventory,
    customers: isPersonalSource
      ? recordsByIdOrLegacyName(state.customers, invoice.sourcePartnerId, invoice.supplierName)
      : [],
    vendors: !isPersonalSource
      ? recordsByIdOrLegacyName(state.vendors, invoice.sourcePartnerId, invoice.supplierName)
      : [],
    financeLedger,
    settlementAccounts,
    settlementLedger,
    paymentOutRecords,
    logs: state.logs.slice(0, 1),
  });
}

function relatedPurchasePayments(invoice: { id: string; invoiceNo: string }) {
  const relatedDocNos = new Set([invoice.id, invoice.invoiceNo].filter(Boolean));
  return state.paymentOutRecords.filter((item) => item.relatedDocNo && relatedDocNos.has(item.relatedDocNo));
}

function relatedPurchaseFinanceLedger(invoice: { id: string; invoiceNo: string }) {
  const relatedDocNos = new Set([invoice.id, invoice.invoiceNo].filter(Boolean));
  return state.financeLedger.filter((item) => item.relatedId && relatedDocNos.has(item.relatedId));
}

function purchaseInvoiceUpdatePatch(
  invoice: { id: string; invoiceNo: string; sourceType: string; sourcePartnerId?: string; supplierName: string; settlementAccountId?: string; images?: string[] },
  paymentsBeforeUpdate: PaymentOutRecord[],
  financeBeforeUpdate: { id: string }[],
) {
  return {
    stateMerge: purchaseInvoiceCreateMerge(invoice),
    stateDelete: replacedLinkedPaymentDeletePatch(
      "paymentOutRecords",
      paymentsBeforeUpdate,
      relatedPurchasePayments(invoice),
      financeBeforeUpdate,
      relatedPurchaseFinanceLedger(invoice),
    ),
  };
}

function salesInvoiceMerge(invoice: SalesInvoice) {
  const relatedDocNos = new Set([invoice.id, invoice.invoiceNo].filter(Boolean));
  const inventoryIds = new Set(invoice.items.map((item) => item.inventoryId).filter(Boolean));
  const paymentInRecords = state.paymentInRecords.filter((item) => item.relatedDocNo && relatedDocNos.has(item.relatedDocNo));
  const settlementLedgerIds = new Set(paymentInRecords.map((item) => item.settlementLedgerId).filter(Boolean));
  const financeLedgerIds = new Set(paymentInRecords.map((item) => item.financeLedgerId).filter(Boolean));
  const settlementLedger = state.settlementLedger.filter((item) =>
    settlementLedgerIds.has(item.id) || (item.relatedDocNo ? relatedDocNos.has(item.relatedDocNo) : false)
  );
  const financeLedger = state.financeLedger.filter((item) =>
    financeLedgerIds.has(item.id) || (item.relatedId ? relatedDocNos.has(item.relatedId) : false)
  );
  const accountIds = new Set([
    invoice.settlementAccountId,
    ...paymentInRecords.map((item) => item.accountId),
    ...settlementLedger.map((item) => item.accountId),
    ...financeLedger.map((item) => item.settlementAccountId),
  ].filter(Boolean));
  const isVendorCustomer = invoice.customerPartnerType === "vendor";

  return compactStateMerge({
    salesInvoices: state.salesInvoices.filter((item) => item.id === invoice.id || item.invoiceNo === invoice.invoiceNo),
    inventory: state.inventory.filter((item) => inventoryIds.has(item.id)),
    purchaseCommissions: state.purchaseCommissions.filter((item) => item.salesInvoiceNo === invoice.invoiceNo),
    customers: !isVendorCustomer
      ? recordsByIdOrLegacyName(state.customers, invoice.customerId, invoice.customerName)
      : [],
    vendors: isVendorCustomer
      ? recordsByIdOrLegacyName(state.vendors, invoice.customerId, invoice.customerName)
      : [],
    financeLedger,
    settlementAccounts: state.settlementAccounts.filter((item) => accountIds.has(item.id)),
    settlementLedger,
    paymentInRecords,
    logs: state.logs.slice(0, 1),
  });
}

function relatedSalesPayments(invoice: { id: string; invoiceNo: string }) {
  const relatedDocNos = new Set([invoice.id, invoice.invoiceNo].filter(Boolean));
  return state.paymentInRecords.filter((item) => item.relatedDocNo && relatedDocNos.has(item.relatedDocNo));
}

function relatedSalesFinanceLedger(invoice: { id: string; invoiceNo: string }) {
  const relatedDocNos = new Set([invoice.id, invoice.invoiceNo].filter(Boolean));
  return state.financeLedger.filter((item) => item.relatedId && relatedDocNos.has(item.relatedId));
}

function salesInvoiceUpdatePatch(invoice: SalesInvoice, paymentsBeforeUpdate: PaymentInRecord[], financeBeforeUpdate: { id: string }[]) {
  return {
    stateMerge: salesInvoiceMerge(invoice),
    stateDelete: replacedLinkedPaymentDeletePatch(
      "paymentInRecords",
      paymentsBeforeUpdate,
      relatedSalesPayments(invoice),
      financeBeforeUpdate,
      relatedSalesFinanceLedger(invoice),
    ),
  };
}

function simpleRecordCreateMerge(key: StateCollectionKey, record: { id: string }) {
  return compactStateMerge({
    [key]: [record],
    logs: state.logs.slice(0, 1),
  } as StateMergePatch);
}

function crmFollowUpMerge(record: CrmFollowUpRecord) {
  return compactStateMerge({
    crmFollowUps: [record],
    customers: recordsByIds(state.customers, [record.customerId]),
    logs: state.logs.slice(0, 1),
  });
}

function crmRequirementMerge(record: CrmRequirement) {
  return compactStateMerge({
    crmRequirements: [record],
    customers: recordsByIds(state.customers, [record.customerId]),
    logs: state.logs.slice(0, 1),
  });
}

function crmQuoteMerge(record: CrmQuote | null) {
  if (!record) return compactStateMerge({ logs: state.logs.slice(0, 1) });
  return compactStateMerge({
    crmQuotes: [record],
    customers: recordsByIds(state.customers, [record.customerId]),
    logs: state.logs.slice(0, 1),
  });
}

function customerRecordMerge(customer: { id: string; name: string } | null) {
  if (!customer) return compactStateMerge({ logs: state.logs.slice(0, 1) });
  const legacyNameIsUnique = state.customers.filter((item) => item.name.trim() === customer.name.trim()).length === 1;
  return compactStateMerge({
    customers: recordsByIds(state.customers, [customer.id]),
    crmFollowUps: state.crmFollowUps.filter((item) => item.customerId === customer.id),
    crmRequirements: state.crmRequirements.filter((item) => item.customerId === customer.id),
    salesInvoices: state.salesInvoices.filter((invoice) => invoice.customerId === customer.id),
    purchaseInvoices: state.purchaseInvoices.filter((invoice) => invoice.sourcePartnerId === customer.id && (invoice.sourcePartnerType || "customer") === "customer"),
    inventory: legacyNameIsUnique ? state.inventory.filter((card) => card.supplierName === customer.name || card.buyerName === customer.name) : [],
    paymentInRecords: state.paymentInRecords.filter((item) => item.customerId === customer.id),
    paymentOutRecords: state.paymentOutRecords.filter((item) => item.customerId === customer.id),
    settlementLedger: legacyNameIsUnique ? state.settlementLedger.filter((item) => item.customerName === customer.name) : [],
    financeLedger: legacyNameIsUnique ? state.financeLedger.filter((item) => item.customerName === customer.name) : [],
    aftersales: state.aftersales.filter((item) => item.customerId === customer.id),
    logs: state.logs.slice(0, 1),
  });
}

function vendorRecordMerge(vendor: { id: string; name: string } | null) {
  if (!vendor) return compactStateMerge({ logs: state.logs.slice(0, 1) });
  const legacyNameIsUnique = state.vendors.filter((item) => item.name.trim() === vendor.name.trim()).length === 1;
  return compactStateMerge({
    vendors: recordsByIds(state.vendors, [vendor.id]),
    purchaseInvoices: state.purchaseInvoices.filter((invoice) => invoice.sourcePartnerId === vendor.id && (invoice.sourcePartnerType || "vendor") === "vendor"),
    salesInvoices: state.salesInvoices.filter((invoice) => invoice.customerId === vendor.id && invoice.customerPartnerType === "vendor"),
    inventory: legacyNameIsUnique ? state.inventory.filter((card) => card.supplierName === vendor.name) : [],
    paymentOutRecords: state.paymentOutRecords.filter((item) => item.supplierId === vendor.id),
    settlementLedger: legacyNameIsUnique ? state.settlementLedger.filter((item) => item.supplierName === vendor.name) : [],
    logs: state.logs.slice(0, 1),
  });
}

function recordsByIds<T extends { id: string }>(items: T[], ids: Iterable<string | undefined>) {
  const idSet = new Set(Array.from(ids).filter(Boolean));
  if (!idSet.size) return [];
  return items.filter((item) => idSet.has(item.id));
}

function recordsByIdOrLegacyName<T extends { id: string; name: string }>(items: T[], id?: string, name?: string) {
  if (id) return items.filter((item) => item.id === id);
  const legacyName = name?.trim();
  if (!legacyName) return [];
  return items.filter((item) => item.name.trim() === legacyName);
}

function relatedProductsForInventory(inventory: CardInventory[]) {
  return recordsByIds(state.products, inventory.map((item) => item.productId));
}

function financeRowsByIdsOrDocNo(ids: Iterable<string | undefined>, docNos: Iterable<string | undefined>) {
  const idSet = new Set(Array.from(ids).filter(Boolean));
  const docNoSet = new Set(Array.from(docNos).filter(Boolean));
  return state.financeLedger.filter((item) =>
    idSet.has(item.id) || (item.relatedId ? docNoSet.has(item.relatedId) : false)
  );
}

function settlementRowsByIdsOrDocNo(ids: Iterable<string | undefined>, docNos: Iterable<string | undefined>) {
  const idSet = new Set(Array.from(ids).filter(Boolean));
  const docNoSet = new Set(Array.from(docNos).filter(Boolean));
  return state.settlementLedger.filter((item) =>
    idSet.has(item.id) || (item.relatedDocNo ? docNoSet.has(item.relatedDocNo) : false)
  );
}

function paymentInMerge(record: PaymentInRecord) {
  const relatedDocNos = new Set([record.id, record.relatedDocNo].filter(Boolean));
  const settlementLedger = settlementRowsByIdsOrDocNo([record.settlementLedgerId], relatedDocNos);
  const financeLedger = financeRowsByIdsOrDocNo([record.financeLedgerId], relatedDocNos);
  const accountIds = new Set([
    record.accountId,
    ...settlementLedger.map((item) => item.accountId),
    ...financeLedger.map((item) => item.settlementAccountId),
  ].filter(Boolean));

  return compactStateMerge({
    paymentInRecords: [record],
    settlementAccounts: state.settlementAccounts.filter((item) => accountIds.has(item.id)),
    settlementLedger,
    financeLedger,
    salesInvoices: state.salesInvoices.filter((item) => item.id === record.relatedDocNo || item.invoiceNo === record.relatedDocNo),
    customers: recordsByIdOrLegacyName(state.customers, record.customerId, record.customerName),
    vendors: recordsByIdOrLegacyName(state.vendors, record.supplierId, record.supplierName),
    logs: state.logs.slice(0, 1),
  });
}

function paymentOutMerge(record: PaymentOutRecord) {
  const relatedDocNos = new Set([record.id, record.relatedDocNo].filter(Boolean));
  const settlementLedger = settlementRowsByIdsOrDocNo([record.settlementLedgerId], relatedDocNos);
  const financeLedger = financeRowsByIdsOrDocNo([record.financeLedgerId], relatedDocNos);
  const accountIds = new Set([
    record.accountId,
    ...settlementLedger.map((item) => item.accountId),
    ...financeLedger.map((item) => item.settlementAccountId),
  ].filter(Boolean));

  return compactStateMerge({
    paymentOutRecords: [record],
    settlementAccounts: state.settlementAccounts.filter((item) => accountIds.has(item.id)),
    settlementLedger,
    financeLedger,
    purchaseInvoices: state.purchaseInvoices.filter((item) => item.id === record.relatedDocNo || item.invoiceNo === record.relatedDocNo),
    vendors: recordsByIdOrLegacyName(state.vendors, record.supplierId, record.supplierName),
    customers: recordsByIdOrLegacyName(state.customers, record.customerId, record.customerName),
    logs: state.logs.slice(0, 1),
  });
}

function accountTransferMerge(record: AccountTransferRecord) {
  return compactStateMerge({
    accountTransfers: [record],
    settlementAccounts: recordsByIds(state.settlementAccounts, [record.fromAccountId, record.toAccountId]),
    settlementLedger: state.settlementLedger.filter((item) => item.relatedDocNo === record.id),
    financeLedger: state.financeLedger.filter((item) => item.relatedId === record.id),
    logs: state.logs.slice(0, 1),
  });
}

function inspectionMerge(record: InspectionRecord) {
  const inventory = recordsByIds(state.inventory, [record.inventoryId]);
  return compactStateMerge({
    inspections: [record],
    inventory,
    products: relatedProductsForInventory(inventory),
    logs: state.logs.slice(0, 1),
  });
}

function assemblyOperationMerge(record: AssemblyOperationRecord) {
  const relatedSn = new Set([
    record.beforeSn,
    record.afterSn,
    ...record.beforeParts.map((part) => part.sn),
    ...record.afterParts.map((part) => part.sn),
  ].filter(Boolean).map((sn) => String(sn).toLowerCase()));
  const inventory = state.inventory.filter((item) =>
    relatedSn.has(item.sn.toLowerCase()) || isInventoryLinkedToAssembly(item, record.id)
  );

  return compactStateMerge({
    assemblyOperations: [record],
    inventory,
    products: relatedProductsForInventory(inventory),
    logs: state.logs.slice(0, 1),
  });
}

function marketQuotesMerge(records: MarketQuote[]) {
  if (records.length === 0) return compactStateMerge({ logs: state.logs.slice(0, 1) });
  const productIds = new Set(records.map((record) => record.productId).filter(Boolean));
  const inventory = state.inventory.filter((item) => productIds.has(item.productId));
  return compactStateMerge({
    marketQuotes: records,
    inventory,
    products: recordsByIds(state.products, Array.from(productIds)),
    logs: state.logs.slice(0, 1),
  });
}

function marketQuoteMerge(record: MarketQuote | null) {
  return marketQuotesMerge(record ? [record] : []);
}

function productPriceSyncMerge(productId: string) {
  const inventory = state.inventory.filter((item) => item.productId === productId);
  return compactStateMerge({
    products: recordsByIds(state.products, [productId]),
    inventory,
    marketQuotes: state.marketQuotes.filter((quote) => quote.productId === productId),
    logs: state.logs.slice(0, 1),
  });
}

function returnOrderMerge(record: { id: string; returnNo: string; relatedDocNo: string; sourceInventoryId?: string; items?: Array<{sourceInventoryId?: string}>; partyId?: string; partyType?: string; partyName?: string; paymentRecordId?: string; settlementAccountId?: string } | null) {
  if (!record) return compactStateMerge({ logs: state.logs.slice(0, 1) });
  const relatedDocNos = new Set([record.id, record.returnNo, record.relatedDocNo].filter(Boolean));
  const inventoryIds = [record.sourceInventoryId, ...(record.items || []).map((item) => item.sourceInventoryId)].filter((id): id is string => Boolean(id));
  const paymentInRecords = state.paymentInRecords.filter((item) => item.relatedDocNo && relatedDocNos.has(item.relatedDocNo));
  const paymentOutRecords = state.paymentOutRecords.filter((item) => item.relatedDocNo && relatedDocNos.has(item.relatedDocNo));
  const settlementLedgerIds = new Set([...paymentInRecords, ...paymentOutRecords].map((item) => item.settlementLedgerId).filter(Boolean));
  const financeLedgerIds = new Set([...paymentInRecords, ...paymentOutRecords].map((item) => item.financeLedgerId).filter(Boolean));
  const accountIds = new Set([...paymentInRecords, ...paymentOutRecords].map((item) => item.accountId).filter(Boolean));
  if (record.settlementAccountId) accountIds.add(record.settlementAccountId);
  return compactStateMerge({
    returnOrders: state.returnOrders.filter((item) => item.id === record.id || item.returnNo === record.returnNo),
    inventory: recordsByIds(state.inventory, inventoryIds),
    salesInvoices: state.salesInvoices.filter((item) => relatedDocNos.has(item.id) || relatedDocNos.has(item.invoiceNo)),
    purchaseInvoices: state.purchaseInvoices.filter((item) => relatedDocNos.has(item.id) || relatedDocNos.has(item.invoiceNo)),
    purchaseCommissions: state.purchaseCommissions.filter((item) => relatedDocNos.has(item.salesInvoiceNo) || relatedDocNos.has(item.purchaseInvoiceNo || "")),
    // Legacy return orders may not have a party ID. Persist their name-matched partner as well;
    // otherwise a valid balance update is lost when the process reloads from PostgreSQL.
    customers: record.partyType !== "vendor" ? recordsByIdOrLegacyName(state.customers, record.partyId, record.partyName) : [],
    vendors: record.partyType === "vendor" ? recordsByIdOrLegacyName(state.vendors, record.partyId, record.partyName) : [],
    settlementAccounts: recordsByIds(state.settlementAccounts, accountIds),
    // A refund/void rebuilds the running balance of every later row in the account.
    // Persist the full affected account chain instead of only the new refund row.
    settlementLedger: state.settlementLedger.filter((item) => accountIds.has(item.accountId) || settlementLedgerIds.has(item.id) || (item.relatedDocNo ? relatedDocNos.has(item.relatedDocNo) : false)),
    financeLedger: state.financeLedger.filter((item) => financeLedgerIds.has(item.id) || (item.relatedId ? relatedDocNos.has(item.relatedId) : false)),
    paymentInRecords,
    paymentOutRecords,
    logs: state.logs.slice(0, 1),
  });
}

function aftersalesMerge(record: { id: string; sn: string; customerId?: string; salesInvoiceNo?: string } | null) {
  if (!record) return compactStateMerge({ logs: state.logs.slice(0, 1) });
  return compactStateMerge({
    aftersales: state.aftersales.filter((item) => item.id === record.id),
    inventory: state.inventory.filter((item) => item.sn === record.sn),
    salesInvoices: state.salesInvoices.filter((item) => item.id === record.salesInvoiceNo || item.invoiceNo === record.salesInvoiceNo),
    customers: recordsByIds(state.customers, [record.customerId]),
    logs: state.logs.slice(0, 1),
  });
}

function sanitizeInventoryRowsForUser(inventory: CardInventory[], user?: SystemUserAccount) {
  const permissions = getPermissionsForUser(user);
  const currentInventory = inventory.map((item) => ({
    ...item,
    storageDays: storeDateDiffDays(item.entryTime),
    actualProfit: permissions.showCost && permissions.showProfit && item.salesPrice !== undefined
      ? Number((item.salesPrice - item.costPrice).toFixed(2))
      : undefined,
  }));
  return permissions.showCost ? currentInventory : currentInventory.map((item) => ({ ...item, costPrice: 0 }));
}

function productTemplateMerge(req: AuthRequest, products: ProductTemplate | ProductTemplate[] | null) {
  const changedProducts = Array.isArray(products) ? products : products ? [products] : [];
  const productIds = new Set(changedProducts.map((product) => product.id).filter(Boolean));
  const inventory = productIds.size ? state.inventory.filter((item) => productIds.has(item.productId)) : [];
  return compactStateMerge({
    products: changedProducts,
    inventory: sanitizeInventoryRowsForUser(inventory, req.authUser),
    marketQuotes: productIds.size ? state.marketQuotes.filter((quote) => quote.productId && productIds.has(quote.productId)) : [],
    logs: state.logs.slice(0, 1),
  });
}

async function persistProductImages(req: AuthRequest, product: ProductTemplate) {
  const urls = await persistEntityImages(req, "product", product.id, "product-image", "imageUrls");
  if (urls) product.imageUrls = urls;
  return product;
}

function hasImagePayload(req: AuthRequest) {
  return Object.prototype.hasOwnProperty.call(req.body || {}, "images") ||
    Object.prototype.hasOwnProperty.call(req.body || {}, "imageUrls");
}

async function persistEntityImages(
  req: AuthRequest,
  entityType: string,
  entityId: string,
  relationRole: string,
  preferredField: "images" | "imageUrls" = "images",
) {
  if (!hasImagePayload(req)) return undefined;
  const body = req.body || {};
  const rawValues = Object.prototype.hasOwnProperty.call(body, preferredField)
    ? body[preferredField]
    : preferredField === "images" ? body.imageUrls : body.images;
  const values = Array.isArray(rawValues) ? rawValues : [];
  return replaceEntityImages({
    tenantId: (req as AuthRequest).tenantId,
    entityType,
    entityId,
    relationRole,
    values,
    createdBy: crmActor(req),
  });
}

function withoutImagePayload(body: unknown) {
  if (!body || typeof body !== "object" || Array.isArray(body)) return body;
  const clean = { ...(body as Record<string, unknown>) };
  delete clean.images;
  delete clean.imageUrls;
  return clean;
}

function inventoryRecordsMerge(inventory: CardInventory[]) {
  return compactStateMerge({
    inventory,
    products: relatedProductsForInventory(inventory),
    salesInvoices: state.salesInvoices.filter((invoice) =>
      invoice.items.some((item) => inventory.some((card) => card.id === item.inventoryId))
    ),
    purchaseCommissions: state.purchaseCommissions.filter((item) => inventory.some((card) => card.id === item.inventoryId)),
    logs: state.logs.slice(0, 1),
  });
}

function scanFlowMerge(result: { results: InventoryScanResult[] }, salesInvoiceId?: string) {
  const inventoryIds = new Set(result.results.map((item) => item.inventoryId).filter(Boolean));
  const inventory = state.inventory.filter((item) => inventoryIds.has(item.id));
  const relatedSalesInvoiceIds = new Set([
    salesInvoiceId,
    ...inventory.map((item) => item.salesInvoiceId),
  ].filter(Boolean));
  return compactStateMerge({
    inventory,
    products: relatedProductsForInventory(inventory),
    salesInvoices: state.salesInvoices.filter((item) => relatedSalesInvoiceIds.has(item.id) || relatedSalesInvoiceIds.has(item.invoiceNo)),
    purchaseCommissions: state.purchaseCommissions.filter((item) => inventoryIds.has(item.inventoryId)),
    logs: state.logs.slice(0, 1),
  });
}

function productLibraryStateData<T>(result: T) {
  const statePatch = {
    productsLoaded: true,
    products: state.products,
    inventory: state.inventory,
    marketQuotes: state.marketQuotes,
  };
  if (result && typeof result === "object" && !Array.isArray(result)) {
    return { ...result, ...statePatch };
  }
  return { result, ...statePatch };
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
    const invoke = () => Promise.resolve(handler(req, res, next));
    const operation = requiresStateSerialization(req.method, req.originalUrl)
      ? withStateMutation(req as AuthRequest, res, invoke)
      : invoke();
    operation.catch((error) => {
      if (isMutationAbortedError(error) && (req.destroyed || res.destroyed || res.writableEnded)) return;
      next(error);
    });
  };
}

function authMutationRoute(handler: express.RequestHandler): express.RequestHandler {
  return (req, res, next) => {
    const operation = withAuthMutation(req as AuthRequest, res, () => handler(req, res, next));
    operation.catch((error) => {
      if (isMutationAbortedError(error) && (req.destroyed || res.destroyed || res.writableEnded)) return;
      next(error);
    });
  };
}

function mutationRoute(handler: express.RequestHandler): express.RequestHandler {
  return (req, res, next) => {
    void withStateMutation(req as AuthRequest, res, () => handler(req, res, next)).catch((error) => {
      if (isMutationAbortedError(error) && (req.destroyed || res.destroyed || res.writableEnded)) return;
      next(error);
    });
  };
}

const requireOpenApiToken = createRequireOpenApiToken(OPEN_API_TOKEN, { onDenied: logSecurityDenial });

function openInventoryItem(card: AppState["inventory"][number]) {
  return {
    id: card.id,
    productId: card.productId,
    productName: card.productName,
    category: card.category || "显卡",
    model: card.model,
    brand: card.brand,
    version: card.version,
    vram: card.vram,
    sn: card.sn,
    expressNo: card.expressNo,
    sourceType: card.sourceType,
    supplierName: card.supplierName,
    costPrice: card.costPrice,
    estSellPrice: card.estSellPrice,
    marketPrice: card.marketPrice,
    priceSource: card.priceSource,
    priceUpdatedAt: card.priceUpdatedAt,
    status: card.status,
    condition: card.condition,
    inWarranty: card.inWarranty,
    warrantyDate: card.warrantyDate,
    repaired: card.repaired,
    gpuRisk: card.gpuRisk,
    fullBox: card.fullBox,
    warehouseLocation: card.warehouseLocation,
    entryTime: card.entryTime,
    storageDays: storeDateDiffDays(card.entryTime),
    remarks: card.remarks,
    salesPrice: card.salesPrice,
    salesTime: card.salesTime,
    salesInvoiceId: card.salesInvoiceId,
    buyerName: card.buyerName,
  };
}


async function applyAuthenticatedUser(userId: string, session?: { tenantId?: string; storeId?: string }) {
  const tenantId = session?.tenantId || DEFAULT_TENANT_ID;
  // Always resolve the account inside the session tenant first. Falling back to
  // the process snapshot is only a compatibility path for legacy in-memory
  // tests; it must never allow a default-tenant row to authorize another tenant.
  const persisted = await findSystemUserById(userId, tenantId)
    || (tenantId === DEFAULT_TENANT_ID ? state.systemUsers.find((item) => item.id === userId) : undefined);
  if (!persisted?.enabled) return null;
  const membership = await findActiveTenantMembership(userId, tenantId, session?.storeId);
  if (!membership) return null;
  const membershipRole = ["老板", "店员", "检测员", "财务"].includes(membership.role)
    ? membership.role as SystemUserAccount["role"]
    : persisted.role;
  return {
    ...persisted,
    role: membershipRole,
    permissionOverrides: membership.permissions && Object.keys(membership.permissions).length
      ? { ...(persisted.permissionOverrides || {}), ...membership.permissions } as SystemUserAccount["permissionOverrides"]
      : persisted.permissionOverrides,
    tenantId,
    storeId: membership.storeId,
    membershipStatus: "active" as const,
  };
}

const requireAuth = createRequireAuth(sessions, applyAuthenticatedUser, { onDenied: logSecurityDenial });

function requireAuthenticatedUser(req: AuthRequest, res: express.Response): req is AuthRequest & { authUser: SystemUserAccount } {
  if (req.authUser) return true;
  sendApiError(req, res, 401, "UNAUTHORIZED", "请先登录系统", true);
  return false;
}

function requireBoss(req: AuthRequest, res: express.Response, next: express.NextFunction) {
  if (!requireAuthenticatedUser(req, res)) return;
  if (req.authUser?.role !== "老板") {
    sendApiError(req, res, 403, "FORBIDDEN", "仅老板账号可执行该操作", true);
    return;
  }
  next();
}

function requireDeletePermission(req: AuthRequest, res: express.Response, next: express.NextFunction) {
  if (!requireAuthenticatedUser(req, res)) return;
  if (!getPermissionsForUser(req.authUser).canDelete) {
    sendApiError(req, res, 403, "FORBIDDEN", "当前账号没有删除权限", true);
    return;
  }
  next();
}

function requireHistoryEditPermission(req: AuthRequest, res: express.Response, next: express.NextFunction) {
  if (!requireAuthenticatedUser(req, res)) return;
  const permissions = getPermissionsForUser(req.authUser);
  if (req.authUser?.role !== "老板" && !permissions.canEditHistory) {
    sendApiError(req, res, 403, "FORBIDDEN", "当前账号没有历史单据编辑权限", true);
    return;
  }
  next();
}

function requireManualOutboundPermission(req: AuthRequest, res: express.Response, next: express.NextFunction) {
  if (!requireAuthenticatedUser(req, res)) return;
  if (req.body?.manual && req.authUser?.role !== "老板" && !getPermissionsForUser(req.authUser).canManualOutbound) {
    sendApiError(req, res, 403, "FORBIDDEN", "当前账号没有手动确认出库权限，请使用扫码出库或联系管理员授权", true);
    return;
  }
  next();
}

function requireMenu(menuId: string): express.RequestHandler {
  return (req: AuthRequest, res, next) => {
    if (!requireAuthenticatedUser(req, res)) return;
    const permissions = getPermissionsForUser(req.authUser);
    if (!permissions.allowedMenus.includes("all") && !permissions.allowedMenus.includes(menuId)) {
      sendApiError(req, res, 403, "FORBIDDEN", "当前账号没有该窗口入口权限", true);
      return;
    }
    next();
  };
}

function crmActor(req: AuthRequest) {
  return req.authUser?.displayName || req.authUser?.username || req.authUser?.role || "系统";
}

function requireAnyMenu(menuIds: string[]): express.RequestHandler {
  return (req: AuthRequest, res, next) => {
    if (!requireAuthenticatedUser(req, res)) return;
    const permissions = getPermissionsForUser(req.authUser);
    if (permissions.allowedMenus.includes("all") || menuIds.some((menuId) => permissions.allowedMenus.includes(menuId))) {
      next();
      return;
    }
    sendApiError(req, res, 403, "FORBIDDEN", "当前账号没有该窗口入口权限", true);
  };
}

const returnMenuIds = ["return_sales", "return_purchase", "return_orders"] as const;

function canAccessReturnType(req: AuthRequest, type: string) {
  const permissions = getPermissionsForUser(req.authUser);
  if (permissions.allowedMenus.includes("all") || permissions.allowedMenus.includes("return_orders")) return true;
  return type === "销售退货"
    ? permissions.allowedMenus.includes("return_sales")
    : permissions.allowedMenus.includes("return_purchase");
}

function requireReturnTypeFromRecord(req: AuthRequest, res: express.Response, next: express.NextFunction) {
  if (!requireAuthenticatedUser(req, res)) return;
  const order = state.returnOrders.find((item) => item.id === req.params.id || item.returnNo === req.params.id);
  if (!order) {
    sendApiError(req, res, 404, "NOT_FOUND", "退货单不存在");
    return;
  }
  if (!canAccessReturnType(req, order.type)) {
    sendApiError(req, res, 403, "FORBIDDEN", "当前账号没有该退货单的操作权限", true);
    return;
  }
  next();
}

registerPagedRecordRoutes(app, {requireMenu, requireAnyMenu, permissionsForRequest: (req) => getScopedPermissions(state, (req as AuthRequest).authUser)});
registerMasterDataRoutes(app, {requireMenu, requireAnyMenu, permissionsForRequest: (req) => getPermissionsForUser((req as AuthRequest).authUser)});
registerPurchaseReadRoutes(app, {requireMenu, requireAnyMenu, permissionsForRequest: (req) => getPermissionsForUser((req as AuthRequest).authUser), getStoreDate: storeDate});
registerOperationalReadRoutes(app, {requireMenu, requireAnyMenu, permissionsForRequest: (req) => getPermissionsForUser((req as AuthRequest).authUser)});

registerSystemRoutes(app, {
  dataFilePath,
  ensureReady: ensureStateReady,
  getRevision: () => stateRevision,
  logRequestError,
  sendServiceUnavailable: (req, res, message) => sendApiError(req, res, 503, "SERVICE_NOT_READY", message),
  requireBoss,
  getMetricsSnapshot: requestMetrics.snapshot,
});

registerFinanceClosingRoutes(app, {
  requireMenu,
  asyncRoute,
  sendValidationError: (req, res, message) => sendApiError(req, res, 400, "VALIDATION_ERROR", message),
});
registerFinanceCommissionRoutes(app, {
  requireBoss,
  requireAnyMenu,
  asyncRoute,
  actions: (req) => actions(req as AuthRequest),
  persist: (req, result) => persistRequest(req as AuthRequest, result),
  permissionsForRequest: (req) => getPermissionsForUser((req as AuthRequest).authUser),
});
registerCommercialRoutes(app, {
  requireBoss,
  requireAnyMenu,
  asyncRoute,
  createSession: (userId, scope) => sessions.create(userId, scope),
  revokeSession: (token) => sessions.revoke(token),
  setSessionCookie,
  createCsrfToken,
});

app.post("/api/auth/login", loginRateLimiter, authMutationRoute(async (req, res) => {
  try {
	    // Login only needs a current account record. Loading every order, log and ledger row here
	    // made a normal sign-in slower as the audit trail grew.
    replaceCurrentState(await loadStateCollections(state, ["systemUsers"]));
	    const user = actions(req).login(req.body);
    const token = await sessions.create(user.id, { tenantId: user.tenantId || DEFAULT_TENANT_ID, storeId: user.storeId || DEFAULT_STORE_ID });
	    setSessionCookie(res, token);
	    const savedUser = state.systemUsers.find((item) => item.id === user.id);
	    await saveStateRecords([
	      ...(savedUser ? [{ key: "systemUsers" as const, items: [savedUser] }] : []),
	      { key: "logs", items: state.logs.slice(0, 1) },
	    ]);
    res.json({
      ...ok({ user, csrfToken: createCsrfToken(token) }, savedUser, "initial"),
      meta: { stateMode: "initial", stateRevision: await getStateRevision() },
    });
  } catch (error) {
    const domainError = toDomainError(error);
    if (domainError.status === 401 || domainError.code === "VALIDATION_ERROR") {
      sendApiError(req, res, 401, "LOGIN_FAILED", "账号或密码错误", true);
      return;
    }
    await reloadStateFromDatabase().catch(() => undefined);
    throw error;
  }
}));

const openInventoryRouter = express.Router();
openInventoryRouter.use(openApiRateLimiter, requireOpenApiToken);

openInventoryRouter.get("/items", asyncRoute(async (req, res) => {
  const page = await queryInventoryPage<CardInventory>({
    tenantId: DEFAULT_TENANT_ID,
    storeId: DEFAULT_STORE_ID,
    page: Number(req.query.page || 1),
    pageSize: Number(req.query.pageSize || req.query.per_page || 20),
    keyword: String(req.query.keyword || req.query.search || ""),
    status: String(req.query.status || ""),
    category: String(req.query.category || ""),
    warehouseLocation: String(req.query.warehouseLocation || ""),
    includeSold: String(req.query.includeSold || "") === "true",
    sortKey: String(req.query.sortKey || ""),
    sortDirection: req.query.sortDirection === "asc" ? "asc" : "desc",
  });
  res.json({ data: page.data.map(openInventoryItem), meta: page.meta });
}));

openInventoryRouter.get("/items/:id", asyncRoute(async (req, res) => {
  const card = await findInventoryRecord<CardInventory>(req.params.id!, DEFAULT_TENANT_ID, DEFAULT_STORE_ID);
  if (!card) {
    sendApiError(req, res, 404, "INVENTORY_NOT_FOUND", "库存档案不存在");
    return;
  }
  res.json({ data: openInventoryItem(card) });
}));

openInventoryRouter.get("/by-sn/:sn", asyncRoute(async (req, res) => {
  const card = await findInventoryRecordBySn<CardInventory>(req.params.sn!.trim(), DEFAULT_TENANT_ID, DEFAULT_STORE_ID);
  if (!card) {
    sendApiError(req, res, 404, "INVENTORY_SN_NOT_FOUND", "未找到该 SN 对应库存");
    return;
  }
  res.json({ data: openInventoryItem(card) });
}));

openInventoryRouter.get("/summary", asyncRoute(async (req, res) => {
  replaceCurrentState(await loadStateCollections(state, ["inventory"]));
  const rows = actions(undefined, { role: "财务", actor: "OpenAPI" }).getInventorySummary(req.query as Record<string, string>);
  res.json(paginated(rows, req));
}));

openInventoryRouter.post("/scan-in", asyncRoute(async (req, res) => {
  replaceCurrentState(await loadStateCollections(state, ["inventory", "products", "salesInvoices", "logs"]));
  const result = actions(undefined, { role: "财务", actor: "OpenAPI" }).scanInventoryFlow({
    ...req.body,
    mode: "入库",
    handler: req.body?.handler || "OpenAPI",
  });
  const stateMerge = scanFlowMerge(result);
  await saveStateRecords(stateMergeRecords(stateMerge));
  res.json({ data: result });
}));

openInventoryRouter.post("/scan-out", asyncRoute(async (req, res) => {
  replaceCurrentState(await loadStateCollections(state, ["inventory", "products", "salesInvoices", "logs"]));
  const result = actions(undefined, { role: "财务", actor: "OpenAPI" }).scanInventoryFlow({
    ...req.body,
    mode: "出库",
    handler: req.body?.handler || "OpenAPI",
  });
  const stateMerge = scanFlowMerge(result, req.body?.salesInvoiceId);
  await saveStateRecords(stateMergeRecords(stateMerge));
  res.json({ data: result });
}));

openInventoryRouter.post("/relocate", asyncRoute(async (req, res) => {
  replaceCurrentState(await loadStateCollections(state, ["inventory", "products", "salesInvoices", "logs"]));
  const result = actions(undefined, { role: "财务", actor: "OpenAPI" }).scanInventoryFlow({
    ...req.body,
    mode: "移库",
    handler: req.body?.handler || "OpenAPI",
  });
  const stateMerge = scanFlowMerge(result);
  await saveStateRecords(stateMergeRecords(stateMerge));
  res.json({ data: result });
}));

app.use("/api/open/inventory", openInventoryRouter);

const openPricesRouter = express.Router();
openPricesRouter.use(openApiRateLimiter, requireOpenApiToken);

openPricesRouter.post("/sync-est-sell", asyncRoute(async (req, res) => {
  replaceCurrentState(await loadStateCollections(state, ["products", "inventory", "marketQuotes", "logs"]));
  const body = req.body || {};
  const result = actions(undefined, { role: "财务", actor: "OpenAPI" }).syncEstimatedSellPrice({
    productId: String(body.productId || ""),
    estSellPrice: Number(body.estSellPrice ?? body.suggestSellPrice ?? body.refSellPrice ?? body.todaySellPrice),
    priceSource: body.priceSource || body.source,
    remarks: body.remarks,
  });
  const stateMerge = productPriceSyncMerge(result.productId);
  await saveStateRecords(stateMergeRecords(stateMerge));
  res.json({ data: result });
}));

openPricesRouter.get("/market-quotes", asyncRoute(async (req, res) => {
  replaceCurrentState(await loadStateCollections(state, ["marketQuotes"]));
  const keyword = String(req.query.q || req.query.search || "").trim();
  const brand = normalizeSearchText(req.query.brand);
  const rows = state.marketQuotes
    .filter((quote) => {
      const matchSearch = matchesKeyword([quote.model, quote.productName, quote.brand], keyword);
      const matchesBrand = !brand || normalizeSearchText(quote.brand) === brand;
      return matchSearch && matchesBrand;
    })
    .sort((a, b) => String(b.updateTime || b.date || "").localeCompare(String(a.updateTime || a.date || "")))
    .map((quote) => ({
      id: quote.id,
      productId: quote.productId,
      productName: quote.productName,
      model: quote.model,
      brand: quote.brand,
      refBuyPrice: quote.refBuyPrice ?? quote.todayBuyPrice ?? quote.yestBuyPrice ?? 0,
      refSellPrice: quote.refSellPrice ?? quote.todaySellPrice ?? quote.maxPrice ?? 0,
      trend: quote.trend,
      changeAmount: quote.changeAmount,
      fluctuation: quote.fluctuation || quote.remarks,
      updateTime: quote.updateTime || quote.date,
      history: quote.history || [],
    }));
  res.json(paginated(rows, req));
}));

app.use("/api/open/prices", openPricesRouter);

// Background clients poll this lightweight revision endpoint first. Keeping it ahead of the
// state-reload middleware avoids deserializing every business collection when nothing changed.
registerStateRevisionRoute(app, {
  asyncRoute,
  getRevision: getStateRevision,
  getPublicState: (req, mode) => publicState(req as AuthRequest, mode),
  getCurrentUser: (req) => actions(req as AuthRequest).getCurrentUser(),
  createCsrfToken,
});

app.use((req: AuthRequest, res, next) => {
  void (async () => {
    if (requiresStateSerialization(req.method, req.originalUrl)) {
      next();
      return;
    }
    if (!shouldReloadStateFromDatabase(req.method, req.path)) {
      next();
      return;
    }
    const databaseRevision = await getStateRevision();
    if (databaseRevision !== stateRevision || req.method.toUpperCase() !== "GET") {
      await reloadRequestStateFromDatabase(req);
    }
    if (req.authUser) {
      const freshUser = await applyAuthenticatedUser(req.authUser.id, { tenantId: req.tenantId });
      if (!freshUser) {
        await sessions.revoke(req.authToken);
        sendApiError(req, res, 401, "UNAUTHORIZED", "账号已停用或不存在", true);
        return;
      }
      req.authUser = freshUser;
    }
    next();
  })().catch(next);
});

app.use((req: AuthRequest, res, next) => {
  const sendJson = res.json.bind(res);
  res.json = ((payload: unknown) => {
    if (req.authUser && shouldAttachFreshStateToResponse(req.method, req.path, payload)) {
      const patchKeys = getStatePatchKeysForRequest(req.method, req.path);
      return sendJson({
        ...(payload as Record<string, unknown>),
        state: patchKeys?.length ? publicStatePatch(req, patchKeys) : publicState(req),
      });
    }
    return sendJson(payload);
  }) as typeof res.json;
  next();
});

registerInventoryJourneyRoutes(app, {
  requireMenu,
  getState: () => state,
  permissionsForRequest: (req) => getScopedPermissions(state, (req as AuthRequest).authUser),
});
registerSalesProductCandidateRoutes(app, {requireMenu, getInventorySummary: (req, query) => actions(req as AuthRequest).getInventorySummary(query), permissionsForRequest: (req) => getPermissionsForUser((req as AuthRequest).authUser), storeDateDiffDays});
registerSalesCustomerRoutes(app, {requireMenu});
registerSalesOutboundRoutes(app, {requireMenu});
registerCustomerDirectoryRoutes(app, {requireMenu, permissionsForRequest: (req) => getPermissionsForUser((req as AuthRequest).authUser)});
registerProductLedgerRoutes(app, {
  requireMenu,
  getState: () => state,
  permissionsForRequest: (req) => getPermissionsForUser((req as AuthRequest).authUser),
  ok,
});
registerStateRoutes(app, {
  asyncRoute,
  getRevision: () => stateRevision,
  getPublicState: (req, mode) => publicState(req as AuthRequest, mode),
  getCurrentUser: (req) => actions(req as AuthRequest).getCurrentUser(),
  createCsrfToken,
});
registerMarketQuoteRoutes(app, {
  requireMenu,
  getState: () => state,
});

// AI only receives a compact, anonymized business snapshot. The endpoint remains read-only:
// suggestions may route a user to work, but never alter a price, order, inventory or ledger.
app.get("/api/ai/insights", requireAnyMenu(["dashboard", "ai_insights"]), asyncRoute(async (_req: AuthRequest, res) => {
  await reloadStateFromDatabase();
  res.json({ data: await getDashboardAiInsights(state) });
}));

app.post("/api/ai/insights/refresh", requireBoss, requireAnyMenu(["dashboard", "ai_insights"]), asyncRoute(async (_req: AuthRequest, res) => {
  await reloadStateFromDatabase();
  res.json({ data: await getDashboardAiInsights(state, { force: true }) });
}));

const copilotMenuIds = ["dashboard", "ai_insights", "inventory", "customers", "vendors", "finance", "purchase_add", "sales_add", "quotes"];

// OneERP Copilot uses a small SSE contract instead of exposing provider-specific stream
// formats to the browser. The server owns tool execution and can fall back to deterministic
// ERP tools when no model provider is configured.
app.post("/api/ai/copilot", requireAnyMenu(copilotMenuIds), async (req: AuthRequest, res) => {
  const rawMessages = Array.isArray(req.body?.messages) ? req.body.messages : [];
  const messages: CopilotMessage[] = rawMessages.slice(-20).map((message: unknown) => {
    const item = message && typeof message === "object" ? message as Record<string, unknown> : {};
    const role = item.role === "assistant" || item.role === "tool" ? item.role : "user";
    return { role, content: String(item.content || "").slice(0, 6000), toolName: item.toolName ? String(item.toolName).slice(0, 80) : undefined };
  }).filter((message: CopilotMessage) => message.content || message.role !== "user");
  const rawContext = req.body?.context && typeof req.body.context === "object" ? req.body.context as Record<string, unknown> : {};
  const context: CopilotContext = {
    currentTab: String(rawContext.currentTab || "dashboard").slice(0, 80),
    currentTabLabel: String(rawContext.currentTabLabel || "").slice(0, 80) || undefined,
    currentUser: String(rawContext.currentUser || "").slice(0, 80) || undefined,
    selectedInventoryId: String(rawContext.selectedInventoryId || "").slice(0, 120) || undefined,
    selectedCustomerId: String(rawContext.selectedCustomerId || "").slice(0, 120) || undefined,
    selectedDocumentNo: String(rawContext.selectedDocumentNo || "").slice(0, 120) || undefined,
    filters: rawContext.filters && typeof rawContext.filters === "object" ? Object.fromEntries(Object.entries(rawContext.filters as Record<string, unknown>).slice(0, 20).map(([key, value]) => [String(key).slice(0, 40), typeof value === "string" || typeof value === "number" || typeof value === "boolean" ? value : undefined])) : undefined,
  };
  const tenantId = req.tenantId || req.authUser?.tenantId || DEFAULT_TENANT_ID;
  if (!(await commercialFeatureEnabled(tenantId, "ai_assist"))) {
    sendApiError(req, res, 403, "FEATURE_NOT_INCLUDED", "当前套餐未包含 AI 助手能力", true);
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
    // database counter is locked transactionally, so concurrent tabs cannot
    // oversubscribe the tenant's monthly AI quota.
    await recordCommercialUsage({ tenantId, metric: "ai_tokens", quantity: estimateAiUsageUnits(messages) });
    await reloadStateFromDatabase();
    await runCopilotTurn({ messages, context }, state, emit);
  } catch (error) {
    logRequestError(req, error, "AI_COPILOT_ERROR");
    emit({ type: "error", message: "Copilot 请求失败，请稍后重试" });
  } finally {
    if (!res.writableEnded) res.end();
  }
});

app.get("/api/ai/insight-actions", requireMenu("ai_insights"), asyncRoute(async (req: AuthRequest, res) => {
  res.json({ data: await listAiInsightActions(req.tenantId) });
}));

app.put("/api/ai/insight-actions/:id", requireBoss, requireMenu("ai_insights"), asyncRoute(async (req: AuthRequest, res) => {
  const insightId = String(req.params.id || "").trim();
  const status = req.body?.status;
  if (!insightId || insightId.length > 180) {
    sendApiError(req, res, 400, "VALIDATION_ERROR", "经营建议标识不合法");
    return;
  }
  if (status === "pending") {
    await deleteAiInsightAction(insightId, req.tenantId);
    res.json({ data: { insightId, status: "pending" } });
    return;
  }
  if (status !== "done" && status !== "ignored") {
    sendApiError(req, res, 400, "VALIDATION_ERROR", "经营建议状态不合法");
    return;
  }
  res.json({ data: await saveAiInsightAction({ insightId, status, updatedBy: crmActor(req) }, req.tenantId) });
}));

app.post("/api/auth/logout", authMutationRoute(async (req: AuthRequest, res) => {
  try {
    await sessions.revoke(req.authToken);
    clearSessionCookie(res);
    const result = actions(req).logout();
    await saveStateRecords([{ key: "logs", items: state.logs.slice(0, 1) }]);
    await reloadStateFromDatabase();
    res.json(ok(result));
  } catch (error) {
    await reloadStateFromDatabase().catch(() => undefined);
    throw error;
  }
}));

app.get("/api/users", requireBoss, requireMenu("permissions"), (req: AuthRequest, res) => {
  res.json(ok(actions(req).listUsers()));
});

app.post("/api/users", requireBoss, requireMenu("permissions"), asyncRoute(async (req: AuthRequest, res) => {
  const created = actions(req).createUser(req.body);
  if (created.enabled) await assertSeatAvailable(created.tenantId || DEFAULT_TENANT_ID, created.id, created.storeId || DEFAULT_STORE_ID);
  const persisted = await persistUserWithMembership(req, created);
  res.status(201).json(ok(persisted));
}));

app.put("/api/users/:id", requireBoss, requireMenu("permissions"), asyncRoute(async (req: AuthRequest, res) => {
  const updated = actions(req).updateUser(req.params.id!, req.body);
  if (updated.enabled) await assertSeatAvailable(updated.tenantId || DEFAULT_TENANT_ID, updated.id, updated.storeId || DEFAULT_STORE_ID);
  const persisted = await persistUserWithMembership(req, updated);
  res.json(ok(persisted));
}));

// Account lifecycle operations are explicit so operators do not need to send a
// full user object just to suspend an account or rotate a credential.
app.post("/api/users/:id/deactivate", requireBoss, requireMenu("permissions"), asyncRoute(async (req: AuthRequest, res) => {
  if (req.params.id === req.authUser?.id) {
    sendApiError(req, res, 400, "SELF_DEACTIVATION", "不能停用当前登录账号");
    return;
  }
  const updated = actions(req).updateUser(req.params.id!, { enabled: false });
  const persisted = await persistUserWithMembership(req, updated);
  await sessions.revokeUserSessions?.(updated.id, updated.tenantId || DEFAULT_TENANT_ID);
  res.json(ok(persisted));
}));

app.post("/api/users/:id/reactivate", requireBoss, requireMenu("permissions"), asyncRoute(async (req: AuthRequest, res) => {
  const updated = actions(req).updateUser(req.params.id!, { enabled: true });
  await assertSeatAvailable(updated.tenantId || DEFAULT_TENANT_ID, updated.id, updated.storeId || DEFAULT_STORE_ID);
  const persisted = await persistUserWithMembership(req, updated);
  res.json(ok(persisted));
}));

app.post("/api/users/:id/reset-password", requireBoss, requireMenu("permissions"), asyncRoute(async (req: AuthRequest, res) => {
  const password = typeof req.body?.password === "string" ? req.body.password.trim() : "";
  if (password.length < 12 || password.length > 1024) {
    sendApiError(req, res, 400, "INVALID_PASSWORD", "新密码至少 12 位且不能超过 1024 位");
    return;
  }
  const updated = actions(req).updateUser(req.params.id!, { password });
  const persisted = await persistUserWithMembership(req, updated);
  await sessions.revokeUserSessions?.(updated.id, updated.tenantId || DEFAULT_TENANT_ID);
  res.json(ok(persisted));
}));

app.get("/api/gpu_erp/finance/settlement-accounts", requireMenu("settlement_accounts"), (req, res) => {
  res.json(paginated(state.settlementAccounts, req));
});

app.post("/api/gpu_erp/finance/settlement-account/create", requireMenu("settlement_accounts"), asyncRoute(async (req, res) => {
  const authRequest = req as AuthRequest;
  const idempotency = await claimMutationIdempotency(authRequest);
  if (idempotency?.replay) {
    res.status(idempotency.replay.statusCode).json(idempotency.replay.response);
    return;
  }
  try {
    const { data: created, stateMerge } = await runStateCommand(
      () => actions(authRequest).createSettlementAccount(req.body),
      (record) => ({ stateMerge: simpleRecordCreateMerge("settlementAccounts", record) }),
      undefined,
      transactionHookWithIdempotency(idempotency, 201),
    );
    res.status(201).json(okMerge(created, stateMerge));
  } catch (error) {
    await releaseMutationIdempotency(idempotency);
    throw error;
  }
}));

app.patch("/api/gpu_erp/finance/settlement-account/:id/reconcile", requireMenu("settlement_accounts"), asyncRoute(async (req: AuthRequest, res) => {
  const { data: updated, stateMerge } = await runStateCommand(
    () => actions(req).reconcileSettlementAccount(req.params.id!, req.body?.actualBalance, req.authUser?.displayName || req.authUser?.username),
    (record) => ({ stateMerge: simpleRecordCreateMerge("settlementAccounts", record) }),
  );
  res.json(okMerge(updated, stateMerge));
}));

app.delete("/api/gpu_erp/finance/settlement-account/:id", requireMenu("settlement_accounts"), requireDeletePermission, asyncRoute(async (req, res) => {
  const deleted = actions(req).deleteSettlementAccount(req.params.id!);
  const stateMerge = deleteMerge();
  const stateDelete = { settlementAccounts: deleted?.id ? [deleted.id] : [] };
  await saveStateRecords([...stateMergeRecords(stateMerge), ...stateDeleteRecords(stateDelete)]);
  res.status(deleted ? 200 : 404).json(okMerge(deleted, stateMerge, stateDelete));
}));

registerFinanceReadModelRoutes(app, {
  requireMenu,
  getStoreDate: storeDate,
  startOfMonth: (date) => startOfMonth(date),
  addDateDays: (date, days) => addDateDays(date, days),
  ok,
  sendValidationError: (req, res, message) => sendApiError(req as AuthRequest, res, 400, "VALIDATION_ERROR", message),
  permissionsForRequest: (req) => getPermissionsForUser((req as AuthRequest).authUser),
});

app.post("/api/gpu_erp/finance/payment-in/create", requireMenu("payment_in"), asyncRoute(async (req, res) => {
  const authRequest = req as AuthRequest;
  const idempotency = await claimMutationIdempotency(authRequest);
  if (idempotency?.replay) {
    res.status(idempotency.replay.statusCode).json(idempotency.replay.response);
    return;
  }
  try {
    const command = parseHttpDto(paymentInCreateDto, withoutImagePayload(req.body));
    const { data: created, stateMerge } = await runStateCommand(
      () => actions(authRequest).createPaymentIn(command),
      paymentInMerge,
      async (record) => {
        const urls = await persistEntityImages(authRequest, "payment_in", record.id, "payment-evidence");
        if (urls) record.images = urls;
      },
      transactionHookWithIdempotency(idempotency, 201),
    );
    res.status(201).json(okMerge(created, stateMerge));
  } catch (error) {
    await releaseMutationIdempotency(idempotency);
    throw error;
  }
}));

app.put("/api/gpu_erp/finance/payment-in/:id", requireMenu("payment_in"), asyncRoute(async (req, res) => {
  const command = parseHttpDto(paymentInUpdateDto, withoutImagePayload(req.body));
  const { data: updated, stateMerge } = await runStateCommand(
    () => actions(req).updatePaymentIn(req.params.id!, command),
    paymentInMerge,
    async (record) => {
      const urls = await persistEntityImages(req, "payment_in", record.id, "payment-evidence");
      if (urls) record.images = urls;
    },
  );
  res.json(okMerge(updated, stateMerge));
}));

app.delete("/api/gpu_erp/finance/payment-in/:id", requireMenu("payment_in"), requireDeletePermission, asyncRoute(async (req, res) => {
  const existing = state.paymentInRecords.find((item) => item.id === req.params.id!);
  const deleted = actions(req).deletePaymentIn(req.params.id!);
  const relatedDocNos = new Set([existing?.id, existing?.relatedDocNo, deleted?.id, deleted?.relatedDocNo].filter(Boolean));
  const stateMerge = compactStateMerge({
    settlementAccounts: recordsByIds(state.settlementAccounts, [existing?.accountId, deleted?.accountId]),
    salesInvoices: state.salesInvoices.filter((item) => relatedDocNos.has(item.id) || relatedDocNos.has(item.invoiceNo)),
    customers: state.customers.filter((item) => item.id === existing?.customerId || item.id === deleted?.customerId),
    logs: state.logs.slice(0, 1),
  });
  const stateDelete = {
    paymentInRecords: deleted?.id ? [deleted.id] : [],
    settlementLedger: [existing?.settlementLedgerId, deleted?.settlementLedgerId].filter(Boolean) as string[],
    financeLedger: [existing?.financeLedgerId, deleted?.financeLedgerId].filter(Boolean) as string[],
  };
  await saveStateRecords([...stateMergeRecords(stateMerge), ...stateDeleteRecords(stateDelete)]);
  res.status(deleted ? 200 : 404).json(okMerge(deleted, stateMerge, stateDelete));
}));

app.post("/api/gpu_erp/finance/payment-out/create", requireMenu("payment_out"), asyncRoute(async (req, res) => {
  const authRequest = req as AuthRequest;
  const idempotency = await claimMutationIdempotency(authRequest);
  if (idempotency?.replay) {
    res.status(idempotency.replay.statusCode).json(idempotency.replay.response);
    return;
  }
  try {
    const command = parseHttpDto(paymentOutCreateDto, withoutImagePayload(req.body));
    const { data: created, stateMerge } = await runStateCommand(
      () => actions(authRequest).createPaymentOut(command),
      paymentOutMerge,
      async (record) => {
        const urls = await persistEntityImages(authRequest, "payment_out", record.id, "payment-evidence");
        if (urls) record.images = urls;
      },
      transactionHookWithIdempotency(idempotency, 201),
    );
    res.status(201).json(okMerge(created, stateMerge));
  } catch (error) {
    await releaseMutationIdempotency(idempotency);
    throw error;
  }
}));

app.put("/api/gpu_erp/finance/payment-out/:id", requireMenu("payment_out"), asyncRoute(async (req, res) => {
  const command = parseHttpDto(paymentOutUpdateDto, withoutImagePayload(req.body));
  const { data: updated, stateMerge } = await runStateCommand(
    () => actions(req).updatePaymentOut(req.params.id!, command),
    paymentOutMerge,
    async (record) => {
      const urls = await persistEntityImages(req, "payment_out", record.id, "payment-evidence");
      if (urls) record.images = urls;
    },
  );
  res.json(okMerge(updated, stateMerge));
}));

app.delete("/api/gpu_erp/finance/payment-out/:id", requireMenu("payment_out"), requireDeletePermission, asyncRoute(async (req, res) => {
  const existing = state.paymentOutRecords.find((item) => item.id === req.params.id!);
  const deleted = actions(req).deletePaymentOut(req.params.id!);
  const relatedDocNos = new Set([existing?.id, existing?.relatedDocNo, deleted?.id, deleted?.relatedDocNo].filter(Boolean));
  const stateMerge = compactStateMerge({
    settlementAccounts: recordsByIds(state.settlementAccounts, [existing?.accountId, deleted?.accountId]),
    purchaseInvoices: state.purchaseInvoices.filter((item) => relatedDocNos.has(item.id) || relatedDocNos.has(item.invoiceNo)),
    vendors: state.vendors.filter((item) => item.id === existing?.supplierId || item.id === deleted?.supplierId),
    customers: state.customers.filter((item) => item.id === existing?.customerId || item.id === deleted?.customerId),
    logs: state.logs.slice(0, 1),
  });
  const stateDelete = {
    paymentOutRecords: deleted?.id ? [deleted.id] : [],
    settlementLedger: [existing?.settlementLedgerId, deleted?.settlementLedgerId].filter(Boolean) as string[],
    financeLedger: [existing?.financeLedgerId, deleted?.financeLedgerId].filter(Boolean) as string[],
  };
  await saveStateRecords([...stateMergeRecords(stateMerge), ...stateDeleteRecords(stateDelete)]);
  res.status(deleted ? 200 : 404).json(okMerge(deleted, stateMerge, stateDelete));
}));

app.post("/api/gpu_erp/finance/account-transfer/create", requireMenu("account_transfer"), asyncRoute(async (req, res) => {
  const authRequest = req as AuthRequest;
  const idempotency = await claimMutationIdempotency(authRequest);
  if (idempotency?.replay) {
    res.status(idempotency.replay.statusCode).json(idempotency.replay.response);
    return;
  }
  try {
    const { data: created, stateMerge } = await runStateCommand(
      () => actions(authRequest).createAccountTransfer(req.body),
      accountTransferMerge,
      undefined,
      transactionHookWithIdempotency(idempotency, 201),
    );
    res.status(201).json(okMerge(created, stateMerge));
  } catch (error) {
    await releaseMutationIdempotency(idempotency);
    throw error;
  }
}));

app.put("/api/gpu_erp/finance/account-transfer/:id", requireMenu("account_transfer"), asyncRoute(async (req, res) => {
  const { data: updated, stateMerge } = await runStateCommand(
    () => actions(req).updateAccountTransfer(req.params.id!, req.body),
    accountTransferMerge,
  );
  res.json(okMerge(updated, stateMerge));
}));

app.delete("/api/gpu_erp/finance/account-transfer/:id", requireMenu("account_transfer"), requireDeletePermission, asyncRoute(async (req, res) => {
  const existing = state.accountTransfers.find((item) => item.id === req.params.id!);
  const settlementLedgerIds = state.settlementLedger.filter((item) => item.relatedDocNo === req.params.id!).map((item) => item.id);
  const financeLedgerIds = state.financeLedger.filter((item) => item.relatedId === req.params.id!).map((item) => item.id);
  const deleted = actions(req).deleteAccountTransfer(req.params.id!);
  const stateMerge = compactStateMerge({
    settlementAccounts: recordsByIds(state.settlementAccounts, [existing?.fromAccountId, existing?.toAccountId, deleted?.fromAccountId, deleted?.toAccountId]),
    logs: state.logs.slice(0, 1),
  });
  const stateDelete = {
    accountTransfers: deleted?.id ? [deleted.id] : [],
    settlementLedger: settlementLedgerIds,
    financeLedger: financeLedgerIds,
  };
  await saveStateRecords([...stateMergeRecords(stateMerge), ...stateDeleteRecords(stateDelete)]);
  res.status(deleted ? 200 : 404).json(okMerge(deleted, stateMerge, stateDelete));
}));

app.get("/api/gpu_erp/finance/account-summary", requireMenu("finance_reports"), (req, res) => {
  res.json({ data: actions(req).getAccountSummary(req.query as Record<string, string>) });
});

app.get("/api/gpu_erp/reports/employee-payment-summary", requireMenu("finance_reports"), (req, res) => {
  const summary = actions(req).getAccountSummary(req.query as Record<string, string>).employeeSummary;
  res.json(paginated(summary, req));
});

app.get("/api/gpu_erp/crm/customers", requireMenu("crm"), (req, res) => {
  const filtered = state.customers.filter((item) => {
    const search = String(req.query.search || "").trim();
    const matchSearch = matchesKeyword([item.id, item.name, item.phone, item.wechat, item.remarks, item.source, item.type], search);
    const matchOwner = !req.query.owner || (item.owner || "未分配") === req.query.owner;
    const matchStatus = !req.query.status || (item.crmStatus || "线索") === req.query.status;
    const matchIntent = !req.query.intent || (item.intent || "中") === req.query.intent;
    return matchSearch && matchOwner && matchStatus && matchIntent;
  });
  res.json(paginated(filtered, req));
});

// Normalized CRM read path. The legacy customer endpoint remains available
// during the dual-read migration, while this endpoint paginates directly from
// gpu_crm_accounts instead of loading the full JSONB collection.
app.get("/api/gpu_erp/crm/accounts", requireMenu("crm"), asyncRoute(async (req, res) => {
  const result = await listCrmAccounts({
    tenantId: (req as AuthRequest).tenantId,
    page: Number(req.query.page || 1),
    pageSize: Number(req.query.pageSize || req.query.per_page || 30),
    keyword: String(req.query.keyword || req.query.search || ""),
    role: String(req.query.role || ""),
    ownerId: String(req.query.ownerId || req.query.owner || ""),
    status: String(req.query.status || ""),
  });
  // Keep the standard API envelope while returning both page rows and metadata
  // through requestBackendStrict(), which unwraps the top-level `data` field.
  res.json({ data: { items: result.data, meta: result.meta } });
}));

app.get("/api/gpu_erp/crm/accounts/:id/timeline", requireMenu("crm"), asyncRoute(async (req, res) => {
  const result = await listCrmTimeline(req.params.id!, {
    tenantId: (req as AuthRequest).tenantId,
    page: Number(req.query.page || 1),
    pageSize: Number(req.query.pageSize || req.query.per_page || 50),
  });
  res.json({ data: { items: result.data, meta: result.meta } });
}));

app.get("/api/gpu_erp/crm/quick-capture/leads", requireMenu("crm"), asyncRoute(async (req, res) => {
  const result = await listQuickCaptureLeads({
    page: Number(req.query.page || 1),
    pageSize: Number(req.query.pageSize || req.query.per_page || 20),
    keyword: String(req.query.keyword || req.query.search || ""),
    stage: String(req.query.stage || ""),
  });
  res.json({ data: result });
}));

app.post("/api/gpu_erp/crm/quick-capture/parse", requireMenu("crm"), asyncRoute(async (req: AuthRequest, res) => {
  const result = await parseQuickCaptureText(
    { rawText: req.body?.rawText, sourceType: req.body?.sourceType },
    { products: state.products, customers: state.customers },
  );
  await saveQuickCaptureAudit({
    id: result.parseId,
    rawText: result.rawText,
    sourceType: result.sourceType,
    parsed: result,
    actorId: crmActor(req),
    model: result.model,
  });
  res.json({ data: result });
}));

app.post("/api/gpu_erp/crm/quick-capture/confirm", requireMenu("crm"), asyncRoute(async (req: AuthRequest, res) => {
  const input = validateQuickCaptureConfirm(req.body);
  const audit = await findQuickCaptureAudit(input.parseId);
  if (!audit) throw new QuickCaptureValidationError("解析记录已过期，请重新解析后再确认", "CRM_QUICK_CAPTURE_PARSE_NOT_FOUND", 404);
  if (audit.rawText !== input.rawText) throw new QuickCaptureValidationError("解析原文已变化，请重新解析后再确认", "CRM_QUICK_CAPTURE_PARSE_MISMATCH", 409);
  if (audit.sourceType !== input.sourceType) throw new QuickCaptureValidationError("解析来源已变化，请重新解析后再确认", "CRM_QUICK_CAPTURE_SOURCE_MISMATCH", 409);
  const existing = await findLeadByIdempotencyKey(input.idempotencyKey);
  if (existing) {
    res.json({ data: { lead: existing, task: null, customer: state.customers.find(item => item.id === existing.customerId) || null, duplicate: true } });
    return;
  }

  const fields = input.fields;
  let customer: AppState["customers"][number];
  let createdCustomer: AppState["customers"][number] | null = null;
  if (input.matchAction === "link_existing") {
    const matchedCustomer = state.customers.find(item => item.id === input.matchedCustomerId);
    if (!matchedCustomer) throw new QuickCaptureValidationError("要关联的客户不存在，请重新匹配", "CRM_QUICK_CAPTURE_CUSTOMER_NOT_FOUND", 404);
    customer = matchedCustomer;
  } else {
    const exactMatch = state.customers.find(item => {
      const phone = String(fields.phone || "").trim().toLowerCase();
      const currentPhone = String(item.phone || item.contact || "").trim().toLowerCase();
      const wechat = String(fields.wechat || "").trim().toLowerCase();
      const currentWechat = String(item.wechat || "").trim().toLowerCase();
      const qq = String(fields.qq || "").trim().toLowerCase();
      const currentQq = String(item.qq || "").trim().toLowerCase();
      return (phone && currentPhone === phone) || (wechat && currentWechat === wechat) || (qq && currentQq === qq);
    });
    if (exactMatch) {
      throw new QuickCaptureValidationError(`联系方式已匹配客户【${exactMatch.name}】，请在预览中选择“关联已有客户”`, "CRM_QUICK_CAPTURE_MATCH_REQUIRED", 409);
    }
    const intent = fields.intentType === "回收" ? "高" : fields.priority === "高" ? "高" : fields.priority === "低" ? "低" : "中";
    if (!fields.customerName) throw new QuickCaptureValidationError("客户名称不能为空", "CRM_QUICK_CAPTURE_CUSTOMER_NAME_REQUIRED", 400);
    createdCustomer = actions(req).createCustomer({
      name: fields.customerName,
      contact: fields.phone,
      phone: fields.phone,
      wechat: fields.wechat,
      qq: fields.qq,
      city: fields.city,
      company: fields.company,
      firstChannel: fields.source || "CRM快捷录入",
      source: fields.source || "CRM快捷录入",
      type: fields.intentType === "回收" ? "个人卖家客户" : "个人买家客户",
      intent,
      budget: fields.expectedPrice || 0,
      estimatedAmount: fields.quotedPrice || fields.expectedPrice || 0,
      nextFollowTime: fields.followUpTime,
      nextFollowUpAt: fields.followUpTime,
      nextAction: fields.productModel ? `确认 ${fields.productModel} 的需求和价格` : "补充需求和联系方式",
      tags: fields.tags,
      remarks: fields.note,
      fromCrm: true,
    });
    customer = createdCustomer;
  }

  const followUp = actions(req).createCrmFollowUp({
    customerId: customer.id,
    contactMethod: fields.wechat ? "微信" : fields.phone ? "电话" : "其他",
    content: fields.note || `快捷录入线索：${fields.productModel || fields.productName || "待确认商品"}`,
    result: "继续跟进",
    handler: crmActor(req),
    followTime: storeDateTime(),
    nextFollowTime: fields.followUpTime,
    nextFollowUpAt: fields.followUpTime,
    nextAction: fields.productModel ? `确认 ${fields.productModel} 的需求和价格` : "补充需求和联系方式",
    estimatedAmount: fields.quotedPrice || fields.expectedPrice || 0,
    dealProbability: fields.priority === "高" ? 70 : fields.priority === "低" ? 20 : 40,
    remarks: "由客户线索快捷录入自动创建",
  });

  const stateMerge = compactStateMerge({
    customers: recordsByIds(state.customers, [customer.id]),
    crmFollowUps: [followUp],
    logs: state.logs.slice(0, 1),
  });
  const leadId = createQuickCaptureLeadId();
  const taskId = createQuickCaptureTaskId();
  let savedLead: Awaited<ReturnType<typeof insertQuickCaptureLead>> | null = null;
  let savedTask: Awaited<ReturnType<typeof insertQuickCaptureTask>> | null = null;
  try {
    await saveStateRecords(
      stateMergeRecords(stateMerge),
      async (client) => {
        const account = createdCustomer
          ? await upsertCrmCustomerAccount(client, customer, "created", crmActor(req))
          : await ensureCrmCustomerAccount(client, customer);
        const matchedAccount = input.matchAction === "link_existing" ? account.accountId : undefined;
        savedLead = await insertQuickCaptureLead(client, {
          id: leadId,
          customerId: customer.id,
          sourceType: input.sourceType,
          source: fields.source,
          intentType: fields.intentType,
          productCategory: fields.productCategory,
          productName: fields.productName,
          productModel: fields.productModel,
          productId: fields.productId,
          quantity: fields.quantity,
          expectedPrice: fields.expectedPrice,
          quotedPrice: fields.quotedPrice,
          transactionType: fields.transactionType,
          deliveryMethod: fields.deliveryMethod,
          followUpTime: fields.followUpTime,
          priority: fields.priority || "中",
          stage: fields.stage || "新线索",
          tags: fields.tags,
          note: fields.note,
          rawText: input.rawText,
          confidence: input.confidence,
          missingFields: input.missingFields,
          conflicts: input.conflicts,
          matchedCustomerId: input.matchedCustomerId,
          createdBy: crmActor(req),
          accountId: account.accountId,
          matchedAccountId: matchedAccount,
          idempotencyKey: input.idempotencyKey,
        });
        savedLead = savedLead ? { ...savedLead, customerId: customer.id, customerName: customer.name, matchedCustomerId: input.matchedCustomerId } : savedLead;
        savedTask = await insertQuickCaptureTask(client, {
          id: taskId,
          leadId,
          customerId: customer.id,
          accountId: account.accountId,
          taskType: "客户跟进",
          title: fields.followUpTime ? `跟进客户：${customer.name}` : `补充线索：${customer.name}`,
          dueAt: fields.followUpTime,
          status: "待处理",
          assignee: crmActor(req),
          createdBy: crmActor(req),
        });
        savedTask = savedTask ? { ...savedTask, customerId: customer.id } : savedTask;
        await syncCrmFollowUp(client, followUp, customer, crmActor(req));
        await confirmQuickCaptureAuditInTransaction(client, {
          id: input.parseId,
          finalPayload: { ...input, leadId, taskId },
          status: "confirmed",
          leadId,
        });
      },
    );
  } catch (error) {
    // Two browser tabs can confirm the same parse before either sees the first response.
    // The unique idempotency key is the database backstop; turn that race into the same
    // safe duplicate response as the normal pre-check instead of a 500.
    if (isUniqueViolation(error)) {
      const existingAfterRace = await findLeadByIdempotencyKey(input.idempotencyKey);
      if (existingAfterRace) {
        res.json({ data: { lead: existingAfterRace, task: null, customer: state.customers.find(item => item.id === existingAfterRace.customerId) || null, duplicate: true } });
        return;
      }
    }
    throw error;
  }
  res.status(201).json(okMerge({ customer, lead: savedLead, task: savedTask, followUp }, stateMerge));
}));

app.post("/api/gpu_erp/crm/customer/lead-preview", requireMenu("crm"), asyncRoute(async (req, res) => {
  res.json(ok(buildCustomerLeadPreview(req.body)));
}));

app.post("/api/gpu_erp/crm/customer/create", requireMenu("crm"), asyncRoute(async (req: AuthRequest, res) => {
  const lead = normalizeCustomerLeadInput(req.body);
  const created = actions(req).createCustomer({ ...lead, owner: crmActor(req) });
  // A new lead is also the first timeline event. Keep the legacy CRM follow-up and
  // normalized CRM timeline in the same database transaction as the customer.
  const initialFollowUp = lead.nextFollowTime || lead.nextAction
    ? actions(req).createCrmFollowUp({
      customerId: created.id,
      contactMethod: lead.contactMethod || "微信",
      content: lead.remarks || "新建客户线索，待完成首次需求沟通",
      result: "继续跟进",
      handler: crmActor(req),
      followTime: storeDateTime(),
      nextFollowTime: lead.nextFollowTime,
      nextFollowUpAt: lead.nextFollowUpAt,
      nextAction: lead.nextAction || "确认需求和预算",
      dealProbability: lead.dealProbability,
      estimatedAmount: lead.estimatedAmount,
      remarks: "新增客户线索自动创建",
    })
    : null;
  const finalCustomer = state.customers.find(item => item.id === created.id) || created;
  const stateMerge = compactStateMerge({
    customers: [finalCustomer],
    crmFollowUps: initialFollowUp ? [initialFollowUp] : [],
    logs: state.logs.slice(0, 1),
  });
  await saveStateRecords(
    stateMergeRecords(stateMerge),
    async (client) => {
      await upsertCrmCustomerAccount(client, finalCustomer, "created", crmActor(req));
      if (initialFollowUp) await syncCrmFollowUp(client, initialFollowUp, finalCustomer, crmActor(req));
    },
  );
  res.status(201).json(okMerge(finalCustomer, stateMerge));
}));

app.patch("/api/gpu_erp/crm/customer/:id", requireMenu("crm"), asyncRoute(async (req: AuthRequest, res) => {
  const updates = { ...req.body };
  // Customer ownership is a controlled assignment. Normal CRM users cannot silently
  // transfer a customer by submitting an owner field through the API.
  if (req.authUser?.role !== "老板") delete updates.owner;
  const updated = actions(req).updateCrmCustomer(req.params.id!, updates);
  const stateMerge = customerRecordMerge(updated);
  await saveStateRecords(
    stateMergeRecords(stateMerge),
    (client) => updated ? upsertCrmCustomerAccount(client, updated, "updated", crmActor(req)) : undefined,
  );
  res.status(updated ? 200 : 404).json(okMerge(updated, stateMerge));
}));

app.get("/api/gpu_erp/crm/follow-ups", requireMenu("crm"), (req, res) => {
  const filtered = state.crmFollowUps.filter((item) => {
    const matchCustomer = !req.query.customerId || item.customerId === req.query.customerId;
    const matchHandler = !req.query.handler || item.handler === req.query.handler;
    const matchResult = !req.query.result || item.result === req.query.result;
    return matchCustomer && matchHandler && matchResult;
  });
  res.json(paginated(filtered, req));
});

app.post("/api/gpu_erp/crm/follow-up/create", requireMenu("crm"), asyncRoute(async (req, res) => {
  const created = actions(req).createCrmFollowUp({ ...req.body, handler: crmActor(req) });
  const stateMerge = crmFollowUpMerge(created);
  const customer = state.customers.find((item) => item.id === created.customerId);
  if (!customer) throw new NotFoundError(`客户不存在: ${created.customerId}`);
  await saveStateRecords(
    stateMergeRecords(stateMerge),
    (client) => syncCrmFollowUp(client, created, customer, crmActor(req)),
  );
  res.status(201).json(okMerge(created, stateMerge));
}));

app.get("/api/gpu_erp/crm/requirements", requireMenu("crm"), (req, res) => {
  const filtered = state.crmRequirements.filter((item) => {
    const matchCustomer = !req.query.customerId || item.customerId === req.query.customerId;
    const matchHandler = !req.query.handler || item.handler === req.query.handler;
    const matchIntent = !req.query.intent || item.intent === req.query.intent;
    const matchStage = !req.query.stage || item.stage === req.query.stage;
    return matchCustomer && matchHandler && matchIntent && matchStage;
  });
  res.json(paginated(filtered, req));
});

app.post("/api/gpu_erp/crm/requirement/create", requireMenu("crm"), asyncRoute(async (req, res) => {
  const created = actions(req).createCrmRequirement({ ...req.body, handler: crmActor(req) });
  const stateMerge = crmRequirementMerge(created);
  const customer = state.customers.find((item) => item.id === created.customerId);
  if (!customer) throw new NotFoundError(`客户不存在: ${created.customerId}`);
  await saveStateRecords(
    stateMergeRecords(stateMerge),
    (client) => syncCrmRequirement(client, created, customer, crmActor(req)),
  );
  res.status(201).json(okMerge(created, stateMerge));
}));

app.post("/api/gpu_erp/crm/quote/create", requireMenu("crm"), asyncRoute(async (req: AuthRequest, res) => {
  const created = actions(req).createCrmQuote({ ...req.body, owner: crmActor(req) });
  const stateMerge = crmQuoteMerge(created);
  const customer = state.customers.find((item) => item.id === created.customerId);
  if (!customer) throw new NotFoundError(`客户不存在: ${created.customerId}`);
  await saveStateRecords(
    stateMergeRecords(stateMerge),
    (client) => syncCrmQuote(client, created, customer, crmActor(req)),
  );
  res.status(201).json(okMerge(created, stateMerge));
}));

app.get("/api/gpu_erp/crm/summary", requireMenu("crm"), (req, res) => {
  res.json({ data: actions(req).getCrmSummary(req.query as Record<string, string>) });
});

app.post("/api/products", requireMenu("products"), asyncRoute(async (req, res) => {
  const created = await persistProductImages(req, actions(req).addProductTemplate(req.body));
  const stateMerge = productTemplateMerge(req, created);
  await saveStateRecords(stateMergeRecords(stateMerge));
  res.status(201).json(okMerge(created, stateMerge));
}));

app.post("/api/products/import", requireMenu("products"), asyncRoute(async (req, res) => {
  const products = Array.isArray(req.body) ? req.body : req.body?.products;
  const imported = actions(req).addProductTemplates(products);
  const stateMerge = productTemplateMerge(req, imported);
  await saveStateRecords(stateMergeRecords(stateMerge));
  res.status(201).json(okMerge(imported, stateMerge));
}));

app.put("/api/products/:id", requireMenu("products"), asyncRoute(async (req, res) => {
  const updated = await persistProductImages(req, actions(req).updateProductTemplate({ ...req.body, id: req.params.id }));
  const stateMerge = productTemplateMerge(req, updated);
  await saveStateRecords(stateMergeRecords(stateMerge));
  res.json(okMerge(updated, stateMerge));
}));

app.delete("/api/products/:id", requireMenu("products"), requireDeletePermission, asyncRoute(async (req, res) => {
  const deleted = actions(req).deleteProductTemplate(req.params.id!);
  const stateMerge = deleteMerge();
  const stateDelete = { products: deleted?.id ? [deleted.id] : [] };
  await saveStateRecords([...stateMergeRecords(stateMerge), ...stateDeleteRecords(stateDelete)]);
  res.status(deleted ? 200 : 404).json(okMerge(deleted, stateMerge, stateDelete));
}));

const mediaMenuIds = [
  "products", "inventory", "inspections", "crm", "purchase_add", "purchase_list",
  "sales_add", "sales_list", "sales_outbound", "aftersales", "quotes", "finance_reports",
  "payment_in", "payment_out",
  ...returnMenuIds,
];

// Images are stored as compressed binary in PostgreSQL. The current product form still
// accepts legacy data URLs; callers can progressively move each entity to this endpoint.
app.post("/api/media", requireAnyMenu(mediaMenuIds), asyncRoute(async (req: AuthRequest, res) => {
  const values = Array.isArray(req.body?.images) ? req.body.images : [req.body?.dataUrl];
  const urls = await replaceEntityImages({
    tenantId: req.tenantId,
    entityType: String(req.body?.entityType || "").trim(),
    entityId: String(req.body?.entityId || "").trim(),
    relationRole: String(req.body?.relationRole || "attachment").trim(),
    values,
    createdBy: crmActor(req),
  });
  res.status(201).json({ data: { urls, targetBytes: MEDIA_TARGET_BYTES, maxBytes: MEDIA_MAX_BYTES } });
}));

app.get("/api/media", requireAnyMenu(mediaMenuIds), asyncRoute(async (req, res) => {
  const assets = await listEntityImages(
    String(req.query.entityType || "").trim(),
    String(req.query.entityId || "").trim(),
    req.query.relationRole ? String(req.query.relationRole) : undefined,
    (req as AuthRequest).tenantId,
  );
  res.json({ data: assets });
}));

app.get("/api/media/assets/:id", requireAnyMenu(mediaMenuIds), asyncRoute(async (req, res) => {
  const asset = await getMediaAsset(req.params.id!, (req as AuthRequest).tenantId);
  if (!asset) {
    sendApiError(req, res, 404, "MEDIA_NOT_FOUND", "图片资源不存在");
    return;
  }
  res.setHeader("Content-Type", asset.mime_type);
  res.setHeader("Content-Length", String(asset.content.length));
  res.setHeader("Cache-Control", "private, max-age=300");
  res.send(asset.content);
}));

app.post("/api/purchase-invoices", requireMenu("purchase_add"), asyncRoute(async (req, res) => {
  const authRequest = req as AuthRequest;
  const idempotency = await claimMutationIdempotency(authRequest);
  if (idempotency?.replay) {
    res.status(idempotency.replay.statusCode).json(idempotency.replay.response);
    return;
  }
  try {
    const command = parseHttpDto(purchaseInvoiceCreateDto, withoutImagePayload(req.body));
    const { data: created, stateMerge } = await runStateCommand(
      () => actions(authRequest).createPurchaseInvoice(command),
      purchaseInvoiceCreateMerge,
      async (invoice) => {
        const urls = await persistEntityImages(req, "purchase_invoice", invoice.id, "purchase-evidence");
        if (urls) invoice.images = urls;
      },
      transactionHookWithIdempotency(idempotency, 201, (client, invoice) => syncCrmPurchaseInvoiceLink(client, invoice, crmActor(req))),
    );
    res.status(201).json(okMerge(created, stateMerge));
  } catch (error) {
    await releaseMutationIdempotency(idempotency);
    throw error;
  }
}));
app.put("/api/purchase-invoices/:id", requireMenu("purchase_list"), requireHistoryEditPermission, asyncRoute(async (req, res) => {
  const { expectedRecordVersion, ...updates } = parseHttpDto(purchaseInvoiceUpdateDto, withoutImagePayload(req.body));
  assertPurchaseUpdateScope(getPermissionsForUser((req as AuthRequest).authUser), updates);
  const existing = state.purchaseInvoices.find((item) => item.id === req.params.id! || item.invoiceNo === req.params.id!);
  const paymentsBeforeUpdate = existing ? relatedPurchasePayments(existing) : [];
  const financeBeforeUpdate = existing ? relatedPurchaseFinanceLedger(existing) : [];
  const { data: updated, stateMerge, stateDelete } = await runStateCommand(
    () => actions(req).updatePurchaseInvoice(req.params.id!, updates, { expectedRecordVersion }),
    (invoice) => purchaseInvoiceUpdatePatch(invoice, paymentsBeforeUpdate, financeBeforeUpdate),
    async (invoice) => {
      const urls = await persistEntityImages(req, "purchase_invoice", invoice.id, "purchase-evidence");
      if (urls) invoice.images = urls;
    },
    (client, invoice) => syncCrmPurchaseInvoiceLink(client, invoice, crmActor(req)),
  );
  res.json(okMerge(updated, stateMerge, stateDelete));
}));

app.delete("/api/purchase-invoices/:id", requireMenu("purchase_list"), requireDeletePermission, asyncRoute(async (req, res) => {
  const existing = state.purchaseInvoices.find((item) => item.id === req.params.id! || item.invoiceNo === req.params.id!);
  const relatedCards = existing ? state.inventory.filter((card) => isInventoryLinkedToPurchase(card, existing)) : [];
  const relatedPayments = existing
    ? state.paymentOutRecords.filter((payment) => payment.relatedDocNo === existing.invoiceNo || payment.relatedDocNo === existing.id)
    : [];
  const relatedFinanceIds = state.financeLedger
    .filter((item) => existing && (item.relatedId === existing.invoiceNo || item.relatedId === existing.id))
    .map((item) => item.id);
  const deleted = actions(req).deletePurchaseInvoice(req.params.id!);
  const accountIds = relatedPayments.map((payment) => payment.accountId);
  const stateMerge = compactStateMerge({
    settlementAccounts: recordsByIds(state.settlementAccounts, accountIds),
    customers: existing?.sourcePartnerType === "customer" ? recordsByIds(state.customers, [existing.sourcePartnerId]) : [],
    vendors: existing?.sourcePartnerType !== "customer" ? recordsByIds(state.vendors, [existing?.sourcePartnerId]) : [],
    logs: state.logs.slice(0, 1),
  });
  const stateDelete = {
    purchaseInvoices: deleted?.id ? [deleted.id] : [],
    inventory: relatedCards.map((card) => card.id),
    paymentOutRecords: relatedPayments.map((payment) => payment.id),
    settlementLedger: relatedPayments.map((payment) => payment.settlementLedgerId).filter(Boolean) as string[],
    financeLedger: [...relatedPayments.map((payment) => payment.financeLedgerId).filter(Boolean), ...relatedFinanceIds] as string[],
  };
  await saveStateRecords([...stateMergeRecords(stateMerge), ...stateDeleteRecords(stateDelete)]);
  res.status(deleted ? 200 : 404).json(okMerge(deleted, stateMerge, stateDelete));
}));

app.post("/api/inspections", requireMenu("inspections"), asyncRoute(async (req: AuthRequest, res) => {
  const command = parseHttpDto(inspectionCreateDto, withoutImagePayload(req.body));
  const { data: created, stateMerge } = await runStateCommand(
    () => actions(req).submitInspection(command),
    inspectionMerge,
    async (record) => {
      const urls = await persistEntityImages(req, "inspection", record.id, "inspection-evidence");
      if (urls) record.images = urls;
    },
    (client, record) => appendInspectionVersionInTransaction(client, record, req.tenantId, crmActor(req)),
  );
  res.status(201).json(okMerge(created, stateMerge));
}));

app.get("/api/inspections/:id/versions", requireMenu("inspections"), asyncRoute(async (req: AuthRequest, res) => {
  const inspection = state.inspections.find((item) => item.id === req.params.id);
  if (!inspection) {
    sendApiError(req, res, 404, "INSPECTION_NOT_FOUND", "检测记录不存在");
    return;
  }
  res.json({ data: await listInspectionVersions(req.params.id!, req.tenantId) });
}));

app.put("/api/inspections/:id", requireMenu("inspections"), requireHistoryEditPermission, asyncRoute(async (req: AuthRequest, res) => {
  const {expectedRecordVersion, ...updates} = parseHttpDto(inspectionUpdateDto, withoutImagePayload(req.body));
  const { data: updated, stateMerge } = await runStateCommand(
    () => actions(req).updateInspection(req.params.id!, updates, expectedRecordVersion),
    inspectionMerge,
    async (record) => {
      const urls = await persistEntityImages(req, "inspection", record.id, "inspection-evidence");
      if (urls) record.images = urls;
    },
    (client, record) => appendInspectionVersionInTransaction(client, record, req.tenantId, crmActor(req)),
  );
  res.json(okMerge(updated, stateMerge));
}));

app.post("/api/assembly-operations", requireMenu("assembly"), asyncRoute(async (req, res) => {
  const created = actions(req).createAssemblyOperation(req.body);
  const stateMerge = assemblyOperationMerge(created);
  await saveStateRecords(stateMergeRecords(stateMerge));
  res.status(201).json(okMerge(created, stateMerge));
}));

app.delete("/api/assembly-operations/:id", requireMenu("assembly"), requireDeletePermission, asyncRoute(async (req, res) => {
  const beforeIds = new Set(state.inventory.filter((item) => isInventoryLinkedToAssembly(item, req.params.id!)).map((item) => item.id));
  const beforeOperation = state.assemblyOperations.find((item) => item.id === req.params.id!);
  const deleted = actions(req).deleteAssemblyOperation(req.params.id!);
  const afterRelated = state.inventory.filter((item) => beforeIds.has(item.id));
  const afterIds = new Set(afterRelated.map((item) => item.id));
  const stateMerge = compactStateMerge({
    inventory: afterRelated,
    products: relatedProductsForInventory(afterRelated),
    logs: state.logs.slice(0, 1),
  });
  const stateDelete = {
    assemblyOperations: (deleted || beforeOperation)?.id ? [(deleted || beforeOperation)!.id] : [],
    inventory: Array.from(beforeIds).filter((id) => !afterIds.has(id)),
  };
  await saveStateRecords([...stateMergeRecords(stateMerge), ...stateDeleteRecords(stateDelete)]);
  res.status(deleted ? 200 : 404).json(okMerge(deleted, stateMerge, stateDelete));
}));

app.post("/api/sales-invoices", requireMenu("sales_add"), asyncRoute(async (req, res) => {
  const authRequest = req as AuthRequest;
  const idempotency = await claimMutationIdempotency(authRequest);
  if (idempotency?.replay) {
    res.status(idempotency.replay.statusCode).json(idempotency.replay.response);
    return;
  }
  try {
    const { data: created, stateMerge } = await runStateCommand(
      () => actions(authRequest).createSalesInvoice(req.body),
      salesInvoiceMerge,
      undefined,
      transactionHookWithIdempotency(idempotency, 201, (client, invoice) => syncCrmSalesInvoiceLink(client, invoice, crmActor(req))),
    );
    // Persist first. A Feishu delivery failure must never turn a successful sales order into an API error.
    void notifyFeishuSalesInvoiceCreated(created);
    res.status(201).json(okMerge(created, stateMerge));
  } catch (error) {
    await releaseMutationIdempotency(idempotency);
    throw error;
  }
}));

app.put("/api/sales-invoices/:id", requireMenu("sales_list"), asyncRoute(async (req, res) => {
  const existing = state.salesInvoices.find((item) => item.id === req.params.id! || item.invoiceNo === req.params.id!);
  const paymentsBeforeUpdate = existing ? relatedSalesPayments(existing) : [];
  const financeBeforeUpdate = existing ? relatedSalesFinanceLedger(existing) : [];
  const { data: updated, stateMerge, stateDelete } = await runStateCommand(
    () => actions(req).updateSalesInvoice(req.params.id!, req.body),
    (invoice) => salesInvoiceUpdatePatch(invoice, paymentsBeforeUpdate, financeBeforeUpdate),
    undefined,
    (client, invoice) => syncCrmSalesInvoiceLink(client, invoice, crmActor(req)),
  );
  res.json(okMerge(updated, stateMerge, stateDelete));
}));

app.delete("/api/sales-invoices/:id", requireMenu("sales_list"), requireDeletePermission, asyncRoute(async (req, res) => {
  const existing = state.salesInvoices.find((item) => item.id === req.params.id! || item.invoiceNo === req.params.id!);
  const chosenIds = new Set(existing?.items.map((item) => item.inventoryId).filter(Boolean) || []);
  const relatedPayments = existing
    ? state.paymentInRecords.filter((payment) => payment.relatedDocNo === existing.invoiceNo || payment.relatedDocNo === existing.id)
    : [];
  const relatedFinanceIds = state.financeLedger
    .filter((item) => existing && (item.relatedId === existing.invoiceNo || item.relatedId === existing.id))
    .map((item) => item.id);
  const deleted = actions(req).deleteSalesInvoice(req.params.id!);
  const stateMerge = compactStateMerge({
    inventory: state.inventory.filter((item) => chosenIds.has(item.id)),
    settlementAccounts: recordsByIds(state.settlementAccounts, relatedPayments.map((payment) => payment.accountId)),
    customers: existing?.customerPartnerType !== "vendor" ? recordsByIds(state.customers, [existing?.customerId]) : [],
    vendors: existing?.customerPartnerType === "vendor" ? recordsByIds(state.vendors, [existing?.customerId]) : [],
    logs: state.logs.slice(0, 1),
  });
  const stateDelete = {
    salesInvoices: deleted?.id ? [deleted.id] : [],
    paymentInRecords: relatedPayments.map((payment) => payment.id),
    settlementLedger: relatedPayments.map((payment) => payment.settlementLedgerId).filter(Boolean) as string[],
    financeLedger: [...relatedPayments.map((payment) => payment.financeLedgerId).filter(Boolean), ...relatedFinanceIds] as string[],
  };
  await saveStateRecords(
    [...stateMergeRecords(stateMerge), ...stateDeleteRecords(stateDelete)],
    (client) => releaseInventoryReservationsInTransaction(client, Array.from(chosenIds), (req as AuthRequest).tenantId, existing?.id),
    (req as AuthRequest).tenantId,
  );
  res.status(deleted ? 200 : 404).json(okMerge(deleted, stateMerge, stateDelete));
}));

app.post("/api/sales-invoices/:id/outbound/preflight", requireMenu("sales_outbound"), requireManualOutboundPermission, asyncRoute(async (req, res) => {
  const preview = actions(req as AuthRequest).previewSalesOutbound(req.params.id!, req.body);
  res.json(ok(preview));
}));

app.post("/api/sales-invoices/:id/outbound", requireMenu("sales_outbound"), requireManualOutboundPermission, asyncRoute(async (req, res) => {
  const authRequest = req as AuthRequest;
  const idempotency = await claimMutationIdempotency(authRequest);
  if (idempotency?.replay) {
    res.status(idempotency.replay.statusCode).json(idempotency.replay.response);
    return;
  }
  try {
    const { data: updated, stateMerge } = await runStateCommand(
      () => actions(authRequest).confirmSalesOutbound(req.params.id!, req.body),
      salesInvoiceMerge,
      undefined,
      transactionHookWithIdempotency(idempotency, 200, (client, invoice) => reserveSalesOutboundInventoryInTransaction(client, invoice, authRequest.tenantId, idempotency?.request.key)),
    );
    res.json(okMerge(updated, stateMerge));
  } catch (error) {
    await releaseMutationIdempotency(idempotency);
    throw error;
  }
}));

app.post("/api/returns", requireAnyMenu([...returnMenuIds]), asyncRoute(async (req: AuthRequest, res) => {
  if (!canAccessReturnType(req, req.body?.type)) {
    sendApiError(req, res, 403, "FORBIDDEN", "当前账号没有该退货类型的操作权限", true);
    return;
  }
  const idempotency = await claimMutationIdempotency(req);
  if (idempotency?.replay) {
    res.status(idempotency.replay.statusCode).json(idempotency.replay.response);
    return;
  }
  try {
    const created = actions(req).createReturnOrder(req.body);
    const stateMerge = returnOrderMerge(created);
    await saveStateRecords(
      stateMergeRecords(stateMerge),
      idempotency ? (client) => completeIdempotencyKeyInTransaction(client, idempotency.request, 201, okMerge(created, stateMerge)) : undefined,
      req.tenantId,
    );
    res.status(201).json(okMerge(created, stateMerge));
  } catch (error) {
    await releaseMutationIdempotency(idempotency);
    throw error;
  }
}));

app.post("/api/returns/:id/complete", requireAnyMenu([...returnMenuIds]), requireReturnTypeFromRecord, asyncRoute(async (req: AuthRequest, res) => {
  const idempotency = await claimMutationIdempotency(req);
  if (idempotency?.replay) {
    res.status(idempotency.replay.statusCode).json(idempotency.replay.response);
    return;
  }
  try {
    const completed = actions(req).completeReturnOrder(req.params.id!);
    const stateMerge = returnOrderMerge(completed);
    const releaseIds = [completed?.sourceInventoryId, ...(completed?.items || []).map((item) => item.sourceInventoryId)].filter(Boolean) as string[];
    await saveStateRecords(
      stateMergeRecords(stateMerge),
      (client) => Promise.all([
        releaseInventoryReservationsInTransaction(client, releaseIds, req.tenantId),
        idempotency ? completeIdempotencyKeyInTransaction(client, idempotency.request, 200, okMerge(completed, stateMerge)) : Promise.resolve(),
      ]),
      req.tenantId,
    );
    res.json(okMerge(completed, stateMerge));
  } catch (error) {
    await releaseMutationIdempotency(idempotency);
    throw error;
  }
}));

app.patch("/api/returns/:id", requireAnyMenu([...returnMenuIds]), requireReturnTypeFromRecord, asyncRoute(async (req, res) => {
  const updated = actions(req).updateReturnOrder(req.params.id!, req.body);
  const stateMerge = returnOrderMerge(updated);
  await saveStateRecords(stateMergeRecords(stateMerge));
  res.json(okMerge(updated, stateMerge));
}));

app.delete("/api/returns/:id", requireAnyMenu([...returnMenuIds]), requireReturnTypeFromRecord, requireDeletePermission, asyncRoute(async (req, res) => {
  const existing = state.returnOrders.find((item) => item.id === req.params.id! || item.returnNo === req.params.id!);
  const relatedReturnNos = existing ? new Set([existing.id, existing.returnNo].filter(Boolean)) : new Set<string>();
  const returnPaymentIds = new Set([existing?.paymentRecordId, ...(existing?.refundPaymentRecordIds || [])].filter(Boolean));
  const returnPaymentIn = existing ? state.paymentInRecords.filter((item) =>
    returnPaymentIds.has(item.id) || (!!item.relatedDocNo && relatedReturnNos.has(item.relatedDocNo) && item.businessType === "采购退款")
  ) : [];
  const returnPaymentOut = existing ? state.paymentOutRecords.filter((item) =>
    returnPaymentIds.has(item.id) || (!!item.relatedDocNo && relatedReturnNos.has(item.relatedDocNo) && item.businessType === "客户退款")
  ) : [];
  const deleted = actions(req).deleteReturnOrder(req.params.id!);
  const stateMerge = returnOrderMerge(deleted);
  const stateDelete = {
    returnOrders: deleted?.id ? [deleted.id] : [],
    paymentInRecords: returnPaymentIn.map((item) => item.id),
    paymentOutRecords: returnPaymentOut.map((item) => item.id),
    settlementLedger: [...returnPaymentIn, ...returnPaymentOut].map((item) => item.settlementLedgerId).filter(Boolean) as string[],
    financeLedger: [...returnPaymentIn, ...returnPaymentOut].map((item) => item.financeLedgerId).filter(Boolean) as string[],
  };
  await saveStateRecords([...stateMergeRecords(stateMerge), ...stateDeleteRecords(stateDelete)]);
  res.status(deleted ? 200 : 404).json(okMerge(deleted, stateMerge, stateDelete));
}));

app.post("/api/aftersales", requireMenu("aftersales"), asyncRoute(async (req, res) => {
  const created = actions(req).addAftersalesClaim(req.body);
  const stateMerge = aftersalesMerge(created);
  await saveStateRecords(stateMergeRecords(stateMerge));
  res.status(201).json(okMerge(created, stateMerge));
}));

app.patch("/api/aftersales/:id", requireMenu("aftersales"), asyncRoute(async (req, res) => {
  const updated = actions(req).updateAftersalesStatus(req.params.id!, req.body);
  const stateMerge = aftersalesMerge(updated);
  await saveStateRecords(stateMergeRecords(stateMerge));
  res.status(updated ? 200 : 404).json(okMerge(updated, stateMerge));
}));

app.post("/api/market-quotes", requireMenu("quotes"), asyncRoute(async (req, res) => {
  const created = actions(req).createMarketQuote(req.body);
  const stateMerge = marketQuoteMerge(created);
  await saveStateRecords(stateMergeRecords(stateMerge));
  res.status(201).json(okMerge(created, stateMerge));
}));

app.post("/api/market-quotes/import", requireMenu("quotes"), asyncRoute(async (req, res) => {
  const quotes = Array.isArray(req.body?.quotes) ? req.body.quotes : [];
  if (quotes.length === 0) {
    sendApiError(req, res, 400, "VALIDATION_ERROR", "请至少提供一条行情参考数据。");
    return;
  }
  if (quotes.length > 2000) {
    sendApiError(req, res, 400, "VALIDATION_ERROR", "单次最多导入 2000 条行情参考。");
    return;
  }
  const result = actions(req).importMarketQuotes(quotes);
  const stateMerge = marketQuotesMerge(result.quotes);
  await saveStateRecords(stateMergeRecords(stateMerge));
  res.status(201).json(okMerge(result, stateMerge));
}));

app.patch("/api/market-quotes/:id", requireMenu("quotes"), asyncRoute(async (req, res) => {
  const updated = actions(req).updateMarketPrice(req.params.id!, req.body.todayBuyPrice, req.body.todaySellPrice, req.body.remarks);
  const stateMerge = marketQuoteMerge(updated);
  await saveStateRecords(stateMergeRecords(stateMerge));
  res.status(updated ? 200 : 404).json(okMerge(updated, stateMerge));
}));

app.delete("/api/market-quotes/:id", requireMenu("quotes"), requireDeletePermission, asyncRoute(async (req, res) => {
  const deleted = actions(req).deleteMarketQuote(req.params.id!);
  const stateMerge = deleteMerge();
  const stateDelete = { marketQuotes: deleted?.id ? [deleted.id] : [] };
  await saveStateRecords([...stateMergeRecords(stateMerge), ...stateDeleteRecords(stateDelete)]);
  res.status(deleted ? 200 : 404).json(okMerge(deleted, stateMerge, stateDelete));
}));

app.patch("/api/inventory/batch", requireMenu("inventory"), asyncRoute(async (req, res) => {
  const { data: updated, stateMerge } = await runStateCommand(
    () => actions(req).batchUpdateInventory(req.body.ids || [], req.body.updates || {}),
    inventoryRecordsMerge,
  );
  res.json(okMerge(updated, stateMerge));
}));

app.get("/api/inventory/summary", requireMenu("inventory"), (req, res) => {
  res.json({ data: actions(req).getInventorySummary(req.query as Record<string, string>) });
});

// Paginated inventory endpoint for the ERP UI. Existing state hydration remains compatible, while
// new screens can page directly from PostgreSQL instead of receiving the whole inventory array.
app.get("/api/inventory/items", requireMenu("inventory"), asyncRoute(async (req: AuthRequest, res) => {
  const page = await queryInventoryPage<CardInventory>({
    tenantId: (req as AuthRequest).tenantId,
    storeId: (req as AuthRequest).storeId,
    page: Number(req.query.page || 1),
    pageSize: Number(req.query.pageSize || 50),
    keyword: String(req.query.keyword || req.query.search || ""),
    status: String(req.query.status || ""),
    category: String(req.query.category || ""),
    brand: String(req.query.brand || ""),
    risk: req.query.risk === "mined" || req.query.risk === "upturned" || req.query.risk === "high" ? req.query.risk : undefined,
    minStorageDays: Number(req.query.minStorageDays || 0),
    maxStorageDays: req.query.maxStorageDays === undefined ? undefined : Number(req.query.maxStorageDays),
    minProfitMargin: Number(req.query.minProfitMargin || 0),
    activeOnly: String(req.query.activeOnly || "") === "true",
    warehouseLocation: String(req.query.warehouseLocation || ""),
    includeSold: String(req.query.includeSold || "") === "true",
    sortKey: String(req.query.sortKey || ""),
    sortDirection: req.query.sortDirection === "asc" ? "asc" : "desc",
  });
  res.json({ data: sanitizeInventoryRowsForUser(page.data, req.authUser), meta: page.meta });
}));

app.post("/api/inventory/import", requireMenu("inventory"), asyncRoute(async (req, res) => {
  const { data: created, stateMerge } = await runStateCommand(
    () => actions(req).importInventoryRows(req.body.rows || [], req.body.handler),
    inventoryRecordsMerge,
  );
  res.status(201).json(okMerge(created, stateMerge));
}));

app.post("/api/inventory/scan-flow", requireMenu("inventory"), asyncRoute(async (req, res) => {
  const result = actions(req).scanInventoryFlow(req.body);
  const stateMerge = scanFlowMerge(result, req.body?.salesInvoiceId);
  await saveStateRecords(stateMergeRecords(stateMerge));
  res.json(okMerge(result, stateMerge));
}));

app.post("/api/customers", requireMenu("customers"), asyncRoute(async (req: AuthRequest, res) => {
  const created = actions(req).createCustomer(req.body);
  const stateMerge = simpleRecordCreateMerge("customers", created);
  // Customer quick-create is used by sales and purchase forms, whose pickers
  // read the normalized CRM accounts endpoint. Persist the legacy customer row
  // and its CRM主体 mapping in one transaction so a newly-created customer is
  // searchable immediately from every entry point.
  await saveStateRecords(
    stateMergeRecords(stateMerge),
    (client) => upsertCrmCustomerAccount(client, created, "created", crmActor(req)),
    req.tenantId,
  );
  res.status(201).json(okMerge(created, stateMerge));
}));

app.delete("/api/customers/:id", requireMenu("customers"), requireDeletePermission, asyncRoute(async (req, res) => {
  const deleted = actions(req).deleteCustomer(req.params.id!);
  const stateMerge = deleteMerge();
  const stateDelete = { customers: deleted?.id ? [deleted.id] : [] };
  await saveStateRecords([...stateMergeRecords(stateMerge), ...stateDeleteRecords(stateDelete)]);
  res.status(deleted ? 200 : 404).json(okMerge(deleted, stateMerge, stateDelete));
}));

app.post("/api/vendors", requireMenu("vendors"), asyncRoute(async (req, res) => {
  const created = actions(req).createVendor(req.body);
  const stateMerge = simpleRecordCreateMerge("vendors", created);
  await saveStateRecords(stateMergeRecords(stateMerge));
  res.status(201).json(okMerge(created, stateMerge));
}));

app.put("/api/vendors/:id", requireMenu("vendors"), asyncRoute(async (req, res) => {
  const updated = actions(req).updateVendor(req.params.id!, req.body);
  const stateMerge = vendorRecordMerge(updated);
  await saveStateRecords(stateMergeRecords(stateMerge));
  res.status(updated ? 200 : 404).json(okMerge(updated, stateMerge));
}));

app.delete("/api/vendors/:id", requireMenu("vendors"), requireDeletePermission, asyncRoute(async (req, res) => {
  const deleted = actions(req).deleteVendor(req.params.id!);
  const stateMerge = deleteMerge();
  const stateDelete = { vendors: deleted?.id ? [deleted.id] : [] };
  await saveStateRecords([...stateMergeRecords(stateMerge), ...stateDeleteRecords(stateDelete)]);
  res.status(deleted ? 200 : 404).json(okMerge(deleted, stateMerge, stateDelete));
}));

app.get("/api/logs", requireMenu("logs"), asyncRoute(async (req, res) => {
  const page = await queryLogsPage({
    tenantId: (req as AuthRequest).tenantId,
    storeId: (req as AuthRequest).storeId,
    page: Number(req.query.page || 1),
    pageSize: Number(req.query.pageSize || req.query.per_page || 100),
    keyword: String(req.query.keyword || ""),
  });
  res.json({ data: { logs: page.data, meta: page.meta, logsLoaded: true } });
}));

app.post("/api/logs", requireMenu("logs"), asyncRoute(async (req, res) => {
  const { user, module, type, target, beforeVal, afterVal } = req.body;
  res.status(201).json(ok(await persistRequest(req, actions(req).addLog(user, module, type, target, beforeVal, afterVal))));
}));

app.delete("/api/logs", requireMenu("logs"), requireHistoryEditPermission, asyncRoute(async (req, res) => {
  actions(req).clearAllLogs();
  await persistRequest(req, null);
  res.json(ok(null));
}));

app.patch("/api/finance-ledger/:id/reconcile", requireMenu("finance"), asyncRoute(async (req, res) => {
  const updated = actions(req).reconcileLedgerItem(req.params.id!);
  const stateMerge = compactStateMerge({
    financeLedger: updated ? [updated] : [],
    logs: state.logs.slice(0, 1),
  });
  await saveStateRecords(stateMergeRecords(stateMerge));
  res.status(updated ? 200 : 404).json(okMerge(updated, stateMerge));
}));

app.post("/api/reset", requireBoss, asyncRoute(async (req, res) => {
  if (process.env.NODE_ENV === "production" && process.env.ALLOW_PRODUCTION_RESET !== "true") {
    sendApiError(req, res, 403, "FORBIDDEN", "生产环境已禁用数据初始化接口", true);
    return;
  }
  replaceCurrentState(actions(req).resetToDemoData());
  await saveState(state);
  await reloadStateFromDatabase();
  res.json(ok(state));
}));

registerBackupRoutes(app, {
  state,
  requireBoss,
  requireReports: requireMenu("finance_reports"),
  asyncRoute,
  getStoreDate: storeDate,
  getShowCost: (req) => Boolean(actions(req as AuthRequest).getPermissions().showCost),
  ok,
});

app.use((req: AuthRequest, res: express.Response) => {
  sendApiError(req, res, 404, "NOT_FOUND", "接口不存在");
});

app.use((err: unknown, req: AuthRequest, res: express.Response, _next: express.NextFunction) => {
  if (isMutationAbortedError(err) && (req.destroyed || res.destroyed || res.writableEnded)) return;
  const requestId = req.requestId || randomUUID();
  res.setHeader("X-Request-Id", requestId);
  const requestError = err && typeof err === "object" ? err as { type?: unknown; status?: unknown } : undefined;
  const parserFailure = requestError?.type === "entity.parse.failed";
  const payloadTooLarge = requestError?.type === "entity.too.large";
  const requestErrorDetails = parserFailure
    ? { status: 400, code: "INVALID_JSON", message: "请求体不是有效 JSON" }
    : payloadTooLarge
      ? { status: 413, code: "PAYLOAD_TOO_LARGE", message: "请求体超过 2MB 限制" }
      : undefined;
  const code = requestErrorDetails?.code || (err instanceof AppError
    ? err.code
    : err instanceof QuickCaptureValidationError
      ? err.code
      : err instanceof MediaValidationError
        ? err.code
        : "SERVER_ERROR");
  logRequestError(req, err, code);
  if (requestErrorDetails) {
    res.status(requestErrorDetails.status).json({ error: { code: requestErrorDetails.code, message: requestErrorDetails.message, requestId } });
    return;
  }
  if (err instanceof AppError) {
    res.status(err.status).json({ error: { code: err.code, message: err.message, requestId, ...(err.details === undefined ? {} : { details: err.details }) } });
    return;
  }
  if (err instanceof QuickCaptureValidationError) {
    res.status(err.status).json({ error: { code: err.code, message: err.message, requestId } });
    return;
  }
  if (err instanceof MediaValidationError) {
    res.status(err.status).json({ error: { code: err.code, message: err.message, requestId } });
    return;
  }
  if (err instanceof CommercialValidationError) {
    res.status(err.status).json({ error: { code: err.code, message: err.message, requestId } });
    return;
  }

  res.status(500).json({ error: { code: "SERVER_ERROR", message: "服务器处理失败，请稍后重试", requestId } });
});

export function createApp() {
  return app;
}

export function startServer(port = PORT) {
  return createApp().listen(port, () => {
    console.log(`Backend API listening on http://localhost:${port}`);
  });
}

function isMainModule() {
  const entry = process.argv[1];
  return Boolean(entry && resolve(entry) === resolve(fileURLToPath(import.meta.url)));
}
if (isMainModule()) {
  startServer();
}
