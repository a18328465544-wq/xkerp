import assert from "node:assert/strict";
import test from "node:test";
import type {PoolClient} from "pg";
import {ConflictError, ValidationError} from "./errors.ts";
import {assertMarketQuoteCategoryAssignable, createMarketQuoteCategory, normalizeMarketQuoteCategoryName} from "./marketQuoteCategoryRepository.ts";

test("market quote category names normalize full-width text and whitespace", () => {
  assert.equal(normalizeMarketQuoteCategoryName("  ＧＰＵ   类别 "), "gpu 类别");
});

test("market quote categories are tenant-owned and disabled categories cannot be reassigned", async () => {
  const queryClient = (isActive: boolean | undefined) => ({
    async query(_sql: string, values: unknown[]) {
      assert.deepEqual(values, ["tenant-a", "MQC-gpu"]);
      return {rows: isActive === undefined ? [] : [{is_active: isActive}]};
    },
  }) as unknown as PoolClient;

  await assertMarketQuoteCategoryAssignable(queryClient(true), "tenant-a", "MQC-gpu");
  await assertMarketQuoteCategoryAssignable(queryClient(false), "tenant-a", "MQC-gpu", "MQC-gpu");
  await assert.rejects(() => assertMarketQuoteCategoryAssignable(queryClient(false), "tenant-a", "MQC-gpu"), ValidationError);
  await assert.rejects(() => assertMarketQuoteCategoryAssignable(queryClient(undefined), "tenant-a", "MQC-gpu"), ValidationError);
});

test("a concurrent duplicate category insert is reported as a conflict", async () => {
  let calls = 0;
  const client = {
    async query() {
      calls += 1;
      if (calls === 1) return {rows: [], rowCount: 0};
      throw {code: "23505", constraint: "gpu_market_quote_categories_name_uq"};
    },
  } as unknown as PoolClient;

  await assert.rejects(() => createMarketQuoteCategory(client, "tenant-a", "显卡", "测试用户"), ConflictError);
});
