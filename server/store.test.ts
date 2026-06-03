import assert from "node:assert/strict";
import test from "node:test";
import { createInitialState, createStoreActions } from "./store.ts";

test("purchase invoice creates stock cards, updates vendor, product stock, ledger, and logs", () => {
  const state = createInitialState();
  const actions = createStoreActions(state);
  const product = state.products[0];

  const invoice = actions.createPurchaseInvoice({
    date: "2026-05-30",
    sourceType: "同行拿货",
    supplierName: "测试供应商",
    contact: "13800000000",
    paymentMethod: "微信",
    isPaid: false,
    paidAmount: 1000,
    unpaidAmount: 2000,
    handleBy: "店长",
    items: [
      {
        tempId: "tmp-1",
        productId: product.id,
        productName: product.name,
        category: product.category,
        model: product.model,
        brand: product.brand,
        version: product.version,
        vram: product.vram,
        sn: "TEST-SN-001",
        condition: "靓机95新",
        inWarranty: true,
        repaired: false,
        gpuRisk: false,
        fullBox: true,
        buyPrice: 3000,
        estSellPrice: 3600,
        warehouseLocation: "A-01",
      },
    ],
  });

  assert.equal(invoice.totalCount, 1);
  assert.equal(invoice.totalCost, 3000);
  assert.equal(state.inventory[0].sn, "TEST-SN-001");
  assert.equal(state.inventory[0].status, "待检测");
  assert.equal(state.products.find((item) => item.id === product.id)?.lastBuyPrice, 3000);
  assert.equal(state.vendors.find((item) => item.name === "测试供应商")?.accountPayable, 2000);
  assert.equal(state.financeLedger[0].relatedId, invoice.invoiceNo);
  assert.equal(state.financeLedger[0].amount, -3000);
  assert.equal(state.logs[0].module, "采购回收");
});

test("sales invoice marks inventory sold, updates customer, product stock, ledger, and logs", () => {
  const state = createInitialState();
  const actions = createStoreActions(state);
  const card = state.inventory.find((item) => item.status === "已入库" || item.status === "已上架");
  assert.ok(card);
  const originalStock = state.products.find((item) => item.id === card.productId)?.currentStock ?? 0;

  const invoice = actions.createSalesInvoice({
    date: "2026-05-30",
    customerName: "测试客户",
    contact: "13900000000",
    channel: "到店",
    paymentMethod: "支付宝",
    isPaid: true,
    paidAmount: card.estSellPrice,
    unpaidAmount: 0,
    needInvoice: false,
    freeShipping: true,
    aftersalesTerms: "店保三个月",
    handleBy: "店长",
    items: [
      {
        inventoryId: card.id,
        productId: card.productId,
        productName: card.productName,
        sn: card.sn,
        condition: card.condition,
        costPrice: card.costPrice,
        sellPrice: card.estSellPrice,
        profit: card.estSellPrice - card.costPrice,
        aftersalesTerms: "店保三个月",
      },
    ],
  });

  const soldCard = state.inventory.find((item) => item.id === card.id);
  assert.equal(invoice.totalProfit, card.estSellPrice - card.costPrice);
  assert.equal(soldCard?.status, "已售出");
  assert.equal(soldCard?.salesInvoiceId, invoice.invoiceNo);
  assert.equal(state.products.find((item) => item.id === card.productId)?.currentStock, Math.max(0, originalStock - 1));
  assert.equal(state.customers.find((item) => item.name === "测试客户")?.buyCount, 1);
  assert.equal(state.financeLedger[0].amount, card.estSellPrice);
  assert.equal(state.logs[0].module, "销售管理");
});

test("sales invoice rejects duplicate or unavailable inventory cards", () => {
  const state = createInitialState();
  const actions = createStoreActions(state);
  const card = state.inventory.find((item) => item.status === "已入库" || item.status === "已上架");
  assert.ok(card);
  const baseInvoice = {
    date: "2026-05-30",
    customerName: "防重复客户",
    contact: "13900000001",
    channel: "到店" as const,
    paymentMethod: "支付宝" as const,
    isPaid: true,
    paidAmount: card.estSellPrice,
    unpaidAmount: 0,
    needInvoice: false,
    freeShipping: true,
    aftersalesTerms: "店保三个月",
    handleBy: "店长",
  };
  const item = {
    inventoryId: card.id,
    productId: card.productId,
    productName: card.productName,
    sn: card.sn,
    condition: card.condition,
    costPrice: card.costPrice,
    sellPrice: card.estSellPrice,
    profit: card.estSellPrice - card.costPrice,
    aftersalesTerms: "店保三个月",
  };

  assert.throws(
    () => actions.createSalesInvoice({ ...baseInvoice, items: [item, item] }),
    /重复选择/,
  );

  actions.createSalesInvoice({ ...baseInvoice, items: [item] });
  assert.throws(
    () => actions.createSalesInvoice({ ...baseInvoice, customerName: "第二次销售", items: [item] }),
    /不可销售/,
  );
});

test("after-sales status completion returns the card to stock and reconciliation updates ledger status", () => {
  const state = createInitialState();
  const actions = createStoreActions(state);
  const soldCard = state.inventory.find((item) => item.status === "已售出") ?? state.inventory[0];

  const claim = actions.addAftersalesClaim({
    salesInvoiceNo: "XS-TEST",
    customerName: "售后客户",
    contact: "13700000000",
    inventoryNo: soldCard.id,
    productName: soldCard.productName,
    sn: soldCard.sn,
    type: "退货",
    desc: "测试退货",
    repairCost: 0,
    refundAmount: 100,
    finalResult: "",
  });

  assert.equal(state.inventory.find((item) => item.sn === soldCard.sn)?.status, "售后中");

  actions.updateAftersalesStatus(claim.id, { status: "已完成" });
  assert.equal(state.inventory.find((item) => item.sn === soldCard.sn)?.status, "已入库");

  const ledger = state.financeLedger.find((item) => item.status !== "已复核");
  assert.ok(ledger);
  actions.reconcileLedgerItem(ledger.id);
  assert.equal(state.financeLedger.find((item) => item.id === ledger.id)?.status, "已复核");
});

test("permissions, role, logs, and reset are persisted in one state object", () => {
  const state = createInitialState();
  const actions = createStoreActions(state);

  actions.setRole("财务");
  assert.equal(state.currentRole, "财务");
  const before = actions.getPermissions().showCost;
  actions.togglePermission("showCost");
  assert.equal(actions.getPermissions().showCost, !before);

  actions.addLog("tester", "模块", "动作", "对象");
  assert.equal(state.logs[0].user, "tester");
  actions.clearAllLogs();
  assert.equal(state.logs.length, 0);

  actions.resetToInitialMock();
  assert.equal(state.currentRole, "老板");
  assert.ok(state.logs.length > 0);
  assert.equal(actions.getPermissions().role, "老板");
});

test("user login binds role and account-level permission overrides", () => {
  const state = createInitialState();
  const actions = createStoreActions(state);

  const user = actions.login({ username: "sales", password: "sales123" });
  assert.equal(user?.username, "sales");
  assert.equal(Object.hasOwn(user ?? {}, "password"), false);
  assert.equal(state.currentRole, "店员");
  assert.equal(actions.getPermissions().showProfit, false);

  const created = actions.createUser({
    username: "cashier",
    password: "cashier123",
    displayName: "收银小李",
    role: "财务",
    enabled: true,
    permissionOverrides: { showProfit: false, allowedMenus: ["dashboard", "payment_in"] },
  });
  actions.updateUser(created.id, { password: "newpass123", permissionOverrides: { showCost: false } });
  const cashier = actions.login({ username: "cashier", password: "newpass123" });

  assert.equal(cashier?.displayName, "收银小李");
  assert.equal(state.currentRole, "财务");
  assert.equal(actions.getPermissions().showCost, false);
  assert.deepEqual(actions.getPermissions().allowedMenus, ["dashboard", "payment_in"]);

  actions.updateUser(created.id, { enabled: false });
  assert.throws(() => actions.login({ username: "cashier", password: "newpass123" }), /账号已停用/);
});

test("missing records and invalid permission keys do not create false audit entries", () => {
  const state = createInitialState();
  const actions = createStoreActions(state);
  const originalLogCount = state.logs.length;

  assert.throws(
    () => actions.updateProductTemplate({
      ...state.products[0],
      id: "SP-NOT-FOUND",
    }),
    /商品模板不存在/,
  );
  assert.equal(state.logs.length, originalLogCount);

  assert.equal(actions.reconcileLedgerItem("LS-NOT-FOUND"), null);
  assert.equal(state.logs.length, originalLogCount);

  assert.throws(
    () => actions.togglePermission("notARealPermission" as never),
    /权限字段不存在/,
  );
  assert.equal(Object.hasOwn(actions.getPermissions(), "notARealPermission"), false);
});

test("batch inventory update changes selected cards and writes an audit log", () => {
  const state = createInitialState();
  const actions = createStoreActions(state);
  const ids = state.inventory.slice(0, 2).map((item) => item.id);

  const updated = actions.batchUpdateInventory(ids, {
    status: "已上架",
    warehouseLocation: "测试库位-B01",
  });

  assert.equal(updated.length, 2);
  assert.equal(state.inventory.find((item) => item.id === ids[0])?.status, "已上架");
  assert.equal(state.inventory.find((item) => item.id === ids[1])?.warehouseLocation, "测试库位-B01");
  assert.equal(state.logs[0].type, "批量操作调配");
});

test("scan inventory flow supports inbound, outbound, relocation, and missing codes", () => {
  const state = createInitialState();
  const actions = createStoreActions(state);
  const card = state.inventory[0];

  const inbound = actions.scanInventoryFlow({
    codes: [card.sn, "NOT-A-SN"],
    mode: "入库",
    warehouseLocation: "扫码库位-A01",
    handler: "仓库小李",
  });
  assert.equal(inbound.updatedCount, 1);
  assert.equal(inbound.missingCount, 1);
  assert.equal(state.inventory.find((item) => item.id === card.id)?.status, "已入库");
  assert.equal(state.inventory.find((item) => item.id === card.id)?.warehouseLocation, "扫码库位-A01");

  const relocation = actions.scanInventoryFlow({
    codes: [card.id],
    mode: "移库",
    warehouseLocation: "扫码库位-B02",
    handler: "仓库小李",
  });
  assert.equal(relocation.updatedCount, 1);
  assert.equal(state.inventory.find((item) => item.id === card.id)?.warehouseLocation, "扫码库位-B02");

  const outbound = actions.scanInventoryFlow({
    codes: [card.id],
    mode: "出库",
    warehouseLocation: "已出库",
    handler: "仓库小李",
    target: "测试客户",
  });
  assert.equal(outbound.updatedCount, 1);
  assert.equal(state.inventory.find((item) => item.id === card.id)?.status, "已售出");
  assert.equal(state.inventory.find((item) => item.id === card.id)?.buyerName, "测试客户");

  const duplicateOutbound = actions.scanInventoryFlow({
    codes: [card.id],
    mode: "出库",
    handler: "仓库小李",
  });
  assert.equal(duplicateOutbound.updatedCount, 0);
  assert.match(duplicateOutbound.results[0].message, /不能重复出库/);
});

test("settlement accounts record payment-in, payment-out, transfers, ledgers, and summaries", () => {
  const state = createInitialState();
  const actions = createStoreActions(state);
  const account = actions.createSettlementAccount({
    name: "老板微信测试户",
    type: "微信",
    owner: "老板",
    platform: "微信",
    balance: 1000,
    availableBalance: 1000,
    frozenAmount: 0,
    enabled: true,
    allowNegative: true,
    remarks: "测试账户",
  });
  const bank = actions.createSettlementAccount({
    name: "对公银行卡测试户",
    type: "银行卡",
    owner: "公司",
    platform: "网银",
    balance: 0,
    availableBalance: 0,
    frozenAmount: 0,
    enabled: true,
    allowNegative: true,
  });

  const paymentIn = actions.createPaymentIn({
    customerName: "测试客户",
    accountId: account.id,
    amount: 18000,
    handler: "销售小王",
    paymentMethod: "微信",
    relatedDocType: "销售单",
    relatedDocNo: "SO-TEST-001",
    time: "2026-06-01 10:00",
    remarks: "RTX4090 收款",
  });
  assert.equal(paymentIn.amount, 18000);
  assert.equal(state.settlementAccounts.find((item) => item.id === account.id)?.balance, 19000);
  assert.equal(state.settlementLedger[0].businessType, "销售收款");
  assert.equal(state.financeLedger[0].settlementAccountId, account.id);

  const paymentOut = actions.createPaymentOut({
    supplierName: "测试供应商",
    accountId: bank.id,
    amount: 22000,
    handler: "财务小李",
    paymentMethod: "银行卡",
    relatedDocType: "采购单",
    relatedDocNo: "PO-TEST-001",
    time: "2026-06-01 11:00",
    businessType: "采购付款",
  });
  assert.equal(paymentOut.amount, 22000);
  assert.equal(state.settlementAccounts.find((item) => item.id === bank.id)?.balance, -22000);

  actions.createAccountTransfer({
    fromAccountId: account.id,
    toAccountId: bank.id,
    amount: 500,
    fee: 5,
    receivedAmount: 495,
    handler: "财务小李",
    time: "2026-06-01 12:00",
    remarks: "提现吗",
  });
  assert.equal(state.settlementAccounts.find((item) => item.id === account.id)?.balance, 18495);
  assert.equal(state.settlementAccounts.find((item) => item.id === bank.id)?.balance, -21505);

  const accountSummary = actions.getAccountSummary({ accountId: account.id });
  assert.equal(accountSummary.accounts[0].id, account.id);
  assert.ok(accountSummary.totals.income >= 18000);
  assert.ok(accountSummary.employeeSummary.find((item) => item.handler === "财务小李")?.paidAmount);
});

test("paid sales and purchase invoices create settlement ledger entries against selected accounts", () => {
  const state = createInitialState();
  const actions = createStoreActions(state);
  const receiptAccount = actions.createSettlementAccount({
    name: "销售收款账户",
    type: "微信",
    owner: "老板",
    platform: "微信",
    balance: 0,
    availableBalance: 0,
    frozenAmount: 0,
    enabled: true,
    allowNegative: true,
  });
  const paymentAccount = actions.createSettlementAccount({
    name: "采购付款账户",
    type: "支付宝",
    owner: "财务",
    platform: "支付宝",
    balance: 1000,
    availableBalance: 1000,
    frozenAmount: 0,
    enabled: true,
    allowNegative: true,
  });
  const card = state.inventory.find((item) => item.status === "已入库" || item.status === "已上架");
  assert.ok(card);

  const sale = actions.createSalesInvoice({
    date: "2026-06-01",
    customerName: "联动客户",
    contact: "13900000002",
    channel: "到店",
    paymentMethod: "微信",
    isPaid: true,
    paidAmount: card.estSellPrice,
    unpaidAmount: 0,
    needInvoice: false,
    freeShipping: true,
    aftersalesTerms: "店保三个月",
    handleBy: "销售小王",
    settlementAccountId: receiptAccount.id,
    settlementAccountName: receiptAccount.name,
    paymentHandler: "销售小王",
    paymentStatus: "已收款",
    items: [{
      inventoryId: card.id,
      productId: card.productId,
      productName: card.productName,
      sn: card.sn,
      condition: card.condition,
      costPrice: card.costPrice,
      sellPrice: card.estSellPrice,
      profit: card.estSellPrice - card.costPrice,
      aftersalesTerms: "店保三个月",
    }],
  });
  assert.equal(state.settlementLedger[0].relatedDocNo, sale.invoiceNo);
  assert.equal(state.settlementAccounts.find((item) => item.id === receiptAccount.id)?.balance, card.estSellPrice);

  const product = state.products[0];
  const purchase = actions.createPurchaseInvoice({
    date: "2026-06-01",
    sourceType: "同行拿货",
    supplierName: "联动供应商",
    contact: "13800000002",
    paymentMethod: "支付宝",
    isPaid: true,
    paidAmount: 500,
    unpaidAmount: 0,
    handleBy: "财务小李",
    settlementAccountId: paymentAccount.id,
    settlementAccountName: paymentAccount.name,
    paymentHandler: "财务小李",
    paymentStatus: "已付款",
    items: [{
      tempId: "tmp-link",
      productId: product.id,
      productName: product.name,
      category: product.category,
      model: product.model,
      brand: product.brand,
      version: product.version,
      vram: product.vram,
      sn: "LINK-PURCHASE-SN",
      condition: "靓机95新",
      inWarranty: true,
      repaired: false,
      gpuRisk: false,
      fullBox: true,
      buyPrice: 500,
      estSellPrice: 800,
      warehouseLocation: "测试位",
    }],
  });
  assert.equal(state.settlementLedger[0].relatedDocNo, purchase.invoiceNo);
  assert.equal(state.settlementAccounts.find((item) => item.id === paymentAccount.id)?.balance, 500);
});

test("standalone receipts and payments reduce customer receivables and supplier payables", () => {
  const state = createInitialState();
  const actions = createStoreActions(state);
  const account = actions.createSettlementAccount({
    name: "往来结算账户",
    type: "现金",
    owner: "门店",
    platform: "现金",
    balance: 0,
    availableBalance: 0,
    frozenAmount: 0,
    enabled: true,
    allowNegative: true,
  });
  const card = state.inventory.find((item) => item.status === "已入库" || item.status === "已上架");
  assert.ok(card);
  const sale = actions.createSalesInvoice({
    date: "2026-06-01",
    customerName: "欠款客户",
    contact: "13900000003",
    channel: "到店",
    paymentMethod: "账期欠款",
    isPaid: false,
    paidAmount: 0,
    unpaidAmount: card.estSellPrice,
    needInvoice: false,
    freeShipping: true,
    aftersalesTerms: "店保三个月",
    handleBy: "销售小王",
    items: [{
      inventoryId: card.id,
      productId: card.productId,
      productName: card.productName,
      sn: card.sn,
      condition: card.condition,
      costPrice: card.costPrice,
      sellPrice: card.estSellPrice,
      profit: card.estSellPrice - card.costPrice,
      aftersalesTerms: "店保三个月",
    }],
  });
  assert.equal(state.customers.find((item) => item.name === "欠款客户")?.debtBalance, card.estSellPrice);
  actions.createPaymentIn({
    customerName: "欠款客户",
    accountId: account.id,
    amount: 500,
    handler: "销售小王",
    paymentMethod: "现金",
    relatedDocType: "销售单",
    relatedDocNo: sale.invoiceNo,
    time: "2026-06-01 13:00",
  });
  assert.equal(state.salesInvoices.find((item) => item.invoiceNo === sale.invoiceNo)?.unpaidAmount, card.estSellPrice - 500);
  assert.equal(state.customers.find((item) => item.name === "欠款客户")?.debtBalance, card.estSellPrice - 500);

  const product = state.products[0];
  const purchase = actions.createPurchaseInvoice({
    date: "2026-06-01",
    sourceType: "同行拿货",
    supplierName: "欠款供应商",
    contact: "13800000003",
    paymentMethod: "欠款",
    isPaid: false,
    paidAmount: 0,
    unpaidAmount: 600,
    handleBy: "财务小李",
    items: [{
      tempId: "tmp-debt",
      productId: product.id,
      productName: product.name,
      category: product.category,
      model: product.model,
      brand: product.brand,
      version: product.version,
      vram: product.vram,
      sn: "DEBT-PURCHASE-SN",
      condition: "靓机95新",
      inWarranty: true,
      repaired: false,
      gpuRisk: false,
      fullBox: true,
      buyPrice: 600,
      estSellPrice: 900,
      warehouseLocation: "测试位",
    }],
  });
  assert.equal(state.vendors.find((item) => item.name === "欠款供应商")?.accountPayable, 600);
  actions.createPaymentOut({
    supplierName: "欠款供应商",
    accountId: account.id,
    amount: 200,
    handler: "财务小李",
    paymentMethod: "现金",
    businessType: "采购付款",
    relatedDocType: "采购单",
    relatedDocNo: purchase.invoiceNo,
    time: "2026-06-01 14:00",
  });
  assert.equal(state.purchaseInvoices.find((item) => item.invoiceNo === purchase.invoiceNo)?.unpaidAmount, 400);
  assert.equal(state.vendors.find((item) => item.name === "欠款供应商")?.accountPayable, 400);
});

test("crm customers, follow-ups, requirements, and summary stay linked", () => {
  const state = createInitialState();
  const actions = createStoreActions(state);

  const customer = actions.createCustomer({
    name: "CRM测试客户",
    contact: "13600000000",
    firstChannel: "微信私域",
    owner: "销售小王",
    crmStatus: "线索",
    crmStage: "新线索",
    level: "潜在客户",
    intent: "中",
    budget: 12000,
    remarks: "想买 4080S",
  });

  assert.equal(customer.owner, "销售小王");
  assert.equal(customer.crmStatus, "线索");
  assert.equal(state.customers.find((item) => item.id === customer.id)?.level, "潜在客户");

  const followUp = actions.createCrmFollowUp({
    customerId: customer.id,
    contactMethod: "微信",
    content: "确认预算和品牌偏好，客户倾向华硕。",
    result: "已报价",
    handler: "销售小王",
    followTime: "2026-06-03 10:00",
    nextFollowTime: "2026-06-04 11:00",
  });

  assert.equal(followUp.customerName, "CRM测试客户");
  assert.equal(state.crmFollowUps.length, 1);
  assert.equal(state.customers.find((item) => item.id === customer.id)?.crmStage, "报价中");
  assert.equal(state.customers.find((item) => item.id === customer.id)?.nextFollowTime, "2026-06-04 11:00");

  const requirement = actions.createCrmRequirement({
    customerId: customer.id,
    productDemand: "RTX 4080 SUPER 白色整机搭配",
    budget: 14500,
    intent: "高",
    stage: "报价中",
    source: "微信私域",
    handler: "销售小王",
    createTime: "2026-06-03 10:10",
    expectedDealTime: "2026-06-06",
  });

  assert.equal(requirement.customerName, "CRM测试客户");
  assert.equal(state.crmRequirements.length, 1);
  assert.equal(state.customers.find((item) => item.id === customer.id)?.intent, "高");
  assert.equal(state.customers.find((item) => item.id === customer.id)?.budget, 14500);

  const summary = actions.getCrmSummary({ owner: "销售小王" });
  assert.equal(summary.totals.customers, 1);
  assert.equal(summary.totals.highIntent, 1);
  assert.equal(summary.ownerSummary[0].owner, "销售小王");
  assert.equal(summary.ownerSummary[0].requirements, 1);
});

test("business invoices and finance documents can be edited", () => {
  const state = createInitialState();
  const actions = createStoreActions(state);
  const purchase = state.purchaseInvoices[0];
  const sales = state.salesInvoices[0];

  const updatedPurchase = actions.updatePurchaseInvoice(purchase.id, {
    supplierName: "编辑后的供应商",
    paidAmount: 123,
    unpaidAmount: 456,
    items: purchase.items.map((item, index) => index === 0 ? { ...item, buyPrice: item.buyPrice + 10 } : item),
  });
  assert.equal(updatedPurchase.supplierName, "编辑后的供应商");
  assert.equal(state.purchaseInvoices.find((item) => item.id === purchase.id)?.totalCost, updatedPurchase.totalCost);

  const updatedSale = actions.updateSalesInvoice(sales.id, {
    customerName: "编辑后的客户",
    paidAmount: 200,
    unpaidAmount: 300,
    items: sales.items.map((item, index) => index === 0 ? { ...item, sellPrice: item.sellPrice + 20, profit: item.profit + 20 } : item),
  });
  assert.equal(updatedSale.customerName, "编辑后的客户");
  assert.equal(state.salesInvoices.find((item) => item.id === sales.id)?.totalAmount, updatedSale.totalAmount);

  const accountA = actions.createSettlementAccount({
    name: "编辑测试账户A",
    type: "微信",
    owner: "老板",
    platform: "微信",
    balance: 1000,
    availableBalance: 1000,
    frozenAmount: 0,
    enabled: true,
    allowNegative: true,
  });
  const accountB = actions.createSettlementAccount({
    name: "编辑测试账户B",
    type: "银行卡",
    owner: "财务",
    platform: "银行",
    balance: 500,
    availableBalance: 500,
    frozenAmount: 0,
    enabled: true,
    allowNegative: true,
  });
  const paymentIn = actions.createPaymentIn({ customerName: "客户A", accountId: accountA.id, amount: 100, handler: "销售", paymentMethod: "微信", time: "2026-06-03 10:00" });
  actions.updatePaymentIn(paymentIn.id, { accountId: accountB.id, amount: 150, handler: "销售主管", paymentMethod: "银行卡", time: "2026-06-03 10:05" });
  assert.equal(state.paymentInRecords.find((item) => item.id === paymentIn.id)?.amount, 150);
  assert.equal(state.settlementAccounts.find((item) => item.id === accountA.id)?.balance, 1000);
  assert.equal(state.settlementAccounts.find((item) => item.id === accountB.id)?.balance, 650);

  const paymentOut = actions.createPaymentOut({ supplierName: "供应商A", accountId: accountB.id, amount: 50, handler: "财务", paymentMethod: "银行", businessType: "采购付款", time: "2026-06-03 11:00" });
  actions.updatePaymentOut(paymentOut.id, { accountId: accountA.id, amount: 80, handler: "财务主管", paymentMethod: "微信", time: "2026-06-03 11:05" });
  assert.equal(state.paymentOutRecords.find((item) => item.id === paymentOut.id)?.amount, 80);
  assert.equal(state.settlementAccounts.find((item) => item.id === accountA.id)?.balance, 920);
  assert.equal(state.settlementAccounts.find((item) => item.id === accountB.id)?.balance, 650);

  const transfer = actions.createAccountTransfer({ fromAccountId: accountA.id, toAccountId: accountB.id, amount: 100, fee: 5, receivedAmount: 95, handler: "财务", time: "2026-06-03 12:00" });
  actions.updateAccountTransfer(transfer.id, { fromAccountId: accountB.id, toAccountId: accountA.id, amount: 60, fee: 2, receivedAmount: 58, handler: "财务主管", time: "2026-06-03 12:05" });
  assert.equal(state.accountTransfers.find((item) => item.id === transfer.id)?.amount, 60);
  assert.equal(state.accountTransfers.find((item) => item.id === transfer.id)?.fromAccountId, accountB.id);
});
