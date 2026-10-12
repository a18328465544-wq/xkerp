import assert from "node:assert/strict";
import test from "node:test";
import {renderToStaticMarkup} from "react-dom/server";
import {ErpSearchInput} from "./ErpSearchInput";
import {SearchInput} from "../ui/search-input";
import {Button} from "../ui/button";

test("ERP and UI selectors share exactly one search primitive", () => {
  assert.equal(ErpSearchInput, SearchInput);
});

test("ErpSearchInput owns the shared search shell and compact input contract", () => {
  const markup = renderToStaticMarkup(<ErpSearchInput className="min-w-64 flex-1" density="compact" aria-label="搜索商品" placeholder="搜索商品" />);
  assert.match(markup, /data-erp-component="search-input"/);
  assert.match(markup, /erp-search-input-shell/);
  assert.match(markup, /role="searchbox"/);
  assert.match(markup, /data-erp-search-icon="true"/);
  assert.match(markup, /aria-hidden="true"/);
  assert.match(markup, /data-density="compact"/);
  assert.match(markup, /data-variant="search"/);
  assert.match(markup, /pl-9/);
  assert.match(markup, /min-w-64 flex-1/);
});

test("ErpSearchInput exposes a clear affordance only for a non-empty value", () => {
  const emptyMarkup = renderToStaticMarkup(<ErpSearchInput value="" onChange={() => undefined} clearable onClear={() => undefined} aria-label="搜索" />);
  const filledMarkup = renderToStaticMarkup(<ErpSearchInput value="RTX" onChange={() => undefined} onClear={() => undefined} aria-label="搜索" />);
  assert.doesNotMatch(emptyMarkup, /清除搜索/);
  assert.match(filledMarkup, /清除搜索/);
  assert.match(filledMarkup, /aria-label="清除搜索"/);
});

test("a trailing action is a separate button, outside the editable/clear field", () => {
  const markup = renderToStaticMarkup(<ErpSearchInput value="000123" onChange={() => undefined} aria-label="搜索库存" trailingAction={<Button type="button" aria-label="扫码" title="扫码" size="iconTouch" variant="ghost">图标</Button>} />);
  assert.match(markup, /data-erp-search-action="true"/);
  assert.match(markup, /data-erp-region="search-field"[\s\S]*?value="000123"[\s\S]*?aria-label="清除搜索"[\s\S]*?data-erp-region="search-action"/);
  assert.match(markup, /data-erp-region="search-action"><button(?=[^>]*aria-label="扫码")(?=[^>]*type="button")[^>]*>/);
  assert.doesNotMatch(markup, /<label/);
});

test("ordinary searches do not receive a trailing-action shell", () => {
  const markup = renderToStaticMarkup(<ErpSearchInput value="4090" onChange={() => undefined} aria-label="搜索商品" />);
  assert.doesNotMatch(markup, /data-erp-search-action|data-erp-region="search-(field|action)"/);
});
