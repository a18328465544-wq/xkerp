import assert from "node:assert/strict";
import test from "node:test";
import {toSalesCustomerQueryParams, toSalesInventoryQueryParams} from "./sales";

test("sales customer query uses server paging and keyword contract", () => {
  const params = toSalesCustomerQueryParams(" 张三 ", 2, 20);
  assert.equal(params.get("keyword"), "张三");
  assert.equal(params.get("page"), "2");
  assert.equal(params.get("pageSize"), "20");
});

test("sales inventory query requests only active candidates", () => {
  const params = toSalesInventoryQueryParams("SN-1", 1, 20);
  assert.equal(params.get("activeOnly"), "true");
  assert.equal(params.get("includeSold"), "false");
  assert.equal(params.get("keyword"), "SN-1");
  assert.equal(params.get("sortKey"), "entryTime");
});

