import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import test from "node:test";

const globals = readFileSync(new URL("./globals.css", import.meta.url), "utf8");
const tokens = readFileSync(new URL("./tokens.css", import.meta.url), "utf8");

test("responsive overlay contract keeps workspace tabs above all secondary surfaces", () => {
  assert.match(tokens, /--erp-layer-tab-navigation:\s*1000/);
  assert.match(tokens, /--erp-layer-popover:\s*950/);
  assert.match(tokens, /--erp-layer-modal:\s*925/);
  assert.match(tokens, /--erp-layer-drawer:\s*900/);
  assert.match(globals, /\.erp-tab-navigation[\s\S]*z-index:\s*var\(--erp-layer-tab-navigation\)/);
  assert.match(globals, /\.erp-dialog-backdrop[\s\S]*top:\s*var\(--erp-workspace-bar-height\)/);
  assert.match(globals, /\.erp-drawer-backdrop,[\s\S]*\.erp-drawer-viewport[\s\S]*top:\s*var\(--erp-workspace-bar-height\)/);
});

test("responsive overlay contract gives narrow windows bounded bottom-sheet surfaces", () => {
  assert.match(tokens, /--erp-overlay-mobile-height:\s*calc\(100dvh - var\(--erp-workspace-bar-height\)/);
  assert.match(globals, /@media \(max-width: 639px\)/);
  assert.match(globals, /\.erp-option-positioner[\s\S]*position:\s*fixed !important/);
  assert.match(globals, /\.erp-popover-positioner[\s\S]*position:\s*fixed !important/);
  assert.match(globals, /\.erp-picker-listbox[\s\S]*max-height:\s*var\(--erp-overlay-mobile-height\) !important/);
  assert.match(globals, /\.erp-dialog-viewport:not\(\.erp-drawer-viewport\) > \.erp-dialog-popup/);
  assert.match(globals, /\.erp-dialog-viewport:not\(\.erp-drawer-viewport\) > \.erp-dialog-popup[\s\S]*margin-block:\s*auto/);
  assert.match(globals, /\.erp-dialog-viewport:not\(\.erp-drawer-viewport\) > \.erp-dialog-popup[\s\S]*margin-block:\s*0/);
});
