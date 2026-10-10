import assert from "node:assert/strict";
import test from "node:test";
import {createMarketQuoteHelpers, type MarketQuoteState} from "./storeMarketQuotes.ts";

test("changing only a market quote category does not create price history or synchronize inventory", () => {
  const quote = {
    id: "MQ-1",
    productId: "SP-1",
    productName: "RTX 4090",
    model: "RTX 4090",
    brand: "NVIDIA",
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
});
