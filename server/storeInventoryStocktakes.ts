import {createHash} from "node:crypto";
import type {CardInventory} from "../src/types.ts";
import type {InventoryStocktakeItem, InventoryStocktakeRecord} from "../src/types/inventory.ts";
import {inventoryStockStatusValues} from "../src/types/inventory.ts";
import {ConflictError, ValidationError} from "./errors.ts";

export const inventoryOnHandStatusValues = [...inventoryStockStatusValues, "已锁定"] as const;

type StocktakeInventoryCard = Pick<CardInventory, "id" | "sn" | "productName" | "warehouseLocation" | "status">;
type StocktakeMutableState = {inventory: StocktakeInventoryCard[]; inventoryStocktakes?: InventoryStocktakeRecord[]};

function normalizedLocation(value: string | undefined) {
  return value?.trim() || "";
}

function normalizedCode(value: string) {
  return value.trim().toLocaleUpperCase("en-US");
}

function snapshotItem(card: StocktakeInventoryCard): InventoryStocktakeItem {
  return {
    inventoryId: card.id,
    serialNumber: card.sn?.trim() || "",
    productName: card.productName?.trim() || "未命名商品",
    warehouseLocation: card.warehouseLocation?.trim() || "未分配库位",
    status: card.status,
  };
}

export function buildInventoryStocktakeSnapshot(inventory: StocktakeInventoryCard[], warehouseLocation = "") {
  const location = normalizedLocation(warehouseLocation);
  const items = inventory
    .filter((card) => inventoryOnHandStatusValues.includes(card.status as (typeof inventoryOnHandStatusValues)[number]))
    .filter((card) => !location || normalizedLocation(card.warehouseLocation) === location)
    .map(snapshotItem)
    .sort((left, right) => left.inventoryId.localeCompare(right.inventoryId));
  const snapshotToken = createHash("sha256")
    .update(JSON.stringify({warehouseLocation: location, items}))
    .digest("hex");
  return {snapshotToken, warehouseLocation: location, items};
}

export function compareInventoryStocktake(snapshot: ReturnType<typeof buildInventoryStocktakeSnapshot>, scannedCodes: string[]) {
  const aliasToIds = new Map<string, Set<string>>();
  for (const item of snapshot.items) {
    for (const alias of [item.inventoryId, item.serialNumber]) {
      const code = normalizedCode(alias);
      if (!code) continue;
      const ids = aliasToIds.get(code) || new Set<string>();
      ids.add(item.inventoryId);
      aliasToIds.set(code, ids);
    }
  }

  const seen = new Set<string>();
  const scannedInventoryIds = new Set<string>();
  const unexpectedCodes: string[] = [];
  const duplicateCodes: string[] = [];
  const ambiguousCodes: string[] = [];
  const normalizedScannedCodes: string[] = [];
  for (const rawCode of scannedCodes) {
    const original = rawCode.trim();
    const code = normalizedCode(original);
    if (!code) continue;
    if (seen.has(code)) {
      if (!duplicateCodes.includes(original)) duplicateCodes.push(original);
      continue;
    }
    seen.add(code);
    normalizedScannedCodes.push(original);
    const matches = aliasToIds.get(code);
    if (!matches?.size) {
      unexpectedCodes.push(original);
    } else if (matches.size > 1) {
      ambiguousCodes.push(original);
    } else {
      const matchedId = matches.values().next().value;
      if (matchedId) scannedInventoryIds.add(matchedId);
    }
  }

  const missingItems = snapshot.items.filter((item) => !scannedInventoryIds.has(item.inventoryId));
  return {
    scannedCodes: normalizedScannedCodes,
    scannedCount: normalizedScannedCodes.length,
    matchedCount: scannedInventoryIds.size,
    missingItems,
    unexpectedCodes,
    duplicateCodes,
    ambiguousCodes,
  };
}

export function createInventoryStocktake(input: {
  state: StocktakeMutableState;
  warehouseLocation?: string;
  snapshotToken: string;
  scannedCodes: string[];
  handler: string;
  createdAt: string;
  id: string;
  addLog: (user: string, module: string, type: string, target: string, beforeVal?: string, afterVal?: string) => unknown;
}) {
  if (!Array.isArray(input.scannedCodes) || input.scannedCodes.length === 0) throw new ValidationError("请先扫描或输入至少一个 SN / 库存编号");
  const snapshot = buildInventoryStocktakeSnapshot(input.state.inventory, input.warehouseLocation);
  if (snapshot.snapshotToken !== input.snapshotToken) {
    throw new ConflictError("盘点期间系统在库名单已变化，请刷新名单后重新盘点", {code: "INVENTORY_CHANGED_DURING_STOCKTAKE"});
  }
  const comparison = compareInventoryStocktake(snapshot, input.scannedCodes);
  const record: InventoryStocktakeRecord = {
    id: input.id,
    createdAt: input.createdAt,
    handler: input.handler,
    warehouseLocation: snapshot.warehouseLocation,
    expectedCount: snapshot.items.length,
    ...comparison,
    snapshotToken: snapshot.snapshotToken,
  };
  input.state.inventoryStocktakes = [record, ...(input.state.inventoryStocktakes || [])].slice(0, 500);
  input.addLog(input.handler, "库存管理", "完成库存盘点", record.warehouseLocation || "全部库位", undefined,
    `系统在库 ${record.expectedCount} 件，扫描 ${record.scannedCount} 个编码，匹配 ${record.matchedCount} 件，系统有货架无 ${record.missingItems.length} 件，货架有系统无 ${record.unexpectedCodes.length} 项`);
  return record;
}
