import assert from "node:assert/strict";
import test from "node:test";
import {salesApi, toSalesCustomerQueryParams, toSalesInventoryQueryParams} from "./sales";

test("sales customer query uses server paging and keyword contract", () => {
  const params = toSalesCustomerQueryParams(" 张三 ", 2, 20);
  assert.equal(params.get("role"), "customer");
  assert.equal(params.get("keyword"), "张三");
  assert.equal(params.get("page"), "2");
  assert.equal(params.get("pageSize"), "20");
});

test("sales customer picker requests the bounded full first page", () => {
  const params = toSalesCustomerQueryParams("", 1, 200);
  assert.equal(params.get("role"), "customer");
  assert.equal(params.get("pageSize"), "200");
});

test("sales inventory query requests only active candidates", () => {
  const params = toSalesInventoryQueryParams("SN-1", 1, 20);
  assert.equal(params.get("activeOnly"), "true");
  assert.equal(params.get("includeSold"), "false");
  assert.equal(params.get("keyword"), "SN-1");
  assert.equal(params.get("sortKey"), "entryTime");
});

test("sales delete endpoint encodes the invoice id and adapts the deleted document", async () => {
  const previousFetch = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    assert.equal(input, "/api/sales-invoices/XS%2F1");
    assert.equal(init?.method, "DELETE");
    return new Response(JSON.stringify({data: {id: "XS/1", invoiceNo: "XS-1", totalCount: 1, totalAmount: 100, paidAmount: 0, unpaidAmount: 100, paymentStatus: "未收款", outboundStatus: "待出库"}}), {status: 200, headers: {"Content-Type": "application/json"}});
  };
  try {
    const result = await salesApi.remove("XS/1");
    assert.equal(result.invoiceNo, "XS-1");
  } finally {
    globalThis.fetch = previousFetch;
  }
});
