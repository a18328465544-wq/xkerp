import type {
  AftersalesRecord,
  AccountTransferRecord,
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
  MarketQuote,
  PaymentInRecord,
  PaymentOutRecord,
  PermissionSettings,
  ProductTemplate,
  PurchaseInvoice,
  SalesInvoice,
  SettlementAccount,
  SettlementAccountType,
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
    currentRole: "老板",
    customPermissions: structuredClone(defaultPermissions),
    systemUsers: structuredClone(initialSystemUsers),
    currentUserId: undefined,
  };
}

function sanitizeUser(user: SystemUserAccount) {
  const { password: _password, ...safeUser } = user;
  return safeUser;
}

function normalizePermissions(permissions: PermissionSettings[]) {
  return permissions.map((permission) => {
    const defaultForRole = defaultPermissions.find((item) => item.role === permission.role);
    if (!defaultForRole) return permission;
    const hasLegacyMenus = permission.allowedMenus.some((item) => item === "purchase" || item === "sales");
    return hasLegacyMenus ? { ...permission, allowedMenus: defaultForRole.allowedMenus } : permission;
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

  const findSettlementAccount = (accountId: string) => {
    const account = state.settlementAccounts.find((item) => item.id === accountId);
    if (!account) throw new Error(`结算账户不存在: ${accountId}`);
    if (!account.enabled) throw new Error(`结算账户已停用: ${account.name}`);
    return account;
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
    addLog(`${state.currentRole} (系统)`, "结算账户", "新增结算账户", newAccount.name, undefined, `类型: ${newAccount.type}, 余额: ¥${newAccount.balance}`);
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
    addLog(`${state.currentRole} (系统)`, "结算账户", "新增收款单", record.id, undefined, `账户: ${account.name}, 金额: ¥${payment.amount}, 经办人: ${payment.handler}`);
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
    addLog(`${state.currentRole} (系统)`, "结算账户", "编辑收款单", id, `¥${existing.amount}`, `¥${updated.amount}`);
    return updated;
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
    addLog(`${state.currentRole} (系统)`, "结算账户", "新增付款单", record.id, undefined, `账户: ${account.name}, 金额: ¥${payment.amount}, 经办人: ${payment.handler}`);
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
    addLog(`${state.currentRole} (系统)`, "结算账户", "编辑付款单", id, `¥${existing.amount}`, `¥${updated.amount}`);
    return updated;
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
    addLog(`${state.currentRole} (系统)`, "结算账户", "资金调拨", record.id, undefined, `${from.name} -> ${to.name}, ¥${transfer.amount}`);
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
    addLog(`${state.currentRole} (系统)`, "结算账户", "编辑资金调拨", id, `¥${existing.amount}`, `¥${updated.amount}`);
    return updated;
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
    const seq = String(state.purchaseInvoices.length + 1).padStart(3, "0");
    const invoiceNo = `JH-${dateKey()}-${seq}`;
    const totalCount = invoice.items.length;
    const totalCost = invoice.items.reduce((sum, item) => sum + item.buyPrice, 0);
    const estTotalSell = invoice.items.reduce((sum, item) => sum + item.estSellPrice, 0);
    const estTotalProfit = estTotalSell - totalCost;
    const newInvoice: PurchaseInvoice = {
      ...invoice,
      id: `CG-${Date.now()}`,
      invoiceNo,
      totalCount,
      totalCost,
      estTotalSell,
      estTotalProfit,
      paymentStatus: invoice.unpaidAmount <= 0 ? "已付款" : invoice.paidAmount > 0 ? "部分付款" : "未付款",
    };

    const newStockItems: CardInventory[] = invoice.items.map((item, index) => {
      const template = state.products.find((product) => product.id === item.productId);
      return {
        id: `KC-${dateKey()}-${seq}${String(index + 1).padStart(3, "0")}`,
        productId: item.productId,
        productName: item.productName,
        category: item.category || template?.category || "其他配件",
        model: item.model,
        brand: item.brand,
        version: item.version,
        vram: item.vram,
        sn: item.sn || `SN-UNASSIGNED-${Date.now()}-${index}`,
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
        warehouseLocation: item.warehouseLocation || "质检区待转存",
        entryTime: invoice.date,
        storageDays: 0,
        remarks: item.remarks,
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

    const vendor = state.vendors.find((item) => item.name.trim() === invoice.supplierName.trim());
    if (vendor) {
      state.vendors = state.vendors.map((item) =>
        item.id === vendor.id
          ? {
              ...item,
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
          id: `GY-${Date.now()}`,
          name: invoice.supplierName,
          contactPerson: "业务联系人",
          phone: invoice.contact,
          type: "门市散户",
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

    addLog(`${state.currentRole} (系统)`, "采购回收", "录入进货单", invoiceNo, undefined, `金额: ¥${totalCost}, 生成了 ${totalCount} 张独立库存档案`);
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
          id: `LS-${Date.now()}`,
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
    addLog(`${state.currentRole} (系统)`, "采购回收", "编辑进货单", existing.invoiceNo, `¥${existing.totalCost}`, `¥${updated.totalCost}`);
    return updated;
  };

  const submitInspection = (report: Omit<InspectionRecord, "id" | "inspectTime">) => {
    const newReport: InspectionRecord = { ...report, id: `JC-${Date.now()}`, inspectTime: nowStamp() };
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
        status: statusMap[report.resultStatus],
        repaired: report.repaired || card.repaired,
        costPrice: report.resultStatus === "降价入库" ? Math.round(card.costPrice * 0.9) : card.costPrice,
        remarks: `${card.remarks || ""} (质检结果: ${report.resultStatus}. 烤机高热: ${report.temperature}℃. ${report.remarks || ""})`,
      };
    });
    addLog(`${state.currentRole} (系统)`, "测试质检", "提交检测单", `序列号: ${report.sn}`, "状态: 待检测", `质检状态: ${report.resultStatus}`);
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

    const seq = String(state.salesInvoices.length + 1).padStart(3, "0");
    const invoiceNo = `XS-${dateKey()}-${seq}`;
    const totalCount = invoice.items.length;
    const totalCost = invoice.items.reduce((sum, item) => sum + item.costPrice, 0);
    const totalAmount = invoice.items.reduce((sum, item) => sum + item.sellPrice, 0);
    const totalProfit = totalAmount - totalCost;
    const newInvoice: SalesInvoice = {
      ...invoice,
      id: `XS-${Date.now()}`,
      invoiceNo,
      totalCount,
      totalCost,
      totalAmount,
      totalProfit,
      paymentStatus: invoice.unpaidAmount <= 0 ? "已收款" : invoice.paidAmount > 0 ? "部分收款" : "未收款",
    };
    const chosenIds = new Set(invoice.items.map((item) => item.inventoryId));
    const beforeInventory = state.inventory;

    state.inventory = state.inventory.map((card) => {
      if (!chosenIds.has(card.id)) return card;
      const match = invoice.items.find((item) => item.inventoryId === card.id);
      return { ...card, status: "已售出", salesPrice: match?.sellPrice, salesTime: invoice.date, salesInvoiceId: invoiceNo, buyerName: invoice.customerName };
    });
    state.products = state.products.map((product) => {
      const productSales = invoice.items.filter((item) => beforeInventory.find((card) => card.id === item.inventoryId)?.productId === product.id);
      return {
        ...product,
        currentStock: Math.max(0, product.currentStock - productSales.length),
        lastSellPrice: productSales.at(0)?.sellPrice ?? product.lastSellPrice,
        lastDealTime: productSales.length ? invoice.date : product.lastDealTime,
      };
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
          id: `KH-${Date.now()}`,
          name: invoice.customerName,
          phone: invoice.contact,
          wechat: `${invoice.customerName}_wx`,
          source: invoice.channel,
          type: "购买客户",
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

    addLog(`${state.currentRole} (系统)`, "销售管理", "销售发货出库", invoiceNo, undefined, `数量: ${totalCount} 张, 金额: ¥${totalAmount}, 利润: ¥${totalProfit}`);
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
        { id: `LS-${Date.now()}`, time: nowStamp(), relatedId: invoiceNo, type: "销售收入", paymentWay: invoice.paymentMethod, amount: totalAmount, operator: state.currentRole, status: "已复核" },
        ...state.financeLedger,
      ];
    }
    return newInvoice;
  };

  const updateSalesInvoice = (id: string, updates: Partial<SalesInvoice>) => {
    const existing = state.salesInvoices.find((item) => item.id === id || item.invoiceNo === id);
    if (!existing) throw new Error(`销售单不存在: ${id}`);
    const items = updates.items || existing.items;
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
    addLog(`${state.currentRole} (系统)`, "销售管理", "编辑销售单", existing.invoiceNo, `¥${existing.totalAmount}`, `¥${updated.totalAmount}`);
    return updated;
  };

  const addAftersalesClaim = (claim: Omit<AftersalesRecord, "id" | "status" | "createTime">) => {
    const newClaim: AftersalesRecord = { ...claim, id: `SH-${Date.now()}`, status: "待处理", createTime: new Date().toISOString().split("T")[0] };
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
      addLog(`${state.currentRole} (系统)`, "行情大盘", "更新当日参考价", updatedQuote.productName, `最新回收: ${todayBuyPrice}`, `最新销售: ${todaySellPrice}`);
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

  const scanInventoryFlow = (input: {
    codes: string[];
    mode: InventoryScanMode;
    warehouseLocation?: string;
    handler?: string;
    target?: string;
    remarks?: string;
  }) => {
    const normalizedCodes = Array.from(new Set((input.codes || []).map((code) => code.trim()).filter(Boolean)));
    const handler = input.handler || state.currentRole;
    const time = nowStamp();
    const results: InventoryScanResult[] = [];
    const updates = new Map<string, Partial<CardInventory>>();

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
        patch = {
          status: "已入库",
          warehouseLocation: input.warehouseLocation?.trim() || card.warehouseLocation || "待分配库位",
          remarks: `${card.remarks || ""}${card.remarks ? "；" : ""}${time} ${handler} 扫码入库${input.remarks ? `：${input.remarks}` : ""}`,
        };
      } else if (input.mode === "出库") {
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
        patch = {
          status: "已售出",
          warehouseLocation: input.warehouseLocation?.trim() || "已出库",
          salesTime: new Date().toISOString().split("T")[0],
          buyerName: input.target || card.buyerName || "扫码出库",
          remarks: `${card.remarks || ""}${card.remarks ? "；" : ""}${time} ${handler} 扫码出库${input.target ? `给 ${input.target}` : ""}${input.remarks ? `：${input.remarks}` : ""}`,
        };
      } else {
        patch = {
          warehouseLocation: input.warehouseLocation?.trim() || card.warehouseLocation,
          remarks: `${card.remarks || ""}${card.remarks ? "；" : ""}${time} ${handler} 扫码移库${input.warehouseLocation ? `至 ${input.warehouseLocation}` : ""}${input.remarks ? `：${input.remarks}` : ""}`,
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
      id: `MQ-${Date.now()}`,
      date: quote.updateTime || new Date().toISOString().split("T")[0],
      productId: quote.productId || `SP-MOCK-${Date.now()}`,
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
    addLog(`${state.currentRole} (系统)`, "行情大盘", "创建行情参考", quote.model, undefined, `新建议进价: ¥${quote.refBuyPrice}`);
    return newQuote;
  };

  const createCustomer = (customer: Partial<CustomerCard> & { name: string; contact?: string; firstChannel?: string; totalPurchases?: number }) => {
    const today = new Date().toISOString().split("T")[0];
    const channel = customer.firstChannel || customer.source || "散客自荐";
    const newCustomer: CustomerCard = {
      id: `KH-${Date.now()}`,
      name: customer.name,
      phone: customer.contact || customer.phone || "",
      wechat: customer.wechat || `${customer.name}_wx`,
      source: channel,
      firstChannel: channel,
      type: customer.type || "购买客户",
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
      id: `CRM-FU-${Date.now()}`,
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
      id: `CRM-REQ-${Date.now()}`,
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
      id: `GY-${Date.now()}`,
      name: vendor.name,
      partnerCategory: vendor.partnerCategory || "同行",
      contactPerson: vendor.contactPerson || vendor.name,
      phone: vendor.contact || vendor.phone || "",
      type: vendor.type || "门店老熟客",
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
    if (!user || user.password !== password) {
      throw new Error("账号或密码错误");
    }
    if (!user.enabled) {
      throw new Error("账号已停用");
    }
    const loginTime = nowStamp();
    state.systemUsers = state.systemUsers.map((item) => item.id === user.id ? { ...item, lastLoginTime: loginTime } : item);
    state.currentUserId = user.id;
    state.currentRole = user.role;
    addLog(`${user.displayName} (${user.role})`, "账号登录", "登录系统", user.username, undefined, `登录时间: ${loginTime}`);
    return sanitizeUser({ ...user, lastLoginTime: loginTime });
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
      id: `USR-${Date.now()}`,
      username,
      password,
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
    if (input.username && state.systemUsers.some((item) => item.id !== id && item.username.toLowerCase() === input.username!.toLowerCase())) {
      throw new Error("账号已存在");
    }
    const updated: SystemUserAccount = {
      ...existing,
      ...input,
      username: input.username ? input.username.trim() : existing.username,
      displayName: input.displayName ? input.displayName.trim() : existing.displayName,
      password: input.password ? input.password.trim() : existing.password,
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
    createPaymentOut,
    updatePaymentOut,
    createAccountTransfer,
    updateAccountTransfer,
    getAccountSummary,
    addProductTemplate,
    updateProductTemplate,
    deleteProductTemplate,
    createPurchaseInvoice,
    updatePurchaseInvoice,
    submitInspection,
    createSalesInvoice,
    updateSalesInvoice,
    addAftersalesClaim,
    updateAftersalesStatus,
    updateMarketPrice,
    batchUpdateInventory,
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
