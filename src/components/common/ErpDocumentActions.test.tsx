import assert from "node:assert/strict";
import test from "node:test";
import {renderToStaticMarkup} from "react-dom/server";
import {ErpDocumentActions} from "./ErpDocumentActions";

test("document actions preserve exact desktop controls", () => {
  assert.equal(renderToStaticMarkup(<ErpDocumentActions phone={false} actions={[]} desktopContent={<div>原操作</div>} />), "<div>原操作</div>");
});

test("phone documents expose one main command and keep dangerous commands behind More", () => {
  const markup = renderToStaticMarkup(<ErpDocumentActions phone actions={[
    {key: "complete", label: "完成退货", phone: "primary"},
    {key: "edit", label: "编辑资料", phone: "more"},
    {key: "void", label: "作废退货单", phone: "more", variant: "danger"},
  ]} desktopContent={null} />);
  assert.match(markup, /完成退货/);
  assert.match(markup, /更多/);
  assert.doesNotMatch(markup, /编辑资料|作废退货单/);
});

test("empty permission-filtered actions create no synthetic command", () => {
  assert.equal(renderToStaticMarkup(<ErpDocumentActions phone actions={[]} desktopContent={null} />), "");
});

test("pending or ineligible main actions remain disabled", () => {
  const markup = renderToStaticMarkup(<ErpDocumentActions phone actions={[{key: "edit", label: "编辑", phone: "primary", disabled: true}]} desktopContent={null} />);
  assert.match(markup, /disabled=""/);
});
