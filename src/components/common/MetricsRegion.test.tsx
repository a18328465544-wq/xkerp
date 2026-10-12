import assert from "node:assert/strict";
import test from "node:test";
import {renderToStaticMarkup} from "react-dom/server";
import {DashboardSection, MetricsRegion} from "./DashboardShell";
import {ErpDisclosureCard} from "./ErpDisclosureCard";
import {ErpMetricCard} from "./ErpMetricCard";
import {ErpPhoneMetricLimit} from "./ErpMetricPresentation";

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

test("financial phones show two available metrics and never collapse desktop metrics", () => {
  const cards = <><ErpMetricCard label="未知" value="—" /><ErpMetricCard label="收入" value="¥0" /><ErpMetricCard label="支出" value="¥10" /><ErpMetricCard label="净额" value="-¥10" /></>;
  const phone = renderToStaticMarkup(<ErpPhoneMetricLimit.Provider value={2}><MetricsRegion phone>{cards}</MetricsRegion></ErpPhoneMetricLimit.Provider>);
  assert.match(phone, /data-metric-count="2"/);
  assert.match(phone, /更多指标（1）/);
  assert.doesNotMatch(phone, /未知|净额/);
  const desktop = renderToStaticMarkup(<ErpPhoneMetricLimit.Provider value={2}><MetricsRegion phone={false}>{cards}</MetricsRegion></ErpPhoneMetricLimit.Provider>);
  assert.match(desktop, /data-metric-count="3"/);
  assert.match(desktop, /净额/);
  assert.doesNotMatch(desktop, /metrics-toggle/);
});

test("all unavailable metrics leave no empty region", () => {
  assert.equal(renderToStaticMarkup(<MetricsRegion><ErpMetricCard label="未提供" value="—" /></MetricsRegion>), "");
});
