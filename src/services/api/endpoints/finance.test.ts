import assert from "node:assert/strict";
import test from "node:test";
import {financeApi} from "./finance";

test("finance dashboard reads its feature-scoped snapshot", async () => {
  const previous = globalThis.fetch;
  globalThis.fetch = async (input) => {assert.equal(input, "/api/finance/dashboard"); return new Response(JSON.stringify({data: {settlementAccounts: []}}), {status: 200, headers: {"Content-Type": "application/json"}});};
  try {
    const result = await financeApi.dashboard({showCost: false, showProfit: true, canViewAccounts: false, canViewSettlementLedger: false, canViewReturns: false});
    assert.equal(result.source, "state-snapshot");
  } finally {globalThis.fetch = previous;}
});
