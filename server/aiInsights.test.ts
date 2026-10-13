import assert from "node:assert/strict";
import test from "node:test";
import { buildAiBusinessSnapshot, buildRuleAiInsights, parseModelInsightsContent } from "./aiInsights.ts";
import type {AppState} from "./store.ts";
import type {MarketQuote} from "../src/types/quote.ts";
import {coreQuoteProfile, quoteIdentityKey} from "../src/utils/quoteReference.ts";

test("AI market evidence includes confirmed conditions and excludes expired, legacy or missing quotes", () => {
  const profile = coreQuoteProfile();
  const quote = {id: "Q-CORE", quoteScope: "core", coreId: "GPU-NVIDIA-RTX5090", coreModel: "RTX5090", model: "RTX5090", productName: "RTX5090", profile, source: "人工询价", refBuyPrice: 110, refSellPrice: 200, changeRatio: 10} as MarketQuote;
  const key = quoteIdentityKey(quote)!;
  quote.history = [{date: "2026-10-12", buyPrice: 100, sellPrice: 200, quoteKey: key}, {date: "2026-10-13", buyPrice: 110, sellPrice: 200, quoteKey: key}];
  const state = {inventory: [], salesInvoices: [], purchaseInvoices: [], marketQuotes: [quote, {...quote, quoteScope: undefined}, {...quote, quoteScope: "product", productId: "P-RETIRED"}, {...quote, validUntil: "2026-10-12"}, {...quote, refSellPrice: null}, {...quote, history: []}]} as unknown as AppState;
  const snapshot = buildAiBusinessSnapshot(state, "2026-10-13");
  assert.equal(snapshot.market.length, 1);
  assert.match(snapshot.market[0]!.productName, /RTX5090 · 核心基础价 · 不分新旧/);
  const insight = buildRuleAiInsights(snapshot).find(item => item.actionTab === "quotes")!;
  assert.match(insight.detail, /回收参考价较上次上涨/);
  assert.match(insight.detail, /报价来源/);
});

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

test("AI response parser accepts fenced or wrapped JSON but keeps the normalized contract", () => {
  const content = `建议如下：\n\`\`\`json\n{"insights":[{"label":"库存风险","title":"RTX 3090 需要复核","detail":"建议人工复核库龄与报价。","severity":"high","actionLabel":"去处理","actionTab":"inventory","evidence":["库龄 60 天"],"confidence":101}]}\n\`\`\``;
  const [insight] = parseModelInsightsContent(content);
  assert.equal(insight?.severity, "high");
  assert.equal(insight?.actionTab, "inventory");
  assert.equal(insight?.confidence, 100);
  assert.deepEqual(insight?.evidence, ["库龄 60 天"]);
});

test("AI response parser rejects truncated or structurally invalid provider output", () => {
  assert.throws(() => parseModelInsightsContent('{"insights":[{"title":"截断'), /合法 JSON/);
  assert.throws(() => parseModelInsightsContent('{"items":[]}'), /结构无效/);
});
