export type CrmBusinessStatus = "线索" | "跟进中" | "已成交" | "沉睡" | "流失" | string;
export type CrmIntent = "低" | "中" | "高" | string;

export interface CrmAccount {
  id: string;
  legacyCustomerId?: string;
  accountType: "individual" | "company";
  displayName: string;
  businessStatus: CrmBusinessStatus;
  normalizedStatus: string;
  stage?: string;
  level?: string;
  isCoreCustomer: boolean;
  owner?: string;
  intent?: CrmIntent;
  source?: string;
  phone?: string;
  wechat?: string;
  qq?: string;
  city?: string;
  companyName?: string;
  roles: string[];
  contactCount: number;
  lastContactAt?: string;
  nextFollowAt?: string;
  nextAction?: string;
  dealProbability?: number;
  estimatedAmount?: number;
  remarks?: string;
  tags: string[];
  updatedAt: string;
}

export interface CrmAccountFilters {
  keyword: string;
  owner: string;
  page: number;
  pageSize: number;
}

export interface CrmAccountPage {
  items: CrmAccount[];
  page: number;
  pageSize: number;
  total: number;
}

export interface CrmTimelineEvent {
  id: string;
  eventType: string;
  sourceType: string;
  sourceId: string;
  summary: string;
  actorId?: string;
  occurredAt: string;
}

export interface CrmTimelinePage {
  items: CrmTimelineEvent[];
  page: number;
  pageSize: number;
  total: number;
}

export interface CrmOwnerSummary {
  owner: string;
  customers: number;
  followUps: number;
  requirements: number;
  highIntent: number;
}

export interface CrmSummary {
  totals: {
    customers: number;
    leads: number;
    following: number;
    deals: number;
    highIntent: number;
    pendingFollowUps: number;
    requirements: number;
  };
  owners: CrmOwnerSummary[];
}

export type CrmFollowUpResult = "继续跟进" | "已报价" | "已成交" | "暂缓" | "无效线索" | "售后维护";
export type CrmContactMethod = "电话" | "微信" | "闲鱼" | "淘宝" | "到店" | "其他";

export interface CrmFollowUpFormValues {
  customerId: string;
  contactMethod: CrmContactMethod;
  content: string;
  result: CrmFollowUpResult;
  nextFollowTime: string;
  nextAction: string;
  dealProbability: number;
  estimatedAmount: number;
  remarks: string;
}

export type QuickCaptureSourceType = "manual" | "chat" | "voice";
export type CrmLeadStage = "新线索" | "需求确认" | "报价中" | "已成交" | "已关闭";
export type CrmLeadPriority = "低" | "中" | "高";
export type QuickCaptureIntentType = "求购" | "出售" | "回收" | "置换" | "其他";
export type QuickCaptureTransactionType = "销售" | "回收" | "采购" | "置换" | "其他";
export type QuickCaptureDeliveryMethod = "到店" | "快递" | "同城配送" | "未知";

export interface QuickCaptureConflict {
  field: string;
  values: string[];
  message: string;
}

export interface QuickCaptureFields {
  customerName?: string;
  phone?: string;
  wechat?: string;
  qq?: string;
  city?: string;
  company?: string;
  source?: string;
  intentType?: QuickCaptureIntentType;
  productCategory?: ProductCategory;
  productName?: string;
  productModel?: string;
  productId?: string;
  quantity?: number;
  expectedPrice?: number;
  quotedPrice?: number;
  transactionType?: QuickCaptureTransactionType;
  deliveryMethod?: QuickCaptureDeliveryMethod;
  followUpTime?: string;
  priority?: CrmLeadPriority;
  stage?: CrmLeadStage;
  tags: string[];
  note?: string;
}

export interface ProductMatchCandidate {
  productId: string;
  productName: string;
  model?: string;
  brand?: string;
  category?: ProductCategory;
  score: number;
  reasons: string[];
}

export interface CustomerMatchCandidate {
  customerId: string;
  name: string;
  contact?: string;
  wechat?: string;
  source?: string;
  level?: CustomerLevel;
  owner?: string;
  score: number;
  reasons: string[];
}

export interface QuickCaptureParseResult {
  parseId: string;
  rawText: string;
  sourceType: QuickCaptureSourceType;
  fields: QuickCaptureFields;
  confidence: number;
  missingFields: string[];
  conflicts: QuickCaptureConflict[];
  customerCandidates: CustomerMatchCandidate[];
  productCandidates: ProductMatchCandidate[];
  source: "ai" | "rules";
  model?: string;
  parsedAt: string;
}

export interface QuickCaptureConfirmInput {
  parseId: string;
  rawText: string;
  sourceType?: QuickCaptureSourceType;
  fields: QuickCaptureFields;
  confidence?: number;
  missingFields?: string[];
  conflicts?: QuickCaptureConflict[];
  matchAction: "link_existing" | "create_new";
  matchedCustomerId?: string;
  idempotencyKey?: string;
}
import type {CustomerLevel} from "./customer";
import type {ProductCategory} from "./core";
