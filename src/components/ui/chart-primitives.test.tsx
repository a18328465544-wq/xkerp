import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import test from "node:test";
import {resolveTrendChartCurve, shouldShowTrendChartDots} from "./chart-primitives";

test("finance trend charts default to straight segments and retain explicit smoothing", () => {
  assert.equal(resolveTrendChartCurve(), "linear");
  assert.equal(resolveTrendChartCurve("monotone"), "monotone");
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
});
