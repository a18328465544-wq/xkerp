import assert from "node:assert/strict";
import test from "node:test";
import type {CardInventory} from "../src/types.ts";
import {buildInventoryMarketRiskSnapshot} from "./storeInventoryMarketRisk.ts";

const inventory: Pick<CardInventory, "id" | "sn" | "productName" | "category" | "brand" | "model" | "condition" | "warehouseLocation" | "entryTime" | "status" | "costPrice" | "marketPrice">[] = [
  {id: "A", sn: "A-SN", productName: "RTX 4090", category: "显卡", brand: "NVIDIA", model: "RTX 4090", condition: "95新", warehouseLocation: "A区", entryTime: "2026-10-01", status: "已入库", costPrice: 10000, marketPrice: 8000},
  {id: "B", sn: "B-SN", productName: "RTX 4080", category: "显卡", brand: "NVIDIA", model: "RTX 4080", condition: "95新", warehouseLocation: "B区", entryTime: "2026-09-01", status: "已上架", costPrice: 5000, marketPrice: 0},
  {id: "C", sn: "C-SN", productName: "已售商品", category: "显卡", brand: "NVIDIA", model: "RTX 4070", condition: "95新", warehouseLocation: "A区", entryTime: "2026-08-01", status: "已售出", costPrice: 6000, marketPrice: 4000},
  {id: "D", sn: "D-SN", productName: "持有库存", category: "显卡", brand: "NVIDIA", model: "RTX 4060", condition: "95新", warehouseLocation: "A区", entryTime: "2026-10-02", status: "已锁定", costPrice: 7000, marketPrice: 7500},
];

test("market risk summary counts only physical on-hand stock and does not invent missing market values", () => {
  const snapshot = buildInventoryMarketRiskSnapshot([...inventory], {page: 1, pageSize: 20, today: "2026-10-14"});
  assert.deepEqual(snapshot.summary, {onHandCount: 3, marketKnownCount: 2, missingMarketCount: 1, totalMarketValue: 15500, floatingLoss: 2000, invertedCount: 1});
  assert.equal(snapshot.data[0]?.inventoryId, "A");
  assert.equal(snapshot.data.find((row) => row.inventoryId === "B")?.floatingLoss, 0);
});

test("market risk filters and pagination preserve the loss-first ranking", () => {
  const snapshot = buildInventoryMarketRiskSnapshot([...inventory], {page: 1, pageSize: 1, keyword: "A-SN", today: "2026-10-14"});
  assert.equal(snapshot.meta.total, 1);
  assert.equal(snapshot.data[0]?.inventoryId, "A");
  assert.equal(snapshot.data[0]?.inventoryDays, 13);
});
