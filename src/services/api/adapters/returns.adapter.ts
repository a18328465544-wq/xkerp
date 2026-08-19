import type {SalesReturnCompleteResult, SalesReturnListDataset, SalesReturnListItem, SalesReturnStatus} from "@/src/types/returns";
import type {PurchaseReturnFormValues} from "@/src/types/returns";
import type {PurchaseReturnCreateRequestDto, SalesReturnUpdateRequestDto} from "../dto/returns.dto";

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? value as Record<string, unknown> : {};
}

function text(value: unknown, fallback = "") {
  return typeof value === "string" ? value : value === null || value === undefined ? fallback : String(value);
}

function numberValue(value: unknown, fallback = 0) {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function statusValue(value: unknown): SalesReturnStatus {
  return value === "已完成" || value === "已作废" ? value : "待处理";
}

export function adaptSalesReturnListItem(value: unknown): SalesReturnListItem {
  const dto = record(value);
  return {
    id: text(dto.id || dto.returnNo),
    returnNo: text(dto.returnNo || dto.id),
    type: dto.type === "进货退货" ? "进货退货" : "销售退货",
    status: statusValue(dto.status),
    date: text(dto.date),
    relatedDocNo: text(dto.relatedDocNo),
    sourceInventoryId: text(dto.sourceInventoryId),
    productId: text(dto.productId),
    productName: text(dto.productName, "未命名商品"),
    sn: text(dto.sn),
    partyId: text(dto.partyId),
    partyName: text(dto.partyName),
    contact: text(dto.contact),
    amount: numberValue(dto.amount),
    settlementMode: text(dto.settlementMode),
    settlementAccountName: text(dto.settlementAccountName),
    creditAmount: numberValue(dto.creditAmount),
    vendorCreditAmount: numberValue(dto.vendorCreditAmount),
    releasedVendorCreditAmount: numberValue(dto.releasedVendorCreditAmount),
    cashReleasedAmount: numberValue(dto.cashReleasedAmount),
    handler: text(dto.handler),
    reason: text(dto.reason),
    responsibility: text(dto.responsibility),
    inventoryAction: text(dto.inventoryAction),
    completedAt: text(dto.completedAt),
    remarks: text(dto.remarks),
  };
}

export function adaptSalesReturnList(response: {data?: unknown}): SalesReturnListDataset {
  return adaptReturnList(response, "销售退货");
}

function adaptReturnList(response: {data?: unknown}, type: "销售退货" | "进货退货"): SalesReturnListDataset {
  const payload = record(response.data);
  const rawItems = Array.isArray(payload.data) ? payload.data : [];
  const meta = record(payload.meta);
  const page = Math.max(1, Math.floor(numberValue(meta.page, 1)));
  const pageSize = Math.max(1, Math.floor(numberValue(meta.pageSize, 20)));
  const items = rawItems
    .filter((item) => record(item).type === type)
    .map(adaptSalesReturnListItem)
    .filter((item) => Boolean(item.id));
  const total = Math.max(items.length, Math.floor(numberValue(meta.total, items.length)));
  return {items, meta: {page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize))}};
}

export function adaptPurchaseReturnList(response: {data?: unknown}): SalesReturnListDataset {
  return adaptReturnList(response, "进货退货");
}

export function adaptSalesReturnComplete(value: unknown): SalesReturnCompleteResult {
  const dto = record(value);
  return {
    id: text(dto.id || dto.returnNo),
    returnNo: text(dto.returnNo || dto.id),
    status: statusValue(dto.status),
    completedAt: text(dto.completedAt),
  };
}

export function toSalesReturnUpdateRequestDto(values: Pick<SalesReturnListItem, "handler" | "reason" | "remarks">): SalesReturnUpdateRequestDto {
  return {
    handler: values.handler.trim(),
    reason: values.reason.trim(),
    remarks: values.remarks.trim(),
  };
}

export function adaptSalesReturnMutation(value: unknown): SalesReturnListItem | null {
  const candidate = record(value);
  const data = record(candidate.data);
  const source = Object.keys(data).length > 0 ? data : candidate;
  return text(source.id || source.returnNo) ? adaptSalesReturnListItem(source) : null;
}

export function toPurchaseReturnRequestDto(values: PurchaseReturnFormValues): PurchaseReturnCreateRequestDto {
  return {
    type: "进货退货",
    relatedDocType: "采购单",
    date: values.date,
    relatedDocNo: values.relatedDocNo.trim(),
    sourceInventoryId: values.sourceInventoryId.trim(),
    amount: numberValue(values.amount),
    settlementMode: values.settlementMode,
    settlementAccountId: values.settlementAccountId.trim() || undefined,
    handler: values.handler.trim(),
    reason: values.reason.trim(),
    inventoryAction: values.inventoryAction,
    remarks: values.remarks.trim() || undefined,
  };
}
