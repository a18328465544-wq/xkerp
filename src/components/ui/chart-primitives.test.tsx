import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import test from "node:test";
import {AreaTrendChart, hasEnoughTrendData, resolveTrendChartCurve, shouldShowTrendChartDots, TrendLineChart} from "./chart-primitives";
import {renderToStaticMarkup} from "react-dom/server";

test("all shared trend charts default to smooth curves and retain explicit overrides", () => {
  assert.equal(resolveTrendChartCurve(), "monotone");
  assert.equal(resolveTrendChartCurve("monotone"), "monotone");
  assert.equal(resolveTrendChartCurve("linear"), "linear");
});

test("finance trend charts expose markers for sparse ranges only", () => {
  assert.equal(shouldShowTrendChartDots(0), true);
  assert.equal(shouldShowTrendChartDots(1), true);
  assert.equal(shouldShowTrendChartDots(14), true);
  assert.equal(shouldShowTrendChartDots(15), false);
});

test("both trend primitives pass the selected curve and sparse marker policy to Recharts", () => {
  const source = readFileSync(new URL("./chart-primitives.tsx", import.meta.url), "utf8");
  const trendCharts = source.slice(0, source.indexOf("/** Axis-free KPI trend."));
  assert.equal((trendCharts.match(/type=\{curveType\}/g) || []).length, 3);
  assert.equal((trendCharts.match(/dot=\{showDots \?/g) || []).length, 3);
  assert.doesNotMatch(trendCharts, /type="monotone"/);
  const sparkline = source.slice(source.indexOf("/** Axis-free KPI trend."), source.indexOf("export interface HorizontalBarDatum"));
  assert.match(sparkline, /type=\{resolveTrendChartCurve\(\)\}/);
});

test("trend charts need two distinct dates with finite visible data and preserve zero", () => {
  const series = [{dataKey: "amount"}];
  assert.equal(hasEnoughTrendData([], "date", series), false);
  assert.equal(hasEnoughTrendData([{date: "a", amount: 1}, {date: "a", amount: 2}], "date", series), false);
  assert.equal(hasEnoughTrendData([{date: "a", amount: null}, {date: "b", amount: NaN}], "date", series), false);
  assert.equal(hasEnoughTrendData([{date: "a", amount: 0}, {date: "b", amount: 0}], "date", series), true);
  assert.equal(hasEnoughTrendData([{date: "a", amount: 1}, {date: "b", amount: 2}], "date", [{dataKey: "amount", hidden: true}]), false);
  for (const Component of [TrendLineChart, AreaTrendChart]) {
    const markup = renderToStaticMarkup(<Component data={[{date: "a", amount: 1}]} xKey="date" series={series} ariaLabel="趋势" />);
    assert.match(markup, /数据不足/);
    assert.doesNotMatch(markup, /recharts/);
  }
});
