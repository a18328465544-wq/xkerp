import assert from "node:assert/strict";
import test from "node:test";
import {productCategoryValues, cardStatusValues, isProductCategory} from "./core";
import {inventoryCategories} from "./inventory";
import {productLedgerDocumentTypes} from "./product-ledger";
import {productTemplateFieldConfig} from "@/src/components/common/productTemplateFieldConfig";

test("product categories contain physical goods rather than business operations", () => {
  assert.deepEqual(productCategoryValues, ["显卡", "CPU", "主板", "内存", "硬盘", "电源", "散热", "机箱", "整机", "显示器", "其他配件"]);
  assert.equal(inventoryCategories, productCategoryValues);
  assert.deepEqual(Object.keys(productTemplateFieldConfig), [...productCategoryValues]);
  for (const category of productCategoryValues) assert.equal(isProductCategory(category), true);
  for (const value of ["组装拆卸", "组装", "拆卸", "未知分类", null, undefined, 1]) assert.equal(isProductCategory(value), false);
});

test("assembly remains a document operation and inventory lifecycle state", () => {
  assert.equal(productLedgerDocumentTypes.includes("组装拆卸"), true);
  assert.equal(cardStatusValues.includes("已组装"), true);
  assert.equal(cardStatusValues.includes("已拆卸"), true);
});
