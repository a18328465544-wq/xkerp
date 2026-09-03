import type {PaymentOutRecord} from "./finance-records";
import type {PurchaseItem} from "./purchase";
import type {SalesItem} from "./sales";

export type ReturnOrderType = "销售退货" | "进货退货";
export type ReturnOrderStatus = "待处理" | "已完成" | "已作废";
export type ReturnSettlementMode = "原路退款" | "抵扣账款" | "直接冲销";
export type ReturnInventoryAction =
  | "退回待检测"
  | "退回入库"
  | "退回供应商"
  | "直接报废";

export interface ReturnRefundAllocation {
  sourcePaymentRecordId: string;
  accountId: string;
  accountName: string;
  paymentMethod: string;
  amount: number;
}

/**
 * A return order may contain several physical inventory lines when the whole
 * source document is being returned. The snapshot is kept so a completed
 * return can still be reversed safely even after the source invoice changes.
 */
export interface ReturnOrderItem {
  sourceInventoryId: string;
  sourceSalesItemId?: string;
  sourceSalesItemIndex?: number;
  sourceSalesItemSnapshot?: SalesItem;
  sourcePurchaseItemId?: string;
  sourcePurchaseItemIndex?: number;
  sourcePurchaseItemSnapshot?: PurchaseItem;
  productId?: string;
  productName?: string;
  sn?: string;
  amount: number;
}

export interface ReturnOrderBatchItemInput {
  sourceInventoryId: string;
  sourceSalesItemIndex?: number;
  sourcePurchaseItemIndex?: number;
}

export interface ReturnOrder {
  id: string;
  returnNo: string;
  type: ReturnOrderType;
  status: ReturnOrderStatus;
  date: string;
  relatedDocType: "销售单" | "采购单" | string;
  relatedDocNo: string;
  /** Present when one return order covers the whole source document. */
  batchMode?: "整单退货";
  items?: ReturnOrderItem[];
  sourceInventoryId?: string;
  sourceSalesItemId?: string;
  sourceSalesItemIndex?: number;
  sourceSalesItemSnapshot?: SalesItem;
  sourcePurchaseItemId?: string;
  sourcePurchaseItemIndex?: number;
  sourcePurchaseItemSnapshot?: PurchaseItem;
  productId?: string;
  productName?: string;
  sn?: string;
  partyId?: string;
  partyType?: "customer" | "vendor";
  partyName?: string;
  contact?: string;
  amount: number;
  settlementMode: ReturnSettlementMode;
  settlementAccountId?: string;
  settlementAccountName?: string;
  paymentRecordId?: string;
  refundPaymentRecordIds?: string[];
  refundAllocations?: ReturnRefundAllocation[];
  reversedPaymentSnapshot?: PaymentOutRecord;
  creditAmount?: number;
  vendorCreditAmount?: number;
  releasedVendorCreditAmount?: number;
  cashReleasedAmount?: number;
  handler: string;
  reason: string;
  responsibility?: "客户" | "供应商" | "平台" | "本店" | "其他";
  inventoryAction: ReturnInventoryAction;
  completedAt?: string;
  remarks?: string;
}

export interface SalesReturnFormValues {
  date: string;
  relatedDocNo: string;
  sourceInventoryId: string;
  sourceSalesItemIndex: number;
  productId: string;
  productName: string;
  sn: string;
  partyName: string;
  partyId?: string;
  contact: string;
  amount: number;
  inventoryAction: Extract<ReturnInventoryAction, "退回待检测" | "直接报废">;
  reason: string;
  responsibility: "客户" | "供应商" | "平台" | "本店" | "其他";
  handler: string;
  remarks: string;
  returnScope?: "single" | "document";
  returnItems?: ReturnOrderBatchItemInput[];
}

export interface ReturnCreateResponse {
  data?: ReturnOrder;
  state?: unknown;
}

export type SalesReturnStatus = "待处理" | "已完成" | "已作废";

export interface SalesReturnListFilters {
  keyword: string;
  status: "" | SalesReturnStatus;
  page: number;
  pageSize: number;
}

export interface SalesReturnListItem {
  id: string;
  returnNo: string;
  type: "销售退货" | "进货退货";
  status: SalesReturnStatus;
  date: string;
  relatedDocNo: string;
  sourceInventoryId: string;
  /** All inventory cards covered by a whole-document return. */
  sourceInventoryIds?: string[];
  productId: string;
  productName: string;
  sn: string;
  partyId: string;
  partyName: string;
  contact: string;
  amount: number;
  settlementMode: string;
  settlementAccountName: string;
  creditAmount: number;
  vendorCreditAmount: number;
  releasedVendorCreditAmount: number;
  cashReleasedAmount: number;
  handler: string;
  reason: string;
  responsibility: string;
  inventoryAction: string;
  completedAt: string;
  remarks: string;
}

export type PurchaseReturnListItem = SalesReturnListItem;
export type PurchaseReturnListFilters = SalesReturnListFilters;

export interface PurchaseReturnFormValues {
  date: string;
  relatedDocNo: string;
  sourceInventoryId: string;
  amount: number;
  settlementMode: "原路退款" | "抵扣账款" | "直接冲销";
  settlementAccountId: string;
  handler: string;
  reason: string;
  inventoryAction: "退回供应商" | "直接报废";
  remarks: string;
  returnScope?: "single" | "document";
  returnItems?: ReturnOrderBatchItemInput[];
}

export interface SalesReturnListDataset {
  items: SalesReturnListItem[];
  meta: {page: number; pageSize: number; total: number; totalPages: number};
}

export interface SalesReturnCompleteResult {
  id: string;
  returnNo: string;
  status: SalesReturnStatus;
  completedAt: string;
}
