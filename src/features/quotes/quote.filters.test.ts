import assert from "node:assert/strict";
import test from "node:test";
import {filterQuotes, parseQuoteFilters, quoteFiltersToSearch} from "./quote.filters";
import {UNCLASSIFIED_QUOTE_CATEGORY} from "./quote.filters";
import type {MarketQuoteItem} from "@/src/types/quote";

const quote: MarketQuoteItem = {id: "MQ-1", productName: "华硕 RTX 4090 猛禽", model: "RTX 4090", brand: "NVIDIA", trend: "up", note: "货源偏少", history: [], stockCount: 1};

test("quote URL filters round-trip", () => {
  const filters = parseQuoteFilters("?keyword=4090&brand=NVIDIA&categoryId=MQC-gpu&trend=up&page=2&pageSize=50");
  assert.equal(filters.trend, "up");
  assert.equal(quoteFiltersToSearch(filters).get("page"), "2");
  assert.equal(quoteFiltersToSearch(filters).get("pageSize"), "50");
  assert.equal(quoteFiltersToSearch(filters).get("categoryId"), "MQC-gpu");
});

test("quote category filters separate assigned and unclassified market rows", () => {
  const assigned = {...quote, categoryId: "MQC-gpu", categoryName: "显卡"};
  assert.deepEqual(filterQuotes([assigned, quote], {...parseQuoteFilters(""), categoryId: "MQC-gpu"}), [assigned]);
  assert.deepEqual(filterQuotes([assigned, quote], {...parseQuoteFilters(""), categoryId: UNCLASSIFIED_QUOTE_CATEGORY}), [quote]);
});

test("quote filters search adapted domain fields", () => {
  assert.equal(filterQuotes([quote], {...parseQuoteFilters(""), keyword: "4090 货源"}).length, 1);
  assert.equal(filterQuotes([quote], {...parseQuoteFilters(""), trend: "down"}).length, 0);
});
