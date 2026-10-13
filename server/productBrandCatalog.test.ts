import assert from "node:assert/strict";
import test from "node:test";
import {createInitialState} from "./store.ts";
import {addProductBrandAliases, bindLegacyProductBrands, createProductBrand, currentProductBrandCatalog, validateProductBrand} from "./productBrandCatalog.ts";
import {normalizeProductBrand, resolveProductBrand} from "../src/utils/productBrandCatalog.ts";
import {productSearchMatches} from "../src/utils/productSearch.ts";
import {matchesInventoryListFilters} from "../src/utils/inventoryFilters.ts";

test("brand aliases share one identity across case/full-width forms without inferring GPU vendor", () => {
  for (const value of ["华硕", "ASUS", "asus", "ＡＳＵＳ"]) assert.equal(resolveProductBrand(value)?.id, "brand:asus");
  assert.equal(resolveProductBrand("G.SKILL")?.id, resolveProductBrand("芝奇")?.id);
  assert.equal(resolveProductBrand("RTX5090"), undefined);
  assert.equal(resolveProductBrand("NVIDIA")?.id, "brand:nvidia");
  assert.notEqual(resolveProductBrand("华硕")?.id, resolveProductBrand("NVIDIA")?.id);
  assert.equal(normalizeProductBrand(" A-s_u.s "), "ASUS");
});

test("brand creation and aliases reject cross-brand collisions before mutating state", () => {
  const state = createInitialState();
  const before = structuredClone(state);
  assert.throws(() => createProductBrand(state, {name: "asus", aliases: []}, "测试员"), /已属于品牌/);
  assert.deepEqual(state, before);
  assert.throws(() => createProductBrand(state, {name: "新品牌", aliases: ["---"]}, "测试员"), /有效/);
  assert.deepEqual(state, before);
  const created = createProductBrand(state, {name: "新品牌", aliases: ["NEW BRAND"]}, "测试员");
  assert.equal(resolveProductBrand("new-brand", currentProductBrandCatalog(state))?.id, created.id);
  const prior = structuredClone(state);
  assert.throws(() => addProductBrandAliases(state, created.id, ["MSI"], "测试员"), /微星/);
  assert.deepEqual(state, prior);
  addProductBrandAliases(state, "brand:asus", ["华硕电脑"], "测试员");
  assert.equal(resolveProductBrand("华硕电脑", currentProductBrandCatalog(state))?.id, "brand:asus");
});

test("known brand names bind across physical categories; unknown legacy data stays explicit", () => {
  const state = createInitialState();
  assert.deepEqual(validateProductBrand(state, {brand: "asus", category: "主板"}, true), {brand: "华硕", brandId: "brand:asus", category: "主板"});
  assert.deepEqual(validateProductBrand(state, {brand: "未确认旧品牌"}), {brand: "未确认旧品牌"});
  assert.throws(() => validateProductBrand(state, {brand: "未确认旧品牌"}, true), /请选择已有品牌/);
  assert.throws(() => validateProductBrand(state, {brand: "MSI", brandId: "brand:asus"}), /不一致/);
});

test("legacy binding adds only brand ID; an invalid batch leaves all business facts intact", () => {
  const state = createInitialState({includeDemoData: true});
  state.products[0] = {...state.products[0]!, brand: "ASUS", brandId: undefined};
  const product = state.products[0]!, before = structuredClone(state);
  assert.throws(() => bindLegacyProductBrands(state, [{productId: product.id, expectedBrand: product.brand, brandId: "brand:asus"}, {productId: "missing", expectedBrand: "ASUS", brandId: "brand:asus"}]), /不存在/);
  assert.deepEqual(state, before);
  assert.throws(() => bindLegacyProductBrands(state, [{productId: product.id, expectedBrand: "旧值", brandId: "brand:asus"}]), /已发生变化/);
  assert.throws(() => bindLegacyProductBrands(state, [{productId: product.id, expectedBrand: "ASUS", brandId: "brand:msi"}]), /不能绑定/);
  bindLegacyProductBrands(state, [{productId: product.id, expectedBrand: "ASUS", brandId: "brand:asus"}]);
  assert.deepEqual(state.products[0], {...product, brandId: "brand:asus"});
  for (const key of ["inventory", "purchaseInvoices", "salesInvoices", "marketQuotes", "financeLedger"] as const) assert.deepEqual(state[key], before[key]);
});

test("alias search stays narrow and inventory filters agree with product identity", () => {
  const state = createInitialState({includeDemoData: true});
  const product = {brand: "华硕", model: "RTX4090", name: "华硕 RTX4090"};
  assert.equal(productSearchMatches(product, "ASUS 4090"), true);
  assert.equal(productSearchMatches({...product, brand: "旧未知品牌", brandId: "brand:asus"}, "ASUSRTX4090"), true);
  assert.equal(productSearchMatches({...product, model: "RTX4090D"}, "ASUS 4090"), false);
  assert.equal(productSearchMatches({...product, brand: "微星", name: "微星 RTX4090"}, "ASUS 4090"), false);
  assert.equal(matchesInventoryListFilters({...state.inventory[0]!, brand: "ASUS"}, {brand: "华硕", includeSold: true}), true);
});
