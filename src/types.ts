/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export type ProductCategory =
  | "显卡"
  | "CPU"
  | "主板"
  | "内存"
  | "硬盘"
  | "电源"
  | "散热"
  | "机箱"
  | "整机"
  | "组装拆卸"
  | "其他配件";

export interface ProductTemplate {
  id: string;
  name: string;
  category?: ProductCategory; // Hardware Category
  model: string; // e.g. "RTX 4090", "Core i9-14900K"
  brand: string; // e.g. "华硕", "Intel", "AMD"
  version: string; // e.g. "ROG 猛禽", "盒装", "黑盒"
  vram: string; // e.g. "24G", "16G", "12G", or capacity like "32G", "2TB", "1000W"
  refBuyPrice: number;
  refSellPrice: number;
  currentStock: number;
  lastBuyPrice?: number;
  lastSellPrice?: number;
  lastDealTime?: string;
  remarks?: string;
}

export type CardStatus =
  | "待检测"
  | "检测中"
  | "已入库"
  | "已上架"
  | "已锁定"
  | "已售出"
  | "已拆卸"
  | "已组装"
  | "退货中"
  | "已退货"
  | "售后中"
  | "维修中"
  | "已报废";

export type SourceType =
  | "个人回收"
  | "同行拿货"
  | "批量采购"
  | "客户置换"
  | "门店自采"
  | "门市自采";

export interface CardInventory {
  id: string; // format: KC-yyyyMMdd-XXXX
  productId: string;
  productName: string;
  category?: ProductCategory; // Hardware Category
  model: string;
  brand: string;
  version: string;
  vram: string;
  sn: string;
  expressNo?: string;
  sourceType: SourceType;
  supplierName: string;
  costPrice: number;
  estSellPrice: number;
  marketPrice: number; // For risk pricing warnings
  status: CardStatus;
  condition: "全新官换" | "充新99新" | "靓机95新" | "良品90新" | "微划伤85新" | "瑕疵实用" | "矿卡高阻值";
  inWarranty: boolean;
  warrantyDate?: string;
  repaired: boolean;
  gpuRisk: boolean; // Is it a high mining card risk or high failure risk
  fullBox: boolean; // Original box and booklet included
  warehouseLocation: string; // e.g. "A区货架-03", "B区防静电箱"
  entryTime: string;
  storageDays: number;
  remarks?: string;

  // After sold populated fields
  salesPrice?: number;
  salesTime?: string;
  salesInvoiceId?: string;
  buyerName?: string;
}

export interface InventorySummaryRow {
  key: string;
  productName: string;
  category: ProductCategory;
  brand: string;
  model: string;
  version: string;
  vram: string;
  warehouseLocation: string;
  warehouseLocations?: string[];
  totalCount: number;
  availableCount: number;
  pendingCount: number;
  lockedCount: number;
  soldCount: number;
  repairCount: number;
  totalCost: number;
  totalEstSell: number;
  avgCost: number;
  avgEstSell: number;
  lastEntryTime?: string;
}

export interface InventoryImportRow {
  productName: string;
  category?: ProductCategory;
  brand?: string;
  model?: string;
  version?: string;
  vram?: string;
  quantity?: number;
  warehouseLocation?: string;
  costPrice?: number;
  estSellPrice?: number;
  marketPrice?: number;
  status?: CardStatus;
  supplierName?: string;
  sourceType?: SourceType;
  condition?: CardInventory["condition"];
  remarks?: string;
}

export type InventoryScanMode = "入库" | "出库" | "移库";

export interface InventoryScanResult {
  code: string;
  inventoryId?: string;
  sn?: string;
  productName?: string;
  beforeStatus?: CardStatus;
  afterStatus?: CardStatus;
  beforeLocation?: string;
  afterLocation?: string;
  message: string;
  matched: boolean;
}

export interface InspectionRecord {
  id: string;
  inventoryId: string;
  sn: string;
  condition?: CardInventory["condition"];
  inWarranty?: boolean;
  warrantyDate?: string;
  fullBox?: boolean;
  warehouseLocation?: string;
  inspector: string;
  inspectTime: string;
  exteriorCheck: "完美无瑕" | "轻微刮花" | "氧化发黄" | "挡板生锈" | "严重磕碰";
  fanCheck: "静音顺畅" | "轻微异响" | "抖动偏摆" | "风扇停转";
  portsCheck: "全部正常" | "部分接口无信号" | "物理变形";
  gpuzCheck: "核对一致" | "规格异常 / 假卡山寨";
  furmarkResult: string; // e.g., "烤机 20分钟, 核心72℃, 稳频"
  threedMarkResult: string; // e.g., "压力测试通过率 98.4%"
  vramResult: "全显存测试通过" | "某显卡测试通道错误" | "黄屏/花屏";
  temperature: number; // Max Temp in °C
  wattage: number; // e.g., 450
  noise: "静音" | "适中" | "噪音明显";
  repaired: boolean; 
  hiddenDefects: boolean; // 暗病风险
  resultStatus: "通过" | "轻微问题" | "需要维修" | "拒收入库" | "降价入库";
  remarks?: string;
  images?: string[];
}

export interface PurchaseItem {
  tempId: string; // local UI key
  productId: string;
  productName: string;
  category?: ProductCategory; // Hardware Category
  model: string;
  brand: string;
  version: string;
  vram: string;
  sn: string;
  condition: "全新官换" | "充新99新" | "靓机95新" | "良品90新" | "微划伤85新" | "瑕疵实用" | "矿卡高阻值";
  inWarranty: boolean;
  warrantyDate?: string;
  repaired: boolean;
  gpuRisk: boolean;
  fullBox: boolean;
  buyPrice: number;
  estSellPrice: number;
  warehouseLocation: string;
  remarks?: string;
}

export interface PurchaseInvoice {
  id: string;
  invoiceNo: string;
  date: string;
  sourceType: SourceType;
  supplierName: string;
  contact: string;
  expressNo?: string;
  paymentMethod: string;
  isPaid: boolean;
  paidAmount: number;
  unpaidAmount: number;
  settlementAccountId?: string;
  settlementAccountName?: string;
  paymentHandler?: string;
  paymentStatus?: "未付款" | "部分付款" | "已付款" | "已退款";
  handleBy: string;
  remarks?: string;
  items: PurchaseItem[];
  totalCount: number;
  totalCost: number;
  estTotalSell: number;
  estTotalProfit: number;
}

export interface SalesItem {
  inventoryId: string; // Associated dynamic inventory item
  productId: string;
  productName: string;
  sn: string;
  condition: string;
  costPrice: number;
  sellPrice: number;
  profit: number;
  aftersalesTerms: string;
  remarks?: string;
}

export interface SalesInvoice {
  id: string;
  invoiceNo: string;
  date: string;
  customerName: string;
  contact: string;
  channel: "到店" | "闲鱼" | "抖音" | "小红书" | "B站" | "微信私域" | "同行网店";
  paymentMethod: "微信" | "支付宝" | "现金" | "银行卡" | "账期欠款";
  isPaid: boolean;
  paidAmount: number;
  unpaidAmount: number;
  settlementAccountId?: string;
  settlementAccountName?: string;
  paymentHandler?: string;
  paymentStatus?: "未收款" | "部分收款" | "已收款" | "已退款";
  outboundStatus?: "待出库" | "已出库";
  outboundTime?: string;
  outboundHandler?: string;
  outboundRemarks?: string;
  needInvoice: boolean;
  freeShipping: boolean;
  expressCompany?: string;
  expressNo?: string;
  aftersalesTerms: string; // e.g. "店保半年", "店保三个月", "保到手好"
  handleBy: string;
  remarks?: string;
  items: SalesItem[];
  totalCount: number;
  totalCost: number;
  totalAmount: number;
  totalProfit: number;
}

export interface MarketQuote {
  id: string;
  date: string;
  productId: string;
  productName: string;
  model: string;
  brand: string;
  version: string;
  yestBuyPrice: number;
  todayBuyPrice: number;
  todaySellPrice: number;
  maxPrice: number;
  minPrice: number;
  changeAmount: number; // positive = rise, negative = drop
  changeRatio: number; // percentage value e.g. -1.2
  remarks?: string;

  // Additional fields for MarketQuotes.tsx UI
  trend?: "up" | "down" | "stable";
  fluctuation?: string;
  updateTime?: string;
  refBuyPrice?: number;
  refSellPrice?: number;
  history?: Array<{ date: string; buyPrice: number; sellPrice: number }>;
}

export type AftersalesStatus = "待处理" | "检测中" | "已维修" | "已退款" | "已完成" | "待审核" | "处理中" | "已解决";

export interface AftersalesRecord {
  id: string;
  salesInvoiceNo: string;
  customerName: string;
  contact: string;
  inventoryNo: string;
  productName: string;
  sn: string;
  type: "退货" | "换货" | "维修" | "补差价" | "检测争议";
  desc: string;
  status: AftersalesStatus;
  repairCost: number;
  refundAmount: number;
  finalResult: string;
  createTime: string;
  remarks?: string;

  // Additional fields for AftersalesManager.tsx
  model?: string;
  buyTime?: string;
  actionTaken?: string;
  loss?: number;
  note?: string;
  handler?: string;
}

export interface CustomerCard {
  id: string;
  name: string;
  phone: string;
  wechat: string;
  source: string;
  firstChannel?: string; // Aliases source in PartnerManager.tsx
  type:
    | "个人买家客户"
    | "个人卖家客户"
    | "回收客户"
    | "购买客户"
    | "优质同行"
    | "批发同行"
    | "散客玩家"
    | "售后敏感户"
    | "老主顾";
  crmStatus?: "线索" | "跟进中" | "已成交" | "沉睡" | "流失";
  crmStage?: "新线索" | "需求确认" | "报价中" | "已成交" | "售后维护";
  level?: "普通客户" | "VIP客户" | "重点客户" | "黑名单" | "潜在客户";
  owner?: string;
  intent?: "低" | "中" | "高";
  budget?: number;
  lastFollowTime?: string;
  nextFollowTime?: string;
  lastDealTime: string;
  totalAmount: number;
  totalProfit: number;
  buyCount: number;
  recycleCount: number;
  aftersalesCount: number;
  remarks?: string;
  tags: string[];

  // Compatibility fields for PartnerManager.tsx
  contact?: string;
  totalPurchases?: number;
  debtBalance?: number;
}

export type CrmFollowUpResult = "继续跟进" | "已报价" | "已成交" | "暂缓" | "无效线索" | "售后维护";

export interface CrmFollowUpRecord {
  id: string;
  customerId: string;
  customerName: string;
  contactMethod: "电话" | "微信" | "闲鱼" | "淘宝" | "到店" | "其他";
  content: string;
  result: CrmFollowUpResult;
  handler: string;
  followTime: string;
  nextFollowTime?: string;
  remarks?: string;
}

export interface CrmRequirement {
  id: string;
  customerId: string;
  customerName: string;
  productDemand: string;
  budget: number;
  intent: "低" | "中" | "高";
  stage: "需求确认" | "报价中" | "已成交" | "已关闭";
  source: string;
  handler: string;
  createTime: string;
  expectedDealTime?: string;
  remarks?: string;
}

export interface Vendor {
  id: string;
  name: string;
  partnerCategory?: "个人" | "同行";
  contactPerson: string;
  phone: string;
  type:
    | "收货同行"
    | "卖货同行"
    | "大黄牛"
    | "工作室矿老板"
    | "数码渠道大厂"
    | "闲鱼同行"
    | "门店老熟客"
    | "门市散户"
    | "工作室大宗货源"
    | "批发客户";
  totalBuyAmount: number;
  totalCount: number;
  avgProfit: number;
  aftersalesCount: number;
  aftersalesRate: number; // percentage
  lastDealTime: string;
  accountPayable: number; // 账期欠款
  accountPaid: number;
  remarks?: string;

  // Compatibility fields for PartnerManager.tsx
  contact?: string;
  debtBalance?: number;
  isHighRisk?: boolean;
}

export interface AuditLog {
  id: string;
  user: string;
  time: string;
  module: string;
  type: string; // e.g. "新增显卡", "修改成本价", "销售出库", "质检通过", "删除单据"
  target: string;
  beforeVal?: string;
  afterVal?: string;
}

export interface FinanceLedger {
  id: string;
  time: string;
  relatedId?: string;
  type: string; // e.g. "进货支出", "销售收入", "售后退款", "杂费支出", "员工提成"
  paymentWay: string;
  amount: number; // positive = income, negative = expense
  operator: string;
  status: "已复核" | "未复核" | "已核销" | "待审核" | string;
  settlementAccountId?: string;
  settlementAccountName?: string;
  handler?: string;
  relatedDocType?: string;
  customerName?: string;
  supplierName?: string;
}

export type SettlementAccountType =
  | "现金"
  | "微信"
  | "支付宝"
  | "银行卡"
  | "闲鱼"
  | "淘宝待结算"
  | "对公账户"
  | "老板个人账户"
  | "员工备用金"
  | "其他";

export type SettlementDirection = "收入" | "支出" | "转入" | "转出" | "冲销";

export type SettlementBusinessType =
  | "销售收款"
  | "采购付款"
  | "回收付款"
  | "客户退款"
  | "采购退款"
  | "其他收入"
  | "其他支出"
  | "账户调拨"
  | "员工提成"
  | "运费"
  | "维修费"
  | "平台手续费";

export interface SettlementAccount {
  id: string;
  name: string;
  type: SettlementAccountType;
  owner: string;
  platform: string;
  balance: number;
  availableBalance: number;
  frozenAmount: number;
  enabled: boolean;
  allowNegative: boolean;
  remarks?: string;
  lastChangeTime?: string;
}

export interface SettlementLedger {
  id: string;
  accountId: string;
  accountName: string;
  accountType: SettlementAccountType;
  direction: SettlementDirection;
  incomeAmount: number;
  expenseAmount: number;
  changeAmount: number;
  beforeBalance: number;
  afterBalance: number;
  businessType: SettlementBusinessType;
  relatedDocType?: string;
  relatedDocNo?: string;
  customerName?: string;
  supplierName?: string;
  handler: string;
  createdBy: string;
  time: string;
  remarks?: string;
}

export interface PaymentInRecord {
  id: string;
  customerName: string;
  accountId: string;
  accountName: string;
  amount: number;
  handler: string;
  paymentMethod: string;
  relatedDocType?: string;
  relatedDocNo?: string;
  time: string;
  remarks?: string;
}

export interface PaymentOutRecord {
  id: string;
  supplierName?: string;
  customerName?: string;
  accountId: string;
  accountName: string;
  amount: number;
  handler: string;
  paymentMethod: string;
  businessType: SettlementBusinessType;
  relatedDocType?: string;
  relatedDocNo?: string;
  time: string;
  remarks?: string;
}

export interface AccountTransferRecord {
  id: string;
  fromAccountId: string;
  fromAccountName: string;
  toAccountId: string;
  toAccountName: string;
  amount: number;
  fee: number;
  receivedAmount: number;
  handler: string;
  time: string;
  remarks?: string;
}

export type AssemblyOperationType = "拆卸" | "组装";

export interface AssemblyPartRecord {
  partName: string;
  category: ProductCategory;
  sn: string;
  remarks?: string;
}

export interface AssemblyOperationRecord {
  id: string;
  type: AssemblyOperationType;
  handler: string;
  time: string;
  beforeSn?: string;
  beforeProductName?: string;
  beforeParts: AssemblyPartRecord[];
  afterSn?: string;
  afterProductName?: string;
  afterCategory?: ProductCategory;
  afterParts: AssemblyPartRecord[];
  remarks?: string;
}

export type StoreRole = "老板" | "店员" | "检测员" | "财务";

export interface PermissionSettings {
  role: StoreRole;
  showCost: boolean;
  showProfit: boolean;
  canDelete: boolean;
  canEditHistory: boolean;
  allowedMenus: string[];
}

export type AccountPermissionOverrides = Partial<Omit<PermissionSettings, "role">>;

export interface SystemUserAccount {
  id: string;
  username: string;
  password?: string;
  displayName: string;
  role: StoreRole;
  enabled: boolean;
  permissionOverrides?: AccountPermissionOverrides;
  lastLoginTime?: string;
  remarks?: string;
}

export type SafeSystemUserAccount = Omit<SystemUserAccount, "password">;
