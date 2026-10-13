import assert from "node:assert/strict";
import test from "node:test";
import type {MarketQuoteItem, QuoteProductOption, QuoteProfile} from "@/src/types/quote";
import {coreQuoteProfile, quoteIdentityKey} from "@/src/utils/quoteReference";
import {currentQuoteHistory, quoteCoreSuggestions, quoteNeedsConfirmation, quoteScopeLabel, quoteTitle} from "./quote.reference";
import {quoteExportRows} from "./quote.export";
import {filterQuotes, parseQuoteFilters, sortQuotes} from "./quote.filters";

const oldProfile: QuoteProfile = {condition: "used", grade: "95新", warranty: "any", packaging: "any", vram: "12G", currency: "CNY"};
const quote: MarketQuoteItem = {id: "Q-CORE", productName: "RTX4070TI", model: "rtx4070ti", brand: "NVIDIA", quoteScope: "core", coreId: "GPU-NVIDIA-RTX4070TI", coreModel: "rtx4070ti", profile: coreQuoteProfile(), source: "门店询价", sellPrice: 0, trend: "stable", history: [], stockCount: 2};
const product: QuoteProductOption = {id: "P-ASUS", name: "华硕 RTX4070TI", model: "RTX4070TI", category: "显卡", brand: "华硕", vram: "12G"};
const archived: MarketQuoteItem = {...quote, id: "Q-OLD-PRODUCT", quoteScope: "product", productId: product.id, productName: product.name, profile: oldProfile, sellPrice: 4300};

test("all non-base historical records are pending confirmation and never supply current trend", () => {
  const key = quoteIdentityKey(quote)!;
  const history = [{date: "2026-10-10", buyPrice: 100}, {date: "2026-10-11", buyPrice: 200, quoteKey: "product|P-ASUS|used|95新|any|any|12G|CNY"}, {date: "2026-10-12", buyPrice: 0, quoteKey: key}, {date: "2026-10-13", buyPrice: 10, quoteKey: key}];
  assert.deepEqual(currentQuoteHistory({...quote, history}).map((point) => point.buyPrice), [0, 10]);
  for (const old of [archived, {...quote, quoteScope: undefined}, {...quote, profile: oldProfile}]) {
    assert.equal(quoteNeedsConfirmation(old), true);
    assert.equal(currentQuoteHistory({...old, history}).length, 0);
    assert.equal(quoteScopeLabel(old), "历史报价 · 待确认");
  }
});

test("core title and suggestions retain the prefix, normalize case and distinguish suffixes", () => {
  assert.equal(quoteTitle(quote), "RTX4070TI");
  assert.equal(quoteTitle(archived), "RTX4070TI");
  const options = quoteCoreSuggestions([product, {...product, id: "P-2"}, {...product, id: "P-SUPER", model: "RTX4070TI SUPER", name: "RTX4070TI SUPER"}], [quote]);
  assert.deepEqual(options.map((option) => option.coreId), ["GPU-NVIDIA-RTX4070TI", "GPU-NVIDIA-RTX4070TISUPER"]);
});

test("CSV contains core pricing and marks all old scopes as historical pending confirmation", () => {
  const rows = quoteExportRows([quote, archived, {...quote, id: "Q-OLD", profile: oldProfile}], {showCost: true, showProfit: true});
  const header = rows[0]!;
  assert.equal(header.includes("报价条件"), false);
  assert.equal(rows[1]?.[header.indexOf("完整核心型号")], "RTX4070TI");
  assert.equal(rows[1]?.[header.indexOf("回收参考价")], "暂无报价");
  assert.equal(rows[1]?.[header.indexOf("销售参考价")], 0);
  assert.equal(rows[2]?.[header.indexOf("有效状态")], "历史待确认");
  assert.equal(rows[3]?.[header.indexOf("有效状态")], "历史待确认");
  const hidden = quoteExportRows([archived], {showCost: false, showProfit: false});
  assert.equal(hidden[0]?.includes("回收参考价"), false);
  assert.equal(hidden[0]?.includes("销售参考价"), false);
  assert.equal(hidden[1]?.includes(4300), false);
});

test("core search and missing-price sorting retain legitimate zero", () => {
  assert.equal(filterQuotes([quote], {...parseQuoteFilters(""), keyword: "核心基础价 RTX4070ti GPU-NVIDIA-RTX4070TI 门店"}).length, 1);
  assert.equal(filterQuotes([archived], {...parseQuoteFilters(""), keyword: "历史报价 待确认"}).length, 1);
  assert.deepEqual(sortQuotes([archived, {...quote, sellPrice: undefined}, quote], [{id: "sellPrice", desc: false}]).map((row) => row.sellPrice), [0, 4300, undefined]);
});
