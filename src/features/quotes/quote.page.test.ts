import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import test from "node:test";

test("quote overlays have exactly one owner across custom desktop and mobile list content", () => {
  const source = readFileSync(new URL("./pages/MarketQuotesPage.tsx", import.meta.url), "utf8");
  assert.equal((source.match(/overlays=\{overlays\}/g) || []).length, 1);
  assert.equal((source.match(/\{overlays\}(?!\})/g) || []).length, 1);
  const desktop = source.slice(source.indexOf("const desktopContent"), source.indexOf("return <ErpListPage"));
  assert.equal(desktop.includes("{overlays}"), false);
  assert.equal(source.includes("canDelete: fullPriceAccess && session.permissions.canDelete"), true);
});

test("form has no scope/product/physical-condition controls and requires explicit historical conversion", () => {
  const source = readFileSync(new URL("./components/MarketQuoteDialog.tsx", import.meta.url), "utf8");
  for (const removed of ["ErpSegmentedControl", 'label="真实商品"', 'label="新旧"', 'label="成色"', 'label="质保"', 'label="包装"', 'label="显存容量"', 'label="报价来源"']) assert.equal(source.includes(removed), false);
  assert.equal(source.includes("disabled={requiresConversion && !conversionConfirmed}"), true);
  assert.equal(source.includes("确认转换为核心基础价"), true);
  assert.equal(source.includes('form.reset({...quote'), false);
});

test("page has no product or condition filters and detail has no product query selectors", () => {
  const page = readFileSync(new URL("./pages/MarketQuotesPage.tsx", import.meta.url), "utf8");
  for (const removed of ['key: "quoteScope"', 'key: "condition"', "scopeOptions", "conditionOptions"]) assert.equal(page.includes(removed), false);
  const detail = readFileSync(new URL("./components/MarketQuoteDetail.tsx", import.meta.url), "utf8");
  for (const removed of ["<Select", "查询商品", "商品专属条件", "lookupProductQuoteReference"]) assert.equal(detail.includes(removed), false);
  assert.equal(detail.includes("历史待确认"), true);
});
