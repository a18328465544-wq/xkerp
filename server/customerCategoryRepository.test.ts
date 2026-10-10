import assert from "node:assert/strict";
import test from "node:test";
import type {PoolClient} from "pg";
import {ValidationError} from "./errors.ts";
import {assertCustomerCategoryAssignable, normalizeCustomerCategoryName} from "./customerCategoryRepository.ts";

test("customer category names normalize equivalent Unicode and whitespace", () => {
  assert.equal(normalizeCustomerCategoryName("  Ａ级   客户 "), "a级 客户");
  assert.equal(normalizeCustomerCategoryName("长期客户"), normalizeCustomerCategoryName(" 长期客户 "));
});

test("category assignment is tenant-scoped and inactive categories only remain on existing records", async () => {
  const queryClient = (isActive: boolean | undefined) => ({
    async query(_sql: string, values: unknown[]) {
      assert.deepEqual(values, ["tenant-a", "CC-long-term"]);
      return {rows: isActive === undefined ? [] : [{is_active: isActive}]};
    },
  }) as unknown as PoolClient;

  await assertCustomerCategoryAssignable(queryClient(true), "tenant-a", "CC-long-term");
  await assertCustomerCategoryAssignable(queryClient(false), "tenant-a", "CC-long-term", "CC-long-term");
  await assert.rejects(() => assertCustomerCategoryAssignable(queryClient(false), "tenant-a", "CC-long-term"), ValidationError);
  await assert.rejects(() => assertCustomerCategoryAssignable(queryClient(undefined), "tenant-a", "CC-long-term"), ValidationError);
});
