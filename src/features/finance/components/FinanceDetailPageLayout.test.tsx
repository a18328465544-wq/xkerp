import assert from "node:assert/strict";
import test from "node:test";
import {renderToStaticMarkup} from "react-dom/server";
import {ErpPageHeader, ErpPageToolbar} from "@/src/components/common";
import {FinanceDetailPageLayout} from "./FinanceDetailPageLayout";

test("finance detail layout keeps its desktop region order and collapsed analysis state", () => {
  const markup = renderToStaticMarkup(
    <FinanceDetailPageLayout
      header={<ErpPageHeader title="财务明细" />}
      filters={<ErpPageToolbar><span>filter-slot</span></ErpPageToolbar>}
      metrics={<span>metrics-slot</span>}
      table={<span>table-slot</span>}
      analysis={{title: "收支分析", preferenceKey: "test-page", children: <span>analysis-slot</span>}}
    />,
  );
  const slots = [
    'data-page-frame="finance"',
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

test("finance detail layout can place an expanded analysis region before the detail table", () => {
  const markup = renderToStaticMarkup(
    <FinanceDetailPageLayout
      header={<ErpPageHeader title="销售毛利" />}
      filters={<ErpPageToolbar><span>filter-slot</span></ErpPageToolbar>}
      metrics={<span>metrics-slot</span>}
      beforeTable={<span>analysis-slot</span>}
      table={<span>table-slot</span>}
    />,
  );
  const analysisPosition = markup.indexOf("data-finance-layout-slot=\"before-table\"");
  const tablePosition = markup.indexOf("data-finance-layout-slot=\"table\"");

  assert.ok(analysisPosition >= 0);
  assert.ok(tablePosition > analysisPosition);
  assert.ok(markup.indexOf('data-finance-layout-slot="metrics"') < analysisPosition);
});
