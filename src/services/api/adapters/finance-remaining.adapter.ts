import type {PurchaseCommissionRecord} from "@/src/types/finance-remaining";
import type {AuditLogItem, CustomerFundsRow, CustomerFundsSnapshot, FinanceCommissionItem, PagedCollection, SettingsUserItem} from "@/src/types/finance-remaining";
import type {CustomerFundsResponseDto, LogsResponseDto, UserMutationResponseDto, UsersResponseDto} from "../dto/finance-remaining.dto";

function record(value: unknown): Record<string, unknown> { return value && typeof value === "object" ? value as Record<string, unknown> : {}; }
function text(value: unknown, fallback = "") { return typeof value === "string" ? value : value === null || value === undefined ? fallback : String(value); }
function number(value: unknown, fallback = 0) { const n = Number(value); return Number.isFinite(n) ? n : fallback; }
function array(value: unknown) { return Array.isArray(value) ? value : []; }

function adaptFundsRow(value: unknown): CustomerFundsRow {
  const raw = record(value);
  return {
    id: text(raw.id, text(raw.partnerKey, `partner:${text(raw.name, "unknown")}`)), partnerId: text(raw.partnerId) || undefined,
    name: text(raw.name, "未命名合作伙伴"), partnerType: text(raw.partnerType, "合作伙伴"), contactPerson: text(raw.contactPerson) || undefined, phone: text(raw.phone) || undefined,
    creditLevel: text(raw.creditLevel, "未评级"), paymentTermDays: number(raw.paymentTermDays, 30), payable: number(raw.payable), receivable: number(raw.receivable), net: number(raw.net), overduePayable: number(raw.overduePayable), overdueReceivable: number(raw.overdueReceivable), firstActivityDate: text(raw.firstActivityDate) || undefined, lastActivityDate: text(raw.lastActivityDate) || undefined, status: text(raw.status, "合作中"),
    transactions: array(raw.transactions).map((item) => { const tx = record(item); return {id: text(tx.id), date: text(tx.date), kind: text(tx.kind), label: text(tx.label), documentNo: text(tx.documentNo) || undefined, amount: number(tx.amount), cashDirection: tx.cashDirection === "in" || tx.cashDirection === "out" ? tx.cashDirection : "none", payableDelta: number(tx.payableDelta), receivableDelta: number(tx.receivableDelta), remarks: text(tx.remarks) || undefined}; }),
  };
}

export function adaptCustomerFunds(response: CustomerFundsResponseDto): CustomerFundsSnapshot {
  const raw = record(response.data);
  const balances = (key: string) => { const value = record(raw[key]); return {payable: number(value.payable), receivable: number(value.receivable), net: number(value.net)}; };
  const cash = (key: string) => { const value = record(raw[key]); return {received: number(value.received), paid: number(value.paid), difference: number(value.difference)}; };
  const countsRaw = record(raw.counts);
  return {rows: array(raw.rows).map(adaptFundsRow), counts: {all: number(countsRaw.all), payable: number(countsRaw.payable), receivable: number(countsRaw.receivable), balanced: number(countsRaw.balanced)}, currentBalance: balances("currentBalance"), previousBalance: balances("previousBalance"), cashTotals: cash("cashTotals"), previousCashTotals: cash("previousCashTotals"), trend: array(raw.trend).map((item) => { const row = record(item); return {key: text(row.key), label: text(row.label), payable: number(row.payable), receivable: number(row.receivable), net: number(row.net)}; }), generatedAt: text(raw.generatedAt) };
}

export function adaptCommissionRecords(records: PurchaseCommissionRecord[], mode: "purchase" | "sales"): FinanceCommissionItem[] {
  return records.map((item) => {
    const purchase = mode === "purchase";
    return {id: item.id, inventoryId: item.inventoryId, sn: item.sn, productName: item.productName, handler: purchase ? item.purchaseHandler : item.salesHandler || "未记录", handlerType: purchase ? "采购经办人" : "销售经办人", documentNo: purchase ? item.purchaseInvoiceNo || item.id : item.salesInvoiceNo || item.id, baseAmount: purchase ? item.costPrice : item.salesPrice, salesPrice: item.salesPrice, grossProfit: item.grossProfit, rate: purchase ? item.purchaseRate ?? item.rate : item.salesRate ?? item.rate, commissionAmount: purchase ? item.purchaseCommissionAmount ?? item.commissionAmount : item.salesCommissionAmount ?? item.commissionAmount, status: item.status, createdAt: item.createdAt, settledAt: item.settledAt, remarks: item.remarks};
  });
}

function adaptPermissionOverrides(value: unknown): SettingsUserItem["permissionOverrides"] {
  const raw = record(value);
  const allowedMenus = Array.isArray(raw.allowedMenus) ? raw.allowedMenus.filter((item): item is string => typeof item === "string") : undefined;
  return {
    ...(allowedMenus ? {allowedMenus} : {}),
    ...(typeof raw.showCost === "boolean" ? {showCost: raw.showCost} : {}),
    ...(typeof raw.showProfit === "boolean" ? {showProfit: raw.showProfit} : {}),
    ...(typeof raw.canDelete === "boolean" ? {canDelete: raw.canDelete} : {}),
    ...(typeof raw.canEditHistory === "boolean" ? {canEditHistory: raw.canEditHistory} : {}),
    ...(typeof raw.canManualOutbound === "boolean" ? {canManualOutbound: raw.canManualOutbound} : {}),
  };
}

export function adaptUser(value: unknown): SettingsUserItem {
  const raw = record(value);
  const overrides = adaptPermissionOverrides(raw.permissionOverrides);
  return {
    id: text(raw.id),
    username: text(raw.username),
    displayName: text(raw.displayName, text(raw.username, "用户")),
    role: text(raw.role, "未知角色"),
    enabled: raw.enabled !== false,
    lastLoginTime: text(raw.lastLoginTime) || undefined,
    remarks: text(raw.remarks) || undefined,
    permissionOverrides: Object.keys(overrides || {}).length > 0 ? overrides : undefined,
  };
}

export function adaptUsers(response: UsersResponseDto): SettingsUserItem[] { return array(response.data).map(adaptUser); }
export function adaptUserMutation(response: UserMutationResponseDto): SettingsUserItem { return adaptUser(response.data); }

function pageMeta(value: unknown, length: number): PagedCollection<AuditLogItem>["meta"] { const raw = record(value); const page = Math.max(1, number(raw.page, 1)); const pageSize = Math.max(1, number(raw.pageSize, length || 100)); const total = Math.max(length, number(raw.total, length)); return {page, pageSize, total, totalPages: Math.max(1, number(raw.totalPages, Math.ceil(total / pageSize)))}; }
export function adaptLogs(response: LogsResponseDto): PagedCollection<AuditLogItem> { const data = record(response.data); const items = array(data.logs).map((value) => { const raw = record(value); return {id: text(raw.id), user: text(raw.user), time: text(raw.time), module: text(raw.module), type: text(raw.type), target: text(raw.target), beforeVal: text(raw.beforeVal) || undefined, afterVal: text(raw.afterVal) || undefined}; }); return {items, meta: pageMeta(data.meta, items.length)}; }
