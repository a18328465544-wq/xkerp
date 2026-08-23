import assert from "node:assert/strict";
import test from "node:test";
import {financeTransfersApi} from "./finance-transfers";

test("finance transfers endpoint follows the existing state and mutation paths", async () => {
  const previous = globalThis.fetch;
  const calls: Array<{url: string; method: string; body?: string}> = [];
  globalThis.fetch = async (input, init) => {
    calls.push({url: String(input), method: init?.method || "GET", ...(typeof init?.body === "string" ? {body: init.body} : {})});
    if (String(input).includes("/api/gpu_erp/finance/account-transfers")) return new Response(JSON.stringify({data: {accountTransfers: []}}), {status: 200, headers: {"Content-Type": "application/json"}});
    return new Response(JSON.stringify({data: {id: "DB-1", fromAccountId: "A", fromAccountName: "现金", toAccountId: "B", toAccountName: "微信", amount: 100, fee: 1, receivedAmount: 99, handler: "郭鑫", time: "2026-08-11 12:00:00"}}), {status: 200, headers: {"Content-Type": "application/json"}});
  };
  try {
    await financeTransfersApi.listAll();
    await financeTransfersApi.create({fromAccountId: "A", toAccountId: "B", amount: 100, fee: 1, date: "2026-08-11", remarks: ""}, "郭鑫");
    await financeTransfersApi.update("DB/1", {fromAccountId: "A", toAccountId: "B", amount: 100, fee: 1, date: "2026-08-11", remarks: ""}, "郭鑫");
    await financeTransfersApi.remove("DB/1");
    assert.equal(calls[0]?.url, "/api/gpu_erp/finance/account-transfers");
    assert.deepEqual(calls.slice(1).map(({url, method}) => ({url, method})), [
      {url: "/api/gpu_erp/finance/account-transfer/create", method: "POST"},
      {url: "/api/gpu_erp/finance/account-transfer/DB%2F1", method: "PUT"},
      {url: "/api/gpu_erp/finance/account-transfer/DB%2F1", method: "DELETE"},
    ]);
    assert.equal(JSON.parse(calls[1]?.body || "{}").receivedAmount, 99);
  } finally {globalThis.fetch = previous;}
});
