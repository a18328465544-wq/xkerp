import assert from "node:assert/strict";
import test from "node:test";
import { buildAiBusinessSnapshot, buildRuleAiInsights } from "./aiInsights.ts";

test("AI snapshot excludes customer privacy and turns aged inventory into actionable advice", () => {
  const state = {
    inventory: [{ id: "KC-1", productName: "RTX 3090", model: "RTX 3090", entryTime: "2026-06-01", costPrice: 5000, marketPrice: 4500, estSellPrice: 5200, status: "已入库", salesPrice: 0 }],
    salesInvoices: [], purchaseInvoices: [],
    marketQuotes: [{ id: "Q-1", productName: "RTX 4080", model: "RTX 4080", todaySellPrice: 6200, changeRatio: 3.2 }],
  } as any;
  const snapshot = buildAiBusinessSnapshot(state, "2026-07-29");
  const insights = buildRuleAiInsights(snapshot);
  assert.equal(snapshot.inventory.risks[0]?.productName, "RTX 3090");
  assert.equal(insights[0]?.actionTab, "inventory");
  assert.match(insights[0]?.detail || "", /人工复核报价与周转策略/);
  assert.doesNotMatch(insights[0]?.detail || "", /建议降价/);
  assert.equal(JSON.stringify(snapshot).includes("KC-1"), false);
});
