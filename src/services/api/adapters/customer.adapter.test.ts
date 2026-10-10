import assert from "node:assert/strict";
import test from "node:test";
import {adaptCustomerDirectory, toCustomerCreateRequest, toCustomerUpdateRequest} from "./customer.adapter";

const values = {name: " 张三 ", contact: " 13800000000 ", type: "个人买家客户", source: "闲鱼", categoryId: "CC-long-term", level: "C级" as const, isCoreCustomer: false, riskReason: "", remarks: " 常客 "};

test("customer directory adapter exposes only the domain projection and masks profit", () => {
  const result = adaptCustomerDirectory({data: {customers: [{id: "KH-1", name: "张三", phone: "138", firstChannel: "微信", type: "个人买家客户", level: "A级", totalAmount: 3000, totalProfit: 600, receivableBalance: 100, payableBalance: 20, tags: ["老客户"]}], salesInvoices: [{customerName: "不得透传"}]}}, {showProfit: false});
  assert.equal(result.customers.length, 1);
  assert.equal(result.customers[0]?.contact, "138");
  assert.equal(result.customers[0]?.totalProfit, undefined);
  assert.deepEqual(result.channels, ["微信"]);
  assert.equal("salesInvoices" in result, false);
});

test("core customer is always projected and submitted as S level", () => {
  const result = adaptCustomerDirectory({data: {customers: [{id: "KH-2", name: "核心", isCoreCustomer: true, level: "C级"}]}}, {showProfit: true});
  assert.equal(result.customers[0]?.level, "S级");
  assert.equal(toCustomerCreateRequest({...values, isCoreCustomer: true}).level, "S级");
});

test("legacy S level is projected as a core customer even without the boolean flag", () => {
  const result = adaptCustomerDirectory({data: {customers: [{id: "KH-3", name: "旧核心", level: "S级"}]}}, {showProfit: true});
  assert.equal(result.customers[0]?.level, "S级");
  assert.equal(result.customers[0]?.isCoreCustomer, true);
});

test("create and update adapters preserve customer semantics without leaking create-only tags", () => {
  const create = toCustomerCreateRequest(values);
  const update = toCustomerUpdateRequest(values);
  assert.equal(create.name, "张三");
  assert.equal(create.contact, "13800000000");
  assert.equal(create.phone, undefined);
  assert.deepEqual(create.tags, ["个人客户"]);
  assert.equal(update.tags, undefined);
  assert.equal(update.phone, "13800000000");
  assert.equal(create.categoryId, "CC-long-term");
  assert.equal(update.categoryId, "CC-long-term");
  assert.equal(update.level, "C级");
});

test("customer directory adapter reads independent customer categories", () => {
  const result = adaptCustomerDirectory({data: {items: [{id: "KH-4", name: "张三", categoryId: "CC-long-term", categoryName: "长期客户", categoryActive: true, level: "A级"}]}, meta: {categories: [{id: "CC-long-term", name: "长期客户", isActive: true, sortOrder: 10}]}}, {showProfit: false});
  assert.equal(result.customers[0]?.categoryName, "长期客户");
  assert.equal(result.customers[0]?.level, "A级");
  assert.equal(result.categories[0]?.isActive, true);
});
