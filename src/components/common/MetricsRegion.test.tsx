import assert from "node:assert/strict";
import test from "node:test";
import {renderToStaticMarkup} from "react-dom/server";
import {DashboardSection, MetricsRegion} from "./DashboardShell";
import {ErpDisclosureCard} from "./ErpDisclosureCard";

test("metrics region exposes its visible count for responsive balancing", () => {
  const markup = renderToStaticMarkup(
    <MetricsRegion>
      <div>one</div>
      <div>two</div>
      <div>three</div>
    </MetricsRegion>,
  );
  assert.match(markup, /data-erp-component="metrics-region"/);
  assert.match(markup, /data-metric-count="3"/);
  assert.match(markup, /data-metric-parity="odd"/);
  assert.doesNotMatch(markup, /data-mobile-primary-full-width/);
});

test("finance metric regions can opt into a full-width primary layout", () => {
  const markup = renderToStaticMarkup(
    <MetricsRegion mobilePrimaryFullWidth>
      <div>cash</div>
      <div>income</div>
    </MetricsRegion>,
  );
  assert.match(markup, /data-metric-count="2"/);
  assert.match(markup, /data-metric-parity="even"/);
  assert.match(markup, /data-mobile-primary-full-width="true"/);
});

test("metric cards passed as one fragment still count as separate grid items", () => {
  const cards = <><div>sales</div><div>settled</div><div>records</div><div>pending</div></>;
  const markup = renderToStaticMarkup(<MetricsRegion>{cards}</MetricsRegion>);
  assert.match(markup, /data-metric-count="4"/);
  assert.equal(markup.match(/<div>/g)?.length, 4);
});

test("section counts stay inline with the title instead of wrapping as an action badge", () => {
  const markup = renderToStaticMarkup(<DashboardSection title="调拨明细" count="共 3 笔"><div>rows</div></DashboardSection>);
  assert.match(markup, /<h2[^>]*>调拨明细<span data-erp-region="section-count"[^>]*>共 3 笔<\/span><\/h2>/);
  assert.doesNotMatch(markup, /data-erp-region="section-actions"/);
});

test("disclosure cards fold content behind a section-weight summary", () => {
  const markup = renderToStaticMarkup(<ErpDisclosureCard title="更多指标"><div>metrics</div></ErpDisclosureCard>);
  assert.match(markup, /<details data-erp-component="disclosure-card"[^>]*erp-card-surface/);
  assert.match(markup, /<summary[^>]*list-none[^>]*>.*更多指标.*展开.*收起.*<\/summary>/);
  assert.match(markup, /metrics/);
});
