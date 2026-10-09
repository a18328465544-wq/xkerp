import assert from "node:assert/strict";
import test from "node:test";
import {renderToStaticMarkup} from "react-dom/server";
import {FinanceDetailPageLayout} from "./FinanceDetailPageLayout";

test("finance detail layout keeps its desktop region order and collapsed analysis state", () => {
  const markup = renderToStaticMarkup(
    <FinanceDetailPageLayout
      header={{title: "财务明细"}}
      filters={<span>filter-slot</span>}
      metrics={<span>metrics-slot</span>}
      table={<span>table-slot</span>}
      analysis={{title: "收支分析", preferenceKey: "test-page", children: <span>analysis-slot</span>}}
    />,
  );
  const slots = [
    'data-erp-region="page-topbar"',
    'data-erp-region="page-toolbar"',
    'data-finance-layout-slot="metrics"',
    'data-finance-layout-slot="table"',
    'data-finance-layout-slot="analysis"',
  ].map((slot) => markup.indexOf(slot));

  assert.ok(slots.every((position) => position >= 0));
  assert.deepEqual(slots, [...slots].sort((left, right) => left - right));
  assert.match(markup, /aria-expanded="false"/);
  assert.match(markup, /hidden=""[^>]*aria-hidden="true"/);
});
