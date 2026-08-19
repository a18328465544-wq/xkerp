import assert from "node:assert/strict";
import test from "node:test";
import {renderToStaticMarkup} from "react-dom/server";
import {normalizeSelectSearchText, Select, selectOptionLabelText, selectOptionMatches} from "./select";

test("Select uses full width by default", () => {
  const markup = renderToStaticMarkup(<Select value="all" options={[{value: "all", label: "全部"}]} onValueChange={() => undefined} />);
  assert.match(markup, /w-full/);
});

test("Select respects a compact width supplied by a list filter", () => {
  const markup = renderToStaticMarkup(<Select className="w-36" value="all" options={[{value: "all", label: "全部"}]} onValueChange={() => undefined} />);
  assert.match(markup, /w-36/);
  assert.doesNotMatch(markup, /w-full/);
});

test("Select reuses its searchable mode for entity choices", () => {
  const markup = renderToStaticMarkup(<Select searchable searchPlaceholder="搜索商品名称或型号" value="" options={[{value: "gpu-1", label: "华硕 RTX 4090"}]} onValueChange={() => undefined} aria-label="选择商品" />);
  assert.match(markup, /role="combobox"/);
  assert.match(markup, /搜索商品名称或型号/);
  assert.match(markup, /aria-label="选择商品"/);
});

test("Select searchable mode keeps the selected entity label in the search box", () => {
  const markup = renderToStaticMarkup(<Select searchable value="customer-1" options={[{value: "customer-1", label: "张先生 · 13800000000"}]} onValueChange={() => undefined} aria-label="选择客户" />);
  assert.match(markup, /value="张先生 · 13800000000"/);
  assert.match(markup, /清除选择客户/);
});

test("Select keeps display text separate from searchable keywords", () => {
  const option = {value: "gpu-1", label: "华硕 RTX 4090 · 24G", searchText: "ROG STRIX 猛禽 RTX4090 24GB"};
  assert.equal(selectOptionLabelText(option), "华硕 RTX 4090 · 24G");
  assert.equal(selectOptionMatches(option, "ROG 24GB"), true);
  const markup = renderToStaticMarkup(<Select searchable value="gpu-1" options={[option]} onValueChange={() => undefined} aria-label="选择商品" />);
  assert.match(markup, /value="华硕 RTX 4090 · 24G"/);
  assert.doesNotMatch(markup, /value="ROG STRIX/);
});

test("Select search normalization supports full-width text, compact models and separators", () => {
  assert.equal(normalizeSelectSearchText("ＲＴＸ－４０９０  · 24GB"), "rtx 4090 24gb");
  const option = {value: "gpu-1", label: "华硕 RTX 4090 · 24G", searchText: "ASUS ROG STRIX 24GB"};
  assert.equal(selectOptionMatches(option, "rtx4090"), true);
  assert.equal(selectOptionMatches(option, "asus 24gb"), true);
  assert.equal(selectOptionMatches(option, "4080"), false);
});
