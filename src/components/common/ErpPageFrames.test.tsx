import assert from "node:assert/strict";
import test from "node:test";
import {renderToStaticMarkup} from "react-dom/server";
import {
  ErpAnalyticsPageFrame,
  ErpCrmPageFrame,
  ErpDetailPageFrame,
  ErpFinancePageFrame,
  ErpListPageFrame,
  ErpSettingsPageFrame,
  ErpTransactionPageFrame,
  ErpWarehousePageFrame,
} from "./ErpPageFrames";

const frames = [
  ["list", ErpListPageFrame],
  ["transaction", ErpTransactionPageFrame],
  ["warehouse", ErpWarehousePageFrame],
  ["finance", ErpFinancePageFrame],
  ["crm", ErpCrmPageFrame],
  ["analytics", ErpAnalyticsPageFrame],
  ["detail", ErpDetailPageFrame],
  ["settings", ErpSettingsPageFrame],
] as const;

test("all ERP page frames render their business content", () => {
  frames.forEach(([name, Frame]) => {
    const markup = renderToStaticMarkup(<Frame><span>{name}-content</span></Frame>);
    assert.match(markup, new RegExp(`data-page-frame="${name}"`));
    assert.match(markup, new RegExp(`${name}-content`));
  });
});

test("ERP page frames preserve a caller-provided max width", () => {
  const markup = renderToStaticMarkup(<ErpSettingsPageFrame className="max-w-5xl"><span>settings-content</span></ErpSettingsPageFrame>);
  assert.match(markup, /max-w-5xl/);
  assert.doesNotMatch(markup, /max-w-\[1760px\]/);
  assert.match(markup, /settings-content/);
});
