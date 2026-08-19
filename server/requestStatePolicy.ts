import type { StateCollectionKey } from "./db.ts";

const PRODUCT_LIBRARY_KEYS: StateCollectionKey[] = ["products", "inventory", "marketQuotes", "logs"];
const PURCHASE_KEYS: StateCollectionKey[] = [
  "purchaseInvoices",
  "inventory",
  "customers",
  "vendors",
  "financeLedger",
  "settlementAccounts",
  "settlementLedger",
  "paymentOutRecords",
  "logs",
];
const SALES_KEYS: StateCollectionKey[] = [
  "salesInvoices",
  "inventory",
  "purchaseCommissions",
  "customers",
  "vendors",
  "financeLedger",
  "settlementAccounts",
  "settlementLedger",
  "paymentInRecords",
  "logs",
];
const PAYMENT_IN_KEYS: StateCollectionKey[] = [
  "paymentInRecords",
  "settlementAccounts",
  "settlementLedger",
  "financeLedger",
  "salesInvoices",
  "customers",
  "vendors",
  "logs",
];
const PAYMENT_OUT_KEYS: StateCollectionKey[] = [
  "paymentOutRecords",
  "settlementAccounts",
  "settlementLedger",
  "financeLedger",
  "purchaseInvoices",
  "vendors",
  "customers",
  "logs",
];
const RETURN_KEYS: StateCollectionKey[] = [
  "returnOrders",
  "inventory",
  "products",
  "salesInvoices",
  "purchaseInvoices",
  "customers",
  "vendors",
  "settlementAccounts",
  "settlementLedger",
  "financeLedger",
  "paymentInRecords",
  "paymentOutRecords",
  "logs",
];
const AFTERSALES_KEYS: StateCollectionKey[] = [
  "aftersales",
  "inventory",
  "salesInvoices",
  "customers",
  "settlementAccounts",
  "settlementLedger",
  "financeLedger",
  "paymentOutRecords",
  "logs",
];

// These collections are required for the dashboard and the common entry pages. Histories that
// are loaded only after a user opens their own page stay out of the login/focus refresh path.
// Keeping this list next to the request policy prevents the client and server from gradually
// drifting back to a full-state refresh.
export const INITIAL_STATE_RELOAD_KEYS: StateCollectionKey[] = [
  "inventory",
  "inspections",
  "purchaseInvoices",
  "salesInvoices",
  "purchaseCommissions",
  "marketQuotes",
  "aftersales",
  "customers",
  "crmFollowUps",
  "crmRequirements",
  "crmQuotes",
  "vendors",
  "settlementAccounts",
  "paymentInRecords",
  "paymentOutRecords",
  "accountTransfers",
  "assemblyOperations",
  "returnOrders",
  "systemUsers",
];

function uniqueKeys(keys: StateCollectionKey[]) {
  return Array.from(new Set(keys));
}

function startsWithAny(path: string, prefixes: string[]) {
  return prefixes.some((prefix) => path === prefix || path.startsWith(`${prefix}/`));
}

export function shouldReloadStateFromDatabase(method: string, path: string) {
  const normalizedMethod = method.toUpperCase();
  return normalizedMethod !== "HEAD" && normalizedMethod !== "OPTIONS";
}

export function getPersistenceKeysForRequest(method: string, path: string): StateCollectionKey[] | null {
  const normalizedMethod = method.toUpperCase();
  if (normalizedMethod === "GET" || normalizedMethod === "HEAD" || normalizedMethod === "OPTIONS") return null;

  if (startsWithAny(path, ["/api/products"])) return PRODUCT_LIBRARY_KEYS;
  if (startsWithAny(path, ["/api/purchase-invoices"])) return PURCHASE_KEYS;
  if (startsWithAny(path, ["/api/sales-invoices"])) return SALES_KEYS;
  if (startsWithAny(path, ["/api/inspections"])) return ["inspections", "inventory", "products", "logs"];
  if (startsWithAny(path, ["/api/assembly-operations"])) return ["assemblyOperations", "inventory", "products", "logs"];
  if (startsWithAny(path, ["/api/returns"])) return RETURN_KEYS;
  if (startsWithAny(path, ["/api/aftersales"])) return AFTERSALES_KEYS;
  if (startsWithAny(path, ["/api/market-quotes"])) return ["marketQuotes", "inventory", "logs"];
  if (startsWithAny(path, ["/api/inventory"])) return ["inventory", "products", "salesInvoices", "purchaseCommissions", "logs"];
  if (startsWithAny(path, ["/api/customers"])) return ["customers", "logs"];
  if (startsWithAny(path, ["/api/vendors"])) return ["vendors", "logs"];
  if (startsWithAny(path, ["/api/users"])) return ["systemUsers", "logs"];
  if (startsWithAny(path, ["/api/logs"])) return ["logs"];
  if (startsWithAny(path, ["/api/finance-ledger"])) return ["financeLedger", "logs"];

  if (startsWithAny(path, ["/api/gpu_erp/finance/settlement-account"])) return ["settlementAccounts", "logs"];
  if (startsWithAny(path, ["/api/gpu_erp/finance/payment-in"])) return PAYMENT_IN_KEYS;
  if (startsWithAny(path, ["/api/gpu_erp/finance/payment-out"])) return PAYMENT_OUT_KEYS;
  if (startsWithAny(path, ["/api/gpu_erp/finance/account-transfer"])) {
    return ["accountTransfers", "settlementAccounts", "settlementLedger", "financeLedger", "logs"];
  }
  // Lead preview is a read-only calculation endpoint even though it uses POST.
  if (path === "/api/gpu_erp/crm/customer/lead-preview") return null;
  if (startsWithAny(path, ["/api/gpu_erp/crm/customer"])) return ["customers", "crmFollowUps", "crmRequirements", "logs"];
  if (startsWithAny(path, ["/api/gpu_erp/crm/quick-capture/confirm"])) return ["customers", "crmFollowUps", "logs"];
  // Parsing writes only the normalized CRM audit record. It must not trigger a full legacy
  // state persistence/response patch, but it does need the current customer and product lists
  // for candidate matching.
  if (startsWithAny(path, ["/api/gpu_erp/crm/quick-capture/parse"])) return null;
  if (startsWithAny(path, ["/api/gpu_erp/crm/follow-up"])) return ["crmFollowUps", "customers", "logs"];
  if (startsWithAny(path, ["/api/gpu_erp/crm/requirement"])) return ["crmRequirements", "customers", "logs"];
  if (startsWithAny(path, ["/api/gpu_erp/crm/quote"])) return ["crmQuotes", "customers", "logs"];

  return null;
}

export function getStatePatchKeysForRequest(method: string, path: string): StateCollectionKey[] | null {
  if (startsWithAny(path, ["/api/products"])) return null;
  const keys = getPersistenceKeysForRequest(method, path);
  return keys ? uniqueKeys(keys) : null;
}

export function getReloadKeysForRequest(method: string, path: string): StateCollectionKey[] | null {
  // These list routes query PostgreSQL directly and must not deserialize the same collection
  // into the process cache before executing their indexed, server-side paginated query.
  if (method.toUpperCase() === "POST" && path === "/api/gpu_erp/crm/quick-capture/parse") return ["customers", "products"];
  if (method.toUpperCase() === "GET" && path === "/api/gpu_erp/crm/quick-capture/leads") return [];
  if (method.toUpperCase() === "GET" && path === "/api/inventory/items") return [];
  if (method.toUpperCase() === "GET" && path === "/api/open/inventory/items") return [];
  if (method.toUpperCase() === "GET" && path === "/api/logs") return [];
  if (method.toUpperCase() === "GET" && path === "/api/gpu_erp/finance/customer-funds") {
    return ["purchaseInvoices", "salesInvoices", "customers", "vendors", "paymentInRecords", "paymentOutRecords"];
  }
  const keys = getPersistenceKeysForRequest(method, path);
  if (!keys?.length) return keys;

  // Audit logs are append-only and are never used to validate a business mutation. Re-reading
  // thousands of logs before every create/update/delete only delays the request; the mutation
  // itself appends its new log record atomically with the affected business rows.
  return keys.filter((key) => key !== "logs");
}

export function shouldAttachFreshStateToResponse(method: string, path: string, payload: unknown) {
  const normalizedMethod = method.toUpperCase();
  if (normalizedMethod === "GET" || normalizedMethod === "HEAD" || normalizedMethod === "OPTIONS") return false;
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return false;
  if (!getStatePatchKeysForRequest(method, path)?.length) return false;
  return !("state" in payload) && !("stateMerge" in payload) && !("stateDelete" in payload);
}
