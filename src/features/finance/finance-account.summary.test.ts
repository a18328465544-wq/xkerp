import assert from "node:assert/strict";
import test from "node:test";
import type {FinanceAccountItem} from "@/src/types/finance-account";
import {countFinanceAccountStatuses, financeAccountStatusKey} from "./finance-account.summary";

const account = (id: string, overrides: Partial<FinanceAccountItem> = {}): FinanceAccountItem => ({
  id,
  name: id,
  type: "现金",
  owner: "门店",
  platform: "现金",
  balance: 0,
  availableBalance: 0,
  frozenAmount: 0,
  enabled: true,
  allowNegative: true,
  actualBalance: 0,
  ...overrides,
});

test("finance account status filters count each account exactly once", () => {
  const accounts = [
    account("normal"),
    account("pending", {actualBalance: undefined}),
    account("abnormal", {difference: -5, frozenAmount: 10}),
    account("frozen", {frozenAmount: 2}),
    account("disabled", {enabled: false, actualBalance: undefined}),
  ];

  assert.deepEqual(countFinanceAccountStatuses(accounts), {
    normal: 1,
    pending: 1,
    abnormal: 1,
    frozen: 1,
    disabled: 1,
  });
  assert.equal(financeAccountStatusKey(accounts[2]!), "abnormal");
  assert.equal(Object.values(countFinanceAccountStatuses(accounts)).reduce((sum, value) => sum + value, 0), accounts.length);
});
