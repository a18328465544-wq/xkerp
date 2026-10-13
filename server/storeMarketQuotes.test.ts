import assert from "node:assert/strict";
import test from "node:test";
import {createMarketQuoteHelpers, type MarketQuoteState} from "./storeMarketQuotes.ts";
import {createInitialState} from "./store.ts";
import type {MarketQuoteInput} from "./storeMarketQuotes.ts";
import type {MarketQuote} from "../src/types/quote.ts";
import {quoteIdentityKey, coreQuoteProfile, isCoreBaseQuote, quoteReferenceSummary} from "../src/utils/quoteReference.ts";

function seedHistorical(state: MarketQuoteState, input: MarketQuoteInput): MarketQuote {
  const quote = {...createInitialState().marketQuotes[0]!, quoteScope: undefined, coreId: undefined, coreModel: undefined, profile: undefined, source: undefined,
    productId: "", ...input, id: input.id || `HIST-${state.marketQuotes.length}`, history: input.history};
  state.marketQuotes.push(quote);
  return quote;
}

function fixture() {
  const state = createInitialState({includeDemoData: true});
  state.marketQuotes = [];
  state.logs = [];
  let sequence = 0;
  let throwLog = false;
  const helpers = createMarketQuoteHelpers({state, nowStamp: () => "2026-10-13 18:00:00", storeDate: () => "2026-10-13",
    genId: prefix => `${prefix}-${++sequence}`, systemActor: () => "测试用户", isStockExcludedStatus: status => status === "已售出",
    addLog: (user, module, type, target, beforeVal, afterVal) => {
      if (throwLog) throw new Error("audit unavailable");
      state.logs = [{id: `LOG-${++sequence}`, user, module, type, target, beforeVal, afterVal, time: "2026-10-13 18:00:00"}, ...state.logs];
    },
  });
  const modern: MarketQuoteInput = {model: "RTX 5090", brand: "NVIDIA", quoteScope: "core", coreModel: "RTX 5090",
    profile: {condition: "used", grade: "95新", warranty: "any", packaging: "any", vram: "32GB", currency: "CNY"},
    source: "门店报价", refBuyPrice: 20000, refSellPrice: 22000};
  return {state, helpers, modern, failAudit: () => {throwLog = true;}};
}

test("canonical core variants stay distinct and server rejects mismatched identities", () => {
  const {helpers, modern} = fixture();
  for (const model of ["RTX 5090", "RTX 5090D", "RTX 5090D V2", "RTX 4080 SUPER", "RTX 4070 Ti", "RX 7900 XTX", "RX 7900 XT", "ARC B580"]) {
    const quote = helpers.createMarketQuote({...modern, model, coreModel: model});
    assert.equal(quote.coreId, model.startsWith("RX") ? `GPU-AMD-${model.replaceAll(" ", "").toUpperCase()}` : model.startsWith("ARC") ? "GPU-INTEL-ARCB580" : `GPU-NVIDIA-${model.replaceAll(" ", "").toUpperCase()}`);
    assert.equal(quote.productId, "");
    assert.equal(quote.history?.[0].quoteKey, quoteIdentityKey(quote));
  }
  assert.throws(() => helpers.createMarketQuote({...modern, coreId: "GPU-NVIDIA-RTX4090"}), /不匹配/);
  assert.throws(() => helpers.createMarketQuote({...modern, coreModel: "RTX 5090 / RTX 4090"}), /核心型号无效/);
});

test("modern null is absent rather than zero; trend is authoritative and prior zero has no ratio", () => {
  const {helpers, modern} = fixture();
  const quote = helpers.createMarketQuote({...modern, refBuyPrice: null, refSellPrice: 0, trend: "up"});
  assert.equal(quote.refBuyPrice, null);
  assert.equal(quote.todayBuyPrice, undefined);
  assert.equal(quote.minPrice, undefined);
  assert.equal(quote.refSellPrice, 0);
  assert.equal(quote.trend, "stable");
  const next = helpers.updateMarketPrice(quote.id, 0, null)!;
  assert.equal(next.trend, "stable");
  assert.equal(next.todaySellPrice, undefined);
  const changed = helpers.updateMarketPrice(quote.id, 200, 300)!;
  assert.equal(changed.trend, "up");
  assert.equal(changed.changeRatio, undefined);
  assert.throws(() => helpers.updateMarketPrice(quote.id, null, null), /至少/);
  assert.throws(() => helpers.createMarketQuote({...modern, refBuyPrice: null, refSellPrice: null}), /至少/);
});

test("product creation and imports are rejected even for real master products", () => {
  const {state, helpers, modern} = fixture();
  state.products = [{...state.products[0], id: "REAL-5090", name: "华硕 RTX 5090", category: "显卡", model: "RTX 5090", vram: "32G", brand: "华硕", version: "夜神"}];
  const before = structuredClone(state);
  for (const productId of ["REAL-5090", "SP-MOCK-1"]) {
    const input = {...modern, quoteScope: "product" as const, productId};
    assert.throws(() => helpers.createMarketQuote(input), /已停用/);
    assert.throws(() => helpers.importMarketQuotes([modern, input]), /已停用/);
  }
  assert.throws(() => helpers.createMarketQuote({...modern, productId: "REAL-5090"}), /不能关联/);
  assert.deepEqual(state, before);
});

test("legacy conversion is explicit, unique, immutable and keeps unqualified old history", () => {
  const {helpers, modern, state} = fixture();
  const history = Array.from({length: 25}, (_, index) => ({date: `old-${index}`, buyPrice: 10, sellPrice: 20}));
  const legacy = seedHistorical(state, {model: "legacy RTX 5090", brand: "nvidia", refBuyPrice: 10, refSellPrice: 20, history});
  assert.equal(legacy.coreId, undefined);
  assert.equal(legacy.productId, "");
  assert.throws(() => helpers.updateMarketPrice(legacy.id, 20, 30), /请明确确认转换/);
  assert.throws(() => helpers.updateMarketPrice(legacy.id, 20, 30, undefined, undefined, {coreModel: "RTX 5090"}), /请明确确认转换/);
  assert.throws(() => helpers.updateMarketPrice(legacy.id, 20, 30, undefined, undefined, {quoteScope: "core"}), /请明确确认转换/);
  const converted = helpers.updateMarketPrice(legacy.id, 20000, 22000, undefined, undefined, {...modern, profile: coreQuoteProfile()})!;
  assert.deepEqual(converted.history?.slice(0, 25), history);
  assert.equal(converted.history?.at(-1)?.date, "2026-10-13 18:00:00");
  assert.equal(converted.history?.at(-1)?.quoteKey, quoteIdentityKey(converted));
  assert.equal(converted.trend, "stable");
  assert.equal(converted.yestBuyPrice, undefined);
  const updated = helpers.updateMarketPrice(legacy.id, 21000, 23000)!;
  assert.equal(updated.history?.length, 27);
  assert.equal(updated.trend, "up");
  assert.deepEqual(helpers.updateMarketPrice(legacy.id, 21000, 23000, undefined, undefined, {profile: {...modern.profile!, condition: "new"}})?.profile, coreQuoteProfile());
  assert.equal(helpers.updateMarketPrice(legacy.id, 21000, 23000, undefined, undefined, {source: "其他来源"})?.source, "其他来源");
  assert.throws(() => helpers.createMarketQuote(modern), /已存在/);
  assert.throws(() => helpers.createMarketQuote({...modern, profile: {...modern.profile!, condition: "new", grade: "全新"}}), /已存在/);
  const another = seedHistorical(state, {model: "另一个旧报价", refBuyPrice: 1, refSellPrice: 2});
  const before = structuredClone(state);
  assert.throws(() => helpers.updateMarketPrice(another.id, 1, 2, undefined, undefined, {...modern, profile: coreQuoteProfile()}), /已存在/);
  assert.deepEqual(state, before);
});

test("all quote scopes leave populated products and inventory byte-for-byte unchanged", () => {
  const {state, helpers, modern} = fixture();
  state.products = [{...state.products[0], id: "REAL", name: "RTX 5090", category: "显卡", model: "RTX 5090", vram: "32G"}];
  state.inventory = state.inventory.map(item => ({...item, productId: "REAL"}));
  assert.ok(state.inventory.length);
  const before = structuredClone({inventory: state.inventory, products: state.products});
  const core = helpers.createMarketQuote(modern);
  helpers.updateMarketPrice(core.id, 100, 200);
  const legacy = seedHistorical(state, {model: "RTX 4090", refBuyPrice: 10, refSellPrice: 20, productId: "REAL"});
  assert.throws(() => helpers.updateMarketPrice(legacy.id, 100, 200), /请明确确认转换/);
  helpers.updateMarketPrice(legacy.id, 100, 200, undefined, undefined, {quoteScope: "core", coreModel: "RTX4090", profile: coreQuoteProfile(), source: "显式转换", productId: ""});
  helpers.importMarketQuotes([modern]);
  assert.deepEqual({inventory: state.inventory, products: state.products}, before);
});

test("core imports update only core identity while old legacy records remain unchanged", () => {
  const {state, helpers, modern} = fixture();
  const first = helpers.createMarketQuote(modern);
  const legacy = seedHistorical(state, {model: modern.model.toLowerCase(), brand: "nvidia", refBuyPrice: 1, refSellPrice: 2});
  const old = structuredClone(legacy);
  const result = helpers.importMarketQuotes([{...modern, refBuyPrice: 21000}, {...modern, profile: {...modern.profile!, condition: "new", grade: "全新", vram: "24G"}, refBuyPrice: 21000}]);
  assert.deepEqual([result.created, result.updated, result.skipped], [0, 1, 1]);
  assert.equal(state.marketQuotes.find(quote => quote.id === first.id)?.refBuyPrice, 21000);
  assert.equal(state.marketQuotes.filter(quote => !quote.quoteScope).length, 1);
  assert.equal(helpers.importMarketQuotes([{model: " RTX 5090 ", brand: " NVIDIA ", refBuyPrice: 3, refSellPrice: 4}]).updated, 1);
  assert.deepEqual(state.marketQuotes.find(quote => quote.id === legacy.id), old);
  assert.equal(state.marketQuotes.find(quote => quote.id === first.id)?.refBuyPrice, 3);
});

test("batch validates every modern row before mutation and rolls back helper errors", () => {
  const {state, helpers, modern, failAudit} = fixture();
  const before = structuredClone(state);
  assert.throws(() => helpers.importMarketQuotes([modern, {...modern, coreModel: "RTX 5090D", coreId: "GPU-NVIDIA-RTX5090"}]), /不匹配/);
  assert.deepEqual(state, before);
  assert.throws(() => helpers.importMarketQuotes([modern, {...modern, validUntil: "2026-02-30"}]), /截止日期/);
  assert.deepEqual(state, before);
  failAudit();
  assert.throws(() => helpers.importMarketQuotes([modern]), /audit unavailable/);
  assert.deepEqual(state, before);
});

test("scope-omitted source-free input cannot implicitly convert pending historical core", () => {
  const {state, helpers, modern} = fixture();
  const quote = helpers.createMarketQuote(modern);
  state.marketQuotes[0] = {...quote, profile: undefined};
  const before = structuredClone(state.marketQuotes[0]);
  assert.throws(() => helpers.importMarketQuotes([{model: quote.model, brand: quote.brand, refBuyPrice: 1, refSellPrice: 2}]), /待确认/);
  assert.throws(() => helpers.createMarketQuote({model: "旧报价", refBuyPrice: 1, refSellPrice: 2}), /核心型号无效/);
  assert.deepEqual(state.marketQuotes.find(item => item.id === quote.id), before);
});

test("external stock pricing retains legacy sync but excludes both modern benchmark scopes", () => {
  const {state, helpers, modern} = fixture();
  state.products = [{...state.products[0], id: "REAL", name: "RTX 5090", category: "显卡", model: "RTX 5090", vram: "32G"}];
  const core = helpers.createMarketQuote(modern);
  const product = seedHistorical(state, {...modern, quoteScope: "product", productId: "REAL"});
  const legacy = seedHistorical(state, {model: "legacy", productId: "REAL", refBuyPrice: 1, refSellPrice: 2});
  const benchmarks = structuredClone([core, product]);
  const result = helpers.syncEstimatedSellPrice({productId: "REAL", estSellPrice: 999});
  assert.equal(result.updatedQuoteCount, 1);
  assert.deepEqual(state.marketQuotes.filter(quote => quote.quoteScope).sort((a, b) => a.id.localeCompare(b.id)), benchmarks.sort((a, b) => a.id.localeCompare(b.id)));
  assert.equal(state.marketQuotes.find(quote => quote.id === legacy.id)?.refSellPrice, 999);
});

test("modern source/validity are editable with presence-aware clearing; imports refresh metadata and actor", () => {
  const {state, helpers, modern} = fixture();
  const quote = helpers.createMarketQuote({...modern, validUntil: "2026-10-20"});
  assert.equal(quote.changeRatio, undefined);
  assert.equal(quote.maintainedBy, "测试用户");
  assert.equal(helpers.updateMarketPrice(quote.id, 20000, 22000)?.validUntil, "2026-10-20");
  const next = helpers.updateMarketPrice(quote.id, 20000, 22000, undefined, undefined, {source: "  新来源  ", validUntil: undefined})!;
  assert.equal(next.validUntil, undefined);
  assert.equal(next.source, "新来源");
  assert.equal(next.coreId, quote.coreId);
  assert.deepEqual(next.profile, quote.profile);
  assert.equal(helpers.updateMarketPrice(quote.id, 1, 2, undefined, undefined, {source: " "})?.source, undefined);
  assert.throws(() => helpers.updateMarketPrice(quote.id, 1, 2, undefined, undefined, {source: "x".repeat(301)}), /来源/);
  assert.throws(() => helpers.updateMarketPrice(quote.id, 1, 2, undefined, undefined, {validUntil: "2026-02-30"}), /截止日期/);
  state.marketQuotes[0] = {...next, maintainedBy: "旧维护人"};
  helpers.importMarketQuotes([{...modern, source: "导入来源", validUntil: "2026-11-01", maintainedBy: "客户端伪造维护人"}]);
  assert.equal(state.marketQuotes[0].source, "导入来源");
  assert.equal(state.marketQuotes[0].validUntil, "2026-11-01");
  assert.equal(state.marketQuotes[0].maintainedBy, "测试用户");
  helpers.importMarketQuotes([{...modern, source: "另一来源"}]);
  assert.equal(state.marketQuotes[0].validUntil, "2026-11-01");
});

test("core quote create/import/update needs no source and does not fabricate provenance", () => {
  for (const source of [undefined, "", " "]) {
    const {helpers, modern, state} = fixture();
    const before = structuredClone({products: state.products, inventory: state.inventory});
    const quote = helpers.createMarketQuote({...modern, source});
    assert.equal(quote.source, undefined);
    assert.equal(helpers.updateMarketPrice(quote.id, 0, 2)?.source, undefined);
    const result = helpers.importMarketQuotes([{...modern, source, coreModel: "rtx4070ti"}]);
    assert.equal(result.quotes[0]?.source, undefined);
    assert.deepEqual({products: state.products, inventory: state.inventory}, before);
  }
});

test("all former product profiles are rejected and ignored physical inputs normalize only cores", () => {
  const {state, helpers, modern} = fixture();
  state.products = [{...state.products[0], id: "REAL", name: "RTX5090", model: "RTX5090", category: "显卡", vram: "32G"}];
  const product = {...modern, quoteScope: "product" as const, productId: "REAL"};
  for (const profile of [{...modern.profile!, grade: "未知成色"}, {...modern.profile!, condition: "new" as const}, {...modern.profile!, grade: "全新"}, coreQuoteProfile()]) assert.throws(() => helpers.createMarketQuote({...product, profile}), /已停用/);
  assert.deepEqual(helpers.createMarketQuote({...modern, profile: {...modern.profile!, condition: "new", grade: "95新"}}).profile, coreQuoteProfile());
});

test("legacy-to-product conversion is prohibited without mutating historical facts", () => {
  const {state, helpers, modern} = fixture();
  state.products = [{...state.products[0], id: "REAL", name: "华硕 RTX5090 夜神", model: "RTX5090", brand: "华硕", version: "夜神", category: "显卡", vram: "32G"}];
  const legacy = seedHistorical(state, {model: "错误旧型号", brand: "错误品牌", productName: "错误旧名称", productId: "SP-MOCK-LEGACY", refBuyPrice: 10, refSellPrice: 20});
  const before = structuredClone(state);
  assert.throws(() => helpers.updateMarketPrice(legacy.id, 20000, 22000, undefined, undefined, {...modern, quoteScope: "product", productId: "REAL"}), /已停用/);
  assert.deepEqual(state, before);
});

test("changing only a valid core category does not create price history; old records cannot bypass conversion", () => {
  const quote = {
    id: "MQ-1",
    productId: "",
    productName: "RTX 4090",
    model: "RTX 4090",
    brand: "NVIDIA",
    quoteScope: "core", coreId: "GPU-NVIDIA-RTX4090", coreModel: "RTX4090", profile: coreQuoteProfile(), source: "门店",
    refBuyPrice: 18000,
    refSellPrice: 19500,
    updateTime: "2026-10-09T10:00:00.000Z",
    categoryId: undefined,
    history: [{date: "10-09", buyPrice: 18000, sellPrice: 19500}],
  };
  const state = {marketQuotes: [quote], inventory: [], products: []} as unknown as MarketQuoteState;
  const logEntries: Array<[string, string, string, string, string?, string?]> = [];
  let timestampCalls = 0;
  const helpers = createMarketQuoteHelpers({
    state,
    nowStamp: () => {timestampCalls += 1; return "2026-10-10T10:00:00.000Z";},
    storeDate: () => "2026-10-10",
    genId: (prefix) => `${prefix}-1`,
    systemActor: () => "测试用户",
    isStockExcludedStatus: () => false,
    addLog: (user, module, action, target, before, after) => {logEntries.push([user, module, action, target, before, after]);},
  });

  const updated = helpers.updateMarketPrice("MQ-1", 18000, 19500, undefined, "MQC-gpu");

  assert.equal(updated?.categoryId, "MQC-gpu");
  assert.deepEqual(updated?.history, quote.history);
  assert.equal(updated?.updateTime, quote.updateTime);
  assert.equal(timestampCalls, 0);
  assert.equal(logEntries[0]?.[2], "更新行情分类");
  state.marketQuotes = [{...state.marketQuotes[0]!, quoteScope: undefined, coreId: undefined, coreModel: undefined, profile: undefined}];
  const before = structuredClone(state);
  assert.throws(() => helpers.updateMarketPrice("MQ-1", 18000, 19500, undefined, "MQC-other"), /请明确确认转换/);
  assert.deepEqual(state, before);
  assert.equal(logEntries.length, 1);
});

test("unbound conversion rekeys colliding qualified history without changing its date or prices", () => {
  const {state, helpers, modern} = fixture();
  const legacy = seedHistorical(state, {model: "旧型号", history: [{date: "old", buyPrice: 1, sellPrice: 2, quoteKey: "core|GPU-NVIDIA-RTX5090|CNY"}]});
  const converted = helpers.updateMarketPrice(legacy.id, 100, 200, undefined, undefined, {...modern, profile: coreQuoteProfile()})!;
  assert.equal(converted.changeRatio, undefined);
  assert.deepEqual({...converted.history![0], quoteKey: undefined}, {date: "old", buyPrice: 1, sellPrice: 2, quoteKey: undefined});
  assert.match(converted.history![0].quoteKey!, /^historical-unconfirmed\|/);
  assert.equal(converted.history!.filter(point => point.quoteKey === quoteIdentityKey(converted)).length, 1);
});

test("core create needs no physical profile and all client conditions collapse to one CNY base", () => {
  const {state, helpers, modern} = fixture();
  const before = structuredClone({inventory: state.inventory, products: state.products});
  const quote = helpers.createMarketQuote({...modern, profile: undefined});
  assert.deepEqual(quote.profile, coreQuoteProfile());
  assert.equal(quoteIdentityKey(quote), "core|GPU-NVIDIA-RTX5090|CNY");
  assert.equal(quote.productId, "");
  assert.throws(() => helpers.createMarketQuote({...modern, profile: {...modern.profile!, condition: "new", grade: "全新", vram: "24G"}}), /明确确认/);
  const updated = helpers.updateMarketPrice(quote.id, 21000, 23000, undefined, undefined, {profile: {...modern.profile!, condition: "used", grade: "损坏", warranty: "out", packaging: "unboxed", vram: "8G"}})!;
  assert.deepEqual(updated.profile, coreQuoteProfile());
  assert.equal(updated.trend, "up");
  assert.deepEqual({inventory: state.inventory, products: state.products}, before);
});

test("conditioned core conversion requires explicit base confirmation, isolates old keys and cannot overwrite peers", () => {
  const {state, helpers, modern} = fixture();
  const base = helpers.createMarketQuote(modern);
  const old = {...base, profile: modern.profile!, refBuyPrice: 100, refSellPrice: 200, changeRatio: 80,
    history: [{date: "old-1", buyPrice: 50, sellPrice: 100, quoteKey: "core|GPU-NVIDIA-RTX5090|used|95新|any|any|32G|CNY"},
      {date: "old-2", buyPrice: 100, sellPrice: 200, quoteKey: quoteIdentityKey(base)!}]};
  state.marketQuotes = [old];
  const before = structuredClone(state);
  assert.throws(() => helpers.updateMarketPrice(old.id, 20000, 22000), /请明确确认转换/);
  assert.throws(() => helpers.updateMarketPrice(old.id, 20000, 22000, undefined, undefined, modern), /请明确确认转换/);
  assert.deepEqual(state, before);
  const converted = helpers.updateMarketPrice(old.id, 20000, 22000, undefined, undefined, {quoteScope: "core", profile: coreQuoteProfile()})!;
  assert.equal(isCoreBaseQuote(converted), true);
  assert.equal(converted.trend, "stable");
  assert.equal(converted.changeRatio, undefined);
  assert.equal(converted.yestBuyPrice, undefined);
  assert.deepEqual(converted.history?.[0], old.history[0]);
  assert.equal(converted.history?.[1].date, old.history[1].date);
  assert.equal(converted.history?.[1].buyPrice, 100);
  assert.match(converted.history?.[1].quoteKey || "", /^conditioned-core\|GPU-NVIDIA-RTX5090\|used\|/);
  assert.equal(converted.history?.filter(point => point.quoteKey === quoteIdentityKey(converted)).length, 1);
  assert.equal(quoteReferenceSummary(converted, "2026-10-13")?.changeRatio, null);
  const updated = helpers.updateMarketPrice(old.id, 21000, 23000)!;
  assert.equal(quoteReferenceSummary(updated, "2026-10-13")?.changeRatio, 5);
  state.marketQuotes = [old, {...base, id: "PEER"}];
  const conflictFacts = structuredClone(state);
  assert.throws(() => helpers.updateMarketPrice(old.id, 20000, 22000, undefined, undefined, {quoteScope: "core", profile: coreQuoteProfile()}), /明确确认.*不可自动覆盖/);
  assert.throws(() => helpers.importMarketQuotes([modern]), /多条旧报价.*明确确认/);
  assert.deepEqual(state, conflictFacts);
});

test("same-core import conflicts are atomic; identical variants skip and old core must be confirmed separately", () => {
  const {state, helpers, modern} = fixture();
  const base = helpers.createMarketQuote(modern);
  for (const differing of [{refBuyPrice: 1}, {refSellPrice: null}, {source: "另一来源"}, {validUntil: "2099-01-01"}]) {
    const before = structuredClone(state);
    assert.throws(() => helpers.importMarketQuotes([{...modern, model: "RTX5080", coreModel: "RTX5080"}, modern, {...modern, ...differing, profile: {...modern.profile!, condition: "new", grade: "全新"}}]), /明确选择一套核心基础价/);
    assert.deepEqual(state, before);
  }
  const result = helpers.importMarketQuotes([modern, {...modern, profile: {...modern.profile!, condition: "new", grade: "全新", vram: "8G"}}]);
  assert.deepEqual([result.created, result.updated, result.skipped], [0, 1, 1]);
  state.marketQuotes = [{...base, profile: modern.profile!, history: [{date: "old", buyPrice: 1, sellPrice: 2, quoteKey: quoteIdentityKey(base)!}]}];
  const before = structuredClone(state);
  assert.throws(() => helpers.importMarketQuotes([{...modern, profile: undefined}]), /待确认/);
  assert.deepEqual(state, before);
  const converted = helpers.updateMarketPrice(base.id, 20000, 22000, undefined, undefined, {...modern, profile: coreQuoteProfile()})!;
  assert.equal(isCoreBaseQuote(converted), true);
  assert.equal(converted.changeRatio, undefined);
  assert.equal(converted.history?.filter(point => point.quoteKey === quoteIdentityKey(converted)).length, 1);
  assert.equal(helpers.importMarketQuotes([{...modern, profile: undefined}]).updated, 1);
});

test("historical product requires explicit core conversion, clears binding and preserves isolated history", () => {
  const {state, helpers, modern} = fixture();
  const old = seedHistorical(state, {...modern, quoteScope: "product", coreId: "GPU-NVIDIA-RTX5090", productId: "REAL",
    history: [{date: "old-unqualified", buyPrice: 10, sellPrice: 20}, {date: "old-product", buyPrice: 100, sellPrice: 200, quoteKey: "product|REAL|used|95新|any|any|32G|CNY"},
      {date: "old-colliding", buyPrice: 100, sellPrice: 200, quoteKey: "core|GPU-NVIDIA-RTX5090|CNY"}]});
  const before = structuredClone(state);
  assert.throws(() => helpers.updateMarketPrice(old.id, 20000, 22000), /请明确确认转换/);
  assert.throws(() => helpers.updateMarketPrice(old.id, 20000, 22000, undefined, undefined, {quoteScope: "core", profile: coreQuoteProfile()}), /明确清空/);
  assert.throws(() => helpers.updateMarketPrice(old.id, 20000, 22000, undefined, undefined, {quoteScope: "product"}), /已停用/);
  assert.deepEqual(state, before);
  const metadata = {quoteScope: "core" as const, profile: coreQuoteProfile(), productId: ""};
  const converted = helpers.updateMarketPrice(old.id, 20000, 22000, undefined, undefined, metadata)!;
  assert.equal(converted.quoteScope, "core");
  assert.equal(converted.productId, "");
  assert.deepEqual([converted.model, converted.coreModel, converted.productName], ["RTX5090", "RTX5090", "RTX5090"]);
  assert.equal(converted.changeRatio, undefined);
  assert.equal(converted.yestBuyPrice, undefined);
  assert.equal(converted.trend, "stable");
  assert.deepEqual(converted.history?.slice(0, 2), old.history?.slice(0, 2));
  assert.match(converted.history?.[2].quoteKey || "", /^historical-product\|/);
  assert.equal(converted.history?.[2].date, "old-colliding");
  assert.equal(converted.history?.[2].buyPrice, 100);
  assert.equal(converted.history?.filter(point => point.quoteKey === quoteIdentityKey(converted)).length, 1);
  assert.deepEqual({products: state.products, inventory: state.inventory}, {products: before.products, inventory: before.inventory});
  state.marketQuotes = [old, {...converted, id: "PEER"}];
  const conflictFacts = structuredClone(state);
  assert.throws(() => helpers.updateMarketPrice(old.id, 1, 2, undefined, undefined, metadata), /明确确认.*不可自动覆盖/);
  assert.deepEqual(state, conflictFacts);
});

test("full prefixed model is case-canonical in every mirror and identity; bare model is not an alias", () => {
  for (const model of ["RTX4070TI", "rtx4070ti", "RTX4070ti"]) {
    const {state, helpers, modern} = fixture();
    const quote = helpers.createMarketQuote({...modern, quoteScope: undefined, model, coreModel: undefined, productName: "伪造镜像"});
    assert.deepEqual([quote.model, quote.coreModel, quote.productName, quote.coreId], ["RTX4070TI", "RTX4070TI", "RTX4070TI", "GPU-NVIDIA-RTX4070TI"]);
    assert.equal(quote.quoteScope, "core");
    assert.equal(quote.productId, "");
    assert.throws(() => helpers.createMarketQuote({...modern, model: "RTX4070ti", coreModel: "rtx4070ti"}), /已存在/);
    const before = structuredClone(state);
    assert.throws(() => helpers.createMarketQuote({...modern, model: "4070ti", coreModel: "4070ti"}), /核心型号无效/);
    assert.throws(() => helpers.createMarketQuote({...modern, quoteScope: undefined, productId: "FAKE"}), /不能关联/);
    assert.deepEqual(state, before);
    const imported = helpers.importMarketQuotes([{...modern, model: "rtx4070ti", coreModel: "RTX4070ti", refBuyPrice: 21000}]);
    assert.equal(imported.updated, 1);
    assert.deepEqual([imported.quotes[0].model, imported.quotes[0].coreModel, imported.quotes[0].productName], ["RTX4070TI", "RTX4070TI", "RTX4070TI"]);
  }
});
