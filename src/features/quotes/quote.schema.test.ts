import assert from "node:assert/strict";
import test from "node:test";
import {defaultMarketQuoteValues, marketQuoteSchema} from "./quote.schema";
import {coreQuoteProfile} from "@/src/utils/quoteReference";

const modern = {...defaultMarketQuoteValues, model: "rtx4070ti", coreModel: "RTX4070ti", source: "门店询价", buyPrice: null, sellPrice: 0};
const historicalProfile = {condition: "used" as const, grade: "95新", warranty: "in" as const, packaging: "boxed" as const, vram: "12G", currency: "CNY" as const};

test("new quote defaults to one core base profile and missing prices", () => {
  assert.equal(defaultMarketQuoteValues.quoteScope, "core");
  assert.equal(defaultMarketQuoteValues.coreModel, "");
  assert.equal(defaultMarketQuoteValues.buyPrice, null);
  assert.equal(defaultMarketQuoteValues.sellPrice, null);
  assert.deepEqual(defaultMarketQuoteValues.profile, coreQuoteProfile());
  assert.equal(marketQuoteSchema.safeParse(defaultMarketQuoteValues).success, false);
});

test("schema keeps complete RTX prefix and normalizes case without bare-model aliases", () => {
  for (const name of ["RTX4070TI", "rtx4070ti", "RTX4070ti", "rTx4070Ti"]) {
    const result = marketQuoteSchema.parse({...modern, model: name, coreModel: name});
    assert.equal(result.model, "RTX4070TI");
    assert.equal(result.coreModel, "RTX4070TI");
    assert.equal(result.coreId, "GPU-NVIDIA-RTX4070TI");
  }
  for (const name of ["4070TI", "4070ti", "unknown"]) assert.equal(marketQuoteSchema.safeParse({...modern, coreModel: name}).success, false);
});

test("nullable price preserves zero and validates amount/source/date/core identity", () => {
  assert.equal(marketQuoteSchema.safeParse(modern).success, true);
  for (const invalid of [{...modern, sellPrice: null}, {...modern, buyPrice: -1}, {...modern, source: "x".repeat(301)}, {...modern, validUntil: "2026-02-30"}, {...modern, coreId: "GPU-NVIDIA-RTX4070"}]) assert.equal(marketQuoteSchema.safeParse(invalid).success, false);
});

test("source is optional and form no longer requires it", () => {
  for (const source of [undefined, "", " "]) assert.equal(marketQuoteSchema.safeParse({...modern, source}).success, true);
});

test("write schema rejects product/unbound scope but explicit conversion normalizes profile and clears product", () => {
  assert.equal(marketQuoteSchema.safeParse({...modern, quoteScope: "product", productId: "P-ASUS", profile: historicalProfile}).success, false);
  assert.equal(marketQuoteSchema.safeParse({...modern, quoteScope: undefined}).success, false);
  for (const profile of [undefined, historicalProfile]) {
    const converted = marketQuoteSchema.parse({...modern, profile, productId: "P-OLD"});
    assert.deepEqual(converted.profile, coreQuoteProfile());
    assert.equal(converted.productId, "");
    assert.equal(converted.quoteScope, "core");
  }
});
