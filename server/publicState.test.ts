import assert from "node:assert/strict";
import test from "node:test";
import { createInitialState } from "./store.ts";
import { getPermissionsForUser, publicCollectionForUser, publicStateForUser, publicStateMergeForUser, publicMarketQuoteProductsForUser, publicMarketQuoteInventoryForUser, publicMarketQuoteStockCountForUser, projectMarketQuoteForUser } from "./publicState.ts";
import { storeDateAfterDays } from "../src/utils/storeTime.ts";
import {createStoreActions} from "./store.ts";
import {coreQuoteProfile} from "../src/utils/quoteReference.ts";

test("公开库存状态按入库日期实时计算库龄", () => {
  const state = createInitialState({includeDemoData: true});
  const card = state.inventory[0];
  assert.ok(card);
  card.entryTime = storeDateAfterDays(-11);
  card.storageDays = 0;

  const publicState = publicStateForUser(state);
  const publicCard = publicState.inventory.find((item) => item.id === card.id);
  assert.equal(publicCard?.storageDays, 11);

  const publicCollection = publicCollectionForUser(state, "inventory") as typeof state.inventory;
  const collectionCard = publicCollection.find((item) => item.id === card.id);
  assert.equal(collectionCard?.storageDays, 11);
});

test("老板账号始终保留完整经营权限，不受历史覆盖项限制", () => {
  const state = createInitialState();
  const owner = state.systemUsers.find(user => user.role === "老板");
  assert.ok(owner);
  owner.permissionOverrides = {
    canManualOutbound: false,
    canDelete: false,
    canEditHistory: false,
    showCost: false,
    showProfit: false,
    allowedMenus: ["dashboard"],
  };

  const permissions = getPermissionsForUser(state, owner);
  assert.equal(permissions.canManualOutbound, true);
  assert.equal(permissions.canDelete, true);
  assert.equal(permissions.canEditHistory, true);
  assert.equal(permissions.showCost, true);
  assert.equal(permissions.showProfit, true);
  assert.deepEqual(permissions.allowedMenus, ["all"]);
});

test("全量状态按菜单权限裁剪业务集合，不把前端隐藏当作安全边界", () => {
  const state = createInitialState();
  const restricted = state.systemUsers.find((user) => user.role === "店员");
  assert.ok(restricted);
  restricted.permissionOverrides = {
    allowedMenus: ["dashboard"],
    showCost: false,
    showProfit: false,
  };

  const scoped = publicStateForUser(state, restricted, "full");
  assert.deepEqual(scoped.financeLedger, []);
  assert.deepEqual(scoped.settlementLedger, []);
  assert.deepEqual(scoped.paymentInRecords, []);
  assert.deepEqual(scoped.paymentOutRecords, []);
  assert.deepEqual(scoped.accountTransfers, []);
  assert.deepEqual(scoped.customers, []);
  assert.deepEqual(scoped.vendors, []);
  assert.deepEqual(scoped.purchaseInvoices, []);
  assert.ok(scoped.salesInvoices.length > 0);
  assert.deepEqual(scoped.customPermissions.map((item) => item.role), [restricted.role]);
  assert.deepEqual(publicCollectionForUser(state, "financeLedger", restricted), []);
  assert.deepEqual(publicCollectionForUser(state, "customers", restricted), []);
});

test("创建采购所需的候选数据只向具备采购入口的账号开放", () => {
  const state = createInitialState();
  const clerk = state.systemUsers.find((user) => user.role === "店员");
  assert.ok(clerk);
  const scoped = publicStateForUser(state, clerk, "full");
  assert.ok(scoped.products.length > 0);
  assert.ok(scoped.customers.length > 0);
  assert.ok(scoped.vendors.length > 0);
  assert.deepEqual(scoped.financeLedger, []);
});

test("行情价格和历史点在服务端按账号权限裁剪", () => {
  const state = createInitialState({includeDemoData: true});
  const clerk = state.systemUsers.find((user) => user.role === "店员");
  assert.ok(clerk);
  clerk.permissionOverrides = {
    allowedMenus: ["quotes"],
    showCost: false,
    showProfit: false,
  };
  const quote = state.marketQuotes[0];
  assert.ok(quote);
  quote.history = [{date: "2026-08-31", buyPrice: 18000, sellPrice: 19500}];

  const scoped = publicStateForUser(state, clerk, "full");
  const projected = scoped.marketQuotes.find((item) => item.id === quote.id) as unknown as Record<string, unknown> | undefined;
  assert.ok(projected);
  assert.equal(projected.refBuyPrice, undefined);
  assert.equal(projected.refSellPrice, undefined);
  assert.equal(projected.changeAmount, undefined);
  assert.deepEqual(projected.history, [{date: "2026-08-31"}]);

  const collection = publicCollectionForUser(state, "marketQuotes", clerk) as unknown as Array<Record<string, unknown>>;
  assert.equal(collection[0]?.todayBuyPrice, undefined);
  assert.equal(collection[0]?.todaySellPrice, undefined);
});

test("quote projection hides absent-price flags and trend while preserving qualified history keys", () => {
  const state = createInitialState({includeDemoData: true});
  const quote = {...state.marketQuotes[0], refBuyPrice: null, refSellPrice: 0, validUntil: "2000-01-01", history: [{date: "2026-10-13 12:00:00", buyPrice: null, sellPrice: 0, quoteKey: "qualified|used"}]};
  const hidden = projectMarketQuoteForUser(quote, {showCost: false, showProfit: false}) as unknown as Record<string, unknown>;
  for (const key of ["refBuyPrice", "refSellPrice", "todayBuyPrice", "todaySellPrice", "minPrice", "maxPrice", "changeAmount", "changeRatio", "trend"]) assert.equal(key in hidden, false, key);
  assert.deepEqual(hidden.history, [{date: "2026-10-13 12:00:00", quoteKey: "qualified|used"}]);
  assert.equal(hidden.expired, true);
  const visible = projectMarketQuoteForUser(quote, {showCost: true, showProfit: true});
  assert.equal(visible.refBuyPrice, null);
  assert.equal(visible.refSellPrice, 0);
  assert.deepEqual(visible.history, quote.history);
});

test("quote candidate products are minimal and infer only safe commercial GPU identities", () => {
  const state = createInitialState({includeDemoData: true});
  const owner = state.systemUsers.find(user => user.role === "老板")!;
  const seed = state.products[0];
  state.products = [
    {...seed, id: "VALID", name: "华硕 RTX5090D V2 24G", category: "显卡", model: "RTX5090D V2", vram: "24G"},
    {...seed, id: "AMBIGUOUS", name: "RTX5090 / RTX4090", category: "显卡", model: "RTX5090 / RTX4090"},
    {...seed, id: "CONFLICT", name: "RTX4090", category: "显卡", model: "RTX5090"},
    {...seed, id: "NOT-GPU", name: "RTX5090", category: "CPU", model: "RTX5090"},
  ];
  const options = publicMarketQuoteProductsForUser(state, owner);
  assert.equal(options[0].coreId, "GPU-NVIDIA-RTX5090DV2");
  assert.ok(options.slice(1).every(product => product.coreId === undefined));
  for (const product of options) {
    assert.deepEqual(Object.keys(product).filter(key => !["id", "name", "category", "brand", "model", "version", "vram", "coreId", "coreModel"].includes(key)), []);
  }
  assert.deepEqual(publicMarketQuoteProductsForUser(state), []);
});

test("quote-only inventory exposes no physical profile or SN/location and deduplicates matching units", () => {
  const state = createInitialState({includeDemoData: true});
  state.marketQuotes = [];
  const clerk = {...state.systemUsers.find(user => user.role === "店员")!, permissionOverrides: {allowedMenus: ["quotes"], showCost: false, showProfit: false}};
  const product = {...state.products[0], id: "MATCH", name: "RTX5090", model: "RTX5090", category: "显卡" as const, vram: "32G"};
  state.products = [product];
  const card = {...state.inventory[0], id: "UNIT", productId: product.id, condition: "95新" as const, inWarranty: true, fullBox: true, vram: "32G", status: "已入库" as const};
  state.inventory = [card, {...card}, {...card, id: "NEW", condition: "全新"}, {...card, id: "SOLD", status: "已售出"}, {...card, id: "OTHER-VRAM", vram: "24G"}];
  const actions = createStoreActions(state);
  const quote = actions.createMarketQuote({model: "RTX5090", brand: "NVIDIA", quoteScope: "core", coreModel: "RTX5090", source: "门店", refBuyPrice: null, refSellPrice: 200,
    profile: {condition: "used", grade: "any", warranty: "any", packaging: "any", vram: "32G", currency: "CNY"}});
  const rows = publicMarketQuoteInventoryForUser(state, clerk);
  assert.equal(rows.length, 4);
  assert.deepEqual(Object.keys(rows[0]), ["id", "productId", "status"]);
  for (const row of rows) for (const hidden of ["condition", "inWarranty", "fullBox", "vram", "profile", "sn", "warehouseLocation", "buyerName", "supplierName", "costPrice", "estSellPrice", "marketPrice"]) assert.equal(hidden in row, false);
  assert.equal(publicMarketQuoteStockCountForUser(state, clerk), 3);
  state.marketQuotes[0] = {...quote, validUntil: "2000-01-01"};
  assert.equal(publicMarketQuoteStockCountForUser(state, clerk), 0);
  state.marketQuotes = [quote, {...quote, id: "DUPLICATE"}];
  assert.equal(publicMarketQuoteStockCountForUser(state, clerk), 0);
  state.marketQuotes = [{...quote, quoteScope: undefined, coreId: undefined, profile: undefined}];
  assert.equal(publicMarketQuoteStockCountForUser(state, clerk), 0);
});

test("public log patches mask textual amounts for accounts with either price permission missing", () => {
  const state = createInitialState({includeDemoData: true});
  const clerk = {...state.systemUsers.find(user => user.role === "店员")!, permissionOverrides: {allowedMenus: ["logs"], showCost: false, showProfit: true}};
  state.logs = [{...state.logs[0], beforeVal: "最新回收: 20000", afterVal: "最新销售: 22000"}];
  const patch = publicStateMergeForUser(state, {logs: state.logs}, clerk);
  assert.ok(patch.logs?.length);
  assert.equal("beforeVal" in (patch.logs[0] as object), false);
  assert.equal("afterVal" in (patch.logs[0] as object), false);
  assert.equal(state.logs[0].beforeVal, "最新回收: 20000");
});

test("base core counts all physical variants once and ignores historical product prices", () => {
  const state = createInitialState({includeDemoData: true});
  const owner = state.systemUsers.find(user => user.role === "老板")!;
  const product = {...state.products[0], id: "REAL", name: "RTX5090", model: "RTX5090", category: "显卡" as const, vram: "32G"};
  state.products = [product, {...product, id: "SMALL", vram: "24G"}];
  const card = {...state.inventory[0], id: "USED", productId: "REAL", condition: "95新" as const, status: "已入库" as const, vram: "32G"};
  state.inventory = [card, {...card}, {...card, id: "NEW", condition: "全新"}, {...card, id: "SMALL", productId: "SMALL", vram: "24G"}, {...card, id: "UNKNOWN", condition: undefined, inWarranty: undefined, fullBox: undefined, vram: ""}] as typeof state.inventory;
  state.marketQuotes = [];
  const actions = createStoreActions(state);
  const base = actions.createMarketQuote({model: "RTX5090", quoteScope: "core", coreModel: "RTX5090", source: "门店", refBuyPrice: 100, refSellPrice: 200});
  assert.equal(publicMarketQuoteStockCountForUser(state, owner), 4);
  const specific = {...base, id: "HIST-PRODUCT", quoteScope: "product" as const, productId: "REAL", refBuyPrice: 110, refSellPrice: 210,
    profile: {condition: "used" as const, grade: "95新", warranty: "any" as const, packaging: "any" as const, vram: "32G", currency: "CNY" as const}};
  state.marketQuotes.push(specific);
  assert.equal(publicMarketQuoteStockCountForUser(state, owner), 4);
  state.marketQuotes = [specific];
  assert.equal(publicMarketQuoteStockCountForUser(state, owner), 0);
  const old = {...base, id: "OLD", profile: {...specific.profile!}};
  state.marketQuotes = [old];
  assert.equal(publicMarketQuoteStockCountForUser(state, owner), 0);
  state.marketQuotes = [old, {...base, profile: coreQuoteProfile()}];
  assert.equal(publicMarketQuoteStockCountForUser(state, owner), 0);
  state.marketQuotes = [{...base, validUntil: "2000-01-01"}];
  assert.equal(publicMarketQuoteStockCountForUser(state, owner), 0);
});

test("missing or invalid physical condition does not limit core stock association or expose metadata", () => {
  const state = createInitialState({includeDemoData: true});
  state.marketQuotes = [];
  const owner = state.systemUsers.find(user => user.role === "老板")!;
  const product = {...state.products[0], id: "MATCH", name: "RTX5090", model: "RTX5090", category: "显卡" as const, vram: "32G"};
  state.products = [product];
  const card = {...state.inventory[0], id: "UNKNOWN", productId: product.id, condition: "95新" as const, inWarranty: undefined, fullBox: undefined, vram: "32G", status: "已入库" as const};
  state.inventory = [card, {...card, id: "INVALID", condition: "未知"}, {...card, id: "NO-VRAM", vram: ""}] as typeof state.inventory;
  const actions = createStoreActions(state);
  const quote = actions.createMarketQuote({model: "RTX5090", quoteScope: "core", coreModel: "RTX5090", source: "门店", refBuyPrice: null, refSellPrice: 200,
    profile: {condition: "used", grade: "any", warranty: "any", packaging: "any", vram: "32G", currency: "CNY"}});
  const rows = publicMarketQuoteInventoryForUser(state, owner);
  for (const row of rows) for (const hidden of ["profile", "condition", "inWarranty", "fullBox", "vram"]) assert.equal(hidden in row, false);
  assert.equal(publicMarketQuoteStockCountForUser(state, owner), 3);
  state.marketQuotes = [{...quote, quoteScope: "product", productId: product.id}];
  assert.equal(publicMarketQuoteStockCountForUser(state, owner), 0);
});

test("malformed legacy permission settings fall back to safe role defaults", () => {
  const state = createInitialState();
  const clerk = state.systemUsers.find((user) => user.role === "店员");
  assert.ok(clerk);
  (state as unknown as { customPermissions: unknown }).customPermissions = {};

  const permissions = getPermissionsForUser(state, clerk);
  assert.deepEqual(permissions.allowedMenus, clerk.permissionOverrides?.allowedMenus || permissions.allowedMenus);
  const scoped = publicStateForUser(state, clerk, "initial");
  assert.ok(Array.isArray(scoped.customPermissions));
});

test("incremental inspection responses do not expose associated purchase finance to inspection-only actors", () => {
  const state = createInitialState({includeDemoData: true});
  const clerk = state.systemUsers.find((user) => user.role === "店员")!;
  clerk.permissionOverrides = {allowedMenus: ["inspections"], showCost: false, showProfit: false};
  const patch = {purchaseInvoices: [state.purchaseInvoices[0]!], inventory: [state.inventory[0]!], products: [state.products[0]!], logs: state.logs.slice(0, 1)};
  const before = structuredClone(patch);
  const projected = publicStateMergeForUser(state, patch, clerk);
  assert.equal(projected.purchaseInvoices, undefined); assert.equal(projected.logs, undefined);
  assert.equal((projected.inventory as typeof state.inventory)[0]!.costPrice, 0);
  assert.equal((projected.products as typeof state.products)[0]!.refBuyPrice, 0);
  assert.deepEqual(patch, before, "response projections cannot redact persisted internal patches");
});

test("incremental purchase patches keep revisions while masking money and fail closed without an actor", () => {
  const state = createInitialState({includeDemoData: true});
  const owner = state.systemUsers.find((user) => user.role === "老板")!;
  const clerk = state.systemUsers.find((user) => user.role === "店员")!;
  clerk.permissionOverrides = {allowedMenus: ["purchase_list"], showCost: false, showProfit: false};
  const invoice = {...state.purchaseInvoices[0]!, recordVersion: 7};
  const patch = {purchaseInvoices: [invoice]};
  const projected = publicStateMergeForUser(state, patch, clerk).purchaseInvoices as typeof state.purchaseInvoices;
  assert.equal(projected[0]!.recordVersion, 7);
  assert.equal(projected[0]!.totalCost, 0); assert.equal(projected[0]!.paidAmount, 0);
  assert.equal(projected[0]!.items[0]!.buyPrice, 0); assert.equal(projected[0]!.estTotalProfit, 0);
  assert.deepEqual(publicStateMergeForUser(state, patch, owner), patch);
  assert.throws(() => publicStateMergeForUser(state, patch), /缺少已认证账号/);
});
