import assert from "node:assert/strict";
import test from "node:test";
import type {CardInventory} from "../src/types.ts";
import type {InventoryStocktakeRecord} from "../src/types/inventory.ts";
import {buildInventoryStocktakeSnapshot, compareInventoryStocktake, createInventoryStocktake} from "./storeInventoryStocktakes.ts";

const inventory: Pick<CardInventory, "id" | "sn" | "productName" | "warehouseLocation" | "status">[] = [
  {id: "KC-1", sn: "SN-1", productName: "RTX 5090", warehouseLocation: "A区", status: "已入库"},
  {id: "KC-2", sn: "SN-2", productName: "RTX 4090", warehouseLocation: "A区", status: "已锁定"},
  {id: "KC-3", sn: "SN-3", productName: "RTX 4080", warehouseLocation: "B区", status: "已上架"},
  {id: "KC-4", sn: "SN-4", productName: "已售出", warehouseLocation: "A区", status: "已售出"},
];

test("stocktake snapshot is limited to current on-hand cards and the requested location", () => {
  const snapshot = buildInventoryStocktakeSnapshot(inventory, "A区");
  assert.deepEqual(snapshot.items.map((item) => item.inventoryId), ["KC-1", "KC-2"]);
  assert.equal(buildInventoryStocktakeSnapshot(inventory).items.some((item) => item.inventoryId === "KC-4"), false);
});

test("stocktake comparison separates missing, unexpected, duplicate and matched codes", () => {
  const snapshot = buildInventoryStocktakeSnapshot(inventory, "A区");
  const comparison = compareInventoryStocktake(snapshot, [" sn-1 ", "EXTRA", "SN-1"]);
  assert.equal(comparison.matchedCount, 1);
  assert.deepEqual(comparison.missingItems.map((item) => item.inventoryId), ["KC-2"]);
  assert.deepEqual(comparison.unexpectedCodes, ["EXTRA"]);
  assert.deepEqual(comparison.duplicateCodes, ["SN-1"]);
});

test("saving stocktake records the comparison but never mutates the inventory list", () => {
  const state: {inventory: typeof inventory; inventoryStocktakes?: InventoryStocktakeRecord[]} = {inventory: structuredClone(inventory)};
  const before = structuredClone(state.inventory);
  const snapshot = buildInventoryStocktakeSnapshot(state.inventory, "A区");
  const record = createInventoryStocktake({state, warehouseLocation: "A区", snapshotToken: snapshot.snapshotToken, scannedCodes: ["SN-1"], handler: "店长", createdAt: "2026-10-14 10:00", id: "ST-1", addLog: () => undefined});
  assert.equal(record.expectedCount, 2);
  assert.equal(record.missingItems.length, 1);
  assert.deepEqual(state.inventory, before);
  assert.equal(state.inventoryStocktakes?.[0]?.id, "ST-1");
});

test("saving refuses a stale system inventory snapshot", () => {
  const state = {inventory: structuredClone(inventory)};
  const snapshot = buildInventoryStocktakeSnapshot(state.inventory, "A区");
  state.inventory[0]!.warehouseLocation = "B区";
  assert.throws(() => createInventoryStocktake({state, warehouseLocation: "A区", snapshotToken: snapshot.snapshotToken, scannedCodes: ["SN-1"], handler: "店长", createdAt: "2026-10-14 10:00", id: "ST-1", addLog: () => undefined}), /名单已变化/);
});
