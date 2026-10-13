import assert from "node:assert/strict";
import test from "node:test";
import {adaptMarketQuoteCategories, adaptMarketQuoteSnapshot, toMarketQuoteCreateRequest, toMarketQuoteUpdateRequest} from "./quote.adapter";
import {defaultMarketQuoteValues} from "@/src/features/quotes/quote.schema";
import type {QuoteProfile} from "@/src/types/quote";
import {coreQuoteProfile, quoteIdentityKey} from "@/src/utils/quoteReference";
import {quoteNeedsConfirmation} from "@/src/features/quotes/quote.reference";

const historicalProfile: QuoteProfile = {condition: "used", grade: "95新", warranty: "in", packaging: "boxed", vram: "32G", currency: "CNY"};
const legacy = {id: "MQ-OLD", productId: "P-ASUS", productName: "华硕 RTX5090 夜神", model: "RTX5090", brand: "NVIDIA", refBuyPrice: 18000, refSellPrice: 19500, yestBuyPrice: 17500, changeAmount: 500, changeRatio: 2.86, trend: "up", history: [{date: "2026-10-12", buyPrice: 17500, sellPrice: 19000}]};
const coreQuote = {...legacy, id: "MQ-CORE", quoteScope: "core" as const, coreId: "GPU-NVIDIA-RTX5090", coreModel: "RTX5090", profile: coreQuoteProfile(), productId: "", source: "询价", refBuyPrice: null, refSellPrice: 0, todayBuyPrice: 123, todaySellPrice: 456};
const products = [{id: "P-ASUS", name: "华硕 RTX5090 夜神", category: "显卡", brand: "华硕", model: "RTX5090", vram: "32G"}, {id: "P-MSI", name: "微星 RTX5090", category: "显卡", brand: "微星", model: "RTX5090", vram: "32G"}];
const inventory = products.map((product, index) => ({id: `STOCK-${index}`, productId: product.id, status: "已入库", profile: historicalProfile, costPrice: 100 + index * 100}));
const permissions = {showCost: true, showProfit: true};

test("historical reads remain intact but are pending confirmation and excluded from core stock", () => {
  const specific = {...coreQuote, id: "MQ-P", quoteScope: "product", productId: "P-ASUS", profile: historicalProfile};
  const conditioned = {...coreQuote, id: "MQ-CONDITIONS", profile: historicalProfile};
  const result = adaptMarketQuoteSnapshot({data: {marketQuotes: [legacy, specific, conditioned], products, inventory}}, permissions);
  assert.deepEqual(result.quotes.map(quoteNeedsConfirmation), [true, true, true]);
  assert.deepEqual(result.quotes.map((quote) => quote.stockCount), [0, 0, 0]);
  assert.equal(result.quotes[0]?.buyPrice, 18000);
  assert.equal(result.quotes[0]?.history.length, 1);
  assert.equal(result.quotes[1]?.productId, "P-ASUS");
  assert.deepEqual(result.quotes[1]?.profile, historicalProfile);
  assert.equal(result.stockCount, 0);
});

test("modern null prices never fall back to legacy numbers and keyed history is preserved", () => {
  const key = quoteIdentityKey(coreQuote);
  const quote = adaptMarketQuoteSnapshot({data: {marketQuotes: [{...coreQuote, history: [{date: "2026-10-13", buyPrice: null, sellPrice: 0, quoteKey: key}]}]}}, permissions).quotes[0];
  assert.equal(quote?.buyPrice, undefined);
  assert.equal(quote?.sellPrice, 0);
  assert.equal(quote?.previousBuyPrice, undefined);
  assert.equal(quote?.history[0]?.quoteKey, key);
  assert.equal(quote?.history[0]?.buyPrice, undefined);
  assert.equal(quote?.quoteScope, "core");
  assert.equal(quoteNeedsConfirmation(quote!), false);
});

test("nested inventory conditions/capacity do not split core stock; aggregate deduplicates across quotes", () => {
  const payload = {marketQuotes: [coreQuote, {...coreQuote, id: "MQ-DUP"}], products, inventory: [...inventory, inventory[0], {...inventory[0], id: "SOLD", status: "已售出"}, {...inventory[0], id: "OTHER", profile: {...historicalProfile, condition: "new", grade: "全新", vram: "24G"}}], stockCount: 2};
  const result = adaptMarketQuoteSnapshot({data: payload}, permissions);
  assert.deepEqual(result.quotes.map((quote) => quote.stockCount), [3, 3]);
  assert.equal(result.quotes[0]?.averageStockCost, 133);
  assert.equal(result.stockCount, 2);
  assert.equal(result.products?.[0]?.name, products[0]?.name);
  const {stockCount: _count, ...withoutCount} = payload;
  assert.equal(adaptMarketQuoteSnapshot({data: withoutCount}, permissions).stockCount, 3);
  assert.equal(adaptMarketQuoteSnapshot({data: {...payload, stockCount: 0}}, permissions).stockCount, 0);
});

test("stock maps direct core ids and excludes sold/nonmatching inventory and expired aggregate", () => {
  const direct = {id: "DIRECT", productId: "UNLISTED", coreId: coreQuote.coreId, status: "已入库", profile: historicalProfile, costPrice: 500};
  const result = adaptMarketQuoteSnapshot({data: {marketQuotes: [coreQuote], inventory: [direct, {...direct, id: "OTHER", coreId: "GPU-NVIDIA-RTX5080"}, {...direct, id: "SOLD", status: "已售出"}]}}, permissions);
  assert.equal(result.quotes[0]?.stockCount, 1);
  assert.equal(result.stockCount, 1);
  assert.equal(adaptMarketQuoteSnapshot({data: {marketQuotes: [{...coreQuote, validUntil: "2000-01-01"}], inventory: [direct]}}, permissions).stockCount, 0);
});

test("permissions mask prices/history/stock cost without dropping core reference metadata", () => {
  const result = adaptMarketQuoteSnapshot({data: {marketQuotes: [coreQuote], products, inventory}}, {showCost: false, showProfit: false});
  const quote = result.quotes[0];
  assert.equal(quote?.buyPrice, undefined);
  assert.equal(quote?.sellPrice, undefined);
  assert.equal(quote?.averageStockCost, undefined);
  assert.equal(quote?.maximumStockCost, undefined);
  assert.equal(quote?.history[0]?.buyPrice, undefined);
  assert.equal(quote?.history[0]?.sellPrice, undefined);
  assert.equal(quote?.source, "询价");
  assert.equal(quote?.stockCount, 2);
});

test("create/update adapters normalize four complete case variants and explicitly clear former products", () => {
  for (const name of ["RTX4070TI", "rtx4070ti", "RTX4070ti", "rTx4070Ti"]) {
    const values = {...defaultMarketQuoteValues, model: name, coreModel: name, profile: historicalProfile, productId: "P-OLD", source: " 询价 ", buyPrice: null, sellPrice: 0};
    const request = toMarketQuoteCreateRequest(values, "2026-10-13");
    assert.equal(request.model, "RTX4070TI");
    assert.equal(request.coreModel, "RTX4070TI");
    assert.equal(request.coreId, "GPU-NVIDIA-RTX4070TI");
    assert.equal(request.brand, "NVIDIA");
    assert.equal(request.quoteScope, "core");
    assert.equal(request.productId, "");
    assert.equal(request.refBuyPrice, null);
    assert.equal(request.refSellPrice, 0);
    assert.equal(request.source, "询价");
    assert.deepEqual(request.profile, coreQuoteProfile());
    const update = toMarketQuoteUpdateRequest(values);
    assert.equal(update.coreModel, request.model);
    assert.equal(update.coreId, request.coreId);
    assert.equal(update.productId, "");
    assert.deepEqual(update.profile, coreQuoteProfile());
    assert.equal(update.todayBuyPrice, null);
    assert.equal(update.todaySellPrice, 0);
    assert.equal(update.validUntil, "");
    assert.equal("history" in update, false);
  }
});

test("write adapters reject product/unbound scopes and incomplete or conflicting models", () => {
  const values = {...defaultMarketQuoteValues, model: "RTX4070TI", coreModel: "RTX4070TI", source: "询价", buyPrice: 0};
  for (const invalid of [{...values, quoteScope: "product" as const, productId: "P-ASUS"}, {...values, quoteScope: undefined}, {...values, coreModel: "4070TI"}, {...values, coreId: "GPU-NVIDIA-RTX4070"}]) {
    assert.throws(() => toMarketQuoteCreateRequest(invalid, "2026-10-13"));
    assert.throws(() => toMarketQuoteUpdateRequest(invalid));
  }
});

test("write adapters omit blank optional source and retain historical source", () => {
  const values = {...defaultMarketQuoteValues, model: "RTX4070TI", coreModel: "RTX4070TI", buyPrice: 0};
  for (const source of [undefined, "", " "]) {
    assert.equal(Object.hasOwn(toMarketQuoteCreateRequest({...values, source}, "2026-10-13"), "source"), false);
    assert.equal(Object.hasOwn(toMarketQuoteUpdateRequest({...values, source}), "source"), false);
  }
  assert.equal(toMarketQuoteUpdateRequest({...values, source: " 历史来源 "}).source, "历史来源");
});

test("category adapter preserves inactive categories for existing historical records", () => {
  const categories = adaptMarketQuoteCategories({data: [{id: "MQC-gpu", name: "显卡", isActive: true, sortOrder: 10}, {id: "MQC-old", name: "旧类", isActive: false}]});
  assert.deepEqual(categories.map(({name, isActive}) => ({name, isActive})), [{name: "显卡", isActive: true}, {name: "旧类", isActive: false}]);
});
