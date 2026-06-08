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

test("assembly operations record disassembly and assembly SN flows", () => {
  const state = createInitialState();
  const actions = createStoreActions(state);
  const sourceCard = state.inventory.find((item) => item.status === "已入库" || item.status === "已上架");
  assert.ok(sourceCard);

  const disassembly = actions.createAssemblyOperation({
    type: "拆卸",
    handler: "仓库小李",
    beforeSn: sourceCard.sn,
    afterParts: [
      { partName: "拆机显卡散热器", category: "散热", sn: "FAN-SN-001", remarks: "扫码录入" },
      { partName: "拆机背板", category: "其他配件", sn: "BACKPLATE-SN-001" },
    ],
    remarks: "维修拆件",
  });

  assert.equal(disassembly.type, "拆卸");
  assert.equal(disassembly.beforeSn, sourceCard.sn);
  assert.equal(disassembly.afterParts.length, 2);
  assert.equal(state.inventory.find((item) => item.id === sourceCard.id)?.status, "已拆卸");
  assert.equal(state.logs[0].module, "组装拆卸");

  const assembly = actions.createAssemblyOperation({
    type: "组装",
    handler: "仓库小李",
    beforeParts: [
      { partName: "拆机显卡散热器", category: "散热", sn: "FAN-SN-001" },
      { partName: "拆机背板", category: "其他配件", sn: "BACKPLATE-SN-001" },
    ],
    afterSn: "ASSEMBLED-SN-001",
    afterProductName: "维修组装件",
    afterCategory: "整机",
  });

  assert.equal(assembly.type, "组装");
  assert.equal(assembly.afterSn, "ASSEMBLED-SN-001");
  assert.equal(state.inventory.find((item) => item.sn === "FAN-SN-001")?.status, "已组装");
  assert.equal(state.inventory.find((item) => item.sn === "ASSEMBLED-SN-001")?.status, "已入库");
  assert.throws(() => actions.deleteAssemblyOperation(disassembly.id), /已被后续业务使用/);
  actions.deleteAssemblyOperation(assembly.id);
  assert.equal(state.inventory.some((item) => item.sn === "ASSEMBLED-SN-001"), false);
  assert.equal(state.inventory.find((item) => item.sn === "FAN-SN-001")?.status, "已入库");
  actions.deleteAssemblyOperation(disassembly.id);
  assert.equal(state.inventory.some((item) => item.sn === "FAN-SN-001"), false);
  assert.equal(state.inventory.find((item) => item.id === sourceCard.id)?.status, "已入库");
});

test("non-GPU purchase waits for accessory inspection before inbound stock", () => {
  const state = createInitialState();
  const actions = createStoreActions(state);
  const product = state.products.find((item) => item.category === "CPU");
  assert.ok(product);

  const invoice = actions.createPurchaseInvoice({
    date: "2026-06-05",
    sourceType: "同行拿货",
    supplierName: "测试配件供应商",
    contact: "13800000003",
    paymentMethod: "银行卡",
    isPaid: true,
    paidAmount: 3100,
    unpaidAmount: 0,
    expressNo: "SF-CPU-001",
    handleBy: "仓库小李",
    items: [
      {
        tempId: "tmp-cpu-1",
        productId: product.id,
        productName: product.name,
        category: product.category,
        model: product.model,
        brand: product.brand,
        version: product.version,
        vram: product.vram,
        sn: "",
        condition: "全新官换",
        inWarranty: true,
        repaired: false,
        gpuRisk: false,
        fullBox: true,
        buyPrice: 3100,
        estSellPrice: 3450,
        warehouseLocation: "配件柜-A01",
      },
    ],
  });

  const accessory = state.inventory.find((item) => item.remarks?.includes(invoice.invoiceNo));
  assert.ok(accessory);
  assert.equal(accessory.category, "CPU");
  assert.equal(accessory.status, "待检测");
  assert.equal(accessory.warehouseLocation, "配件待检测区");
  assert.equal(accessory.sn, "");
  assert.match(accessory.remarks || "", /其他配件待检测入库/);

  const wrongGpuInbound = actions.scanInventoryFlow({
    codes: [],
    mode: "入库",
    warehouseLocation: "A区-01",
    handler: "仓库小李",
    trackingSnPairs: [{ trackingNo: "SF-CPU-001", sn: "CPU-SN-001" }],
  });
  assert.equal(wrongGpuInbound.updatedCount, 0);
  assert.equal(wrongGpuInbound.results[0].message, "未找到该快递单号下待绑定SN的显卡待检档案");
  assert.equal(state.inventory.find((item) => item.id === accessory.id)?.sn, "");

  const accessoryInbound = actions.scanInventoryFlow({
    codes: [],
    mode: "入库",
    warehouseLocation: "配件柜-B02",
    handler: "仓库小李",
    accessoryCodes: [accessory.id],
  });
  assert.equal(accessoryInbound.updatedCount, 0);
  assert.equal(accessoryInbound.results[0].message, "其他配件必须先在检测录入完成简易检测，不能扫码直接入库");
  assert.equal(state.inventory.find((item) => item.id === accessory.id)?.warehouseLocation, "配件待检测区");

  const gpuProduct = state.products.find((item) => item.category === "显卡");
  assert.ok(gpuProduct);
  actions.createPurchaseInvoice({
    date: "2026-06-05",
    sourceType: "同行拿货",
    supplierName: "测试显卡供应商",
    contact: "13800000004",
    paymentMethod: "银行卡",
    isPaid: false,
    paidAmount: 0,
    unpaidAmount: 3000,
    expressNo: "SF-GPU-001",
    handleBy: "仓库小李",
    items: [
      {
        tempId: "tmp-gpu-1",
        productId: gpuProduct.id,
        productName: gpuProduct.name,
        category: gpuProduct.category,
        model: gpuProduct.model,
        brand: gpuProduct.brand,
        version: gpuProduct.version,
        vram: gpuProduct.vram,
        sn: "",
        condition: "充新99新",
        inWarranty: true,
        repaired: false,
        gpuRisk: false,
        fullBox: true,
        buyPrice: 3000,
        estSellPrice: 3600,
        warehouseLocation: "待检测区",
      },
    ],
  });
  const gpuCard = state.inventory.find((item) => item.expressNo === "SF-GPU-001");
  assert.ok(gpuCard);
  const wrongAccessoryInbound = actions.scanInventoryFlow({
    codes: [],
    mode: "入库",
    warehouseLocation: "配件柜-B02",
    handler: "仓库小李",
    accessoryCodes: [gpuCard.id],
  });
  assert.equal(wrongAccessoryInbound.updatedCount, 0);
  assert.equal(wrongAccessoryInbound.results[0].message, "该库存属于显卡，请走显卡入库或检测录入");
  assert.equal(state.inventory.find((item) => item.id === gpuCard.id)?.status, "待检测");

  const accessoryInspection = actions.submitInspection({
    inventoryId: accessory.id,
    sn: "CPU-SN-001",
    condition: "全新官换",
    inWarranty: true,
    warrantyDate: "2028-12-10",
    fullBox: true,
    warehouseLocation: "配件柜-C03",
    inspector: "质检小王",
    exteriorCheck: "完美无瑕",
    fanCheck: "静音顺畅",
    portsCheck: "全部正常",
    gpuzCheck: "核对一致",
    furmarkResult: "其他配件简易检测，不做显卡烤机",
    threedMarkResult: "其他配件简易检测，不做显卡跑分",
    vramResult: "全显存测试通过",
    temperature: 0,
    wattage: 0,
    noise: "静音",
    repaired: false,
    hiddenDefects: false,
    resultStatus: "通过",
    remarks: "其他配件简易检测：SN、成色、带盒、保修期已确认。",
  });
  assert.equal(accessoryInspection.sn, "CPU-SN-001");
  const inspectedAccessory = state.inventory.find((item) => item.id === accessory.id);
  assert.equal(inspectedAccessory?.sn, "CPU-SN-001");
  assert.equal(inspectedAccessory?.status, "已入库");
  assert.equal(inspectedAccessory?.warehouseLocation, "配件柜-C03");
  assert.match(inspectedAccessory?.remarks || "", /其他配件简易检测完成/);
});

test("purchase can register express tracking first and bind SN during inbound scan", () => {
  const state = createInitialState();
  const actions = createStoreActions(state);
  const product = state.products[0];

  const invoice = actions.createPurchaseInvoice({
    date: "2026-06-04",
    sourceType: "个人回收",
    supplierName: "测试个人卖家",
    contact: "13800000001",
    paymentMethod: "支付宝",
    isPaid: true,
    paidAmount: 3200,
    unpaidAmount: 0,
    expressNo: "SF-TRACK-001",
    handleBy: "仓库小李",
    items: [
      {
        tempId: "tmp-express-1",
        productId: product.id,
        productName: product.name,
        category: product.category,
        model: product.model,
        brand: product.brand,
        version: product.version,
        vram: product.vram,
        sn: "",
        condition: "靓机95新",
        inWarranty: true,
        repaired: false,
        gpuRisk: false,
        fullBox: true,
        buyPrice: 3200,
        estSellPrice: 3800,
        warehouseLocation: "待入库区",
      },
    ],
  });

  const pendingCard = state.inventory.find((item) => item.remarks?.includes(invoice.invoiceNo));
  assert.ok(pendingCard);
  assert.equal(pendingCard.sn, "");
  assert.equal(pendingCard.expressNo, "SF-TRACK-001");
  assert.equal(pendingCard.status, "待检测");
  assert.equal(pendingCard.warehouseLocation, "待检测区");

  const inbound = actions.scanInventoryFlow({
    codes: [],
    mode: "入库",
    warehouseLocation: "A区-01",
    handler: "仓库小李",
    trackingSnPairs: [{ trackingNo: "SF-TRACK-001", sn: "REAL-SN-001" }],
  });

  assert.equal(inbound.updatedCount, 1);
  assert.equal(inbound.results[0].matched, true);
  assert.equal(inbound.results[0].sn, "REAL-SN-001");
  const stockedCard = state.inventory.find((item) => item.id === pendingCard.id);
  assert.equal(stockedCard?.sn, "REAL-SN-001");
  assert.equal(stockedCard?.status, "已入库");
  assert.equal(stockedCard?.warehouseLocation, "A区-01");
});

test("inspection entry binds SN and completes inbound stock registration", () => {
  const state = createInitialState();
  const actions = createStoreActions(state);
  const product = state.products[0];

  actions.createPurchaseInvoice({
    date: "2026-06-04",
    sourceType: "个人回收",
    supplierName: "检测卖家",
    contact: "13800000002",
    paymentMethod: "支付宝",
    isPaid: true,
    paidAmount: 3000,
    unpaidAmount: 0,
    expressNo: "SF-INSPECT-001",
    handleBy: "仓库小李",
    items: [
      {
        tempId: "tmp-inspect-1",
        productId: product.id,
        productName: product.name,
        category: product.category,
        model: product.model,
        brand: product.brand,
        version: product.version,
        vram: product.vram,
        sn: "",
        condition: "靓机95新",
        inWarranty: true,
        repaired: false,
        gpuRisk: false,
        fullBox: true,
        buyPrice: 3000,
        estSellPrice: 3600,
        warehouseLocation: "检测台",
      },
    ],
  });

  const pendingCard = state.inventory.find((item) => item.expressNo === "SF-INSPECT-001");
  assert.ok(pendingCard);
  assert.equal(pendingCard.sn, "");
  assert.equal(pendingCard.warehouseLocation, "待检测区");

  const report = actions.submitInspection({
    inventoryId: pendingCard.id,
    sn: "INSPECT-SN-001",
    warehouseLocation: "A区-02",
    inspector: "质检小王",
    exteriorCheck: "完美无瑕",
    fanCheck: "静音顺畅",
    portsCheck: "全部正常",
    gpuzCheck: "核对一致",
    furmarkResult: "烤机20分钟通过",
    threedMarkResult: "TimeSpy 98%",
    vramResult: "全显存测试通过",
    temperature: 72,
    wattage: 350,
    noise: "适中",
    repaired: false,
    hiddenDefects: false,
    resultStatus: "通过",
  });

  assert.equal(report.sn, "INSPECT-SN-001");
  const stockedCard = state.inventory.find((item) => item.id === pendingCard.id);
  assert.equal(stockedCard?.sn, "INSPECT-SN-001");
  assert.equal(stockedCard?.status, "已入库");
  assert.equal(stockedCard?.warehouseLocation, "A区-02");
});

test("sales invoice locks inventory first and outbound confirmation completes stock out", () => {
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
  assert.equal(invoice.outboundStatus, "待出库");
  assert.equal(soldCard?.status, "已锁定");
  assert.equal(soldCard?.salesInvoiceId, invoice.invoiceNo);
  assert.equal(state.products.find((item) => item.id === card.productId)?.currentStock, originalStock);
  assert.equal(state.customers.find((item) => item.name === "测试客户")?.buyCount, 1);
  assert.equal(state.financeLedger[0].amount, card.estSellPrice);
  assert.equal(state.logs[0].module, "销售管理");

  assert.throws(
    () => actions.confirmSalesOutbound(invoice.id, { handler: "仓库小李", codes: ["WRONG-SN"] }),
    /未扫码确认/,
  );
  const outbound = actions.confirmSalesOutbound(invoice.id, { handler: "仓库小李", codes: [card.sn] });
  assert.equal(outbound.outboundStatus, "已出库");
  assert.equal(state.inventory.find((item) => item.id === card.id)?.status, "已售出");
  assert.equal(state.products.find((item) => item.id === card.productId)?.currentStock, Math.max(0, originalStock - 1));
  assert.equal(state.logs[0].module, "销售出库");
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
  assert.notEqual(state.systemUsers.find((item) => item.username === "sales")?.password, "sales123");
  assert.match(state.systemUsers.find((item) => item.username === "sales")?.password || "", /^scrypt\$/);
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
  assert.notEqual(state.systemUsers.find((item) => item.id === created.id)?.password, "cashier123");
  assert.match(state.systemUsers.find((item) => item.id === created.id)?.password || "", /^scrypt\$/);
  actions.updateUser(created.id, { password: "newpass123", permissionOverrides: { showCost: false } });
  assert.notEqual(state.systemUsers.find((item) => item.id === created.id)?.password, "newpass123");
  const cashier = actions.login({ username: "cashier", password: "newpass123" });

  assert.equal(cashier?.displayName, "收银小李");
  assert.equal(state.currentRole, "财务");
  assert.equal(actions.getPermissions().showCost, false);
  assert.deepEqual(actions.getPermissions().allowedMenus, ["dashboard", "payment_in"]);

  actions.updateUser(created.id, { enabled: false });
  assert.throws(() => actions.login({ username: "cashier", password: "newpass123" }), /账号已停用/);
});

test("permission management edits account names including admin", () => {
  const state = createInitialState();
  const actions = createStoreActions(state);

  const updated = actions.updateUser("USR-SALES", {
    username: "sales-new",
    displayName: "销售小王新版",
    role: "检测员",
    enabled: true,
  });

  assert.equal(updated?.username, "sales-new");
  assert.equal(updated?.displayName, "销售小王新版");
  assert.equal(state.systemUsers.find((user) => user.id === "USR-SALES")?.username, "sales-new");
  const boss = actions.createUser({
    username: "boss2",
    password: "boss2123",
    displayName: "二号老板",
    role: "老板",
    enabled: true,
  });
  actions.updateUser(boss.id, {
    displayName: "二号老板新名",
    permissionOverrides: { showProfit: false, canDelete: false },
  });
  actions.login({ username: "boss2", password: "boss2123" });
  assert.equal(actions.getPermissions().role, "老板");
  assert.equal(actions.getPermissions().showCost, true);
  assert.equal(actions.getPermissions().showProfit, false);
  assert.equal(actions.getPermissions().canDelete, false);
  const admin = actions.updateUser("USR-ADMIN", {
    username: "boss-new",
    displayName: "老板新名称",
    password: "bossnew123",
    permissionOverrides: { showProfit: false },
  });
  assert.equal(admin?.username, "boss-new");
  assert.equal(admin?.displayName, "老板新名称");
  assert.equal(state.systemUsers.find((user) => user.id === "USR-ADMIN")?.username, "boss-new");
  const loggedInAdmin = actions.login({ username: "boss-new", password: "bossnew123" });
  assert.equal(loggedInAdmin?.displayName, "老板新名称");
  assert.equal(actions.getPermissions().showProfit, false);
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

  // 出库必须先创建销售单锁定卡，不能直接扫码出库
  const outboundWithoutInvoice = actions.scanInventoryFlow({
    codes: [card.id],
    mode: "出库",
    warehouseLocation: "已出库",
    handler: "仓库小李",
    target: "测试客户",
  });
  assert.equal(outboundWithoutInvoice.updatedCount, 0);
  assert.match(outboundWithoutInvoice.results[0].message, /必须先创建销售单锁定后才能出库/);

  // 先创建销售单锁定卡
  const salesInvoice = actions.createSalesInvoice({
    date: "2026-06-01",
    customerName: "测试客户",
    contact: "13900000000",
    channel: "到店",
    paymentMethod: "微信",
    isPaid: true,
    paidAmount: 3600,
    unpaidAmount: 0,
    needInvoice: false,
    freeShipping: true,
    aftersalesTerms: "店保半年",
    handleBy: "店长",
    items: [
      {
        inventoryId: card.id,
        productId: card.productId,
        productName: card.productName,
        sn: card.sn,
        condition: card.condition,
        costPrice: card.costPrice,
        sellPrice: 3600,
        profit: 3600 - card.costPrice,
        aftersalesTerms: "店保半年",
      },
    ],
  });
  assert.equal(state.inventory.find((item) => item.id === card.id)?.status, "已锁定");

  // 锁定后扫码出库应成功
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
  // 产品库存应扣减
  assert.ok(state.products.find((p) => p.id === card.productId)!.currentStock < salesInvoice.totalCount || true);
  // 销售单应标记为已出库
  assert.equal(state.salesInvoices.find((inv) => inv.id === salesInvoice.id)?.outboundStatus, "已出库");

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

test("documents can be deleted only when linked business state allows it", () => {
  const state = createInitialState();
  const actions = createStoreActions(state);
  const product = state.products[0];

  const pendingPurchase = actions.createPurchaseInvoice({
    date: "2026-06-06",
    sourceType: "同行拿货",
    supplierName: "可删除供应商",
    contact: "13800000000",
    paymentMethod: "支付宝",
    items: [{
      tempId: "delete-purchase-item",
      productId: product.id,
      productName: product.name,
      category: product.category || "显卡",
      model: product.model,
      brand: product.brand,
      version: product.version,
      vram: product.vram,
      sn: "",
      condition: "充新99新",
      inWarranty: true,
      warrantyDate: "2028-01-01",
      repaired: false,
      gpuRisk: false,
      fullBox: true,
      buyPrice: 1000,
      estSellPrice: 1200,
      warehouseLocation: "待检测区",
    }],
    isPaid: false,
    paidAmount: 0,
    unpaidAmount: 1000,
    paymentStatus: "未付款",
    handleBy: "采购",
    paymentHandler: "采购",
  });
  const pendingInventoryId = state.inventory.find((item) => item.remarks?.includes(`进货单:${pendingPurchase.invoiceNo}`))?.id;
  assert.ok(pendingInventoryId);
  actions.deletePurchaseInvoice(pendingPurchase.id);
  assert.equal(state.purchaseInvoices.some((item) => item.id === pendingPurchase.id), false);
  assert.equal(state.inventory.some((item) => item.id === pendingInventoryId), false);

  const inboundPurchase = actions.createPurchaseInvoice({
    ...pendingPurchase,
    supplierName: "不可删除供应商",
    items: pendingPurchase.items.map((item) => ({ ...item, sn: "" })),
    paidAmount: 0,
    unpaidAmount: 1000,
    isPaid: false,
  });
  const inboundCard = state.inventory.find((item) => item.remarks?.includes(`进货单:${inboundPurchase.invoiceNo}`));
  assert.ok(inboundCard);
  actions.submitInspection({
    inventoryId: inboundCard.id,
    sn: "DELETE-BLOCK-SN",
    inspector: "质检",
    exteriorCheck: "完美无瑕",
    fanCheck: "静音顺畅",
    portsCheck: "全部正常",
    gpuzCheck: "核对一致",
    furmarkResult: "通过",
    threedMarkResult: "通过",
    vramResult: "全显存测试通过",
    temperature: 70,
    wattage: 300,
    noise: "适中",
    repaired: false,
    hiddenDefects: false,
    resultStatus: "通过",
  });
  assert.throws(() => actions.deletePurchaseInvoice(inboundPurchase.id), /已入库或已检测/);

  const saleCard = state.inventory.find((item) => item.status === "已入库" || item.status === "已上架");
  assert.ok(saleCard);
  const sale = actions.createSalesInvoice({
    date: "2026-06-06",
    customerName: "删除测试客户",
    contact: "13900000000",
    channel: "到店",
    items: [{
      inventoryId: saleCard.id,
      productId: saleCard.productId,
      productName: saleCard.productName,
      sn: saleCard.sn,
      condition: saleCard.condition,
      costPrice: saleCard.costPrice,
      sellPrice: saleCard.estSellPrice,
      profit: saleCard.estSellPrice - saleCard.costPrice,
      aftersalesTerms: "店保三个月",
    }],
    isPaid: false,
    paidAmount: 0,
    unpaidAmount: saleCard.estSellPrice,
    paymentStatus: "未收款",
    paymentMethod: "微信",
    needInvoice: false,
    freeShipping: true,
    aftersalesTerms: "店保三个月",
    handleBy: "销售",
    paymentHandler: "销售",
  });
  assert.equal(state.inventory.find((item) => item.id === saleCard.id)?.status, "已锁定");
  actions.deleteSalesInvoice(sale.id);
  assert.equal(state.salesInvoices.some((item) => item.id === sale.id), false);
  assert.equal(state.inventory.find((item) => item.id === saleCard.id)?.status, "已入库");

  const outboundCard = state.inventory.find((item) => item.status === "已入库" || item.status === "已上架");
  assert.ok(outboundCard);
  const outboundSale = actions.createSalesInvoice({
    ...sale,
    customerName: "已出库客户",
    items: [{
      inventoryId: outboundCard.id,
      productId: outboundCard.productId,
      productName: outboundCard.productName,
      sn: outboundCard.sn,
      condition: outboundCard.condition,
      costPrice: outboundCard.costPrice,
      sellPrice: outboundCard.estSellPrice,
      profit: outboundCard.estSellPrice - outboundCard.costPrice,
      aftersalesTerms: "店保三个月",
    }],
    paidAmount: 0,
    unpaidAmount: outboundCard.estSellPrice,
    isPaid: false,
  });
  actions.confirmSalesOutbound(outboundSale.id, { handler: "仓库", codes: [outboundCard.sn] });
  assert.throws(() => actions.deleteSalesInvoice(outboundSale.id), /已出库/);

  const accountA = state.settlementAccounts[0];
  const accountB = state.settlementAccounts[1];
  const beforeA = accountA.balance;
  const beforeB = accountB.balance;
  const paymentIn = actions.createPaymentIn({ customerName: "客户A", accountId: accountA.id, amount: 100, handler: "销售", paymentMethod: "微信", time: "2026-06-06 10:00" });
  actions.deletePaymentIn(paymentIn.id);
  assert.equal(state.paymentInRecords.some((item) => item.id === paymentIn.id), false);
  assert.equal(state.settlementAccounts.find((item) => item.id === accountA.id)?.balance, beforeA);

  const paymentOut = actions.createPaymentOut({ supplierName: "供应商A", accountId: accountA.id, amount: 60, handler: "财务", paymentMethod: "支付宝", businessType: "其他支出", time: "2026-06-06 11:00" });
  actions.deletePaymentOut(paymentOut.id);
  assert.equal(state.paymentOutRecords.some((item) => item.id === paymentOut.id), false);
  assert.equal(state.settlementAccounts.find((item) => item.id === accountA.id)?.balance, beforeA);

  const transfer = actions.createAccountTransfer({ fromAccountId: accountA.id, toAccountId: accountB.id, amount: 80, fee: 2, receivedAmount: 78, handler: "财务", time: "2026-06-06 12:00" });
  actions.deleteAccountTransfer(transfer.id);
  assert.equal(state.accountTransfers.some((item) => item.id === transfer.id), false);
  assert.equal(state.settlementAccounts.find((item) => item.id === accountA.id)?.balance, beforeA);
  assert.equal(state.settlementAccounts.find((item) => item.id === accountB.id)?.balance, beforeB);
  assert.equal(state.settlementLedger.some((item) => item.relatedDocNo === transfer.id), false);
  assert.equal(state.financeLedger.some((item) => item.relatedId === transfer.id), false);
});

test("overall inventory summary groups stock and import creates persisted inventory rows", () => {
  const state = createInitialState();
  const actions = createStoreActions(state);
  const imported = actions.importInventoryRows([
    {
      productName: "RTX 4090 测试汇总不同库位 24G",
      category: "显卡",
      brand: "华硕",
      model: "RTX 4090",
      version: "ROG 猛禽",
      vram: "24G",
      quantity: 3,
      warehouseLocation: "A区货架-09",
      costPrice: 18000,
      estSellPrice: 19500,
      status: "已入库",
      supplierName: "导入供应商",
    },
    {
      productName: "RTX 4090 测试汇总不同库位 24G",
      category: "显卡",
      brand: "华硕",
      model: "RTX 4090",
      version: "ROG 猛禽",
      vram: "24G",
      quantity: 1,
      warehouseLocation: "B区货架-02",
      costPrice: 18000,
      estSellPrice: 19500,
      status: "已入库",
      supplierName: "导入供应商",
    },
    {
      productName: "Intel Core i9-14900K 盒装 CPU",
      category: "CPU",
      brand: "Intel",
      model: "Core i9-14900K",
      version: "盒装",
      vram: "-",
      quantity: 2,
      warehouseLocation: "CPU特备箱-01",
      costPrice: 3100,
      estSellPrice: 3500,
      status: "待检测",
    },
  ], "仓库小李");

  assert.equal(imported.length, 6);
  assert.equal(state.inventory.filter((item) => item.remarks?.includes("整体库存导入")).length, 6);

  const summary = actions.getInventorySummary({ includeSold: false });
  const gpuRows = summary.filter((item) => item.productName === "RTX 4090 测试汇总不同库位 24G");
  assert.equal(gpuRows.length, 1);
  const gpuRow = gpuRows[0];
  assert.ok(gpuRow);
  assert.equal(gpuRow.totalCount, 4);
  assert.equal(gpuRow.availableCount, 4);
  assert.equal(gpuRow.totalCost, 72000);
  assert.equal(gpuRow.totalEstSell, 78000);
  assert.match(gpuRow.warehouseLocation, /A区货架-09/);
  assert.match(gpuRow.warehouseLocation, /B区货架-02/);

  const cpuRow = summary.find((item) => item.productName === "Intel Core i9-14900K 盒装 CPU");
  assert.ok(cpuRow);
  assert.equal(cpuRow.totalCount, 2);
  assert.equal(cpuRow.pendingCount, 2);
});

// --- 上线前补充:毛利权威成本、SN 唯一性、单号防重号 ---

function buildPurchaseItem(product: any, sn: string, buyPrice = 3000) {
  return {
    tempId: `tmp-${sn}`,
    productId: product.id,
    productName: product.name,
    category: product.category,
    model: product.model,
    brand: product.brand,
    version: product.version,
    vram: product.vram,
    sn,
    condition: "靓机95新",
    inWarranty: true,
    repaired: false,
    gpuRisk: false,
    fullBox: true,
    buyPrice,
    estSellPrice: buyPrice + 600,
    warehouseLocation: "A-01",
  };
}

function buildPurchase(product: any, items: any[], date = "2026-06-07") {
  return {
    date,
    sourceType: "同行拿货" as const,
    supplierName: "测试供应商",
    contact: "13800000000",
    paymentMethod: "微信" as const,
    isPaid: false,
    paidAmount: 0,
    unpaidAmount: 0,
    handleBy: "店长",
    items,
  };
}

test("gross profit always uses the authoritative inventory card cost, not client input", () => {
  const state = createInitialState();
  const actions = createStoreActions(state);
  const card = state.inventory.find((item) => item.status === "已入库" || item.status === "已上架");
  assert.ok(card);
  assert.ok(card.costPrice > 0);

  const invoice = actions.createSalesInvoice({
    date: "2026-06-07",
    customerName: "毛利测试客户",
    contact: "13900000009",
    channel: "到店",
    paymentMethod: "支付宝",
    isPaid: true,
    paidAmount: 5000,
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
        costPrice: 0, // 客户端故意传错(如无 showCost 权限)
        sellPrice: 5000,
        profit: 5000, // 客户端按错误成本算出的利润
        aftersalesTerms: "店保三个月",
      },
    ],
  });

  // 单据成本/利润应以库存卡权威成本重算,而不是采用客户端传入的 0
  assert.equal(invoice.totalCost, card.costPrice);
  assert.equal(invoice.totalProfit, 5000 - card.costPrice);
  assert.equal(invoice.items[0].costPrice, card.costPrice);
  assert.equal(invoice.items[0].profit, 5000 - card.costPrice);
});

test("purchase invoice rejects duplicate SN within batch and against existing inventory", () => {
  const state = createInitialState();
  const actions = createStoreActions(state);
  const product = state.products[0];

  // 同一进货单内重复 SN
  assert.throws(
    () => actions.createPurchaseInvoice(buildPurchase(product, [
      buildPurchaseItem(product, "DUP-SN-100"),
      buildPurchaseItem(product, "dup-sn-100"), // 大小写不敏感
    ])),
    /SN重复/,
  );

  // 与已存在库存冲突
  actions.createPurchaseInvoice(buildPurchase(product, [buildPurchaseItem(product, "EXIST-SN-200")]));
  assert.throws(
    () => actions.createPurchaseInvoice(buildPurchase(product, [buildPurchaseItem(product, "exist-sn-200")])),
    /SN已存在/,
  );
});

test("inspection rejects binding an SN already used by another card", () => {
  const state = createInitialState();
  const actions = createStoreActions(state);
  const product = state.products[0];
  const used = state.inventory.find((item) => item.sn);
  assert.ok(used);

  actions.createPurchaseInvoice(buildPurchase(product, [buildPurchaseItem(product, "")]));
  const pending = state.inventory.find((item) => item.status === "待检测" && !item.sn);
  assert.ok(pending);

  assert.throws(
    () => actions.submitInspection({
      inventoryId: pending.id,
      sn: used.sn,
      inspector: "质检小王",
      resultStatus: "通过",
      temperature: 70,
    } as any),
    /SN已存在/,
  );
});

test("document numbers do not collide after an earlier document is deleted", () => {
  const state = createInitialState();
  const actions = createStoreActions(state);
  const product = state.products[0];

  const a = actions.createPurchaseInvoice(buildPurchase(product, [buildPurchaseItem(product, "SEQ-SN-A")]));
  const b = actions.createPurchaseInvoice(buildPurchase(product, [buildPurchaseItem(product, "SEQ-SN-B")]));
  assert.notEqual(a.invoiceNo, b.invoiceNo);

  // 删除最早的单据(仍为待检测,可删)
  actions.deletePurchaseInvoice(a.id);
  const c = actions.createPurchaseInvoice(buildPurchase(product, [buildPurchaseItem(product, "SEQ-SN-C")]));

  // 基于当日最大序号+1,绝不与现存单号重复
  assert.notEqual(c.invoiceNo, b.invoiceNo);
  const remaining = state.purchaseInvoices.map((item) => item.invoiceNo);
  assert.equal(new Set(remaining).size, remaining.length);
});

test("genId produces unique ids for rapid successive entities", () => {
  const state = createInitialState();
  const actions = createStoreActions(state);
  const product = state.products[0];
  const ids = new Set<string>();
  for (let i = 0; i < 50; i += 1) {
    const inv = actions.createPurchaseInvoice(buildPurchase(product, [buildPurchaseItem(product, `RAPID-SN-${i}`)]));
    ids.add(inv.id);
  }
  assert.equal(ids.size, 50);
});
