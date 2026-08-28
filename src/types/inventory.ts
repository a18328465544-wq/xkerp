export const inventoryStatuses = [
  "待检测",
  "检测中",
  "已入库",
  "已上架",
  "已锁定",
  "已售出",
  "已拆卸",
  "已组装",
  "退货中",
  "已退货",
  "售后中",
  "维修中",
  "已报废",
] as const;

export type InventoryStatusValue = (typeof inventoryStatuses)[number];
export type InventoryCondition = "全新" | "99新" | "95新" | "90新" | "85新" | "轻微瑕疵" | "损坏";
export type InventoryRisk = "mined" | "upturned" | "high";
export type InventoryView = "cards" | "models";
export type InventorySortKey = "id" | "product" | "cost" | "profit" | "days" | "status" | "warehouseLocation" | "entryTime";
export type InventorySortDirection = "asc" | "desc";

export interface InventoryFilters {
  keyword: string;
  brand: string;
  model: string;
  warehouseLocation: string;
  condition: string;
  inspectionStatus: string;
  status: string;
  entryStart: string;
  entryEnd: string;
  risk: InventoryRisk | "";
  minStorageDays: string;
  maxStorageDays: string;
  minProfitMargin: string;
  activeOnly: boolean;
  includeSold: boolean;
  page: number;
  pageSize: number;
  sortKey: InventorySortKey;
  sortDirection: InventorySortDirection;
}

export interface InventoryListItem {
  id: string;
  productId: string;
  productName: string;
  category: string;
  serialNumber: string;
  brand: string;
  model: string;
  version: string;
  vram: string;
  condition: string;
  warehouse: string;
  inspectionStatus: string;
  inventoryStatus: InventoryStatusValue;
  sourceType: string;
  supplierName: string;
  costPrice?: number;
  estimatedSellPrice?: number;
  marketPrice?: number;
  estimatedProfit?: number;
  actualProfit?: number;
  entryTime: string;
  inventoryDays: number;
  inWarranty: boolean;
  warrantyDate?: string;
  repaired: boolean;
  gpuRisk: boolean;
  fullBox: boolean;
  remarks?: string;
  salesPrice?: number;
  salesTime?: string;
  salesInvoiceId?: string;
  buyerName?: string;
  imageUrl?: string;
}

export interface InventoryPageMeta {
  page: number;
  pageSize: number;
  total: number;
}

export interface InventoryListResult {
  data: InventoryListItem[];
  meta: InventoryPageMeta;
}

export interface InventorySummary {
  totalCount: number;
  availableCount: number;
  pendingCount: number;
  lockedCount: number;
  soldCount: number;
  totalCost?: number;
  totalEstSell?: number;
}

/**
 * Inventory grouped by the product identity used by the server summary
 * endpoint. This is intentionally separate from InventorySummary: the latter
 * is the compact KPI contract used by existing pages, while this model keeps
 * the rows needed by the aggregate inventory view.
 */
export interface InventoryModelSummary {
  key: string;
  productName: string;
  category: string;
  brand: string;
  model: string;
  version: string;
  vram: string;
  warehouseLocation: string;
  warehouseLocations: string[];
  totalCount: number;
  availableCount: number;
  pendingCount: number;
  lockedCount: number;
  soldCount: number;
  repairCount: number;
  totalCost?: number;
  totalEstSell?: number;
  avgCost?: number;
  avgEstSell?: number;
  estimatedProfit?: number;
  lastEntryTime?: string;
}

export interface InventoryDetailResult {
  item: InventoryListItem | null;
  fallback: boolean;
}

export type InventoryJourneyEventType =
  | "purchase"
  | "inspection"
  | "inventory"
  | "sale"
  | "payment"
  | "aftersales"
  | "return"
  | "assembly";

export interface InventoryJourneyEvent {
  id: string;
  type: InventoryJourneyEventType;
  title: string;
  occurredAt: string;
  documentNo?: string;
  partyName?: string;
  operator?: string;
  amount?: number;
  direction?: "in" | "out" | "neutral";
  status?: string;
  description?: string;
}

export interface InventoryJourneyPurchase {
  documentNo: string;
  date: string;
  sourceType: string;
  supplierName: string;
  handler: string;
  costPrice?: number;
  paymentStatus?: string;
}

export interface InventoryJourneyInspection {
  id: string;
  resultStatus: string;
  condition?: string;
  inspector: string;
  inspectTime: string;
  remarks?: string;
}

export interface InventoryJourneySale {
  documentNo: string;
  date: string;
  customerId?: string;
  customerName: string;
  channel?: string;
  paymentMethod?: string;
  paymentStatus?: string;
  paidAmount?: number;
  unpaidAmount?: number;
  sellPrice?: number;
  costPrice?: number;
  grossProfit?: number;
  grossMargin?: number;
  handleBy?: string;
  outboundTime?: string;
  outboundHandler?: string;
}

export interface InventoryJourneyPayment {
  id: string;
  direction: "in" | "out";
  amount?: number;
  accountName: string;
  paymentMethod: string;
  businessType?: string;
  relatedDocNo?: string;
  time: string;
  handler: string;
}

export interface InventoryJourneyAftersales {
  id: string;
  type: string;
  status: string;
  createdAt: string;
  customerName: string;
  description: string;
  repairCost?: number;
  refundAmount?: number;
  finalResult?: string;
  handler?: string;
  salesInvoiceNo?: string;
}

export interface InventoryJourneyReturn {
  id: string;
  returnNo: string;
  type: string;
  status: string;
  date: string;
  completedAt?: string;
  relatedDocNo?: string;
  partyName?: string;
  amount?: number;
  settlementMode?: string;
  inventoryAction?: string;
  handler?: string;
  reason?: string;
}

export interface InventoryJourneyAssembly {
  id: string;
  type: string;
  time: string;
  handler: string;
  beforeProductName?: string;
  afterProductName?: string;
  documentNo: string;
  remarks?: string;
}

export interface InventoryJourneyDataQuality {
  complete: boolean;
  missing: string[];
  legacy: boolean;
}

export interface InventoryJourney {
  card: InventoryListItem;
  purchase?: InventoryJourneyPurchase;
  inspections: InventoryJourneyInspection[];
  sale?: InventoryJourneySale;
  payments: InventoryJourneyPayment[];
  aftersales: InventoryJourneyAftersales[];
  returns: InventoryJourneyReturn[];
  assemblies: InventoryJourneyAssembly[];
  events: InventoryJourneyEvent[];
  dataQuality: InventoryJourneyDataQuality;
  generatedAt: string;
}
