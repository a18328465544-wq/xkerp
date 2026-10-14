import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import test from "node:test";
import {inventoryCategoryDifferences, inventoryReadCategorySql, projectInventoryCategories, resolveInventoryCategory} from "./inventoryCategoryRead.ts";

test("an exact linked product category corrects only the read projection", () => {
  const cards = [{id: "KC-1", productId: "P-1", productName: "CPU", category: "显卡", sn: "00001", costPrice: 1200, status: "已入库"}];
  const original = structuredClone(cards);
  const rows = projectInventoryCategories(cards, [{id: "P-1", category: "CPU"}]);
  assert.equal(rows[0]?.category, "CPU");
  assert.deepEqual({...rows[0], category: "显卡"}, original[0]);
  assert.deepEqual(cards, original);
  const report = inventoryCategoryDifferences(cards, [{id: "P-1", category: "CPU"}]);
  assert.deepEqual(report[0]?.reasons, ["库存与商品分类不一致"]);
  assert.equal(report[0]?.needsManualReview, false);
});
test("missing or invalid categories are not silently classified as GPU", () => {
  for (const category of [undefined, null, "", "组装拆卸", "INVALID"]) assert.equal(resolveInventoryCategory({category}), "其他配件");
  assert.equal(resolveInventoryCategory({category: "CPU"}), "CPU");
  assert.equal(resolveInventoryCategory({category: "显卡"}, {id: "P", category: "组装拆卸"}), "显卡");
});
test("unlinked CPU names never create guessed category corrections", () => {
  const rows = [{id: "KC", productName: "Intel i5-14600KF", productId: "MISSING", category: "显卡"}];
  assert.equal(projectInventoryCategories(rows, [{id: "OTHER", category: "CPU"}])[0]?.category, "显卡");
  const report = inventoryCategoryDifferences(rows, []);
  assert.equal(report[0]?.needsManualReview, true);
  assert.deepEqual(report[0]?.reasons, ["缺少关联商品档案"]);
});
test("SQL category reads bind only the same tenant/store and the audit cannot initialize or write business data", () => {
  assert.match(inventoryReadCategorySql, /p\.id = gpu_inventory\.op_product_id/);
  assert.match(inventoryReadCategorySql, /p\.tenant_id = gpu_inventory\.tenant_id/);
  assert.match(inventoryReadCategorySql, /p\.store_id = gpu_inventory\.store_id/);
  const cli = readFileSync(new URL("./inventoryCategoryAuditCli.ts", import.meta.url), "utf8");
  assert.match(cli, /BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY/);
  assert.match(cli, /default_transaction_read_only=on/);
  assert.doesNotMatch(cli, /import.*from ["']\.\/db\.ts|import.*from ["']\.\/store\.ts|\bUPDATE\b|\bDELETE\b|\bINSERT\b|costPrice|data->>'sn'/);
});
