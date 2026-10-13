import assert from "node:assert/strict";
import test from "node:test";
import type {MarketQuote, QuoteProductOption, QuoteProfile} from "../types/quote";
import {coreQuoteProfile, gpuCoreIdentity, isCoreBaseQuote, productCoreIdentity, quoteIdentityKey, quoteIsExpired, quoteProfileKey, quoteProfileLabel, quoteReferenceSummary, resolveQuoteReference} from "./quoteReference";

const profile: QuoteProfile = {condition: "used", grade: "95新", warranty: "any", packaging: "any", vram: "32G", currency: "CNY"};
const product: QuoteProductOption = {id: "P-1", name: "华硕 RTX5090 夜神 32G", model: "RTX5090", category: "显卡", brand: "华硕", vram: "32G"};
const quote = (id: string, extra: Partial<MarketQuote> = {}) => ({id, quoteScope: "core", coreId: "GPU-NVIDIA-RTX5090", coreModel: "RTX5090", profile: coreQuoteProfile(), source: "门店维护", refBuyPrice: 100, refSellPrice: 200, ...extra}) as MarketQuote;

test("commercial core identity normalizes aliases but never merges GPU variants or vendors", () => {
  assert.deepEqual(gpuCoreIdentity("RTX ５０９０"), gpuCoreIdentity("rtx5090"));
  assert.equal(gpuCoreIdentity("RTX5090D V2")?.coreId, "GPU-NVIDIA-RTX5090DV2");
  assert.notEqual(gpuCoreIdentity("RTX5090D")?.coreId, gpuCoreIdentity("RTX5090")?.coreId);
  assert.notEqual(gpuCoreIdentity("RTX4080 SUPER")?.coreId, gpuCoreIdentity("RTX4080")?.coreId);
  assert.equal(gpuCoreIdentity("RTX 4070 Ti SUPER")?.coreId, "GPU-NVIDIA-RTX4070TISUPER");
  assert.deepEqual(gpuCoreIdentity("RTX4070TiSUPER"), gpuCoreIdentity("RTX 4070 Ti SUPER"));
  assert.notEqual(gpuCoreIdentity("RTX4070 Ti SUPER")?.coreId, gpuCoreIdentity("RTX4070 Ti")?.coreId);
  assert.equal(gpuCoreIdentity("RX7900 GRE")?.coreId, "GPU-AMD-RX7900GRE");
  assert.notEqual(gpuCoreIdentity("RX7900XT")?.coreId, gpuCoreIdentity("RX7900XTX")?.coreId);
  assert.equal(gpuCoreIdentity("ARC A770")?.coreId, "GPU-INTEL-ARCA770");
  assert.equal(gpuCoreIdentity("RTX5090 / RTX5080"), null);
  assert.equal(gpuCoreIdentity("5090"), null);
  assert.equal(gpuCoreIdentity("RTX5090UNKNOWN"), null);
});

test("complete RTX core names are case insensitive and retain their full prefix", () => {
  for (const input of ["RTX4070TI", "rtx4070ti", "RTX4070ti", "rTx 4070 Ti", "ＲＴＸ４０７０ｔｉ"]) {
    assert.deepEqual(gpuCoreIdentity(input), {coreId: "GPU-NVIDIA-RTX4070TI", coreModel: "RTX4070TI", vendor: "NVIDIA"});
  }
  assert.equal(gpuCoreIdentity("4070TI"), null);
  assert.equal(gpuCoreIdentity("4070ti"), null);
  assert.notEqual(gpuCoreIdentity("RTX4070TI")?.coreId, gpuCoreIdentity("RTX4070")?.coreId);
  assert.notEqual(gpuCoreIdentity("RTX4070TI")?.coreId, gpuCoreIdentity("RTX4070TISUPER")?.coreId);
});

test("only GPU templates with nonconflicting identity get a core association", () => {
  assert.equal(productCoreIdentity(product)?.coreId, "GPU-NVIDIA-RTX5090");
  assert.equal(productCoreIdentity({...product, model: "RTX5080"}), null);
  assert.equal(productCoreIdentity({...product, category: "整机"}), null);
});

test("existing inventory matching uses complete model/name and leaves dirty taxonomy and abbreviations pending", () => {
  const gpu = {category: "显卡", model: "rtx4070ti", name: "华硕 RTX4070Ti TUF Gaming 12G"};
  assert.equal(productCoreIdentity(gpu)?.coreId, "GPU-NVIDIA-RTX4070TI");
  assert.equal(productCoreIdentity({...gpu, model: "RTX5090DV2", name: "索泰 RTX5090D V2 SOLID OC 24G"})?.coreId, "GPU-NVIDIA-RTX5090DV2");
  assert.equal(productCoreIdentity({...gpu, model: "RTX A4000", name: "RTX A4000 专业图形显卡 16G"})?.coreId, "GPU-NVIDIA-RTXA4000");
  assert.equal(productCoreIdentity({...gpu, category: "其他配件", model: "RTX A5000", name: "RTX A5000 专业卡 24G"}), null);
  for (const model of ["RTX4080S", "GTX1660S", "5060TI", "4070TISUPER", "i5-14600KF", "VEGA56", "R9 390"]) {
    assert.equal(productCoreIdentity({...gpu, model, name: model}), null);
  }
  assert.equal(productCoreIdentity({...gpu, category: "整机", model: "RTX5090", name: "RTX5090 整机"}), null);
});

test("core key ignores all physical conditions while product keys keep them", () => {
  assert.equal(quoteIdentityKey(quote("q")), quoteIdentityKey(quote("q2", {profile: {...profile, vram: "32 GB"}})));
  assert.equal(quoteIdentityKey(quote("q")), quoteIdentityKey(quote("q2", {profile: {...profile, condition: "new", grade: "全新"}})));
  assert.equal(quoteIdentityKey({quoteScope: "core", coreId: "GPU-NVIDIA-RTX5090"}), "core|GPU-NVIDIA-RTX5090|CNY");
  const specific = {quoteScope: "product" as const, coreId: "GPU-NVIDIA-RTX5090", productId: product.id, profile};
  assert.notEqual(quoteIdentityKey(specific), quoteIdentityKey({...specific, profile: {...profile, condition: "new", grade: "全新"}}));
  assert.notEqual(quoteIdentityKey(quote("q")), quoteIdentityKey(quote("q2", {quoteScope: "product", productId: product.id})));
  assert.equal(quoteIdentityKey({productId: product.id}), null);
  assert.match(quoteProfileKey(profile), /32G\|CNY$/);
});

test("historical product quotes never override the core base or mutate source records", () => {
  const quotes = [quote("base"), quote("override", {quoteScope: "product", productId: product.id, profile})];
  const before = JSON.stringify({product, quotes});
  const result = resolveQuoteReference(product, quotes, "2026-10-13");
  assert.equal(result.status, "matched");
  assert.equal(result.status === "matched" && result.quote.id, "base");
  assert.equal(result.status === "matched" && result.source, "core");
  assert.equal(JSON.stringify({product, quotes}), before);
});

test("expired, legacy, wrong core/spec/condition quotes are not silently applied", () => {
  const invalid = [quote("expired", {validUntil: "2026-10-12"}), quote("wrong-core", {coreId: "GPU-NVIDIA-RTX5090D"}), quote("new", {profile: {...profile, condition: "new"}}), quote("small", {profile: {...profile, vram: "24G"}}), quote("legacy", {quoteScope: undefined})];
  for (const item of invalid) assert.equal(resolveQuoteReference(product, [item], "2026-10-13").status, "unmatched");
  assert.equal(resolveQuoteReference(product, invalid, "2026-10-13").status, "ambiguous");
  assert.equal(quoteIsExpired({validUntil: "2026-10-13"}, "2026-10-13"), false);
  assert.equal(quoteIsExpired({validUntil: "2026-10-12"}, "2026-10-13"), true);
});

test("missing core prices stay missing and never fall back to historical dedicated prices", () => {
  const result = resolveQuoteReference(product, [quote("base", {refBuyPrice: null, refSellPrice: 0}), quote("specific", {quoteScope: "product", productId: product.id, profile, refBuyPrice: 99, refSellPrice: 199})], "2026-10-13");
  assert.equal(result.status, "matched");
  if (result.status === "matched") {assert.equal(result.quote.refBuyPrice, null); assert.equal(result.quote.refSellPrice, 0);}
});

test("retired product condition comparisons cannot match or make core prices ambiguous", () => {
  const target = {...profile, warranty: "in" as const, packaging: "boxed" as const};
  const exact = quote("exact", {quoteScope: "product", productId: product.id, profile: target});
  const result = resolveQuoteReference(product, [quote("base"), exact], "2026-10-13");
  assert.equal(result.status === "matched" && result.quote.id, "base");
  assert.equal(resolveQuoteReference(product, [exact, {...exact, id: "duplicate"}], "2026-10-13").status, "unmatched");
  assert.equal(resolveQuoteReference(product, [quote("in", {profile: {...profile, warranty: "in"}})], "2026-10-13").status, "unmatched");
});

test("profile labels disclose wildcard conditions instead of claiming all goods are standard", () => {
  assert.equal(quoteProfileLabel(), "旧报价 · 条件待确认");
  assert.match(quoteProfileLabel(profile), /二手 · 95新 · 质保不限 · 包装不限 · 32G/);
  assert.equal(quoteProfileLabel({...profile, condition: "new", grade: "全新"}), "全新 · 质保不限 · 包装不限 · 32G");
  assert.equal(quoteProfileLabel(coreQuoteProfile(), "core"), "核心基础价 · 不分新旧");
  assert.match(quoteProfileLabel(profile, "core"), /待确认为核心基础价/);
  assert.equal(isCoreBaseQuote(quote("base")), true);
});

test("a profile for a different physical capacity cannot quote the selected product", () => {
  const smaller = {...profile, vram: "24G"};
  assert.equal(resolveQuoteReference(product, [quote("small", {quoteScope: "product", productId: product.id, profile: smaller})], "2026-10-13").status, "unmatched");
  assert.equal(resolveQuoteReference({...product, vram: undefined}, [quote("base")], "2026-10-13").status, "matched");
});

test("one core base price applies to new, used, warranty, packaging and capacity variants", () => {
  for (const target of [profile, {...profile, condition: "new" as const, grade: "全新", warranty: "in" as const, packaging: "boxed" as const}, {...profile, grade: "90新", warranty: "out" as const, packaging: "unboxed" as const, vram: "24G"}]) {
    const result = resolveQuoteReference({...product, ...target}, [quote("base")], "2026-10-13");
    assert.equal(result.status === "matched" && result.quote.id, "base");
  }
  assert.equal(resolveQuoteReference(product, [quote("base"), quote("duplicate")], "2026-10-13").status, "ambiguous");
  assert.equal(resolveQuoteReference(product, [quote("base"), quote("old-conditions", {profile})], "2026-10-13").status, "ambiguous");
  assert.equal(resolveQuoteReference(product, [quote("old-conditions", {profile})], "2026-10-13").status, "unmatched");
});

test("overview consumers exclude unconfirmed/expired quotes and preserve missing/zero prices", () => {
  assert.equal(quoteReferenceSummary(quote("legacy", {quoteScope: undefined}), "2026-10-13"), null);
  assert.equal(quoteReferenceSummary(quote("expired", {validUntil: "2026-10-12"}), "2026-10-13"), null);
  assert.equal(quoteReferenceSummary(quote("missing", {refSellPrice: null, todaySellPrice: 120}), "2026-10-13")?.sellPrice, null);
  assert.equal(quoteReferenceSummary(quote("zero", {refSellPrice: 0}), "2026-10-13")?.sellPrice, 0);
  assert.equal(quoteReferenceSummary(quote("first", {changeRatio: 12}), "2026-10-13")?.changeRatio, null);
  const quoted = quote("comparison", {changeRatio: 10});
  const key = quoteIdentityKey(quoted)!;
  quoted.history = [{date: "2026-10-12", buyPrice: 100, sellPrice: 200, quoteKey: key}, {date: "2026-10-13", buyPrice: 110, sellPrice: 200, quoteKey: key}];
  assert.equal(quoteReferenceSummary(quoted, "2026-10-13")?.changeRatio, 10);
  assert.match(quoteReferenceSummary(quoted, "2026-10-13")?.title || "", /RTX5090 · 核心基础价 · 不分新旧/);
  assert.equal(quoteReferenceSummary(quote("old-conditions", {profile}), "2026-10-13"), null);
  assert.equal(quoteReferenceSummary(quote("retired-product", {quoteScope: "product", productId: product.id, profile}), "2026-10-13"), null);
});
