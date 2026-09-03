import express from "express";
import compression from "compression";
import { randomUUID } from "node:crypto";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import rateLimit from "express-rate-limit";
import helmet from "helmet";
import { acquireAuthWriteLock, acquireStateWriteLock, appendInspectionVersionInTransaction, createDatabaseSessionStore, dataFilePath, findActiveTenantMembership, findInventoryRecord, findInventoryRecordBySn, findSystemUserById, findSystemUserByUsername, getStateRevision, listInspectionVersions, loadState, loadStateCollections, queryInventoryPage, queryLogsPage, saveState, saveStateCollections, saveStateRecords } from "./db.ts";
import type { StateCollectionKey } from "./db.ts";
import { createStoreActions, type AppState, type StoreActionContext } from "./store.ts";
import { notifyFeishuMarketQuotePriceChanged, notifyFeishuSalesInvoiceCreated } from "./feishu.ts";
import { createSessionManager } from "./security.ts";
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
import { isInventoryLinkedToAssembly } from "../src/utils/inventoryRelations.ts";
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
import { registerMasterDataRoutes } from "./routes/masterData.ts";
import { registerPurchaseReadRoutes } from "./routes/purchaseRead.ts";
import { registerOperationalReadRoutes } from "./routes/operationalReads.ts";
import { registerFinanceClosingRoutes } from "./routes/financeClosing.ts";
import {registerPagedRecordRoutes} from "./routes/pagedRecords.ts";
import { registerSystemRoutes } from "./routes/system.ts";
import { registerFinanceCommissionRoutes } from "./routes/financeCommissions.ts";
import { MediaValidationError, replaceEntityImages } from "./mediaRepository.ts";
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
import { registerAiDailySalesRoutes } from "./routes/aiDailySales.ts";
import { registerBackupRoutes } from "./routes/backup.ts";
import { registerStateRevisionRoute, registerStateRoutes } from "./routes/state.ts";
import { registerFinanceReadModelRoutes } from "./routes/financeReadModels.ts";
import { registerFinanceAccountRoutes } from "./routes/financeAccounts.ts";
import { registerFinancePaymentRoutes } from "./routes/financePayments.ts";
import { registerProductMutationRoutes } from "./routes/productMutations.ts";
import { registerMediaRoutes } from "./routes/media.ts";
import { registerPartnerMutationRoutes } from "./routes/partnerMutations.ts";
import { registerCrmReadModelRoutes } from "./routes/crmReadModels.ts";
import { registerCrmMutationRoutes } from "./routes/crmMutations.ts";
import { registerCrmNormalizedReadRoutes } from "./routes/crmNormalizedReads.ts";
import { registerAiRoutes } from "./routes/aiRoutes.ts";
import { registerPurchaseMutationRoutes } from "./routes/purchaseMutations.ts";
import { registerSalesMutationRoutes } from "./routes/salesMutations.ts";
import { registerReturnMutationRoutes } from "./routes/returnMutations.ts";
import { registerAftersalesMutationRoutes } from "./routes/aftersalesMutations.ts";
import { registerMarketQuoteMutationRoutes } from "./routes/marketQuoteMutations.ts";
import { registerOrderPoolRoutes } from "./routes/orderPool.ts";
import { marketQuotePriceChanges, snapshotMarketQuote } from "./marketQuoteNotifications.ts";
import { CommercialValidationError, assertCommercialTenantActive, assertSeatAvailable, claimIdempotencyKey, completeIdempotencyKeyInTransaction, commercialFeatureEnabled, estimateAiUsageUnits, hashIdempotencyPayload, recordCommercialUsage, releaseIdempotencyKey, releaseInventoryReservationsInTransaction, reserveSalesOutboundInventoryInTransaction, upsertCommercialMembershipInTransaction } from "./commercialRepository.ts";
import { createStateProxy, getFallbackState, replaceCurrentState, runTenantContext } from "./requestTenantContext.ts";
import { DEFAULT_STORE_ID, DEFAULT_TENANT_ID } from "./commercialConstants.ts";
import {
  inspectionCreateDto,
  inspectionUpdateDto,
  parseHttpDto,
} from "./httpDto.ts";
import type {
  AccountTransferRecord,
  AssemblyOperationRecord,
  CardInventory,
  InspectionRecord,
  InventoryScanResult,
  PaymentInRecord,
  PaymentOutRecord,
  ProductTemplate,
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

function simpleRecordCreateMerge(key: StateCollectionKey, record: { id: string }) {
  return compactStateMerge({
    [key]: [record],
    logs: state.logs.slice(0, 1),
  } as StateMergePatch);
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

function productPriceSyncMerge(productId: string) {
  const inventory = state.inventory.filter((item) => item.productId === productId);
  return compactStateMerge({
    products: recordsByIds(state.products, [productId]),
    inventory,
    marketQuotes: state.marketQuotes.filter((quote) => quote.productId === productId),
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
  const beforeQuotes = new Map(
    state.marketQuotes
      .filter((quote) => quote.productId === String(body.productId || "").trim())
      .map((quote) => [quote.id, snapshotMarketQuote(quote)] as const),
  );
  const result = actions(undefined, { role: "财务", actor: "OpenAPI" }).syncEstimatedSellPrice({
    productId: String(body.productId || ""),
    estSellPrice: Number(body.estSellPrice ?? body.suggestSellPrice ?? body.refSellPrice ?? body.todaySellPrice),
    priceSource: body.priceSource || body.source,
    remarks: body.remarks,
  });
  const stateMerge = productPriceSyncMerge(result.productId);
  await saveStateRecords(stateMergeRecords(stateMerge));
  void notifyFeishuMarketQuotePriceChanged(marketQuotePriceChanges(beforeQuotes, state.marketQuotes.filter((quote) => quote.productId === result.productId)));
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
registerOrderPoolRoutes(app, {
  requireMenu,
  asyncRoute,
  getState: () => state,
  actions: (req) => actions(req),
  persist: (req, result) => persistRequest(req, result),
});
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
registerAiDailySalesRoutes(app, {
  requireAnyMenu,
  loadState,
  getStoreDate: storeDate,
  getCutoff: () => process.env.FEISHU_DAILY_REPORT_CUTOFF || "20:00",
  permissionsForRequest: (req) => getPermissionsForUser((req as AuthRequest).authUser),
});

registerAiRoutes(app, {
  requireAnyMenu,
  requireBoss,
  requireMenu,
  asyncRoute,
  loadState,
  replaceState: replaceCurrentState,
  reloadState: reloadStateFromDatabase,
  getState: () => state,
  featureEnabled: commercialFeatureEnabled,
  recordUsage: recordCommercialUsage,
  estimateUsageUnits: estimateAiUsageUnits,
  actorForRequest: (req) => crmActor(req as AuthRequest),
  sendApiError,
  logRequestError,
  defaultTenantId: DEFAULT_TENANT_ID,
});

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

registerFinanceAccountRoutes(app, {
  requireMenu,
  requireDeletePermission,
  asyncRoute,
  getState: () => state,
  actions: (req) => actions(req as AuthRequest),
  claimMutationIdempotency: (req) => claimMutationIdempotency(req as AuthRequest),
  releaseMutationIdempotency,
  transactionHookWithIdempotency,
});

registerFinancePaymentRoutes(app, {
  requireMenu,
  requireDeletePermission,
  asyncRoute,
  getState: () => state,
  actions: (req) => actions(req as AuthRequest),
  claimMutationIdempotency: (req) => claimMutationIdempotency(req as AuthRequest),
  releaseMutationIdempotency,
  transactionHookWithIdempotency,
  persistEntityImages: (req, entityType, entityId, relationRole) => persistEntityImages(req as AuthRequest, entityType, entityId, relationRole),
  paymentInMerge,
  paymentOutMerge,
  accountTransferMerge,
});

registerFinanceReadModelRoutes(app, {
  requireMenu,
  getStoreDate: storeDate,
  startOfMonth: (date) => startOfMonth(date),
  addDateDays: (date, days) => addDateDays(date, days),
  ok,
  state,
  actions: (req) => actions(req as AuthRequest),
  paginated,
  sendValidationError: (req, res, message) => sendApiError(req as AuthRequest, res, 400, "VALIDATION_ERROR", message),
  permissionsForRequest: (req) => getPermissionsForUser((req as AuthRequest).authUser),
});

registerCrmReadModelRoutes(app, {
  requireMenu,
  getState: () => state,
  actions: (req) => actions(req as AuthRequest),
  paginated,
  matchesKeyword,
});

registerCrmNormalizedReadRoutes(app, {requireMenu, asyncRoute});

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

registerCrmMutationRoutes(app, {
  requireMenu,
  asyncRoute,
  getState: () => state,
  actions: (req) => actions(req as AuthRequest),
  actorForRequest: (req) => crmActor(req as AuthRequest),
});

registerProductMutationRoutes(app, {
  requireMenu,
  requireDeletePermission,
  asyncRoute,
  actions: (req) => actions(req as AuthRequest),
  persistProductImages,
  productTemplateMerge,
  deleteMerge,
});

registerPartnerMutationRoutes(app, {
  requireMenu,
  requireDeletePermission,
  asyncRoute,
  actions: (req) => actions(req as AuthRequest),
  customerCreateMerge: (customer) => simpleRecordCreateMerge("customers", customer),
  vendorCreateMerge: (vendor) => simpleRecordCreateMerge("vendors", vendor),
  vendorRecordMerge,
  deleteMerge,
  persistCustomerAccount: (client, req, customer) => upsertCrmCustomerAccount(client, customer, "created", crmActor(req as AuthRequest)),
});

registerMediaRoutes(app, {
  requireAnyMenu,
  asyncRoute,
  actorForRequest: (req) => crmActor(req as AuthRequest),
  sendNotFound: (req, res, code, message) => sendApiError(req as AuthRequest, res, 404, code, message),
});

registerPurchaseMutationRoutes(app, {
  requireMenu,
  requireDeletePermission,
  requireHistoryEditPermission,
  asyncRoute,
  getState: () => state,
  actions: (req) => actions(req as AuthRequest),
  permissionsForRequest: (req) => getPermissionsForUser(req.authUser),
  actorForRequest: (req) => crmActor(req),
  withoutImagePayload,
  persistEntityImages: (req, entityType, entityId, relationRole) => persistEntityImages(req, entityType, entityId, relationRole),
  claimMutationIdempotency: (req) => claimMutationIdempotency(req),
  releaseMutationIdempotency,
  transactionHookWithIdempotency,
});

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

registerSalesMutationRoutes(app, {
  requireMenu,
  requireDeletePermission,
  requireManualOutboundPermission,
  asyncRoute,
  getState: () => state,
  actions: (req) => actions(req as AuthRequest),
  actorForRequest: (req) => crmActor(req),
  claimMutationIdempotency: (req) => claimMutationIdempotency(req),
  releaseMutationIdempotency,
  transactionHookWithIdempotency,
  releaseInventoryReservations: releaseInventoryReservationsInTransaction,
  reserveSalesOutboundInventory: reserveSalesOutboundInventoryInTransaction,
  notifySalesInvoiceCreated: notifyFeishuSalesInvoiceCreated,
  ok,
});

registerReturnMutationRoutes(app, {
  requireAnyMenu,
  requireDeletePermission,
  asyncRoute,
  getState: () => state,
  actions: (req) => actions(req as AuthRequest),
  permissionsForRequest: (req) => getPermissionsForUser(req.authUser),
  claimMutationIdempotency: (req) => claimMutationIdempotency(req),
  releaseMutationIdempotency,
  sendApiError,
  completeIdempotency: completeIdempotencyKeyInTransaction,
  releaseInventoryReservations: releaseInventoryReservationsInTransaction,
});

registerAftersalesMutationRoutes(app, {
  requireMenu,
  asyncRoute,
  getState: () => state,
  actions: (req) => actions(req as AuthRequest),
});

registerMarketQuoteMutationRoutes(app, {
  requireMenu,
  requireDeletePermission,
  asyncRoute,
  getState: () => state,
  actions: (req) => actions(req as AuthRequest),
  deleteMerge,
  notifyPriceChanged: notifyFeishuMarketQuotePriceChanged,
  notifyPriceChanges: notifyFeishuMarketQuotePriceChanged,
  sendValidationError: (req, res, message) => sendApiError(req, res, 400, "VALIDATION_ERROR", message),
});

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
