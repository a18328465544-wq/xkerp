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
  PurchaseItem,
  SalesItem,
  SourceType,
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
  SystemUserAccount,
  SafeSystemUserAccount
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
    return hasLegacyMenus ? { ...permission, allowedMenus: defaultForRole.allowedMenus } : permission;
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

  const [systemUsers, setSystemUsers] = useState<SystemUserAccount[]>(() =>
    loadFromStorage("gpu_system_users", initialSystemUsers)
  );

  const [currentUserId, setCurrentUserId] = useState<string | undefined>(() => {
    return localStorage.getItem("gpu_current_user_id") || undefined;
  });

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
    if (next.systemUsers) setSystemUsers(next.systemUsers);
    if (Object.hasOwn(next, "currentUserId")) setCurrentUserId(next.currentUserId);
    if (next.currentRole) setCurrentRole(next.currentRole);
    if (next.customPermissions) setCustomPermissions(next.customPermissions);
  };

  const requestBackend = async (url: string, options?: RequestInit) => {
    try {
      const res = await fetch(url, {
        ...options,
        headers: {
          "Content-Type": "application/json",
          ...(options?.headers || {})
        }
      });
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
    void requestBackend("/api/state");
  }, []);

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
    saveToStorage("gpu_system_users", systemUsers);
  }, [systemUsers]);

  useEffect(() => {
    if (currentUserId) {
      localStorage.setItem("gpu_current_user_id", currentUserId);
    } else {
      localStorage.removeItem("gpu_current_user_id");
    }
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

  const createPaymentOut = (payment: Omit<PaymentOutRecord, "id" | "accountName">) => {
    postBackend("/api/gpu_erp/finance/payment-out/create", payment);
  };

  const updatePaymentOut = (id: string, payment: Partial<PaymentOutRecord>) => {
    setPaymentOutRecords(prev => prev.map(item => item.id === id ? { ...item, ...payment, id, accountName: settlementAccounts.find(account => account.id === (payment.accountId || item.accountId))?.name || item.accountName } : item));
    postBackend(`/api/gpu_erp/finance/payment-out/${encodeURIComponent(id)}`, payment, "PUT");
  };

  const createAccountTransfer = (transfer: Omit<AccountTransferRecord, "id" | "fromAccountName" | "toAccountName">) => {
    postBackend("/api/gpu_erp/finance/account-transfer/create", transfer);
  };

  const updateAccountTransfer = (id: string, transfer: Partial<AccountTransferRecord>) => {
    setAccountTransfers(prev => prev.map(item => item.id === id ? {
      ...item,
      ...transfer,
      id,
      fromAccountName: settlementAccounts.find(account => account.id === (transfer.fromAccountId || item.fromAccountId))?.name || item.fromAccountName,
      toAccountName: settlementAccounts.find(account => account.id === (transfer.toAccountId || item.toAccountId))?.name || item.toAccountName,
    } : item));
    postBackend(`/api/gpu_erp/finance/account-transfer/${encodeURIComponent(id)}`, transfer, "PUT");
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

      return {
        id: stockId,
        productId: it.productId,
        productName: it.productName,
        category: it.category || matchedTemplate?.category || "其他配件",
        model: it.model,
        brand: it.brand,
        version: it.version,
        vram: it.vram,
        sn: it.sn || `SN-UNASSIGNED-${Date.now()}-${index}`,
        sourceType: invoice.sourceType,
        supplierName: invoice.supplierName,
        costPrice: it.buyPrice,
        estSellPrice: it.estSellPrice,
        marketPrice,
        status: "待检测", // starts in "待检测" status as mandated!
        condition: it.condition,
        inWarranty: it.inWarranty,
        warrantyDate: it.warrantyDate,
        repaired: it.repaired,
        gpuRisk: it.gpuRisk,
        fullBox: it.fullBox,
        warehouseLocation: it.warehouseLocation || "质检区待转存",
        entryTime: invoice.date,
        storageDays: 0
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

    // Handle vendor dynamic values
    setVendors(prevVendors => {
      const existingVendor = prevVendors.find(v => v.name.trim() === invoice.supplierName.trim());
      if (existingVendor) {
        return prevVendors.map(v => {
          if (v.name.trim() === invoice.supplierName.trim()) {
            return {
              ...v,
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
        // Create new vendor
        const newVendor: Vendor = {
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
          remarks: "通过录入进货单自动新建"
        };
        return [...prevVendors, newVendor];
      }
    });

    addLog(
      `${currentRole} (系统)`,
      "采购回收",
      "录入进货单",
      invoiceNo,
      undefined,
      `金额: ¥${totalCost}, 支持一卡一档生成了 ${totalCount} 张独立显卡档案`
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

  // 3. INSPECTION AND DETAILED QUALITY ASSESSMENT
  const submitInspection = (report: Omit<InspectionRecord, "id" | "inspectTime">) => {
    const reportId = `JC-${Date.now()}`;
    const newReport: InspectionRecord = {
      ...report,
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
            status: updatedStatus,
            repaired: report.repaired || card.repaired,
            costPrice: finalCost,
            remarks: `${card.remarks || ""} (质检结果: ${report.resultStatus}. 烤机高热: ${report.temperature}℃. ${report.remarks || ""})`
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
      `质检状态: ${report.resultStatus}, 核心温度 ${report.temperature}℃, 结果: 后续状态已调整`
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
      totalProfit
    };

    // Pick Serial cards and lock state to "已售出" and record details
    const chosenIds = invoice.items.map(it => it.inventoryId);
    setInventory(prevInv => {
      return prevInv.map(card => {
        if (chosenIds.includes(card.id)) {
          const matchItem = invoice.items.find(it => it.inventoryId === card.id);
          return {
            ...card,
            status: "已售出",
            salesPrice: matchItem?.sellPrice,
            salesTime: invoice.date,
            salesInvoiceId: invoiceNo,
            buyerName: invoice.customerName
          };
        }
        return card;
      });
    });

    // Update Product Stock values
    setProducts(prevProducts => {
      return prevProducts.map(p => {
        const affectedQty = invoice.items.filter(item => {
          const matchingInventoryCard = inventory.find(c => c.id === item.inventoryId);
          return matchingInventoryCard?.productId === p.id;
        }).length;

        const latestSell = invoice.items.find(item => {
          const matchingInventoryCard = inventory.find(c => c.id === item.inventoryId);
          return matchingInventoryCard?.productId === p.id;
        })?.sellPrice;

        return {
          ...p,
          currentStock: Math.max(0, p.currentStock - affectedQty),
          lastSellPrice: latestSell || p.lastSellPrice,
          lastDealTime: invoice.date
        };
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
          type: "购买客户",
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
      "销售发货出库",
      invoiceNo,
      undefined,
      `数量: ${totalCount} 张, 金额: ¥${totalAmount}, 利润: ¥${totalProfit}`
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
        "行情大盘",
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

  const scanInventoryFlow = (input: {
    codes: string[];
    mode: InventoryScanMode;
    warehouseLocation?: string;
    handler?: string;
    target?: string;
    remarks?: string;
  }) => {
    const now = new Date();
    const time = now.toISOString().replace("T", " ").substring(0, 16);
    const today = now.toISOString().split("T")[0];
    const codes = Array.from(new Set((input.codes || []).map(code => code.trim()).filter(Boolean)));
    const results: InventoryScanResult[] = [];
    const patches = new Map<string, Partial<CardInventory>>();

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
      const remarkSuffix = `${time} ${input.handler || currentRole} 扫码${input.mode}${input.target ? `给 ${input.target}` : ""}${input.remarks ? `：${input.remarks}` : ""}`;
      const patch: Partial<CardInventory> = input.mode === "入库"
        ? { status: "已入库", warehouseLocation: input.warehouseLocation || card.warehouseLocation || "待分配库位", remarks: `${card.remarks || ""}${card.remarks ? "；" : ""}${remarkSuffix}` }
        : input.mode === "出库"
          ? { status: "已售出", warehouseLocation: input.warehouseLocation || "已出库", salesTime: today, buyerName: input.target || "扫码出库", remarks: `${card.remarks || ""}${card.remarks ? "；" : ""}${remarkSuffix}` }
          : { warehouseLocation: input.warehouseLocation || card.warehouseLocation, remarks: `${card.remarks || ""}${card.remarks ? "；" : ""}${remarkSuffix}` };
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
    addLog(`${currentRole} (系统)`, "行情大盘", "创建行情参考", quote.model, undefined, `新建议进价: ¥${quote.refBuyPrice}`);
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
      type: cust.type || "购买客户",
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
      partnerCategory: vend.partnerCategory || "同行",
      contactPerson: vend.name,
      phone: vend.contact || "",
      type: vend.type || "门店老熟客",
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

    const backendUser = await requestBackend("/api/auth/login", {
      method: "POST",
      body: JSON.stringify({ username, password })
    });
    if (backendUser) {
      return backendUser as SafeSystemUserAccount;
    }
    return safeUser(updatedUser);
  };

  const logout = () => {
    const current = systemUsers.find(user => user.id === currentUserId);
    if (current) {
      addLog(`${current.displayName} (${current.role})`, "账号登录", "退出系统", current.username);
    }
    setCurrentUserId(undefined);
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
      password: input.password.trim(),
      permissionOverrides: input.permissionOverrides || {}
    };
    setSystemUsers(prev => [newUser, ...prev]);
    addLog(`${currentRole} (系统)`, "账号权限", "新增账号", username, undefined, `角色: ${newUser.role}`);
    postBackend("/api/users", input);
    return safeUser(newUser);
  };

  const updateUser = (id: string, input: Partial<SystemUserAccount>) => {
    let updatedUser: SystemUserAccount | null = null;
    setSystemUsers(prev => prev.map(user => {
      if (user.id !== id) return user;
      updatedUser = {
        ...user,
        ...input,
        username: input.username ? input.username.trim() : user.username,
        displayName: input.displayName ? input.displayName.trim() : user.displayName,
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
    createPaymentOut,
    updatePaymentOut,
    createAccountTransfer,
    updateAccountTransfer,
    getAccountSummary,
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
    addLog,
    togglePermission,
    clearAllLogs,
    resetToInitialMock,
    financeLedger,
    reconcileLedgerItem
  };
}
export type useStoreStateReturn = ReturnType<typeof useStoreState>;
