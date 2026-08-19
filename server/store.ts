import { createHash } from "node:crypto";
import type {
  AftersalesRecord,
  AccountTransferRecord,
  AssemblyOperationRecord,
  AssemblyPartRecord,
  AuditLog,
  CardInventory,
  CommissionRules,
  CardStatus,
  CrmFollowUpRecord,
  CrmQuote,
  CrmRequirement,
  CustomerCard,
  CustomerLevel,
  FinanceLedger,
  InspectionRecord,
  InventoryScanMode,
  InventoryScanResult,
  InventoryImportRow,
  InventorySummaryRow,
  MarketQuote,
  PaymentInRecord,
  PaymentOutRecord,
  PermissionSettings,
  PurchaseCommissionRecord,
  PurchaseItem,
  ProductTemplate,
  ProductCategory,
  PurchaseInvoice,
  ReturnRefundAllocation,
  ReturnOrder,
  SalesItem,
  SalesInvoice,
  SettlementAccount,
  SettlementBusinessType,
  SettlementDirection,
  SettlementLedger,
  StoreRole,
  SystemUserAccount,
  Vendor,
} from "../src/types.ts";
import {
  initialAftersales,
  initialCustomers,
  initialCrmFollowUps,
  initialCrmQuotes,
  initialCrmRequirements,
  initialInspections,
  initialInventory,
  initialLogs,
  initialMarketQuotes,
  initialProducts,
  initialPurchaseInvoices,
  initialSalesInvoices,
  initialVendors,
} from "../src/data/demoData.ts";
import { defaultPermissions, initialSystemUsers } from "../src/data/systemDefaults.ts";
import { normalizeAllowedMenus } from "../src/utils/menu.ts";
import { matchesInventoryListFilters, type InventoryListFilters } from "../src/utils/inventoryFilters.ts";
import { matchesKeyword } from "../src/utils/search.ts";
import { shouldReserveSalesInvoiceInventory } from "../src/utils/salesInventory.ts";
import { createProductIdentityIndex, resolveProductIdentity, resolveProductIdentityKey, sameProductIdentity } from "../src/utils/productIdentity.ts";
import { storeDate, storeDateKey, storeDateTime } from "../src/utils/storeTime.ts";
import { isInventoryLinkedToAssembly, isInventoryLinkedToPurchase } from "../src/utils/inventoryRelations.ts";
import { hashPassword, isPasswordHash, sanitizeUserAccount, verifyPassword } from "./security.ts";
import { ConflictError, NotFoundError, UnauthorizedError, ValidationError } from "./errors.ts";
import { generateEntityId, nextDailyDocumentSequence, nextProductTemplateId } from "./storeIdentifiers.ts";
import { calculateCommission, DEFAULT_COMMISSION_RULES, normalizeCommissionRules, type CommissionRulesPatch } from "../src/utils/commissionRules.ts";

export interface AppState {
  products: ProductTemplate[];
  inventory: CardInventory[];
  inspections: InspectionRecord[];
  purchaseInvoices: PurchaseInvoice[];
  salesInvoices: SalesInvoice[];
  purchaseCommissions: PurchaseCommissionRecord[];
  commissionRules: CommissionRules;
  marketQuotes: MarketQuote[];
  aftersales: AftersalesRecord[];
  customers: CustomerCard[];
  crmFollowUps: CrmFollowUpRecord[];
  crmRequirements: CrmRequirement[];
  crmQuotes: CrmQuote[];
  vendors: Vendor[];
  logs: AuditLog[];
  financeLedger: FinanceLedger[];
  settlementAccounts: SettlementAccount[];
  settlementLedger: SettlementLedger[];
  paymentInRecords: PaymentInRecord[];
  paymentOutRecords: PaymentOutRecord[];
  accountTransfers: AccountTransferRecord[];
  assemblyOperations: AssemblyOperationRecord[];
  returnOrders: ReturnOrder[];
  currentRole: StoreRole;
  customPermissions: PermissionSettings[];
  systemUsers: SystemUserAccount[];
  currentUserId?: string;
}

export interface StoreActionContext {
  userId?: string;
  role?: StoreRole;
  actor?: string;
}

const PRODUCT_STOCK_EXCLUDED_STATUSES = new Set<CardStatus>(["已售出", "已退货", "已报废", "已拆卸", "已组装"]);
const NON_OPERATING_INCOME_TYPES = new Set<string>(["赔偿收入", "返点收入", "配件销售", "利息收入", "其他收入"]);
const NON_OPERATING_EXPENSE_TYPES = new Set<string>(["员工费用", "运费支出", "办公费用", "罚款支出", "差旅招待", "其他支出"]);
const LEGACY_CONDITION_MAP: Record<string, CardInventory["condition"]> = {
  "全新官换": "全新",
  "充新99新": "99新",
  "靓机95新": "95新",
  "良品90新": "90新",
  "微划伤85新": "85新",
  "瑕疵实用": "轻微瑕疵",
  "矿卡高阻值": "损坏",
};

// Audit logs are append-only and grow forever. Every mutating request persists the whole logs
// collection, so an unbounded log table makes each submit slower over time. Cap the in-memory
// buffer so the persisted log table (and per-submit write cost) stays bounded.
export const MAX_LOG_ENTRIES = 10000;

function normalizeCondition(condition: string | undefined): CardInventory["condition"] | undefined {
  if (!condition) return undefined;
  return LEGACY_CONDITION_MAP[condition] || (condition as CardInventory["condition"]);
}

export function normalizeStateConditions(state: AppState) {
  state.inventory = state.inventory.map((card) => ({
    ...card,
    condition: normalizeCondition(card.condition) || card.condition,
  }));
  state.inspections = state.inspections.map((record) => ({
    ...record,
    condition: normalizeCondition(record.condition) || record.condition,
  }));
  state.purchaseInvoices = state.purchaseInvoices.map((invoice) => ({
    ...invoice,
    items: invoice.items.map((item) => ({
      ...item,
      condition: normalizeCondition(item.condition) || item.condition,
    })),
  }));
  state.salesInvoices = state.salesInvoices.map((invoice) => ({
    ...invoice,
    items: invoice.items.map((item) => ({
      ...item,
      condition: normalizeCondition(item.condition) || item.condition,
    })),
  }));
  // 售后状态曾经历过两套命名。入库时统一为当前工作流，避免前端筛选和
  // 实际业务状态不一致；历史“已退款/已维修”均视为已经处理完成。
  const legacyAftersalesStatus: Record<string, AftersalesRecord["status"]> = {
    "待审核": "待处理",
    "处理中": "检测中",
    "已解决": "已完成",
    "已维修": "已完成",
    "已退款": "已完成",
  };
  state.aftersales = state.aftersales.map((claim) => ({
    ...claim,
    status: legacyAftersalesStatus[claim.status] || claim.status,
  }));
  // Vendor archives historically exposed only accountPayable, which is the amount the store
  // owes the vendor. Keep the newly separated receivable direction explicit on every load.
  state.vendors = state.vendors.map((vendor) => {
    const legacySalesReceivable = vendor.accountReceivable === undefined
      ? state.salesInvoices
        .filter((invoice) => {
          if ((invoice.customerPartnerType || "customer") !== "vendor") return false;
          if (invoice.customerId) return invoice.customerId === vendor.id;
          return state.vendors.filter((item) => item.name.trim() === invoice.customerName.trim()).length === 1 && vendor.name.trim() === invoice.customerName.trim();
        })
        .reduce((sum, invoice) => sum + Math.max(0, Number(invoice.unpaidAmount) || 0), 0)
      : Number(vendor.accountReceivable);
    return {
      ...vendor,
      accountPayable: Math.max(0, Number(vendor.accountPayable ?? vendor.debtBalance ?? 0) || 0),
      accountReceivable: Math.max(0, legacySalesReceivable || 0),
    };
  });
  // Upgrade every legacy plaintext credential during state loading, rather than waiting for the
  // individual account to log in. Database initialization persists the upgraded rows.
  state.systemUsers = state.systemUsers.map((user) => ({
    ...user,
    password: isPasswordHash(user.password) ? user.password : hashPassword(user.password),
  }));
  return state;
}

function syncProductCurrentStock(state: Pick<AppState, "products" | "inventory">) {
  // Build the stock index once. The previous implementation filtered the entire inventory once
  // per product on every audit log, which becomes O(products × inventory) as the catalogue grows.
  const stockByProductId = new Map<string, number>();
  const productIdentityIndex = createProductIdentityIndex(state.products);
  for (const card of state.inventory) {
    if (PRODUCT_STOCK_EXCLUDED_STATUSES.has(card.status)) continue;
    const resolvedProductId = resolveProductIdentity(card, productIdentityIndex);
    if (!resolvedProductId) continue;
    stockByProductId.set(resolvedProductId, (stockByProductId.get(resolvedProductId) || 0) + 1);
  }
  state.products = state.products.map((product) => ({
    ...product,
    currentStock: stockByProductId.get(product.id) || 0,
  }));
}

const SALES_SELLABLE_STATUSES = new Set<CardStatus>(["已入库", "已上架"]);

function salesItemMatchesCard(
  item: Pick<SalesInvoice["items"][number], "productId" | "productName">,
  card: CardInventory,
  productIdentityIndex: ReturnType<typeof createProductIdentityIndex>,
) {
  return sameProductIdentity(item, card, productIdentityIndex);
}

function isCardSellableForSales(card: CardInventory) {
  return SALES_SELLABLE_STATUSES.has(card.status);
}

function lineQuantity(quantity?: number) {
  const parsed = Number(quantity);
  return Number.isFinite(parsed) && parsed > 0 ? Math.max(1, Math.floor(parsed)) : 1;
}

type ProductIdentityLike = {
  id?: string | null;
  productId?: string | null;
  name?: string | null;
  productName?: string | null;
};

type InventoryProductStats = {
  count: number;
  totalCost: number;
};

function productIdentityKey(
  record: ProductIdentityLike,
  productIdentityIndex: ReturnType<typeof createProductIdentityIndex>,
) {
  return resolveProductIdentityKey(record, productIdentityIndex);
}

function buildInventoryById(inventory: CardInventory[]) {
  const inventoryById = new Map<string, CardInventory>();
  inventory.forEach((card) => inventoryById.set(card.id, card));
  return inventoryById;
}

function addPendingNeed(pendingNeedByProduct: Map<string, number>, key: string, quantity: number) {
  if (!key) return;
  pendingNeedByProduct.set(key, (pendingNeedByProduct.get(key) || 0) + quantity);
}

function buildPendingSalesNeedByProduct(
  state: Pick<AppState, "salesInvoices" | "inventory">,
  productIdentityIndex: ReturnType<typeof createProductIdentityIndex>,
  excludeInvoiceId?: string,
) {
  const inventoryById = buildInventoryById(state.inventory);
  const pendingNeedByProduct = new Map<string, number>();
  state.salesInvoices.forEach((invoice) => {
    if (invoice.id === excludeInvoiceId || !shouldReserveSalesInvoiceInventory(invoice)) return;
    invoice.items.forEach((item) => {
      if (item.inventoryId) {
        const linkedCard = inventoryById.get(item.inventoryId);
        if (linkedCard && !isCardSellableForSales(linkedCard)) return;
      }
      addPendingNeed(pendingNeedByProduct, productIdentityKey(item, productIdentityIndex), lineQuantity(item.quantity));
    });
  });
  return pendingNeedByProduct;
}

function buildSellableInventoryStats(
  inventory: CardInventory[],
  productIdentityIndex: ReturnType<typeof createProductIdentityIndex>,
  includeCard: (card: CardInventory) => boolean = isCardSellableForSales,
) {
  const statsByProduct = new Map<string, InventoryProductStats>();
  inventory.forEach((card) => {
    if (!includeCard(card)) return;
    const key = productIdentityKey(card, productIdentityIndex);
    if (!key) return;
    const current = statsByProduct.get(key) || { count: 0, totalCost: 0 };
    current.count += 1;
    current.totalCost += Number(card.costPrice || 0);
    statsByProduct.set(key, current);
  });
  return statsByProduct;
}

// Inventory is tracked one physical unit per card. Keep order-entry quantities convenient for
// the user, but expand them before persisting so SN binding, stock availability and outbound
// scans never have to guess how many physical cards a single line represents.
function expandPurchaseItems(items: PurchaseItem[]) {
  return items.flatMap((item) => {
    const quantity = lineQuantity(item.quantity);
    if (quantity > 1 && item.sn?.trim()) {
      throw new ValidationError(`已填写SN的进货明细数量必须为 1: ${item.productName}`);
    }
    return Array.from({ length: quantity }, (_, index) => ({
      ...item,
      tempId: quantity > 1 ? `${item.tempId || "purchase"}-${index + 1}` : item.tempId,
      quantity: 1,
      sn: quantity > 1 ? "" : item.sn,
    }));
  });
}

function expandSalesItems(items: SalesItem[]) {
  return items.flatMap((item) => {
    const quantity = lineQuantity(item.quantity);
    if (quantity > 1 && item.inventoryId) {
      throw new ValidationError(`已绑定库存卡的销售明细数量必须为 1: ${item.productName}`);
    }
    return Array.from({ length: quantity }, () => ({
      ...item,
      quantity: 1,
      inventoryId: quantity > 1 ? "" : item.inventoryId,
      sn: quantity > 1 ? "" : item.sn,
    }));
  });
}

function countPendingSalesNeedForProduct(state: Pick<AppState, "salesInvoices" | "inventory" | "products">, key: string, name: string, excludeInvoiceId?: string) {
  const productIdentityIndex = createProductIdentityIndex(state.products);
  const productKey = productIdentityKey({ productId: key, productName: name }, productIdentityIndex);
  if (!productKey) return 0;
  return buildPendingSalesNeedByProduct(state, productIdentityIndex, excludeInvoiceId).get(productKey) || 0;
}

export const initialFinanceLedger: FinanceLedger[] = [
  {
    id: "LS-20260529-001",
    time: "2026-05-29 11:20",
    relatedId: "XS-20260529-001",
    type: "销售收入",
    paymentWay: "微信",
    amount: 35500,
    operator: "店长 阿强",
    status: "已复核",
  },
  {
    id: "LS-20260529-002",
    time: "2026-05-29 10:45",
    relatedId: "JH-20260529-001",
    type: "进货支出",
    paymentWay: "对公账户",
    amount: -30500,
    operator: "店长 阿强",
    status: "已复核",
  },
  {
    id: "LS-20260529-003",
    time: "2026-05-29 14:15",
    type: "杂费支出",
    paymentWay: "门市现金",
    amount: -500,
    operator: "店员",
    status: "已复核",
  },
  {
    id: "LS-20260528-001",
    time: "2026-05-28 16:30",
    relatedId: "SH-20260528-001",
    type: "售后退款",
    paymentWay: "支付宝商机",
    amount: -3500,
    operator: "店长 阿强",
    status: "已复核",
  },
  {
    id: "LS-20260527-001",
    time: "2026-05-27 18:00",
    type: "员工提成",
    paymentWay: "银行卡",
    amount: -1200,
    operator: "店长 阿强",
    status: "未复核",
  },
];

const secureInitialUsersByEnvironment = new Map<string, SystemUserAccount[]>();

function secureInitialSystemUsers() {
  const configuredAdminPassword = process.env.BOOTSTRAP_ADMIN_PASSWORD?.trim();
  const production = process.env.NODE_ENV === "production";
  const cacheKey = createHash("sha256")
    .update(`${production ? "production" : "development"}:${configuredAdminPassword || "default"}`)
    .digest("hex");
  const cached = secureInitialUsersByEnvironment.get(cacheKey);
  if (cached) return structuredClone(cached);
  const secured = initialSystemUsers.map((user) => {
    const password = user.role === "老板" && configuredAdminPassword ? configuredAdminPassword : user.password;
    return {
      ...structuredClone(user),
      password: isPasswordHash(password) ? password : hashPassword(password),
      enabled: production && user.role !== "老板" ? false : user.enabled,
    };
  });
  secureInitialUsersByEnvironment.set(cacheKey, secured);
  return structuredClone(secured);
}

export function createInitialState(options: { includeCrmDemoData?: boolean; includeDemoData?: boolean } = {}): AppState {
  // CRM 演示链路只允许在显式的测试/演示场景注入。生产库初始化默认保持 CRM 为空，
  // 避免首次启动把固定 KH-/CRM- 示例记录写进真实门店数据。
  // 其他业务演示数据也必须在生产环境默认关闭；测试和本地开发仍然可以通过默认值继续使用
  // 完整演示状态，或显式传入 includeDemoData: true。
  const includeDemoData = options.includeDemoData ?? process.env.NODE_ENV !== "production";
  const includeCrmDemoData = includeDemoData && options.includeCrmDemoData !== false;
  const state: AppState = {
    products: structuredClone(initialProducts),
    inventory: structuredClone(initialInventory),
    inspections: structuredClone(initialInspections),
    purchaseInvoices: structuredClone(initialPurchaseInvoices),
    salesInvoices: structuredClone(initialSalesInvoices),
    marketQuotes: structuredClone(initialMarketQuotes),
    aftersales: structuredClone(initialAftersales),
    customers: structuredClone(initialCustomers),
    crmFollowUps: includeCrmDemoData ? structuredClone(initialCrmFollowUps) : [],
    crmRequirements: includeCrmDemoData ? structuredClone(initialCrmRequirements) : [],
    crmQuotes: includeCrmDemoData ? structuredClone(initialCrmQuotes) : [],
    vendors: structuredClone(initialVendors),
    logs: structuredClone(initialLogs),
    financeLedger: structuredClone(initialFinanceLedger),
    settlementAccounts: [
      {
        id: "SA-CASH-001",
        name: "门市现金",
        type: "现金",
        owner: "门店",
        platform: "线下现金",
        balance: 12000,
        availableBalance: 12000,
        frozenAmount: 0,
        enabled: true,
        allowNegative: true,
        remarks: "门店备用现金",
        lastChangeTime: "2026-05-29 10:00",
      },
      {
        id: "SA-WECHAT-001",
        name: "老板微信",
        type: "微信",
        owner: "老板",
        platform: "微信支付",
        balance: 68000,
        availableBalance: 68000,
        frozenAmount: 0,
        enabled: true,
        allowNegative: true,
        remarks: "主要销售收款账户",
        lastChangeTime: "2026-05-29 11:20",
      },
      {
        id: "SA-ALIPAY-001",
        name: "财务支付宝",
        type: "支付宝",
        owner: "财务",
        platform: "支付宝",
        balance: 35000,
        availableBalance: 35000,
        frozenAmount: 0,
        enabled: true,
        allowNegative: true,
        remarks: "采购付款常用账户",
        lastChangeTime: "2026-05-29 10:45",
      },
      {
        id: "SA-BANK-001",
        name: "对公银行卡",
        type: "银行卡",
        owner: "成都显卡一号店",
        platform: "工商银行",
        balance: 128000,
        availableBalance: 128000,
        frozenAmount: 0,
        enabled: true,
        allowNegative: true,
        remarks: "公司对公账户",
        lastChangeTime: "2026-05-28 16:30",
      },
    ],
    settlementLedger: [],
    paymentInRecords: [],
    paymentOutRecords: [],
    accountTransfers: [],
    assemblyOperations: [],
    returnOrders: [],
    purchaseCommissions: [],
    commissionRules: structuredClone(DEFAULT_COMMISSION_RULES),
    currentRole: "老板",
    customPermissions: structuredClone(defaultPermissions),
    systemUsers: secureInitialSystemUsers(),
    currentUserId: undefined,
  };
  if (!includeDemoData) {
    // 生产空库只保留账号、权限和佣金规则配置，不把任何商品、订单、客户、余额或流水
    // 当作真实业务数据写入 PostgreSQL。正式数据必须由用户通过业务流程创建。
    state.products = [];
    state.inventory = [];
    state.inspections = [];
    state.purchaseInvoices = [];
    state.salesInvoices = [];
    state.purchaseCommissions = [];
    state.marketQuotes = [];
    state.aftersales = [];
    state.customers = [];
    state.crmFollowUps = [];
    state.crmRequirements = [];
    state.crmQuotes = [];
    state.vendors = [];
    state.logs = [];
    state.financeLedger = [];
    state.settlementAccounts = [];
    state.settlementLedger = [];
    state.paymentInRecords = [];
    state.paymentOutRecords = [];
    state.accountTransfers = [];
    state.assemblyOperations = [];
    state.returnOrders = [];
  }
  normalizeStateConditions(state);
  syncProductCurrentStock(state);
  return state;
}

function sanitizeUser(user: SystemUserAccount) {
  return sanitizeUserAccount(user);
}

function normalizePermissions(permissions: PermissionSettings[]) {
  return permissions.map((permission) => {
    const defaultForRole = defaultPermissions.find((item) => item.role === permission.role);
    if (!defaultForRole) return permission;
    return {
      ...defaultForRole,
      ...permission,
      allowedMenus: normalizeAllowedMenus(permission.allowedMenus, permission.role),
    };
  });
}

function replaceState(target: AppState, next: AppState) {
  normalizeStateConditions(next);
  target.products = structuredClone(next.products);
  target.inventory = structuredClone(next.inventory);
  target.inspections = structuredClone(next.inspections);
  target.purchaseInvoices = structuredClone(next.purchaseInvoices);
  target.salesInvoices = structuredClone(next.salesInvoices);
  target.purchaseCommissions = structuredClone(next.purchaseCommissions || []);
  target.commissionRules = normalizeCommissionRules(next.commissionRules);
  target.marketQuotes = structuredClone(next.marketQuotes);
  target.aftersales = structuredClone(next.aftersales);
  target.customers = structuredClone(next.customers);
  target.crmFollowUps = structuredClone(next.crmFollowUps || []);
  target.crmRequirements = structuredClone(next.crmRequirements || []);
  target.crmQuotes = structuredClone(next.crmQuotes || []);
  target.vendors = structuredClone(next.vendors);
  target.logs = structuredClone(next.logs);
  target.financeLedger = structuredClone(next.financeLedger);
  target.settlementAccounts = structuredClone(next.settlementAccounts);
  target.settlementLedger = structuredClone(next.settlementLedger);
  target.paymentInRecords = structuredClone(next.paymentInRecords);
  target.paymentOutRecords = structuredClone(next.paymentOutRecords);
  target.accountTransfers = structuredClone(next.accountTransfers);
  target.assemblyOperations = structuredClone(next.assemblyOperations || []);
  target.returnOrders = structuredClone(next.returnOrders || []);
  target.currentRole = next.currentRole;
  target.customPermissions = structuredClone(next.customPermissions);
  target.systemUsers = structuredClone(next.systemUsers || initialSystemUsers);
  target.currentUserId = next.currentUserId;
  syncProductCurrentStock(target);
}

function nowStamp() {
  return storeDateTime();
}

function dateKey() {
  return storeDateKey();
}

function genId(prefix: string) {
  return generateEntityId(prefix);
}

const archiveSeqCache = new Map<string, number>();

function nextPartnerArchiveId(prefix: "KH" | "GY", existingRecords: Array<{ id: string }>) {
  const date = storeDateKey();
  const cacheKey = `${prefix}-${date}`;
  const pattern = new RegExp(`^${prefix}-${date}-(\\d+)$`);
  const maxExistingSeq = existingRecords.reduce((max, record) => {
    const match = pattern.exec(record.id);
    return match ? Math.max(max, Number(match[1])) : max;
  }, 0);
  const nextSeq = Math.max(archiveSeqCache.get(cacheKey) || 0, maxExistingSeq) + 1;
  archiveSeqCache.set(cacheKey, nextSeq);
  return `${prefix}-${date}-${String(nextSeq).padStart(3, "0")}`;
}

function dedupeProductsById(products: ProductTemplate[]) {
  const seen = new Set<string>();
  return products.filter((product) => {
    if (seen.has(product.id)) return false;
    seen.add(product.id);
    return true;
  });
}

function matchesPerson(name: string, contact: string, targetName?: string, targetContact?: string) {
  const cleanName = name.trim();
  const cleanTargetName = (targetName || "").trim();
  const cleanContact = contact.trim();
  const cleanTargetContact = (targetContact || "").trim();

  return (
    (!!cleanName && !!cleanTargetName && cleanName === cleanTargetName) ||
    (!!cleanContact && !!cleanTargetContact && cleanContact === cleanTargetContact)
  );
}

function isInvoiceLinkedToCustomer(invoice: PurchaseInvoice | SalesInvoice, id: string, name: string, contact: string) {
  if ("totalAmount" in invoice) {
    if (invoice.customerId) return invoice.customerId === id && (invoice.customerPartnerType || "customer") === "customer";
    return matchesPerson(name, contact, invoice.customerName, invoice.contact);
  }
  const isPersonalSource = ["个人回收", "客户置换"].includes(invoice.sourceType);
  if (!isPersonalSource) return false;
  if (invoice.sourcePartnerId) return invoice.sourcePartnerId === id && (invoice.sourcePartnerType || "customer") === "customer";
  return matchesPerson(name, contact, invoice.supplierName, invoice.contact);
}

function isInvoiceLinkedToVendor(invoice: PurchaseInvoice | SalesInvoice, id: string, name: string, contact: string) {
  if ("totalAmount" in invoice) {
    if (invoice.customerId) return invoice.customerId === id && invoice.customerPartnerType === "vendor";
    return invoice.channel === "同行网店" && matchesPerson(name, contact, invoice.customerName, invoice.contact);
  }
  const isPersonalSource = ["个人回收", "客户置换"].includes(invoice.sourceType);
  if (isPersonalSource) return false;
  if (invoice.sourcePartnerId) return invoice.sourcePartnerId === id && (invoice.sourcePartnerType || "vendor") === "vendor";
  return matchesPerson(name, contact, invoice.supplierName, invoice.contact);
}

function matchesCustomerByIdOrLegacyName(customer: CustomerCard, customerId?: string, customerName?: string) {
  if (customerId) return customer.id === customerId;
  return !!customerName?.trim() && customer.name.trim() === customerName.trim();
}

function hasUniqueLegacyName<T extends { name: string }>(items: T[], name?: string) {
  const cleanName = name?.trim();
  if (!cleanName) return false;
  return items.filter((item) => item.name.trim() === cleanName).length === 1;
}

export const CANONICAL_CUSTOMER_LEVELS = new Set(["S级", "A级", "B级", "C级", "D级", "R级"]);

export function normalizeCustomerLevel(level?: string): CustomerLevel {
  if (CANONICAL_CUSTOMER_LEVELS.has(level || "")) return level as CustomerLevel;
  if (level === "VIP客户" || level === "重点客户") return "A级";
  if (level === "黑名单") return "R级";
  return "C级";
}

export function customerSuggestedLevel(customer: Pick<CustomerCard, "crmStatus" | "buyCount" | "recycleCount" | "totalAmount" | "totalProfit" | "aftersalesCount" | "receivableBalance" | "debtBalance" | "riskReason">): CustomerLevel {
  if (customer.riskReason?.trim()) return "R级";
  if (["沉睡", "流失"].includes(customer.crmStatus || "")) return "D级";
  const tradeCount = Number(customer.buyCount || 0) + Number(customer.recycleCount || 0);
  const tradeAmount = Number(customer.totalAmount || 0);
  const receivable = Number(customer.receivableBalance ?? customer.debtBalance ?? 0);
  if (receivable > 0 && receivable >= Math.max(10000, tradeAmount * 0.3)) return "D级";
  if (tradeCount >= 5 && tradeAmount >= 50000 && Number(customer.aftersalesCount || 0) <= 1) return "A级";
  if (tradeCount >= 2 || tradeAmount >= 10000 || Number(customer.totalProfit || 0) >= 3000) return "B级";
  return "C级";
}

function vendorSuggestedLevel(vendor: Pick<Vendor, "type" | "totalCount" | "totalBuyAmount" | "accountPayable" | "isHighRisk" | "riskReason">): CustomerLevel {
  if (vendor.isHighRisk || vendor.riskReason?.trim()) return "R级";
  const tradeCount = Number(vendor.totalCount || 0);
  const tradeAmount = Number(vendor.totalBuyAmount || 0);
  const payable = Number(vendor.accountPayable || 0);
  if (payable > 0 && payable >= Math.max(20000, tradeAmount * 0.4)) return "D级";
  if (tradeCount >= 8 && tradeAmount >= 100000) return "A级";
  if (tradeCount >= 3 || tradeAmount >= 30000) return "B级";
  return "C级";
}

function normalizeCustomerIdentity(value?: string) {
  return (value || "").trim().toLowerCase().replace(/[\s-]/g, "");
}

export function createStoreActions(state: AppState, context: StoreActionContext = {}) {
  state.commissionRules = normalizeCommissionRules(state.commissionRules);
  const finiteNumber = (value: unknown, label: string) => {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) throw new ValidationError(`${label}必须是有效数字`);
    return numeric;
  };
  const positiveAmount = (value: unknown, label: string) => {
    const numeric = finiteNumber(value, label);
    if (numeric <= 0) throw new ValidationError(`${label}必须大于 0`);
    return numeric;
  };
  const nonNegativeAmount = (value: unknown, label: string) => {
    const numeric = finiteNumber(value, label);
    if (numeric < 0) throw new ValidationError(`${label}不能小于 0`);
    return numeric;
  };
  const getActiveUserId = () => context.userId || state.currentUserId;
  const getActiveUser = () => state.systemUsers.find((user) => user.id === getActiveUserId());
  const getActiveRole = () => context.role || getActiveUser()?.role || state.currentRole;
  const getActiveActor = () => context.actor?.trim() || getActiveRole();
  const systemActor = () => `${getActiveActor()} (系统)`;

  const withCustomerGrade = (customer: CustomerCard): CustomerCard => {
    const isCoreCustomer = Boolean(customer.isCoreCustomer || customer.level === "S级");
    const suggestedLevel = isCoreCustomer ? "S级" : customerSuggestedLevel(customer);
    return {
      ...customer,
      isCoreCustomer,
      level: isCoreCustomer ? "S级" : normalizeCustomerLevel(customer.level),
      suggestedLevel,
      levelReason: isCoreCustomer ? "核心客户，等级固定为S级" : customer.levelReason,
    };
  };
  const withVendorGrade = (vendor: Vendor): Vendor => {
    const isCoreCustomer = Boolean(vendor.isCoreCustomer || vendor.type === "核心采购方" || vendor.level === "S级");
    const suggestedLevel = isCoreCustomer ? "S级" : vendorSuggestedLevel(vendor);
    return {
      ...vendor,
      isCoreCustomer,
      level: isCoreCustomer ? "S级" : normalizeCustomerLevel(vendor.level),
      suggestedLevel,
      levelReason: isCoreCustomer ? "核心同行，等级固定为S级" : vendor.levelReason,
    };
  };
  // Normalize old labels on every aggregate load. This is intentionally non-destructive:
  // manual grades remain intact, while suggestedLevel is refreshed as a review aid.
  state.customers = state.customers.map(withCustomerGrade);
  state.vendors = state.vendors.map(withVendorGrade);

  // Old records only have debtBalance. Interpret that legacy value as receivable so the
  // migration is backwards compatible while all new writes keep both directions separate.
  const customerReceivable = (customer: CustomerCard) => Math.max(0, Number(customer.receivableBalance ?? customer.debtBalance ?? 0));
  const customerPayable = (customer: CustomerCard) => Math.max(0, Number(customer.payableBalance ?? 0));
  const applyCustomerBalance = (customer: CustomerCard, changes: { receivable?: number; payable?: number }) => {
    const receivableBalance = Math.max(0, customerReceivable(customer) + (changes.receivable || 0));
    const payableBalance = Math.max(0, customerPayable(customer) + (changes.payable || 0));
    return { receivableBalance, payableBalance, debtBalance: receivableBalance };
  };
  const vendorReceivable = (vendor: Vendor) => Math.max(0, Number(vendor.accountReceivable ?? 0));
  const vendorPayable = (vendor: Vendor) => Math.max(0, Number(vendor.accountPayable ?? vendor.debtBalance ?? 0));
  const applyVendorBalance = (vendor: Vendor, changes: { receivable?: number; payable?: number }) => {
    const accountReceivable = Math.max(0, vendorReceivable(vendor) + (changes.receivable || 0));
    const accountPayable = Math.max(0, vendorPayable(vendor) + (changes.payable || 0));
    return { accountReceivable, accountPayable, debtBalance: accountPayable };
  };
  const customerContact = (customer: Partial<Pick<CustomerCard, "contact" | "phone" | "wechat">>) => customer.contact || customer.phone || customer.wechat || "";
  const vendorContact = (vendor: Partial<Pick<Vendor, "contact" | "phone">>) => vendor.contact || vendor.phone || "";
  const assertCustomerIdentityAvailable = (
    candidate: { name: string } & Partial<Pick<CustomerCard, "contact" | "phone" | "wechat">>,
    excludeId?: string,
  ) => {
    const name = candidate.name.trim();
    if (!name) throw new ValidationError("客户名称不能为空");
    const contact = normalizeCustomerIdentity(customerContact(candidate));
    const duplicate = state.customers.find((customer) => {
      if (customer.id === excludeId) return false;
      const sameName = customer.name.trim() === name;
      const existingContact = normalizeCustomerIdentity(customerContact(customer));
      return contact ? existingContact === contact : sameName && !existingContact;
    });
    if (duplicate) {
      throw new ConflictError(contact ? `联系方式已被客户【${duplicate.name}】使用，请确认是否重复建档` : `客户【${name}】缺少联系方式且已存在，请补充联系方式后再建档`);
    }
  };
  const assertVendorIdentityAvailable = (candidate: { name: string } & Partial<Pick<Vendor, "contact" | "phone">>) => {
    const name = candidate.name.trim();
    if (!name) throw new ValidationError("同行名称不能为空");
    const contact = normalizeCustomerIdentity(vendorContact(candidate));
    const duplicate = state.vendors.find((vendor) => {
      const existingContact = normalizeCustomerIdentity(vendorContact(vendor));
      return contact ? existingContact === contact : vendor.name.trim() === name && !existingContact;
    });
    if (duplicate) {
      throw new ConflictError(contact ? `联系方式已被同行【${duplicate.name}】使用，请勿重复建档` : `同行【${name}】缺少联系方式且已存在，请补充联系方式后再建档`);
    }
  };
  state.customPermissions = normalizePermissions(state.customPermissions);

  const addLog = (user: string, module: string, type: string, target: string, beforeVal?: string, afterVal?: string) => {
    syncProductCurrentStock(state);
    const newLog: AuditLog = {
      id: genId("L"),
      user,
      time: nowStamp(),
      module,
      type,
      target,
      beforeVal,
      afterVal,
    };
    state.logs = [newLog, ...state.logs].slice(0, MAX_LOG_ENTRIES);
    return newLog;
  };

  // Centralized SN uniqueness. A serial number identifies one physical card, so it must be
  // unique across the whole inventory (case-insensitive). Empty SN means "not yet bound".
  const findCardBySn = (sn: string, excludeId?: string) => {
    const key = sn.trim().toLowerCase();
    if (!key) return undefined;
    return state.inventory.find((card) => card.id !== excludeId && card.sn && card.sn.toLowerCase() === key);
  };
  const assertSnUnique = (sn: string, excludeId?: string) => {
    const trimmed = sn.trim();
    if (trimmed && findCardBySn(trimmed, excludeId)) {
      throw new ConflictError(`SN已存在: ${trimmed}`);
    }
  };

  // Next document sequence for a given prefix, derived from the max existing number for today
  // rather than array length, so deleting a document never causes a duplicate number.
  const nextDailySeq = (docs: Array<{ invoiceNo: string }>, prefix: string) => {
    return nextDailyDocumentSequence(docs, prefix, dateKey());
  };

  const findPurchaseInvoiceForCard = (card: CardInventory) => {
    if (card.purchaseInvoiceNo) {
      const linked = state.purchaseInvoices.find((invoice) =>
        invoice.invoiceNo === card.purchaseInvoiceNo || invoice.id === card.purchaseInvoiceNo
      );
      if (linked) return linked;
    }
    const legacyInvoiceNo = card.remarks?.match(/进货单:([^；\s]+)/)?.[1];
    if (!legacyInvoiceNo) return undefined;
    return state.purchaseInvoices.find((invoice) => invoice.invoiceNo === legacyInvoiceNo || invoice.id === legacyInvoiceNo);
  };

  const ensurePurchaseCommissionsForSale = (invoice: SalesInvoice, outboundTime: string, outboundHandler: string) => {
    const created: PurchaseCommissionRecord[] = [];

    invoice.items.forEach((item) => {
      const card = state.inventory.find((inventoryItem) => inventoryItem.id === item.inventoryId);
      if (!card || (card.category || "显卡") !== "显卡") return;
      const alreadyCreated = state.purchaseCommissions.some((record) =>
        record.inventoryId === card.id && record.salesInvoiceNo === invoice.invoiceNo
      );
      if (alreadyCreated) return;

      const purchaseInvoice = findPurchaseInvoiceForCard(card);
      const costPrice = Number(card.costPrice || item.costPrice || 0);
      const salesPrice = Number(card.salesPrice || item.sellPrice || 0);
      const grossProfit = Number((salesPrice - costPrice).toFixed(2));
      const calculationContext = { purchaseAmount: costPrice, salesAmount: salesPrice, profit: Math.max(0, grossProfit) };
      const purchaseRule = state.commissionRules.purchase;
      const salesRule = state.commissionRules.sales;
      const purchaseEffective = !purchaseRule.effectiveDate || outboundTime.slice(0, 10) >= purchaseRule.effectiveDate;
      const salesEffective = !salesRule.effectiveDate || outboundTime.slice(0, 10) >= salesRule.effectiveDate;
      const purchaseCalculation = calculateCommission(purchaseRule, calculationContext);
      const salesCalculation = calculateCommission(salesRule, calculationContext);
      const purchaseTargetEnabled = purchaseRule.targets.purchaseHandler || purchaseRule.targets.warehouseManager || purchaseRule.targets.customMemberIds.length > 0;
      const salesTargetEnabled = salesRule.targets.salesHandler || salesRule.targets.warehouseManager || salesRule.targets.customMemberIds.length > 0;
      const purchaseCommissionAmount = purchaseEffective && purchaseTargetEnabled ? purchaseCalculation.amount : 0;
      const salesCommissionAmount = salesEffective && salesTargetEnabled ? salesCalculation.amount : 0;

      created.push({
        id: genId("TC"),
        inventoryId: card.id,
        sn: card.sn || item.sn,
        productId: card.productId || item.productId,
        productName: card.productName || item.productName,
        purchaseInvoiceNo: card.purchaseInvoiceNo || purchaseInvoice?.invoiceNo,
        salesInvoiceNo: invoice.invoiceNo,
        purchaseHandler: card.purchaseHandler || purchaseInvoice?.handleBy || "未记录",
        salesHandler: invoice.handleBy,
        outboundHandler,
        costPrice,
        salesPrice,
        grossProfit,
        rate: purchaseCalculation.rate,
        commissionAmount: purchaseCommissionAmount,
        purchaseRate: purchaseCalculation.rate,
        purchaseCommissionAmount,
        purchaseCalculationMethod: purchaseCalculation.method,
        salesRate: salesCalculation.rate,
        salesCommissionAmount,
        salesCalculationMethod: salesCalculation.method,
        status: "待结算",
        createdAt: outboundTime,
        remarks: `按已生效提成规则自动生成；进货${purchaseRule.payoutCycle === "monthly" ? "按月" : "按单"}发放，卖货${salesRule.payoutCycle === "monthly" ? "按月" : "按单"}发放`,
      });
    });

    if (created.length) state.purchaseCommissions = [...created, ...state.purchaseCommissions];
    return created;
  };

  const adjustCommissionForSalesReturn = (invoiceNo: string, inventoryId: string | undefined, returnNo: string) => {
    if (!inventoryId) return;
    const shouldAdjustPurchase = state.commissionRules.purchase.adjustOnReturn;
    const shouldAdjustSales = state.commissionRules.sales.adjustOnReturn;
    if (!shouldAdjustPurchase && !shouldAdjustSales) return;
    state.purchaseCommissions = state.purchaseCommissions.map((record) => {
      if (record.salesInvoiceNo !== invoiceNo || record.inventoryId !== inventoryId) return record;
      return {
        ...record,
        ...(shouldAdjustPurchase ? { commissionAmount: 0, purchaseCommissionAmount: 0 } : {}),
        ...(shouldAdjustSales ? { salesCommissionAmount: 0 } : {}),
        remarks: `${record.remarks || ""}${record.remarks ? "；" : ""}销售退货 ${returnNo} 已自动冲减提成`,
      };
    });
  };

  const nextReturnNo = (type: ReturnOrder["type"]) => {
    const prefix = type === "销售退货" ? "XSTH" : "JHTH";
    const head = `${prefix}-${dateKey()}-`;
    const max = state.returnOrders.reduce((acc, order) => {
      if (!order.returnNo?.startsWith(head)) return acc;
      const n = Number(order.returnNo.slice(head.length));
      return Number.isFinite(n) ? Math.max(acc, n) : acc;
    }, 0);
    return `${head}${String(max + 1).padStart(3, "0")}`;
  };

  const findSettlementAccount = (accountId: string) => {
    const account = state.settlementAccounts.find((item) => item.id === accountId);
    if (!account) throw new NotFoundError(`结算账户不存在: ${accountId}`);
    if (!account.enabled) throw new ConflictError(`结算账户已停用: ${account.name}`);
    return account;
  };

  const adjustSettlementBalance = (accountId: string, delta: number, time = nowStamp()) => {
    state.settlementAccounts = state.settlementAccounts.map((account) => {
      if (account.id !== accountId) return account;
      const balance = account.balance + delta;
      return { ...account, balance, availableBalance: balance - account.frozenAmount, lastChangeTime: time };
    });
  };

  const createFinanceLedgerForSettlement = (entry: {
    relatedId?: string;
    type: string;
    paymentWay: string;
    amount: number;
    operator: string;
    settlementAccountId: string;
    settlementAccountName: string;
    relatedDocType?: string;
    customerName?: string;
    supplierName?: string;
    time?: string;
  }) => {
    const ledgerItem: FinanceLedger = {
      id: genId("LS"),
      time: entry.time || nowStamp(),
      relatedId: entry.relatedId,
      type: entry.type,
      paymentWay: entry.paymentWay,
      amount: entry.amount,
      operator: entry.operator,
      status: "已复核",
      settlementAccountId: entry.settlementAccountId,
      settlementAccountName: entry.settlementAccountName,
      handler: entry.operator,
      relatedDocType: entry.relatedDocType,
      customerName: entry.customerName,
      supplierName: entry.supplierName,
    };
    state.financeLedger = [ledgerItem, ...state.financeLedger];
    return ledgerItem;
  };

  const rebuildSettlementLedgerBalances = (accountIds?: Iterable<string>) => {
    const targets = new Set(accountIds || state.settlementAccounts.map((account) => account.id));
    if (!targets.size) return;

    const ledgersByAccount = new Map<string, SettlementLedger[]>();
    state.settlementLedger.forEach((ledger) => {
      if (!targets.has(ledger.accountId)) return;
      const entries = ledgersByAccount.get(ledger.accountId) || [];
      entries.push(ledger);
      ledgersByAccount.set(ledger.accountId, entries);
    });

    const replacement = new Map<string, SettlementLedger>();
    ledgersByAccount.forEach((entries, accountId) => {
      const account = state.settlementAccounts.find((item) => item.id === accountId);
      if (!account) return;
      const ordered = [...entries].sort((left, right) =>
        left.time.localeCompare(right.time) || left.id.localeCompare(right.id),
      );
      // Accounts do not persist a separate opening-balance field. Derive it from the
      // current balance and the complete ledger, then rebuild every running balance.
      let runningBalance = account.balance - ordered.reduce((sum, item) => sum + item.changeAmount, 0);
      ordered.forEach((ledger) => {
        const beforeBalance = runningBalance;
        runningBalance += ledger.changeAmount;
        replacement.set(ledger.id, { ...ledger, beforeBalance, afterBalance: runningBalance });
      });
    });

    if (replacement.size) {
      state.settlementLedger = state.settlementLedger.map((ledger) => replacement.get(ledger.id) || ledger);
    }
  };

  const recordSettlementMovement = (movement: {
    accountId: string;
    direction: SettlementDirection;
    amount: number;
    businessType: SettlementBusinessType;
    relatedDocType?: string;
    relatedDocNo?: string;
    customerName?: string;
    supplierName?: string;
    handler: string;
    createdBy?: string;
    time?: string;
    remarks?: string;
  }) => {
    const account = findSettlementAccount(movement.accountId);
    const movementAmount = positiveAmount(movement.amount, "流水金额");
    const beforeBalance = account.balance;
    const signedAmount = movement.direction === "收入" || movement.direction === "转入" ? movementAmount : -movementAmount;
    const afterBalance = beforeBalance + signedAmount;
    const time = movement.time || nowStamp();
    const ledger: SettlementLedger = {
      id: genId("SL"),
      accountId: account.id,
      accountName: account.name,
      accountType: account.type,
      direction: movement.direction,
      incomeAmount: signedAmount > 0 ? movementAmount : 0,
      expenseAmount: signedAmount < 0 ? movementAmount : 0,
      changeAmount: signedAmount,
      beforeBalance,
      afterBalance,
      businessType: movement.businessType,
      relatedDocType: movement.relatedDocType,
      relatedDocNo: movement.relatedDocNo,
      customerName: movement.customerName,
      supplierName: movement.supplierName,
      handler: movement.handler,
      createdBy: movement.createdBy || getActiveRole(),
      time,
      remarks: movement.remarks,
    };
    state.settlementAccounts = state.settlementAccounts.map((item) =>
      item.id === account.id
        ? {
            ...item,
            balance: afterBalance,
            availableBalance: afterBalance - item.frozenAmount,
            lastChangeTime: time,
          }
        : item,
    );
    state.settlementLedger = [ledger, ...state.settlementLedger];
    rebuildSettlementLedgerBalances([account.id]);
    return ledger;
  };

  const createSettlementAccount = (account: Omit<SettlementAccount, "id" | "lastChangeTime"> & { id?: string }) => {
    if (!account.name?.trim()) throw new ValidationError("结算账户名称不能为空");
    const balance = finiteNumber(account.balance ?? 0, "账户余额");
    const frozenAmount = nonNegativeAmount(account.frozenAmount ?? 0, "冻结金额");
    const availableBalance = finiteNumber(account.availableBalance ?? balance - frozenAmount, "可用余额");
    const newAccount: SettlementAccount = {
      ...account,
      id: account.id || genId("SA"),
      balance,
      availableBalance,
      frozenAmount,
      enabled: account.enabled ?? true,
      allowNegative: account.allowNegative ?? true,
      lastChangeTime: nowStamp(),
    };
    state.settlementAccounts = [newAccount, ...state.settlementAccounts];
    addLog(systemActor(), "结算账户", "新增结算账户", newAccount.name, undefined, `类型: ${newAccount.type}, 余额: ${newAccount.balance}元`);
    return newAccount;
  };

  const deleteSettlementAccount = (id: string) => {
    const existing = state.settlementAccounts.find((account) => account.id === id);
    if (!existing) throw new NotFoundError(`结算账户不存在: ${id}`);
    const hasLedger = state.settlementLedger.some((item) => item.accountId === id);
    const hasPaymentIn = state.paymentInRecords.some((item) => item.accountId === id);
    const hasPaymentOut = state.paymentOutRecords.some((item) => item.accountId === id);
    const hasTransfer = state.accountTransfers.some((item) => item.fromAccountId === id || item.toAccountId === id);
    const hasFinanceLedger = state.financeLedger.some((item) => item.settlementAccountId === id);
    const hasInvoice = state.salesInvoices.some((item) => item.settlementAccountId === id) || state.purchaseInvoices.some((item) => item.settlementAccountId === id);
    const hasReturnOrder = state.returnOrders.some((item) => item.settlementAccountId === id);
    if (hasLedger || hasPaymentIn || hasPaymentOut || hasTransfer || hasFinanceLedger || hasInvoice || hasReturnOrder) {
      throw new ConflictError("该结算账户已有流水、收付款、调拨或业务单据关联，不能删除");
    }
    state.settlementAccounts = state.settlementAccounts.filter((account) => account.id !== id);
    addLog(systemActor(), "结算账户", "删除结算账户", existing.name);
    return existing;
  };

  const reconcileSettlementAccount = (id: string, actualBalance: number, handler?: string) => {
    if (!Number.isFinite(Number(actualBalance))) throw new ValidationError("实盘余额必须为有效数字");
    const existing = state.settlementAccounts.find((account) => account.id === id);
    if (!existing) throw new NotFoundError(`结算账户不存在: ${id}`);
    const actual = Number(actualBalance);
    const actor = handler?.trim() || systemActor();
    const updated = {
      ...existing,
      actualBalance: actual,
      lastReconciledAt: nowStamp(),
      lastReconciledBy: actor,
    };
    state.settlementAccounts = state.settlementAccounts.map((account) => account.id === id ? updated : account);
    addLog(actor, "结算账户", "实盘余额对账", existing.name, `${existing.balance}元`, `实盘 ${actual}元，差额 ${actual - existing.balance}元`);
    return updated;
  };

  const findPaymentInSettlementLedgerId = (record: PaymentInRecord) => {
    if (record.settlementLedgerId && state.settlementLedger.some((item) => item.id === record.settlementLedgerId)) {
      return record.settlementLedgerId;
    }
    const matches = state.settlementLedger.filter((item) =>
      item.accountId === record.accountId &&
      item.handler === record.handler &&
      item.time === record.time &&
      item.incomeAmount === record.amount &&
      item.relatedDocNo === record.relatedDocNo
    );
    return matches.length === 1 ? matches[0].id : undefined;
  };

  const findPaymentInFinanceLedgerId = (record: PaymentInRecord) => {
    if (record.financeLedgerId && state.financeLedger.some((item) => item.id === record.financeLedgerId)) {
      return record.financeLedgerId;
    }
    const matches = state.financeLedger.filter((item) =>
      item.settlementAccountId === record.accountId &&
      item.handler === record.handler &&
      item.time === record.time &&
      item.amount === record.amount &&
      item.relatedId === (record.relatedDocNo || record.id)
    );
    return matches.length === 1 ? matches[0].id : undefined;
  };

  const findPaymentOutSettlementLedgerId = (record: PaymentOutRecord) => {
    if (record.settlementLedgerId && state.settlementLedger.some((item) => item.id === record.settlementLedgerId)) {
      return record.settlementLedgerId;
    }
    const matches = state.settlementLedger.filter((item) =>
      item.accountId === record.accountId &&
      item.handler === record.handler &&
      item.time === record.time &&
      item.expenseAmount === record.amount &&
      item.relatedDocNo === record.relatedDocNo
    );
    return matches.length === 1 ? matches[0].id : undefined;
  };

  const findPaymentOutFinanceLedgerId = (record: PaymentOutRecord) => {
    if (record.financeLedgerId && state.financeLedger.some((item) => item.id === record.financeLedgerId)) {
      return record.financeLedgerId;
    }
    const matches = state.financeLedger.filter((item) =>
      item.settlementAccountId === record.accountId &&
      item.handler === record.handler &&
      item.time === record.time &&
      item.amount === -record.amount &&
      item.relatedId === (record.relatedDocNo || record.id)
    );
    return matches.length === 1 ? matches[0].id : undefined;
  };

  const findSalesInvoiceByDocNo = (docNo?: string) => {
    if (!docNo) return undefined;
    return state.salesInvoices.find((invoice) => invoice.invoiceNo === docNo || invoice.id === docNo);
  };

  const findPurchaseInvoiceByDocNo = (docNo?: string) => {
    if (!docNo) return undefined;
    return state.purchaseInvoices.find((invoice) => invoice.invoiceNo === docNo || invoice.id === docNo);
  };

  const salesInvoiceCustomerId = (invoice?: SalesInvoice) => (
    invoice && (invoice.customerPartnerType || "customer") !== "vendor" ? invoice.customerId : undefined
  );

  const purchaseInvoiceVendorId = (invoice?: PurchaseInvoice) => {
    if (!invoice || ["个人回收", "客户置换"].includes(invoice.sourceType)) return undefined;
    return (invoice.sourcePartnerType || "vendor") === "vendor" ? invoice.sourcePartnerId : undefined;
  };

  const purchaseVendorCreditApplied = (invoice?: Pick<PurchaseInvoice, "vendorCreditAppliedAmount">) =>
    Math.max(0, Number(invoice?.vendorCreditAppliedAmount || 0));

  /**
   * 供应商退货余额不是现金，必须随采购单的创建、修改和删除成对变动。
   * 正数退回余额，负数使用余额。旧数据没有供应商档案时不允许凭空使用余额。
   */
  const adjustPurchaseVendorCredit = (invoice: PurchaseInvoice, delta: number) => {
    const amount = purchaseVendorCreditApplied(invoice);
    if (!amount || !delta) return;
    const vendorId = purchaseInvoiceVendorId(invoice);
    if (!vendorId) throw new ValidationError("供应商抵扣余额只能用于同行供应商采购单");
    const vendor = state.vendors.find((item) => item.id === vendorId);
    if (!vendor) throw new NotFoundError("采购单关联供应商不存在，不能使用抵扣余额");
    const nextBalance = Number(vendor.returnCreditBalance || 0) + delta;
    if (nextBalance < -0.009) {
      throw new ConflictError(`供应商抵扣余额不足：可用 ${Math.max(0, Number(vendor.returnCreditBalance || 0))} 元，需使用 ${amount} 元`);
    }
    state.vendors = state.vendors.map((item) => item.id === vendorId
      ? { ...item, returnCreditBalance: Math.max(0, nextBalance) }
      : item);
  };

  const normalizePurchaseSettlement = (totalCost: number, paidAmount: unknown, vendorCreditAmount: unknown) => {
    const paid = Math.max(0, Number(paidAmount || 0));
    const credit = Math.max(0, Number(vendorCreditAmount || 0));
    if (paid + credit > totalCost + 0.009) {
      throw new ValidationError("现金付款与供应商抵扣余额之和不能超过采购总额");
    }
    const unpaid = Math.max(0, totalCost - paid - credit);
    return { paidAmount: paid, vendorCreditAppliedAmount: credit, unpaidAmount: unpaid };
  };

  const paymentOutMatchesVendor = (vendor: Vendor, record: Pick<PaymentOutRecord, "supplierId" | "supplierName">) => {
    if (record.supplierId) return vendor.id === record.supplierId;
    return hasUniqueLegacyName(state.vendors, record.supplierName) && !!record.supplierName?.trim() && vendor.name.trim() === record.supplierName.trim();
  };

  const applyPurchasePartnerImpact = (invoice: PurchaseInvoice, multiplier: 1 | -1) => {
    const isPersonalSource = ["个人回收", "客户置换"].includes(invoice.sourceType);
    if (isPersonalSource) {
      const matches = (customer: CustomerCard) => invoice.sourcePartnerId
        ? customer.id === invoice.sourcePartnerId
        : hasUniqueLegacyName(state.customers, invoice.supplierName) && customer.name.trim() === invoice.supplierName.trim();
      state.customers = state.customers.map((customer) => !matches(customer) ? customer : withCustomerGrade({
        ...customer,
        totalAmount: Math.max(0, customer.totalAmount + multiplier * invoice.totalCost),
        recycleCount: Math.max(0, customer.recycleCount + multiplier * invoice.totalCount),
        ...applyCustomerBalance(customer, { payable: multiplier * invoice.unpaidAmount }),
        lastDealTime: multiplier > 0 ? invoice.date : customer.lastDealTime,
      }));
      return;
    }

    const matches = (vendor: Vendor) => invoice.sourcePartnerId
      ? vendor.id === invoice.sourcePartnerId
      : hasUniqueLegacyName(state.vendors, invoice.supplierName) && vendor.name.trim() === invoice.supplierName.trim();
    state.vendors = state.vendors.map((vendor) => !matches(vendor) ? vendor : withVendorGrade({
      ...vendor,
      totalBuyAmount: Math.max(0, vendor.totalBuyAmount + multiplier * invoice.totalCost),
      totalCount: Math.max(0, vendor.totalCount + multiplier * invoice.totalCount),
      ...applyVendorBalance(vendor, { payable: multiplier * invoice.unpaidAmount }),
      accountPaid: Math.max(0, (vendor.accountPaid || 0) + multiplier * invoice.paidAmount),
      lastDealTime: multiplier > 0 ? invoice.date : vendor.lastDealTime,
    }));
  };

  const applySalesPartnerImpact = (invoice: SalesInvoice, multiplier: 1 | -1) => {
    const isVendorCustomer = (invoice.customerPartnerType || "customer") === "vendor";
    if (isVendorCustomer) {
      const matches = (vendor: Vendor) => invoice.customerId
        ? vendor.id === invoice.customerId
        : hasUniqueLegacyName(state.vendors, invoice.customerName) && vendor.name.trim() === invoice.customerName.trim();
      state.vendors = state.vendors.map((vendor) => !matches(vendor) ? vendor : withVendorGrade({
        ...vendor,
        totalBuyAmount: Math.max(0, vendor.totalBuyAmount + multiplier * invoice.totalAmount),
        totalCount: Math.max(0, vendor.totalCount + multiplier * invoice.totalCount),
        ...applyVendorBalance(vendor, { receivable: multiplier * invoice.unpaidAmount }),
        accountPaid: Math.max(0, (vendor.accountPaid || 0) + multiplier * invoice.paidAmount),
        lastDealTime: multiplier > 0 ? invoice.date : vendor.lastDealTime,
      }));
      return;
    }

    const matches = (customer: CustomerCard) => invoice.customerId
      ? customer.id === invoice.customerId
      : hasUniqueLegacyName(state.customers, invoice.customerName) && customer.name.trim() === invoice.customerName.trim();
    state.customers = state.customers.map((customer) => !matches(customer) ? customer : withCustomerGrade({
      ...customer,
      totalAmount: Math.max(0, customer.totalAmount + multiplier * invoice.totalAmount),
      totalProfit: Math.max(0, customer.totalProfit + multiplier * invoice.totalProfit),
      buyCount: Math.max(0, customer.buyCount + multiplier * invoice.totalCount),
      ...applyCustomerBalance(customer, { receivable: multiplier * invoice.unpaidAmount }),
      lastDealTime: multiplier > 0 ? invoice.date : customer.lastDealTime,
    }));
  };

  const getCustomerContact = (customer: CustomerCard) => customer.contact || customer.phone || customer.wechat || "";
  const getVendorContact = (vendor: Vendor) => vendor.contact || vendor.phone || "";

  // Every new document must persist the archive ID. Names remain snapshots for display only;
  // they are never a reliable relationship key once duplicate names exist in the archive.
  const resolvePurchaseSourceArchive = (invoice: Pick<PurchaseInvoice, "sourceType" | "sourcePartnerId" | "supplierName" | "contact" | "date">) => {
    const sourceName = invoice.supplierName.trim();
    const sourceContact = invoice.contact.trim();
    if (!sourceName) throw new ValidationError("请选择来源档案");
    const isPersonalSource = ["个人回收", "客户置换"].includes(invoice.sourceType);
    if (isPersonalSource) {
      const candidates = state.customers.filter((customer) =>
        customer.name.trim() === sourceName &&
        (!sourceContact || getCustomerContact(customer) === sourceContact),
      );
      const customer = invoice.sourcePartnerId
        ? state.customers.find((item) => item.id === invoice.sourcePartnerId)
        : candidates.length === 1 ? candidates[0] : undefined;
      if (invoice.sourcePartnerId && !customer) throw new NotFoundError("所选个人客户档案不存在");
      if (!invoice.sourcePartnerId && candidates.length > 1) {
        throw new ConflictError("存在同名个人客户，请从来源客户中选择具体档案");
      }
      const resolved = customer || {
        id: nextPartnerArchiveId("KH", state.customers),
        name: sourceName,
        phone: sourceContact,
        wechat: sourceContact,
        contact: sourceContact,
        source: invoice.sourceType,
        firstChannel: invoice.sourceType,
        type: "个人卖家客户" as const,
        lastDealTime: invoice.date,
        totalAmount: 0,
        totalProfit: 0,
        buyCount: 0,
        recycleCount: 0,
        aftersalesCount: 0,
        receivableBalance: 0,
        payableBalance: 0,
        debtBalance: 0,
        tags: ["个人卖家"],
        remarks: "进货单自动创建",
      };
      if (!customer) state.customers = [...state.customers, resolved];
      return {
        sourcePartnerId: resolved.id,
        sourcePartnerType: "customer" as const,
        supplierName: resolved.name,
        contact: getCustomerContact(resolved),
      };
    }

    const candidates = state.vendors.filter((vendor) =>
      vendor.name.trim() === sourceName &&
      (!sourceContact || getVendorContact(vendor) === sourceContact),
    );
    const vendor = invoice.sourcePartnerId
      ? state.vendors.find((item) => item.id === invoice.sourcePartnerId)
      : candidates.length === 1 ? candidates[0] : undefined;
    if (invoice.sourcePartnerId && !vendor) throw new NotFoundError("所选同行档案不存在");
    if (!invoice.sourcePartnerId && candidates.length > 1) {
      throw new ConflictError("存在同名同行档案，请从来源客户中选择具体档案");
    }
    const resolved = vendor || {
      id: nextPartnerArchiveId("GY", state.vendors),
      name: sourceName,
      partnerCategory: "同行" as const,
      contactPerson: "业务联系人",
      phone: sourceContact,
      contact: sourceContact,
      type: "上游供应商" as const,
      totalBuyAmount: 0,
      totalCount: 0,
      avgProfit: 0,
      aftersalesCount: 0,
      aftersalesRate: 0,
      lastDealTime: invoice.date,
      accountPayable: 0,
      accountPaid: 0,
      remarks: "通过录入进货单自动新建",
    };
    if (!vendor) state.vendors = [...state.vendors, resolved];
    return {
      sourcePartnerId: resolved.id,
      sourcePartnerType: "vendor" as const,
      supplierName: resolved.name,
      contact: getVendorContact(resolved),
    };
  };

  const resolveSalesCustomerArchive = (invoice: Pick<SalesInvoice, "customerId" | "customerPartnerType" | "customerName" | "contact" | "channel" | "date">) => {
    const customerName = invoice.customerName.trim();
    const customerContact = invoice.contact.trim();
    if (!customerName) throw new ValidationError("请选择客户档案");
    const customerPartnerType = invoice.customerPartnerType || (invoice.channel === "同行网店" ? "vendor" : "customer");
    if (customerPartnerType === "vendor") {
      const candidates = state.vendors.filter((vendor) =>
        vendor.name.trim() === customerName &&
        (!customerContact || getVendorContact(vendor) === customerContact),
      );
      const vendor = invoice.customerId
        ? state.vendors.find((item) => item.id === invoice.customerId)
        : candidates.length === 1 ? candidates[0] : undefined;
      if (invoice.customerId && !vendor) throw new NotFoundError("所选同行档案不存在");
      if (!invoice.customerId && candidates.length > 1) {
        throw new ConflictError("存在同名同行档案，请从来源客户中选择具体档案");
      }
      const resolved = vendor || {
        id: nextPartnerArchiveId("GY", state.vendors),
        name: customerName,
        partnerCategory: "同行" as const,
        contactPerson: "业务联系人",
        phone: customerContact,
        contact: customerContact,
        type: "下游采购方" as const,
        totalBuyAmount: 0,
        totalCount: 0,
        avgProfit: 0,
        aftersalesCount: 0,
        aftersalesRate: 0,
        lastDealTime: invoice.date,
        accountPayable: 0,
        accountPaid: 0,
        remarks: "销售开单时自动创建",
      };
      if (!vendor) state.vendors = [...state.vendors, resolved];
      return {
        customerId: resolved.id,
        customerPartnerType: "vendor" as const,
        customerName: resolved.name,
        contact: getVendorContact(resolved),
      };
    }

    const candidates = state.customers.filter((customer) =>
      customer.name.trim() === customerName &&
      (!customerContact || getCustomerContact(customer) === customerContact),
    );
    const customer = invoice.customerId
      ? state.customers.find((item) => item.id === invoice.customerId)
      : candidates.length === 1 ? candidates[0] : undefined;
    if (invoice.customerId && !customer) throw new NotFoundError("所选个人客户档案不存在");
    if (!invoice.customerId && candidates.length > 1) {
      throw new ConflictError("存在同名个人客户，请从来源客户中选择具体档案");
    }
    const resolved = customer || {
      id: nextPartnerArchiveId("KH", state.customers),
      name: customerName,
      phone: customerContact,
      wechat: customerContact,
      contact: customerContact,
      source: invoice.channel,
      firstChannel: invoice.channel,
      type: "个人买家客户" as const,
      lastDealTime: invoice.date,
      totalAmount: 0,
      totalProfit: 0,
      buyCount: 0,
      recycleCount: 0,
        aftersalesCount: 0,
        receivableBalance: 0,
        payableBalance: 0,
        debtBalance: 0,
      tags: ["首单客户"],
      remarks: "销售开单时自动创建",
    };
    if (!customer) state.customers = [...state.customers, resolved];
    return {
      customerId: resolved.id,
      customerPartnerType: "customer" as const,
      customerName: resolved.name,
      contact: getCustomerContact(resolved),
    };
  };

  const createPaymentIn = (payment: Omit<PaymentInRecord, "id" | "accountName">, options?: { skipInvoiceUpdate?: boolean }) => {
    const paymentAmount = positiveAmount(payment.amount, "收款金额");
    if (payment.relatedDocNo && NON_OPERATING_INCOME_TYPES.has(String(payment.businessType || ""))) {
      throw new ValidationError("非经营收入不能绑定销售/采购业务单据，请使用关联参考号记录外部凭证");
    }
    const account = findSettlementAccount(payment.accountId);
    const linkedSalesInvoice = findSalesInvoiceByDocNo(payment.relatedDocNo);
    const effectiveCustomerId = payment.customerId || linkedSalesInvoice?.customerId;
    const effectiveCustomerPartnerType = payment.customerPartnerType || linkedSalesInvoice?.customerPartnerType || "customer";
    const baseRecord: PaymentInRecord = {
      ...payment,
      amount: paymentAmount,
      customerId: effectiveCustomerId,
      customerPartnerType: effectiveCustomerPartnerType,
      id: genId("SK"),
      accountName: account.name,
      time: payment.time || nowStamp(),
    };
    const businessType = payment.businessType || "销售收款";
    const settlementLedger = recordSettlementMovement({
      accountId: account.id,
      direction: "收入",
      amount: paymentAmount,
      businessType,
      relatedDocType: payment.relatedDocType,
      relatedDocNo: payment.relatedDocNo,
      customerName: payment.customerName,
      supplierName: payment.supplierName,
      handler: payment.handler,
      time: baseRecord.time,
      remarks: payment.remarks,
    });
    const financeLedger = createFinanceLedgerForSettlement({
      relatedId: payment.relatedDocNo || baseRecord.id,
      type: businessType === "销售收款" ? "销售收入" : businessType,
      paymentWay: payment.paymentMethod,
      amount: paymentAmount,
      operator: payment.handler,
      settlementAccountId: account.id,
      settlementAccountName: account.name,
      relatedDocType: payment.relatedDocType,
      customerName: payment.customerName,
      supplierName: payment.supplierName,
      time: baseRecord.time,
    });
    const record: PaymentInRecord = {
      ...baseRecord,
      settlementLedgerId: settlementLedger.id,
      financeLedgerId: financeLedger.id,
    };
    state.paymentInRecords = [record, ...state.paymentInRecords];
    if (!options?.skipInvoiceUpdate && payment.relatedDocNo) {
      let invoiceUnpaidBeforePayment = 0;
      state.salesInvoices = state.salesInvoices.map((invoice) => {
        if (invoice.invoiceNo !== payment.relatedDocNo && invoice.id !== payment.relatedDocNo) return invoice;
        invoiceUnpaidBeforePayment = invoice.unpaidAmount;
        const paidAmount = Math.min(invoice.totalAmount, invoice.paidAmount + paymentAmount);
        const unpaidAmount = Math.max(0, invoice.totalAmount - paidAmount);
        return {
          ...invoice,
          paidAmount,
          unpaidAmount,
          isPaid: unpaidAmount === 0,
          paymentStatus: unpaidAmount === 0 ? "已收款" : paidAmount > 0 ? "部分收款" : "未收款",
          settlementAccountId: account.id,
          settlementAccountName: account.name,
          paymentHandler: payment.handler,
        };
      });
      const debtReduction = Math.min(invoiceUnpaidBeforePayment, paymentAmount);
      if (record.customerPartnerType === "vendor") {
        state.vendors = state.vendors.map((vendor) =>
          (record.customerId ? vendor.id === record.customerId : hasUniqueLegacyName(state.vendors, record.customerName) && vendor.name.trim() === record.customerName.trim())
            ? { ...vendor, ...applyVendorBalance(vendor, { receivable: -debtReduction }) }
            : vendor,
        );
      } else {
        state.customers = state.customers.map((customer) =>
          matchesCustomerByIdOrLegacyName(customer, record.customerId, record.customerName)
            ? { ...customer, ...applyCustomerBalance(customer, { receivable: -debtReduction }) }
            : customer,
        );
      }
    }
    addLog(systemActor(), "结算账户", "新增收款单", record.id, undefined, `账户: ${account.name}, 金额: ${paymentAmount}元, 经办人: ${payment.handler}`);
    return record;
  };

  const updatePaymentIn = (id: string, payment: Partial<PaymentInRecord>) => {
    const existing = state.paymentInRecords.find((item) => item.id === id);
    if (!existing) throw new NotFoundError(`收款单不存在: ${id}`);
    if (existing.relatedDocNo) {
      throw new ConflictError("已绑定业务单据的收款单不能直接编辑，请在关联销售单或冲销流程中处理");
    }
    const nextAmount = Number(payment.amount ?? existing.amount);
    const nextBusinessType = payment.businessType ?? existing.businessType;
    if (!Number.isFinite(nextAmount) || nextAmount <= 0) throw new ValidationError("收款金额必须大于 0");
    if (payment.relatedDocNo && NON_OPERATING_INCOME_TYPES.has(String(nextBusinessType || ""))) {
      throw new ValidationError("非经营收入不能绑定销售/采购业务单据，请使用关联参考号记录外部凭证");
    }
    const nextAccount = findSettlementAccount(payment.accountId || existing.accountId);
    const updated: PaymentInRecord = {
      ...existing,
      ...payment,
      id,
      accountId: nextAccount.id,
      accountName: nextAccount.name,
      amount: nextAmount,
      time: payment.time || existing.time,
    };
    const settlementLedgerId = findPaymentInSettlementLedgerId(existing);
    const financeLedgerId = findPaymentInFinanceLedgerId(existing);
    if (!settlementLedgerId || !financeLedgerId) {
      throw new ConflictError("收款单缺少唯一关联流水，不能直接编辑，请使用冲销流程处理");
    }
    updated.settlementLedgerId = settlementLedgerId;
    updated.financeLedgerId = financeLedgerId;
    state.settlementAccounts = state.settlementAccounts.map((account) => {
      if (account.id === existing.accountId) {
        const balance = account.balance - existing.amount;
        return { ...account, balance, availableBalance: balance - account.frozenAmount, lastChangeTime: nowStamp() };
      }
      return account;
    });
    state.settlementAccounts = state.settlementAccounts.map((account) => {
      if (account.id === updated.accountId) {
        const balance = account.balance + updated.amount;
        return { ...account, balance, availableBalance: balance - account.frozenAmount, lastChangeTime: updated.time };
      }
      return account;
    });
    state.paymentInRecords = state.paymentInRecords.map((item) => (item.id === id ? updated : item));
    state.settlementLedger = state.settlementLedger.map((item) => {
      if (item.id !== settlementLedgerId) return item;
      const account = state.settlementAccounts.find((acc) => acc.id === updated.accountId) || nextAccount;
      return {
        ...item,
        accountId: updated.accountId,
        accountName: account.name,
        accountType: account.type,
        incomeAmount: updated.amount,
        changeAmount: updated.amount,
        businessType: updated.businessType || "销售收款",
        relatedDocType: updated.relatedDocType,
        relatedDocNo: updated.relatedDocNo,
        customerName: updated.customerName,
        supplierName: updated.supplierName,
        handler: updated.handler,
        time: updated.time,
        remarks: updated.remarks,
      };
    });
    state.financeLedger = state.financeLedger.map((item) => {
      if (item.id !== financeLedgerId) return item;
      return {
        ...item,
        relatedId: updated.relatedDocNo || updated.id,
        type: (updated.businessType || "销售收款") === "销售收款" ? "销售收入" : (updated.businessType || "销售收款"),
        paymentWay: updated.paymentMethod,
        amount: updated.amount,
        operator: updated.handler,
        handler: updated.handler,
        settlementAccountId: updated.accountId,
        settlementAccountName: updated.accountName,
        relatedDocType: updated.relatedDocType,
        customerName: updated.customerName,
        supplierName: updated.supplierName,
        time: updated.time,
      };
    });
    rebuildSettlementLedgerBalances([existing.accountId, updated.accountId]);
    addLog(systemActor(), "结算账户", "编辑收款单", id, `${existing.amount}元`, `${updated.amount}元`);
    return updated;
  };

  const deletePaymentIn = (id: string, options?: { skipInvoiceUpdate?: boolean }) => {
    const existing = state.paymentInRecords.find((item) => item.id === id);
    if (!existing) throw new NotFoundError(`收款单不存在: ${id}`);
    if (!options?.skipInvoiceUpdate && existing.relatedDocNo) {
      throw new ConflictError("已绑定业务单据的收款单不能直接删除，请先处理关联销售单或使用冲销流程");
    }
    const settlementLedgerId = findPaymentInSettlementLedgerId(existing);
    const financeLedgerId = findPaymentInFinanceLedgerId(existing);
    if (!settlementLedgerId || !financeLedgerId) {
      throw new ConflictError("收款单缺少唯一关联流水，不能直接删除，请使用冲销流程处理");
    }
    adjustSettlementBalance(existing.accountId, -existing.amount);
    state.paymentInRecords = state.paymentInRecords.filter((item) => item.id !== id);
    state.settlementLedger = state.settlementLedger.filter((item) => item.id !== settlementLedgerId);
    state.financeLedger = state.financeLedger.filter((item) => item.id !== financeLedgerId);
    rebuildSettlementLedgerBalances([existing.accountId]);
    if (!options?.skipInvoiceUpdate && existing.relatedDocNo) {
      let restoredDebt = 0;
      state.salesInvoices = state.salesInvoices.map((invoice) => {
        if (invoice.invoiceNo !== existing.relatedDocNo && invoice.id !== existing.relatedDocNo) return invoice;
        const paidAmount = Math.max(0, invoice.paidAmount - existing.amount);
        const unpaidAmount = Math.max(0, invoice.totalAmount - paidAmount);
        restoredDebt = unpaidAmount - invoice.unpaidAmount;
        return {
          ...invoice,
          paidAmount,
          unpaidAmount,
          isPaid: unpaidAmount === 0,
          paymentStatus: unpaidAmount === 0 ? "已收款" : paidAmount > 0 ? "部分收款" : "未收款",
        };
      });
      if (restoredDebt > 0 && existing.customerName) {
        if (existing.customerPartnerType === "vendor") {
          state.vendors = state.vendors.map((vendor) =>
            (existing.customerId ? vendor.id === existing.customerId : hasUniqueLegacyName(state.vendors, existing.customerName) && vendor.name.trim() === existing.customerName.trim())
              ? { ...vendor, ...applyVendorBalance(vendor, { receivable: restoredDebt }) }
              : vendor,
          );
        } else {
          state.customers = state.customers.map((customer) =>
            matchesCustomerByIdOrLegacyName(customer, existing.customerId, existing.customerName) ? { ...customer, ...applyCustomerBalance(customer, { receivable: restoredDebt }) } : customer,
          );
        }
      }
    }
    addLog(systemActor(), "结算账户", "删除收款单", id, `${existing.amount}元`, "已反向修正账户余额");
    return existing;
  };

  const createPaymentOut = (payment: Omit<PaymentOutRecord, "id" | "accountName">, options?: { skipInvoiceUpdate?: boolean }) => {
    const paymentAmount = positiveAmount(payment.amount, "付款金额");
    if (payment.relatedDocNo && NON_OPERATING_EXPENSE_TYPES.has(String(payment.businessType || ""))) {
      throw new ValidationError("非经营支出不能绑定采购/退货业务单据，请使用关联参考号记录外部凭证");
    }
    const account = findSettlementAccount(payment.accountId);
    const linkedPurchaseInvoice = findPurchaseInvoiceByDocNo(payment.relatedDocNo);
    const effectiveSupplierId = payment.supplierId || purchaseInvoiceVendorId(linkedPurchaseInvoice);
    const effectiveCustomerId = payment.customerId || (
      linkedPurchaseInvoice && ["个人回收", "客户置换"].includes(linkedPurchaseInvoice.sourceType)
        ? linkedPurchaseInvoice.sourcePartnerId
        : undefined
    );
    const baseRecord: PaymentOutRecord = {
      ...payment,
      amount: paymentAmount,
      supplierId: effectiveSupplierId,
      customerId: effectiveCustomerId,
      id: genId("FK"),
      accountName: account.name,
      time: payment.time || nowStamp(),
    };
    const settlementLedger = recordSettlementMovement({
      accountId: account.id,
      direction: "支出",
      amount: paymentAmount,
      businessType: payment.businessType,
      relatedDocType: payment.relatedDocType,
      relatedDocNo: payment.relatedDocNo,
      customerName: payment.customerName,
      supplierName: payment.supplierName,
      handler: payment.handler,
      time: baseRecord.time,
      remarks: payment.remarks,
    });
    const financeLedger = createFinanceLedgerForSettlement({
      relatedId: payment.relatedDocNo || baseRecord.id,
      type: payment.businessType,
      paymentWay: payment.paymentMethod,
      amount: -paymentAmount,
      operator: payment.handler,
      settlementAccountId: account.id,
      settlementAccountName: account.name,
      relatedDocType: payment.relatedDocType,
      customerName: payment.customerName,
      supplierName: payment.supplierName,
      time: baseRecord.time,
    });
    const record: PaymentOutRecord = {
      ...baseRecord,
      settlementLedgerId: settlementLedger.id,
      financeLedgerId: financeLedger.id,
    };
    state.paymentOutRecords = [record, ...state.paymentOutRecords];
    if (!options?.skipInvoiceUpdate && payment.relatedDocNo) {
      let invoiceUnpaidBeforePayment = 0;
      state.purchaseInvoices = state.purchaseInvoices.map((invoice) => {
        if (invoice.invoiceNo !== payment.relatedDocNo && invoice.id !== payment.relatedDocNo) return invoice;
        invoiceUnpaidBeforePayment = invoice.unpaidAmount;
        const paidAmount = Math.min(invoice.totalCost, invoice.paidAmount + paymentAmount);
        const unpaidAmount = Math.max(0, invoice.totalCost - paidAmount);
        return {
          ...invoice,
          paidAmount,
          unpaidAmount,
          isPaid: unpaidAmount === 0,
          paymentStatus: unpaidAmount === 0 ? "已付款" : paidAmount > 0 ? "部分付款" : "未付款",
          settlementAccountId: account.id,
          settlementAccountName: account.name,
          paymentHandler: payment.handler,
        };
      });
      const payableReduction = Math.min(invoiceUnpaidBeforePayment, paymentAmount);
      if (payment.supplierName || effectiveSupplierId) {
        state.vendors = state.vendors.map((vendor) =>
          paymentOutMatchesVendor(vendor, record)
            ? {
                ...vendor,
                accountPayable: Math.max(0, vendor.accountPayable - payableReduction),
                accountPaid: vendor.accountPaid + paymentAmount,
              }
            : vendor,
        );
      }
      if (record.customerId || (linkedPurchaseInvoice && ["个人回收", "客户置换"].includes(linkedPurchaseInvoice.sourceType))) {
        state.customers = state.customers.map((customer) =>
          matchesCustomerByIdOrLegacyName(customer, record.customerId, record.customerName)
            ? { ...customer, ...applyCustomerBalance(customer, { payable: -payableReduction }) }
            : customer,
        );
      }
    }
    addLog(systemActor(), "结算账户", "新增付款单", record.id, undefined, `账户: ${account.name}, 金额: ${paymentAmount}元, 经办人: ${payment.handler}`);
    return record;
  };

  const updatePaymentOut = (id: string, payment: Partial<PaymentOutRecord>) => {
    const existing = state.paymentOutRecords.find((item) => item.id === id);
    if (!existing) throw new NotFoundError(`付款单不存在: ${id}`);
    if (existing.relatedDocNo) {
      throw new ConflictError("已绑定业务单据的付款单不能直接编辑，请在关联进货/入库单或冲销流程中处理");
    }
    const nextAmount = Number(payment.amount ?? existing.amount);
    const nextBusinessType = payment.businessType ?? existing.businessType;
    if (!Number.isFinite(nextAmount) || nextAmount <= 0) throw new ValidationError("付款金额必须大于 0");
    if (payment.relatedDocNo && NON_OPERATING_EXPENSE_TYPES.has(String(nextBusinessType || ""))) {
      throw new ValidationError("非经营支出不能绑定采购/退货业务单据，请使用关联参考号记录外部凭证");
    }
    const nextAccount = findSettlementAccount(payment.accountId || existing.accountId);
    const updated: PaymentOutRecord = {
      ...existing,
      ...payment,
      id,
      accountId: nextAccount.id,
      accountName: nextAccount.name,
      amount: nextAmount,
      time: payment.time || existing.time,
      businessType: payment.businessType || existing.businessType,
    };
    const settlementLedgerId = findPaymentOutSettlementLedgerId(existing);
    const financeLedgerId = findPaymentOutFinanceLedgerId(existing);
    if (!settlementLedgerId || !financeLedgerId) {
      throw new ConflictError("付款单缺少唯一关联流水，不能直接编辑，请使用冲销流程处理");
    }
    updated.settlementLedgerId = settlementLedgerId;
    updated.financeLedgerId = financeLedgerId;
    state.settlementAccounts = state.settlementAccounts.map((account) => {
      if (account.id === existing.accountId) {
        const balance = account.balance + existing.amount;
        return { ...account, balance, availableBalance: balance - account.frozenAmount, lastChangeTime: nowStamp() };
      }
      return account;
    });
    state.settlementAccounts = state.settlementAccounts.map((account) => {
      if (account.id === updated.accountId) {
        const balance = account.balance - updated.amount;
        return { ...account, balance, availableBalance: balance - account.frozenAmount, lastChangeTime: updated.time };
      }
      return account;
    });
    state.paymentOutRecords = state.paymentOutRecords.map((item) => (item.id === id ? updated : item));
    state.settlementLedger = state.settlementLedger.map((item) => {
      if (item.id !== settlementLedgerId) return item;
      const account = state.settlementAccounts.find((acc) => acc.id === updated.accountId) || nextAccount;
      return {
        ...item,
        accountId: updated.accountId,
        accountName: account.name,
        accountType: account.type,
        expenseAmount: updated.amount,
        changeAmount: -updated.amount,
        businessType: updated.businessType,
        relatedDocType: updated.relatedDocType,
        relatedDocNo: updated.relatedDocNo,
        customerName: updated.customerName,
        supplierName: updated.supplierName,
        handler: updated.handler,
        time: updated.time,
        remarks: updated.remarks,
      };
    });
    state.financeLedger = state.financeLedger.map((item) => {
      if (item.id !== financeLedgerId) return item;
      return {
        ...item,
        relatedId: updated.relatedDocNo || updated.id,
        type: updated.businessType,
        paymentWay: updated.paymentMethod,
        amount: -updated.amount,
        operator: updated.handler,
        handler: updated.handler,
        settlementAccountId: updated.accountId,
        settlementAccountName: updated.accountName,
        relatedDocType: updated.relatedDocType,
        customerName: updated.customerName,
        supplierName: updated.supplierName,
        time: updated.time,
      };
    });
    rebuildSettlementLedgerBalances([existing.accountId, updated.accountId]);
    addLog(systemActor(), "结算账户", "编辑付款单", id, `${existing.amount}元`, `${updated.amount}元`);
    return updated;
  };

  const deletePaymentOut = (id: string, options?: { skipInvoiceUpdate?: boolean }) => {
    const existing = state.paymentOutRecords.find((item) => item.id === id);
    if (!existing) throw new NotFoundError(`付款单不存在: ${id}`);
    if (!options?.skipInvoiceUpdate && existing.relatedDocNo) {
      throw new ConflictError("已绑定业务单据的付款单不能直接删除，请先处理关联进货/入库单或使用冲销流程");
    }
    const settlementLedgerId = findPaymentOutSettlementLedgerId(existing);
    const financeLedgerId = findPaymentOutFinanceLedgerId(existing);
    if (!settlementLedgerId || !financeLedgerId) {
      throw new ConflictError("付款单缺少唯一关联流水，不能直接删除，请使用冲销流程处理");
    }
    adjustSettlementBalance(existing.accountId, existing.amount);
    state.paymentOutRecords = state.paymentOutRecords.filter((item) => item.id !== id);
    state.settlementLedger = state.settlementLedger.filter((item) => item.id !== settlementLedgerId);
    state.financeLedger = state.financeLedger.filter((item) => item.id !== financeLedgerId);
    rebuildSettlementLedgerBalances([existing.accountId]);
    if (!options?.skipInvoiceUpdate && existing.relatedDocNo) {
      let restoredPayable = 0;
      state.purchaseInvoices = state.purchaseInvoices.map((invoice) => {
        if (invoice.invoiceNo !== existing.relatedDocNo && invoice.id !== existing.relatedDocNo) return invoice;
        const paidAmount = Math.max(0, invoice.paidAmount - existing.amount);
        const unpaidAmount = Math.max(0, invoice.totalCost - paidAmount);
        restoredPayable = unpaidAmount - invoice.unpaidAmount;
        return {
          ...invoice,
          paidAmount,
          unpaidAmount,
          isPaid: unpaidAmount === 0,
          paymentStatus: unpaidAmount === 0 ? "已付款" : paidAmount > 0 ? "部分付款" : "未付款",
      };
    });
      if (existing.supplierName || existing.supplierId) {
        state.vendors = state.vendors.map((vendor) =>
          paymentOutMatchesVendor(vendor, existing)
            ? {
                ...vendor,
                accountPayable: vendor.accountPayable + Math.max(0, restoredPayable),
                accountPaid: Math.max(0, vendor.accountPaid - existing.amount),
              }
            : vendor,
        );
      }
      if (existing.customerId) {
        state.customers = state.customers.map((customer) =>
          matchesCustomerByIdOrLegacyName(customer, existing.customerId, existing.customerName)
            ? { ...customer, ...applyCustomerBalance(customer, { payable: Math.max(0, restoredPayable) }) }
            : customer,
        );
      }
    }
    addLog(systemActor(), "结算账户", "删除付款单", id, `${existing.amount}元`, "已反向修正账户余额");
    return existing;
  };

  const findReturnInventory = (order: Pick<ReturnOrder, "sourceInventoryId" | "sn">) =>
    state.inventory.find((card) => card.id === order.sourceInventoryId || (!!order.sn && card.sn === order.sn));

  type ReturnLineMatch<T> = {
    id: string;
    index: number;
    item: T;
  };

  const sameReturnAmount = (left?: number, right?: number) => Math.abs(Number(left || 0) - Number(right || 0)) < 0.009;

  const makeSalesReturnLineId = (item: SalesItem, index: number) => {
    if (item.inventoryId) return `inventory:${item.inventoryId}`;
    if (item.sn) return `sn:${item.sn}`;
    return `line:${index}:${item.productId || ""}:${item.productName || ""}:${Number(item.sellPrice || 0)}`;
  };

  const makePurchaseReturnLineId = (item: PurchaseItem, index: number) => {
    if (item.tempId) return `temp:${item.tempId}`;
    if (item.sn) return `sn:${item.sn}`;
    return `line:${index}:${item.productId || ""}:${item.productName || ""}:${Number(item.buyPrice || 0)}`;
  };

  const findSalesReturnLine = (
    invoice: SalesInvoice | undefined,
    order: Pick<ReturnOrder, "sourceSalesItemId" | "sourceSalesItemIndex" | "sourceInventoryId" | "sn" | "amount">,
    sourceCard?: CardInventory,
  ): ReturnLineMatch<SalesItem> | undefined => {
    if (!invoice) return undefined;
    const indexed = invoice.items.map((item, index) => ({ id: makeSalesReturnLineId(item, index), index, item }));
    if (order.sourceSalesItemId) {
      const byId = indexed.find((line) => line.id === order.sourceSalesItemId);
      if (byId) return byId;
    }
    if (typeof order.sourceSalesItemIndex === "number") {
      const byIndex = indexed[order.sourceSalesItemIndex];
      if (byIndex && sameReturnAmount(byIndex.item.sellPrice, order.amount)) return byIndex;
    }
    const inventoryId = sourceCard?.id || order.sourceInventoryId;
    if (inventoryId) {
      const byInventory = indexed.find((line) => line.item.inventoryId === inventoryId);
      if (byInventory) return byInventory;
    }
    if (order.sn || sourceCard?.sn) {
      const sn = order.sn || sourceCard?.sn;
      const bySn = indexed.find((line) => line.item.sn === sn);
      if (bySn) return bySn;
    }
    return undefined;
  };

  const findPurchaseReturnLine = (
    invoice: PurchaseInvoice | undefined,
    order: Pick<ReturnOrder, "sourcePurchaseItemId" | "sourcePurchaseItemIndex" | "sourceInventoryId" | "sn" | "amount">,
    sourceCard?: CardInventory,
  ): ReturnLineMatch<PurchaseItem> | undefined => {
    if (!invoice) return undefined;
    const indexed = invoice.items.map((item, index) => ({ id: makePurchaseReturnLineId(item, index), index, item }));
    if (order.sourcePurchaseItemId) {
      const byId = indexed.find((line) => line.id === order.sourcePurchaseItemId);
      if (byId) return byId;
    }
    if (typeof order.sourcePurchaseItemIndex === "number") {
      const byIndex = indexed[order.sourcePurchaseItemIndex];
      if (byIndex && sameReturnAmount(byIndex.item.buyPrice, order.amount)) return byIndex;
    }
    if (sourceCard?.sn || order.sn) {
      const sn = order.sn || sourceCard?.sn;
      const bySn = indexed.find((line) => line.item.sn === sn);
      if (bySn) return bySn;
    }
    if (sourceCard) {
      const productIdentityIndex = createProductIdentityIndex(state.products);
      const byCardShape = indexed.find((line) =>
        sameProductIdentity(line.item, sourceCard, productIdentityIndex) &&
        sameReturnAmount(line.item.buyPrice, sourceCard.costPrice),
      );
      if (byCardShape) return byCardShape;
    }
    return undefined;
  };

  const insertAtOriginalIndex = <T,>(items: T[], item: T, originalIndex?: number) => {
    if (typeof originalIndex !== "number" || originalIndex < 0 || originalIndex > items.length) return [...items, item];
    return [...items.slice(0, originalIndex), item, ...items.slice(originalIndex)];
  };

  const removeReturnRemark = (remarks: string | undefined, returnNo: string) =>
    (remarks || "")
      .split("；")
      .map((part) => part.trim())
      .filter((part) => part && !part.includes(returnNo))
      .join("；");

  const findReturnPaymentIn = (order: ReturnOrder) =>
    state.paymentInRecords.find((item) => item.id === order.paymentRecordId) ||
    state.paymentInRecords.find((item) => item.relatedDocNo === order.returnNo && item.businessType === "采购退款");

  const findReturnPaymentOut = (order: ReturnOrder) =>
    state.paymentOutRecords.find((item) => item.id === order.paymentRecordId) ||
    state.paymentOutRecords.find((item) => item.relatedDocNo === order.returnNo && item.businessType === "客户退款");

  const returnRefundPayments = (order: ReturnOrder) => {
    const paymentIds = new Set([order.paymentRecordId, ...(order.refundPaymentRecordIds || [])].filter(Boolean));
    const records = order.type === "销售退货"
      ? state.paymentOutRecords.filter((item) => paymentIds.has(item.id) || (item.relatedDocNo === order.returnNo && item.businessType === "客户退款"))
      : state.paymentInRecords.filter((item) => paymentIds.has(item.id) || (item.relatedDocNo === order.returnNo && item.businessType === "采购退款"));
    return records;
  };

  const returnCashReleased = (order: ReturnOrder) => {
    if (order.type === "进货退货" && order.cashReleasedAmount !== undefined) return Number(order.cashReleasedAmount || 0);
    return returnRefundPayments(order).reduce((sum, payment) => sum + Number(payment.amount || 0), 0);
  };

  const createRefundAllocations = (
    type: ReturnOrder["type"],
    relatedDocNo: string,
    cashAmount: number,
    requested: ReturnRefundAllocation[] | undefined,
    legacyFallbackAccountId?: string,
  ): ReturnRefundAllocation[] => {
    if (cashAmount <= 0) return [];
    const sourcePayments = (type === "销售退货" ? state.paymentInRecords : state.paymentOutRecords)
      .filter((payment) =>
        (payment.relatedDocNo === relatedDocNo) &&
        (type === "销售退货" ? payment.businessType === "销售收款" : payment.businessType === "采购付款"),
      )
      .sort((left, right) => String(left.time).localeCompare(String(right.time)) || left.id.localeCompare(right.id));
    const availableById = new Map(sourcePayments.map((payment) => [payment.id, Number(payment.amount || 0)]));

    // A small set of historical documents has a cash paid field but no linked payment record.
    // Do not silently choose an account: keep an explicit, labelled legacy allocation only when
    // the caller selects an account. New documents always require real source payment records.
    if (!sourcePayments.length) {
      if (!legacyFallbackAccountId) {
        throw new ConflictError("原单缺少收付款流水，无法自动原路退款；请先补齐历史付款流水或选择人工退款账户");
      }
      const account = findSettlementAccount(legacyFallbackAccountId);
      return [{
        sourcePaymentRecordId: "",
        accountId: account.id,
        accountName: account.name,
        paymentMethod: account.platform || "人工退款",
        amount: cashAmount,
      }];
    }

    // Old return orders did not store source-payment splits. Deduct them in the same stable
    // order before allocating a new return, so new refunds cannot re-use historical cash.
    const legacyRefundTotal = state.returnOrders
      .filter((order) => order.status === "已完成" && order.type === type && order.relatedDocNo === relatedDocNo && !(order.refundAllocations || []).length)
      .reduce((sum, order) => sum + returnCashReleased(order), 0);
    let legacyRemaining = legacyRefundTotal;
    for (const payment of sourcePayments) {
      const available = availableById.get(payment.id) || 0;
      const used = Math.min(available, legacyRemaining);
      availableById.set(payment.id, available - used);
      legacyRemaining -= used;
    }
    for (const order of state.returnOrders.filter((item) => item.status === "已完成" && item.type === type && item.relatedDocNo === relatedDocNo)) {
      for (const allocation of order.refundAllocations || []) {
        availableById.set(allocation.sourcePaymentRecordId, (availableById.get(allocation.sourcePaymentRecordId) || 0) - Number(allocation.amount || 0));
      }
    }

    const sourceById = new Map(sourcePayments.map((payment) => [payment.id, payment]));
    const normalize = (sourcePaymentId: string, amount: number): ReturnRefundAllocation => {
      const source = sourceById.get(sourcePaymentId);
      if (!source) throw new NotFoundError("退款分摊必须引用关联原单的收付款流水");
      const available = Math.max(0, availableById.get(sourcePaymentId) || 0);
      if (!Number.isFinite(amount) || amount <= 0 || amount > available + 0.009) {
        throw new ConflictError(`原付款流水可退款金额不足：${source.accountName} 可用 ${available} 元`);
      }
      availableById.set(sourcePaymentId, available - amount);
      return {
        sourcePaymentRecordId: sourcePaymentId,
        accountId: source.accountId,
        accountName: source.accountName,
        paymentMethod: source.paymentMethod,
        amount,
      };
    };
    const allocations = requested?.length
      ? requested.map((item) => normalize(item.sourcePaymentRecordId, Number(item.amount || 0)))
      : (() => {
          let remaining = cashAmount;
          const generated: ReturnRefundAllocation[] = [];
          for (const payment of sourcePayments) {
            if (remaining <= 0.009) break;
            const amount = Math.min(Math.max(0, availableById.get(payment.id) || 0), remaining);
            if (amount > 0.009) generated.push(normalize(payment.id, amount));
            remaining -= amount;
          }
          return generated;
        })();
    const allocated = allocations.reduce((sum, item) => sum + item.amount, 0);
    if (Math.abs(allocated - cashAmount) > 0.009) {
      throw new ConflictError(`原付款流水不足以覆盖本次退款：需退款 ${cashAmount} 元，已分摊 ${allocated} 元`);
    }
    return allocations;
  };

  const createReturnOrder = (input: Omit<ReturnOrder, "id" | "returnNo" | "status" | "date" | "settlementAccountName"> & { date?: string }) => {
    if (!input.type) throw new ValidationError("退货类型不能为空");
    if (!input.relatedDocNo?.trim()) throw new ValidationError("退货必须关联业务单据");
    if (!Number.isFinite(Number(input.amount)) || Number(input.amount) <= 0) throw new ValidationError("退货金额必须为大于 0 的有效数字");
    if (input.type === "销售退货" && input.settlementMode !== "原路退款") {
      throw new ValidationError("销售退货仅支持原路退款");
    }
    if (input.type === "进货退货" && !["原路退款", "抵扣账款", "直接冲销"].includes(input.settlementMode)) {
      throw new ValidationError("进货退货结算方式无效");
    }
    const allowedInventoryActions = input.type === "销售退货"
      ? ["退回待检测", "直接报废"]
      : ["退回供应商", "直接报废"];
    if (!allowedInventoryActions.includes(input.inventoryAction)) {
      throw new ValidationError(`${input.type}的库存处理方式无效`);
    }

    const sourceCard = input.sourceInventoryId || input.sn ? findReturnInventory(input) : undefined;
    const salesInvoice = input.type === "销售退货"
      ? state.salesInvoices.find((invoice) => invoice.invoiceNo === input.relatedDocNo || invoice.id === input.relatedDocNo)
      : undefined;
    const purchaseInvoice = input.type === "进货退货"
      ? state.purchaseInvoices.find((invoice) => invoice.invoiceNo === input.relatedDocNo || invoice.id === input.relatedDocNo)
      : undefined;
    const salesLine = findSalesReturnLine(salesInvoice, input, sourceCard);
    const purchaseLine = findPurchaseReturnLine(purchaseInvoice, input, sourceCard);
    const salesItem = salesLine?.item;
    const purchaseItem = purchaseLine?.item;
    const amount = Number(input.amount || salesItem?.sellPrice || purchaseItem?.buyPrice || sourceCard?.costPrice || 0);

    if (input.type === "销售退货") {
      if (!salesInvoice) throw new NotFoundError(`销售退货关联销售单不存在: ${input.relatedDocNo}`);
      if (!sourceCard || !salesItem || sourceCard.salesInvoiceId !== salesInvoice.invoiceNo) {
        throw new ConflictError("所选库存不属于关联销售单");
      }
      if (salesInvoice.outboundStatus !== "已出库") throw new ConflictError("销售单尚未完成出库，不能办理退货");
      if (Math.abs(amount - Number(salesItem.sellPrice || 0)) > 0.009) throw new ValidationError("销售退货金额必须与原商品成交价一致");
    }
    if (input.type === "进货退货") {
      if (!purchaseInvoice) throw new NotFoundError(`进货退货关联采购单不存在: ${input.relatedDocNo}`);
      if (!sourceCard || findPurchaseInvoiceForCard(sourceCard)?.id !== purchaseInvoice.id || !purchaseItem) {
        throw new ConflictError("所选库存不属于关联采购单");
      }
      if (["已售出", "已退货", "已报废", "已拆卸", "已组装"].includes(sourceCard.status)) {
        throw new ConflictError(`库存状态为${sourceCard.status}，不能办理进货退货`);
      }
      if (Math.abs(amount - Number(purchaseItem.buyPrice || sourceCard.costPrice || 0)) > 0.009) throw new ValidationError("进货退货金额必须与原商品进货价一致");
    }

    const duplicateReturn = state.returnOrders.find((order) =>
      order.status !== "已作废" &&
      order.sourceInventoryId === sourceCard?.id
    );
    if (duplicateReturn) throw new ConflictError(`该库存已有未完成的退货单: ${duplicateReturn.returnNo}`);

    const resultingTotal = input.type === "销售退货"
      ? Math.max(0, Number(salesInvoice?.totalAmount || 0) - amount)
      : Math.max(0, Number(purchaseInvoice?.totalCost || 0) - amount);
    const paidBefore = input.type === "销售退货" ? Number(salesInvoice?.paidAmount || 0) : Number(purchaseInvoice?.paidAmount || 0);
    const cashSettlementAmount = Math.max(0, paidBefore - Math.min(paidBefore, resultingTotal));
    const refundAllocations = input.settlementMode === "原路退款"
      ? createRefundAllocations(input.type, input.relatedDocNo, cashSettlementAmount, input.refundAllocations, input.settlementAccountId)
      : [];
    if (input.type === "进货退货" && input.settlementMode === "直接冲销") {
      const invoiceCredit = purchaseVendorCreditApplied(purchaseInvoice);
      const linkedPayments = state.paymentOutRecords.filter((payment) =>
        payment.relatedDocNo === purchaseInvoice?.invoiceNo || payment.relatedDocNo === purchaseInvoice?.id,
      );
      if (resultingTotal > 0 || invoiceCredit > 0 || linkedPayments.length !== 1) {
        throw new ConflictError("直接冲销仅用于整张采购单误录的一笔现金付款；含部分退货、供应商抵扣或多笔付款时请分别处理");
      }
      const linkedPayment = linkedPayments[0];
      if (
        linkedPayment.businessType !== "采购付款" ||
        Math.abs(Number(linkedPayment.amount || 0) - paidBefore) > 0.009
      ) {
        throw new ConflictError("直接冲销要求原采购单的唯一采购付款与现金已付金额完全一致；历史金额不一致请先核对付款流水");
      }
    }
    if (
      input.type === "进货退货" &&
      input.settlementMode === "抵扣账款" &&
      purchaseInvoice &&
      ["个人回收", "客户置换"].includes(purchaseInvoice.sourceType) &&
      cashSettlementAmount > 0
    ) {
      throw new ValidationError("个人回收的已付款退货不能留作供应商抵扣余额，请选择原路退款");
    }

    const order: ReturnOrder = {
      ...input,
      id: genId("TH"),
      returnNo: nextReturnNo(input.type),
      status: "待处理",
      date: input.date || storeDate(),
      relatedDocType: input.relatedDocType || (input.type === "销售退货" ? "销售单" : "采购单"),
      relatedDocNo: input.relatedDocNo,
      sourceInventoryId: sourceCard?.id || input.sourceInventoryId,
      sourceSalesItemId: salesLine?.id,
      sourceSalesItemIndex: salesLine?.index,
      sourceSalesItemSnapshot: salesItem ? { ...salesItem } : undefined,
      sourcePurchaseItemId: purchaseLine?.id,
      sourcePurchaseItemIndex: purchaseLine?.index,
      sourcePurchaseItemSnapshot: purchaseItem ? { ...purchaseItem } : undefined,
      productId: sourceCard?.productId || salesItem?.productId || purchaseItem?.productId || input.productId,
      productName: sourceCard?.productName || salesItem?.productName || purchaseItem?.productName || input.productName,
      sn: sourceCard?.sn || salesItem?.sn || purchaseItem?.sn || input.sn,
      partyId: input.partyId || salesInvoice?.customerId || purchaseInvoice?.sourcePartnerId,
      partyType: input.partyType || (input.type === "销售退货" ? (salesInvoice?.customerPartnerType === "vendor" ? "vendor" : "customer") : (purchaseInvoice?.sourcePartnerType || (["个人回收", "客户置换"].includes(purchaseInvoice?.sourceType || "") ? "customer" : "vendor"))),
      partyName: input.partyName || salesInvoice?.customerName || purchaseInvoice?.supplierName || sourceCard?.supplierName,
      contact: input.contact || salesInvoice?.contact || purchaseInvoice?.contact,
      amount,
      refundAllocations,
      settlementAccountId: refundAllocations.length === 1 ? refundAllocations[0].accountId : undefined,
      settlementAccountName: refundAllocations.length === 1 ? refundAllocations[0].accountName : undefined,
    };
    state.returnOrders = [order, ...state.returnOrders];
    addLog(systemActor(), "退货管理", `创建${order.type}`, order.returnNo, undefined, `${order.partyName || "未记录对象"} / ${order.amount}元`);
    return order;
  };

  const reverseSalesReturn = (order: ReturnOrder) => {
    const invoice = state.salesInvoices.find((item) => item.invoiceNo === order.relatedDocNo || item.id === order.relatedDocNo);
    const returnedCard = findReturnInventory(order);
    if (!invoice) throw new NotFoundError(`销售退货关联销售单不存在: ${order.relatedDocNo}`);
    const returnedLine = findSalesReturnLine(invoice, order, returnedCard);
    const returnedItem = returnedLine?.item;
    const refundAmount = Number(order.amount || returnedItem?.sellPrice || 0);
    if (!returnedLine || !returnedItem) throw new ConflictError("销售退货必须关联销售单中的商品");

    const remainingItems = invoice.items.filter((_, index) => index !== returnedLine.index);
    const totalCount = remainingItems.length;
    const totalCost = remainingItems.reduce((sum, item) => sum + item.costPrice, 0);
    const totalAmount = remainingItems.reduce((sum, item) => sum + item.sellPrice, 0);
    const totalProfit = remainingItems.reduce((sum, item) => sum + item.profit, 0);
    const paidAmount = Math.min(invoice.paidAmount, totalAmount);
    const unpaidAmount = Math.max(0, totalAmount - paidAmount);
    const cashRefundAmount = Math.max(0, invoice.paidAmount - paidAmount);
    let paymentRecordId: string | undefined;
    let refundPaymentRecordIds: string[] | undefined;
    if (cashRefundAmount > 0) {
      const allocations = order.refundAllocations || [];
      const allocationTotal = allocations.reduce((sum, item) => sum + Number(item.amount || 0), 0);
      if (Math.abs(allocationTotal - cashRefundAmount) > 0.009) throw new ConflictError("销售退货退款分摊与应退现金不一致");
      refundPaymentRecordIds = allocations.map((allocation) => createPaymentOut({
        customerName: invoice.customerName,
        accountId: allocation.accountId,
        amount: allocation.amount,
        handler: order.handler,
        paymentMethod: allocation.paymentMethod || "退款",
        businessType: "客户退款",
        relatedDocType: "退货单",
        relatedDocNo: order.returnNo,
        time: nowStamp(),
        remarks: order.remarks || order.reason,
      }, { skipInvoiceUpdate: true }).id);
      paymentRecordId = refundPaymentRecordIds[0];
    }

    state.salesInvoices = state.salesInvoices.map((item) => item.id === invoice.id
      ? {
          ...item,
          items: remainingItems,
          totalCount,
          totalCost,
          totalAmount,
          totalProfit,
          paidAmount,
          unpaidAmount,
          isPaid: unpaidAmount === 0,
          paymentStatus: totalAmount === 0 ? "已退款" : unpaidAmount === 0 ? "已收款" : paidAmount > 0 ? "部分收款" : "未收款",
          remarks: `${item.remarks || ""}${item.remarks ? "；" : ""}销售退货已冲减：${order.returnNo}`,
        }
      : item);

    const returnedSellPrice = Number(returnedItem.sellPrice || refundAmount);
    const returnedProfit = Number(returnedItem.profit || returnedSellPrice - returnedItem.costPrice);
    if (invoice.customerPartnerType === "vendor" && invoice.customerId) {
      state.vendors = state.vendors.map((vendor) => vendor.id === invoice.customerId
        ? {
            ...vendor,
            totalBuyAmount: Math.max(0, vendor.totalBuyAmount - returnedSellPrice),
            totalCount: Math.max(0, vendor.totalCount - 1),
            accountPaid: Math.max(0, (vendor.accountPaid || 0) - cashRefundAmount),
            accountPayable: Math.max(0, (vendor.accountPayable || 0) - Math.max(0, invoice.unpaidAmount - unpaidAmount)),
          }
        : vendor);
	    } else {
	      const legacyCustomerNameIsUnique = hasUniqueLegacyName(state.customers, invoice.customerName);
	      state.customers = state.customers.map((customer) => {
	        const linkedById = invoice.customerId && invoice.customerPartnerType !== "vendor" && customer.id === invoice.customerId;
	        const linkedByName = legacyCustomerNameIsUnique && !invoice.customerId && customer.name === invoice.customerName;
	        if (!linkedById && !linkedByName) return customer;
        return {
          ...customer,
          totalAmount: Math.max(0, customer.totalAmount - returnedSellPrice),
          totalProfit: Math.max(0, customer.totalProfit - returnedProfit),
          buyCount: Math.max(0, customer.buyCount - 1),
          ...applyCustomerBalance(customer, { receivable: -Math.max(0, invoice.unpaidAmount - unpaidAmount) }),
        };
      });
    }

    state.inventory = state.inventory.map((card) => card.id === returnedItem.inventoryId
      ? {
          ...card,
          status: order.inventoryAction === "直接报废" ? "已报废" : "待检测",
          warehouseLocation: order.inventoryAction === "退回待检测" ? "退货待检测区" : card.warehouseLocation,
          salesPrice: undefined,
          salesInvoiceId: undefined,
          buyerName: undefined,
          salesTime: undefined,
          remarks: `${card.remarks || ""}${card.remarks ? "；" : ""}${nowStamp()} 销售退货，退货单：${order.returnNo}`,
        }
      : card);
    adjustCommissionForSalesReturn(invoice.invoiceNo, returnedItem.inventoryId, order.returnNo);
    return {
      paymentRecordId,
      refundPaymentRecordIds,
      creditAmount: undefined,
      vendorCreditAmount: undefined,
      releasedVendorCreditAmount: undefined,
      cashReleasedAmount: undefined,
      reversedPaymentSnapshot: undefined,
      affectedAccountId: undefined,
    };
  };

  const reversePurchaseReturn = (order: ReturnOrder) => {
    const invoice = state.purchaseInvoices.find((item) => item.invoiceNo === order.relatedDocNo || item.id === order.relatedDocNo);
    const returnedCard = findReturnInventory(order);
    if (!invoice) throw new NotFoundError(`进货退货关联采购单不存在: ${order.relatedDocNo}`);
    if (!returnedCard) throw new NotFoundError("进货退货必须关联库存档案");
    const returnedLine = findPurchaseReturnLine(invoice, order, returnedCard);
    if (!returnedLine) throw new ConflictError("进货退货库存与采购明细不匹配");
    const returnedItemIndex = returnedLine.index;
    const returnedItem = returnedLine.item;
    const amount = Number(order.amount || returnedItem.buyPrice || returnedCard.costPrice || 0);
    let paymentRecordId: string | undefined;
    let refundPaymentRecordIds: string[] | undefined;
    const remainingItems = invoice.items.filter((_, index) => index !== returnedItemIndex);
    const totalCount = remainingItems.length;
    const totalCost = remainingItems.reduce((sum, item) => sum + item.buyPrice, 0);
    const estTotalSell = remainingItems.reduce((sum, item) => sum + item.estSellPrice, 0);
    const estTotalProfit = estTotalSell - totalCost;
    // A purchase can now be settled by three independent sources. On a return we release
    // them in reverse settlement priority: unpaid payable -> used vendor credit -> cash.
    // This preserves both cash ledgers and the supplier's reusable credit balance exactly.
    const originalPaidAmount = Math.max(0, Number(invoice.paidAmount || 0));
    const originalVendorCredit = purchaseVendorCreditApplied(invoice);
    const originalUnpaidAmount = Math.max(0, Number(invoice.unpaidAmount || 0));
    let returnRemainder = amount;
    const payableOffset = Math.min(originalUnpaidAmount, returnRemainder);
    returnRemainder -= payableOffset;
    const releasedVendorCredit = Math.min(originalVendorCredit, returnRemainder);
    returnRemainder -= releasedVendorCredit;
    const cashRefundAmount = Math.min(originalPaidAmount, returnRemainder);
    const paidAmount = Math.max(0, originalPaidAmount - cashRefundAmount);
    const vendorCreditAppliedAmount = Math.max(0, originalVendorCredit - releasedVendorCredit);
    const unpaidAmount = Math.max(0, totalCost - paidAmount - vendorCreditAppliedAmount);
    let reversedPaymentSnapshot: PaymentOutRecord | undefined;
    let affectedAccountId: string | undefined;
    if (order.settlementMode === "直接冲销") {
      const linkedPayments = state.paymentOutRecords.filter((payment) =>
        payment.relatedDocNo === invoice.invoiceNo || payment.relatedDocNo === invoice.id,
      );
      if (totalCost > 0 || originalVendorCredit > 0) throw new ConflictError("直接冲销仅支持未使用供应商抵扣余额的整张采购单全部退货");
      if (linkedPayments.length !== 1) throw new ConflictError("直接冲销要求原采购单恰好只有一笔付款；多笔付款请在付款流水中逐笔处理");
      reversedPaymentSnapshot = { ...linkedPayments[0] };
      affectedAccountId = reversedPaymentSnapshot.accountId;
      deletePaymentOut(reversedPaymentSnapshot.id, { skipInvoiceUpdate: true });
    }
    if (order.settlementMode === "原路退款" && cashRefundAmount > 0) {
      const allocations = order.refundAllocations || [];
      const allocationTotal = allocations.reduce((sum, item) => sum + Number(item.amount || 0), 0);
      if (Math.abs(allocationTotal - cashRefundAmount) > 0.009) throw new ConflictError("进货退货退款分摊与应退现金不一致");
      refundPaymentRecordIds = allocations.map((allocation) => createPaymentIn({
        customerName: invoice.supplierName,
        supplierId: purchaseInvoiceVendorId(invoice),
        supplierName: invoice.supplierName,
        accountId: allocation.accountId,
        amount: allocation.amount,
        handler: order.handler,
        paymentMethod: allocation.paymentMethod || "退款",
        businessType: "采购退款",
        relatedDocType: "退货单",
        relatedDocNo: order.returnNo,
        time: nowStamp(),
        remarks: order.remarks || order.reason,
      }, { skipInvoiceUpdate: true }).id);
      paymentRecordId = refundPaymentRecordIds[0];
    }
    state.purchaseInvoices = state.purchaseInvoices.map((item) => item.id === invoice.id
      ? {
          ...item,
          items: remainingItems,
          totalCount,
          totalCost,
          estTotalSell,
          estTotalProfit,
          paidAmount,
          vendorCreditAppliedAmount,
          unpaidAmount,
          isPaid: unpaidAmount === 0,
          paymentStatus: totalCost === 0 ? "已退款" : unpaidAmount === 0 ? "已付款" : paidAmount > 0 || vendorCreditAppliedAmount > 0 ? "部分付款" : "未付款",
          remarks: `${item.remarks || ""}${item.remarks ? "；" : ""}进货退货已冲减：${order.returnNo}`,
        }
      : item);

    const sourceIsPersonal = ["个人回收", "客户置换"].includes(invoice.sourceType);
    if (sourceIsPersonal) {
      const linkedCustomerId = invoice.sourcePartnerId;
      const legacyCustomerNameIsUnique = hasUniqueLegacyName(state.customers, invoice.supplierName);
      state.customers = state.customers.map((customer) => {
        const linkedById = !!linkedCustomerId && customer.id === linkedCustomerId;
        const linkedByName = legacyCustomerNameIsUnique && !linkedCustomerId && customer.name === invoice.supplierName;
        if (!linkedById && !linkedByName) return customer;
        return {
          ...customer,
          totalAmount: Math.max(0, customer.totalAmount - returnedItem.buyPrice),
          recycleCount: Math.max(0, customer.recycleCount - 1),
          ...applyCustomerBalance(customer, { payable: -payableOffset }),
          lastDealTime: order.date,
        };
      });
    } else {
      const linkedVendorId = invoice.sourcePartnerType === "vendor" ? invoice.sourcePartnerId : undefined;
      const legacyVendorNameIsUnique = hasUniqueLegacyName(state.vendors, invoice.supplierName);
      state.vendors = state.vendors.map((vendor) => {
        const linkedById = linkedVendorId && vendor.id === linkedVendorId;
        const linkedByName = legacyVendorNameIsUnique && !linkedVendorId && vendor.name === invoice.supplierName;
        if (!linkedById && !linkedByName) return vendor;
        return {
          ...vendor,
          totalBuyAmount: Math.max(0, vendor.totalBuyAmount - returnedItem.buyPrice),
          totalCount: Math.max(0, vendor.totalCount - 1),
          accountPayable: Math.max(0, (vendor.accountPayable || 0) - payableOffset),
          accountPaid: Math.max(0, (vendor.accountPaid || 0) - cashRefundAmount),
          returnCreditBalance: (vendor.returnCreditBalance || 0) + releasedVendorCredit + (order.settlementMode === "抵扣账款" ? cashRefundAmount : 0),
          lastDealTime: order.date,
        };
      });
    }

    state.inventory = state.inventory.map((card) => card.id === returnedCard.id
      ? {
          ...card,
          status: order.inventoryAction === "直接报废" ? "已报废" : "已退货",
          warehouseLocation: order.inventoryAction === "退回供应商" ? "已退回供应商" : card.warehouseLocation,
          remarks: `${card.remarks || ""}${card.remarks ? "；" : ""}${nowStamp()} 进货退货，退货单：${order.returnNo}`,
        }
      : card);
    const vendorCreditAmount = order.settlementMode === "抵扣账款"
      ? releasedVendorCredit + cashRefundAmount
      : releasedVendorCredit || undefined;
    return {
      paymentRecordId,
      refundPaymentRecordIds,
      reversedPaymentSnapshot,
      affectedAccountId,
      creditAmount: order.settlementMode === "抵扣账款" ? payableOffset : undefined,
      vendorCreditAmount,
      releasedVendorCreditAmount: releasedVendorCredit || undefined,
      cashReleasedAmount: cashRefundAmount || undefined,
    };
  };

  const completeReturnOrder = (id: string) => {
    const existing = state.returnOrders.find((item) => item.id === id || item.returnNo === id);
    if (!existing) throw new NotFoundError(`退货单不存在: ${id}`);
    if (existing.status === "已完成") return existing;
    if (existing.status === "已作废") throw new ConflictError("已作废退货单不能完成");
    const result = existing.type === "销售退货" ? reverseSalesReturn(existing) : reversePurchaseReturn(existing);
    const completed: ReturnOrder = {
      ...existing,
      status: "已完成",
      completedAt: nowStamp(),
      paymentRecordId: result.paymentRecordId,
      refundPaymentRecordIds: result.refundPaymentRecordIds ?? existing.refundPaymentRecordIds,
      reversedPaymentSnapshot: result.reversedPaymentSnapshot ?? existing.reversedPaymentSnapshot,
      settlementAccountId: result.affectedAccountId ?? existing.settlementAccountId,
      creditAmount: result.creditAmount ?? existing.creditAmount,
      vendorCreditAmount: result.vendorCreditAmount ?? existing.vendorCreditAmount,
      releasedVendorCreditAmount: result.releasedVendorCreditAmount ?? existing.releasedVendorCreditAmount,
      cashReleasedAmount: result.cashReleasedAmount ?? existing.cashReleasedAmount,
    };
    state.returnOrders = state.returnOrders.map((item) => item.id === existing.id ? completed : item);
    addLog(systemActor(), "退货管理", `完成${completed.type}`, completed.returnNo, "待处理", "已完成");
    return completed;
  };

  const updateReturnOrder = (id: string, patch: Partial<Pick<ReturnOrder, "handler" | "reason" | "remarks" | "responsibility">>) => {
    const existing = state.returnOrders.find((item) => item.id === id || item.returnNo === id);
    if (!existing) throw new NotFoundError(`退货单不存在: ${id}`);
    const updated: ReturnOrder = {
      ...existing,
      handler: typeof patch.handler === "string" && patch.handler.trim() ? patch.handler.trim() : existing.handler,
      reason: typeof patch.reason === "string" && patch.reason.trim() ? patch.reason.trim() : existing.reason,
      remarks: typeof patch.remarks === "string" ? patch.remarks.trim() : existing.remarks,
      responsibility: patch.responsibility || existing.responsibility,
    };
    const linkedPaymentIns = state.paymentInRecords.filter((item) =>
      item.id === existing.paymentRecordId || item.relatedDocNo === existing.returnNo,
    );
    const linkedPaymentOuts = state.paymentOutRecords.filter((item) =>
      item.id === existing.paymentRecordId || item.relatedDocNo === existing.returnNo,
    );
    const settlementLedgerIds = new Set([
      ...linkedPaymentIns.map(findPaymentInSettlementLedgerId),
      ...linkedPaymentOuts.map(findPaymentOutSettlementLedgerId),
    ].filter((ledgerId): ledgerId is string => Boolean(ledgerId)));
    const financeLedgerIds = new Set([
      ...linkedPaymentIns.map(findPaymentInFinanceLedgerId),
      ...linkedPaymentOuts.map(findPaymentOutFinanceLedgerId),
    ].filter((ledgerId): ledgerId is string => Boolean(ledgerId)));
    const paymentRemarks = updated.remarks || updated.reason;

    state.returnOrders = state.returnOrders.map((item) => item.id === existing.id ? updated : item);
    state.paymentInRecords = state.paymentInRecords.map((item) =>
      linkedPaymentIns.some((payment) => payment.id === item.id)
        ? { ...item, handler: updated.handler, remarks: paymentRemarks }
        : item,
    );
    state.paymentOutRecords = state.paymentOutRecords.map((item) =>
      linkedPaymentOuts.some((payment) => payment.id === item.id)
        ? { ...item, handler: updated.handler, remarks: paymentRemarks }
        : item,
    );
    state.settlementLedger = state.settlementLedger.map((item) =>
      settlementLedgerIds.has(item.id)
        ? { ...item, handler: updated.handler, remarks: paymentRemarks }
        : item,
    );
    state.financeLedger = state.financeLedger.map((item) =>
      financeLedgerIds.has(item.id)
        ? { ...item, handler: updated.handler, operator: updated.handler }
        : item,
    );
    addLog(systemActor(), "退货管理", "编辑退货单", updated.returnNo);
    return updated;
  };

  const restoreDeletedSalesReturn = (order: ReturnOrder) => {
    const invoice = state.salesInvoices.find((item) => item.invoiceNo === order.relatedDocNo || item.id === order.relatedDocNo);
    const returnedCard = findReturnInventory(order);
    if (!invoice) throw new NotFoundError(`销售退货关联销售单不存在: ${order.relatedDocNo}`);
    if (!returnedCard) throw new NotFoundError("销售退货库存档案不存在，不能删除已完成退货单");

    const payments = returnRefundPayments(order) as PaymentOutRecord[];
    const cashRefundAmount = payments.reduce((sum, payment) => sum + Number(payment.amount || 0), 0);
    payments.forEach((payment) => deletePaymentOut(payment.id, { skipInvoiceUpdate: true }));

    const restoredSellPrice = Number(order.sourceSalesItemSnapshot?.sellPrice || order.amount || returnedCard.salesPrice || 0);
    const restoredCost = Number(order.sourceSalesItemSnapshot?.costPrice || returnedCard.costPrice || 0);
    const restoredProfit = order.sourceSalesItemSnapshot?.profit !== undefined
      ? Number(order.sourceSalesItemSnapshot.profit)
      : restoredSellPrice - restoredCost;
    const restoredSourceItem: SalesItem = order.sourceSalesItemSnapshot
      ? { ...order.sourceSalesItemSnapshot }
      : {
          inventoryId: returnedCard.id,
          productId: returnedCard.productId,
          productName: returnedCard.productName,
          sn: returnedCard.sn,
          condition: returnedCard.condition,
          quantity: 1,
          costPrice: restoredCost,
          sellPrice: restoredSellPrice,
          profit: restoredProfit,
          aftersalesTerms: invoice.aftersalesTerms || "",
          remarks: order.remarks,
        };
    const alreadyExists = invoice.items.some((item, index) =>
      makeSalesReturnLineId(item, index) === order.sourceSalesItemId ||
      (!!restoredSourceItem.inventoryId && item.inventoryId === restoredSourceItem.inventoryId) ||
      (!!restoredSourceItem.sn && item.sn === restoredSourceItem.sn),
    );
    const restoredItems = alreadyExists
      ? invoice.items
      : insertAtOriginalIndex(invoice.items, restoredSourceItem, order.sourceSalesItemIndex);
    const totalCount = restoredItems.length;
    const totalCost = restoredItems.reduce((sum, item) => sum + Number(item.costPrice || 0), 0);
    const totalAmount = restoredItems.reduce((sum, item) => sum + Number(item.sellPrice || 0), 0);
    const totalProfit = restoredItems.reduce((sum, item) => sum + Number(item.profit || 0), 0);
    const paidAmount = Math.min(totalAmount, Number(invoice.paidAmount || 0) + cashRefundAmount);
    const unpaidAmount = Math.max(0, totalAmount - paidAmount);
    const restoredDebt = Math.max(0, unpaidAmount - Number(invoice.unpaidAmount || 0));

    state.salesInvoices = state.salesInvoices.map((item) => item.id === invoice.id
      ? {
          ...item,
          items: restoredItems,
          totalCount,
          totalCost,
          totalAmount,
          totalProfit,
          paidAmount,
          unpaidAmount,
          isPaid: unpaidAmount === 0,
          paymentStatus: unpaidAmount === 0 ? "已收款" : paidAmount > 0 ? "部分收款" : "未收款",
          remarks: removeReturnRemark(item.remarks, order.returnNo),
        }
      : item);

    if (invoice.customerPartnerType === "vendor" && invoice.customerId) {
      state.vendors = state.vendors.map((vendor) => vendor.id === invoice.customerId
        ? {
            ...vendor,
            totalBuyAmount: vendor.totalBuyAmount + restoredSellPrice,
            totalCount: vendor.totalCount + 1,
            accountPaid: (vendor.accountPaid || 0) + cashRefundAmount,
            accountPayable: (vendor.accountPayable || 0) + restoredDebt,
            lastDealTime: invoice.date,
          }
        : vendor);
    } else {
      const legacyCustomerNameIsUnique = hasUniqueLegacyName(state.customers, invoice.customerName);
      state.customers = state.customers.map((customer) => {
        const linkedById = invoice.customerId && invoice.customerPartnerType !== "vendor" && customer.id === invoice.customerId;
        const linkedByName = legacyCustomerNameIsUnique && !invoice.customerId && customer.name === invoice.customerName;
        if (!linkedById && !linkedByName) return customer;
        return {
          ...customer,
          totalAmount: customer.totalAmount + restoredSellPrice,
          totalProfit: customer.totalProfit + restoredProfit,
          buyCount: customer.buyCount + 1,
          ...applyCustomerBalance(customer, { receivable: restoredDebt }),
          lastDealTime: invoice.date,
        };
      });
    }

    state.inventory = state.inventory.map((card) => card.id === returnedCard.id
      ? {
          ...card,
          status: "已售出",
          warehouseLocation: card.warehouseLocation === "退货待检测区" ? "发货区" : card.warehouseLocation,
          salesPrice: restoredSellPrice,
          salesInvoiceId: invoice.invoiceNo,
          buyerName: invoice.customerName,
          salesTime: invoice.outboundTime || invoice.date || order.date,
          remarks: removeReturnRemark(card.remarks, order.returnNo),
        }
      : card);
  };

  const restoreDeletedPurchaseReturn = (order: ReturnOrder) => {
    const invoice = state.purchaseInvoices.find((item) => item.invoiceNo === order.relatedDocNo || item.id === order.relatedDocNo);
    const returnedCard = findReturnInventory(order);
    if (!invoice) throw new NotFoundError(`进货退货关联采购单不存在: ${order.relatedDocNo}`);
    if (!returnedCard) throw new NotFoundError("进货退货库存档案不存在，不能删除已完成退货单");

    const payments = returnRefundPayments(order) as PaymentInRecord[];
    const refundedCash = payments.reduce((sum, payment) => sum + Number(payment.amount || 0), 0);
    const cashRefundAmount = Number(order.cashReleasedAmount ?? refundedCash ?? (order.settlementMode === "直接冲销" ? order.reversedPaymentSnapshot?.amount : 0) ?? 0);
    payments.forEach((payment) => deletePaymentIn(payment.id, { skipInvoiceUpdate: true }));
    if (order.settlementMode === "直接冲销" && order.reversedPaymentSnapshot) {
      const snapshot = order.reversedPaymentSnapshot;
      createPaymentOut({
        supplierId: snapshot.supplierId,
        supplierName: snapshot.supplierName,
        customerId: snapshot.customerId,
        customerName: snapshot.customerName,
        accountId: snapshot.accountId,
        amount: snapshot.amount,
        handler: snapshot.handler,
        paymentMethod: snapshot.paymentMethod,
        businessType: snapshot.businessType,
        relatedDocType: snapshot.relatedDocType,
        relatedDocNo: snapshot.relatedDocNo,
        time: snapshot.time,
        remarks: snapshot.remarks,
      }, { skipInvoiceUpdate: true });
    }

    const amount = Number(order.sourcePurchaseItemSnapshot?.buyPrice || order.amount || returnedCard.costPrice || 0);
    const restoredSourceItem: PurchaseItem = order.sourcePurchaseItemSnapshot
      ? { ...order.sourcePurchaseItemSnapshot }
      : {
          tempId: returnedCard.id,
          productId: returnedCard.productId,
          productName: returnedCard.productName,
          category: returnedCard.category,
          model: returnedCard.model,
          brand: returnedCard.brand,
          version: returnedCard.version,
          vram: returnedCard.vram,
          sn: returnedCard.sn,
          condition: returnedCard.condition,
          inWarranty: returnedCard.inWarranty,
          warrantyDate: returnedCard.warrantyDate,
          repaired: returnedCard.repaired,
          gpuRisk: returnedCard.gpuRisk,
          fullBox: returnedCard.fullBox,
          quantity: 1,
          buyPrice: amount,
          estSellPrice: Number(returnedCard.estSellPrice || 0),
          warehouseLocation: returnedCard.warehouseLocation === "已退回供应商" ? "待检测区" : returnedCard.warehouseLocation,
          remarks: order.remarks,
        };
    const alreadyExists = invoice.items.some((item, index) =>
      makePurchaseReturnLineId(item, index) === order.sourcePurchaseItemId ||
      (!!restoredSourceItem.tempId && item.tempId === restoredSourceItem.tempId) ||
      (!!restoredSourceItem.sn && item.sn === restoredSourceItem.sn),
    );
    const restoredItems = alreadyExists
      ? invoice.items
      : insertAtOriginalIndex(invoice.items, restoredSourceItem, order.sourcePurchaseItemIndex);
    const totalCount = restoredItems.length;
    const totalCost = restoredItems.reduce((sum, item) => sum + Number(item.buyPrice || 0), 0);
    const estTotalSell = restoredItems.reduce((sum, item) => sum + Number(item.estSellPrice || 0), 0);
    const estTotalProfit = estTotalSell - totalCost;
    const releasedVendorCredit = Math.max(0, Number(order.releasedVendorCreditAmount || 0));
    const vendorCreditAppliedAmount = Math.max(0, purchaseVendorCreditApplied(invoice) + releasedVendorCredit);
    const paidAmount = Math.min(totalCost - vendorCreditAppliedAmount, Number(invoice.paidAmount || 0) + cashRefundAmount);
    const unpaidAmount = Math.max(0, totalCost - paidAmount - vendorCreditAppliedAmount);
    const restoredPayable = Math.max(0, unpaidAmount - Number(invoice.unpaidAmount || 0));
    const creditAdded = Number(order.vendorCreditAmount ?? (
      order.settlementMode === "抵扣账款" ? Math.max(0, amount - Number(order.creditAmount || 0)) : 0
    ));

    state.purchaseInvoices = state.purchaseInvoices.map((item) => item.id === invoice.id
      ? {
          ...item,
          items: restoredItems,
          totalCount,
          totalCost,
          estTotalSell,
          estTotalProfit,
          paidAmount,
          vendorCreditAppliedAmount,
          unpaidAmount,
          isPaid: unpaidAmount === 0,
          paymentStatus: unpaidAmount === 0 ? "已付款" : paidAmount > 0 || vendorCreditAppliedAmount > 0 ? "部分付款" : "未付款",
          remarks: removeReturnRemark(item.remarks, order.returnNo),
        }
      : item);

    const sourceIsPersonal = ["个人回收", "客户置换"].includes(invoice.sourceType);
    if (sourceIsPersonal) {
      const linkedCustomerId = invoice.sourcePartnerId;
      const legacyCustomerNameIsUnique = hasUniqueLegacyName(state.customers, invoice.supplierName);
      state.customers = state.customers.map((customer) => {
        const linkedById = !!linkedCustomerId && customer.id === linkedCustomerId;
        const linkedByName = legacyCustomerNameIsUnique && !linkedCustomerId && customer.name === invoice.supplierName;
        if (!linkedById && !linkedByName) return customer;
        return {
          ...customer,
          totalAmount: customer.totalAmount + amount,
          recycleCount: customer.recycleCount + 1,
          ...applyCustomerBalance(customer, { payable: restoredPayable }),
          lastDealTime: invoice.date,
        };
      });
    } else {
      const linkedVendorId = invoice.sourcePartnerType === "vendor" ? invoice.sourcePartnerId : undefined;
      const legacyVendorNameIsUnique = hasUniqueLegacyName(state.vendors, invoice.supplierName);
      state.vendors = state.vendors.map((vendor) => {
        const linkedById = linkedVendorId && vendor.id === linkedVendorId;
        const linkedByName = legacyVendorNameIsUnique && !linkedVendorId && vendor.name === invoice.supplierName;
        if (!linkedById && !linkedByName) return vendor;
        return {
          ...vendor,
          totalBuyAmount: vendor.totalBuyAmount + amount,
          totalCount: vendor.totalCount + 1,
          accountPayable: (vendor.accountPayable || 0) + restoredPayable,
          accountPaid: (vendor.accountPaid || 0) + cashRefundAmount,
          returnCreditBalance: Math.max(0, (vendor.returnCreditBalance || 0) - creditAdded),
          lastDealTime: invoice.date,
        };
      });
    }

    state.inventory = state.inventory.map((card) => card.id === returnedCard.id
      ? {
          ...card,
          status: "已入库",
          warehouseLocation: card.warehouseLocation === "已退回供应商" ? "待检测区" : card.warehouseLocation,
          remarks: removeReturnRemark(card.remarks, order.returnNo),
        }
      : card);
  };

  const deleteReturnOrder = (id: string) => {
    const existing = state.returnOrders.find((item) => item.id === id || item.returnNo === id);
    if (!existing) throw new NotFoundError(`退货单不存在: ${id}`);
    if (existing.status === "已完成" && existing.type === "进货退货" && existing.settlementMode === "直接冲销" && !existing.reversedPaymentSnapshot) {
      throw new ConflictError("该历史直接冲销记录缺少原付款快照，不能自动还原；请先在付款流水中人工核对后处理");
    }
    if (existing.status === "已完成") {
      if (existing.type === "销售退货") {
        restoreDeletedSalesReturn(existing);
      } else {
        restoreDeletedPurchaseReturn(existing);
      }
    }
    state.returnOrders = state.returnOrders.filter((item) => item.id !== existing.id);
    addLog(systemActor(), "退货管理", existing.status === "已完成" ? "删除并冲销退货单" : "删除退货单", existing.returnNo);
    return existing;
  };

  const createAccountTransfer = (transfer: Omit<AccountTransferRecord, "id" | "fromAccountName" | "toAccountName">) => {
    const amount = positiveAmount(transfer.amount, "调拨金额");
    const fee = nonNegativeAmount(transfer.fee, "手续费");
    const receivedAmount = nonNegativeAmount(transfer.receivedAmount, "实际到账金额");
    if (fee > amount) throw new ValidationError("手续费不能大于调拨金额");
    if (Math.abs(receivedAmount - (amount - fee)) > 0.009) throw new ValidationError("实际到账金额必须等于调拨金额减手续费");
    const from = findSettlementAccount(transfer.fromAccountId);
    const to = findSettlementAccount(transfer.toAccountId);
    if (from.id === to.id) throw new ValidationError("转出账户和转入账户不能相同");
    const record: AccountTransferRecord = {
      ...transfer,
      amount,
      fee,
      receivedAmount,
      id: genId("DB"),
      fromAccountName: from.name,
      toAccountName: to.name,
      time: transfer.time || nowStamp(),
    };
    state.accountTransfers = [record, ...state.accountTransfers];
    recordSettlementMovement({
      accountId: from.id,
      direction: "转出",
      // The transfer amount is the total cash leaving the source account; the fee is the
      // difference between that amount and what reaches the destination account.
      amount,
      businessType: "账户调拨",
      relatedDocType: "资金调拨",
      relatedDocNo: record.id,
      handler: transfer.handler,
      time: record.time,
      remarks: transfer.remarks,
    });
    recordSettlementMovement({
      accountId: to.id,
      direction: "转入",
      amount: receivedAmount,
      businessType: "账户调拨",
      relatedDocType: "资金调拨",
      relatedDocNo: record.id,
      handler: transfer.handler,
      time: record.time,
      remarks: transfer.remarks,
    });
    createFinanceLedgerForSettlement({
      relatedId: record.id,
      type: "账户调拨",
      paymentWay: `${from.name} -> ${to.name}`,
      amount: -fee,
      operator: transfer.handler,
      settlementAccountId: from.id,
      settlementAccountName: from.name,
      relatedDocType: "资金调拨",
      time: record.time,
    });
    addLog(systemActor(), "结算账户", "资金调拨", record.id, undefined, `${from.name} -> ${to.name}, ${amount}元`);
    return record;
  };

  const updateAccountTransfer = (id: string, transfer: Partial<AccountTransferRecord>) => {
    const existing = state.accountTransfers.find((item) => item.id === id);
    if (!existing) throw new NotFoundError(`资金调拨单不存在: ${id}`);
    const from = findSettlementAccount(transfer.fromAccountId || existing.fromAccountId);
    const to = findSettlementAccount(transfer.toAccountId || existing.toAccountId);
    if (from.id === to.id) throw new ValidationError("转出账户和转入账户不能相同");
    const amount = positiveAmount(transfer.amount ?? existing.amount, "调拨金额");
    const fee = nonNegativeAmount(transfer.fee ?? existing.fee, "手续费");
    const receivedAmount = nonNegativeAmount(transfer.receivedAmount ?? amount - fee, "实际到账金额");
    if (fee > amount) throw new ValidationError("手续费不能大于调拨金额");
    if (Math.abs(receivedAmount - (amount - fee)) > 0.009) throw new ValidationError("实际到账金额必须等于调拨金额减手续费");
    const updated: AccountTransferRecord = {
      ...existing,
      ...transfer,
      id,
      fromAccountId: from.id,
      fromAccountName: from.name,
      toAccountId: to.id,
      toAccountName: to.name,
      amount,
      fee,
      receivedAmount,
      time: transfer.time || existing.time,
    };
    state.settlementAccounts = state.settlementAccounts.map((account) => {
      if (account.id === existing.fromAccountId) {
        const balance = account.balance + existing.amount;
        return { ...account, balance, availableBalance: balance - account.frozenAmount, lastChangeTime: nowStamp() };
      }
      if (account.id === existing.toAccountId) {
        const balance = account.balance - existing.receivedAmount;
        return { ...account, balance, availableBalance: balance - account.frozenAmount, lastChangeTime: nowStamp() };
      }
      return account;
    });
    state.settlementAccounts = state.settlementAccounts.map((account) => {
      if (account.id === updated.fromAccountId) {
        const balance = account.balance - updated.amount;
        return { ...account, balance, availableBalance: balance - account.frozenAmount, lastChangeTime: updated.time };
      }
      if (account.id === updated.toAccountId) {
        const balance = account.balance + updated.receivedAmount;
        return { ...account, balance, availableBalance: balance - account.frozenAmount, lastChangeTime: updated.time };
      }
      return account;
    });
    state.accountTransfers = state.accountTransfers.map((item) => (item.id === id ? updated : item));
    state.settlementLedger = state.settlementLedger.map((item) => {
      if (item.relatedDocNo !== id) return item;
      if (item.direction === "转出") {
        return { ...item, accountId: from.id, accountName: from.name, accountType: from.type, expenseAmount: updated.amount, changeAmount: -updated.amount, handler: updated.handler, time: updated.time, remarks: updated.remarks };
      }
      if (item.direction === "转入") {
        return { ...item, accountId: to.id, accountName: to.name, accountType: to.type, incomeAmount: updated.receivedAmount, changeAmount: updated.receivedAmount, handler: updated.handler, time: updated.time, remarks: updated.remarks };
      }
      return item;
    });
    state.financeLedger = state.financeLedger.map((item) => item.relatedId === id ? { ...item, paymentWay: `${from.name} -> ${to.name}`, amount: -updated.fee, operator: updated.handler, handler: updated.handler, settlementAccountId: from.id, settlementAccountName: from.name, time: updated.time } : item);
    rebuildSettlementLedgerBalances([existing.fromAccountId, existing.toAccountId, updated.fromAccountId, updated.toAccountId]);
    addLog(systemActor(), "结算账户", "编辑资金调拨", id, `${existing.amount}元`, `${updated.amount}元`);
    return updated;
  };

  const deleteAccountTransfer = (id: string) => {
    const existing = state.accountTransfers.find((item) => item.id === id);
    if (!existing) throw new NotFoundError(`资金调拨单不存在: ${id}`);
    adjustSettlementBalance(existing.fromAccountId, existing.amount);
    adjustSettlementBalance(existing.toAccountId, -existing.receivedAmount);
    state.accountTransfers = state.accountTransfers.filter((item) => item.id !== id);
    state.settlementLedger = state.settlementLedger.filter((item) => item.relatedDocNo !== id);
    state.financeLedger = state.financeLedger.filter((item) => item.relatedId !== id);
    rebuildSettlementLedgerBalances([existing.fromAccountId, existing.toAccountId]);
    addLog(systemActor(), "结算账户", "删除资金调拨", id, `${existing.amount}元`, "已反向修正账户余额和流水");
    return existing;
  };

  const applyProductTemplateUpdates = (updatedProducts: ProductTemplate[]) => {
    if (!updatedProducts.length) return;
    const updatedById = new Map(updatedProducts.map((product) => [product.id, product]));
    state.products = dedupeProductsById(state.products.map((product) => updatedById.get(product.id) || product));
    state.inventory = state.inventory.map((card) => {
      const updated = updatedById.get(card.productId);
      if (!updated || PRODUCT_STOCK_EXCLUDED_STATUSES.has(card.status)) return card;
      return {
        ...card,
        productName: updated.name,
        category: updated.category || "显卡",
        model: updated.model,
        brand: updated.brand,
        version: updated.version,
        vram: updated.vram,
      };
    });
    state.marketQuotes = state.marketQuotes.map((quote) => {
      const updated = quote.productId ? updatedById.get(quote.productId) : undefined;
      if (!updated) return quote;
      return {
        ...quote,
        productName: updated.name,
        model: updated.model,
        brand: updated.brand,
        version: updated.version,
      };
    });
  };

  const applyProductTemplateUpdate = (updated: ProductTemplate) => {
    applyProductTemplateUpdates([updated]);
  };

  const addProductTemplate = (product: Omit<ProductTemplate, "id" | "currentStock"> & { id?: string; currentStock?: number }) => {
    const requestedId = product.id?.trim();
    const existing = requestedId ? state.products.find((item) => item.id === requestedId) : undefined;
    const newProduct: ProductTemplate = {
      ...product,
      id: requestedId || nextProductTemplateId(state.products),
      currentStock: existing?.currentStock ?? product.currentStock ?? 0,
    };
    if (existing) {
      applyProductTemplateUpdate(newProduct);
      addLog(systemActor(), "商品库", "导入覆盖商品模板", newProduct.name, existing.name, `配件ID: ${newProduct.id}`);
      return newProduct;
    }
    state.products = [newProduct, ...state.products];
    addLog(systemActor(), "商品库", "添加商品模板", newProduct.name, undefined, `名: ${newProduct.name}, 型号: ${newProduct.model}`);
    return newProduct;
  };

  const addProductTemplates = (products: Array<Omit<ProductTemplate, "id" | "currentStock"> & { id?: string; currentStock?: number }>) => {
    if (!Array.isArray(products) || products.length === 0) throw new ValidationError("导入商品不能为空");
    const originalIds = new Set(state.products.map((product) => product.id));
    const existingById = new Map(state.products.map((product) => [product.id, product]));
    const usedIds = new Set(originalIds);
    let nextNumericId = state.products.reduce((max, product) => {
      const match = /^SP-(\d+)$/.exec(product.id);
      return match ? Math.max(max, Number(match[1])) : max;
    }, 0) + 1;
    const nextImportId = () => {
      let id = `SP-${String(nextNumericId).padStart(3, "0")}`;
      while (usedIds.has(id)) {
        nextNumericId += 1;
        id = `SP-${String(nextNumericId).padStart(3, "0")}`;
      }
      usedIds.add(id);
      nextNumericId += 1;
      return id;
    };

    const upsertById = new Map<string, ProductTemplate>();
    const results: ProductTemplate[] = [];
    for (const product of products) {
      const requestedId = product.id?.trim();
      const id = requestedId || nextImportId();
      if (requestedId) usedIds.add(requestedId);
      const existing = upsertById.get(id) || existingById.get(id);
      const nextProduct: ProductTemplate = {
        ...product,
        id,
        currentStock: existing?.currentStock ?? product.currentStock ?? 0,
      };
      upsertById.set(id, nextProduct);
      existingById.set(id, nextProduct);
      results.push(nextProduct);
    }

    const updatedProducts: ProductTemplate[] = [];
    const createdProducts: ProductTemplate[] = [];
    upsertById.forEach((product, id) => {
      if (originalIds.has(id)) {
        updatedProducts.push(product);
      } else {
        createdProducts.push(product);
      }
    });
    applyProductTemplateUpdates(updatedProducts);
    if (createdProducts.length) state.products = dedupeProductsById([...createdProducts.reverse(), ...state.products]);
    addLog(
      systemActor(),
      "商品库",
      "批量导入商品模板",
      `导入 ${products.length} 行`,
      undefined,
      `新增 ${createdProducts.length} 款，覆盖 ${updatedProducts.length} 款，实际 ${upsertById.size} 款`,
    );
    return results;
  };

  const updateProductTemplate = (updated: ProductTemplate) => {
    const existing = state.products.find((product) => product.id === updated.id);
    if (!existing) {
      throw new NotFoundError(`商品模板不存在: ${updated.id}`);
    }
    applyProductTemplateUpdate(updated);
    addLog(systemActor(), "商品库", "修改商品模板", updated.name, existing.name, "已同步未售出库存和行情名称");
    return updated;
  };

  const deleteProductTemplate = (id: string) => {
    const product = state.products.find((item) => item.id === id);
    if (!product) return null;
    const hasInventoryReference = state.inventory.some((item) => item.productId === id);
    const hasPurchaseReference = state.purchaseInvoices.some((invoice) => invoice.items.some((item) => item.productId === id));
    const hasSalesReference = state.salesInvoices.some((invoice) => invoice.items.some((item) => item.productId === id));
    if (hasInventoryReference || hasPurchaseReference || hasSalesReference) {
      throw new ConflictError("商品模板已被库存或单据引用，不能删除");
    }
    state.products = state.products.filter((item) => item.id !== id);
    addLog(systemActor(), "商品库", "删除商品模板", product.name);
    return product;
  };

  const createPurchaseInvoice = (invoice: Omit<PurchaseInvoice, "id" | "invoiceNo" | "totalCount" | "totalCost" | "estTotalSell" | "estTotalProfit">) => {
    const items = expandPurchaseItems(invoice.items);
    if (!items.length) throw new ValidationError("进货单至少需要一条商品明细");
    if (invoice.paidAmount > 0 && invoice.settlementAccountId) findSettlementAccount(invoice.settlementAccountId);
    // Reject duplicate SNs early: both against existing inventory and within this invoice batch.
    const seenSn = new Set<string>();
    for (const item of items) {
      const sn = item.sn?.trim();
      if (!sn) continue;
      const key = sn.toLowerCase();
      if (seenSn.has(key)) throw new ConflictError(`同一进货单内SN重复: ${sn}`);
      seenSn.add(key);
      assertSnUnique(sn);
    }
    const resolvedSource = resolvePurchaseSourceArchive(invoice);
    const seq = nextDailySeq(state.purchaseInvoices, "JH");
    const invoiceNo = `JH-${dateKey()}-${seq}`;
    const totalCount = items.length;
    const totalCost = items.reduce((sum, item) => sum + item.buyPrice, 0);
    const estTotalSell = items.reduce((sum, item) => sum + item.estSellPrice, 0);
    const estTotalProfit = estTotalSell - totalCost;
    const settlement = normalizePurchaseSettlement(totalCost, invoice.paidAmount, invoice.vendorCreditAppliedAmount);
    if (settlement.vendorCreditAppliedAmount > 0 && resolvedSource.sourcePartnerType !== "vendor") {
      throw new ValidationError("个人回收采购单不能使用供应商抵扣余额");
    }
    if (settlement.vendorCreditAppliedAmount > 0) {
      const vendor = state.vendors.find((item) => item.id === resolvedSource.sourcePartnerId);
      if (!vendor || Number(vendor.returnCreditBalance || 0) + 0.009 < settlement.vendorCreditAppliedAmount) {
        throw new ConflictError(`供应商抵扣余额不足：可用 ${Math.max(0, Number(vendor?.returnCreditBalance || 0))} 元，需使用 ${settlement.vendorCreditAppliedAmount} 元`);
      }
    }
    const newInvoice: PurchaseInvoice = {
      ...invoice,
      ...resolvedSource,
      id: genId("CG"),
      invoiceNo,
      items,
      totalCount,
      totalCost,
      estTotalSell,
      estTotalProfit,
      ...settlement,
      isPaid: settlement.unpaidAmount <= 0,
      paymentStatus: settlement.unpaidAmount <= 0 ? "已付款" : settlement.paidAmount > 0 || settlement.vendorCreditAppliedAmount > 0 ? "部分付款" : "未付款",
    };

    const productsById = new Map(state.products.map((product) => [product.id, product]));
    const newStockItems: CardInventory[] = items.map((item, index) => {
      const template = productsById.get(item.productId);
      const category = item.category || template?.category || "其他配件";
      const isGpu = category === "显卡";
      return {
        id: `KC-${dateKey()}-${seq}${String(index + 1).padStart(3, "0")}`,
        productId: item.productId,
        productName: item.productName,
        category,
        model: item.model,
        brand: item.brand,
        version: item.version,
        vram: item.vram,
        sn: item.sn?.trim() || "",
        expressNo: newInvoice.expressNo?.trim() || undefined,
        sourceType: newInvoice.sourceType,
        supplierName: newInvoice.supplierName,
        purchaseHandler: newInvoice.handleBy,
        purchaseInvoiceNo: invoiceNo,
        costPrice: item.buyPrice,
        estSellPrice: item.estSellPrice,
        marketPrice: template?.refSellPrice || item.estSellPrice,
        status: "待检测",
        condition: item.condition,
        inWarranty: item.inWarranty,
        warrantyDate: item.warrantyDate,
        repaired: item.repaired,
        gpuRisk: item.gpuRisk,
        fullBox: item.fullBox,
        warehouseLocation: isGpu ? "待检测区" : "配件待检测区",
        entryTime: newInvoice.date,
        storageDays: 0,
        remarks: [
          item.remarks,
          `进货单:${invoiceNo}`,
          newInvoice.expressNo ? `快递单号:${newInvoice.expressNo}` : "",
          isGpu ? "显卡待检测入库" : "其他配件待检测入库",
        ].filter(Boolean).join("；"),
      };
    });

    state.purchaseInvoices = [newInvoice, ...state.purchaseInvoices];
    state.inventory = [...newStockItems, ...state.inventory];

    applyPurchasePartnerImpact(newInvoice, 1);
    adjustPurchaseVendorCredit(newInvoice, -purchaseVendorCreditApplied(newInvoice));

    addLog(
      systemActor(),
      "采购回收",
      "录入进货单",
      invoiceNo,
      undefined,
      `金额: ${totalCost}元, 生成 ${newStockItems.filter((item) => (item.category || "显卡") === "显卡").length} 张显卡待检档案，${newStockItems.filter((item) => (item.category || "显卡") !== "显卡").length} 件配件待检档案`,
    );
    if (newInvoice.settlementAccountId && newInvoice.paidAmount > 0) {
      createPaymentOut({
        supplierId: purchaseInvoiceVendorId(newInvoice),
        supplierName: newInvoice.supplierName,
        accountId: newInvoice.settlementAccountId,
        amount: newInvoice.paidAmount,
        handler: newInvoice.paymentHandler || newInvoice.handleBy,
        paymentMethod: newInvoice.paymentMethod,
        businessType: "采购付款",
        relatedDocType: "采购单",
        relatedDocNo: invoiceNo,
        time: nowStamp(),
        remarks: newInvoice.remarks,
      }, { skipInvoiceUpdate: true });
    }
    return newInvoice;
  };

  const updatePurchaseInvoice = (id: string, updates: Partial<PurchaseInvoice>) => {
    const existing = state.purchaseInvoices.find((item) => item.id === id || item.invoiceNo === id);
    if (!existing) throw new NotFoundError(`进货单不存在: ${id}`);
    const hasCompletedReturn = state.returnOrders.some((order) =>
      order.type === "进货退货" && order.status === "已完成" && (order.relatedDocNo === existing.invoiceNo || order.relatedDocNo === existing.id),
    );
    const protectedAfterReturn = [
      "sourceType", "sourcePartnerId", "sourcePartnerType", "supplierName", "contact", "items",
      "paidAmount", "unpaidAmount", "vendorCreditAppliedAmount", "settlementAccountId", "paymentMethod", "paymentHandler",
    ] as const;
    if (hasCompletedReturn && protectedAfterReturn.some((key) =>
      key in updates && JSON.stringify(updates[key]) !== JSON.stringify(existing[key]),
    )) {
      throw new ConflictError("该采购单已有已完成退货，不能修改往来对象、商品或结算结构；请先冲销退货单后再调整");
    }
    const linkedPayments = state.paymentOutRecords.filter((payment) =>
      payment.relatedDocNo === existing.invoiceNo || payment.relatedDocNo === existing.id,
    );
    const relatedCards = state.inventory.filter((card) => isInventoryLinkedToPurchase(card, existing));
    const hasInboundOrInspection = relatedCards.some((card) => card.status !== "待检测") ||
      state.inspections.some((inspection) => relatedCards.some((card) => card.id === inspection.inventoryId));
    const isChangingItems = !!updates.items && JSON.stringify(updates.items) !== JSON.stringify(existing.items);
    if (hasInboundOrInspection && isChangingItems) {
      throw new ConflictError("该进货单已有商品检测或入库，只能修改备注、付款等非库存字段");
    }
    const items = updates.items ? expandPurchaseItems(updates.items) : existing.items;
    if (!items.length) throw new ValidationError("进货单至少需要一条商品明细");
    const totalCount = items.length;
    const totalCost = items.reduce((sum, item) => sum + item.buyPrice, 0);
    const estTotalSell = items.reduce((sum, item) => sum + item.estSellPrice, 0);
    const estTotalProfit = estTotalSell - totalCost;
    const settlement = normalizePurchaseSettlement(
      totalCost,
      updates.paidAmount ?? existing.paidAmount,
      updates.vendorCreditAppliedAmount ?? existing.vendorCreditAppliedAmount,
    );
    const paymentFieldsChanged = [
      "paidAmount", "unpaidAmount", "settlementAccountId", "paymentMethod", "paymentHandler",
      "vendorCreditAppliedAmount", "supplierName", "sourcePartnerId", "sourcePartnerType", "sourceType", "date",
    ].some((key) => key in updates);
    if (linkedPayments.length > 1 && paymentFieldsChanged) {
      throw new ConflictError("该采购单已有多笔付款，请先在付款流水中完成冲销或调整，避免覆盖历史资金明细");
    }

    const updated: PurchaseInvoice = {
      ...existing,
      ...updates,
      id: existing.id,
      invoiceNo: existing.invoiceNo,
      items,
      totalCount,
      totalCost,
      estTotalSell,
      estTotalProfit,
      ...settlement,
      isPaid: settlement.unpaidAmount <= 0,
      paymentStatus: settlement.unpaidAmount <= 0 ? "已付款" : settlement.paidAmount > 0 || settlement.vendorCreditAppliedAmount > 0 ? "部分付款" : "未付款",
    };
    if (purchaseVendorCreditApplied(updated) > 0 && !purchaseInvoiceVendorId(updated)) {
      throw new ValidationError("个人回收采购单不能使用供应商抵扣余额");
    }
    const oldCredit = purchaseVendorCreditApplied(existing);
    const newCredit = purchaseVendorCreditApplied(updated);
    const newVendorId = purchaseInvoiceVendorId(updated);
    const oldVendorId = purchaseInvoiceVendorId(existing);
    if (newCredit > 0) {
      const newVendor = state.vendors.find((item) => item.id === newVendorId);
      const available = Number(newVendor?.returnCreditBalance || 0) + (newVendorId === oldVendorId ? oldCredit : 0);
      if (!newVendor || available + 0.009 < newCredit) {
        throw new ConflictError(`供应商抵扣余额不足：可用 ${Math.max(0, available)} 元，需使用 ${newCredit} 元`);
      }
    }
    if (updated.settlementAccountId) {
      updated.settlementAccountName = findSettlementAccount(updated.settlementAccountId).name;
    }
    // Partner aggregates are denormalized summaries. Reverse the old document first, then
    // apply the updated document so edits to supplier, amount and payment status remain exact.
    applyPurchasePartnerImpact(existing, -1);
    adjustPurchaseVendorCredit(existing, oldCredit);
    state.purchaseInvoices = state.purchaseInvoices.map((item) => (item.id === existing.id ? updated : item));
    applyPurchasePartnerImpact(updated, 1);
    adjustPurchaseVendorCredit(updated, -newCredit);
    // Legacy versions created an accrual-style finance entry for unpaid invoices. The ERP now
    // records finance flow only when money actually moves, so discard that generated legacy row.
    state.financeLedger = state.financeLedger.filter((item) => !(
      (item.relatedId === existing.invoiceNo || item.relatedId === existing.id) &&
      item.type === "进货支出" &&
      !item.settlementAccountId
    ));
    if (linkedPayments.length === 1 && paymentFieldsChanged) {
      deletePaymentOut(linkedPayments[0].id, { skipInvoiceUpdate: true });
    }
    if (updated.paidAmount > 0 && updated.settlementAccountId && (!linkedPayments.length || paymentFieldsChanged)) {
      createPaymentOut({
        supplierId: purchaseInvoiceVendorId(updated),
        supplierName: updated.supplierName,
        accountId: updated.settlementAccountId!,
        amount: updated.paidAmount,
        handler: updated.paymentHandler || updated.handleBy,
        paymentMethod: updated.paymentMethod,
        businessType: "采购付款",
        relatedDocType: "采购单",
        relatedDocNo: updated.invoiceNo,
        time: linkedPayments[0]?.time || nowStamp(),
        remarks: updated.remarks,
      }, { skipInvoiceUpdate: true });
    }
    if (!hasInboundOrInspection) {
      const newStockItems: CardInventory[] = items.map((item, index) => {
        const template = state.products.find((product) => product.id === item.productId);
        const category = item.category || template?.category || "其他配件";
        const isGpu = category === "显卡";
        return {
          id: relatedCards[index]?.id || genId("KC"),
          productId: item.productId,
          productName: item.productName,
          category,
          model: item.model,
          brand: item.brand,
          version: item.version,
          vram: item.vram,
          sn: item.sn?.trim() || "",
          expressNo: updated.expressNo?.trim() || undefined,
          sourceType: updated.sourceType,
          supplierName: updated.supplierName,
          purchaseHandler: updated.handleBy,
          purchaseInvoiceNo: updated.invoiceNo,
          costPrice: item.buyPrice,
          estSellPrice: item.estSellPrice,
          marketPrice: template?.refSellPrice || item.estSellPrice,
          status: "待检测",
          condition: item.condition,
          inWarranty: item.inWarranty,
          warrantyDate: item.warrantyDate,
          repaired: item.repaired,
          gpuRisk: item.gpuRisk,
          fullBox: item.fullBox,
          warehouseLocation: isGpu ? "待检测区" : "配件待检测区",
          entryTime: updated.date,
          storageDays: 0,
          remarks: [
            item.remarks,
            `进货单:${updated.invoiceNo}`,
            updated.expressNo ? `快递单号:${updated.expressNo}` : "",
            isGpu ? "显卡待检测入库" : "其他配件待检测入库",
          ].filter(Boolean).join("；"),
        };
      });
      const relatedIds = new Set(relatedCards.map((card) => card.id));
      state.inventory = [...newStockItems, ...state.inventory.filter((card) => !relatedIds.has(card.id))];
    }
    addLog(systemActor(), "采购回收", "编辑进货单", existing.invoiceNo, `${existing.totalCost}元`, `${updated.totalCost}元`);
    return updated;
  };

  const deletePurchaseInvoice = (id: string) => {
    const existing = state.purchaseInvoices.find((item) => item.id === id || item.invoiceNo === id);
    if (!existing) throw new NotFoundError(`进货单不存在: ${id}`);
    const relatedCards = state.inventory.filter((card) => isInventoryLinkedToPurchase(card, existing));
    const hasInboundOrInspection = relatedCards.some((card) => card.status !== "待检测") ||
      state.inspections.some((inspection) => relatedCards.some((card) => card.id === inspection.inventoryId));
    if (hasInboundOrInspection) {
      throw new ConflictError("进货单已入库或已检测，不能删除");
    }

    state.paymentOutRecords
      .filter((payment) => payment.relatedDocNo === existing.invoiceNo || payment.relatedDocNo === existing.id)
      .forEach((payment) => deletePaymentOut(payment.id, { skipInvoiceUpdate: true }));

    state.inventory = state.inventory.filter((card) => !relatedCards.some((related) => related.id === card.id));
    state.purchaseInvoices = state.purchaseInvoices.filter((item) => item.id !== existing.id);
    state.financeLedger = state.financeLedger.filter((item) => item.relatedId !== existing.invoiceNo && item.relatedId !== existing.id);

    applyPurchasePartnerImpact(existing, -1);
    adjustPurchaseVendorCredit(existing, purchaseVendorCreditApplied(existing));
    addLog(systemActor(), "采购回收", "删除进货单", existing.invoiceNo, `${existing.totalCost}元`, "已删除待检测库存和相关流水");
    return existing;
  };

  const submitInspection = (report: Omit<InspectionRecord, "id" | "inspectTime">) => {
    const sn = report.sn.trim();
    if (!sn) {
      throw new ValidationError("检测入库必须录入SN");
    }
    const targetCard = state.inventory.find((card) => card.id === report.inventoryId);
    if (!targetCard) {
      throw new NotFoundError(`库存档案不存在: ${report.inventoryId}`);
    }
    const isGpuInspection = (targetCard.category || "显卡") === "显卡";
    assertSnUnique(sn, report.inventoryId);
    const newReport: InspectionRecord = { ...report, sn, id: genId("JC"), inspectTime: nowStamp() };
    state.inspections = [newReport, ...state.inspections];
    state.inventory = state.inventory.map((card) => {
      if (card.id !== report.inventoryId) return card;
      const statusMap: Record<InspectionRecord["resultStatus"], CardStatus> = {
        通过: "已入库",
        轻微问题: "已入库",
        需要维修: "维修中",
        拒收入库: "已退货",
        降价入库: "已入库",
      };
      return {
        ...card,
        sn,
        status: statusMap[report.resultStatus],
        condition: report.condition || card.condition,
        inWarranty: report.inWarranty ?? card.inWarranty,
        warrantyDate: report.inWarranty ? report.warrantyDate : undefined,
        repaired: report.repaired,
        fullBox: report.fullBox ?? card.fullBox,
        warehouseLocation: report.warehouseLocation?.trim() || card.warehouseLocation,
        costPrice: report.resultStatus === "降价入库" ? Math.round(card.costPrice * 0.9) : card.costPrice,
        remarks: `${card.remarks || ""} (${isGpuInspection ? `质检结果: ${report.resultStatus}. 烤机高热: ${report.temperature}℃.` : "其他配件简易检测完成."} ${report.remarks || ""})`,
      };
    });
    addLog(
      systemActor(),
      "测试质检",
      "提交检测单",
      `序列号: ${report.sn}`,
      "状态: 待检测",
      isGpuInspection ? `质检状态: ${report.resultStatus}` : `其他配件简易检测完成，成色: ${report.condition || targetCard.condition}`,
    );
    return newReport;
  };

  const updateInspection = (id: string, updates: Partial<InspectionRecord>) => {
    const existing = state.inspections.find((inspection) => inspection.id === id);
    if (!existing) {
      throw new NotFoundError(`入库检测单不存在: ${id}`);
    }
    const targetCard = state.inventory.find((card) => card.id === existing.inventoryId);
    if (!targetCard) {
      throw new NotFoundError(`库存档案不存在: ${existing.inventoryId}`);
    }
    const sn = String(updates.sn ?? existing.sn).trim();
    if (!sn) {
      throw new ValidationError("入库检测单必须保留SN");
    }
    assertSnUnique(sn, existing.inventoryId);

    const updated: InspectionRecord = {
      ...existing,
      ...updates,
      id: existing.id,
      inventoryId: existing.inventoryId,
      inspectTime: existing.inspectTime,
      sn,
    };
    const statusMap: Record<InspectionRecord["resultStatus"], CardStatus> = {
      通过: "已入库",
      轻微问题: "已入库",
      需要维修: "维修中",
      拒收入库: "已退货",
      降价入库: "已入库",
    };
    const isGpuInspection = (targetCard.category || "显卡") === "显卡";

    state.inspections = state.inspections.map((inspection) => (inspection.id === id ? updated : inspection));
    state.inventory = state.inventory.map((card) => {
      if (card.id !== existing.inventoryId) return card;
      return {
        ...card,
        sn,
        status: statusMap[updated.resultStatus],
        condition: updated.condition || card.condition,
        inWarranty: updated.inWarranty ?? card.inWarranty,
        warrantyDate: updated.inWarranty ? updated.warrantyDate : undefined,
        repaired: updated.repaired,
        fullBox: updated.fullBox ?? card.fullBox,
        warehouseLocation: updated.warehouseLocation?.trim() || card.warehouseLocation,
        remarks: `${card.remarks || ""} (检测单${id}已编辑: ${isGpuInspection ? updated.resultStatus : "配件简易检测"}. ${updated.remarks || ""})`,
      };
    });
    addLog(systemActor(), "测试质检", "编辑入库检测单", id, existing.sn, sn);
    return updated;
  };

  const createSalesInvoice = (invoice: Omit<SalesInvoice, "id" | "invoiceNo" | "totalCount" | "totalCost" | "totalAmount" | "totalProfit">) => {
    const rawItems = expandSalesItems(invoice.items);
    const productIdentityIndex = createProductIdentityIndex(state.products);
    const sellableInventoryStats = buildSellableInventoryStats(state.inventory, productIdentityIndex);
    const pendingNeedByProduct = buildPendingSalesNeedByProduct(state, productIdentityIndex);
    if (!rawItems.length) throw new ValidationError("销售单至少需要一条商品明细");
    if (invoice.paidAmount > 0 && invoice.settlementAccountId) findSettlementAccount(invoice.settlementAccountId);
    const seq = nextDailySeq(state.salesInvoices, "XS");
    const invoiceNo = `XS-${dateKey()}-${seq}`;
    const productNeeds = new Map<string, { name: string; count: number }>();
    for (const item of rawItems) {
      const key = productIdentityKey(item, productIdentityIndex);
      if (!key || !item.productName.trim()) {
        throw new ValidationError("销售明细必须选择商品型号");
      }
      const current = productNeeds.get(key) || { name: item.productName, count: 0 };
      current.count += 1;
      productNeeds.set(key, current);
    }
    for (const [key, need] of productNeeds) {
      const availableCount = sellableInventoryStats.get(key)?.count || 0;
      const pendingNeed = pendingNeedByProduct.get(key) || 0;
      const freeCount = Math.max(0, availableCount - pendingNeed);
      if (freeCount < need.count) {
        throw new ConflictError(`商品库存不足: ${need.name} 需要 ${need.count} 件，可出库 ${freeCount} 件`);
      }
    }

    // 开单阶段只锁定“销售型号”，不绑定具体库存卡；成本先按当前可售库存均价预估，
    // 出库扫码绑定 SN 后会用真实单卡成本重算。
    const items = rawItems.map((item) => {
      const itemProductKey = productIdentityKey(item, productIdentityIndex);
      const inventoryStats = itemProductKey ? sellableInventoryStats.get(itemProductKey) : undefined;
      const estimatedCost = inventoryStats?.count
        ? Math.round(inventoryStats.totalCost / inventoryStats.count)
        : Number(item.costPrice || 0);
      return {
        ...item,
        inventoryId: "",
        sn: "",
        condition: item.condition || "出库核验",
        costPrice: estimatedCost,
        profit: item.sellPrice - estimatedCost,
      };
    });
    const totalCount = items.length;
    const totalCost = items.reduce((sum, item) => sum + item.costPrice, 0);
    const totalAmount = items.reduce((sum, item) => sum + item.sellPrice, 0);
    const totalProfit = totalAmount - totalCost;
    // Only create a new customer archive after all stock and payment validations pass.
    // A rejected sales order must not leave an orphan customer record behind.
    const resolvedCustomer = resolveSalesCustomerArchive(invoice);
    const newInvoice: SalesInvoice = {
      ...invoice,
      ...resolvedCustomer,
      items,
      id: genId("XS"),
      invoiceNo,
      totalCount,
      totalCost,
      totalAmount,
      totalProfit,
      paymentStatus: invoice.unpaidAmount <= 0 ? "已收款" : invoice.paidAmount > 0 ? "部分收款" : "未收款",
      outboundStatus: "待出库",
    };
    state.salesInvoices = [newInvoice, ...state.salesInvoices];

    applySalesPartnerImpact(newInvoice, 1);

    addLog(systemActor(), "销售管理", "创建销售单", invoiceNo, undefined, `数量: ${totalCount} 件, 金额: ${totalAmount}元，已进入销售出库池等待扫码绑定SN`);
    if (invoice.settlementAccountId && invoice.paidAmount > 0) {
      createPaymentIn({
        customerId: newInvoice.customerId,
        customerPartnerType: newInvoice.customerPartnerType || "customer",
        customerName: newInvoice.customerName,
        accountId: newInvoice.settlementAccountId,
        amount: newInvoice.paidAmount,
        handler: newInvoice.paymentHandler || newInvoice.handleBy,
        paymentMethod: newInvoice.paymentMethod,
        relatedDocType: "销售单",
        relatedDocNo: invoiceNo,
        time: nowStamp(),
        remarks: newInvoice.remarks,
      }, { skipInvoiceUpdate: true });
    }
    return newInvoice;
  };

  const updateSalesInvoice = (id: string, updates: Partial<SalesInvoice>) => {
    const existing = state.salesInvoices.find((item) => item.id === id || item.invoiceNo === id);
    if (!existing) throw new NotFoundError(`销售单不存在: ${id}`);
    const hasCompletedReturn = state.returnOrders.some((order) =>
      order.type === "销售退货" && order.status === "已完成" && (order.relatedDocNo === existing.invoiceNo || order.relatedDocNo === existing.id),
    );
    const protectedAfterReturn = [
      "customerId", "customerPartnerType", "customerName", "contact", "items",
      "paidAmount", "unpaidAmount", "settlementAccountId", "paymentMethod", "paymentHandler",
    ] as const;
    if (hasCompletedReturn && protectedAfterReturn.some((key) =>
      key in updates && JSON.stringify(updates[key]) !== JSON.stringify(existing[key]),
    )) {
      throw new ConflictError("该销售单已有已完成退货，不能修改往来对象、商品或结算结构；请先冲销退货单后再调整");
    }
    const productIdentityIndex = createProductIdentityIndex(state.products);
    const linkedPayments = state.paymentInRecords.filter((payment) =>
      payment.relatedDocNo === existing.invoiceNo || payment.relatedDocNo === existing.id,
    );
    const existingIds = new Set(existing.items.map((item) => item.inventoryId).filter(Boolean));
    const inventoryById = buildInventoryById(state.inventory);
    const sellableInventoryStats = buildSellableInventoryStats(
      state.inventory,
      productIdentityIndex,
      (card) => isCardSellableForSales(card) || (existingIds.has(card.id) && card.salesInvoiceId === existing.invoiceNo),
    );
    const pendingNeedByProduct = buildPendingSalesNeedByProduct(state, productIdentityIndex, existing.id);
    const nextRawItems = updates.items ? expandSalesItems(updates.items) : existing.items;
    if (!nextRawItems.length) throw new ValidationError("销售单至少需要一条商品明细");
    const nextIds = new Set(nextRawItems.map((item) => item.inventoryId).filter(Boolean));
    const existingSaleShape = existing.items.map((item) => ({
      productId: item.productId,
      productName: item.productName,
      inventoryId: item.inventoryId,
      sellPrice: item.sellPrice,
    }));
    const nextSaleShape = nextRawItems.map((item) => ({
      productId: item.productId,
      productName: item.productName,
      inventoryId: item.inventoryId,
      sellPrice: item.sellPrice,
    }));
    const isChangingSalesItems = JSON.stringify(nextSaleShape) !== JSON.stringify(existingSaleShape);
    const hasOutbound = existing.outboundStatus === "已出库" ||
      state.inventory.some((card) => existingIds.has(card.id) && card.status === "已售出" && card.salesInvoiceId === existing.invoiceNo);
    if (hasOutbound && isChangingSalesItems) {
      throw new ConflictError("销售单已出库，不能更换销售商品");
    }
    if (!hasOutbound) {
      const productNeeds = new Map<string, { name: string; count: number }>();
      for (const item of nextRawItems) {
        const key = productIdentityKey(item, productIdentityIndex);
        if (!key || !item.productName.trim()) {
          throw new ValidationError("销售明细必须选择商品型号");
        }
        const current = productNeeds.get(key) || { name: item.productName, count: 0 };
        current.count += 1;
        productNeeds.set(key, current);
      }
      for (const [key, need] of productNeeds) {
        const availableCount = sellableInventoryStats.get(key)?.count || 0;
        const pendingNeed = pendingNeedByProduct.get(key) || 0;
        const freeCount = Math.max(0, availableCount - pendingNeed);
        if (freeCount < need.count) {
          throw new ConflictError(`商品库存不足: ${need.name} 需要 ${need.count} 件，可出库 ${freeCount} 件`);
        }
      }
    }
    const items = nextRawItems.map((item) => {
      const card = item.inventoryId ? inventoryById.get(item.inventoryId) : undefined;
      const itemProductKey = productIdentityKey(item, productIdentityIndex);
      const inventoryStats = itemProductKey ? sellableInventoryStats.get(itemProductKey) : undefined;
      const costPrice = card
        ? card.costPrice
        : inventoryStats?.count
          ? Math.round(inventoryStats.totalCost / inventoryStats.count)
          : Number(item.costPrice || 0);
      return {
        ...item,
        inventoryId: item.inventoryId || "",
        sn: item.sn || "",
        condition: item.condition || "出库核验",
        costPrice,
        profit: item.sellPrice - costPrice,
      };
    });
    const totalCount = items.length;
    const totalCost = items.reduce((sum, item) => sum + item.costPrice, 0);
    const totalAmount = items.reduce((sum, item) => sum + item.sellPrice, 0);
    const totalProfit = totalAmount - totalCost;
    const paidAmount = Number(updates.paidAmount ?? existing.paidAmount);
    const unpaidAmount = Number(updates.unpaidAmount ?? Math.max(0, totalAmount - paidAmount));
    const paymentFieldsChanged = [
      "paidAmount", "unpaidAmount", "settlementAccountId", "paymentMethod", "paymentHandler",
      "customerName", "customerId", "customerPartnerType", "date",
    ].some((key) => key in updates);
    if (linkedPayments.length > 1 && paymentFieldsChanged) {
      throw new ConflictError("该销售单已有多笔收款，请先在收款流水中完成冲销或调整，避免覆盖历史资金明细");
    }

    const updated: SalesInvoice = {
      ...existing,
      ...updates,
      id: existing.id,
      invoiceNo: existing.invoiceNo,
      items,
      totalCount,
      totalCost,
      totalAmount,
      totalProfit,
      paidAmount,
      unpaidAmount,
      isPaid: unpaidAmount <= 0,
      paymentStatus: unpaidAmount <= 0 ? "已收款" : paidAmount > 0 ? "部分收款" : "未收款",
    };
    if (updated.settlementAccountId) {
      updated.settlementAccountName = findSettlementAccount(updated.settlementAccountId).name;
    }
    // Keep the customer/vendor ledger in step with editable draft sales documents.
    applySalesPartnerImpact(existing, -1);
    state.salesInvoices = state.salesInvoices.map((item) => (item.id === existing.id ? updated : item));
    applySalesPartnerImpact(updated, 1);
    state.financeLedger = state.financeLedger.filter((item) => !(
      (item.relatedId === existing.invoiceNo || item.relatedId === existing.id) &&
      item.type === "销售收入" &&
      !item.settlementAccountId
    ));
    if (linkedPayments.length === 1 && paymentFieldsChanged) {
      deletePaymentIn(linkedPayments[0].id, { skipInvoiceUpdate: true });
    }
    if (updated.paidAmount > 0 && updated.settlementAccountId && (!linkedPayments.length || paymentFieldsChanged)) {
      createPaymentIn({
        customerId: updated.customerId,
        customerPartnerType: updated.customerPartnerType || "customer",
        customerName: updated.customerName,
        accountId: updated.settlementAccountId!,
        amount: updated.paidAmount,
        handler: updated.paymentHandler || updated.handleBy,
        paymentMethod: updated.paymentMethod,
        businessType: "销售收款",
        relatedDocType: "销售单",
        relatedDocNo: updated.invoiceNo,
        time: linkedPayments[0]?.time || nowStamp(),
        remarks: updated.remarks,
      }, { skipInvoiceUpdate: true });
    }
    state.inventory = state.inventory.map((card) => {
      if (!hasOutbound && existingIds.has(card.id) && !nextIds.has(card.id) && card.salesInvoiceId === existing.invoiceNo) {
        return { ...card, status: "已入库", salesPrice: undefined, salesInvoiceId: undefined, buyerName: undefined, salesTime: undefined };
      }
      return card.salesInvoiceId === existing.invoiceNo ? { ...card, buyerName: updated.customerName, salesTime: updated.date } : card;
    });
    addLog(systemActor(), "销售管理", "编辑销售单", existing.invoiceNo, `${existing.totalAmount}元`, `${updated.totalAmount}元`);
    return updated;
  };

  const deleteSalesInvoice = (id: string) => {
    const existing = state.salesInvoices.find((item) => item.id === id || item.invoiceNo === id);
    if (!existing) throw new NotFoundError(`销售单不存在: ${id}`);
    const chosenIds = new Set(existing.items.map((item) => item.inventoryId).filter(Boolean));
    const hasOutbound = existing.outboundStatus === "已出库" ||
      state.inventory.some((card) => chosenIds.has(card.id) && card.status === "已售出" && card.salesInvoiceId === existing.invoiceNo);
    if (hasOutbound) {
      throw new ConflictError("销售单已出库，不能删除");
    }

    state.paymentInRecords
      .filter((payment) => payment.relatedDocNo === existing.invoiceNo || payment.relatedDocNo === existing.id)
      .forEach((payment) => deletePaymentIn(payment.id, { skipInvoiceUpdate: true }));

    state.inventory = state.inventory.map((card) => {
      if (!chosenIds.has(card.id) || card.salesInvoiceId !== existing.invoiceNo) return card;
      return {
        ...card,
        status: "已入库",
        salesPrice: undefined,
        salesInvoiceId: undefined,
        buyerName: undefined,
        salesTime: undefined,
      };
    });
    state.salesInvoices = state.salesInvoices.filter((item) => item.id !== existing.id);
    state.financeLedger = state.financeLedger.filter((item) => item.relatedId !== existing.invoiceNo && item.relatedId !== existing.id);
    applySalesPartnerImpact(existing, -1);
    addLog(systemActor(), "销售管理", "删除销售单", existing.invoiceNo, `${existing.totalAmount}元`, "待出库销售单已删除");
    return existing;
  };

  const confirmSalesOutbound = (
    id: string,
    input: { handler: string; codes?: string[]; manual?: boolean; remarks?: string },
  ) => {
    const invoice = state.salesInvoices.find((item) => item.id === id || item.invoiceNo === id);
    if (!invoice) throw new NotFoundError(`销售单不存在: ${id}`);
    if (invoice.outboundStatus === "已出库") return invoice;
    if (input.manual && !input.remarks?.trim()) {
      throw new ValidationError("手动确认出库必须填写原因，例如扫码设备异常、门店自提复核等");
    }
    const productIdentityIndex = createProductIdentityIndex(state.products);

    const normalizedCodes = Array.from(new Set((input.codes || []).map((code) => code.trim()).filter(Boolean)));
    const codeSet = new Set(normalizedCodes.map((code) => code.toLowerCase()));
    const inventoryIndexById = new Map(state.inventory.map((card, index) => [card.id, index]));

    const usedInventoryIds = new Set<string>();
    const selectedOutboundItems: Array<{ item: SalesInvoice["items"][number]; cardIndex: number; card: CardInventory }> = [];
    const missingItems: SalesInvoice["items"] = [];

    for (const item of invoice.items) {
      let cardIndex: number | undefined;
      let card: CardInventory | undefined;

      if (item.inventoryId) {
        cardIndex = inventoryIndexById.get(item.inventoryId);
        card = cardIndex === undefined ? undefined : state.inventory[cardIndex];
        if (card && usedInventoryIds.has(card.id)) {
          throw new ConflictError(`销售单重复绑定库存卡: ${card.id}`);
        }
        const scannedLegacyCard = [
          item.inventoryId,
          item.sn,
          card?.sn,
        ].filter(Boolean).some((code) => codeSet.has(String(code).toLowerCase()));
        if (!input.manual && !scannedLegacyCard) {
          missingItems.push(item);
          continue;
        }
      } else {
        const matched = state.inventory
          .map((candidate, index) => ({ candidate, index }))
          .find(({ candidate }) => {
            if (usedInventoryIds.has(candidate.id)) return false;
            if (!isCardSellableForSales(candidate)) return false;
            if (!salesItemMatchesCard(item, candidate, productIdentityIndex)) return false;
            if (input.manual) return true;
            return [candidate.id, candidate.sn].filter(Boolean).some((code) => codeSet.has(String(code).toLowerCase()));
          });
        cardIndex = matched?.index;
        card = matched?.candidate;
      }

      if (cardIndex === undefined || !card) {
        missingItems.push(item);
        continue;
      }
      if (!input.manual && !item.inventoryId && ![card.id, card.sn].filter(Boolean).some((code) => codeSet.has(String(code).toLowerCase()))) {
        missingItems.push(item);
        continue;
      }
      selectedOutboundItems.push({ item, cardIndex, card });
      usedInventoryIds.add(card.id);
    }

    if (missingItems.length > 0) {
      throw new ConflictError(input.manual
        ? `可出库库存不足，还有 ${missingItems.length} 件销售商品无法匹配库存`
        : `还有 ${missingItems.length} 件销售商品未扫码确认`);
    }

    const outboundTime = nowStamp();
    const outboundHandler = input.handler || getActiveRole();
    const nextInventory = state.inventory.slice();
    const outboundItems = selectedOutboundItems.map(({ item, cardIndex, card }) => {
      nextInventory[cardIndex] = {
        ...card,
        status: "已售出",
        salesPrice: item.sellPrice,
        salesTime: outboundTime.slice(0, 10),
        salesInvoiceId: invoice.invoiceNo,
        buyerName: invoice.customerName,
        remarks: `${card.remarks || ""}${card.remarks ? "；" : ""}${outboundTime} ${outboundHandler} 销售出库确认${input.manual ? "（手动确认）" : "（扫码确认）"}${input.remarks ? `：${input.remarks}` : ""}`,
      };
      return {
        ...item,
        inventoryId: card.id,
        productId: card.productId || item.productId,
        productName: card.productName || item.productName,
        sn: card.sn,
        condition: card.condition,
        costPrice: card.costPrice,
        profit: item.sellPrice - card.costPrice,
      };
    });
    state.inventory = nextInventory;
    const totalCount = outboundItems.length;
    const totalCost = outboundItems.reduce((sum, item) => sum + item.costPrice, 0);
    const totalAmount = outboundItems.reduce((sum, item) => sum + item.sellPrice, 0);
    const totalProfit = totalAmount - totalCost;

    const updated: SalesInvoice = {
      ...invoice,
      items: outboundItems,
      totalCount,
      totalCost,
      totalAmount,
      totalProfit,
      outboundStatus: "已出库",
      outboundTime,
      outboundHandler,
      outboundRemarks: input.remarks,
    };
    state.salesInvoices = state.salesInvoices.map((item) => (item.id === invoice.id ? updated : item));
    ensurePurchaseCommissionsForSale(updated, outboundTime, outboundHandler);
    addLog(outboundHandler, "销售出库", input.manual ? "手动确认出库" : "扫码确认出库", invoice.invoiceNo, "待出库", "已出库");
    return updated;
  };

  const findAftersalesInvoice = (claim: AftersalesRecord) =>
    state.salesInvoices.find((invoice) => invoice.invoiceNo === claim.salesInvoiceNo || invoice.id === claim.salesInvoiceNo);

  const findAftersalesSalesItem = (claim: AftersalesRecord, invoice?: SalesInvoice) => {
    const productIdentityIndex = createProductIdentityIndex(state.products);
    return invoice?.items.find((item) =>
      item.inventoryId === claim.inventoryNo ||
      item.sn === claim.sn ||
      sameProductIdentity(item, { name: claim.productName, productName: claim.productName }, productIdentityIndex)
    );
  };

  const findAftersalesRefundAccountId = (claim: AftersalesRecord, invoice?: SalesInvoice) => {
    if (invoice?.settlementAccountId && state.settlementAccounts.some((account) => account.id === invoice.settlementAccountId && account.enabled)) {
      return invoice.settlementAccountId;
    }
    const linkedPayment = state.paymentInRecords.find((payment) =>
      payment.relatedDocNo === claim.salesInvoiceNo ||
      (!!invoice && (payment.relatedDocNo === invoice.invoiceNo || payment.relatedDocNo === invoice.id))
    );
    if (linkedPayment && state.settlementAccounts.some((account) => account.id === linkedPayment.accountId && account.enabled)) {
      return linkedPayment.accountId;
    }
    return state.settlementAccounts.find((account) => account.enabled)?.id;
  };

  const applyAftersalesReturnSettlement = (claim: AftersalesRecord, options: { reverseSale: boolean } = { reverseSale: true }) => {
    const invoice = findAftersalesInvoice(claim);
    const returnedItem = findAftersalesSalesItem(claim, invoice);
    const effectiveCustomerId = claim.customerId || salesInvoiceCustomerId(invoice);
    const refundAmount = Number(claim.refundAmount || returnedItem?.sellPrice || 0);
    const handler = claim.handler || getActiveRole();
    let nextClaim = claim;

    if (refundAmount > 0 && !claim.refundPaymentOutId && !state.paymentOutRecords.some((payment) => payment.relatedDocNo === claim.id && payment.businessType === "客户退款")) {
      const accountId = findAftersalesRefundAccountId(claim, invoice);
      if (!accountId) throw new ValidationError("退货退款需要至少一个启用的结算账户");
      const refundPayment = createPaymentOut({
        customerId: effectiveCustomerId,
        customerName: claim.customerName,
        accountId,
        amount: refundAmount,
        handler,
        paymentMethod: invoice?.paymentMethod || findSettlementAccount(accountId).platform || "退款",
        businessType: "客户退款",
        relatedDocType: "售后单",
        relatedDocNo: claim.id,
        time: nowStamp(),
        remarks: `售后退货退款：${claim.salesInvoiceNo} / ${claim.sn}`,
      }, { skipInvoiceUpdate: true });
      nextClaim = { ...nextClaim, refundPaymentOutId: refundPayment.id };
    }

    const repairCost = Number(claim.repairCost || claim.loss || 0);
    if (repairCost > 0 && !claim.repairPaymentOutId && !state.paymentOutRecords.some((payment) => payment.relatedDocNo === claim.id && payment.businessType === "维修费")) {
      const accountId = findAftersalesRefundAccountId(claim, invoice);
      if (!accountId) throw new ValidationError("售后维修费需要至少一个启用的结算账户");
      const repairPayment = createPaymentOut({
        customerId: effectiveCustomerId,
        customerName: claim.customerName,
        accountId,
        amount: repairCost,
        handler,
        paymentMethod: findSettlementAccount(accountId).platform || "维修费",
        businessType: "维修费",
        relatedDocType: "售后单",
        relatedDocNo: claim.id,
        time: nowStamp(),
        remarks: `售后维修费：${claim.salesInvoiceNo} / ${claim.sn}`,
      }, { skipInvoiceUpdate: true });
      nextClaim = { ...nextClaim, repairPaymentOutId: repairPayment.id };
    }

    state.aftersales = state.aftersales.map((item) => (item.id === claim.id ? nextClaim : item));
    if (!options.reverseSale) return nextClaim;

    const returnedSellPrice = Number(returnedItem?.sellPrice || refundAmount || 0);
    const returnedCost = Number(returnedItem?.costPrice || 0);
    const returnedProfit = Number(returnedItem?.profit ?? (returnedSellPrice - returnedCost));
    const returnedCount = returnedItem ? 1 : 0;

    if (invoice) {
      const remainingItems = returnedItem
        ? invoice.items.filter((item) => item.inventoryId !== returnedItem.inventoryId)
        : invoice.items;
      const totalCount = remainingItems.length;
      const totalCost = remainingItems.reduce((sum, item) => sum + item.costPrice, 0);
      const totalAmount = remainingItems.reduce((sum, item) => sum + item.sellPrice, 0);
      const totalProfit = remainingItems.reduce((sum, item) => sum + item.profit, 0);
      const paidAmount = Math.max(0, invoice.paidAmount - refundAmount);
      const unpaidAmount = Math.max(0, totalAmount - paidAmount);
      state.salesInvoices = state.salesInvoices.map((item) => item.id === invoice.id
        ? {
            ...item,
            items: remainingItems,
            totalCount,
            totalCost,
            totalAmount,
            totalProfit,
            paidAmount,
            unpaidAmount,
            isPaid: unpaidAmount === 0,
            paymentStatus: totalAmount === 0 ? "已退款" : unpaidAmount === 0 ? "已收款" : paidAmount > 0 ? "部分收款" : "未收款",
            remarks: `${item.remarks || ""}${item.remarks ? "；" : ""}售后退货已冲减：${claim.id}`,
          }
        : item,
      );

      if (invoice.customerPartnerType === "vendor" && invoice.customerId) {
        state.vendors = state.vendors.map((vendor) => vendor.id === invoice.customerId
          ? {
              ...vendor,
              totalBuyAmount: Math.max(0, vendor.totalBuyAmount - returnedSellPrice),
              totalCount: Math.max(0, vendor.totalCount - returnedCount),
              accountPaid: Math.max(0, (vendor.accountPaid || 0) - refundAmount),
              accountPayable: Math.max(0, (vendor.accountPayable || 0) - Math.min(invoice.unpaidAmount, returnedSellPrice)),
            }
          : vendor,
        );
	      } else {
	        const legacyCustomerNameIsUnique = hasUniqueLegacyName(state.customers, invoice.customerName);
	        state.customers = state.customers.map((customer) => {
	          const linkedById = invoice.customerId && invoice.customerPartnerType !== "vendor" && customer.id === invoice.customerId;
	          const linkedByName = legacyCustomerNameIsUnique && !invoice.customerId && customer.name === invoice.customerName;
	          if (!linkedById && !linkedByName) return customer;
          return {
            ...customer,
            totalAmount: Math.max(0, customer.totalAmount - returnedSellPrice),
            totalProfit: Math.max(0, customer.totalProfit - returnedProfit),
            buyCount: Math.max(0, customer.buyCount - returnedCount),
            ...applyCustomerBalance(customer, { receivable: -Math.min(invoice.unpaidAmount, returnedSellPrice) }),
          };
        });
      }
    }

    const returnedCard = state.inventory.find((card) => card.sn === claim.sn || card.id === claim.inventoryNo);
    state.inventory = state.inventory.map((card) => {
      if (card.id !== returnedCard?.id) return card;
      return {
        ...card,
        status: "已入库",
        salesPrice: undefined,
        salesInvoiceId: undefined,
        buyerName: undefined,
        salesTime: undefined,
        remarks: `${card.remarks || ""}${card.remarks ? "；" : ""}${nowStamp()} 售后退货回库，售后单：${claim.id}`,
      };
    });

    return nextClaim;
  };

  const addAftersalesClaim = (claim: Omit<AftersalesRecord, "id" | "status" | "createTime">) => {
    if (claim.type === "退货") {
      throw new ValidationError("售后退货退款请在【销售退货】中办理，系统会按原收款记录分摊退款并同步冲销库存和单据");
    }
    const invoice = findSalesInvoiceByDocNo(claim.salesInvoiceNo);
    const effectiveCustomerId = claim.customerId || salesInvoiceCustomerId(invoice);
    const newClaim: AftersalesRecord = { ...claim, customerId: effectiveCustomerId, id: genId("SH"), status: "待处理", createTime: storeDate() };
    state.aftersales = [newClaim, ...state.aftersales];
    state.inventory = state.inventory.map((card) => (card.sn === claim.sn ? { ...card, status: "售后中" } : card));
    state.customers = state.customers.map((customer) =>
      matchesCustomerByIdOrLegacyName(customer, newClaim.customerId, newClaim.customerName) ? { ...customer, aftersalesCount: customer.aftersalesCount + 1, tags: Array.from(new Set([...customer.tags, "售后记录"])) } : customer,
    );
    addLog(systemActor(), "售后保障", "新建售后申诉", `SN: ${claim.sn}`, "销售已售", `分类: ${claim.type}, 问题: ${claim.desc.substring(0, 15)}...`);
    return newClaim;
  };

  const updateAftersalesStatus = (id: string, updatedFields: Partial<AftersalesRecord>) => {
    const existingClaim = state.aftersales.find((claim) => claim.id === id);
    if (!existingClaim) return null;
    if (existingClaim.type === "退货" && updatedFields.status === "已完成") {
      throw new ConflictError("历史售后退货不能直接结案，请在【销售退货】中按原单重新办理，避免绕过退款分摊和资金预览");
    }
    let affectedClaim: AftersalesRecord | undefined;
    let previousClaim: AftersalesRecord | undefined;
    state.aftersales = state.aftersales.map((claim) => {
      if (claim.id !== id) return claim;
      previousClaim = claim;
      affectedClaim = { ...claim, ...updatedFields };
      return affectedClaim;
    });
    const completingNow = affectedClaim && updatedFields.status === "已完成" && previousClaim?.status !== "已完成";
    if (affectedClaim && completingNow) {
      const completedClaim = applyAftersalesReturnSettlement(affectedClaim, { reverseSale: false });
      affectedClaim = completedClaim;
      // 维修、检测争议、补差价结案后，原卡仍属于客户，不能回到可售库存。
      state.inventory = state.inventory.map((card) => (card.sn === affectedClaim?.sn ? { ...card, status: "已售出" } : card));
    }
    if (affectedClaim && updatedFields.status === "已拒绝") {
      state.inventory = state.inventory.map((card) => (card.sn === affectedClaim?.sn ? { ...card, status: "已售出" } : card));
    }
    addLog(systemActor(), "售后保障", "更新处理状态", `售后单: ${id}`, undefined, `状态变为: ${updatedFields.status || "未更改"}`);
    return affectedClaim ?? null;
  };

  const updateMarketPrice = (quoteId: string, todayBuyPrice: number, todaySellPrice: number, remarks?: string) => {
    let updatedQuote: MarketQuote | undefined;
    state.marketQuotes = state.marketQuotes.map((quote) => {
      if (quote.id !== quoteId) return quote;
      const previousBuyPrice = quote.refBuyPrice ?? quote.todayBuyPrice ?? quote.yestBuyPrice ?? 0;
      const previousSellPrice = quote.refSellPrice ?? quote.todaySellPrice ?? quote.maxPrice ?? 0;
      const changeAmount = todayBuyPrice - previousBuyPrice;
      const time = nowStamp();
      const nextHistory = [
        ...(quote.history || []).slice(-19),
        { date: time.slice(5, 16), buyPrice: todayBuyPrice, sellPrice: todaySellPrice },
      ];
      updatedQuote = {
        ...quote,
        yestBuyPrice: previousBuyPrice,
        todayBuyPrice,
        todaySellPrice,
        refBuyPrice: todayBuyPrice,
        refSellPrice: todaySellPrice,
        maxPrice: Math.max(quote.maxPrice || previousSellPrice || todaySellPrice, todaySellPrice),
        minPrice: Math.min(quote.minPrice || previousBuyPrice || todayBuyPrice, todayBuyPrice),
        changeAmount,
        changeRatio: Number(((changeAmount / (previousBuyPrice || 1)) * 100).toFixed(2)),
        trend: changeAmount > 0 ? "up" : changeAmount < 0 ? "down" : "stable",
        fluctuation: remarks || quote.fluctuation || quote.remarks,
        remarks: remarks || quote.remarks,
        updateTime: time,
        history: nextHistory,
      };
      return updatedQuote;
    });
    if (updatedQuote) {
      state.inventory = state.inventory.map((card) => (card.productId === updatedQuote?.productId && !PRODUCT_STOCK_EXCLUDED_STATUSES.has(card.status)
        ? { ...card, marketPrice: todayBuyPrice, estSellPrice: todaySellPrice, priceUpdatedAt: nowStamp(), priceSource: "行情参考" }
        : card));
      addLog(systemActor(), "价格参考", "更新当日参考价", updatedQuote.productName, `最新回收: ${todayBuyPrice}`, `最新销售: ${todaySellPrice}`);
    }
    return updatedQuote ?? null;
  };

  const syncEstimatedSellPrice = (input: {
    productId: string;
    estSellPrice: number;
    priceSource?: string;
    remarks?: string;
  }) => {
    const productId = input.productId?.trim();
    if (!productId) throw new ValidationError("缺少商品 ID productId");
    const estSellPrice = Number(input.estSellPrice);
    if (!Number.isFinite(estSellPrice) || estSellPrice < 0) throw new ValidationError("预估出货价必须是大于等于 0 的数字");
    const product = state.products.find((item) => item.id === productId);
    if (!product) throw new NotFoundError(`商品模板不存在: ${productId}`);

    const priceSource = input.priceSource?.trim() || "外部价格API";
    const priceUpdatedAt = nowStamp();

    state.products = state.products.map((item) => item.id === productId
      ? { ...item, refSellPrice: estSellPrice, priceSource, priceUpdatedAt }
      : item
    );

    let updatedInventoryCount = 0;
    state.inventory = state.inventory.map((card) => {
      if (card.productId !== productId || PRODUCT_STOCK_EXCLUDED_STATUSES.has(card.status)) return card;
      updatedInventoryCount += 1;
      return {
        ...card,
        estSellPrice,
        priceSource,
        priceUpdatedAt,
      };
    });

    let updatedQuoteCount = 0;
    state.marketQuotes = state.marketQuotes.map((quote) => {
      if (quote.productId !== productId) return quote;
      updatedQuoteCount += 1;
      return {
        ...quote,
        todaySellPrice: estSellPrice,
        refSellPrice: estSellPrice,
        maxPrice: Math.max(quote.maxPrice || 0, estSellPrice),
        remarks: input.remarks?.trim() || quote.remarks,
        updateTime: priceUpdatedAt,
      };
    });

    addLog(
      systemActor(),
      "价格参考",
      "同步预估出货价",
      product.name,
      `${estSellPrice}元`,
      `来源: ${priceSource}，同步未售出库存 ${updatedInventoryCount} 条`,
    );

    return {
      productId,
      productName: product.name,
      estSellPrice,
      priceSource,
      priceUpdatedAt,
      updatedInventoryCount,
      updatedQuoteCount,
    };
  };

  const batchUpdateInventory = (ids: string[], updates: Pick<Partial<CardInventory>, "status" | "warehouseLocation">) => {
    const idSet = new Set(ids);
    const updatedCards: CardInventory[] = [];
    state.inventory = state.inventory.map((card) => {
      if (!idSet.has(card.id)) return card;
      const updated = {
        ...card,
        status: updates.status || card.status,
        warehouseLocation: updates.warehouseLocation?.trim() || card.warehouseLocation,
      };
      updatedCards.push(updated);
      return updated;
    });
    if (updatedCards.length) {
      addLog(
        systemActor(),
        "库存管理",
        "批量操作调配",
        `${updatedCards.length} 张显卡`,
        undefined,
        `批量调整属性状态为 [${updates.status || "不变"}]，位置: ${updates.warehouseLocation || "不变"}`,
      );
    }
    return updatedCards;
  };

  const getInventorySummary = (filters: InventoryListFilters = {}): InventorySummaryRow[] => {
    const summaryFilters: InventoryListFilters = {
      ...filters,
      activeOnly: filters.activeOnly ?? !filters.includeSold,
    };
    const rows = new Map<string, InventorySummaryRow>();
    state.inventory
      .filter((card) => matchesInventoryListFilters(card, summaryFilters))
      .forEach((card) => {
        const category = (card.category || "显卡") as ProductCategory;
        const key = [category, card.productName, card.brand, card.model, card.version, card.vram].join("::");
        const existing = rows.get(key) || {
          key,
          productName: card.productName,
          category,
          brand: card.brand,
          model: card.model,
          version: card.version,
          vram: card.vram,
          warehouseLocation: card.warehouseLocation,
          warehouseLocations: [],
          totalCount: 0,
          availableCount: 0,
          pendingCount: 0,
          lockedCount: 0,
          soldCount: 0,
          repairCount: 0,
          totalCost: 0,
          totalEstSell: 0,
          avgCost: 0,
          avgEstSell: 0,
          lastEntryTime: card.entryTime,
        };
        const location = card.warehouseLocation?.trim() || "未分配库位";
        if (!existing.warehouseLocations?.includes(location)) {
          existing.warehouseLocations = [...(existing.warehouseLocations || []), location];
        }
        existing.warehouseLocation = existing.warehouseLocations.join("、");
        existing.totalCount += 1;
        existing.availableCount += ["已入库", "已上架"].includes(card.status) ? 1 : 0;
        existing.pendingCount += ["待检测", "检测中"].includes(card.status) ? 1 : 0;
        existing.lockedCount += card.status === "已锁定" ? 1 : 0;
        existing.soldCount += card.status === "已售出" ? 1 : 0;
        existing.repairCount += ["维修中", "售后中", "退货中"].includes(card.status) ? 1 : 0;
        existing.totalCost += Number(card.costPrice || 0);
        existing.totalEstSell += Number(card.estSellPrice || card.marketPrice || 0);
        existing.lastEntryTime = [existing.lastEntryTime, card.entryTime].filter(Boolean).sort().at(-1);
        existing.avgCost = Math.round(existing.totalCost / existing.totalCount);
        existing.avgEstSell = Math.round(existing.totalEstSell / existing.totalCount);
        rows.set(key, existing);
      });
    return Array.from(rows.values()).sort((a, b) => b.totalCount - a.totalCount || a.productName.localeCompare(b.productName, "zh-Hans-CN"));
  };

  const importInventoryRows = (rows: InventoryImportRow[], handler: string = getActiveRole()) => {
    if (!Array.isArray(rows) || rows.length === 0) throw new ValidationError("导入库存不能为空");
    const today = storeDate();
    const created: CardInventory[] = [];
    const productIdentityIndex = createProductIdentityIndex(state.products);
    rows.forEach((row, rowIndex) => {
      const productName = row.productName?.trim();
      if (!productName) throw new ValidationError(`第 ${rowIndex + 1} 行商品名称不能为空`);
      const quantity = Math.max(1, Math.floor(Number(row.quantity || 1)));
      const category = (row.category || "其他配件") as ProductCategory;
      const rowIdentity = {
        name: productName,
        productName,
        brand: row.brand,
        model: row.model,
        version: row.version,
        vram: row.vram,
      };
      const template = state.products.find((product) =>
        sameProductIdentity(product, rowIdentity, productIdentityIndex) ||
        (row.model && product.model === row.model && (row.brand ? product.brand === row.brand : true))
      );
      for (let index = 0; index < quantity; index += 1) {
        const id = genId(`KC-IMPORT-${String(rowIndex + 1).padStart(3, "0")}-${String(index + 1).padStart(3, "0")}`);
        created.push({
          id,
          productId: template?.id || `IMP-${dateKey()}-${rowIndex + 1}`,
          productName,
          category,
          model: row.model?.trim() || template?.model || productName,
          brand: row.brand?.trim() || template?.brand || "未填写",
          version: row.version?.trim() || template?.version || "标准",
          vram: row.vram?.trim() || template?.vram || "-",
          sn: "",
          sourceType: row.sourceType || "门店自采",
          supplierName: row.supplierName?.trim() || "库存导入",
          costPrice: Number(row.costPrice || template?.lastBuyPrice || template?.refBuyPrice || 0),
          estSellPrice: Number(row.estSellPrice || template?.refSellPrice || 0),
          marketPrice: Number(row.marketPrice || row.estSellPrice || template?.refSellPrice || 0),
          status: row.status || "已入库",
          condition: row.condition || "90新",
          inWarranty: false,
          repaired: false,
          gpuRisk: false,
          fullBox: false,
          warehouseLocation: row.warehouseLocation?.trim() || "导入待分配",
          entryTime: today,
          storageDays: 0,
          remarks: row.remarks?.trim() || "无备注",
        });
      }
    });
    state.inventory = [...created, ...state.inventory];
    state.products = state.products.map((product) => {
      const importedCount = created.filter((item) => item.productId === product.id).length;
      return importedCount ? { ...product, lastDealTime: today } : product;
    });
    addLog(handler, "库存管理", "导入整体库存", `${created.length} 条库存档案`, undefined, "已写入单卡库存和整体库存汇总");
    return created;
  };

	  const scanInventoryFlow = (input: {
	    codes: string[];
	    mode: InventoryScanMode;
	    warehouseLocation?: string;
	    handler?: string;
	    target?: string;
	    remarks?: string;
	    trackingSnPairs?: Array<{ trackingNo?: string; sn?: string }>;
	    accessoryCodes?: string[];
	  }) => {
	    const normalizedCodes = Array.from(new Set((input.codes || []).map((code) => code.trim()).filter(Boolean)));
	    const handler = input.handler || getActiveRole();
	    const time = nowStamp();
	    const results: InventoryScanResult[] = [];
	    const updates = new Map<string, Partial<CardInventory>>();
	    const outboundInvoiceIds = new Set<string>(); // 收集出库涉及的销售单ID
	    const buildRemark = (card: CardInventory, action: string) =>
	      `${card.remarks || ""}${card.remarks ? "；" : ""}${time} ${handler} ${action}${input.remarks ? `：${input.remarks}` : ""}`;

	    if (input.mode === "入库") {
	      (input.trackingSnPairs || []).forEach((pair) => {
	        const trackingNo = pair.trackingNo?.trim();
	        const sn = pair.sn?.trim();
	        const code = trackingNo && sn ? `${trackingNo} / ${sn}` : trackingNo || sn || "";
	        if (!trackingNo || !sn) {
	          results.push({ code, matched: false, message: "快递单号和SN都必须填写" });
	          return;
	        }
	        const duplicateSn = findCardBySn(sn);
	        if (duplicateSn) {
	          results.push({
	            code,
	            inventoryId: duplicateSn.id,
	            sn: duplicateSn.sn,
	            productName: duplicateSn.productName,
	            beforeStatus: duplicateSn.status,
	            afterStatus: duplicateSn.status,
	            beforeLocation: duplicateSn.warehouseLocation,
	            afterLocation: duplicateSn.warehouseLocation,
	            matched: true,
	            message: "该SN已存在，不能重复绑定",
	          });
	          return;
	        }
	        const card = state.inventory.find((item) =>
	          item.expressNo?.toLowerCase() === trackingNo.toLowerCase() &&
	          (item.category || "显卡") === "显卡" &&
	          item.status === "待检测" &&
	          !item.sn &&
	          !updates.has(item.id)
	        );
	        if (!card) {
	          results.push({ code, matched: false, message: "未找到该快递单号下待绑定SN的显卡待检档案" });
	          return;
	        }
	        const beforeStatus = card.status;
	        const beforeLocation = card.warehouseLocation;
	        const patch: Partial<CardInventory> = {
	          sn,
	          status: "已入库",
	          warehouseLocation: input.warehouseLocation?.trim() || card.warehouseLocation || "待分配库位",
	          remarks: buildRemark(card, `按快递单号${trackingNo}绑定SN并扫码入库`),
	        };
	        updates.set(card.id, patch);
	        results.push({
	          code,
	          inventoryId: card.id,
	          sn,
	          productName: card.productName,
	          beforeStatus,
	          afterStatus: "已入库",
	          beforeLocation,
	          afterLocation: patch.warehouseLocation || beforeLocation,
	          matched: true,
	          message: "入库成功",
	        });
	      });

	      Array.from(new Set((input.accessoryCodes || []).map((code) => code.trim()).filter(Boolean))).forEach((code) => {
	        const card = state.inventory.find((item) => item.id.toLowerCase() === code.toLowerCase() || item.sn.toLowerCase() === code.toLowerCase());
	        if (!card) {
	          results.push({ code, matched: false, message: "未找到对应配件库存ID或条码" });
	          return;
	        }
	        if ((card.category || "显卡") === "显卡") {
	          results.push({
	            code,
	            inventoryId: card.id,
	            sn: card.sn,
	            productName: card.productName,
	            beforeStatus: card.status,
	            afterStatus: card.status,
	            beforeLocation: card.warehouseLocation,
	            afterLocation: card.warehouseLocation,
	            matched: true,
	            message: "该库存属于显卡，请走显卡入库或检测录入",
	          });
	          return;
	        }
	        if (card.status === "待检测" || card.status === "检测中") {
	          results.push({
	            code,
	            inventoryId: card.id,
	            sn: card.sn,
	            productName: card.productName,
	            beforeStatus: card.status,
	            afterStatus: card.status,
	            beforeLocation: card.warehouseLocation,
	            afterLocation: card.warehouseLocation,
	            matched: true,
	            message: "其他配件必须先在检测录入完成简易检测，不能扫码直接入库",
	          });
	          return;
	        }
	        const beforeStatus = card.status;
	        const beforeLocation = card.warehouseLocation;
	        const patch: Partial<CardInventory> = {
	          status: "已入库",
	          warehouseLocation: input.warehouseLocation?.trim() || card.warehouseLocation || "配件库-待上架",
	          remarks: buildRemark(card, "配件扫码确认入库"),
	        };
	        updates.set(card.id, patch);
	        results.push({
	          code,
	          inventoryId: card.id,
	          sn: card.sn,
	          productName: card.productName,
	          beforeStatus,
	          afterStatus: "已入库",
	          beforeLocation,
	          afterLocation: patch.warehouseLocation || beforeLocation,
	          matched: true,
	          message: "配件入库成功",
	        });
	      });
	    }

	    normalizedCodes.forEach((code) => {
	      const card = state.inventory.find((item) => item.id.toLowerCase() === code.toLowerCase() || item.sn.toLowerCase() === code.toLowerCase());
      if (!card) {
        results.push({ code, matched: false, message: "未找到对应库存ID或SN" });
        return;
      }

      const beforeStatus = card.status;
      const beforeLocation = card.warehouseLocation;
      let patch: Partial<CardInventory> = {};
      if (input.mode === "入库") {
        if ((card.category || "显卡") !== "显卡" && (card.status === "待检测" || card.status === "检测中")) {
          results.push({
            code,
            inventoryId: card.id,
            sn: card.sn,
            productName: card.productName,
            beforeStatus,
            afterStatus: beforeStatus,
            beforeLocation,
            afterLocation: beforeLocation,
            matched: true,
            message: "其他配件必须先在检测录入完成简易检测，不能扫码直接入库",
          });
          return;
        }
        patch = {
	          status: "已入库",
	          warehouseLocation: input.warehouseLocation?.trim() || card.warehouseLocation || "待分配库位",
	          remarks: buildRemark(card, "扫码入库"),
        };
      } else if (input.mode === "出库") {
        // 出库必须关联销售单：卡必须处于"已锁定"状态且有 salesInvoiceId
        if (card.status === "已售出" || card.status === "已报废") {
          results.push({
            code,
            inventoryId: card.id,
            sn: card.sn,
            productName: card.productName,
            beforeStatus,
            afterStatus: card.status,
            beforeLocation,
            afterLocation: card.warehouseLocation,
            matched: true,
            message: `当前状态为${card.status}，不能重复出库`,
          });
          return;
        }
        if (card.status !== "已锁定") {
          results.push({
            code,
            inventoryId: card.id,
            sn: card.sn,
            productName: card.productName,
            beforeStatus,
            afterStatus: beforeStatus,
            beforeLocation,
            afterLocation: beforeLocation,
            matched: true,
            message: `出库失败：当前状态为${card.status}，必须先创建销售单锁定后才能出库`,
          });
          return;
        }
        if (!card.salesInvoiceId) {
          results.push({
            code,
            inventoryId: card.id,
            sn: card.sn,
            productName: card.productName,
            beforeStatus,
            afterStatus: beforeStatus,
            beforeLocation,
            afterLocation: beforeLocation,
            matched: true,
            message: "出库失败：该库存卡未关联销售单，请先开销售单",
          });
          return;
        }
        // 验证关联的销售单存在且未出库
        const linkedInvoice = state.salesInvoices.find((inv) => inv.invoiceNo === card.salesInvoiceId || inv.id === card.salesInvoiceId);
        if (!linkedInvoice) {
          results.push({
            code,
            inventoryId: card.id,
            sn: card.sn,
            productName: card.productName,
            beforeStatus,
            afterStatus: beforeStatus,
            beforeLocation,
            afterLocation: beforeLocation,
            matched: true,
            message: `出库失败：关联销售单 ${card.salesInvoiceId} 不存在`,
          });
          return;
        }
        if (linkedInvoice.outboundStatus === "已出库") {
          results.push({
            code,
            inventoryId: card.id,
            sn: card.sn,
            productName: card.productName,
            beforeStatus,
            afterStatus: beforeStatus,
            beforeLocation,
            afterLocation: beforeLocation,
            matched: true,
            message: `出库失败：关联销售单 ${card.salesInvoiceId} 已完成出库`,
          });
          return;
        }
        // 收集同一销售单下所有待出库卡，用于后续判断是否完成整单出库
        outboundInvoiceIds.add(linkedInvoice.id);
        patch = {
          status: "已售出",
          warehouseLocation: input.warehouseLocation?.trim() || "已出库",
          salesTime: storeDate(),
          buyerName: card.buyerName || input.target || linkedInvoice.customerName,
          remarks: buildRemark(card, `扫码出库（销售单: ${card.salesInvoiceId}）${input.target ? `给 ${input.target}` : ""}`),
        };
      } else {
        patch = {
	          warehouseLocation: input.warehouseLocation?.trim() || card.warehouseLocation,
	          remarks: buildRemark(card, `扫码移库${input.warehouseLocation ? `至 ${input.warehouseLocation}` : ""}`),
        };
      }

      updates.set(card.id, patch);
      results.push({
        code,
        inventoryId: card.id,
        sn: card.sn,
        productName: card.productName,
        beforeStatus,
        afterStatus: patch.status || beforeStatus,
        beforeLocation,
        afterLocation: patch.warehouseLocation || beforeLocation,
        matched: true,
        message: `${input.mode}成功`,
      });
    });

    state.inventory = state.inventory.map((card) => updates.has(card.id) ? { ...card, ...updates.get(card.id) } : card);

    // 出库模式：更新销售单出库状态和产品库存
    const outboundSuccessCount = results.filter((item) => item.matched && item.message.endsWith("成功") && item.afterStatus === "已售出").length;
    if (input.mode === "出库" && outboundSuccessCount > 0) {
      // 产品库存数量由库存行派生，这里只维护最近出库时间。
      const outboundProductIds = new Set<string>();
      results.filter((item) => item.matched && item.message.endsWith("成功") && item.afterStatus === "已售出").forEach((r) => {
        const card = state.inventory.find((c) => c.id === r.inventoryId);
        if (card) outboundProductIds.add(card.productId);
      });
      state.products = state.products.map((product) => {
        const productOutboundCount = results.filter((r) => {
          if (!r.matched || !r.message.endsWith("成功") || r.afterStatus !== "已售出") return false;
          const card = state.inventory.find((c) => c.id === r.inventoryId);
          return card?.productId === product.id;
        }).length;
        if (productOutboundCount === 0) return product;
        return {
          ...product,
          lastDealTime: time.slice(0, 10),
        };
      });

      // 检查每个涉及的销售单是否所有卡都已出库，若是则标记整单已出库
      for (const invoiceId of outboundInvoiceIds) {
        const invoice = state.salesInvoices.find((inv) => inv.id === invoiceId);
        if (!invoice || invoice.outboundStatus === "已出库") continue;
        const allItemsOutbound = invoice.items.every((item) => {
          const card = state.inventory.find((c) => c.id === item.inventoryId);
          return card?.status === "已售出";
        });
        if (allItemsOutbound) {
          const updatedInvoice = { ...invoice, outboundStatus: "已出库" as const, outboundTime: time, outboundHandler: handler };
          state.salesInvoices = state.salesInvoices.map((inv) =>
            inv.id === invoiceId
              ? updatedInvoice
              : inv,
          );
          ensurePurchaseCommissionsForSale(updatedInvoice, time, handler);
        }
      }
    }

    const updatedCount = results.filter((item) => item.matched && item.message.endsWith("成功")).length;
    if (updatedCount > 0) {
      addLog(
        `${handler} (扫码)`,
        "库存管理",
        `扫码${input.mode}`,
        `${updatedCount} 张库存卡`,
        undefined,
        `库位: ${input.warehouseLocation || "未变更"}${input.target ? `, 对象: ${input.target}` : ""}`,
      );
    }
    return { results, updatedCount, missingCount: results.filter((item) => !item.matched).length };
  };

  const createMarketQuote = (quote: Partial<MarketQuote> & { model: string; refBuyPrice?: number; refSellPrice?: number; updateTime?: string }) => {
    const newQuote: MarketQuote = {
      ...quote,
      id: genId("MQ"),
      date: quote.updateTime || storeDate(),
      productId: quote.productId || genId("SP-MOCK"),
      productName: quote.productName || quote.model,
      model: quote.model,
      brand: quote.brand || "",
      version: quote.version || "",
      yestBuyPrice: quote.refBuyPrice || quote.yestBuyPrice || 0,
      todayBuyPrice: quote.refBuyPrice || quote.todayBuyPrice || 0,
      todaySellPrice: quote.refSellPrice || quote.todaySellPrice || 0,
      maxPrice: quote.refSellPrice || quote.maxPrice || 0,
      minPrice: quote.refBuyPrice || quote.minPrice || 0,
      changeAmount: 0,
      changeRatio: 0,
    };
    state.marketQuotes = [newQuote, ...state.marketQuotes];
    addLog(systemActor(), "价格参考", "创建行情参考", quote.model, undefined, `新建议进价: ${quote.refBuyPrice}元`);
    return newQuote;
  };

  const importMarketQuotes = (quotes: Array<Partial<MarketQuote> & { model: string }>) => {
    const normalizedKey = (quote: Partial<MarketQuote>) =>
      `${(quote.brand || "").trim().toLowerCase()}::${(quote.model || "").trim().toLowerCase()}`;
    const latestQuotes = new Map<string, Partial<MarketQuote> & { model: string }>();
    let skipped = 0;

    quotes.forEach((quote) => {
      const model = quote.model?.trim();
      const buyPrice = Number(quote.refBuyPrice ?? quote.todayBuyPrice);
      const sellPrice = Number(quote.refSellPrice ?? quote.todaySellPrice);
      if (!model || !Number.isFinite(buyPrice) || buyPrice < 0 || !Number.isFinite(sellPrice) || sellPrice < 0) {
        skipped += 1;
        return;
      }

      const normalizedQuote = { ...quote, model, refBuyPrice: buyPrice, refSellPrice: sellPrice };
      const key = normalizedKey(normalizedQuote);
      if (latestQuotes.has(key)) skipped += 1;
      latestQuotes.set(key, normalizedQuote);
    });

    const importedQuotes: MarketQuote[] = [];
    let created = 0;
    let updated = 0;

    latestQuotes.forEach((quote) => {
      const existing = state.marketQuotes.find((item) => normalizedKey(item) === normalizedKey(quote));
      if (!existing) {
        importedQuotes.push(createMarketQuote(quote));
        created += 1;
        return;
      }

      const next = updateMarketPrice(
        existing.id,
        Number(quote.refBuyPrice),
        Number(quote.refSellPrice),
        quote.fluctuation || quote.remarks,
      );
      if (!next) return;

      const importedAt = quote.updateTime || quote.date;
      const updatedQuote: MarketQuote = {
        ...next,
        brand: quote.brand?.trim() || next.brand,
        updateTime: importedAt || next.updateTime,
        date: importedAt || next.date,
      };
      state.marketQuotes = state.marketQuotes.map((item) => item.id === updatedQuote.id ? updatedQuote : item);
      importedQuotes.push(updatedQuote);
      updated += 1;
    });

    if (importedQuotes.length > 0) {
      addLog(systemActor(), "价格参考", "批量导入行情参考", `${importedQuotes.length} 条行情`, undefined, `新增 ${created} 条，更新 ${updated} 条，跳过 ${skipped} 条`);
    }
    return { created, updated, skipped, quotes: importedQuotes };
  };

  const deleteMarketQuote = (quoteId: string) => {
    const quote = state.marketQuotes.find((item) => item.id === quoteId);
    if (!quote) return null;
    state.marketQuotes = state.marketQuotes.filter((item) => item.id !== quoteId);
    addLog(systemActor(), "价格参考", "删除行情参考", quote.model || quote.productName || quoteId, undefined, "已删除");
    return quote;
  };

  const createCustomer = (customer: Partial<CustomerCard> & { name: string; contact?: string; firstChannel?: string; totalPurchases?: number }) => {
    assertCustomerIdentityAvailable(customer);
    const today = storeDate();
    const channel = customer.firstChannel || customer.source || "散客自荐";
    const receivableBalance = Math.max(0, Number(customer.receivableBalance ?? customer.debtBalance ?? 0));
    const payableBalance = Math.max(0, Number(customer.payableBalance ?? 0));
    const newCustomer: CustomerCard = {
      id: nextPartnerArchiveId("KH", state.customers),
      name: customer.name,
      phone: customer.contact || customer.phone || "",
      wechat: customer.wechat || "",
      qq: customer.qq || "",
      city: customer.city || "",
      company: customer.company || "",
      source: channel,
      firstChannel: channel,
      type: customer.type || "个人买家客户",
      crmStatus: customer.crmStatus || "线索",
      crmStage: customer.crmStage || "新线索",
      level: normalizeCustomerLevel(customer.level),
      isCoreCustomer: Boolean(customer.isCoreCustomer),
      levelReason: customer.levelReason,
      riskReason: customer.riskReason?.trim() || undefined,
      owner: customer.owner || getActiveRole(),
      intent: customer.intent || "中",
      budget: customer.budget || 0,
      lastFollowTime: customer.lastFollowTime,
      nextFollowTime: customer.nextFollowTime,
      nextFollowUpAt: customer.nextFollowUpAt || customer.nextFollowTime,
      nextAction: customer.nextAction,
      lastContactAt: customer.lastContactAt || customer.lastFollowTime,
      dealProbability: Number(customer.dealProbability) || 0,
      estimatedAmount: Number(customer.estimatedAmount || customer.budget) || 0,
      lostReason: customer.lostReason,
      lastDealTime: customer.lastDealTime || today,
      totalAmount: customer.totalAmount || 0,
      totalProfit: customer.totalProfit || 0,
      buyCount: customer.totalPurchases || customer.buyCount || 0,
      recycleCount: customer.recycleCount || 0,
      aftersalesCount: customer.aftersalesCount || 0,
      remarks: customer.remarks,
      tags: customer.tags || ["新建建卡"],
      contact: customer.contact || customer.phone || "",
      totalPurchases: customer.totalPurchases || customer.buyCount || 0,
      receivableBalance,
      payableBalance,
      debtBalance: receivableBalance,
    };
    if (newCustomer.level === "S级" && !newCustomer.isCoreCustomer) throw new ValidationError("S级仅用于核心客户，请先标记为核心客户");
    if (newCustomer.level === "R级" && !newCustomer.riskReason) throw new ValidationError("R级客户必须填写风险原因");
    const gradedCustomer = withCustomerGrade(newCustomer);
    state.customers = [...state.customers, gradedCustomer];
    addLog(systemActor(), "合伙/客商", "新建客户档案", customer.name);
    return gradedCustomer;
  };

  const updateCrmCustomer = (id: string, updates: Partial<CustomerCard>) => {
    const existing = state.customers.find((item) => item.id === id);
    if (!existing) throw new NotFoundError(`客户不存在: ${id}`);
    const previousContact = existing.contact || existing.phone || existing.wechat || "";
    const legacyNameIsUnique = state.customers.filter((item) => item.name.trim() === existing.name.trim()).length === 1;
    const requestedCustomerLevel = normalizeCustomerLevel(updates.level ?? existing.level);
    const requestedCoreCustomer = updates.isCoreCustomer ?? existing.isCoreCustomer ?? existing.level === "S级";
    if (requestedCustomerLevel === "S级" && !requestedCoreCustomer) throw new ValidationError("S级仅用于核心客户，请先标记为核心客户");
    const nextCustomer = withCustomerGrade({
      ...existing,
      ...updates,
      id: existing.id,
      level: requestedCustomerLevel,
      isCoreCustomer: requestedCoreCustomer,
      riskReason: updates.riskReason === undefined ? existing.riskReason : updates.riskReason.trim() || undefined,
    });
    if (nextCustomer.level === "S级" && !nextCustomer.isCoreCustomer) throw new ValidationError("S级仅用于核心客户，请先标记为核心客户");
    if (nextCustomer.level === "R级" && !nextCustomer.riskReason) throw new ValidationError("R级客户必须填写风险原因");
    assertCustomerIdentityAvailable(nextCustomer, id);
    const nextContact = nextCustomer.contact || nextCustomer.phone || nextCustomer.wechat || "";
    state.customers = state.customers.map((item) => (item.id === id ? nextCustomer : item));
    state.crmFollowUps = state.crmFollowUps.map((item) =>
      item.customerId === id ? { ...item, customerName: nextCustomer.name } : item,
    );
    state.crmRequirements = state.crmRequirements.map((item) =>
      item.customerId === id ? { ...item, customerName: nextCustomer.name } : item,
    );
    state.salesInvoices = state.salesInvoices.map((invoice) => {
      const linkedById = invoice.customerId === id && (invoice.customerPartnerType || "customer") === "customer";
      const legacyMatch = legacyNameIsUnique && !invoice.customerId && matchesPerson(existing.name, previousContact, invoice.customerName, invoice.contact);
      if (!linkedById && !legacyMatch) return invoice;
      return { ...invoice, customerId: id, customerPartnerType: "customer", customerName: nextCustomer.name, contact: nextContact };
    });
    state.purchaseInvoices = state.purchaseInvoices.map((invoice) => {
      const isPersonalSource = ["个人回收", "客户置换"].includes(invoice.sourceType);
      const linkedById = invoice.sourcePartnerId === id && (invoice.sourcePartnerType || "customer") === "customer";
      const legacyMatch = legacyNameIsUnique && !invoice.sourcePartnerId && matchesPerson(existing.name, previousContact, invoice.supplierName, invoice.contact);
      if (!isPersonalSource || (!linkedById && !legacyMatch)) return invoice;
      return { ...invoice, sourcePartnerId: id, sourcePartnerType: "customer", supplierName: nextCustomer.name, contact: nextContact };
    });
    state.inventory = state.inventory.map((card) => {
      const supplierMatch = legacyNameIsUnique && matchesPerson(existing.name, previousContact, card.supplierName, undefined);
      const buyerMatch = legacyNameIsUnique && card.buyerName === existing.name;
      if (!supplierMatch && !buyerMatch) return card;
      return {
        ...card,
        supplierName: supplierMatch ? nextCustomer.name : card.supplierName,
        buyerName: buyerMatch ? nextCustomer.name : card.buyerName,
      };
    });
    state.paymentInRecords = state.paymentInRecords.map((item) =>
      item.customerId === id || (legacyNameIsUnique && !item.customerId && item.customerName === existing.name)
        ? { ...item, customerId: id, customerName: nextCustomer.name }
        : item,
    );
    state.paymentOutRecords = state.paymentOutRecords.map((item) =>
      item.customerId === id || (legacyNameIsUnique && !item.customerId && item.customerName === existing.name)
        ? { ...item, customerId: id, customerName: nextCustomer.name }
        : item,
    );
    state.settlementLedger = state.settlementLedger.map((item) =>
      legacyNameIsUnique && item.customerName === existing.name ? { ...item, customerName: nextCustomer.name } : item,
    );
    state.financeLedger = state.financeLedger.map((item) =>
      legacyNameIsUnique && item.customerName === existing.name ? { ...item, customerName: nextCustomer.name } : item,
    );
    state.aftersales = state.aftersales.map((item) =>
      item.customerId === id || (legacyNameIsUnique && !item.customerId && item.customerName === existing.name)
        ? { ...item, customerId: id, customerName: nextCustomer.name, contact: nextContact }
        : item,
    );
    addLog(systemActor(), "CRM客户管理", "更新客户资料", existing.name);
    return state.customers.find((item) => item.id === id) ?? null;
  };

  const deleteCustomer = (id: string) => {
    const existing = state.customers.find((item) => item.id === id);
    if (!existing) throw new NotFoundError(`客户不存在: ${id}`);
    const contact = existing.contact || existing.phone || existing.wechat || "";
    const hasLinkedSales = state.salesInvoices.some((invoice) => isInvoiceLinkedToCustomer(invoice, id, existing.name, contact));
    const hasLinkedPurchase = state.purchaseInvoices.some((invoice) => isInvoiceLinkedToCustomer(invoice, id, existing.name, contact));
    const hasLinkedCrm = state.crmFollowUps.some((item) => item.customerId === id) || state.crmRequirements.some((item) => item.customerId === id);
    const hasLinkedPayment = state.paymentInRecords.some((item) => matchesCustomerByIdOrLegacyName(existing, item.customerId, item.customerName))
      || state.paymentOutRecords.some((item) => matchesCustomerByIdOrLegacyName(existing, item.customerId, item.customerName));
    const hasLinkedSettlement = state.settlementLedger.some((item) => hasUniqueLegacyName(state.customers, existing.name) && item.customerName === existing.name);
    const hasLinkedFinance = state.financeLedger.some((item) => hasUniqueLegacyName(state.customers, existing.name) && item.customerName === existing.name);
    const hasLinkedAftersales = state.aftersales.some((item) => item.customerId === id || (hasUniqueLegacyName(state.customers, existing.name) && !item.customerId && item.customerName === existing.name));
    if (hasLinkedSales || hasLinkedPurchase || hasLinkedCrm || hasLinkedPayment || hasLinkedSettlement || hasLinkedFinance || hasLinkedAftersales) {
      throw new ConflictError("该个人客户已有交易、收付款、售后或CRM记录，不能删除；如需停用请改备注或客户等级。");
    }
    state.customers = state.customers.filter((item) => item.id !== id);
    addLog(systemActor(), "合伙/客商", "删除个人客户", existing.name);
    return existing;
  };

  const crmStageByFollowResult: Record<string, CustomerCard["crmStage"]> = {
    继续跟进: "需求确认",
    已报价: "报价中",
    已成交: "已成交",
    暂缓: "需求确认",
    无效线索: "新线索",
    售后维护: "售后维护",
  };

  const crmStatusByFollowResult: Record<string, CustomerCard["crmStatus"]> = {
    继续跟进: "跟进中",
    已报价: "跟进中",
    已成交: "已成交",
    暂缓: "沉睡",
    无效线索: "流失",
    售后维护: "已成交",
  };

  const createCrmFollowUp = (followUp: Partial<CrmFollowUpRecord> & { customerId: string; content: string; result: CrmFollowUpRecord["result"]; handler: string }) => {
    const customer = state.customers.find((item) => item.id === followUp.customerId);
    if (!customer) throw new NotFoundError(`客户不存在: ${followUp.customerId}`);
    const record: CrmFollowUpRecord = {
      id: genId("CRM-FU"),
      customerId: customer.id,
      customerName: customer.name,
      contactMethod: followUp.contactMethod || "微信",
      content: followUp.content,
      result: followUp.result,
      handler: followUp.handler,
      followTime: followUp.followTime || nowStamp(),
      nextFollowTime: followUp.nextFollowTime,
      nextAction: (followUp as any).nextAction,
      dealProbability: Number((followUp as any).dealProbability ?? 0),
      estimatedAmount: Number((followUp as any).estimatedAmount ?? 0),
      lostReason: (followUp as any).lostReason,
      remarks: followUp.remarks,
    };
    state.crmFollowUps = [record, ...state.crmFollowUps];
    state.customers = state.customers.map((item) => {
      if (item.id !== customer.id) return item;
      return {
        ...item,
        crmStatus: crmStatusByFollowResult[record.result] || item.crmStatus || "跟进中",
        crmStage: crmStageByFollowResult[record.result] || item.crmStage || "需求确认",
        owner: record.handler || item.owner,
        lastFollowTime: record.followTime,
        lastContactAt: record.followTime,
        nextFollowTime: record.nextFollowTime,
        nextFollowUpAt: (followUp as any).nextFollowUpAt || record.nextFollowTime || item.nextFollowUpAt,
        nextAction: (followUp as any).nextAction || item.nextAction,
        dealProbability: Number((followUp as any).dealProbability ?? item.dealProbability ?? 0),
        estimatedAmount: Number((followUp as any).estimatedAmount ?? item.estimatedAmount ?? item.budget ?? 0),
        lostReason: record.result === "无效线索" ? ((followUp as any).lostReason || item.lostReason || "跟进无效") : item.lostReason,
      };
    });
    addLog(systemActor(), "CRM客户管理", "新增客户跟进", customer.name);
    return record;
  };

  const createCrmRequirement = (requirement: Partial<CrmRequirement> & { customerId: string; productDemand: string; budget: number; intent: CrmRequirement["intent"]; handler: string }) => {
    const customer = state.customers.find((item) => item.id === requirement.customerId);
    if (!customer) throw new NotFoundError(`客户不存在: ${requirement.customerId}`);
    const record: CrmRequirement = {
      id: genId("CRM-REQ"),
      customerId: customer.id,
      customerName: customer.name,
      productDemand: requirement.productDemand,
      budget: Number(requirement.budget) || 0,
      intent: requirement.intent || "中",
      stage: requirement.stage || "需求确认",
      source: requirement.source || customer.firstChannel || customer.source || "CRM",
      handler: requirement.handler,
      createTime: requirement.createTime || nowStamp(),
      estimatedAmount: Number((requirement as any).estimatedAmount ?? requirement.budget ?? 0),
      dealProbability: Number((requirement as any).dealProbability ?? 0),
      nextAction: (requirement as any).nextAction,
      expectedDealTime: requirement.expectedDealTime,
      remarks: requirement.remarks,
    };
    state.crmRequirements = [record, ...state.crmRequirements];
    state.customers = state.customers.map((item) => {
      if (item.id !== customer.id) return item;
      return {
        ...item,
        crmStatus: record.stage === "已成交" ? "已成交" : "跟进中",
        crmStage: record.stage === "已关闭" ? item.crmStage : record.stage,
        owner: record.handler || item.owner,
        intent: record.intent,
        budget: record.budget,
        estimatedAmount: Number((requirement as any).estimatedAmount ?? record.budget ?? item.estimatedAmount ?? 0),
        dealProbability: Number((requirement as any).dealProbability ?? item.dealProbability ?? 0),
        nextAction: (requirement as any).nextAction || item.nextAction || (record.stage === "报价中" ? "发送报价并确认预算" : "继续确认需求"),
        tags: Array.from(new Set([...(item.tags || []), "CRM需求"])),
      };
    });
    addLog(systemActor(), "CRM客户管理", "登记客户需求", customer.name, undefined, record.productDemand);
    return record;
  };

  const createCrmQuote = (quote: Omit<CrmQuote, "id" | "createdAt" | "customerName" | "totalAmount"> & { id?: string; createdAt?: string; customerName?: string; totalAmount?: number }) => {
    const customer = state.customers.find((item) => item.id === quote.customerId);
    if (!customer) throw new NotFoundError(`客户不存在: ${quote.customerId}`);
    const items = (Array.isArray(quote.items) ? quote.items : []).map((item) => ({
      ...item,
      id: item.id || genId("CRM-QI"),
      productName: String(item.productName || "").trim(),
      quantity: String(item.quantity || "1"),
      unitPrice: String(item.unitPrice || "0"),
    })).filter((item) => item.productName && Number(item.quantity) > 0 && Number(item.unitPrice) >= 0);
    if (!items.length) throw new ValidationError("报价单至少需要一条有效商品明细");
    const totalAmount = items.reduce((sum, item) => sum + Number(item.quantity) * Number(item.unitPrice), 0);
    const record: CrmQuote = {
      ...quote,
      id: quote.id?.trim() || genId("CRM-QUOTE"),
      quoteNo: quote.quoteNo?.trim() || genId("BJ"),
      customerName: customer.name,
      createdAt: quote.createdAt || nowStamp(),
      status: quote.status || "草稿",
      items,
      totalAmount: Math.round(totalAmount * 100) / 100,
      owner: quote.owner || getActiveRole(),
    };
    state.crmQuotes = [record, ...state.crmQuotes];
    addLog(systemActor(), "CRM客户管理", "生成客户报价单", customer.name, undefined, `${record.quoteNo} · ${record.totalAmount}元`);
    return record;
  };

  /**
   * 将内置 CRM 演示内容安全补入当前状态。只新增缺失的演示记录，已有客户仅补齐
   * CRM 字段，不覆盖姓名、联系方式和历史交易，方便老数据升级后直接查看完整工作台。
   */
  const seedCrmDemoData = () => {
    const demo = createInitialState();
    const changedCustomers: CustomerCard[] = [];
    demo.customers.forEach((seed) => {
      const existing = state.customers.find((item) => item.id === seed.id);
      if (!existing) {
        state.customers = [...state.customers, structuredClone(seed)];
        changedCustomers.push(structuredClone(seed));
        return;
      }
      const updated: CustomerCard = {
        ...existing,
        crmStatus: seed.crmStatus,
        crmStage: seed.crmStage,
        level: seed.level,
        owner: seed.owner,
        intent: seed.intent,
        budget: seed.budget,
        lastFollowTime: seed.lastFollowTime,
        nextFollowTime: seed.nextFollowTime,
        nextFollowUpAt: seed.nextFollowUpAt,
        lastContactAt: seed.lastContactAt,
        nextAction: seed.nextAction,
        dealProbability: seed.dealProbability,
        estimatedAmount: seed.estimatedAmount,
        lostReason: seed.lostReason,
        tags: Array.from(new Set([...(existing.tags || []), ...(seed.tags || [])])),
      };
      state.customers = state.customers.map((item) => item.id === updated.id ? updated : item);
      changedCustomers.push(updated);
    });

    const appendMissing = <T extends { id: string }>(current: T[], records: T[]) => {
      const existingIds = new Set(current.map((item) => item.id));
      const added = records.filter((item) => !existingIds.has(item.id)).map((item) => structuredClone(item));
      return { added, next: [...added, ...current] };
    };
    const followUps = appendMissing(state.crmFollowUps, demo.crmFollowUps);
    const requirements = appendMissing(state.crmRequirements, demo.crmRequirements);
    const quotes = appendMissing(state.crmQuotes, demo.crmQuotes);
    const purchaseInvoices = appendMissing(
      state.purchaseInvoices,
      demo.purchaseInvoices.filter((item) => ["CG-20260730-003", "CG-20260729-004"].includes(item.id)),
    );
    state.crmFollowUps = followUps.next;
    state.crmRequirements = requirements.next;
    state.crmQuotes = quotes.next;
    state.purchaseInvoices = purchaseInvoices.next;
    addLog(systemActor(), "CRM客户管理", "填充 CRM 演示内容", "客户工作台", undefined, `客户 ${changedCustomers.length} · 跟进 ${followUps.added.length} · 需求 ${requirements.added.length} · 报价 ${quotes.added.length}`);
    return {
      customers: changedCustomers,
      purchaseInvoices: purchaseInvoices.added,
      crmFollowUps: followUps.added,
      crmRequirements: requirements.added,
      crmQuotes: quotes.added,
    };
  };

  const getCrmSummary = (filters: { owner?: string; status?: string; intent?: string; customerName?: string } = {}) => {
    const scopedCustomers = state.customers.filter((item) => {
      const matchOwner = !filters.owner || (item.owner || "未分配") === filters.owner;
      const matchStatus = !filters.status || (item.crmStatus || "线索") === filters.status;
      const matchIntent = !filters.intent || (item.intent || "中") === filters.intent;
      const matchName = !filters.customerName || item.name.includes(filters.customerName);
      return matchOwner && matchStatus && matchIntent && matchName;
    });
    const customerIds = new Set(scopedCustomers.map((item) => item.id));
    const scopedFollowUps = state.crmFollowUps.filter((item) => customerIds.has(item.customerId));
    const scopedRequirements = state.crmRequirements.filter((item) => customerIds.has(item.customerId));
    const today = storeDate();
    const ownerMap = new Map<string, { owner: string; customers: number; followUps: number; requirements: number; highIntent: number }>();
    scopedCustomers.forEach((customer) => {
      const owner = customer.owner || "未分配";
      const current = ownerMap.get(owner) || { owner, customers: 0, followUps: 0, requirements: 0, highIntent: 0 };
      current.customers += 1;
      current.highIntent += (customer.intent || "中") === "高" ? 1 : 0;
      ownerMap.set(owner, current);
    });
    scopedFollowUps.forEach((item) => {
      const owner = item.handler || "未分配";
      const current = ownerMap.get(owner) || { owner, customers: 0, followUps: 0, requirements: 0, highIntent: 0 };
      current.followUps += 1;
      ownerMap.set(owner, current);
    });
    scopedRequirements.forEach((item) => {
      const owner = item.handler || "未分配";
      const current = ownerMap.get(owner) || { owner, customers: 0, followUps: 0, requirements: 0, highIntent: 0 };
      current.requirements += 1;
      ownerMap.set(owner, current);
    });
    return {
      customers: scopedCustomers,
      followUps: scopedFollowUps,
      requirements: scopedRequirements,
      ownerSummary: Array.from(ownerMap.values()),
      totals: {
        customers: scopedCustomers.length,
        leads: scopedCustomers.filter((item) => (item.crmStatus || "线索") === "线索").length,
        following: scopedCustomers.filter((item) => (item.crmStatus || "线索") === "跟进中").length,
        deals: scopedCustomers.filter((item) => (item.crmStatus || "线索") === "已成交").length,
        highIntent: scopedCustomers.filter((item) => (item.intent || "中") === "高").length,
        pendingFollowUps: scopedCustomers.filter((item) => item.nextFollowTime && item.nextFollowTime.slice(0, 10) <= today).length,
        requirements: scopedRequirements.length,
      },
    };
  };

  const createVendor = (vendor: Partial<Vendor> & { name: string; contact?: string; debtBalance?: number }) => {
    assertVendorIdentityAvailable(vendor);
    const newVendor: Vendor = {
      id: nextPartnerArchiveId("GY", state.vendors),
      name: vendor.name,
      partnerCategory: "同行",
      contactPerson: vendor.contactPerson || vendor.name,
      phone: vendor.contact || vendor.phone || "",
      type: vendor.type || "上游供应商",
      level: normalizeCustomerLevel(vendor.level),
      isCoreCustomer: Boolean(vendor.isCoreCustomer || vendor.type === "核心采购方"),
      levelReason: vendor.levelReason,
      riskReason: vendor.riskReason?.trim() || undefined,
      totalBuyAmount: vendor.totalBuyAmount || 0,
      totalCount: vendor.totalCount || 0,
      avgProfit: vendor.avgProfit || 0,
      aftersalesCount: vendor.aftersalesCount || 0,
      aftersalesRate: vendor.aftersalesRate || 0,
      lastDealTime: vendor.lastDealTime || storeDate(),
      accountPayable: vendor.debtBalance || vendor.accountPayable || 0,
      accountReceivable: vendor.accountReceivable || 0,
      accountPaid: vendor.accountPaid || 0,
      remarks: vendor.remarks,
      contact: vendor.contact || vendor.phone || "",
      debtBalance: vendor.debtBalance || vendor.accountPayable || 0,
      isHighRisk: Boolean(vendor.isHighRisk),
    };
    if (newVendor.level === "S级" && !newVendor.isCoreCustomer) throw new ValidationError("S级仅用于核心同行，请先标记为核心同行");
    if (newVendor.level === "R级" && !newVendor.riskReason) throw new ValidationError("R级同行必须填写风险原因");
    const gradedVendor = withVendorGrade(newVendor);
    state.vendors = [...state.vendors, gradedVendor];
    addLog(systemActor(), "合伙/客商", "新建商号供应商", vendor.name);
    return gradedVendor;
  };

  const updateVendor = (id: string, updates: Partial<Vendor>) => {
    const existing = state.vendors.find((item) => item.id === id);
    if (!existing) throw new NotFoundError(`同行档案不存在: ${id}`);
    const previousContact = existing.contact || existing.phone || existing.contactPerson || "";
    const legacyNameIsUnique = state.vendors.filter((item) => item.name.trim() === existing.name.trim()).length === 1;
    const requestedVendorLevel = normalizeCustomerLevel(updates.level ?? existing.level);
    const requestedCoreVendor = updates.isCoreCustomer ?? existing.isCoreCustomer ?? existing.level === "S级";
    const requestedVendorType = updates.type ?? existing.type;
    if (requestedVendorLevel === "S级" && !requestedCoreVendor && requestedVendorType !== "核心采购方") throw new ValidationError("S级仅用于核心同行，请先标记为核心同行");
    const nextVendor = withVendorGrade({
      ...existing,
      ...updates,
      id: existing.id,
      partnerCategory: "同行",
      contact: updates.contact ?? updates.phone ?? existing.contact ?? existing.phone ?? "",
      phone: updates.phone ?? updates.contact ?? existing.phone ?? existing.contact ?? "",
      contactPerson: updates.contactPerson ?? updates.name ?? existing.contactPerson,
      debtBalance: updates.debtBalance ?? updates.accountPayable ?? existing.debtBalance ?? existing.accountPayable,
      accountPayable: updates.accountPayable ?? updates.debtBalance ?? existing.accountPayable,
      accountReceivable: updates.accountReceivable ?? existing.accountReceivable ?? 0,
      isHighRisk: updates.isHighRisk ?? existing.isHighRisk,
      level: requestedVendorLevel,
      isCoreCustomer: requestedCoreVendor || requestedVendorType === "核心采购方",
      riskReason: updates.riskReason === undefined ? existing.riskReason : updates.riskReason.trim() || undefined,
    });
    if (nextVendor.level === "S级" && !nextVendor.isCoreCustomer) throw new ValidationError("S级仅用于核心同行，请先标记为核心同行");
    if (nextVendor.level === "R级" && !nextVendor.riskReason) throw new ValidationError("R级同行必须填写风险原因");
    const nextContact = nextVendor.contact || nextVendor.phone || nextVendor.contactPerson || "";

    state.vendors = state.vendors.map((item) => (item.id === id ? nextVendor : item));
    state.purchaseInvoices = state.purchaseInvoices.map((invoice) => {
      const linkedById = invoice.sourcePartnerId === id && (invoice.sourcePartnerType || "vendor") === "vendor";
      const legacyMatch = legacyNameIsUnique && !invoice.sourcePartnerId && !["个人回收", "客户置换"].includes(invoice.sourceType) &&
        matchesPerson(existing.name, previousContact, invoice.supplierName, invoice.contact);
      if (!linkedById && !legacyMatch) return invoice;
      return { ...invoice, sourcePartnerId: id, sourcePartnerType: "vendor", supplierName: nextVendor.name, contact: nextContact };
    });
    state.salesInvoices = state.salesInvoices.map((invoice) => {
      const linkedById = invoice.customerId === id && invoice.customerPartnerType === "vendor";
      const legacyMatch = legacyNameIsUnique && !invoice.customerId && invoice.channel === "同行网店" &&
        matchesPerson(existing.name, previousContact, invoice.customerName, invoice.contact);
      if (!linkedById && !legacyMatch) return invoice;
      return { ...invoice, customerId: id, customerPartnerType: "vendor", customerName: nextVendor.name, contact: nextContact };
    });
    state.inventory = state.inventory.map((card) =>
      legacyNameIsUnique && matchesPerson(existing.name, previousContact, card.supplierName, undefined)
        ? { ...card, supplierName: nextVendor.name }
        : card,
    );
    state.paymentOutRecords = state.paymentOutRecords.map((item) =>
      item.supplierId === id || (legacyNameIsUnique && !item.supplierId && item.supplierName === existing.name)
        ? { ...item, supplierId: id, supplierName: nextVendor.name }
        : item,
    );
    state.settlementLedger = state.settlementLedger.map((item) =>
      legacyNameIsUnique && item.supplierName === existing.name ? { ...item, supplierName: nextVendor.name } : item,
    );
    addLog(systemActor(), "合伙/客商", "更新同行档案", existing.name);
    return state.vendors.find((item) => item.id === id) ?? null;
  };

  const deleteVendor = (id: string) => {
    const existing = state.vendors.find((item) => item.id === id);
    if (!existing) throw new NotFoundError(`同行档案不存在: ${id}`);
    const contact = existing.contact || existing.phone || existing.contactPerson || "";
    const hasLinkedPurchase = state.purchaseInvoices.some((invoice) => isInvoiceLinkedToVendor(invoice, id, existing.name, contact));
    const hasLinkedSales = state.salesInvoices.some((invoice) => isInvoiceLinkedToVendor(invoice, id, existing.name, contact));
    if (hasLinkedPurchase || hasLinkedSales) {
      throw new ConflictError("该同行已有进货或销售单据，不能删除；如需停用请改备注或标记风险。");
    }
    state.vendors = state.vendors.filter((item) => item.id !== id);
    addLog(systemActor(), "合伙/客商", "删除同行档案", existing.name);
    return existing;
  };

  const listUsers = () => state.systemUsers.map(sanitizeUser);

  const getCurrentUser = () => {
    const current = state.systemUsers.find((user) => user.id === getActiveUserId());
    return current ? sanitizeUser(current) : null;
  };

  const login = (credentials: { username?: string; password?: string } | null | undefined) => {
    const input = credentials && typeof credentials === "object" ? credentials : {};
    const username = typeof input.username === "string" ? input.username.trim() : "";
    const password = typeof input.password === "string" ? input.password : "";
    // Reject malformed or oversized credentials before password verification. The
    // scrypt fallback is intentionally expensive, so unbounded request strings
    // must not reach it.
    if (!username || username.length > 128 || password.length > 1024) {
      throw new UnauthorizedError("账号或密码错误");
    }
    const user = state.systemUsers.find((item) => item.username.toLowerCase() === username.toLowerCase());
    if (!user || !verifyPassword(user.password, password)) {
      throw new UnauthorizedError("账号或密码错误");
    }
    if (!user.enabled) {
      throw new UnauthorizedError("账号已停用");
    }
    const loginTime = nowStamp();
    const upgradedPassword = isPasswordHash(user.password) ? user.password : hashPassword(password);
    state.systemUsers = state.systemUsers.map((item) => item.id === user.id ? { ...item, password: upgradedPassword, lastLoginTime: loginTime } : item);
    state.currentUserId = user.id;
    state.currentRole = user.role;
    addLog(`${user.displayName} (${user.role})`, "账号登录", "登录系统", user.username, undefined, `登录时间: ${loginTime}`);
    return sanitizeUser({ ...user, password: upgradedPassword, lastLoginTime: loginTime });
  };

  const logout = () => {
    const user = state.systemUsers.find((item) => item.id === getActiveUserId());
    if (user) {
      addLog(`${user.displayName} (${user.role})`, "账号登录", "退出系统", user.username);
    }
    state.currentUserId = undefined;
    return null;
  };

  const createUser = (input: Partial<SystemUserAccount> | null | undefined) => {
    const payload = input && typeof input === "object" ? input : {};
    const username = typeof payload.username === "string" ? payload.username.trim() : "";
    const password = typeof payload.password === "string" ? payload.password.trim() : "";
    const displayName = typeof payload.displayName === "string" ? payload.displayName.trim() : "";
    if (!username || !password || !displayName || !payload.role) {
      throw new ValidationError("账号、密码、姓名和角色不能为空");
    }
    if (username.length > 128 || password.length > 1024 || displayName.length > 128) {
      throw new ValidationError("账号、密码或姓名长度超出限制");
    }
    if (state.systemUsers.some((item) => item.username.toLowerCase() === username.toLowerCase())) {
      throw new ConflictError("账号已存在");
    }
    const user: SystemUserAccount = {
      id: genId("USR"),
      username,
      password: hashPassword(password),
      displayName,
      role: payload.role,
      enabled: payload.enabled ?? true,
      permissionOverrides: payload.permissionOverrides || {},
      remarks: payload.remarks,
    };
    state.systemUsers = [user, ...state.systemUsers];
    addLog(systemActor(), "账号权限", "新增账号", username, undefined, `角色: ${user.role}`);
    return sanitizeUser(user);
  };

  const updateUser = (id: string, input: Partial<SystemUserAccount> | null | undefined) => {
    const existing = state.systemUsers.find((item) => item.id === id);
    if (!existing) throw new NotFoundError("账号不存在");
    const payload = input && typeof input === "object" ? input : {};
    const nextUsername = typeof payload.username === "string" ? payload.username.trim() : undefined;
    const nextDisplayName = typeof payload.displayName === "string" ? payload.displayName.trim() : undefined;
    const nextPassword = typeof payload.password === "string" ? payload.password.trim() : undefined;
    if (nextUsername === "" || nextDisplayName === "") {
      throw new ValidationError("账号和姓名不能为空");
    }
    if ((payload.username !== undefined && typeof payload.username !== "string") || (payload.displayName !== undefined && typeof payload.displayName !== "string") || (payload.password !== undefined && typeof payload.password !== "string")) {
      throw new ValidationError("账号、密码或姓名格式不合法");
    }
    if ((nextUsername && nextUsername.length > 128) || (nextDisplayName && nextDisplayName.length > 128) || (nextPassword && nextPassword.length > 1024)) {
      throw new ValidationError("账号、密码或姓名长度超出限制");
    }
    if (nextUsername && state.systemUsers.some((item) => item.id !== id && item.username.toLowerCase() === nextUsername.toLowerCase())) {
      throw new ConflictError("账号已存在");
    }
    const updated: SystemUserAccount = {
      ...existing,
      ...payload,
      username: nextUsername || existing.username,
      displayName: nextDisplayName || existing.displayName,
      password: nextPassword ? hashPassword(nextPassword) : existing.password,
      permissionOverrides: payload.permissionOverrides === undefined ? existing.permissionOverrides : { ...(existing.permissionOverrides || {}), ...payload.permissionOverrides },
    };
    state.systemUsers = state.systemUsers.map((item) => item.id === id ? updated : item);
    if (getActiveUserId() === id) {
      state.currentRole = updated.role;
    }
    addLog(systemActor(), "账号权限", "更新账号", updated.username, existing.role, updated.role);
    return sanitizeUser(updated);
  };

  const getCommissionRules = () => structuredClone(state.commissionRules);

  const updateCommissionRules = (input: CommissionRulesPatch) => {
    const current = state.commissionRules;
    const next = normalizeCommissionRules({
      ...current,
      ...input,
      purchase: {
        ...current.purchase,
        ...(input.purchase || {}),
        targets: { ...current.purchase.targets, ...(input.purchase?.targets || {}) },
      },
      sales: {
        ...current.sales,
        ...(input.sales || {}),
        targets: { ...current.sales.targets, ...(input.sales?.targets || {}) },
      },
      updatedAt: nowStamp().replace(" ", "T"),
    });
    state.commissionRules = next;
    addLog(systemActor(), "提成规则", "更新", "进货/卖货提成规则", JSON.stringify(current), JSON.stringify(next));
    return structuredClone(next);
  };

  const getPermissions = () => {
    const base = state.customPermissions.find((item) => item.role === getActiveRole()) || defaultPermissions[0];
    const currentUser = state.systemUsers.find((user) => user.id === getActiveUserId());
    const merged = currentUser?.permissionOverrides
      ? { ...base, ...currentUser.permissionOverrides, role: getActiveRole() }
      : base;
    return {
      ...merged,
      allowedMenus: normalizeAllowedMenus(merged.allowedMenus, getActiveRole()),
    };
  };
  const clearAllLogs = () => {
    const clearedCount = state.logs.length;
    state.logs = [];
    return addLog(
      systemActor(),
      "系统设置",
      "清空操作日志",
      "审计日志",
      `清理前共 ${clearedCount} 条日志`,
      "历史操作日志已清空；保留本次清理记录以便追溯",
    );
  };
  const reconcileLedgerItem = (id: string) => {
    const existing = state.financeLedger.find((item) => item.id === id);
    if (!existing) return null;
    state.financeLedger = state.financeLedger.map((item) => (item.id === id ? { ...item, status: "已复核" } : item));
    addLog(systemActor(), "财务总账", "复核财务流水", id, "未复核", "已复核");
    return state.financeLedger.find((item) => item.id === id) ?? null;
  };
  const getAccountSummary = (filters: { accountId?: string; handler?: string; customerName?: string; supplierName?: string } = {}) => {
    const scopedLedger = state.settlementLedger.filter((item) => {
      const matchAccount = !filters.accountId || item.accountId === filters.accountId;
      const matchHandler = !filters.handler || item.handler === filters.handler;
      const matchCustomer = !filters.customerName || item.customerName === filters.customerName;
      const matchSupplier = !filters.supplierName || item.supplierName === filters.supplierName;
      return matchAccount && matchHandler && matchCustomer && matchSupplier;
    });
    const today = storeDate();
    const month = today.slice(0, 7);
    const accounts = state.settlementAccounts
      .filter((account) => !filters.accountId || account.id === filters.accountId)
      .map((account) => {
        const ledger = scopedLedger.filter((item) => item.accountId === account.id);
        return {
          ...account,
          todayIncome: ledger.filter((item) => item.time.startsWith(today)).reduce((sum, item) => sum + item.incomeAmount, 0),
          todayExpense: ledger.filter((item) => item.time.startsWith(today)).reduce((sum, item) => sum + item.expenseAmount, 0),
          monthIncome: ledger.filter((item) => item.time.startsWith(month)).reduce((sum, item) => sum + item.incomeAmount, 0),
          monthExpense: ledger.filter((item) => item.time.startsWith(month)).reduce((sum, item) => sum + item.expenseAmount, 0),
        };
      });
    const employeeMap = new Map<string, { handler: string; receivedAmount: number; paidAmount: number; incomeCount: number; expenseCount: number }>();
    scopedLedger.forEach((item) => {
      const current = employeeMap.get(item.handler) || { handler: item.handler, receivedAmount: 0, paidAmount: 0, incomeCount: 0, expenseCount: 0 };
      current.receivedAmount += item.incomeAmount;
      current.paidAmount += item.expenseAmount;
      current.incomeCount += item.incomeAmount > 0 ? 1 : 0;
      current.expenseCount += item.expenseAmount > 0 ? 1 : 0;
      employeeMap.set(item.handler, current);
    });
    return {
      accounts,
      ledger: scopedLedger,
      employeeSummary: Array.from(employeeMap.values()),
      totals: {
        balance: accounts.reduce((sum, item) => sum + item.balance, 0),
        income: scopedLedger.reduce((sum, item) => sum + item.incomeAmount, 0),
        expense: scopedLedger.reduce((sum, item) => sum + item.expenseAmount, 0),
      },
    };
  };

  const normalizeAssemblyPart = (part: Partial<AssemblyPartRecord>, index: number): AssemblyPartRecord => {
    const sn = part.sn?.trim();
    if (!sn) throw new ValidationError(`第 ${index + 1} 行配件SN不能为空`);
    return {
      productId: part.productId?.trim() || undefined,
      partName: part.partName?.trim() || `配件-${index + 1}`,
      category: (part.category || "其他配件") as ProductCategory,
      sn,
      costPrice: Number(part.costPrice || 0) || undefined,
      estSellPrice: Number(part.estSellPrice || 0) || undefined,
      marketPrice: Number(part.marketPrice || 0) || undefined,
      remarks: part.remarks?.trim() || undefined,
    };
  };

  const splitAmountForParts = (amount: number, count: number) => {
    if (count <= 0) return [];
    const base = Math.floor((amount / count) * 100) / 100;
    const values = Array.from({ length: count }, () => base);
    values[count - 1] = Number((amount - base * (count - 1)).toFixed(2));
    return values;
  };

  const createAssemblyInventoryItem = (
    part: AssemblyPartRecord,
    source: CardInventory | undefined,
    recordId: string,
    index: number,
    valuation?: { costPrice?: number; estSellPrice?: number; marketPrice?: number }
  ): CardInventory => ({
    id: `ZC-${recordId}-${String(index + 1).padStart(3, "0")}`,
    productId: part.productId || `ASM-${recordId}-${index + 1}`,
    productName: part.partName,
    category: part.category,
    model: part.partName,
    brand: source?.brand || "拆装件",
    version: source?.version || "拆装记录",
    vram: source?.vram || "-",
    sn: part.sn,
    sourceType: source?.sourceType || "门店自采",
    supplierName: source?.supplierName || "组装拆卸",
    costPrice: Number(valuation?.costPrice ?? source?.costPrice ?? 0),
    estSellPrice: Number(valuation?.estSellPrice ?? source?.estSellPrice ?? 0),
    marketPrice: Number(valuation?.marketPrice ?? source?.marketPrice ?? valuation?.estSellPrice ?? source?.estSellPrice ?? 0),
    status: "已入库",
    condition: source?.condition || "90新",
    inWarranty: source?.inWarranty || false,
    warrantyDate: source?.warrantyDate,
    repaired: source?.repaired || false,
    gpuRisk: false,
    fullBox: source?.fullBox || false,
    warehouseLocation: source?.warehouseLocation || "拆装件库位",
    entryTime: nowStamp().slice(0, 10),
    storageDays: 0,
    remarks: `组装拆卸单:${recordId}${part.remarks ? `；${part.remarks}` : ""}`,
  });

  const createAssemblyOperation = (input: Partial<AssemblyOperationRecord> & { type: "拆卸" | "组装"; handler: string }) => {
    const id = genId(input.type === "拆卸" ? "CX" : "ZZ");
    const time = nowStamp();
    const handler = input.handler?.trim() || getActiveRole();

    if (input.type === "拆卸") {
      const beforeSn = input.beforeSn?.trim();
      if (!beforeSn) throw new ValidationError("拆卸必须录入拆之前SN");
      const source = state.inventory.find((item) => item.sn.toLowerCase() === beforeSn.toLowerCase() || item.id.toLowerCase() === beforeSn.toLowerCase());
      if (!source) throw new NotFoundError(`未找到拆之前SN: ${beforeSn}`);
      const afterParts = (input.afterParts || []).map(normalizeAssemblyPart);
      if (!afterParts.length) throw new ValidationError("拆卸必须录入拆之后配件SN");
      const seenPartSn = new Set<string>();
      for (const part of afterParts) {
        const key = part.sn.toLowerCase();
        if (seenPartSn.has(key)) throw new ConflictError(`拆之后配件SN重复: ${part.sn}`);
        seenPartSn.add(key);
        if (findCardBySn(part.sn)) throw new ConflictError(`拆之后配件SN已存在: ${part.sn}`);
      }

      const record: AssemblyOperationRecord = {
        id,
        type: "拆卸",
        handler,
        time,
        beforeSn: source.sn || beforeSn,
        beforeProductName: source.productName,
        beforeParts: [],
        afterParts,
        remarks: input.remarks?.trim() || undefined,
      };
      const manualCostTotal = afterParts.reduce((sum, part) => sum + Number(part.costPrice || 0), 0);
      const manualEstSellTotal = afterParts.reduce((sum, part) => sum + Number(part.estSellPrice || 0), 0);
      const manualMarketTotal = afterParts.reduce((sum, part) => sum + Number(part.marketPrice || 0), 0);
      if (manualCostTotal > source.costPrice) throw new ValidationError("拆后配件成本合计不能超过拆前库存成本");
      const costParts = splitAmountForParts(source.costPrice - manualCostTotal, afterParts.filter((part) => !part.costPrice).length);
      const estSellParts = splitAmountForParts(Math.max(0, source.estSellPrice - manualEstSellTotal), afterParts.filter((part) => !part.estSellPrice).length);
      const marketParts = splitAmountForParts(Math.max(0, source.marketPrice - manualMarketTotal), afterParts.filter((part) => !part.marketPrice).length);
      let costIndex = 0;
      let estSellIndex = 0;
      let marketIndex = 0;
      const newItems = afterParts.map((part, index) => createAssemblyInventoryItem(part, source, id, index, {
        costPrice: part.costPrice ?? costParts[costIndex++],
        estSellPrice: part.estSellPrice ?? estSellParts[estSellIndex++],
        marketPrice: part.marketPrice ?? marketParts[marketIndex++],
      }));
      state.assemblyOperations = [record, ...state.assemblyOperations];
      state.inventory = [
        ...newItems,
        ...state.inventory.map((item) => item.id === source.id ? { ...item, status: "已拆卸" as CardStatus, remarks: `${item.remarks || ""}${item.remarks ? "；" : ""}${time} 拆卸为 ${afterParts.length} 个配件，单号 ${id}` } : item),
      ];
      addLog(handler, "组装拆卸", "拆卸", id, source.sn, afterParts.map((part) => part.sn).join(", "));
      return record;
    }

    const beforeParts = (input.beforeParts || []).map(normalizeAssemblyPart);
    if (!beforeParts.length) throw new ValidationError("组装必须录入来源配件SN");
    const afterSn = input.afterSn?.trim();
    if (!afterSn) throw new ValidationError("组装必须录入组装后SN");
    if (findCardBySn(afterSn)) {
      throw new ConflictError(`组装后SN已存在: ${afterSn}`);
    }
    const sourceParts = beforeParts.map((part) => {
      const sourcePart = state.inventory.find((item) => item.sn.toLowerCase() === part.sn.toLowerCase());
      if (!sourcePart) throw new NotFoundError(`未找到来源配件SN: ${part.sn}`);
      if (!["已入库", "已上架"].includes(sourcePart.status)) throw new ConflictError(`来源配件不可组装: ${part.sn} 当前状态为 ${sourcePart.status}`);
      return sourcePart;
    });
    const assembledCost = sourceParts.reduce((sum, item) => sum + item.costPrice, 0);
    const assembledEstSell = sourceParts.reduce((sum, item) => sum + item.estSellPrice, 0);
    const assembledMarket = sourceParts.reduce((sum, item) => sum + item.marketPrice, 0);
    const record: AssemblyOperationRecord = {
      id,
      type: "组装",
      handler,
      time,
      beforeParts,
      afterSn,
      afterProductName: input.afterProductName?.trim() || "组装成品",
      afterCategory: (input.afterCategory || "整机") as ProductCategory,
      afterParts: [],
      remarks: input.remarks?.trim() || undefined,
    };
    const finishedItem = createAssemblyInventoryItem(
      { partName: record.afterProductName || "组装成品", category: record.afterCategory || "整机", sn: afterSn, remarks: input.remarks },
      sourceParts[0],
      id,
      0,
      {
        costPrice: assembledCost,
        estSellPrice: assembledEstSell,
        marketPrice: assembledMarket,
      }
    );
    state.assemblyOperations = [record, ...state.assemblyOperations];
    state.inventory = [
      finishedItem,
      ...state.inventory.map((item) => beforeParts.some((part) => part.sn.toLowerCase() === item.sn.toLowerCase())
        ? { ...item, status: "已组装" as CardStatus, remarks: `${item.remarks || ""}${item.remarks ? "；" : ""}${time} 参与组装，单号 ${id}` }
        : item
      ),
    ];
    addLog(handler, "组装拆卸", "组装", id, beforeParts.map((part) => part.sn).join(", "), afterSn);
    return record;
  };

  const deleteAssemblyOperation = (id: string) => {
    const record = state.assemblyOperations.find((item) => item.id === id);
    if (!record) throw new NotFoundError(`组装拆卸单不存在: ${id}`);
    const relatedItems = state.inventory.filter((item) => isInventoryLinkedToAssembly(item, id));

    if (record.type === "拆卸") {
      const source = state.inventory.find((item) => item.sn === record.beforeSn);
      const generatedSnSet = new Set(record.afterParts.map((part) => part.sn.toLowerCase()));
      const generatedItems = state.inventory.filter((item) => generatedSnSet.has(item.sn.toLowerCase()) && isInventoryLinkedToAssembly(item, id));
      if (!source || source.status !== "已拆卸" || generatedItems.some((item) => item.status !== "已入库")) {
        throw new ConflictError("拆卸单生成的配件已被后续业务使用，不能删除");
      }
      state.inventory = state.inventory
        .filter((item) => !generatedItems.some((generated) => generated.id === item.id))
        .map((item) => item.id === source.id ? { ...item, status: "已入库" as CardStatus, remarks: `${item.remarks || ""}；${nowStamp()} 删除拆卸单 ${id}，恢复入库状态` } : item);
    } else {
      const finished = relatedItems.find((item) => item.sn === record.afterSn);
      const beforeSnSet = new Set(record.beforeParts.map((part) => part.sn.toLowerCase()));
      const sourceParts = state.inventory.filter((item) => beforeSnSet.has(item.sn.toLowerCase()));
      if (!finished || finished.status !== "已入库" || sourceParts.length !== record.beforeParts.length || sourceParts.some((item) => item.status !== "已组装")) {
        throw new ConflictError("组装单生成的成品或来源配件已被后续业务使用，不能删除");
      }
      state.inventory = state.inventory
        .filter((item) => item.id !== finished.id)
        .map((item) => beforeSnSet.has(item.sn.toLowerCase()) ? { ...item, status: "已入库" as CardStatus, remarks: `${item.remarks || ""}；${nowStamp()} 删除组装单 ${id}，恢复配件入库状态` } : item);
    }

    state.assemblyOperations = state.assemblyOperations.filter((item) => item.id !== id);
    addLog(systemActor(), "组装拆卸", `删除${record.type}单`, id, undefined, "库存状态已回滚");
    return record;
  };

  const resetToDemoData = () => {
    replaceState(state, createInitialState());
    return state;
  };

 return {
    createSettlementAccount,
    deleteSettlementAccount,
    reconcileSettlementAccount,
    createPaymentIn,
    updatePaymentIn,
    deletePaymentIn,
    createPaymentOut,
    updatePaymentOut,
    deletePaymentOut,
    createReturnOrder,
    completeReturnOrder,
    updateReturnOrder,
    deleteReturnOrder,
    createAccountTransfer,
    updateAccountTransfer,
    deleteAccountTransfer,
    getAccountSummary,
    createAssemblyOperation,
    deleteAssemblyOperation,
    addProductTemplate,
    addProductTemplates,
    updateProductTemplate,
    deleteProductTemplate,
    createPurchaseInvoice,
    updatePurchaseInvoice,
    deletePurchaseInvoice,
    submitInspection,
    updateInspection,
    createSalesInvoice,
    updateSalesInvoice,
    deleteSalesInvoice,
    confirmSalesOutbound,
    addAftersalesClaim,
    updateAftersalesStatus,
    updateMarketPrice,
    syncEstimatedSellPrice,
    batchUpdateInventory,
    getInventorySummary,
    importInventoryRows,
    scanInventoryFlow,
    createMarketQuote,
    importMarketQuotes,
    deleteMarketQuote,
    createCustomer,
    updateCrmCustomer,
    deleteCustomer,
    createCrmFollowUp,
    createCrmRequirement,
    createCrmQuote,
    seedCrmDemoData,
    getCrmSummary,
    createVendor,
    updateVendor,
    deleteVendor,
    listUsers,
    getCurrentUser,
    login,
    logout,
    createUser,
    updateUser,
    getCommissionRules,
    updateCommissionRules,
    addLog,
    getPermissions,
    clearAllLogs,
    reconcileLedgerItem,
    resetToDemoData,
  };
}
