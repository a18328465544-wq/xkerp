import assert from "node:assert/strict";
import test from "node:test";
import {AreaTrendChart} from "@/src/components/ui/chart-primitives";
import DashboardTrendChart from "./DashboardTrendChart";

const rows = [
  {date: "2026-10-11", label: "10-11", revenue: 1000, profit: 100, today: false},
  {date: "2026-10-12", label: "10-12", revenue: 2000, profit: 200, today: false},
  {date: "2026-10-13", label: "10-13", revenue: 0, profit: 0, today: true},
];

test("dashboard opts into smooth curves without changing source facts", () => {
  const chart = DashboardTrendChart({data: rows});
  assert.equal(chart.type, AreaTrendChart);
  assert.equal(chart.props.curve, "monotone");
  assert.equal(chart.props.data, rows);
  assert.equal(chart.props.xKey, "label");
  assert.equal(chart.props.series.find((series: {dataKey: string}) => series.dataKey === "profit").hidden, false);
});

test("smooth dashboard preserves the profit visibility boundary", () => {
  const chart = DashboardTrendChart({data: rows, showProfit: false});
  assert.equal(chart.props.curve, "monotone");
  assert.equal(chart.props.series.find((series: {dataKey: string}) => series.dataKey === "profit").hidden, true);
});
