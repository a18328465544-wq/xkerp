/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect } from "react";
import {
  ProductTemplate,
  CardInventory,
  InspectionRecord,
  PurchaseInvoice,
  SalesInvoice,
  MarketQuote,
  AftersalesRecord,
  CustomerCard,
  Vendor,
  AuditLog,
  StoreRole,
  PermissionSettings,
  FinanceLedger,
  CardStatus,
  SettlementAccount,
  SettlementLedger,
  PaymentInRecord,
  PaymentOutRecord,
  AccountTransferRecord,
  CrmFollowUpRecord,
  CrmRequirement,
  InventoryScanMode,
  InventoryScanResult,
  InventoryImportRow,
  InventorySummaryRow,
  SystemUserAccount,
  SafeSystemUserAccount,
  AssemblyOperationRecord,
  AssemblyPartRecord,
  ProductCategory
} from "../types";
import {
  initialProducts,
  initialInventory,
  initialInspections,
  initialPurchaseInvoices,
  initialSalesInvoices,
  initialMarketQuotes,
  initialAftersales,
  initialCustomers,
  initialVendors,
  initialLogs,
  defaultPermissions,
  initialSystemUsers
} from "../data/mockData";

const initialFinanceLedger: FinanceLedger[] = [
  {
    id: "LS-20260529-001",
    time: "2026-05-29 11:20",
    relatedId: "XS-20260529-001",
    type: "销售收入",
    paymentWay: "微信",
    amount: 35500,
    operator: "店长 阿强",
    status: "已复核"
  },
  {
    id: "LS-20260529-002",
    time: "2026-05-29 10:45",
    relatedId: "JH-20260529-001",
    type: "进货支出",
    paymentWay: "对公账户",
    amount: -30500,
    operator: "店长 阿强",
    status: "已复核"
  },
  {
    id: "LS-20260529-003",
    time: "2026-05-29 14:15",
    type: "杂费支出",
    paymentWay: "门市现金",
    amount: -500,
    operator: "店员",
    status: "已复核"
  },
  {
    id: "LS-20260528-001",
    time: "2026-05-28 16:30",
    relatedId: "SH-20260528-001",
    type: "售后退款",
    paymentWay: "支付宝",
    amount: -3500,
    operator: "店长 阿强",
    status: "已复核"
  },
  {
    id: "LS-20260527-001",
    time: "2026-05-27 18:00",
    type: "员工提成",
    paymentWay: "银行卡",
    amount: -1200,
    operator: "店长 阿强",
    status: "未复核"
  }
];

const initialSettlementAccounts: SettlementAccount[] = [
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
    lastChangeTime: "2026-05-29 10:00"
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
    lastChangeTime: "2026-05-29 11:20"
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
    lastChangeTime: "2026-05-29 10:45"
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
    lastChangeTime: "2026-05-28 16:30"
  }
];

// Safe local storage helpers
const loadFromStorage = <T>(key: string, defaults: T): T => {
  try {
    const data = localStorage.getItem(key);
    if (!data) return defaults;
    const parsed = JSON.parse(data);
    if (parsed == null) return defaults;
    if (Array.isArray(defaults) && !Array.isArray(parsed)) {
      console.warn(`Local storage key ${key} expected array, got something else. Backing off to defaults.`);
      return defaults;
    }
    return parsed as T;
  } catch (e) {
    console.error(`Error loading state key ${key}`, e);
    return defaults;
  }
};

const saveToStorage = <T>(key: string, value: T) => {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (e) {
    console.error(`Error saving state key ${key}`, e);
  }
};

const normalizePermissions = (permissions: PermissionSettings[]) => {
  return permissions.map(permission => {
    const defaultForRole = defaultPermissions.find(item => item.role === permission.role);
    if (!defaultForRole) return permission;
    const hasLegacyMenus = permission.allowedMenus.some(item => item === "purchase" || item === "sales");
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
};

export function useStoreState() {
  const [products, setProducts] = useState<ProductTemplate[]>(() =>
    loadFromStorage("gpu_products", initialProducts)
  );

  const [inventory, setInventory] = useState<CardInventory[]>(() =>
    loadFromStorage("gpu_inventory", initialInventory)
  );

  const [inspections, setInspections] = useState<InspectionRecord[]>(() =>
    loadFromStorage("gpu_inspections", initialInspections)
  );

  const [purchaseInvoices, setPurchaseInvoices] = useState<PurchaseInvoice[]>(() =>
    loadFromStorage("gpu_purchase_invoices", initialPurchaseInvoices)
  );

  const [salesInvoices, setSalesInvoices] = useState<SalesInvoice[]>(() =>
    loadFromStorage("gpu_sales_invoices", initialSalesInvoices)
  );

  const [marketQuotes, setMarketQuotes] = useState<MarketQuote[]>(() =>
    loadFromStorage("gpu_market_quotes", initialMarketQuotes)
  );

  const [aftersales, setAftersales] = useState<AftersalesRecord[]>(() =>
    loadFromStorage("gpu_aftersales", initialAftersales)
  );

  const [customers, setCustomers] = useState<CustomerCard[]>(() =>
    loadFromStorage("gpu_customers", initialCustomers)
  );

  const [crmFollowUps, setCrmFollowUps] = useState<CrmFollowUpRecord[]>(() =>
    loadFromStorage("gpu_crm_follow_ups", [])
  );

  const [crmRequirements, setCrmRequirements] = useState<CrmRequirement[]>(() =>
    loadFromStorage("gpu_crm_requirements", [])
  );

  const [vendors, setVendors] = useState<Vendor[]>(() =>
    loadFromStorage("gpu_vendors", initialVendors)
  );

  const [logs, setLogs] = useState<AuditLog[]>(() =>
    loadFromStorage("gpu_logs", initialLogs)
  );

  const [financeLedger, setFinanceLedger] = useState<FinanceLedger[]>(() =>
    loadFromStorage("gpu_finance_ledger", initialFinanceLedger)
  );

  const [settlementAccounts, setSettlementAccounts] = useState<SettlementAccount[]>(() =>
    loadFromStorage("gpu_settlement_accounts", initialSettlementAccounts)
  );

  const [settlementLedger, setSettlementLedger] = useState<SettlementLedger[]>(() =>
    loadFromStorage("gpu_settlement_ledger", [])
  );

  const [paymentInRecords, setPaymentInRecords] = useState<PaymentInRecord[]>(() =>
    loadFromStorage("gpu_payment_in_records", [])
  );

  const [paymentOutRecords, setPaymentOutRecords] = useState<PaymentOutRecord[]>(() =>
    loadFromStorage("gpu_payment_out_records", [])
  );

  const [accountTransfers, setAccountTransfers] = useState<AccountTransferRecord[]>(() =>
    loadFromStorage("gpu_account_transfers", [])
  );

  const [assemblyOperations, setAssemblyOperations] = useState<AssemblyOperationRecord[]>(() =>
    loadFromStorage("gpu_assembly_operations", [])
  );

  const [systemUsers, setSystemUsers] = useState<SystemUserAccount[]>(() =>
    loadFromStorage("gpu_system_users", initialSystemUsers)
  );

  const [currentUserId, setCurrentUserId] = useState<string | undefined>(undefined);
  const [authToken, setAuthToken] = useState<string>(() => localStorage.getItem("gpu_auth_token") || "");

  const [currentRole, setCurrentRole] = useState<StoreRole>(() => {
    return (localStorage.getItem("gpu_current_role") as StoreRole) || "老板";
  });

  const [customPermissions, setCustomPermissions] = useState<PermissionSettings[]>(() =>
    normalizePermissions(loadFromStorage("gpu_custom_permissions", defaultPermissions))
  );

  type ServerState = {
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
    systemUsers: SystemUserAccount[];
    currentUserId?: string;
    currentRole: StoreRole;
    customPermissions: PermissionSettings[];
  };

  const applyServerState = (next: Partial<ServerState>) => {
    if (next.products) setProducts(next.products);
    if (next.inventory) setInventory(next.inventory);
    if (next.inspections) setInspections(next.inspections);
    if (next.purchaseInvoices) setPurchaseInvoices(next.purchaseInvoices);
    if (next.salesInvoices) setSalesInvoices(next.salesInvoices);
    if (next.marketQuotes) setMarketQuotes(next.marketQuotes);
    if (next.aftersales) setAftersales(next.aftersales);
    if (next.customers) setCustomers(next.customers);
    if (next.crmFollowUps) setCrmFollowUps(next.crmFollowUps);
    if (next.crmRequirements) setCrmRequirements(next.crmRequirements);
    if (next.vendors) setVendors(next.vendors);
    if (next.logs) setLogs(next.logs);
    if (next.financeLedger) setFinanceLedger(next.financeLedger);
    if (next.settlementAccounts) setSettlementAccounts(next.settlementAccounts);
    if (next.settlementLedger) setSettlementLedger(next.settlementLedger);
    if (next.paymentInRecords) setPaymentInRecords(next.paymentInRecords);
    if (next.paymentOutRecords) setPaymentOutRecords(next.paymentOutRecords);
    if (next.accountTransfers) setAccountTransfers(next.accountTransfers);
    if (next.assemblyOperations) setAssemblyOperations(next.assemblyOperations);
    if (next.systemUsers) setSystemUsers(next.systemUsers);
    if (next.currentRole) setCurrentRole(next.currentRole);
    if (next.customPermissions) setCustomPermissions(next.customPermissions);
  };

  const requestBackend = async (url: string, options?: RequestInit) => {
    try {
      const res = await fetch(url, {
        ...options,
        headers: {
          "Content-Type": "application/json",
          ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
          ...(options?.headers || {})
        }
      });
      if (res.status === 401) {
        setAuthToken("");
        setCurrentUserId(undefined);
        localStorage.removeItem("gpu_auth_token");
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const payload = await res.json();
      if (payload?.state) applyServerState(payload.state);
      if (payload?.data?.products || payload?.data?.inventory) applyServerState(payload.data);
      return payload?.data;
    } catch (e) {
      console.warn(`Backend API unavailable for ${url}; using browser state fallback.`, e);
      return null;
    }
  };

  const postBackend = (url: string, body?: unknown, method = "POST") => {
    void requestBackend(url, {
      method,
      body: body === undefined ? undefined : JSON.stringify(body)
    });
  };

  useEffect(() => {
    if (authToken) void requestBackend("/api/state");
  }, [authToken]);

  // Sync back to storage on state change
  useEffect(() => {
    saveToStorage("gpu_products", products);
  }, [products]);

  useEffect(() => {
    saveToStorage("gpu_inventory", inventory);
  }, [inventory]);

  useEffect(() => {
    saveToStorage("gpu_inspections", inspections);
  }, [inspections]);

  useEffect(() => {
    saveToStorage("gpu_purchase_invoices", purchaseInvoices);
  }, [purchaseInvoices]);

  useEffect(() => {
    saveToStorage("gpu_sales_invoices", salesInvoices);
  }, [salesInvoices]);

  useEffect(() => {
    saveToStorage("gpu_market_quotes", marketQuotes);
  }, [marketQuotes]);

  useEffect(() => {
    saveToStorage("gpu_aftersales", aftersales);
  }, [aftersales]);

  useEffect(() => {
    saveToStorage("gpu_customers", customers);
  }, [customers]);

  useEffect(() => {
    saveToStorage("gpu_crm_follow_ups", crmFollowUps);
  }, [crmFollowUps]);

  useEffect(() => {
    saveToStorage("gpu_crm_requirements", crmRequirements);
  }, [crmRequirements]);

  useEffect(() => {
    saveToStorage("gpu_vendors", vendors);
  }, [vendors]);

  useEffect(() => {
    saveToStorage("gpu_logs", logs);
  }, [logs]);

  useEffect(() => {
    saveToStorage("gpu_finance_ledger", financeLedger);
  }, [financeLedger]);

  useEffect(() => {
    saveToStorage("gpu_settlement_accounts", settlementAccounts);
  }, [settlementAccounts]);

  useEffect(() => {
    saveToStorage("gpu_settlement_ledger", settlementLedger);
  }, [settlementLedger]);

  useEffect(() => {
    saveToStorage("gpu_payment_in_records", paymentInRecords);
  }, [paymentInRecords]);

  useEffect(() => {
    saveToStorage("gpu_payment_out_records", paymentOutRecords);
  }, [paymentOutRecords]);

  useEffect(() => {
    saveToStorage("gpu_account_transfers", accountTransfers);
  }, [accountTransfers]);

  useEffect(() => {
    saveToStorage("gpu_assembly_operations", assemblyOperations);
  }, [assemblyOperations]);

  useEffect(() => {
    saveToStorage("gpu_system_users", systemUsers.map(user => safeUser(user)));
  }, [systemUsers]);

  useEffect(() => {
    if (authToken) {
      localStorage.setItem("gpu_auth_token", authToken);
    } else {
      localStorage.removeItem("gpu_auth_token");
    }
  }, [authToken]);

  useEffect(() => {
    localStorage.removeItem("gpu_current_user_id");
  }, [currentUserId]);

  useEffect(() => {
    localStorage.setItem("gpu_current_role", currentRole);
  }, [currentRole]);

  useEffect(() => {
    saveToStorage("gpu_custom_permissions", customPermissions);
  }, [customPermissions]);

  // Logging utility
  const addLog = (user: string, module: string, type: string, target: string, beforeVal?: string, afterVal?: string) => {
    const newLog: AuditLog = {
      id: `L-${Date.now()}`,
      user,
      time: new Date().toISOString().replace("T", " ").substring(0, 16),
      module,
      type,
      target,
      beforeVal,
      afterVal
    };
    setLogs(prev => [newLog, ...prev]);
  };

  const adjustSettlementBalance = (accountId: string, delta: number, time = new Date().toISOString().replace("T", " ").substring(0, 16)) => {
    setSettlementAccounts(prev => prev.map(account => {
      if (account.id !== accountId) return account;
      const balance = account.balance + delta;
      return { ...account, balance, availableBalance: balance - account.frozenAmount, lastChangeTime: time };
    }));
  };

  const createSettlementAccount = (account: Omit<SettlementAccount, "id" | "lastChangeTime">) => {
    postBackend("/api/gpu_erp/finance/settlement-account/create", account);
  };

  const createPaymentIn = (payment: Omit<PaymentInRecord, "id" | "accountName">) => {
    postBackend("/api/gpu_erp/finance/payment-in/create", payment);
  };

  const updatePaymentIn = (id: string, payment: Partial<PaymentInRecord>) => {
    setPaymentInRecords(prev => prev.map(item => item.id === id ? { ...item, ...payment, id, accountName: settlementAccounts.find(account => account.id === (payment.accountId || item.accountId))?.name || item.accountName } : item));
    postBackend(`/api/gpu_erp/finance/payment-in/${encodeURIComponent(id)}`, payment, "PUT");
  };

  const deletePaymentIn = (id: string) => {
    const existing = paymentInRecords.find(item => item.id === id);
    if (!existing) {
      postBackend(`/api/gpu_erp/finance/payment-in/${encodeURIComponent(id)}`, undefined, "DELETE");
      return null;
    }
    adjustSettlementBalance(existing.accountId, -existing.amount);
    setPaymentInRecords(prev => prev.filter(item => item.id !== id));
    setSettlementLedger(prev => prev.filter(item => !(item.accountId === existing.accountId && item.handler === existing.handler && item.time === existing.time && item.incomeAmount === existing.amount)));
    setFinanceLedger(prev => prev.filter(item => !(item.settlementAccountId === existing.accountId && item.handler === existing.handler && item.time === existing.time && item.amount === existing.amount)));
    addLog(`${currentRole} (系统)`, "结算账户", "删除收款单", id, `${existing.amount}元`, "已反向修正账户余额");
    postBackend(`/api/gpu_erp/finance/payment-in/${encodeURIComponent(id)}`, undefined, "DELETE");
    return existing;
  };

  const createPaymentOut = (payment: Omit<PaymentOutRecord, "id" | "accountName">) => {
    postBackend("/api/gpu_erp/finance/payment-out/create", payment);
  };

  const updatePaymentOut = (id: string, payment: Partial<PaymentOutRecord>) => {
    setPaymentOutRecords(prev => prev.map(item => item.id === id ? { ...item, ...payment, id, accountName: settlementAccounts.find(account => account.id === (payment.accountId || item.accountId))?.name || item.accountName } : item));
    postBackend(`/api/gpu_erp/finance/payment-out/${encodeURIComponent(id)}`, payment, "PUT");
  };

  const deletePaymentOut = (id: string) => {
    const existing = paymentOutRecords.find(item => item.id === id);
    if (!existing) {
      postBackend(`/api/gpu_erp/finance/payment-out/${encodeURIComponent(id)}`, undefined, "DELETE");
      return null;
    }
    adjustSettlementBalance(existing.accountId, existing.amount);
    setPaymentOutRecords(prev => prev.filter(item => item.id !== id));
    setSettlementLedger(prev => prev.filter(item => !(item.accountId === existing.accountId && item.handler === existing.handler && item.time === existing.time && item.expenseAmount === existing.amount)));
    setFinanceLedger(prev => prev.filter(item => !(item.settlementAccountId === existing.accountId && item.handler === existing.handler && item.time === existing.time && item.amount === -existing.amount)));
    addLog(`${currentRole} (系统)`, "结算账户", "删除付款单", id, `${existing.amount}元`, "已反向修正账户余额");
    postBackend(`/api/gpu_erp/finance/payment-out/${encodeURIComponent(id)}`, undefined, "DELETE");
    return existing;
  };

  const createAccountTransfer = (transfer: Omit<AccountTransferRecord, "id" | "fromAccountName" | "toAccountName">) => {
    const from = settlementAccounts.find(account => account.id === transfer.fromAccountId);
    const to = settlementAccounts.find(account => account.id === transfer.toAccountId);
    if (!from || !to || from.id === to.id || transfer.amount <= 0) {
      postBackend("/api/gpu_erp/finance/account-transfer/create", transfer);
      return;
    }
    const time = transfer.time || new Date().toISOString().replace("T", " ").substring(0, 16);
    const record: AccountTransferRecord = {
      ...transfer,
      id: `DB-${Date.now()}-${Math.random().toString(16).slice(2, 6)}`,
      fromAccountName: from.name,
      toAccountName: to.name,
      time
    };
    setAccountTransfers(prev => [record, ...prev]);
    setSettlementAccounts(prev => prev.map(account => {
      if (account.id === from.id) {
        const balance = account.balance - transfer.amount - transfer.fee;
        return { ...account, balance, availableBalance: balance - account.frozenAmount, lastChangeTime: time };
      }
      if (account.id === to.id) {
        const balance = account.balance + transfer.receivedAmount;
        return { ...account, balance, availableBalance: balance - account.frozenAmount, lastChangeTime: time };
      }
      return account;
    }));
    setSettlementLedger(prev => [
      {
        id: `SL-${Date.now()}-OUT`,
        accountId: from.id,
        accountName: from.name,
        accountType: from.type,
        direction: "转出",
        incomeAmount: 0,
        expenseAmount: transfer.amount + transfer.fee,
        changeAmount: -(transfer.amount + transfer.fee),
        beforeBalance: from.balance,
        afterBalance: from.balance - transfer.amount - transfer.fee,
        businessType: "账户调拨",
        relatedDocType: "资金调拨",
        relatedDocNo: record.id,
        handler: transfer.handler,
        createdBy: currentRole,
        time,
        remarks: transfer.remarks
      },
      {
        id: `SL-${Date.now()}-IN`,
        accountId: to.id,
        accountName: to.name,
        accountType: to.type,
        direction: "转入",
        incomeAmount: transfer.receivedAmount,
        expenseAmount: 0,
        changeAmount: transfer.receivedAmount,
        beforeBalance: to.balance,
        afterBalance: to.balance + transfer.receivedAmount,
        businessType: "账户调拨",
        relatedDocType: "资金调拨",
        relatedDocNo: record.id,
        handler: transfer.handler,
        createdBy: currentRole,
        time,
        remarks: transfer.remarks
      },
      ...prev
    ]);
    setFinanceLedger(prev => [
      {
        id: `LS-${Date.now()}`,
        time,
        relatedId: record.id,
        type: "账户调拨",
        paymentWay: `${from.name} -> ${to.name}`,
        amount: -transfer.fee,
        operator: transfer.handler,
        status: "未复核",
        settlementAccountId: from.id,
        settlementAccountName: from.name,
        handler: transfer.handler,
        relatedDocType: "资金调拨"
      },
      ...prev
    ]);
    addLog(`${currentRole} (系统)`, "结算账户", "资金调拨", record.id, undefined, `${from.name} -> ${to.name}, ${transfer.amount}元`);
    postBackend("/api/gpu_erp/finance/account-transfer/create", transfer);
  };

  const updateAccountTransfer = (id: string, transfer: Partial<AccountTransferRecord>) => {
    const existing = accountTransfers.find(item => item.id === id);
    const from = settlementAccounts.find(account => account.id === (transfer.fromAccountId || existing?.fromAccountId));
    const to = settlementAccounts.find(account => account.id === (transfer.toAccountId || existing?.toAccountId));
    if (existing && from && to && from.id !== to.id) {
      const amount = Number(transfer.amount ?? existing.amount);
      const fee = Number(transfer.fee ?? existing.fee);
      const receivedAmount = Number(transfer.receivedAmount ?? Math.max(0, amount - fee));
      const time = transfer.time || existing.time;
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
        time
      };
      setAccountTransfers(prev => prev.map(item => item.id === id ? updated : item));
      setSettlementAccounts(prev => prev.map(account => {
        let balance = account.balance;
        if (account.id === existing.fromAccountId) balance += existing.amount + existing.fee;
        if (account.id === existing.toAccountId) balance -= existing.receivedAmount;
        if (account.id === updated.fromAccountId) balance -= updated.amount + updated.fee;
        if (account.id === updated.toAccountId) balance += updated.receivedAmount;
        return balance === account.balance ? account : { ...account, balance, availableBalance: balance - account.frozenAmount, lastChangeTime: time };
      }));
      setSettlementLedger(prev => prev.map(item => {
        if (item.relatedDocNo !== id) return item;
        if (item.direction === "转出") {
          return { ...item, accountId: from.id, accountName: from.name, accountType: from.type, expenseAmount: updated.amount + updated.fee, changeAmount: -(updated.amount + updated.fee), handler: updated.handler, time: updated.time, remarks: updated.remarks };
        }
        if (item.direction === "转入") {
          return { ...item, accountId: to.id, accountName: to.name, accountType: to.type, incomeAmount: updated.receivedAmount, changeAmount: updated.receivedAmount, handler: updated.handler, time: updated.time, remarks: updated.remarks };
        }
        return item;
      }));
      setFinanceLedger(prev => prev.map(item => item.relatedId === id ? {
        ...item,
        paymentWay: `${from.name} -> ${to.name}`,
        amount: -updated.fee,
        operator: updated.handler,
        handler: updated.handler,
        settlementAccountId: from.id,
        settlementAccountName: from.name,
        time: updated.time
      } : item));
      addLog(`${currentRole} (系统)`, "结算账户", "编辑资金调拨", id, `${existing.amount}元`, `${updated.amount}元`);
    }
    postBackend(`/api/gpu_erp/finance/account-transfer/${encodeURIComponent(id)}`, transfer, "PUT");
  };

  const deleteAccountTransfer = (id: string) => {
    const existing = accountTransfers.find(item => item.id === id);
    if (!existing) {
      postBackend(`/api/gpu_erp/finance/account-transfer/${encodeURIComponent(id)}`, undefined, "DELETE");
      return null;
    }
    adjustSettlementBalance(existing.fromAccountId, existing.amount + existing.fee);
    adjustSettlementBalance(existing.toAccountId, -existing.receivedAmount);
    setAccountTransfers(prev => prev.filter(item => item.id !== id));
    setSettlementLedger(prev => prev.filter(item => item.relatedDocNo !== id));
    setFinanceLedger(prev => prev.filter(item => item.relatedId !== id));
    addLog(`${currentRole} (系统)`, "结算账户", "删除资金调拨", id, `${existing.amount}元`, "已反向修正账户余额和流水");
    postBackend(`/api/gpu_erp/finance/account-transfer/${encodeURIComponent(id)}`, undefined, "DELETE");
    return existing;
  };

  const getAccountSummary = (filters: { accountId?: string; handler?: string; customerName?: string; supplierName?: string } = {}) => {
    const scopedLedger = settlementLedger.filter(item => {
      const matchAccount = !filters.accountId || item.accountId === filters.accountId;
      const matchHandler = !filters.handler || item.handler === filters.handler;
      const matchCustomer = !filters.customerName || item.customerName === filters.customerName;
      const matchSupplier = !filters.supplierName || item.supplierName === filters.supplierName;
      return matchAccount && matchHandler && matchCustomer && matchSupplier;
    });
    const today = new Date().toISOString().split("T")[0];
    const month = today.slice(0, 7);
    const accounts = settlementAccounts
      .filter(account => !filters.accountId || account.id === filters.accountId)
      .map(account => {
        const ledger = scopedLedger.filter(item => item.accountId === account.id);
        return {
          ...account,
          todayIncome: ledger.filter(item => item.time.startsWith(today)).reduce((sum, item) => sum + item.incomeAmount, 0),
          todayExpense: ledger.filter(item => item.time.startsWith(today)).reduce((sum, item) => sum + item.expenseAmount, 0),
          monthIncome: ledger.filter(item => item.time.startsWith(month)).reduce((sum, item) => sum + item.incomeAmount, 0),
          monthExpense: ledger.filter(item => item.time.startsWith(month)).reduce((sum, item) => sum + item.expenseAmount, 0)
        };
      });
    const employeeMap = new Map<string, { handler: string; receivedAmount: number; paidAmount: number; incomeCount: number; expenseCount: number }>();
    scopedLedger.forEach(item => {
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
        expense: scopedLedger.reduce((sum, item) => sum + item.expenseAmount, 0)
      }
    };
  };

  const normalizeAssemblyPart = (part: Partial<AssemblyPartRecord>, index: number): AssemblyPartRecord => {
    const sn = part.sn?.trim();
    if (!sn) throw new Error(`第 ${index + 1} 行配件SN不能为空`);
    return {
      partName: part.partName?.trim() || `配件-${index + 1}`,
      category: (part.category || "其他配件") as ProductCategory,
      sn,
      remarks: part.remarks?.trim() || undefined
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
    entryTime: new Date().toISOString().split("T")[0],
    storageDays: 0,
    remarks: `组装拆卸单:${recordId}${part.remarks ? `；${part.remarks}` : ""}`
  });

  const createAssemblyOperation = (input: Partial<AssemblyOperationRecord> & { type: "拆卸" | "组装"; handler: string }) => {
    const id = `${input.type === "拆卸" ? "CX" : "ZZ"}-${Date.now()}`;
    const time = new Date().toISOString().replace("T", " ").substring(0, 16);
    const handler = input.handler?.trim() || currentRole;

    if (input.type === "拆卸") {
      const beforeSn = input.beforeSn?.trim();
      if (!beforeSn) throw new Error("拆卸必须录入拆之前SN");
      const source = inventory.find(item =>
        item.sn.toLowerCase() === beforeSn.toLowerCase() ||
        item.id.toLowerCase() === beforeSn.toLowerCase()
      );
      if (!source) throw new Error(`未找到拆之前SN: ${beforeSn}`);
      const afterParts = (input.afterParts || []).map(normalizeAssemblyPart);
      if (!afterParts.length) throw new Error("拆卸必须录入拆之后配件SN");
      const duplicate = afterParts.find(part => inventory.some(item => item.sn && item.sn.toLowerCase() === part.sn.toLowerCase()));
      if (duplicate) throw new Error(`拆之后配件SN已存在: ${duplicate.sn}`);

      const record: AssemblyOperationRecord = {
        id,
        type: "拆卸",
        handler,
        time,
        beforeSn: source.sn || beforeSn,
        beforeProductName: source.productName,
        beforeParts: [],
        afterParts,
        remarks: input.remarks?.trim() || undefined
      };
      const newItems = afterParts.map((part, index) => createAssemblyInventoryItem(part, source, id, index));
      setAssemblyOperations(prev => [record, ...prev]);
      setInventory(prev => [
        ...newItems,
        ...prev.map(item => item.id === source.id
          ? { ...item, status: "已拆卸" as CardStatus, remarks: `${item.remarks || ""}${item.remarks ? "；" : ""}${time} 拆卸为 ${afterParts.length} 个配件，单号 ${id}` }
          : item
        )
      ]);
      addLog(handler, "组装拆卸", "拆卸", id, source.sn, afterParts.map(part => part.sn).join(", "));
      postBackend("/api/assembly-operations", input);
      return record;
    }

    const beforeParts = (input.beforeParts || []).map(normalizeAssemblyPart);
    if (!beforeParts.length) throw new Error("组装必须录入来源配件SN");
    const afterSn = input.afterSn?.trim();
    if (!afterSn) throw new Error("组装必须录入组装后SN");
    if (inventory.some(item => item.sn && item.sn.toLowerCase() === afterSn.toLowerCase())) {
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
      remarks: input.remarks?.trim() || undefined
    };
    const finishedItem = createAssemblyInventoryItem(
      { partName: record.afterProductName || "组装成品", category: record.afterCategory || "整机", sn: afterSn, remarks: input.remarks },
      undefined,
      id,
      0
    );
    setAssemblyOperations(prev => [record, ...prev]);
    setInventory(prev => [
      finishedItem,
      ...prev.map(item => beforeParts.some(part => part.sn.toLowerCase() === item.sn.toLowerCase())
        ? { ...item, status: "已组装" as CardStatus, remarks: `${item.remarks || ""}${item.remarks ? "；" : ""}${time} 参与组装，单号 ${id}` }
        : item
      )
    ]);
    addLog(handler, "组装拆卸", "组装", id, beforeParts.map(part => part.sn).join(", "), afterSn);
    postBackend("/api/assembly-operations", input);
    return record;
  };

  const deleteAssemblyOperation = (id: string) => {
    const record = assemblyOperations.find(item => item.id === id);
    if (!record) {
      postBackend(`/api/assembly-operations/${encodeURIComponent(id)}`, undefined, "DELETE");
      return null;
    }

    if (record.type === "拆卸") {
      const source = inventory.find(item => item.sn === record.beforeSn);
      const generatedSnSet = new Set(record.afterParts.map(part => part.sn.toLowerCase()));
      const generatedItems = inventory.filter(item => generatedSnSet.has(item.sn.toLowerCase()) && item.remarks?.includes(`组装拆卸单:${id}`));
      if (!source || source.status !== "已拆卸" || generatedItems.some(item => item.status !== "已入库")) {
        throw new Error("拆卸单生成的配件已被后续业务使用，不能删除");
      }
      const generatedIds = new Set(generatedItems.map(item => item.id));
      setInventory(prev => prev
        .filter(item => !generatedIds.has(item.id))
        .map(item => item.id === source.id ? { ...item, status: "已入库" as CardStatus } : item));
    } else {
      const finished = inventory.find(item => item.sn === record.afterSn && item.remarks?.includes(`组装拆卸单:${id}`));
      const beforeSnSet = new Set(record.beforeParts.map(part => part.sn.toLowerCase()));
      const sourceParts = inventory.filter(item => beforeSnSet.has(item.sn.toLowerCase()));
      if (!finished || finished.status !== "已入库" || sourceParts.length !== record.beforeParts.length || sourceParts.some(item => item.status !== "已组装")) {
        throw new Error("组装单生成的成品或来源配件已被后续业务使用，不能删除");
      }
      setInventory(prev => prev
        .filter(item => item.id !== finished.id)
        .map(item => beforeSnSet.has(item.sn.toLowerCase()) ? { ...item, status: "已入库" as CardStatus } : item));
    }

    setAssemblyOperations(prev => prev.filter(item => item.id !== id));
    addLog(`${currentRole} (系统)`, "组装拆卸", `删除${record.type}单`, id, undefined, "库存状态已回滚");
    postBackend(`/api/assembly-operations/${encodeURIComponent(id)}`, undefined, "DELETE");
    return record;
  };

  // 1. PRODUCT TEMPLATES OPERATIONS
  const addProductTemplate = (product: Omit<ProductTemplate, "id" | "currentStock">) => {
    const newId = `SP-${String(products.length + 1).padStart(3, "0")}`;
    const newProduct: ProductTemplate = {
      ...product,
      id: newId,
      currentStock: 0
    };
    setProducts(prev => [newProduct, ...prev]);
    addLog(`${currentRole} (系统)`, "商品库", "添加商品模板", newProduct.name, undefined, `名: ${newProduct.name}, 型号: ${newProduct.model}`);
    postBackend("/api/products", product);
    return newProduct;
  };

  const updateProductTemplate = (updated: ProductTemplate) => {
    setProducts(prev => prev.map(p => (p.id === updated.id ? updated : p)));
    addLog(`${currentRole} (系统)`, "商品库", "修改商品模板", updated.name);
    postBackend(`/api/products/${encodeURIComponent(updated.id)}`, updated, "PUT");
  };

  const deleteProductTemplate = (id: string) => {
    const prod = products.find(p => p.id === id);
    if (!prod) return;
    setProducts(prev => prev.filter(p => p.id !== id));
    addLog(`${currentRole} (系统)`, "商品库", "删除商品模板", prod.name);
    postBackend(`/api/products/${encodeURIComponent(id)}`, undefined, "DELETE");
  };

  // 2. PURCHASE INVOICE (AND INVENTORY GENERATION)
  const createPurchaseInvoice = (invoice: Omit<PurchaseInvoice, "id" | "invoiceNo" | "totalCount" | "totalCost" | "estTotalSell" | "estTotalProfit">) => {
    const now = new Date();
    const dateStr = now.toISOString().split("T")[0].replace(/-/g, "");
    const seq = String(purchaseInvoices.length + 1).padStart(3, "0");
    const invoiceNo = `JH-${dateStr}-${seq}`;
    const invoiceId = `CG-${Date.now()}`;

    let totalCost = 0;
    let estTotalSell = 0;
    let totalCount = invoice.items.length;

    invoice.items.forEach(it => {
      totalCost += it.buyPrice;
      estTotalSell += it.estSellPrice;
    });

    const estTotalProfit = estTotalSell - totalCost;

    const newInvoice: PurchaseInvoice = {
      ...invoice,
      id: invoiceId,
      invoiceNo,
      totalCount,
      totalCost,
      estTotalSell,
      estTotalProfit
    };

    // Generate individual stock items
    const newStockItems: CardInventory[] = invoice.items.map((it, index) => {
      const stockSeq = String(index + 1).padStart(3, "0");
      const stockId = `KC-${dateStr}-${seq}${stockSeq}`;

      // Try finding the template references to fetch current market price, defaulting to buy price
      const matchedTemplate = products.find(p => p.id === it.productId);
      const marketPrice = matchedTemplate?.refSellPrice || it.estSellPrice;
      const category = it.category || matchedTemplate?.category || "其他配件";
      const isGpu = category === "显卡";

      return {
        id: stockId,
        productId: it.productId,
        productName: it.productName,
        category,
        model: it.model,
        brand: it.brand,
        version: it.version,
        vram: it.vram,
        sn: it.sn?.trim() || "",
        expressNo: invoice.expressNo?.trim() || undefined,
        sourceType: invoice.sourceType,
        supplierName: invoice.supplierName,
        costPrice: it.buyPrice,
        estSellPrice: it.estSellPrice,
        marketPrice,
        status: "待检测",
        condition: it.condition,
        inWarranty: it.inWarranty,
        warrantyDate: it.warrantyDate,
        repaired: it.repaired,
        gpuRisk: it.gpuRisk,
        fullBox: it.fullBox,
        warehouseLocation: isGpu ? "待检测区" : "配件待检测区",
        entryTime: invoice.date,
        storageDays: 0,
        remarks: [
          it.remarks,
          `进货单:${invoiceNo}`,
          invoice.expressNo ? `快递单号:${invoice.expressNo}` : "",
          isGpu ? "显卡待检测入库" : "其他配件待检测入库"
        ].filter(Boolean).join("；")
      };
    });

    // Update Product Stock values
    setProducts(prevProducts => {
      return prevProducts.map(p => {
        const matchingCount = newStockItems.filter(item => item.productId === p.id).length;
        const matchingItems = newStockItems.filter(item => item.productId === p.id);
        const lastBuy = matchingItems.length > 0 ? matchingItems[matchingItems.length - 1].costPrice : p.lastBuyPrice;
        return {
          ...p,
          currentStock: p.currentStock + matchingCount,
          lastBuyPrice: lastBuy,
          lastDealTime: invoice.date
        };
      });
    });

    // Append to state lists
    setPurchaseInvoices(prev => [newInvoice, ...prev]);
    setInventory(prev => [...newStockItems, ...prev]);

    // Handle partner dynamic values
    if (["个人回收", "客户置换"].includes(invoice.sourceType)) {
      setCustomers(prevCustomers => {
        const existingCustomer = prevCustomers.find(c => c.name.trim() === invoice.supplierName.trim());
        if (existingCustomer) {
          return prevCustomers.map(c => {
            if (c.name.trim() === invoice.supplierName.trim()) {
              return {
                ...c,
                type: c.type === "个人买家客户" ? c.type : "个人卖家客户",
                totalAmount: c.totalAmount + totalCost,
                recycleCount: c.recycleCount + totalCount,
                debtBalance: (c.debtBalance || 0) + invoice.unpaidAmount,
                lastDealTime: invoice.date
              };
            }
            return c;
          });
        }

        const newCustomer: CustomerCard = {
          id: `KH-${Date.now()}`,
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
          tags: ["个人卖家"],
          debtBalance: invoice.unpaidAmount,
          remarks: "进货单自动创建"
        };
        return [...prevCustomers, newCustomer];
      });
    } else {
      setVendors(prevVendors => {
        const existingVendor = prevVendors.find(v => v.name.trim() === invoice.supplierName.trim());
        if (existingVendor) {
          return prevVendors.map(v => {
            if (v.name.trim() === invoice.supplierName.trim()) {
              return {
                ...v,
                partnerCategory: "同行",
                type: v.type || "收货同行",
                totalBuyAmount: v.totalBuyAmount + totalCost,
                totalCount: v.totalCount + totalCount,
                accountPayable: v.accountPayable + invoice.unpaidAmount,
                accountPaid: v.accountPaid + invoice.paidAmount,
                lastDealTime: invoice.date
              };
            }
            return v;
          });
        } else {
          const newVendor: Vendor = {
            id: `GY-${Date.now()}`,
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
            remarks: "通过录入进货单自动新建"
          };
          return [...prevVendors, newVendor];
        }
      });
    }

    addLog(
      `${currentRole} (系统)`,
      "采购回收",
      "录入进货单",
      invoiceNo,
      undefined,
      `金额: ${totalCost}元, 生成 ${newStockItems.filter(item => (item.category || "显卡") === "显卡").length} 张显卡待检档案，${newStockItems.filter(item => (item.category || "显卡") !== "显卡").length} 件配件待检档案`
    );

    const ledgerId = `LS-${Date.now()}`;
    const newLedgerItem: FinanceLedger = {
      id: ledgerId,
      time: now.toISOString().replace("T", " ").substring(0, 16),
      relatedId: invoiceNo,
      type: "进货支出",
      paymentWay: invoice.paymentMethod,
      amount: -totalCost,
      operator: currentRole,
      status: "已复核"
    };
    setFinanceLedger(prev => [newLedgerItem, ...prev]);

    postBackend("/api/purchase-invoices", invoice);
    return newInvoice;
  };

  const updatePurchaseInvoice = (id: string, updates: Partial<PurchaseInvoice>) => {
    let updatedInvoice: PurchaseInvoice | null = null;
    setPurchaseInvoices(prev => prev.map(invoice => {
      if (invoice.id !== id && invoice.invoiceNo !== id) return invoice;
      const items = updates.items || invoice.items;
      const totalCount = items.length;
      const totalCost = items.reduce((sum, item) => sum + item.buyPrice, 0);
      const estTotalSell = items.reduce((sum, item) => sum + item.estSellPrice, 0);
      const paidAmount = Number(updates.paidAmount ?? invoice.paidAmount);
      const unpaidAmount = Number(updates.unpaidAmount ?? Math.max(0, totalCost - paidAmount));
      updatedInvoice = {
        ...invoice,
        ...updates,
        id: invoice.id,
        invoiceNo: invoice.invoiceNo,
        items,
        totalCount,
        totalCost,
        estTotalSell,
        estTotalProfit: estTotalSell - totalCost,
        paidAmount,
        unpaidAmount,
        isPaid: unpaidAmount <= 0,
        paymentStatus: unpaidAmount <= 0 ? "已付款" : paidAmount > 0 ? "部分付款" : "未付款",
      };
      return updatedInvoice;
    }));
    addLog(`${currentRole} (系统)`, "采购回收", "编辑进货单", id);
    postBackend(`/api/purchase-invoices/${encodeURIComponent(id)}`, updates, "PUT");
    return updatedInvoice;
  };

  const deletePurchaseInvoice = (id: string) => {
    const existing = purchaseInvoices.find(item => item.id === id || item.invoiceNo === id);
    if (!existing) {
      postBackend(`/api/purchase-invoices/${encodeURIComponent(id)}`, undefined, "DELETE");
      return null;
    }
    const relatedCards = inventory.filter(card => card.remarks?.includes(`进货单:${existing.invoiceNo}`));
    const hasInboundOrInspection = relatedCards.some(card => card.status !== "待检测") ||
      inspections.some(inspection => relatedCards.some(card => card.id === inspection.inventoryId));
    if (hasInboundOrInspection) {
      throw new Error("进货单已入库或已检测，不能删除");
    }
    const relatedCardIds = new Set(relatedCards.map(card => card.id));
    setInventory(prev => prev.filter(card => !relatedCardIds.has(card.id)));
    setPurchaseInvoices(prev => prev.filter(item => item.id !== existing.id));
    setProducts(prev => prev.map(product => {
      const removedCount = relatedCards.filter(card => card.productId === product.id).length;
      return removedCount ? { ...product, currentStock: Math.max(0, product.currentStock - removedCount) } : product;
    }));
    setFinanceLedger(prev => prev.filter(item => item.relatedId !== existing.invoiceNo && item.relatedId !== existing.id));
    paymentOutRecords
      .filter(payment => payment.relatedDocNo === existing.invoiceNo || payment.relatedDocNo === existing.id)
      .forEach(payment => deletePaymentOut(payment.id));
    addLog(`${currentRole} (系统)`, "采购回收", "删除进货单", existing.invoiceNo, `${existing.totalCost}元`, "已删除待检测库存和相关流水");
    postBackend(`/api/purchase-invoices/${encodeURIComponent(id)}`, undefined, "DELETE");
    return existing;
  };

  // 3. INSPECTION AND DETAILED QUALITY ASSESSMENT
  const submitInspection = (report: Omit<InspectionRecord, "id" | "inspectTime">) => {
    const sn = report.sn.trim();
    if (!sn) {
      throw new Error("检测入库必须录入SN");
    }
    const targetCard = inventory.find(card => card.id === report.inventoryId);
    if (!targetCard) {
      throw new Error(`库存档案不存在: ${report.inventoryId}`);
    }
    const isGpuInspection = (targetCard.category || "显卡") === "显卡";
    const duplicateSn = inventory.find(card => card.id !== report.inventoryId && card.sn && card.sn.toLowerCase() === sn.toLowerCase());
    if (duplicateSn) {
      throw new Error(`SN已存在: ${sn}`);
    }
    const reportId = `JC-${Date.now()}`;
    const newReport: InspectionRecord = {
      ...report,
      sn,
      id: reportId,
      inspectTime: new Date().toISOString().replace("T", " ").substring(0, 16)
    };

    setInspections(prev => [newReport, ...prev]);

    // Update corresponding inventory status and details
    setInventory(prevInv => {
      return prevInv.map(card => {
        if (card.id === report.inventoryId) {
          let updatedStatus: CardStatus = "已入库";
          if (report.resultStatus === "通过") {
            updatedStatus = "已入库";
          } else if (report.resultStatus === "轻微问题") {
            updatedStatus = "已入库"; // still stackable but condition flag could degrade
          } else if (report.resultStatus === "需要维修") {
            updatedStatus = "维修中";
          } else if (report.resultStatus === "拒收入库") {
            updatedStatus = "已退货"; // custom transition
          } else if (report.resultStatus === "降价入库") {
            updatedStatus = "已入库";
          }

          let finalCost = card.costPrice;
          if (report.resultStatus === "降价入库") {
            // Drop 5% as penalty or user defined
            finalCost = Math.round(card.costPrice * 0.9);
          }

          return {
            ...card,
            sn,
            status: updatedStatus,
            condition: report.condition || card.condition,
            inWarranty: report.inWarranty ?? card.inWarranty,
            warrantyDate: report.inWarranty ? report.warrantyDate : undefined,
            repaired: report.repaired,
            fullBox: report.fullBox ?? card.fullBox,
            warehouseLocation: report.warehouseLocation?.trim() || card.warehouseLocation,
            costPrice: finalCost,
            remarks: `${card.remarks || ""} (${isGpuInspection ? `质检结果: ${report.resultStatus}. 烤机高热: ${report.temperature}℃.` : "其他配件简易检测完成."} ${report.remarks || ""})`
          };
        }
        return card;
      });
    });

    addLog(
       `${currentRole} (系统)`,
      "测试质检",
      "提交检测单",
      `序列号: ${report.sn}`,
      "状态: 待检测",
      isGpuInspection ? `质检状态: ${report.resultStatus}, 核心温度 ${report.temperature}℃, 结果: 后续状态已调整` : `其他配件简易检测完成，成色: ${report.condition || targetCard.condition}`
    );
    postBackend("/api/inspections", report);
  };

  // 4. SALES OUTFLOW MANAGEMENT
  const createSalesInvoice = (invoice: Omit<SalesInvoice, "id" | "invoiceNo" | "totalCount" | "totalCost" | "totalAmount" | "totalProfit">) => {
    const now = new Date();
    const dateStr = now.toISOString().split("T")[0].replace(/-/g, "");
    const seq = String(salesInvoices.length + 1).padStart(3, "0");
    const invoiceNo = `XS-${dateStr}-${seq}`;
    const invoiceId = `XS-${Date.now()}`;

    let totalCost = 0;
    let totalAmount = 0;
    let totalCount = invoice.items.length;

    invoice.items.forEach(it => {
      totalCost += it.costPrice;
      totalAmount += it.sellPrice;
    });

    const totalProfit = totalAmount - totalCost;

    const newInvoice: SalesInvoice = {
      ...invoice,
      id: invoiceId,
      invoiceNo,
      totalCount,
      totalCost,
      totalAmount,
      totalProfit,
      outboundStatus: "待出库"
    };

    // Lock selected cards first; warehouse confirms actual outbound later.
    const chosenIds = invoice.items.map(it => it.inventoryId);
    setInventory(prevInv => {
      return prevInv.map(card => {
        if (chosenIds.includes(card.id)) {
          const matchItem = invoice.items.find(it => it.inventoryId === card.id);
          return {
            ...card,
            status: "已锁定",
            salesPrice: matchItem?.sellPrice,
            salesInvoiceId: invoiceNo,
            buyerName: invoice.customerName
          };
        }
        return card;
      });
    });

    setSalesInvoices(prev => [newInvoice, ...prev]);

    // Handle client records
    setCustomers(prevCustomers => {
      const existingCust = prevCustomers.find(c => c.name.trim() === invoice.customerName.trim());
      if (existingCust) {
        return prevCustomers.map(c => {
          if (c.name.trim() === invoice.customerName.trim()) {
            return {
              ...c,
              totalAmount: c.totalAmount + totalAmount,
              totalProfit: c.totalProfit + totalProfit,
              buyCount: c.buyCount + totalCount,
              lastDealTime: invoice.date
            };
          }
          return c;
        });
      } else {
        const newCustomer: CustomerCard = {
          id: `KH-${Date.now()}`,
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
          tags: ["首单客户"],
          remarks: "销售开单时自动创建"
        };
        return [...prevCustomers, newCustomer];
      }
    });

    addLog(
      `${currentRole} (系统)`,
      "销售管理",
      "创建销售单",
      invoiceNo,
      undefined,
      `数量: ${totalCount} 件, 金额: ${totalAmount}元，库存已锁定待出库`
    );

    const ledgerId = `LS-${Date.now()}`;
    const newLedgerItem: FinanceLedger = {
      id: ledgerId,
      time: new Date().toISOString().replace("T", " ").substring(0, 16),
      relatedId: invoiceNo,
      type: "销售收入",
      paymentWay: invoice.paymentMethod,
      amount: totalAmount,
      operator: currentRole,
      status: "已复核"
    };
    setFinanceLedger(prev => [newLedgerItem, ...prev]);

    postBackend("/api/sales-invoices", invoice);
    return newInvoice;
  };

  const updateSalesInvoice = (id: string, updates: Partial<SalesInvoice>) => {
    let updatedInvoice: SalesInvoice | null = null;
    setSalesInvoices(prev => prev.map(invoice => {
      if (invoice.id !== id && invoice.invoiceNo !== id) return invoice;
      const items = updates.items || invoice.items;
      const totalCount = items.length;
      const totalCost = items.reduce((sum, item) => sum + item.costPrice, 0);
      const totalAmount = items.reduce((sum, item) => sum + item.sellPrice, 0);
      const paidAmount = Number(updates.paidAmount ?? invoice.paidAmount);
      const unpaidAmount = Number(updates.unpaidAmount ?? Math.max(0, totalAmount - paidAmount));
      updatedInvoice = {
        ...invoice,
        ...updates,
        id: invoice.id,
        invoiceNo: invoice.invoiceNo,
        items,
        totalCount,
        totalCost,
        totalAmount,
        totalProfit: totalAmount - totalCost,
        paidAmount,
        unpaidAmount,
        isPaid: unpaidAmount <= 0,
        paymentStatus: unpaidAmount <= 0 ? "已收款" : paidAmount > 0 ? "部分收款" : "未收款",
      };
      return updatedInvoice;
    }));
    addLog(`${currentRole} (系统)`, "销售管理", "编辑销售单", id);
    postBackend(`/api/sales-invoices/${encodeURIComponent(id)}`, updates, "PUT");
    return updatedInvoice;
  };

  const deleteSalesInvoice = (id: string) => {
    const existing = salesInvoices.find(item => item.id === id || item.invoiceNo === id);
    if (!existing) {
      postBackend(`/api/sales-invoices/${encodeURIComponent(id)}`, undefined, "DELETE");
      return null;
    }
    const chosenIds = new Set(existing.items.map(item => item.inventoryId));
    const hasOutbound = existing.outboundStatus === "已出库" ||
      inventory.some(card => chosenIds.has(card.id) && card.status === "已售出" && card.salesInvoiceId === existing.invoiceNo);
    if (hasOutbound) {
      throw new Error("销售单已出库，不能删除");
    }
    setInventory(prev => prev.map(card => {
      if (!chosenIds.has(card.id) || card.salesInvoiceId !== existing.invoiceNo) return card;
      return { ...card, status: "已入库", salesPrice: undefined, salesInvoiceId: undefined, buyerName: undefined, salesTime: undefined };
    }));
    setSalesInvoices(prev => prev.filter(item => item.id !== existing.id));
    setFinanceLedger(prev => prev.filter(item => item.relatedId !== existing.invoiceNo && item.relatedId !== existing.id));
    paymentInRecords
      .filter(payment => payment.relatedDocNo === existing.invoiceNo || payment.relatedDocNo === existing.id)
      .forEach(payment => deletePaymentIn(payment.id));
    addLog(`${currentRole} (系统)`, "销售管理", "删除销售单", existing.invoiceNo, `${existing.totalAmount}元`, "库存已解除锁定");
    postBackend(`/api/sales-invoices/${encodeURIComponent(id)}`, undefined, "DELETE");
    return existing;
  };

  const confirmSalesOutbound = (
    id: string,
    input: { handler: string; codes?: string[]; manual?: boolean; remarks?: string }
  ) => {
    const invoice = salesInvoices.find(item => item.id === id || item.invoiceNo === id);
    if (!invoice) {
      throw new Error(`销售单不存在: ${id}`);
    }
    if (invoice.outboundStatus === "已出库") {
      return invoice;
    }

    const normalizedCodes = Array.from(new Set((input.codes || []).map(code => code.trim()).filter(Boolean)));
    if (!input.manual) {
      const missingItems = invoice.items.filter(item => {
        const card = inventory.find(inv => inv.id === item.inventoryId);
        return !normalizedCodes.some(code =>
          code.toLowerCase() === item.inventoryId.toLowerCase() ||
          code.toLowerCase() === item.sn.toLowerCase() ||
          (!!card?.sn && code.toLowerCase() === card.sn.toLowerCase())
        );
      });
      if (missingItems.length > 0) {
        throw new Error(`还有 ${missingItems.length} 件销售商品未扫码确认`);
      }
    }

    const outboundTime = new Date().toISOString().replace("T", " ").substring(0, 16);
    const outboundHandler = input.handler || currentRole;
    const chosenIds = new Set(invoice.items.map(item => item.inventoryId));
    const beforeInventory = inventory;

    setInventory(prev => prev.map(card => {
      if (!chosenIds.has(card.id)) return card;
      const match = invoice.items.find(item => item.inventoryId === card.id);
      return {
        ...card,
        status: "已售出",
        salesPrice: match?.sellPrice,
        salesTime: outboundTime.split(" ")[0],
        salesInvoiceId: invoice.invoiceNo,
        buyerName: invoice.customerName,
        remarks: `${card.remarks || ""}${card.remarks ? "；" : ""}${outboundTime} ${outboundHandler} 销售出库确认${input.manual ? "（手动确认）" : "（扫码确认）"}${input.remarks ? `：${input.remarks}` : ""}`
      };
    }));

    setProducts(prev => prev.map(product => {
      const productSales = invoice.items.filter(item => beforeInventory.find(card => card.id === item.inventoryId)?.productId === product.id);
      return {
        ...product,
        currentStock: Math.max(0, product.currentStock - productSales.length),
        lastSellPrice: productSales.at(0)?.sellPrice ?? product.lastSellPrice,
        lastDealTime: outboundTime.split(" ")[0]
      };
    }));

    let updatedInvoice: SalesInvoice = {
      ...invoice,
      outboundStatus: "已出库",
      outboundTime,
      outboundHandler,
      outboundRemarks: input.remarks
    };
    setSalesInvoices(prev => prev.map(item => item.id === invoice.id ? updatedInvoice : item));
    addLog(outboundHandler, "销售出库", input.manual ? "手动确认出库" : "扫码确认出库", invoice.invoiceNo, "待出库", "已出库");
    postBackend(`/api/sales-invoices/${encodeURIComponent(invoice.id)}/outbound`, input);
    return updatedInvoice;
  };

  // 5. AFTER-SALES PROCESS
  const addAftersalesClaim = (claim: Omit<AftersalesRecord, "id" | "status" | "createTime">) => {
    const claimId = `SH-${Date.now()}`;
    const newClaim: AftersalesRecord = {
      ...claim,
      id: claimId,
      status: "待处理",
      createTime: new Date().toISOString().split("T")[0]
    };

    setAftersales(prev => [newClaim, ...prev]);

    // Transition inventory item under warranty claim
    setInventory(prevInv => {
      return prevInv.map(card => {
        if (card.sn === claim.sn) {
          return {
            ...card,
            status: "售后中"
          };
        }
        return card;
      });
    });

    // Increment customer dispute counters
    setCustomers(prevCustomers => {
      return prevCustomers.map(c => {
        if (c.name === claim.customerName) {
          return {
            ...c,
            aftersalesCount: c.aftersalesCount + 1,
            tags: Array.from(new Set([...c.tags, "售后记录"]))
          };
        }
        return c;
      });
    });

    addLog(
      `${currentRole} (系统)`,
      "售后保障",
      "新建售后申诉",
      `SN: ${claim.sn}`,
      "销售已售",
      `分类: ${claim.type}, 问题: ${claim.desc.substring(0, 15)}...`
    );
    postBackend("/api/aftersales", claim);
  };

  const updateAftersalesStatus = (id: string, updatedFields: Partial<AftersalesRecord>) => {
    let affectedClaim: AftersalesRecord | undefined;
    setAftersales(prevClaims => {
      return prevClaims.map(c => {
        if (c.id === id) {
          affectedClaim = { ...c, ...updatedFields };
          return affectedClaim;
        }
        return c;
      });
    });

    if (affectedClaim && updatedFields.status === "已完成") {
      // Re-align stock state if retoured or finalized
      setInventory(prev => {
        return prev.map(card => {
          if (card.sn === affectedClaim?.sn) {
            // If they refunded, it becomes scrapped or restocked
            const finalStatus: CardStatus = affectedClaim?.type === "退货" ? "已入库" : "已上架";
            return {
              ...card,
              status: finalStatus
            };
          }
          return card;
        });
      });
    }

    addLog(
      `${currentRole} (系统)`,
      "售后保障",
      "更新处理状态",
      `售后单: ${id}`,
      undefined,
      `状态变为: ${updatedFields.status || "未更改"}`
    );
    postBackend(`/api/aftersales/${encodeURIComponent(id)}`, updatedFields, "PATCH");
  };

  // 6. MARKET QUOTES TREND UPDATER
  const updateMarketPrice = (quoteId: string, todayBuyPrice: number, todaySellPrice: number, remarks?: string) => {
    setMarketQuotes(prev => {
      return prev.map(q => {
        if (q.id === quoteId) {
          const changeAmount = todayBuyPrice - q.yestBuyPrice;
          const changeRatio = Number(((changeAmount / (q.yestBuyPrice || 1)) * 100).toFixed(2));
          return {
            ...q,
            todayBuyPrice,
            todaySellPrice,
            changeAmount,
            changeRatio,
            remarks: remarks || q.remarks
          };
        }
        return q;
      });
    });

    // Also update current references in Product inventory list for real-time risk evaluation
    const updatedQuote = marketQuotes.find(q => q.id === quoteId);
    if (updatedQuote) {
      setInventory(prevInv => {
        return prevInv.map(card => {
          if (card.productId === updatedQuote.productId) {
            return {
              ...card,
              marketPrice: todayBuyPrice
            };
          }
          return card;
        });
      });

      addLog(
        `${currentRole} (系统)`,
        "价格参考",
        "更新当日参考价",
        updatedQuote.productName,
        `最新回收: ${todayBuyPrice}`,
        `最新销售: ${todaySellPrice}`
      );
    }
    postBackend(`/api/market-quotes/${encodeURIComponent(quoteId)}`, { todayBuyPrice, todaySellPrice, remarks }, "PATCH");
  };

  const batchUpdateInventory = (ids: string[], updates: Pick<Partial<CardInventory>, "status" | "warehouseLocation">) => {
    const idSet = new Set(ids);
    setInventory(prev =>
      prev.map(card =>
        idSet.has(card.id)
          ? {
              ...card,
              status: updates.status || card.status,
              warehouseLocation: updates.warehouseLocation?.trim() || card.warehouseLocation
            }
          : card
      )
    );
    addLog(
      `${currentRole} (系统)`,
      "库存管理",
      "批量操作调配",
      `${ids.length} 张显卡`,
      undefined,
      `批量调整属性状态为 [${updates.status || "不变"}]，位置: ${updates.warehouseLocation || "不变"}`
    );
    postBackend("/api/inventory/batch", { ids, updates }, "PATCH");
  };

  const getInventorySummary = (filters: { includeSold?: boolean; category?: string; status?: string; keyword?: string } = {}): InventorySummaryRow[] => {
    const keyword = filters.keyword?.trim().toLowerCase();
    const excludedStatuses = new Set<CardStatus>(["已售出", "已报废", "已退货"]);
    const rows = new Map<string, InventorySummaryRow>();
    inventory
      .filter(card => filters.includeSold || !excludedStatuses.has(card.status))
      .filter(card => !filters.category || filters.category === "all" || (card.category || "显卡") === filters.category)
      .filter(card => !filters.status || filters.status === "all" || card.status === filters.status)
      .filter(card => {
        if (!keyword) return true;
        return [card.productName, card.model, card.brand, card.version, card.vram, card.warehouseLocation, card.supplierName].join(" ").toLowerCase().includes(keyword);
      })
      .forEach(card => {
        const category = (card.category || "显卡") as ProductCategory;
        const key = [category, card.productName, card.brand, card.model, card.version, card.vram].join("::");
        const current = rows.get(key) || {
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
          lastEntryTime: card.entryTime
        };
        const location = card.warehouseLocation?.trim() || "未分配库位";
        if (!current.warehouseLocations?.includes(location)) {
          current.warehouseLocations = [...(current.warehouseLocations || []), location];
        }
        current.warehouseLocation = current.warehouseLocations.join("、");
        current.totalCount += 1;
        current.availableCount += ["已入库", "已上架"].includes(card.status) ? 1 : 0;
        current.pendingCount += ["待检测", "检测中"].includes(card.status) ? 1 : 0;
        current.lockedCount += card.status === "已锁定" ? 1 : 0;
        current.soldCount += card.status === "已售出" ? 1 : 0;
        current.repairCount += ["维修中", "售后中", "退货中"].includes(card.status) ? 1 : 0;
        current.totalCost += Number(card.costPrice || 0);
        current.totalEstSell += Number(card.estSellPrice || card.marketPrice || 0);
        current.lastEntryTime = [current.lastEntryTime, card.entryTime].filter(Boolean).sort().at(-1);
        current.avgCost = Math.round(current.totalCost / current.totalCount);
        current.avgEstSell = Math.round(current.totalEstSell / current.totalCount);
        rows.set(key, current);
      });
    return Array.from(rows.values()).sort((a, b) => b.totalCount - a.totalCount || a.productName.localeCompare(b.productName, "zh-Hans-CN"));
  };

  const importInventoryRows = (rows: InventoryImportRow[], handler: string = currentRole) => {
    if (!Array.isArray(rows) || rows.length === 0) throw new Error("导入库存不能为空");
    const today = new Date().toISOString().split("T")[0];
    const created: CardInventory[] = [];
    rows.forEach((row, rowIndex) => {
      const productName = row.productName?.trim();
      if (!productName) throw new Error(`第 ${rowIndex + 1} 行商品名称不能为空`);
      const quantity = Math.max(1, Math.floor(Number(row.quantity || 1)));
      const category = (row.category || "其他配件") as ProductCategory;
      const template = products.find(product =>
        product.name === productName ||
        (row.model && product.model === row.model && (row.brand ? product.brand === row.brand : true))
      );
      for (let index = 0; index < quantity; index += 1) {
        created.push({
          id: `KC-IMPORT-${new Date().toISOString().slice(0, 10).replace(/-/g, "")}-${String(Date.now()).slice(-6)}-${String(rowIndex + 1).padStart(3, "0")}-${String(index + 1).padStart(3, "0")}`,
          productId: template?.id || `IMP-${new Date().toISOString().slice(0, 10).replace(/-/g, "")}-${rowIndex + 1}`,
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
          remarks: ["整体库存导入", row.remarks?.trim()].filter(Boolean).join("；")
        });
      }
    });
    setInventory(prev => [...created, ...prev]);
    setProducts(prev => prev.map(product => {
      const importedCount = created.filter(item => item.productId === product.id).length;
      return importedCount ? { ...product, currentStock: product.currentStock + importedCount, lastDealTime: today } : product;
    }));
    addLog(handler, "库存管理", "导入整体库存", `${created.length} 条库存档案`, undefined, "已写入单卡库存和整体库存汇总");
    postBackend("/api/inventory/import", { rows, handler });
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
    const now = new Date();
    const time = now.toISOString().replace("T", " ").substring(0, 16);
    const today = now.toISOString().split("T")[0];
    const codes = Array.from(new Set((input.codes || []).map(code => code.trim()).filter(Boolean)));
    const results: InventoryScanResult[] = [];
    const patches = new Map<string, Partial<CardInventory>>();
    const outboundInvoiceIds = new Set<string>(); // 收集出库涉及的销售单ID
    const buildRemark = (card: CardInventory, action: string) =>
      `${card.remarks || ""}${card.remarks ? "；" : ""}${time} ${input.handler || currentRole} ${action}${input.remarks ? `：${input.remarks}` : ""}`;

    if (input.mode === "入库") {
      (input.trackingSnPairs || []).forEach(pair => {
        const trackingNo = pair.trackingNo?.trim();
        const sn = pair.sn?.trim();
        const code = trackingNo && sn ? `${trackingNo} / ${sn}` : trackingNo || sn || "";
        if (!trackingNo || !sn) {
          results.push({ code, matched: false, message: "快递单号和SN都必须填写" });
          return;
        }
        const duplicateSn = inventory.find(item => item.sn && item.sn.toLowerCase() === sn.toLowerCase());
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
            message: "该SN已存在，不能重复绑定"
          });
          return;
        }
        const card = inventory.find(item =>
          item.expressNo?.toLowerCase() === trackingNo.toLowerCase() &&
          (item.category || "显卡") === "显卡" &&
          item.status === "待检测" &&
          !item.sn &&
          !patches.has(item.id)
        );
        if (!card) {
          results.push({ code, matched: false, message: "未找到该快递单号下待绑定SN的显卡待检档案" });
          return;
        }
        const patch: Partial<CardInventory> = {
          sn,
          status: "已入库",
          warehouseLocation: input.warehouseLocation || card.warehouseLocation || "待分配库位",
          remarks: buildRemark(card, `按快递单号${trackingNo}绑定SN并扫码入库`)
        };
        patches.set(card.id, patch);
        results.push({
          code,
          inventoryId: card.id,
          sn,
          productName: card.productName,
          beforeStatus: card.status,
          afterStatus: "已入库",
          beforeLocation: card.warehouseLocation,
          afterLocation: patch.warehouseLocation || card.warehouseLocation,
          matched: true,
          message: "入库成功"
        });
      });

      Array.from(new Set((input.accessoryCodes || []).map(code => code.trim()).filter(Boolean))).forEach(code => {
        const card = inventory.find(item => item.id.toLowerCase() === code.toLowerCase() || item.sn.toLowerCase() === code.toLowerCase());
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
            message: "该库存属于显卡，请走显卡入库或检测录入"
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
            message: "其他配件必须先在检测录入完成简易检测，不能扫码直接入库"
          });
          return;
        }
        const patch: Partial<CardInventory> = {
          status: "已入库",
          warehouseLocation: input.warehouseLocation || card.warehouseLocation || "配件库-待上架",
          remarks: buildRemark(card, "配件扫码确认入库")
        };
        patches.set(card.id, patch);
        results.push({
          code,
          inventoryId: card.id,
          sn: card.sn,
          productName: card.productName,
          beforeStatus: card.status,
          afterStatus: "已入库",
          beforeLocation: card.warehouseLocation,
          afterLocation: patch.warehouseLocation || card.warehouseLocation,
          matched: true,
          message: "配件入库成功"
        });
      });
    }

    codes.forEach(code => {
      const card = inventory.find(item => item.id.toLowerCase() === code.toLowerCase() || item.sn.toLowerCase() === code.toLowerCase());
      if (!card) {
        results.push({ code, matched: false, message: "未找到对应库存ID或SN" });
        return;
      }
      if (input.mode === "出库" && (card.status === "已售出" || card.status === "已报废")) {
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
          message: `当前状态为${card.status}，不能重复出库`
        });
        return;
      }
      // 出库必须关联销售单：卡必须处于"已锁定"状态且有 salesInvoiceId
      if (input.mode === "出库" && card.status !== "已锁定") {
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
          message: `出库失败：当前状态为${card.status}，必须先创建销售单锁定后才能出库`
        });
        return;
      }
      if (input.mode === "出库" && !card.salesInvoiceId) {
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
          message: "出库失败：该库存卡未关联销售单，请先开销售单"
        });
        return;
      }
      // 验证关联的销售单存在且未出库
      if (input.mode === "出库") {
        const linkedInvoice = salesInvoices.find(inv => inv.invoiceNo === card.salesInvoiceId || inv.id === card.salesInvoiceId);
        if (!linkedInvoice) {
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
            message: `出库失败：关联销售单 ${card.salesInvoiceId} 不存在`
          });
          return;
        }
        if (linkedInvoice.outboundStatus === "已出库") {
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
            message: `出库失败：关联销售单 ${card.salesInvoiceId} 已完成出库`
          });
          return;
        }
        outboundInvoiceIds.add(linkedInvoice.id);
      }
      if (input.mode === "入库" && (card.category || "显卡") !== "显卡" && (card.status === "待检测" || card.status === "检测中")) {
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
          message: "其他配件必须先在检测录入完成简易检测，不能扫码直接入库"
        });
        return;
      }
      const patch: Partial<CardInventory> = input.mode === "入库"
        ? { status: "已入库", warehouseLocation: input.warehouseLocation || card.warehouseLocation || "待分配库位", remarks: buildRemark(card, "扫码入库") }
        : input.mode === "出库"
          ? { status: "已售出", warehouseLocation: input.warehouseLocation || "已出库", salesTime: today, buyerName: card.buyerName || input.target || salesInvoices.find(inv => inv.invoiceNo === card.salesInvoiceId || inv.id === card.salesInvoiceId)?.customerName || "扫码出库", remarks: buildRemark(card, `扫码出库（销售单: ${card.salesInvoiceId}）${input.target ? `给 ${input.target}` : ""}`) }
          : { warehouseLocation: input.warehouseLocation || card.warehouseLocation, remarks: buildRemark(card, `扫码移库${input.warehouseLocation ? `至 ${input.warehouseLocation}` : ""}`) };
      patches.set(card.id, patch);
      results.push({
        code,
        inventoryId: card.id,
        sn: card.sn,
        productName: card.productName,
        beforeStatus: card.status,
        afterStatus: patch.status || card.status,
        beforeLocation: card.warehouseLocation,
        afterLocation: patch.warehouseLocation || card.warehouseLocation,
        matched: true,
        message: `${input.mode}成功`
      });
    });

    setInventory(prev => prev.map(card => patches.has(card.id) ? { ...card, ...patches.get(card.id) } : card));

    // 出库模式：更新产品库存和销售单出库状态
    const outboundSuccessCount = results.filter(item => item.matched && item.message.endsWith("成功") && item.afterStatus === "已售出").length;
    if (input.mode === "出库" && outboundSuccessCount > 0) {
      // 扣减已出库卡对应产品的 currentStock
      setProducts(prev => prev.map(product => {
        const productOutboundCount = results.filter(r => {
          if (!r.matched || !r.message.endsWith("成功") || r.afterStatus !== "已售出") return false;
          const card = inventory.find(c => c.id === r.inventoryId);
          return card?.productId === product.id;
        }).length;
        if (productOutboundCount === 0) return product;
        return {
          ...product,
          currentStock: Math.max(0, product.currentStock - productOutboundCount),
          lastDealTime: today
        };
      }));

      // 检查每个涉及的销售单是否所有卡都已出库，若是则标记整单已出库
      setSalesInvoices(prev => prev.map(invoice => {
        if (!outboundInvoiceIds.has(invoice.id) || invoice.outboundStatus === "已出库") return invoice;
        const allItemsOutbound = invoice.items.every(item => {
          const card = inventory.find(c => c.id === item.inventoryId);
          return card?.status === "已售出" || patches.has(item.inventoryId);
        });
        if (allItemsOutbound) {
          return { ...invoice, outboundStatus: "已出库", outboundTime: time, outboundHandler: input.handler || currentRole };
        }
        return invoice;
      }));
    }

    const updatedCount = results.filter(item => item.matched && item.message.endsWith("成功")).length;
    if (updatedCount > 0) {
      addLog(`${input.handler || currentRole} (扫码)`, "库存管理", `扫码${input.mode}`, `${updatedCount} 张库存卡`, undefined, `库位: ${input.warehouseLocation || "未变更"}${input.target ? `, 对象: ${input.target}` : ""}`);
    }
    postBackend("/api/inventory/scan-flow", input);
    return { results, updatedCount, missingCount: results.filter(item => !item.matched).length };
  };

  const createMarketQuote = (quote: any) => {
    const newQuote: MarketQuote = {
      ...quote,
      id: `MQ-${Date.now()}`,
      date: quote.updateTime || new Date().toISOString().split("T")[0],
      productId: (quote as any).productId || `SP-MOCK-${Date.now()}`,
      productName: quote.model,
      version: "",
      yestBuyPrice: quote.refBuyPrice || 0,
      todayBuyPrice: quote.refBuyPrice || 0,
      todaySellPrice: quote.refSellPrice || 0,
      maxPrice: quote.refSellPrice || 0,
      minPrice: quote.refBuyPrice || 0,
      changeAmount: 0,
      changeRatio: 0
    };
    setMarketQuotes(prev => [newQuote, ...prev]);
    addLog(`${currentRole} (系统)`, "价格参考", "创建行情参考", quote.model, undefined, `新建议进价: ${quote.refBuyPrice}元`);
    postBackend("/api/market-quotes", quote);
  };

  const createCustomer = (cust: any) => {
    const channel = cust.firstChannel || cust.source || "散客自荐";
    const newCustomer: CustomerCard = {
      id: `KH-${Date.now()}`,
      name: cust.name,
      phone: cust.contact || cust.phone || "",
      wechat: cust.wechat || `${cust.name}_wx`,
      source: channel,
      firstChannel: channel,
      type: cust.type || "个人买家客户",
      crmStatus: cust.crmStatus || "线索",
      crmStage: cust.crmStage || "新线索",
      level: cust.level || "普通客户",
      owner: cust.owner || currentRole,
      intent: cust.intent || "中",
      budget: Number(cust.budget) || 0,
      lastFollowTime: cust.lastFollowTime,
      nextFollowTime: cust.nextFollowTime,
      lastDealTime: cust.lastDealTime || new Date().toISOString().split("T")[0],
      totalAmount: cust.totalAmount || 0,
      totalProfit: cust.totalProfit || 0,
      buyCount: cust.totalPurchases || 0,
      recycleCount: cust.recycleCount || 0,
      aftersalesCount: cust.aftersalesCount || 0,
      remarks: cust.remarks,
      tags: cust.tags || ["新建建卡"],
      contact: cust.contact || cust.phone || "",
      totalPurchases: cust.totalPurchases || cust.buyCount || 0,
      debtBalance: cust.debtBalance || 0
    };
    setCustomers(prev => [...prev, newCustomer]);
    addLog(`${currentRole} (系统)`, "合伙/客商", "新建客户档案", cust.name);
    postBackend(cust.fromCrm ? "/api/gpu_erp/crm/customer/create" : "/api/customers", cust);
    return newCustomer;
  };

  const updateCrmCustomer = (id: string, updates: Partial<CustomerCard>) => {
    setCustomers(prev => prev.map(item => (item.id === id ? { ...item, ...updates, id: item.id } : item)));
    addLog(`${currentRole} (系统)`, "CRM客户管理", "更新客户资料", id);
    postBackend(`/api/gpu_erp/crm/customer/${encodeURIComponent(id)}`, updates, "PATCH");
  };

  const createCrmFollowUp = (followUp: Partial<CrmFollowUpRecord> & { customerId: string; content: string; result: CrmFollowUpRecord["result"]; handler: string }) => {
    const customer = customers.find(item => item.id === followUp.customerId);
    if (!customer) return null;
    const record: CrmFollowUpRecord = {
      id: `CRM-FU-${Date.now()}`,
      customerId: followUp.customerId,
      customerName: customer.name,
      contactMethod: followUp.contactMethod || "微信",
      content: followUp.content,
      result: followUp.result,
      handler: followUp.handler,
      followTime: followUp.followTime || new Date().toISOString().replace("T", " ").substring(0, 16),
      nextFollowTime: followUp.nextFollowTime,
      remarks: followUp.remarks
    };
    const stageMap: Record<CrmFollowUpRecord["result"], CustomerCard["crmStage"]> = {
      继续跟进: "需求确认",
      已报价: "报价中",
      已成交: "已成交",
      暂缓: "需求确认",
      无效线索: "新线索",
      售后维护: "售后维护"
    };
    const statusMap: Record<CrmFollowUpRecord["result"], CustomerCard["crmStatus"]> = {
      继续跟进: "跟进中",
      已报价: "跟进中",
      已成交: "已成交",
      暂缓: "沉睡",
      无效线索: "流失",
      售后维护: "已成交"
    };
    setCrmFollowUps(prev => [record, ...prev]);
    setCustomers(prev => prev.map(item => {
      if (item.id !== followUp.customerId) return item;
      return {
        ...item,
        crmStatus: statusMap[record.result],
        crmStage: stageMap[record.result],
        owner: record.handler || item.owner,
        lastFollowTime: record.followTime,
        nextFollowTime: record.nextFollowTime
      };
    }));
    addLog(`${currentRole} (系统)`, "CRM客户管理", "新增客户跟进", customer.name);
    postBackend("/api/gpu_erp/crm/follow-up/create", followUp);
    return record;
  };

  const createCrmRequirement = (requirement: Partial<CrmRequirement> & { customerId: string; productDemand: string; budget: number; intent: CrmRequirement["intent"]; handler: string }) => {
    const customer = customers.find(item => item.id === requirement.customerId);
    if (!customer) return null;
    const record: CrmRequirement = {
      id: `CRM-REQ-${Date.now()}`,
      customerId: requirement.customerId,
      customerName: customer.name,
      productDemand: requirement.productDemand,
      budget: Number(requirement.budget) || 0,
      intent: requirement.intent,
      stage: requirement.stage || "需求确认",
      source: requirement.source || customer.firstChannel || customer.source || "CRM",
      handler: requirement.handler,
      createTime: requirement.createTime || new Date().toISOString().replace("T", " ").substring(0, 16),
      expectedDealTime: requirement.expectedDealTime,
      remarks: requirement.remarks
    };
    setCrmRequirements(prev => [record, ...prev]);
    setCustomers(prev => prev.map(item => {
      if (item.id !== requirement.customerId) return item;
      return {
        ...item,
        crmStatus: record.stage === "已成交" ? "已成交" : "跟进中",
        crmStage: record.stage === "已关闭" ? item.crmStage : record.stage,
        owner: record.handler || item.owner,
        intent: record.intent,
        budget: record.budget,
        tags: Array.from(new Set([...(item.tags || []), "CRM需求"]))
      };
    }));
    addLog(`${currentRole} (系统)`, "CRM客户管理", "登记客户需求", customer.name, undefined, record.productDemand);
    postBackend("/api/gpu_erp/crm/requirement/create", requirement);
    return record;
  };

  const getCrmSummary = (filters: { owner?: string; status?: string; intent?: string; customerName?: string } = {}) => {
    const scopedCustomers = customers.filter(item => {
      const matchOwner = !filters.owner || (item.owner || "未分配") === filters.owner;
      const matchStatus = !filters.status || (item.crmStatus || "线索") === filters.status;
      const matchIntent = !filters.intent || (item.intent || "中") === filters.intent;
      const matchName = !filters.customerName || item.name.includes(filters.customerName);
      return matchOwner && matchStatus && matchIntent && matchName;
    });
    const customerIds = new Set(scopedCustomers.map(item => item.id));
    const scopedFollowUps = crmFollowUps.filter(item => customerIds.has(item.customerId));
    const scopedRequirements = crmRequirements.filter(item => customerIds.has(item.customerId));
    const today = new Date().toISOString().split("T")[0];
    const ownerMap = new Map<string, { owner: string; customers: number; followUps: number; requirements: number; highIntent: number }>();
    scopedCustomers.forEach(customer => {
      const owner = customer.owner || "未分配";
      const current = ownerMap.get(owner) || { owner, customers: 0, followUps: 0, requirements: 0, highIntent: 0 };
      current.customers += 1;
      current.highIntent += (customer.intent || "中") === "高" ? 1 : 0;
      ownerMap.set(owner, current);
    });
    scopedFollowUps.forEach(item => {
      const current = ownerMap.get(item.handler) || { owner: item.handler, customers: 0, followUps: 0, requirements: 0, highIntent: 0 };
      current.followUps += 1;
      ownerMap.set(item.handler, current);
    });
    scopedRequirements.forEach(item => {
      const current = ownerMap.get(item.handler) || { owner: item.handler, customers: 0, followUps: 0, requirements: 0, highIntent: 0 };
      current.requirements += 1;
      ownerMap.set(item.handler, current);
    });
    return {
      customers: scopedCustomers,
      followUps: scopedFollowUps,
      requirements: scopedRequirements,
      ownerSummary: Array.from(ownerMap.values()),
      totals: {
        customers: scopedCustomers.length,
        leads: scopedCustomers.filter(item => (item.crmStatus || "线索") === "线索").length,
        following: scopedCustomers.filter(item => (item.crmStatus || "线索") === "跟进中").length,
        deals: scopedCustomers.filter(item => (item.crmStatus || "线索") === "已成交").length,
        highIntent: scopedCustomers.filter(item => (item.intent || "中") === "高").length,
        pendingFollowUps: scopedCustomers.filter(item => item.nextFollowTime && item.nextFollowTime.slice(0, 10) <= today).length,
        requirements: scopedRequirements.length
      }
    };
  };

  const createVendor = (vend: any) => {
    const newVendor: Vendor = {
      id: `GY-${Date.now()}`,
      name: vend.name,
      partnerCategory: "同行",
      contactPerson: vend.name,
      phone: vend.contact || "",
      type: vend.type || "收货同行",
      totalBuyAmount: 0,
      totalCount: 0,
      avgProfit: 0,
      aftersalesCount: 0,
      aftersalesRate: 0,
      lastDealTime: new Date().toISOString().split("T")[0],
      accountPayable: vend.debtBalance || 0,
      accountPaid: 0,
      remarks: vend.remarks
    };
    setVendors(prev => [...prev, newVendor]);
    addLog(`${currentRole} (系统)`, "合伙/客商", "新建商号供应商", vend.name);
    postBackend("/api/vendors", vend);
  };

  const safeUser = (user: SystemUserAccount): SafeSystemUserAccount => {
    const { password: _password, ...sanitized } = user;
    return sanitized;
  };

  const getCurrentUser = (): SafeSystemUserAccount | null => {
    const current = systemUsers.find(user => user.id === currentUserId);
    return current ? safeUser(current) : null;
  };

  const getPermissions = (): PermissionSettings => {
    const base = customPermissions.find(p => p.role === currentRole) || defaultPermissions[0];
    const currentUser = systemUsers.find(user => user.id === currentUserId);
    if (!currentUser?.permissionOverrides) return base;
    return { ...base, ...currentUser.permissionOverrides, role: currentRole };
  };

  const login = async (username: string, password: string) => {
    let backendResponded = false;
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password })
      });
      backendResponded = true;
      const payload = await res.json();
      if (!res.ok) {
        throw new Error(payload?.error?.message || "账号或密码错误");
      }
      if (payload?.state) applyServerState(payload.state);
      const user = payload?.data?.user as SafeSystemUserAccount | undefined;
      const token = payload?.data?.token as string | undefined;
      if (!user || !token) throw new Error("登录响应缺少账号信息");
      setAuthToken(token);
      setCurrentUserId(user.id);
      setCurrentRole(user.role);
      setSystemUsers(prev => {
        const exists = prev.some(item => item.id === user.id);
        return exists ? prev.map(item => item.id === user.id ? { ...item, ...user } : item) : [user, ...prev];
      });
      return user;
    } catch (error) {
      if (backendResponded) {
        throw error instanceof Error ? error : new Error("登录失败");
      }
      console.warn("Backend login unavailable; using local emergency fallback.", error);
    }

    const matched = systemUsers.find(user => user.username.toLowerCase() === username.trim().toLowerCase());
    if (!matched || matched.password !== password) {
      throw new Error("账号或密码错误");
    }
    if (!matched.enabled) {
      throw new Error("账号已停用，请联系老板或管理员");
    }
    const loginTime = new Date().toISOString().replace("T", " ").substring(0, 16);
    const updatedUser = { ...matched, lastLoginTime: loginTime };
    setSystemUsers(prev => prev.map(user => user.id === matched.id ? updatedUser : user));
    setCurrentUserId(matched.id);
    setCurrentRole(matched.role);
    addLog(`${matched.displayName} (${matched.role})`, "账号登录", "登录系统", matched.username, undefined, `登录时间: ${loginTime}`);
    return safeUser(updatedUser);
  };

  const logout = () => {
    const current = systemUsers.find(user => user.id === currentUserId);
    if (current) {
      addLog(`${current.displayName} (${current.role})`, "账号登录", "退出系统", current.username);
    }
    setCurrentUserId(undefined);
    setAuthToken("");
    postBackend("/api/auth/logout");
  };

  const createUser = (input: Omit<SystemUserAccount, "id" | "lastLoginTime">) => {
    const username = input.username.trim();
    if (systemUsers.some(user => user.username.toLowerCase() === username.toLowerCase())) {
      throw new Error("账号已存在");
    }
    const newUser: SystemUserAccount = {
      ...input,
      id: `USR-${Date.now()}`,
      username,
      displayName: input.displayName.trim(),
      password: input.password?.trim(),
      permissionOverrides: input.permissionOverrides || {}
    };
    setSystemUsers(prev => [newUser, ...prev]);
    addLog(`${currentRole} (系统)`, "账号权限", "新增账号", username, undefined, `角色: ${newUser.role}`);
    postBackend("/api/users", input);
    return safeUser(newUser);
  };

  const updateUser = (id: string, input: Partial<SystemUserAccount>) => {
    const existing = systemUsers.find(user => user.id === id);
    if (!existing) throw new Error("账号不存在");
    const nextUsername = input.username?.trim();
    const nextDisplayName = input.displayName?.trim();
    if (nextUsername === "" || nextDisplayName === "") {
      throw new Error("账号和姓名不能为空");
    }
    if (nextUsername && systemUsers.some(user => user.id !== id && user.username.toLowerCase() === nextUsername.toLowerCase())) {
      throw new Error("账号已存在");
    }
    let updatedUser: SystemUserAccount | null = null;
    setSystemUsers(prev => prev.map(user => {
      if (user.id !== id) return user;
      updatedUser = {
        ...user,
        ...input,
        username: nextUsername || user.username,
        displayName: nextDisplayName || user.displayName,
        password: input.password ? input.password.trim() : user.password,
        permissionOverrides: input.permissionOverrides === undefined ? user.permissionOverrides : { ...(user.permissionOverrides || {}), ...input.permissionOverrides }
      };
      return updatedUser;
    }));
    if (updatedUser && currentUserId === id && input.role) {
      setCurrentRole(input.role);
    }
    postBackend(`/api/users/${encodeURIComponent(id)}`, input, "PUT");
    return updatedUser ? safeUser(updatedUser) : null;
  };

  const togglePermission = (key: keyof Omit<PermissionSettings, "role">) => {
    setCustomPermissions(prev =>
      prev.map(p => {
        if (p.role === currentRole) {
          return {
            ...p,
            [key]: !p[key]
          };
        }
        return p;
      })
    );
    postBackend(`/api/permissions/${String(key)}/toggle`, undefined, "PATCH");
  };

  const clearAllLogs = () => {
    setLogs([]);
    postBackend("/api/logs", undefined, "DELETE");
  };

  const reconcileLedgerItem = (id: string) => {
    setFinanceLedger(prev =>
      prev.map(item => {
        if (item.id === id) {
          return { ...item, status: "已复核" };
        }
        return item;
      })
    );
    addLog(`${currentRole} (系统)`, "财务总账", "复核财务流水", id, "未复核", "已复核");
    postBackend(`/api/finance-ledger/${encodeURIComponent(id)}/reconcile`, undefined, "PATCH");
  };

  const resetToInitialMock = () => {
    localStorage.clear();
    setProducts(initialProducts);
    setInventory(initialInventory);
    setInspections(initialInspections);
    setPurchaseInvoices(initialPurchaseInvoices);
    setSalesInvoices(initialSalesInvoices);
    setMarketQuotes(initialMarketQuotes);
    setAftersales(initialAftersales);
    setCustomers(initialCustomers);
    setCrmFollowUps([]);
    setCrmRequirements([]);
    setVendors(initialVendors);
    setLogs(initialLogs);
    setFinanceLedger(initialFinanceLedger);
    setSettlementAccounts(initialSettlementAccounts);
    setSettlementLedger([]);
    setPaymentInRecords([]);
    setPaymentOutRecords([]);
    setAccountTransfers([]);
    setAssemblyOperations([]);
    setSystemUsers(initialSystemUsers);
    setCurrentUserId(undefined);
    setCustomPermissions(defaultPermissions);
    setCurrentRole("老板");
    postBackend("/api/reset");
  };

  const setRole = (role: StoreRole) => {
    setCurrentRole(role);
    postBackend("/api/role", { role }, "PATCH");
  };

  return {
    products,
    inventory,
    inspections,
    purchaseInvoices,
    salesInvoices,
    marketQuotes,
    aftersales,
    customers,
    crmFollowUps,
    crmRequirements,
    vendors,
    logs,
    settlementAccounts,
    settlementLedger,
    paymentInRecords,
    paymentOutRecords,
    accountTransfers,
    assemblyOperations,
    systemUsers: systemUsers.map(safeUser),
    currentUser: getCurrentUser(),
    currentRole,
    setRole,
    permissions: getPermissions(),
    login,
    logout,
    createUser,
    updateUser,

    // Core Actions
    addProductTemplate,
    updateProductTemplate,
    deleteProductTemplate,
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
    addLog,
    togglePermission,
    clearAllLogs,
    resetToInitialMock,
    financeLedger,
    reconcileLedgerItem
  };
}
export type useStoreStateReturn = ReturnType<typeof useStoreState>;
