export const customerLevels = ["S级", "A级", "B级", "C级", "D级", "R级"] as const;
export type CustomerLevel = typeof customerLevels[number];

/**
 * Stable option contract for the shared customer / partner picker.
 *
 * Feature models (sales, purchase, CRM) may add business-specific fields,
 * but the picker itself only depends on this projection. Keeping the
 * contract here prevents each feature from creating a visually identical,
 * incompatible selector.
 */
export type CustomerPartnerType = "customer" | "vendor";

export interface CustomerPickerOption {
  id: string;
  name: string;
  partnerType: CustomerPartnerType;
  contact: string;
  phone?: string;
  wechat?: string;
  qq?: string;
  level?: string;
  source?: string;
  type?: string;
  status?: string;
  selectable: boolean;
  unavailableReason?: string;
}

export interface CustomerDirectoryItem {
  id: string;
  name: string;
  phone?: string;
  wechat?: string;
  qq?: string;
  contact: string;
  city?: string;
  company?: string;
  source: string;
  type: string;
  level: CustomerLevel;
  suggestedLevel?: CustomerLevel;
  isCoreCustomer: boolean;
  levelReason?: string;
  riskReason?: string;
  crmStatus: string;
  crmStage?: string;
  owner?: string;
  intent?: string;
  totalAmount: number;
  totalProfit?: number;
  buyCount: number;
  recycleCount: number;
  aftersalesCount: number;
  receivableBalance: number;
  payableBalance: number;
  lastDealTime?: string;
  remarks?: string;
  tags: string[];
}

export interface CustomerDirectorySnapshot {
  customers: CustomerDirectoryItem[];
  channels: string[];
  types: string[];
  levels: CustomerLevel[];
  page: number;
  pageSize: number;
  total: number;
  summary: {coreCount: number; receivable: number; payable: number};
}

export interface CustomerDirectoryFilters {
  keyword: string;
  type: string;
  channel: string;
  level: string;
  page: number;
  pageSize: number;
}

export interface CustomerRecordFormValues {
  name: string;
  contact: string;
  type: string;
  source: string;
  level: CustomerLevel;
  isCoreCustomer: boolean;
  riskReason: string;
  remarks: string;
}
