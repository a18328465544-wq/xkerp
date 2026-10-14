import assert from "node:assert/strict";
import test from "node:test";
import {defaultInventoryFilters} from "./inventory.filters";
import {applyInventorySheetFilters, applyInventorySheetView, inventoryFilterSourceOptions, inventoryFilterSourceQuery, inventorySheetSelectOptions, resetInventorySheetFilters} from "./inventory.filter-sheet";
import type {InventoryListItem} from "@/src/types/inventory";

test("reset clears visible and deep-linked filters without losing search, sort or page size", () => {
  const current = {...defaultInventoryFilters, keyword: "4090", brand: "技嘉", status: "已售出", inspectionStatus: "待检测", model: "RTX4090", minStorageDays: "30", includeSold: true, page: 4, pageSize: 50, sortKey: "profit" as const, sortDirection: "asc" as const};
  const reset = resetInventorySheetFilters(current);
  assert.deepEqual(reset, {...defaultInventoryFilters, keyword: "4090", pageSize: 50, sortKey: "profit", sortDirection: "asc"});
  assert.equal(current.brand, "技嘉");
});

test("applying a draft preserves the latest search and preferences, canonicalizes status and resets pagination", () => {
  const draft = {...defaultInventoryFilters, keyword: "旧搜索", brand: "微星", inspectionStatus: "已售出", page: 3};
  const current = {...defaultInventoryFilters, keyword: "5090", pageSize: 100, sortKey: "cost" as const, sortDirection: "asc" as const};
  const result = applyInventorySheetFilters(draft, current);
  assert.equal(result.keyword, "5090");
  assert.equal(result.brand, "微星");
  assert.equal(result.page, 1);
  assert.equal(result.pageSize, 100);
  assert.equal(result.sortKey, "cost");
  assert.equal(result.status, "已售出");
  assert.equal(result.inspectionStatus, "");
  assert.equal(result.includeSold, true);
  assert.equal(draft.inspectionStatus, "已售出");
});

test("choosing the mobile market-risk view commits draft filters and view together", () => {
  const draft = {...defaultInventoryFilters, category: "显卡" as const, brand: "技嘉", risk: "upturned" as const, page: 3};
  const current = {...defaultInventoryFilters, keyword: "5090", pageSize: 50, sortKey: "cost" as const, sortDirection: "asc" as const};
  const selected = applyInventorySheetView(draft, current, "market-risk");
  assert.equal(selected.view, "market-risk");
  assert.equal(selected.filters.keyword, "5090");
  assert.equal(selected.filters.category, "显卡");
  assert.equal(selected.filters.brand, "技嘉");
  assert.equal(selected.filters.risk, "upturned");
  assert.equal(selected.filters.page, 1);
  assert.equal(selected.filters.pageSize, 50);
  assert.equal(selected.filters.sortKey, "cost");
  assert.equal(selected.filters.sortDirection, "asc");

  const returned = applyInventorySheetView(selected.filters, selected.filters, "cards");
  assert.equal(returned.view, "cards");
  assert.equal(returned.filters.brand, "技嘉");
  assert.equal(returned.filters.risk, "upturned");
});

test("mobile option copy reuses canonical choices and values", () => {
  const options = [{value: "", label: "当前库存"}, {value: "已入库", label: "已入库"}];
  const fields = [{kind: "select" as const, key: "status", label: "状态", value: "", defaultValue: "", options, onChange: () => undefined}];
  assert.deepEqual(inventorySheetSelectOptions(fields, "status", "全部状态"), [{value: "", label: "全部状态"}, options[1]]);
  assert.equal(options[0]!.label, "当前库存");
  assert.deepEqual(inventorySheetSelectOptions(fields, "unknown", "全部"), []);
});

test("source searches use the original dedicated filter rather than the product keyword", () => {
  for (const source of ["brand", "supplierName", "warehouseLocation"] as const) {
    const query = inventoryFilterSourceQuery(source, "  测试  ");
    assert.equal(query[source], "测试");
    assert.equal(query.keyword, "");
    assert.equal(query.page, 1);
    assert.equal(query.pageSize, 50);
    assert.equal(query.includeSold, true);
  }
});

test("source suggestions preserve restored selections and deduplicate actual inventory values", () => {
  const rows = [{brand: " 技嘉 ", supplierName: "供应商甲", warehouse: "A区"}, {brand: "技嘉", supplierName: "供应商乙", warehouse: "B区"}] as InventoryListItem[];
  assert.deepEqual(inventoryFilterSourceOptions(rows, "brand", "微星", ""), ["技嘉", "微星"].sort((a, b) => a.localeCompare(b, "zh-CN")));
  assert.deepEqual(inventoryFilterSourceOptions(rows, "brand", "微星", "技嘉"), ["技嘉"]);
  assert.deepEqual(inventoryFilterSourceOptions(rows, "warehouseLocation", "", "A"), ["A区"]);
  assert.deepEqual(inventoryFilterSourceOptions(rows, "supplierName", "", "乙"), ["供应商乙"]);
});
