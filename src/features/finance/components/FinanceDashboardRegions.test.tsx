import assert from "node:assert/strict";
import test from "node:test";
import type {FinanceDashboardView} from "@/src/types/finance";
import {financeHealthQuickStatus} from "./FinanceDashboardRegions";

const view: FinanceDashboardView = {
  today: "2026-10-09",
  availableCash: 1200,
  bookBalance: 1500,
  todayIncome: 200,
  todayExpense: 100,
  yesterdayIncome: 100,
  yesterdayExpense: 80,
  receivable: 0,
  payable: 0,
  unreviewed: 2,
  accountDifferences: 1,
  accountDifferenceAmount: -35,
  trend: [],
  currentPeriod: {income: 200, expense: 100, net: 100},
  previousPeriod: {income: 100, expense: 80, net: 20},
  healthScore: 82,
  healthRisk: "attention",
  exceptions: [],
  recentEvents: [],
};

test("desktop finance health status summarizes its score and underlying checks", () => {
  const status = financeHealthQuickStatus(view);
  assert.equal(status.label, "资金健康度");
  assert.equal(status.value, "需关注 · 82 分");
  assert.equal(status.tone, "warning");
  assert.match(status.tooltip || "", /现金储备：正常/);
  assert.match(status.tooltip || "", /流水复核：2 笔待复核/);
  assert.match(status.tooltip || "", /账户核对：1 个账户有差额/);
});

test("desktop finance health status never invents a score when permissions are missing", () => {
  const status = financeHealthQuickStatus({...view, availableCash: undefined, healthScore: undefined, healthRisk: undefined});
  assert.equal(status.value, "无法计算");
  assert.match(status.tooltip || "", /现金储备：权限受限/);
});
