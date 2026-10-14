import assert from "node:assert/strict";
import test from "node:test";
import type {InventoryModelSummary} from "@/src/types/inventory";
import {createInventoryModelColumns} from "./inventory.model-columns";
import {inventoryModelSorting, sortInventoryModels} from "./inventory.model-sorting";

const columns = createInventoryModelColumns({showCost: true, showProfit: true, onOpenCards: () => undefined, onOpenLedger: () => undefined});
const row = (count: number): InventoryModelSummary => ({key: String(count), productName: `型号${count}`, category: "CPU", brand: "", model: "", version: "", vram: "", warehouseLocation: "A", warehouseLocations: ["A"], totalCount: count, availableCount: count, pendingCount: 0, lockedCount: 0, soldCount: 0, repairCount: 0, totalCost: 100 * count, lastEntryTime: `2026-10-${String(count).padStart(2, "0")}`});

test("ascending model quantities sort the full result before splitting pages", () => {
  const rows = Array.from({length: 30}, (_, index) => row(30 - index));
  const before = structuredClone(rows);
  const sorted = sortInventoryModels(rows, columns, [{id: "totalCount", desc: false}]);
  assert.deepEqual(sorted.slice(0, 20).map(value => value.totalCount), Array.from({length: 20}, (_, index) => index + 1));
  assert.deepEqual(sorted.slice(20).map(value => value.totalCount), Array.from({length: 10}, (_, index) => index + 21));
  assert.deepEqual(rows, before);
});
test("default and removed permission sorts fall back to actual descending quantities", () => {
  const restricted = createInventoryModelColumns({showCost: false, showProfit: false, onOpenCards: () => undefined, onOpenLedger: () => undefined});
  assert.deepEqual(inventoryModelSorting(restricted, [{id: "inventoryValue", desc: false}]), [{id: "totalCount", desc: true}]);
  assert.deepEqual(sortInventoryModels([row(0), row(10_000), row(1)], restricted, []).map(value => value.totalCount), [10_000, 1, 0]);
});
test("model amounts and dates reuse column accessors across page boundaries", () => {
  assert.deepEqual(sortInventoryModels([row(3), row(1), row(2)], columns, [{id: "inventoryValue", desc: false}]).map(value => value.totalCount), [1, 2, 3]);
  assert.deepEqual(sortInventoryModels([row(1), row(3), row(2)], columns, [{id: "lastEntryTime", desc: true}]).map(value => value.totalCount), [3, 2, 1]);
});
