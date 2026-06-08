import type {
  AftersalesRecord,
  AccountTransferRecord,
  AssemblyOperationRecord,
  AssemblyPartRecord,
  AuditLog,
  CardInventory,
  CardStatus,
  CrmFollowUpRecord,
  CrmRequirement,
  CustomerCard,
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
  ProductTemplate,
  ProductCategory,
  PurchaseInvoice,
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
  defaultPermissions,
  initialAftersales,
  initialCustomers,
  initialInspections,
  initialInventory,
  initialLogs,
  initialMarketQuotes,
  initialProducts,
  initialPurchaseInvoices,
  initialSalesInvoices,
  initialSystemUsers,
  initialVendors,
} from "../src/data/mockData.ts";
import { hashPassword, isPasswordHash, sanitizeUserAccount, verifyPassword } from "./security.ts";

export interface AppState {
  products: ProductTemplate[];
  inventory: CardInventory[];
  inspections: InspectionRecord[];
  purchaseInvoices: PurchaseInvoice[];
  salesInvoices: SalesInvoice[];
  marketQuotes: MarketQuote[];
  aftersales: AftersalesRecord[];
  customers: CustomerCard[];
  crmFollowUps: CrmFollowUpRecord[];
  crmRequirements: CrmRequirement[];
  vendors: Vendor[];
  logs: AuditLog[];
  financeLedger: FinanceLedger[];
  settlementAccounts: SettlementAccount[];
  settlementLedger: SettlementLedger[];
  paymentInRecords: PaymentInRecord[];
  paymentOutRecords: PaymentOutRecord[];
  accountTransfers: AccountTransferRecord[];
  assemblyOperations: AssemblyOperationRecord[];
  currentRole: StoreRole;
  customPermissions: PermissionSettings[];
  systemUsers: SystemUserAccount[];
  currentUserId?: string;
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

export function createInitialState(): AppState {
  return {
    products: structuredClone(initialProducts),
    inventory: structuredClone(initialInventory),
    inspections: structuredClone(initialInspections),
    purchaseInvoices: structuredClone(initialPurchaseInvoices),
    salesInvoices: structuredClone(initialSalesInvoices),
    marketQuotes: structuredClone(initialMarketQuotes),
    aftersales: structuredClone(initialAftersales),
    customers: structuredClone(initialCustomers),
    crmFollowUps: [],
    crmRequirements: [],
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
    currentRole: "老板",
    customPermissions: structuredClone(defaultPermissions),
    systemUsers: structuredClone(initialSystemUsers),
    currentUserId: undefined,
  };
}

function sanitizeUser(user: SystemUserAccount) {
  return sanitizeUserAccount(user);
}

function normalizePermissions(permissions: PermissionSettings[]) {
  return permissions.map((permission) => {
    const defaultForRole = defaultPermissions.find((item) => item.role === permission.role);
    if (!defaultForRole) return permission;
    const hasLegacyMenus = permission.allowedMenus.some((item) => item === "purchase" || item === "sales");
    if (hasLegacyMenus) return { ...permission, allowedMenus: defaultForRole.allowedMenus };
    if (
      !permission.allowedMenus.includes("all") &&
      !permission.allowedMenus.includes("sales_outbound") &&
      (permission.allowedMenus.includes("sales_add") || permission.allowedMenus.includes("sales_list"))
    ) {
      return { ...permission, allowedMenus: [...permission.allowedMenus, "sales_outbound"] };
    }
    if (
      !permission.allowedMenus.includes("all") &&
      !permission.allowedMenus.includes("assembly") &&
      (permission.allowedMenus.includes("inventory") || permission.allowedMenus.includes("inspections"))
    ) {
      return { ...permission, allowedMenus: [...permission.allowedMenus, "assembly"] };
    }
    return permission;
  });
}

function replaceState(target: AppState, next: AppState) {
  target.products = structuredClone(next.products);
  target.inventory = structuredClone(next.inventory);
  target.inspections = structuredClone(next.inspections);
  target.purchaseInvoices = structuredClone(next.purchaseInvoices);
  target.salesInvoices = structuredClone(next.salesInvoices);
  target.marketQuotes = structuredClone(next.marketQuotes);
  target.aftersales = structuredClone(next.aftersales);
  target.customers = structuredClone(next.customers);
  target.crmFollowUps = structuredClone(next.crmFollowUps || []);
  target.crmRequirements = structuredClone(next.crmRequirements || []);
  target.vendors = structuredClone(next.vendors);
  target.logs = structuredClone(next.logs);
  target.financeLedger = structuredClone(next.financeLedger);
  target.settlementAccounts = structuredClone(next.settlementAccounts);
  target.settlementLedger = structuredClone(next.settlementLedger);
  target.paymentInRecords = structuredClone(next.paymentInRecords);
  target.paymentOutRecords = structuredClone(next.paymentOutRecords);
  target.accountTransfers = structuredClone(next.accountTransfers);
  target.assemblyOperations = structuredClone(next.assemblyOperations || []);
  target.currentRole = next.currentRole;
  target.customPermissions = structuredClone(next.customPermissions);
  target.systemUsers = structuredClone(next.systemUsers || initialSystemUsers);
  target.currentUserId = next.currentUserId;
}

function nowStamp() {
  return new Date().toISOString().replace("T", " ").substring(0, 16);
}

function dateKey() {
  return new Date().toISOString().split("T")[0].replace(/-/g, "");
}

// Monotonic per-process counter so that ids generated within the same millisecond
// never collide. `Date.now()` alone is unsafe as a primary key under fast/batch writes.
let idCounter = 0;
function genId(prefix: string) {
  idCounter = (idCounter + 1) % 0xffffff;
  return `${prefix}-${Date.now().toString(36)}-${idCounter.toString(36)}`;
}

export function createStoreActions(state: AppState) {
  state.customPermissions = normalizePermissions(state.customPermissions);
  const permissionKeys: Array<keyof Omit<PermissionSettings, "role">> = [
    "showCost",
    "showProfit",
    "canDelete",
    "canEditHistory",
    "allowedMenus",
  ];

  const addLog = (user: string, module: string, type: string, target: string, beforeVal?: string, afterVal?: string) => {
    const newLog: AuditLog = {
      id: `L-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
      user,
      time: nowStamp(),
      module,
      type,
      target,
      beforeVal,
      afterVal,
    };
    state.logs = [newLog, ...state.logs];
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
      throw new Error(`SN已存在: ${trimmed}`);
    }
  };

  // Next document sequence for a given prefix, derived from the max existing number for today
  // rather than array length, so deleting a document never causes a duplicate number.
  const nextDailySeq = (docs: Array<{ invoiceNo: string }>, prefix: string) => {
    const head = `${prefix}-${dateKey()}-`;
    const max = docs.reduce((acc, doc) => {
      if (!doc.invoiceNo?.startsWith(head)) return acc;
      const n = Number(doc.invoiceNo.slice(head.length));
      return Number.isFinite(n) ? Math.max(acc, n) : acc;
    }, 0);
    return String(max + 1).padStart(3, "0");
  };

  const findSettlementAccount = (accountId: string) => {
    const account = state.settlementAccounts.find((item) => item.id === accountId);
    if (!account) throw new Error(`结算账户不存在: ${accountId}`);
    if (!account.enabled) throw new Error(`结算账户已停用: ${account.name}`);
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
      id: `LS-${Date.now()}-${Math.random().toString(16).slice(2, 6)}`,
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
    const beforeBalance = account.balance;
    const signedAmount = movement.direction === "收入" || movement.direction === "转入" ? movement.amount : -movement.amount;
    const afterBalance = beforeBalance + signedAmount;
    const time = movement.time || nowStamp();
    const ledger: SettlementLedger = {
      id: `SL-${Date.now()}-${Math.random().toString(16).slice(2, 6)}`,
      accountId: account.id,
      accountName: account.name,
      accountType: account.type,
      direction: movement.direction,
      incomeAmount: signedAmount > 0 ? movement.amount : 0,
      expenseAmount: signedAmount < 0 ? movement.amount : 0,
      changeAmount: signedAmount,
      beforeBalance,
      afterBalance,
      businessType: movement.businessType,
      relatedDocType: movement.relatedDocType,
      relatedDocNo: movement.relatedDocNo,
      customerName: movement.customerName,
      supplierName: movement.supplierName,
      handler: movement.handler,
      createdBy: movement.createdBy || state.currentRole,
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
    return ledger;
  };

  const createSettlementAccount = (account: Omit<SettlementAccount, "id" | "lastChangeTime"> & { id?: string }) => {
    if (!account.name?.trim()) throw new Error("结算账户名称不能为空");
    const newAccount: SettlementAccount = {
      ...account,
      id: account.id || `SA-${Date.now()}-${Math.random().toString(16).slice(2, 6)}`,
      balance: Number(account.balance || 0),
      availableBalance: Number(account.availableBalance ?? account.balance ?? 0),
      frozenAmount: Number(account.frozenAmount || 0),
      enabled: account.enabled ?? true,
      allowNegative: account.allowNegative ?? true,
      lastChangeTime: nowStamp(),
    };
    state.settlementAccounts = [newAccount, ...state.settlementAccounts];
    addLog(`${state.currentRole} (系统)`, "结算账户", "新增结算账户", newAccount.name, undefined, `类型: ${newAccount.type}, 余额: ${newAccount.balance}元`);
    return newAccount;
  };

  const createPaymentIn = (payment: Omit<PaymentInRecord, "id" | "accountName">, options?: { skipInvoiceUpdate?: boolean }) => {
    if (payment.amount <= 0) throw new Error("收款金额必须大于 0");
    const account = findSettlementAccount(payment.accountId);
    const record: PaymentInRecord = {
      ...payment,
      id: `SK-${Date.now()}-${Math.random().toString(16).slice(2, 6)}`,
      accountName: account.name,
      time: payment.time || nowStamp(),
    };
    state.paymentInRecords = [record, ...state.paymentInRecords];
    recordSettlementMovement({
      accountId: account.id,
      direction: "收入",
      amount: payment.amount,
      businessType: "销售收款",
      relatedDocType: payment.relatedDocType,
      relatedDocNo: payment.relatedDocNo,
      customerName: payment.customerName,
      handler: payment.handler,
      time: record.time,
      remarks: payment.remarks,
    });
    createFinanceLedgerForSettlement({
      relatedId: payment.relatedDocNo || record.id,
      type: "销售收入",
      paymentWay: payment.paymentMethod,
      amount: payment.amount,
      operator: payment.handler,
      settlementAccountId: account.id,
      settlementAccountName: account.name,
      relatedDocType: payment.relatedDocType,
      customerName: payment.customerName,
      time: record.time,
    });
    if (!options?.skipInvoiceUpdate && payment.relatedDocNo) {
      let invoiceUnpaidBeforePayment = 0;
      state.salesInvoices = state.salesInvoices.map((invoice) => {
        if (invoice.invoiceNo !== payment.relatedDocNo && invoice.id !== payment.relatedDocNo) return invoice;
        invoiceUnpaidBeforePayment = invoice.unpaidAmount;
        const paidAmount = Math.min(invoice.totalAmount, invoice.paidAmount + payment.amount);
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
      const debtReduction = Math.min(invoiceUnpaidBeforePayment, payment.amount);
      state.customers = state.customers.map((customer) =>
        customer.name === payment.customerName
          ? { ...customer, debtBalance: Math.max(0, (customer.debtBalance || 0) - debtReduction) }
          : customer,
      );
    }
    addLog(`${state.currentRole} (系统)`, "结算账户", "新增收款单", record.id, undefined, `账户: ${account.name}, 金额: ${payment.amount}元, 经办人: ${payment.handler}`);
    return record;
  };

  const updatePaymentIn = (id: string, payment: Partial<PaymentInRecord>) => {
    const existing = state.paymentInRecords.find((item) => item.id === id);
    if (!existing) throw new Error(`收款单不存在: ${id}`);
    const nextAccount = findSettlementAccount(payment.accountId || existing.accountId);
    const updated: PaymentInRecord = {
      ...existing,
      ...payment,
      id,
      accountId: nextAccount.id,
      accountName: nextAccount.name,
      amount: Number(payment.amount ?? existing.amount),
      time: payment.time || existing.time,
    };
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
      const sameOldMovement = item.accountId === existing.accountId && item.handler === existing.handler && item.time === existing.time && item.incomeAmount === existing.amount;
      if (!sameOldMovement) return item;
      const account = state.settlementAccounts.find((acc) => acc.id === updated.accountId) || nextAccount;
      return {
        ...item,
        accountId: updated.accountId,
        accountName: account.name,
        accountType: account.type,
        incomeAmount: updated.amount,
        changeAmount: updated.amount,
        businessType: "销售收款",
        relatedDocType: updated.relatedDocType,
        relatedDocNo: updated.relatedDocNo,
        customerName: updated.customerName,
        handler: updated.handler,
        time: updated.time,
        remarks: updated.remarks,
      };
    });
    state.financeLedger = state.financeLedger.map((item) => {
      const sameOldMovement = item.settlementAccountId === existing.accountId && item.handler === existing.handler && item.time === existing.time && item.amount === existing.amount;
      if (!sameOldMovement) return item;
      return {
        ...item,
        relatedId: updated.relatedDocNo || updated.id,
        paymentWay: updated.paymentMethod,
        amount: updated.amount,
        operator: updated.handler,
        handler: updated.handler,
        settlementAccountId: updated.accountId,
        settlementAccountName: updated.accountName,
        relatedDocType: updated.relatedDocType,
        customerName: updated.customerName,
        time: updated.time,
      };
    });
    addLog(`${state.currentRole} (系统)`, "结算账户", "编辑收款单", id, `${existing.amount}元`, `${updated.amount}元`);
    return updated;
  };

  const deletePaymentIn = (id: string, options?: { skipInvoiceUpdate?: boolean }) => {
    const existing = state.paymentInRecords.find((item) => item.id === id);
    if (!existing) throw new Error(`收款单不存在: ${id}`);
    adjustSettlementBalance(existing.accountId, -existing.amount);
    state.paymentInRecords = state.paymentInRecords.filter((item) => item.id !== id);
    state.settlementLedger = state.settlementLedger.filter((item) => {
      const sameMovement = item.accountId === existing.accountId && item.handler === existing.handler && item.time === existing.time && item.incomeAmount === existing.amount;
      return !sameMovement;
    });
    state.financeLedger = state.financeLedger.filter((item) => {
      const sameMovement = item.settlementAccountId === existing.accountId && item.handler === existing.handler && item.time === existing.time && item.amount === existing.amount;
      return !sameMovement;
    });
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
        state.customers = state.customers.map((customer) =>
          customer.name === existing.customerName ? { ...customer, debtBalance: (customer.debtBalance || 0) + restoredDebt } : customer,
        );
      }
    }
    addLog(`${state.currentRole} (系统)`, "结算账户", "删除收款单", id, `${existing.amount}元`, "已反向修正账户余额");
    return existing;
  };

  const createPaymentOut = (payment: Omit<PaymentOutRecord, "id" | "accountName">, options?: { skipInvoiceUpdate?: boolean }) => {
    if (payment.amount <= 0) throw new Error("付款金额必须大于 0");
    const account = findSettlementAccount(payment.accountId);
    const record: PaymentOutRecord = {
      ...payment,
      id: `FK-${Date.now()}-${Math.random().toString(16).slice(2, 6)}`,
      accountName: account.name,
      time: payment.time || nowStamp(),
    };
    state.paymentOutRecords = [record, ...state.paymentOutRecords];
    recordSettlementMovement({
      accountId: account.id,
      direction: "支出",
      amount: payment.amount,
      businessType: payment.businessType,
      relatedDocType: payment.relatedDocType,
      relatedDocNo: payment.relatedDocNo,
      customerName: payment.customerName,
      supplierName: payment.supplierName,
      handler: payment.handler,
      time: record.time,
      remarks: payment.remarks,
    });
    createFinanceLedgerForSettlement({
      relatedId: payment.relatedDocNo || record.id,
      type: payment.businessType,
      paymentWay: payment.paymentMethod,
      amount: -payment.amount,
      operator: payment.handler,
      settlementAccountId: account.id,
      settlementAccountName: account.name,
      relatedDocType: payment.relatedDocType,
      customerName: payment.customerName,
      supplierName: payment.supplierName,
      time: record.time,
    });
    if (!options?.skipInvoiceUpdate && payment.relatedDocNo) {
      let invoiceUnpaidBeforePayment = 0;
      state.purchaseInvoices = state.purchaseInvoices.map((invoice) => {
        if (invoice.invoiceNo !== payment.relatedDocNo && invoice.id !== payment.relatedDocNo) return invoice;
        invoiceUnpaidBeforePayment = invoice.unpaidAmount;
        const paidAmount = Math.min(invoice.totalCost, invoice.paidAmount + payment.amount);
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
      const payableReduction = Math.min(invoiceUnpaidBeforePayment, payment.amount);
      if (payment.supplierName) {
        state.vendors = state.vendors.map((vendor) =>
          vendor.name === payment.supplierName
            ? {
                ...vendor,
                accountPayable: Math.max(0, vendor.accountPayable - payableReduction),
                accountPaid: vendor.accountPaid + payment.amount,
              }
            : vendor,
        );
      }
    }
    addLog(`${state.currentRole} (系统)`, "结算账户", "新增付款单", record.id, undefined, `账户: ${account.name}, 金额: ${payment.amount}元, 经办人: ${payment.handler}`);
    return record;
  };

  const updatePaymentOut = (id: string, payment: Partial<PaymentOutRecord>) => {
    const existing = state.paymentOutRecords.find((item) => item.id === id);
    if (!existing) throw new Error(`付款单不存在: ${id}`);
    const nextAccount = findSettlementAccount(payment.accountId || existing.accountId);
    const updated: PaymentOutRecord = {
      ...existing,
      ...payment,
      id,
      accountId: nextAccount.id,
      accountName: nextAccount.name,
      amount: Number(payment.amount ?? existing.amount),
      time: payment.time || existing.time,
      businessType: payment.businessType || existing.businessType,
    };
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
      const sameOldMovement = item.accountId === existing.accountId && item.handler === existing.handler && item.time === existing.time && item.expenseAmount === existing.amount;
      if (!sameOldMovement) return item;
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
      const sameOldMovement = item.settlementAccountId === existing.accountId && item.handler === existing.handler && item.time === existing.time && item.amount === -existing.amount;
      if (!sameOldMovement) return item;
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
    addLog(`${state.currentRole} (系统)`, "结算账户", "编辑付款单", id, `${existing.amount}元`, `${updated.amount}元`);
    return updated;
  };

  const deletePaymentOut = (id: string, options?: { skipInvoiceUpdate?: boolean }) => {
    const existing = state.paymentOutRecords.find((item) => item.id === id);
    if (!existing) throw new Error(`付款单不存在: ${id}`);
    adjustSettlementBalance(existing.accountId, existing.amount);
    state.paymentOutRecords = state.paymentOutRecords.filter((item) => item.id !== id);
    state.settlementLedger = state.settlementLedger.filter((item) => {
      const sameMovement = item.accountId === existing.accountId && item.handler === existing.handler && item.time === existing.time && item.expenseAmount === existing.amount;
      return !sameMovement;
    });
    state.financeLedger = state.financeLedger.filter((item) => {
      const sameMovement = item.settlementAccountId === existing.accountId && item.handler === existing.handler && item.time === existing.time && item.amount === -existing.amount;
      return !sameMovement;
    });
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
      if (existing.supplierName) {
        state.vendors = state.vendors.map((vendor) =>
          vendor.name === existing.supplierName
            ? {
                ...vendor,
                accountPayable: vendor.accountPayable + Math.max(0, restoredPayable),
                accountPaid: Math.max(0, vendor.accountPaid - existing.amount),
              }
            : vendor,
        );
      }
    }
    addLog(`${state.currentRole} (系统)`, "结算账户", "删除付款单", id, `${existing.amount}元`, "已反向修正账户余额");
    return existing;
  };

  const createAccountTransfer = (transfer: Omit<AccountTransferRecord, "id" | "fromAccountName" | "toAccountName">) => {
    if (transfer.amount <= 0) throw new Error("调拨金额必须大于 0");
    const from = findSettlementAccount(transfer.fromAccountId);
    const to = findSettlementAccount(transfer.toAccountId);
    if (from.id === to.id) throw new Error("转出账户和转入账户不能相同");
    const record: AccountTransferRecord = {
      ...transfer,
      id: `DB-${Date.now()}-${Math.random().toString(16).slice(2, 6)}`,
      fromAccountName: from.name,
      toAccountName: to.name,
      time: transfer.time || nowStamp(),
    };
    state.accountTransfers = [record, ...state.accountTransfers];
    recordSettlementMovement({
      accountId: from.id,
      direction: "转出",
      amount: transfer.amount + transfer.fee,
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
      amount: transfer.receivedAmount,
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
      amount: -transfer.fee,
      operator: transfer.handler,
      settlementAccountId: from.id,
      settlementAccountName: from.name,
      relatedDocType: "资金调拨",
      time: record.time,
    });
    addLog(`${state.currentRole} (系统)`, "结算账户", "资金调拨", record.id, undefined, `${from.name} -> ${to.name}, ${transfer.amount}元`);
    return record;
  };

  const updateAccountTransfer = (id: string, transfer: Partial<AccountTransferRecord>) => {
    const existing = state.accountTransfers.find((item) => item.id === id);
    if (!existing) throw new Error(`资金调拨单不存在: ${id}`);
    const from = findSettlementAccount(transfer.fromAccountId || existing.fromAccountId);
    const to = findSettlementAccount(transfer.toAccountId || existing.toAccountId);
    if (from.id === to.id) throw new Error("转出账户和转入账户不能相同");
    const updated: AccountTransferRecord = {
      ...existing,
      ...transfer,
      id,
      fromAccountId: from.id,
      fromAccountName: from.name,
      toAccountId: to.id,
      toAccountName: to.name,
      amount: Number(transfer.amount ?? existing.amount),
      fee: Number(transfer.fee ?? existing.fee),
      receivedAmount: Number(transfer.receivedAmount ?? Math.max(0, Number(transfer.amount ?? existing.amount) - Number(transfer.fee ?? existing.fee))),
      time: transfer.time || existing.time,
    };
    state.settlementAccounts = state.settlementAccounts.map((account) => {
      if (account.id === existing.fromAccountId) {
        const balance = account.balance + existing.amount + existing.fee;
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
        const balance = account.balance - updated.amount - updated.fee;
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
        return { ...item, accountId: from.id, accountName: from.name, accountType: from.type, expenseAmount: updated.amount + updated.fee, changeAmount: -(updated.amount + updated.fee), handler: updated.handler, time: updated.time, remarks: updated.remarks };
      }
      if (item.direction === "转入") {
        return { ...item, accountId: to.id, accountName: to.name, accountType: to.type, incomeAmount: updated.receivedAmount, changeAmount: updated.receivedAmount, handler: updated.handler, time: updated.time, remarks: updated.remarks };
      }
      return item;
    });
    state.financeLedger = state.financeLedger.map((item) => item.relatedId === id ? { ...item, paymentWay: `${from.name} -> ${to.name}`, amount: -updated.fee, operator: updated.handler, handler: updated.handler, settlementAccountId: from.id, settlementAccountName: from.name, time: updated.time } : item);
    addLog(`${state.currentRole} (系统)`, "结算账户", "编辑资金调拨", id, `${existing.amount}元`, `${updated.amount}元`);
    return updated;
  };

  const deleteAccountTransfer = (id: string) => {
    const existing = state.accountTransfers.find((item) => item.id === id);
    if (!existing) throw new Error(`资金调拨单不存在: ${id}`);
    adjustSettlementBalance(existing.fromAccountId, existing.amount + existing.fee);
    adjustSettlementBalance(existing.toAccountId, -existing.receivedAmount);
    state.accountTransfers = state.accountTransfers.filter((item) => item.id !== id);
    state.settlementLedger = state.settlementLedger.filter((item) => item.relatedDocNo !== id);
    state.financeLedger = state.financeLedger.filter((item) => item.relatedId !== id);
    addLog(`${state.currentRole} (系统)`, "结算账户", "删除资金调拨", id, `${existing.amount}元`, "已反向修正账户余额和流水");
    return existing;
  };

  const addProductTemplate = (product: Omit<ProductTemplate, "id" | "currentStock">) => {
    const newProduct: ProductTemplate = {
      ...product,
      id: `SP-${String(state.products.length + 1).padStart(3, "0")}`,
      currentStock: 0,
    };
    state.products = [newProduct, ...state.products];
    addLog(`${state.currentRole} (系统)`, "商品库", "添加商品模板", newProduct.name, undefined, `名: ${newProduct.name}, 型号: ${newProduct.model}`);
    return newProduct;
  };

  const updateProductTemplate = (updated: ProductTemplate) => {
    const existing = state.products.find((product) => product.id === updated.id);
    if (!existing) {
      throw new Error(`商品模板不存在: ${updated.id}`);
    }
    state.products = state.products.map((product) => (product.id === updated.id ? updated : product));
    addLog(`${state.currentRole} (系统)`, "商品库", "修改商品模板", updated.name);
    return updated;
  };

  const deleteProductTemplate = (id: string) => {
    const product = state.products.find((item) => item.id === id);
    if (!product) return null;
    state.products = state.products.filter((item) => item.id !== id);
    addLog(`${state.currentRole} (系统)`, "商品库", "删除商品模板", product.name);
    return product;
  };

  const createPurchaseInvoice = (invoice: Omit<PurchaseInvoice, "id" | "invoiceNo" | "totalCount" | "totalCost" | "estTotalSell" | "estTotalProfit">) => {
    // Reject duplicate SNs early: both against existing inventory and within this invoice batch.
    const seenSn = new Set<string>();
    for (const item of invoice.items) {
      const sn = item.sn?.trim();
      if (!sn) continue;
      const key = sn.toLowerCase();
      if (seenSn.has(key)) throw new Error(`同一进货单内SN重复: ${sn}`);
      seenSn.add(key);
      assertSnUnique(sn);
    }
    const seq = nextDailySeq(state.purchaseInvoices, "JH");
    const invoiceNo = `JH-${dateKey()}-${seq}`;
    const totalCount = invoice.items.length;
    const totalCost = invoice.items.reduce((sum, item) => sum + item.buyPrice, 0);
    const estTotalSell = invoice.items.reduce((sum, item) => sum + item.estSellPrice, 0);
    const estTotalProfit = estTotalSell - totalCost;
    const newInvoice: PurchaseInvoice = {
      ...invoice,
      id: genId("CG"),
      invoiceNo,
      totalCount,
      totalCost,
      estTotalSell,
      estTotalProfit,
      paymentStatus: invoice.unpaidAmount <= 0 ? "已付款" : invoice.paidAmount > 0 ? "部分付款" : "未付款",
    };

    const newStockItems: CardInventory[] = invoice.items.map((item, index) => {
      const template = state.products.find((product) => product.id === item.productId);
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
        expressNo: invoice.expressNo?.trim() || undefined,
        sourceType: invoice.sourceType,
        supplierName: invoice.supplierName,
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
        entryTime: invoice.date,
        storageDays: 0,
        remarks: [
          item.remarks,
          `进货单:${invoiceNo}`,
          invoice.expressNo ? `快递单号:${invoice.expressNo}` : "",
          isGpu ? "显卡待检测入库" : "其他配件待检测入库",
        ].filter(Boolean).join("；"),
      };
    });

    state.products = state.products.map((product) => {
      const matchingItems = newStockItems.filter((item) => item.productId === product.id);
      return {
        ...product,
        currentStock: product.currentStock + matchingItems.length,
        lastBuyPrice: matchingItems.at(-1)?.costPrice ?? product.lastBuyPrice,
        lastDealTime: matchingItems.length ? invoice.date : product.lastDealTime,
      };
    });
    state.purchaseInvoices = [newInvoice, ...state.purchaseInvoices];
    state.inventory = [...newStockItems, ...state.inventory];

    if (["个人回收", "客户置换"].includes(invoice.sourceType)) {
      const customer = state.customers.find((item) => item.name.trim() === invoice.supplierName.trim());
      if (customer) {
        state.customers = state.customers.map((item) =>
          item.id === customer.id
            ? {
                ...item,
                type: item.type === "个人买家客户" ? item.type : "个人卖家客户",
                totalAmount: item.totalAmount + totalCost,
                recycleCount: item.recycleCount + totalCount,
                debtBalance: (item.debtBalance || 0) + invoice.unpaidAmount,
                lastDealTime: invoice.date,
              }
            : item,
        );
      } else {
        state.customers = [
          ...state.customers,
          {
            id: genId("KH"),
            name: invoice.supplierName,
            phone: invoice.contact,
            wechat: `${invoice.supplierName}_wx`,
            source: invoice.sourceType,
            firstChannel: invoice.sourceType,
            type: "个人卖家客户",
            lastDealTime: invoice.date,
            totalAmount: totalCost,
            totalProfit: estTotalProfit,
            buyCount: 0,
            recycleCount: totalCount,
            aftersalesCount: 0,
            debtBalance: invoice.unpaidAmount,
            tags: ["个人卖家"],
            remarks: "进货单自动创建",
          },
        ];
      }
    } else {
      const vendor = state.vendors.find((item) => item.name.trim() === invoice.supplierName.trim());
      if (vendor) {
        state.vendors = state.vendors.map((item) =>
          item.id === vendor.id
            ? {
                ...item,
                partnerCategory: "同行",
                type: item.type || "收货同行",
                totalBuyAmount: item.totalBuyAmount + totalCost,
                totalCount: item.totalCount + totalCount,
                accountPayable: item.accountPayable + invoice.unpaidAmount,
                accountPaid: item.accountPaid + invoice.paidAmount,
                lastDealTime: invoice.date,
              }
            : item,
        );
      } else {
        state.vendors = [
          ...state.vendors,
          {
            id: genId("GY"),
            name: invoice.supplierName,
            partnerCategory: "同行",
            contactPerson: "业务联系人",
            phone: invoice.contact,
            type: "收货同行",
            totalBuyAmount: totalCost,
            totalCount,
            avgProfit: estTotalProfit / (totalCount || 1),
            aftersalesCount: 0,
            aftersalesRate: 0,
            lastDealTime: invoice.date,
            accountPayable: invoice.unpaidAmount,
            accountPaid: invoice.paidAmount,
            remarks: "通过录入进货单自动新建",
          },
        ];
      }
    }

    addLog(
      `${state.currentRole} (系统)`,
      "采购回收",
      "录入进货单",
      invoiceNo,
      undefined,
      `金额: ${totalCost}元, 生成 ${newStockItems.filter((item) => (item.category || "显卡") === "显卡").length} 张显卡待检档案，${newStockItems.filter((item) => (item.category || "显卡") !== "显卡").length} 件配件待检档案`,
    );
    if (invoice.settlementAccountId && invoice.paidAmount > 0) {
      createPaymentOut({
        supplierName: invoice.supplierName,
        accountId: invoice.settlementAccountId,
        amount: invoice.paidAmount,
        handler: invoice.paymentHandler || invoice.handleBy,
        paymentMethod: invoice.paymentMethod,
        businessType: "采购付款",
        relatedDocType: "采购单",
        relatedDocNo: invoiceNo,
        time: nowStamp(),
        remarks: invoice.remarks,
      }, { skipInvoiceUpdate: true });
    } else {
      state.financeLedger = [
        {
          id: genId("LS"),
          time: nowStamp(),
          relatedId: invoiceNo,
          type: "进货支出",
          paymentWay: invoice.paymentMethod,
          amount: -totalCost,
          operator: state.currentRole,
          status: "已复核",
        },
        ...state.financeLedger,
      ];
    }
    return newInvoice;
  };

  const updatePurchaseInvoice = (id: string, updates: Partial<PurchaseInvoice>) => {
    const existing = state.purchaseInvoices.find((item) => item.id === id || item.invoiceNo === id);
    if (!existing) throw new Error(`进货单不存在: ${id}`);
    const items = updates.items || existing.items;
    const totalCount = items.length;
    const totalCost = items.reduce((sum, item) => sum + item.buyPrice, 0);
    const estTotalSell = items.reduce((sum, item) => sum + item.estSellPrice, 0);
    const estTotalProfit = estTotalSell - totalCost;
    const paidAmount = Number(updates.paidAmount ?? existing.paidAmount);
    const unpaidAmount = Number(updates.unpaidAmount ?? Math.max(0, totalCost - paidAmount));
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
      paidAmount,
      unpaidAmount,
      isPaid: unpaidAmount <= 0,
      paymentStatus: unpaidAmount <= 0 ? "已付款" : paidAmount > 0 ? "部分付款" : "未付款",
    };
    state.purchaseInvoices = state.purchaseInvoices.map((item) => (item.id === existing.id ? updated : item));
    addLog(`${state.currentRole} (系统)`, "采购回收", "编辑进货单", existing.invoiceNo, `${existing.totalCost}元`, `${updated.totalCost}元`);
    return updated;
  };

  const deletePurchaseInvoice = (id: string) => {
    const existing = state.purchaseInvoices.find((item) => item.id === id || item.invoiceNo === id);
    if (!existing) throw new Error(`进货单不存在: ${id}`);
    const relatedCards = state.inventory.filter((card) => card.remarks?.includes(`进货单:${existing.invoiceNo}`));
    const hasInboundOrInspection = relatedCards.some((card) => card.status !== "待检测") ||
      state.inspections.some((inspection) => relatedCards.some((card) => card.id === inspection.inventoryId));
    if (hasInboundOrInspection) {
      throw new Error("进货单已入库或已检测，不能删除");
    }

    state.paymentOutRecords
      .filter((payment) => payment.relatedDocNo === existing.invoiceNo || payment.relatedDocNo === existing.id)
      .forEach((payment) => deletePaymentOut(payment.id, { skipInvoiceUpdate: true }));

    const removedProductCounts = new Map<string, number>();
    relatedCards.forEach((card) => removedProductCounts.set(card.productId, (removedProductCounts.get(card.productId) || 0) + 1));
    state.inventory = state.inventory.filter((card) => !relatedCards.some((related) => related.id === card.id));
    state.products = state.products.map((product) => {
      const removedCount = removedProductCounts.get(product.id) || 0;
      return removedCount ? { ...product, currentStock: Math.max(0, product.currentStock - removedCount) } : product;
    });
    state.purchaseInvoices = state.purchaseInvoices.filter((item) => item.id !== existing.id);
    state.financeLedger = state.financeLedger.filter((item) => item.relatedId !== existing.invoiceNo && item.relatedId !== existing.id);

    if (["个人回收", "客户置换"].includes(existing.sourceType)) {
      state.customers = state.customers.map((customer) =>
        customer.name === existing.supplierName
          ? {
              ...customer,
              totalAmount: Math.max(0, customer.totalAmount - existing.totalCost),
              recycleCount: Math.max(0, customer.recycleCount - existing.totalCount),
              debtBalance: Math.max(0, (customer.debtBalance || 0) - existing.unpaidAmount),
            }
          : customer,
      );
    } else {
      state.vendors = state.vendors.map((vendor) =>
        vendor.name === existing.supplierName
          ? {
              ...vendor,
              totalBuyAmount: Math.max(0, vendor.totalBuyAmount - existing.totalCost),
              totalCount: Math.max(0, vendor.totalCount - existing.totalCount),
              accountPayable: Math.max(0, vendor.accountPayable - existing.unpaidAmount),
              accountPaid: Math.max(0, vendor.accountPaid - existing.paidAmount),
            }
          : vendor,
      );
    }
    addLog(`${state.currentRole} (系统)`, "采购回收", "删除进货单", existing.invoiceNo, `${existing.totalCost}元`, "已删除待检测库存和相关流水");
    return existing;
  };

  const submitInspection = (report: Omit<InspectionRecord, "id" | "inspectTime">) => {
    const sn = report.sn.trim();
    if (!sn) {
      throw new Error("检测入库必须录入SN");
    }
    const targetCard = state.inventory.find((card) => card.id === report.inventoryId);
    if (!targetCard) {
      throw new Error(`库存档案不存在: ${report.inventoryId}`);
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
      `${state.currentRole} (系统)`,
      "测试质检",
      "提交检测单",
      `序列号: ${report.sn}`,
      "状态: 待检测",
      isGpuInspection ? `质检状态: ${report.resultStatus}` : `其他配件简易检测完成，成色: ${report.condition || targetCard.condition}`,
    );
    return newReport;
  };

  const createSalesInvoice = (invoice: Omit<SalesInvoice, "id" | "invoiceNo" | "totalCount" | "totalCost" | "totalAmount" | "totalProfit">) => {
    const seenInventoryIds = new Set<string>();
    for (const item of invoice.items) {
      if (seenInventoryIds.has(item.inventoryId)) {
        throw new Error(`重复选择库存卡: ${item.inventoryId}`);
      }
      seenInventoryIds.add(item.inventoryId);
      const card = state.inventory.find((inventoryItem) => inventoryItem.id === item.inventoryId);
      if (!card) {
        throw new Error(`库存卡不存在: ${item.inventoryId}`);
      }
      if (!["已入库", "已上架"].includes(card.status)) {
        throw new Error(`库存卡不可销售: ${item.inventoryId} 当前状态为 ${card.status}`);
      }
    }

    const seq = nextDailySeq(state.salesInvoices, "XS");
    const invoiceNo = `XS-${dateKey()}-${seq}`;
    // Gross profit must be based on the authoritative cost recorded on the inventory card,
    // never on a client-supplied costPrice (a seller without showCost permission may send 0).
    const items = invoice.items.map((item) => {
      const card = state.inventory.find((inventoryItem) => inventoryItem.id === item.inventoryId)!;
      const costPrice = card.costPrice;
      return { ...item, costPrice, profit: item.sellPrice - costPrice };
    });
    const totalCount = items.length;
    const totalCost = items.reduce((sum, item) => sum + item.costPrice, 0);
    const totalAmount = items.reduce((sum, item) => sum + item.sellPrice, 0);
    const totalProfit = totalAmount - totalCost;
    const newInvoice: SalesInvoice = {
      ...invoice,
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
    const chosenIds = new Set(items.map((item) => item.inventoryId));

    state.inventory = state.inventory.map((card) => {
      if (!chosenIds.has(card.id)) return card;
      const match = invoice.items.find((item) => item.inventoryId === card.id);
      return { ...card, status: "已锁定", salesPrice: match?.sellPrice, salesInvoiceId: invoiceNo, buyerName: invoice.customerName };
    });
    state.salesInvoices = [newInvoice, ...state.salesInvoices];

    const customer = state.customers.find((item) => item.name.trim() === invoice.customerName.trim());
    if (customer) {
      state.customers = state.customers.map((item) =>
        item.id === customer.id
          ? { ...item, totalAmount: item.totalAmount + totalAmount, totalProfit: item.totalProfit + totalProfit, buyCount: item.buyCount + totalCount, lastDealTime: invoice.date, debtBalance: (item.debtBalance || 0) + invoice.unpaidAmount }
          : item,
      );
    } else {
      state.customers = [
        ...state.customers,
        {
          id: genId("KH"),
          name: invoice.customerName,
          phone: invoice.contact,
          wechat: `${invoice.customerName}_wx`,
          source: invoice.channel,
          type: "个人买家客户",
          lastDealTime: invoice.date,
          totalAmount,
          totalProfit,
          buyCount: totalCount,
          recycleCount: 0,
          aftersalesCount: 0,
          debtBalance: invoice.unpaidAmount,
          tags: ["首单客户"],
          remarks: "销售开单时自动创建",
        },
      ];
    }

    addLog(`${state.currentRole} (系统)`, "销售管理", "创建销售单", invoiceNo, undefined, `数量: ${totalCount} 件, 金额: ${totalAmount}元，库存已锁定待出库`);
    if (invoice.settlementAccountId && invoice.paidAmount > 0) {
      createPaymentIn({
        customerName: invoice.customerName,
        accountId: invoice.settlementAccountId,
        amount: invoice.paidAmount,
        handler: invoice.paymentHandler || invoice.handleBy,
        paymentMethod: invoice.paymentMethod,
        relatedDocType: "销售单",
        relatedDocNo: invoiceNo,
        time: nowStamp(),
        remarks: invoice.remarks,
      }, { skipInvoiceUpdate: true });
    } else {
      state.financeLedger = [
        { id: genId("LS"), time: nowStamp(), relatedId: invoiceNo, type: "销售收入", paymentWay: invoice.paymentMethod, amount: totalAmount, operator: state.currentRole, status: "已复核" },
        ...state.financeLedger,
      ];
    }
    return newInvoice;
  };

  const updateSalesInvoice = (id: string, updates: Partial<SalesInvoice>) => {
    const existing = state.salesInvoices.find((item) => item.id === id || item.invoiceNo === id);
    if (!existing) throw new Error(`销售单不存在: ${id}`);
    // Re-derive cost from the inventory card when it still exists; keep per-item profit consistent.
    const items = (updates.items || existing.items).map((item) => {
      const card = state.inventory.find((inventoryItem) => inventoryItem.id === item.inventoryId);
      const costPrice = card ? card.costPrice : item.costPrice;
      return { ...item, costPrice, profit: item.sellPrice - costPrice };
    });
    const totalCount = items.length;
    const totalCost = items.reduce((sum, item) => sum + item.costPrice, 0);
    const totalAmount = items.reduce((sum, item) => sum + item.sellPrice, 0);
    const totalProfit = totalAmount - totalCost;
    const paidAmount = Number(updates.paidAmount ?? existing.paidAmount);
    const unpaidAmount = Number(updates.unpaidAmount ?? Math.max(0, totalAmount - paidAmount));
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
    state.salesInvoices = state.salesInvoices.map((item) => (item.id === existing.id ? updated : item));
    state.inventory = state.inventory.map((card) => card.salesInvoiceId === existing.invoiceNo ? { ...card, buyerName: updated.customerName, salesTime: updated.date } : card);
    addLog(`${state.currentRole} (系统)`, "销售管理", "编辑销售单", existing.invoiceNo, `${existing.totalAmount}元`, `${updated.totalAmount}元`);
    return updated;
  };

  const deleteSalesInvoice = (id: string) => {
    const existing = state.salesInvoices.find((item) => item.id === id || item.invoiceNo === id);
    if (!existing) throw new Error(`销售单不存在: ${id}`);
    const chosenIds = new Set(existing.items.map((item) => item.inventoryId));
    const hasOutbound = existing.outboundStatus === "已出库" ||
      state.inventory.some((card) => chosenIds.has(card.id) && card.status === "已售出" && card.salesInvoiceId === existing.invoiceNo);
    if (hasOutbound) {
      throw new Error("销售单已出库，不能删除");
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
    state.customers = state.customers.map((customer) =>
      customer.name === existing.customerName
        ? {
            ...customer,
            totalAmount: Math.max(0, customer.totalAmount - existing.totalAmount),
            totalProfit: Math.max(0, customer.totalProfit - existing.totalProfit),
            buyCount: Math.max(0, customer.buyCount - existing.totalCount),
            debtBalance: Math.max(0, (customer.debtBalance || 0) - existing.unpaidAmount),
          }
        : customer,
    );
    addLog(`${state.currentRole} (系统)`, "销售管理", "删除销售单", existing.invoiceNo, `${existing.totalAmount}元`, "库存已解除锁定");
    return existing;
  };

  const confirmSalesOutbound = (
    id: string,
    input: { handler: string; codes?: string[]; manual?: boolean; remarks?: string },
  ) => {
    const invoice = state.salesInvoices.find((item) => item.id === id || item.invoiceNo === id);
    if (!invoice) throw new Error(`销售单不存在: ${id}`);
    if (invoice.outboundStatus === "已出库") return invoice;

    const normalizedCodes = Array.from(new Set((input.codes || []).map((code) => code.trim()).filter(Boolean)));
    if (!input.manual) {
      const missingItems = invoice.items.filter((item) => {
        const card = state.inventory.find((inv) => inv.id === item.inventoryId);
        return !normalizedCodes.some((code) =>
          code.toLowerCase() === item.inventoryId.toLowerCase() ||
          code.toLowerCase() === item.sn.toLowerCase() ||
          (!!card?.sn && code.toLowerCase() === card.sn.toLowerCase())
        );
      });
      if (missingItems.length > 0) {
        throw new Error(`还有 ${missingItems.length} 件销售商品未扫码确认`);
      }
    }

    const outboundTime = nowStamp();
    const outboundHandler = input.handler || state.currentRole;
    const chosenIds = new Set(invoice.items.map((item) => item.inventoryId));
    const beforeInventory = state.inventory;

    state.inventory = state.inventory.map((card) => {
      if (!chosenIds.has(card.id)) return card;
      const match = invoice.items.find((item) => item.inventoryId === card.id);
      return {
        ...card,
        status: "已售出",
        salesPrice: match?.sellPrice,
        salesTime: outboundTime.slice(0, 10),
        salesInvoiceId: invoice.invoiceNo,
        buyerName: invoice.customerName,
        remarks: `${card.remarks || ""}${card.remarks ? "；" : ""}${outboundTime} ${outboundHandler} 销售出库确认${input.manual ? "（手动确认）" : "（扫码确认）"}${input.remarks ? `：${input.remarks}` : ""}`,
      };
    });

    state.products = state.products.map((product) => {
      const productSales = invoice.items.filter((item) => beforeInventory.find((card) => card.id === item.inventoryId)?.productId === product.id);
      return {
        ...product,
        currentStock: Math.max(0, product.currentStock - productSales.length),
        lastSellPrice: productSales.at(0)?.sellPrice ?? product.lastSellPrice,
        lastDealTime: productSales.length ? outboundTime.slice(0, 10) : product.lastDealTime,
      };
    });

    const updated: SalesInvoice = {
      ...invoice,
      outboundStatus: "已出库",
      outboundTime,
      outboundHandler,
      outboundRemarks: input.remarks,
    };
    state.salesInvoices = state.salesInvoices.map((item) => (item.id === invoice.id ? updated : item));
    addLog(outboundHandler, "销售出库", input.manual ? "手动确认出库" : "扫码确认出库", invoice.invoiceNo, "待出库", "已出库");
    return updated;
  };

  const addAftersalesClaim = (claim: Omit<AftersalesRecord, "id" | "status" | "createTime">) => {
    const newClaim: AftersalesRecord = { ...claim, id: genId("SH"), status: "待处理", createTime: new Date().toISOString().split("T")[0] };
    state.aftersales = [newClaim, ...state.aftersales];
    state.inventory = state.inventory.map((card) => (card.sn === claim.sn ? { ...card, status: "售后中" } : card));
    state.customers = state.customers.map((customer) =>
      customer.name === claim.customerName ? { ...customer, aftersalesCount: customer.aftersalesCount + 1, tags: Array.from(new Set([...customer.tags, "售后记录"])) } : customer,
    );
    addLog(`${state.currentRole} (系统)`, "售后保障", "新建售后申诉", `SN: ${claim.sn}`, "销售已售", `分类: ${claim.type}, 问题: ${claim.desc.substring(0, 15)}...`);
    return newClaim;
  };

  const updateAftersalesStatus = (id: string, updatedFields: Partial<AftersalesRecord>) => {
    let affectedClaim: AftersalesRecord | undefined;
    state.aftersales = state.aftersales.map((claim) => {
      if (claim.id !== id) return claim;
      affectedClaim = { ...claim, ...updatedFields };
      return affectedClaim;
    });
    if (affectedClaim && updatedFields.status === "已完成") {
      state.inventory = state.inventory.map((card) => (card.sn === affectedClaim?.sn ? { ...card, status: affectedClaim.type === "退货" ? "已入库" : "已上架" } : card));
    }
    addLog(`${state.currentRole} (系统)`, "售后保障", "更新处理状态", `售后单: ${id}`, undefined, `状态变为: ${updatedFields.status || "未更改"}`);
    return affectedClaim ?? null;
  };

  const updateMarketPrice = (quoteId: string, todayBuyPrice: number, todaySellPrice: number, remarks?: string) => {
    let updatedQuote: MarketQuote | undefined;
    state.marketQuotes = state.marketQuotes.map((quote) => {
      if (quote.id !== quoteId) return quote;
      const changeAmount = todayBuyPrice - quote.yestBuyPrice;
      updatedQuote = { ...quote, todayBuyPrice, todaySellPrice, changeAmount, changeRatio: Number(((changeAmount / (quote.yestBuyPrice || 1)) * 100).toFixed(2)), remarks: remarks || quote.remarks };
      return updatedQuote;
    });
    if (updatedQuote) {
      state.inventory = state.inventory.map((card) => (card.productId === updatedQuote?.productId ? { ...card, marketPrice: todayBuyPrice } : card));
      addLog(`${state.currentRole} (系统)`, "价格参考", "更新当日参考价", updatedQuote.productName, `最新回收: ${todayBuyPrice}`, `最新销售: ${todaySellPrice}`);
    }
    return updatedQuote ?? null;
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
        `${state.currentRole} (系统)`,
        "库存管理",
        "批量操作调配",
        `${updatedCards.length} 张显卡`,
        undefined,
        `批量调整属性状态为 [${updates.status || "不变"}]，位置: ${updates.warehouseLocation || "不变"}`,
      );
    }
    return updatedCards;
  };

  const getInventorySummary = (filters: { includeSold?: boolean; category?: string; status?: string; keyword?: string } = {}): InventorySummaryRow[] => {
    const keyword = filters.keyword?.trim().toLowerCase();
    const excludedStatuses = new Set<CardStatus>(["已售出", "已报废", "已退货"]);
    const rows = new Map<string, InventorySummaryRow>();
    state.inventory
      .filter((card) => filters.includeSold || !excludedStatuses.has(card.status))
      .filter((card) => !filters.category || filters.category === "all" || (card.category || "显卡") === filters.category)
      .filter((card) => !filters.status || filters.status === "all" || card.status === filters.status)
      .filter((card) => {
        if (!keyword) return true;
        return [
          card.productName,
          card.model,
          card.brand,
          card.version,
          card.vram,
          card.warehouseLocation,
          card.supplierName,
        ].join(" ").toLowerCase().includes(keyword);
      })
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

  const importInventoryRows = (rows: InventoryImportRow[], handler: string = state.currentRole) => {
    if (!Array.isArray(rows) || rows.length === 0) throw new Error("导入库存不能为空");
    const today = new Date().toISOString().split("T")[0];
    const created: CardInventory[] = [];
    rows.forEach((row, rowIndex) => {
      const productName = row.productName?.trim();
      if (!productName) throw new Error(`第 ${rowIndex + 1} 行商品名称不能为空`);
      const quantity = Math.max(1, Math.floor(Number(row.quantity || 1)));
      const category = (row.category || "其他配件") as ProductCategory;
      const template = state.products.find((product) =>
        product.name === productName ||
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
          condition: row.condition || "良品90新",
          inWarranty: false,
          repaired: false,
          gpuRisk: false,
          fullBox: false,
          warehouseLocation: row.warehouseLocation?.trim() || "导入待分配",
          entryTime: today,
          storageDays: 0,
          remarks: ["整体库存导入", row.remarks?.trim()].filter(Boolean).join("；"),
        });
      }
    });
    state.inventory = [...created, ...state.inventory];
    state.products = state.products.map((product) => {
      const importedCount = created.filter((item) => item.productId === product.id).length;
      return importedCount ? { ...product, currentStock: product.currentStock + importedCount, lastDealTime: today } : product;
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
	    const handler = input.handler || state.currentRole;
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
          salesTime: new Date().toISOString().split("T")[0],
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
      // 更新产品库存：扣减已出库卡对应产品的 currentStock
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
          currentStock: Math.max(0, product.currentStock - productOutboundCount),
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
          state.salesInvoices = state.salesInvoices.map((inv) =>
            inv.id === invoiceId
              ? { ...inv, outboundStatus: "已出库", outboundTime: time, outboundHandler: handler }
              : inv,
          );
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
      date: quote.updateTime || new Date().toISOString().split("T")[0],
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
    addLog(`${state.currentRole} (系统)`, "价格参考", "创建行情参考", quote.model, undefined, `新建议进价: ${quote.refBuyPrice}元`);
    return newQuote;
  };

  const createCustomer = (customer: Partial<CustomerCard> & { name: string; contact?: string; firstChannel?: string; totalPurchases?: number }) => {
    const today = new Date().toISOString().split("T")[0];
    const channel = customer.firstChannel || customer.source || "散客自荐";
    const newCustomer: CustomerCard = {
      id: genId("KH"),
      name: customer.name,
      phone: customer.contact || customer.phone || "",
      wechat: customer.wechat || `${customer.name}_wx`,
      source: channel,
      firstChannel: channel,
      type: customer.type || "个人买家客户",
      crmStatus: customer.crmStatus || "线索",
      crmStage: customer.crmStage || "新线索",
      level: customer.level || "普通客户",
      owner: customer.owner || state.currentRole,
      intent: customer.intent || "中",
      budget: customer.budget || 0,
      lastFollowTime: customer.lastFollowTime,
      nextFollowTime: customer.nextFollowTime,
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
      debtBalance: customer.debtBalance || 0,
    };
    state.customers = [...state.customers, newCustomer];
    addLog(`${state.currentRole} (系统)`, "合伙/客商", "新建客户档案", customer.name);
    return newCustomer;
  };

  const updateCrmCustomer = (id: string, updates: Partial<CustomerCard>) => {
    const existing = state.customers.find((item) => item.id === id);
    if (!existing) throw new Error(`客户不存在: ${id}`);
    state.customers = state.customers.map((item) => (item.id === id ? { ...item, ...updates, id: item.id } : item));
    addLog(`${state.currentRole} (系统)`, "CRM客户管理", "更新客户资料", existing.name);
    return state.customers.find((item) => item.id === id) ?? null;
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
    if (!customer) throw new Error(`客户不存在: ${followUp.customerId}`);
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
        nextFollowTime: record.nextFollowTime,
      };
    });
    addLog(`${state.currentRole} (系统)`, "CRM客户管理", "新增客户跟进", customer.name);
    return record;
  };

  const createCrmRequirement = (requirement: Partial<CrmRequirement> & { customerId: string; productDemand: string; budget: number; intent: CrmRequirement["intent"]; handler: string }) => {
    const customer = state.customers.find((item) => item.id === requirement.customerId);
    if (!customer) throw new Error(`客户不存在: ${requirement.customerId}`);
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
        tags: Array.from(new Set([...(item.tags || []), "CRM需求"])),
      };
    });
    addLog(`${state.currentRole} (系统)`, "CRM客户管理", "登记客户需求", customer.name, undefined, record.productDemand);
    return record;
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
    const today = new Date().toISOString().split("T")[0];
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
    const newVendor: Vendor = {
      id: genId("GY"),
      name: vendor.name,
      partnerCategory: "同行",
      contactPerson: vendor.contactPerson || vendor.name,
      phone: vendor.contact || vendor.phone || "",
      type: vendor.type || "收货同行",
      totalBuyAmount: vendor.totalBuyAmount || 0,
      totalCount: vendor.totalCount || 0,
      avgProfit: vendor.avgProfit || 0,
      aftersalesCount: vendor.aftersalesCount || 0,
      aftersalesRate: vendor.aftersalesRate || 0,
      lastDealTime: new Date().toISOString().split("T")[0],
      accountPayable: vendor.debtBalance || vendor.accountPayable || 0,
      accountPaid: vendor.accountPaid || 0,
      remarks: vendor.remarks,
    };
    state.vendors = [...state.vendors, newVendor];
    addLog(`${state.currentRole} (系统)`, "合伙/客商", "新建商号供应商", vendor.name);
    return newVendor;
  };

  const listUsers = () => state.systemUsers.map(sanitizeUser);

  const getCurrentUser = () => {
    const current = state.systemUsers.find((user) => user.id === state.currentUserId);
    return current ? sanitizeUser(current) : null;
  };

  const login = (credentials: { username?: string; password?: string }) => {
    const username = String(credentials.username || "").trim();
    const password = String(credentials.password || "");
    const user = state.systemUsers.find((item) => item.username.toLowerCase() === username.toLowerCase());
    if (!user || !verifyPassword(user.password, password)) {
      throw new Error("账号或密码错误");
    }
    if (!user.enabled) {
      throw new Error("账号已停用");
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
    const user = state.systemUsers.find((item) => item.id === state.currentUserId);
    if (user) {
      addLog(`${user.displayName} (${user.role})`, "账号登录", "退出系统", user.username);
    }
    state.currentUserId = undefined;
    return null;
  };

  const createUser = (input: Partial<SystemUserAccount>) => {
    const username = String(input.username || "").trim();
    const password = String(input.password || "").trim();
    const displayName = String(input.displayName || "").trim();
    if (!username || !password || !displayName || !input.role) {
      throw new Error("账号、密码、姓名和角色不能为空");
    }
    if (state.systemUsers.some((item) => item.username.toLowerCase() === username.toLowerCase())) {
      throw new Error("账号已存在");
    }
    const user: SystemUserAccount = {
      id: genId("USR"),
      username,
      password: hashPassword(password),
      displayName,
      role: input.role,
      enabled: input.enabled ?? true,
      permissionOverrides: input.permissionOverrides || {},
      remarks: input.remarks,
    };
    state.systemUsers = [user, ...state.systemUsers];
    addLog(`${state.currentRole} (系统)`, "账号权限", "新增账号", username, undefined, `角色: ${user.role}`);
    return sanitizeUser(user);
  };

  const updateUser = (id: string, input: Partial<SystemUserAccount>) => {
    const existing = state.systemUsers.find((item) => item.id === id);
    if (!existing) throw new Error("账号不存在");
    const nextUsername = input.username?.trim();
    const nextDisplayName = input.displayName?.trim();
    if (nextUsername === "" || nextDisplayName === "") {
      throw new Error("账号和姓名不能为空");
    }
    if (nextUsername && state.systemUsers.some((item) => item.id !== id && item.username.toLowerCase() === nextUsername.toLowerCase())) {
      throw new Error("账号已存在");
    }
    const updated: SystemUserAccount = {
      ...existing,
      ...input,
      username: nextUsername || existing.username,
      displayName: nextDisplayName || existing.displayName,
      password: input.password ? hashPassword(input.password.trim()) : existing.password,
      permissionOverrides: input.permissionOverrides === undefined ? existing.permissionOverrides : { ...(existing.permissionOverrides || {}), ...input.permissionOverrides },
    };
    state.systemUsers = state.systemUsers.map((item) => item.id === id ? updated : item);
    if (state.currentUserId === id) {
      state.currentRole = updated.role;
    }
    addLog(`${state.currentRole} (系统)`, "账号权限", "更新账号", updated.username, existing.role, updated.role);
    return sanitizeUser(updated);
  };

  const getPermissions = () => {
    const base = state.customPermissions.find((item) => item.role === state.currentRole) || defaultPermissions[0];
    const currentUser = state.systemUsers.find((user) => user.id === state.currentUserId);
    if (!currentUser?.permissionOverrides) return base;
    return { ...base, ...currentUser.permissionOverrides, role: state.currentRole };
  };
  const togglePermission = (key: keyof Omit<PermissionSettings, "role">) => {
    if (!permissionKeys.includes(key)) {
      throw new Error(`权限字段不存在: ${String(key)}`);
    }
    state.customPermissions = state.customPermissions.map((permission) => (permission.role === state.currentRole ? { ...permission, [key]: !permission[key] } : permission));
    return getPermissions();
  };
  const clearAllLogs = () => {
    state.logs = [];
  };
  const reconcileLedgerItem = (id: string) => {
    const existing = state.financeLedger.find((item) => item.id === id);
    if (!existing) return null;
    state.financeLedger = state.financeLedger.map((item) => (item.id === id ? { ...item, status: "已复核" } : item));
    addLog(`${state.currentRole} (系统)`, "财务总账", "复核财务流水", id, "未复核", "已复核");
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
    const today = new Date().toISOString().split("T")[0];
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
    if (!sn) throw new Error(`第 ${index + 1} 行配件SN不能为空`);
    return {
      partName: part.partName?.trim() || `配件-${index + 1}`,
      category: (part.category || "其他配件") as ProductCategory,
      sn,
      remarks: part.remarks?.trim() || undefined,
    };
  };

  const createAssemblyInventoryItem = (
    part: AssemblyPartRecord,
    source: CardInventory | undefined,
    recordId: string,
    index: number
  ): CardInventory => ({
    id: `ZC-${recordId}-${String(index + 1).padStart(3, "0")}`,
    productId: `ASM-${recordId}-${index + 1}`,
    productName: part.partName,
    category: part.category,
    model: part.partName,
    brand: source?.brand || "拆装件",
    version: source?.version || "拆装记录",
    vram: source?.vram || "-",
    sn: part.sn,
    sourceType: source?.sourceType || "门店自采",
    supplierName: source?.supplierName || "组装拆卸",
    costPrice: 0,
    estSellPrice: 0,
    marketPrice: 0,
    status: "已入库",
    condition: source?.condition || "良品90新",
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
    const handler = input.handler?.trim() || state.currentRole;

    if (input.type === "拆卸") {
      const beforeSn = input.beforeSn?.trim();
      if (!beforeSn) throw new Error("拆卸必须录入拆之前SN");
      const source = state.inventory.find((item) => item.sn.toLowerCase() === beforeSn.toLowerCase() || item.id.toLowerCase() === beforeSn.toLowerCase());
      if (!source) throw new Error(`未找到拆之前SN: ${beforeSn}`);
      const afterParts = (input.afterParts || []).map(normalizeAssemblyPart);
      if (!afterParts.length) throw new Error("拆卸必须录入拆之后配件SN");
      const seenPartSn = new Set<string>();
      for (const part of afterParts) {
        const key = part.sn.toLowerCase();
        if (seenPartSn.has(key)) throw new Error(`拆之后配件SN重复: ${part.sn}`);
        seenPartSn.add(key);
        if (findCardBySn(part.sn)) throw new Error(`拆之后配件SN已存在: ${part.sn}`);
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
      const newItems = afterParts.map((part, index) => createAssemblyInventoryItem(part, source, id, index));
      state.assemblyOperations = [record, ...state.assemblyOperations];
      state.inventory = [
        ...newItems,
        ...state.inventory.map((item) => item.id === source.id ? { ...item, status: "已拆卸" as CardStatus, remarks: `${item.remarks || ""}${item.remarks ? "；" : ""}${time} 拆卸为 ${afterParts.length} 个配件，单号 ${id}` } : item),
      ];
      addLog(handler, "组装拆卸", "拆卸", id, source.sn, afterParts.map((part) => part.sn).join(", "));
      return record;
    }

    const beforeParts = (input.beforeParts || []).map(normalizeAssemblyPart);
    if (!beforeParts.length) throw new Error("组装必须录入来源配件SN");
    const afterSn = input.afterSn?.trim();
    if (!afterSn) throw new Error("组装必须录入组装后SN");
    if (findCardBySn(afterSn)) {
      throw new Error(`组装后SN已存在: ${afterSn}`);
    }
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
      undefined,
      id,
      0
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
    if (!record) throw new Error(`组装拆卸单不存在: ${id}`);
    const relatedItems = state.inventory.filter((item) => item.remarks?.includes(`组装拆卸单:${id}`));

    if (record.type === "拆卸") {
      const source = state.inventory.find((item) => item.sn === record.beforeSn);
      const generatedSnSet = new Set(record.afterParts.map((part) => part.sn.toLowerCase()));
      const generatedItems = state.inventory.filter((item) => generatedSnSet.has(item.sn.toLowerCase()) && item.remarks?.includes(`组装拆卸单:${id}`));
      if (!source || source.status !== "已拆卸" || generatedItems.some((item) => item.status !== "已入库")) {
        throw new Error("拆卸单生成的配件已被后续业务使用，不能删除");
      }
      state.inventory = state.inventory
        .filter((item) => !generatedItems.some((generated) => generated.id === item.id))
        .map((item) => item.id === source.id ? { ...item, status: "已入库" as CardStatus, remarks: `${item.remarks || ""}；${nowStamp()} 删除拆卸单 ${id}，恢复入库状态` } : item);
    } else {
      const finished = relatedItems.find((item) => item.sn === record.afterSn);
      const beforeSnSet = new Set(record.beforeParts.map((part) => part.sn.toLowerCase()));
      const sourceParts = state.inventory.filter((item) => beforeSnSet.has(item.sn.toLowerCase()));
      if (!finished || finished.status !== "已入库" || sourceParts.length !== record.beforeParts.length || sourceParts.some((item) => item.status !== "已组装")) {
        throw new Error("组装单生成的成品或来源配件已被后续业务使用，不能删除");
      }
      state.inventory = state.inventory
        .filter((item) => item.id !== finished.id)
        .map((item) => beforeSnSet.has(item.sn.toLowerCase()) ? { ...item, status: "已入库" as CardStatus, remarks: `${item.remarks || ""}；${nowStamp()} 删除组装单 ${id}，恢复配件入库状态` } : item);
    }

    state.assemblyOperations = state.assemblyOperations.filter((item) => item.id !== id);
    addLog(`${state.currentRole} (系统)`, "组装拆卸", `删除${record.type}单`, id, undefined, "库存状态已回滚");
    return record;
  };

  const setRole = (role: StoreRole) => {
    state.currentRole = role;
    return role;
  };
  const resetToInitialMock = () => {
    replaceState(state, createInitialState());
    return state;
  };

 return {
    createSettlementAccount,
    createPaymentIn,
    updatePaymentIn,
    deletePaymentIn,
    createPaymentOut,
    updatePaymentOut,
    deletePaymentOut,
    createAccountTransfer,
    updateAccountTransfer,
    deleteAccountTransfer,
    getAccountSummary,
    createAssemblyOperation,
    deleteAssemblyOperation,
    addProductTemplate,
    updateProductTemplate,
    deleteProductTemplate,
    createPurchaseInvoice,
    updatePurchaseInvoice,
    deletePurchaseInvoice,
    submitInspection,
    createSalesInvoice,
    updateSalesInvoice,
    deleteSalesInvoice,
    confirmSalesOutbound,
    addAftersalesClaim,
    updateAftersalesStatus,
    updateMarketPrice,
    batchUpdateInventory,
    getInventorySummary,
    importInventoryRows,
    scanInventoryFlow,
    createMarketQuote,
    createCustomer,
    updateCrmCustomer,
    createCrmFollowUp,
    createCrmRequirement,
    getCrmSummary,
    createVendor,
    listUsers,
    getCurrentUser,
    login,
    logout,
    createUser,
    updateUser,
    addLog,
    getPermissions,
    togglePermission,
    clearAllLogs,
    reconcileLedgerItem,
    setRole,
    resetToInitialMock,
  };
}
