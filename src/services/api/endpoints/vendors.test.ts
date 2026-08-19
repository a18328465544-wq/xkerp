import assert from "node:assert/strict";
import test from "node:test";
import {vendorsApi} from "./vendors";

function response(payload: unknown, status = 200) {return new Response(JSON.stringify(payload), {status, headers: {"Content-Type": "application/json"}});}

test("vendor directory reads the existing full state through the endpoint boundary", async () => {
  const previousFetch = globalThis.fetch;
  globalThis.fetch = async (input) => {assert.equal(input, "/api/state?mode=full"); return response({data: {vendors: [{id: "GY-1", name: "同行"}], inventory: [{id: "secret"}]}});};
  try {const result = await vendorsApi.list({showProfit: false}); assert.equal(result.vendors[0]?.id, "GY-1"); assert.equal("inventory" in result, false);} finally {globalThis.fetch = previousFetch;}
});

test("vendor update uses the existing PUT endpoint", async () => {
  const previousFetch = globalThis.fetch;
  let method = "";
  globalThis.fetch = async (input, init) => {assert.equal(input, "/api/vendors/GY-1"); method = String(init?.method); return response({data: {id: "GY-1", name: "同行", type: "上游供应商", level: "C级"}});};
  try {await vendorsApi.update("GY-1", {name: "同行", contact: "138", type: "上游供应商", level: "C级", isCoreCustomer: false, riskReason: "", remarks: ""}, {showProfit: false}); assert.equal(method, "PUT");} finally {globalThis.fetch = previousFetch;}
});
