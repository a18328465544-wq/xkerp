import assert from "node:assert/strict";
import test from "node:test";
import {renderToStaticMarkup} from "react-dom/server";
import {ErpMetricCard} from "./ErpMetricCard";

test("ErpMetricCard exposes the shared card anatomy and semantic value tone", () => {
  const markup = renderToStaticMarkup(<ErpMetricCard label="今日收入" value="¥68,800" detail="昨日 ¥61,200" tone="success" valueTone="success" compare={12.4} />);
  assert.match(markup, /data-erp-component="metric-card"/);
  assert.match(markup, /data-erp-region="metric-label"/);
  assert.match(markup, /data-erp-region="metric-value"/);
  assert.match(markup, /data-erp-region="metric-footer"/);
  assert.match(markup, /data-erp-region="metric-comparison"/);
  assert.match(markup, /12\.4%/);
  assert.match(markup, /text-\[var\(--erp-color-income\)\]/);
});

test("ErpMetricCard keeps an explicit empty comparison visible", () => {
  const markup = renderToStaticMarkup(<ErpMetricCard label="今日支出" value="¥0" detail="昨日 ¥0" compare={null} />);
  assert.match(markup, /暂无对比/);
});
