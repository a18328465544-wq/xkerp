import assert from "node:assert/strict";
import test from "node:test";
import {createInitialState} from "./store.ts";
import {marketQuotePriceChange, marketQuotePriceChanges, snapshotMarketQuote} from "./marketQuoteNotifications.ts";
import {coreQuoteProfile} from "../src/utils/quoteReference.ts";

test("market quote change detection ignores timestamp-only updates", () => {
  const state = createInitialState();
  const quote = state.marketQuotes[0];
  assert.ok(quote);
  const before = snapshotMarketQuote(quote);
  const after = {...quote, updateTime: "2026-09-03 11:00", history: [...(quote.history || []), {date: "09-03", buyPrice: quote.todayBuyPrice, sellPrice: quote.todaySellPrice}]};
  assert.equal(marketQuotePriceChange(before, after), null);
});

test("market quote change detection reports buy or sell price changes", () => {
  const state = createInitialState();
  const quote = state.marketQuotes[0];
  assert.ok(quote);
  const before = {...snapshotMarketQuote(quote), refBuyPrice: quote.todayBuyPrice, refSellPrice: quote.todaySellPrice};
  const after = {...before, refBuyPrice: quote.todayBuyPrice + 100};
  const change = marketQuotePriceChange(before, after);
  assert.ok(change);
  assert.equal(change.previousBuyPrice, quote.todayBuyPrice);
  assert.equal(change.nextBuyPrice, quote.todayBuyPrice + 100);
  assert.equal(change.previousSellPrice, quote.todaySellPrice);
  assert.equal(change.nextSellPrice, quote.todaySellPrice);
});

test("batch change detection excludes newly created and unchanged quotes", () => {
  const state = createInitialState();
  const existing = state.marketQuotes[0];
  assert.ok(existing);
  const beforeQuote = {...snapshotMarketQuote(existing), refBuyPrice: existing.todayBuyPrice, refSellPrice: existing.todaySellPrice};
  const before = new Map([[existing.id, beforeQuote]]);
  const changed = {...beforeQuote, refSellPrice: existing.todaySellPrice + 200};
  const created = {...beforeQuote, id: "MQ-NEW"};
  assert.deepEqual(marketQuotePriceChanges(before, [changed, existing, created]).map((item) => item.quoteId), [existing.id]);
});

test("notifications never coerce modern null prices to zero or compare converted/expired conditions", () => {
  const state = createInitialState();
  const quote = {...state.marketQuotes[0], quoteScope: "core" as const, coreId: "GPU-NVIDIA-RTX5090", coreModel: "RTX5090",
    profile: coreQuoteProfile(), source: "门店", refBuyPrice: null, refSellPrice: 200};
  assert.equal(marketQuotePriceChange(quote, {...quote, refBuyPrice: 100}), null);
  const priced = {...quote, refBuyPrice: 0};
  assert.equal(marketQuotePriceChange(priced, {...priced, refBuyPrice: 100})?.previousBuyPrice, 0);
  assert.equal(marketQuotePriceChange(priced, {...priced, refBuyPrice: 100, validUntil: "2000-01-01"}), null);
  assert.equal(marketQuotePriceChange(priced, {...priced, refBuyPrice: 100, profile: {...priced.profile, condition: "new"}}), null);
  const conditioned = {...priced, profile: {...priced.profile, condition: "used" as const, grade: "95新", vram: "32G"}};
  assert.equal(marketQuotePriceChange(conditioned, {...priced, refBuyPrice: 100}), null);
  assert.equal(marketQuotePriceChange({...priced, quoteScope: undefined, coreId: undefined, profile: undefined}, {...priced, refBuyPrice: 100}), null);
});
