import assert from "node:assert/strict";
import test from "node:test";
import { buildSalesCustomerPageQuery } from "./salesCustomerRepository.ts";

test("sales customer search reads the canonical customer archive with tenant scope", () => {
  const query = buildSalesCustomerPageQuery({ tenantId: "tenant-a", keyword: " 张三 ", page: 2, pageSize: 20 });
  assert.equal(query.page, 2);
  assert.equal(query.pageSize, 20);
  assert.equal(query.offset, 20);
  assert.deepEqual(query.values, ["tenant-a", "%张三%"]);
  assert.match(query.where, /tenant_id = \$1/);
  assert.match(query.where, /data->>'name'/);
  assert.match(query.vendorWhere, /tenant_id = \$1/);
  assert.match(query.vendorWhere, /data->>'contactPerson'/);
});

test("sales partner search scopes suppliers to the active store and searches supplier identity fields", () => {
  const query = buildSalesCustomerPageQuery({tenantId: "tenant-a", storeId: "store-a", keyword: "李师傅", page: 2, pageSize: 20});
  assert.deepEqual(query.values, ["tenant-a", "store-a", "%李师傅%"]);
  assert.match(query.customerWhere, /tenant_id = \$1/);
  assert.doesNotMatch(query.customerWhere, /store_id/);
  assert.match(query.vendorWhere, /tenant_id = \$1/);
  assert.match(query.vendorWhere, /store_id = \$2/);
  assert.match(query.vendorWhere, /data->>'contactPerson'/);
  assert.match(query.vendorWhere, /data->>'type'/);
  assert.match(query.vendorWhere, /ILIKE \$3/);
});

test("sales customer search caps a picker request to 200 records", () => {
  const query = buildSalesCustomerPageQuery({ tenantId: "tenant-a", pageSize: 9999 });
  assert.equal(query.pageSize, 200);
});
