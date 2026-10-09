import assert from "node:assert/strict";
import test from "node:test";
import {renderToStaticMarkup} from "react-dom/server";
import {Switch} from "./switch";

test("Switch renders checked state with data-checked and erp-switch classes", () => {
  const markup = renderToStaticMarkup(<Switch checked={true} aria-label="开发票" />);
  assert.match(markup, /role="switch"/);
  assert.match(markup, /aria-checked="true"/);
  assert.match(markup, /erp-switch-root/);
  assert.match(markup, /erp-switch-thumb/);
});

test("Switch renders unchecked state with aria-checked false", () => {
  const markup = renderToStaticMarkup(<Switch checked={false} aria-label="运费到付" />);
  assert.match(markup, /role="switch"/);
  assert.match(markup, /aria-checked="false"/);
});

test("Switch supports disabled state", () => {
  const markup = renderToStaticMarkup(<Switch disabled aria-label="禁用开关" />);
  assert.match(markup, /disabled/);
});
