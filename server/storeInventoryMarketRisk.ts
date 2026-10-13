import type {CardInventory} from "../src/types.ts";
import type {InventoryMarketRiskRow, InventoryMarketRiskSnapshot} from "../src/types/inventory.ts";
import {storeDateDiffDays} from "../src/utils/storeTime.ts";
import {inventoryOnHandStatusValues} from "./storeInventoryStocktakes.ts";

type InventoryMarketRiskCard = Pick<CardInventory,
  "id" | "sn" | "productName" | "category" | "brand" | "model" | "condition" | "warehouseLocation" | "entryTime" | "status" | "costPrice" | "marketPrice"
>;

export function buildInventoryMarketRiskSnapshot(
  inventory: InventoryMarketRiskCard[],
  options: {page: number; pageSize: number; keyword?: string; warehouseLocation?: string; category?: string; brand?: string; model?: string; condition?: string; status?: string; entryStart?: string; entryEnd?: string; today?: string},
): InventoryMarketRiskSnapshot {
  const keyword = options.keyword?.trim().toLocaleLowerCase("zh-CN") || "";
  const warehouseLocation = options.warehouseLocation?.trim() || "";
  const rows: InventoryMarketRiskRow[] = inventory
    .filter((card) => inventoryOnHandStatusValues.includes(card.status as (typeof inventoryOnHandStatusValues)[number]))
    .filter((card) => !warehouseLocation || (card.warehouseLocation?.trim() || "未分配库位") === warehouseLocation)
    .filter((card) => !keyword || [card.productName, card.sn, card.id, card.warehouseLocation].some((value) => value?.toLocaleLowerCase("zh-CN").includes(keyword)))
    .filter((card) => !options.category || card.category === options.category)
    .filter((card) => !options.brand || card.brand?.toLocaleLowerCase("zh-CN").includes(options.brand.toLocaleLowerCase("zh-CN")))
    .filter((card) => !options.model || card.model?.toLocaleLowerCase("zh-CN").includes(options.model.toLocaleLowerCase("zh-CN")))
    .filter((card) => !options.condition || card.condition === options.condition)
    .filter((card) => !options.status || card.status === options.status)
    .filter((card) => !options.entryStart || (card.entryTime || "") >= options.entryStart)
    .filter((card) => !options.entryEnd || (card.entryTime || "") < `${options.entryEnd}T23:59:59`)
    .map((card) => {
      const costPrice = Math.max(0, Number(card.costPrice) || 0);
      const marketPrice = Math.max(0, Number(card.marketPrice) || 0);
      const marketKnown = marketPrice > 0;
      const row: InventoryMarketRiskRow = {
        inventoryId: card.id,
        productName: card.productName?.trim() || "未命名商品",
        serialNumber: card.sn?.trim() || "未录入 SN",
        warehouseLocation: card.warehouseLocation?.trim() || "未分配库位",
        inventoryDays: storeDateDiffDays(card.entryTime, options.today),
        entryTime: card.entryTime || "",
        costPrice,
        marketPrice,
        floatingLoss: marketKnown ? Math.max(0, costPrice - marketPrice) : 0,
        marketKnown,
      };
      return row;
    })
    .sort((left, right) => right.floatingLoss - left.floatingLoss || right.inventoryDays - left.inventoryDays || left.productName.localeCompare(right.productName, "zh-Hans-CN"));

  const summary = rows.reduce<InventoryMarketRiskSnapshot["summary"]>((result, row) => ({
    onHandCount: result.onHandCount + 1,
    marketKnownCount: result.marketKnownCount + Number(row.marketKnown),
    missingMarketCount: result.missingMarketCount + Number(!row.marketKnown),
    totalMarketValue: result.totalMarketValue + (row.marketKnown ? row.marketPrice : 0),
    floatingLoss: result.floatingLoss + row.floatingLoss,
    invertedCount: result.invertedCount + Number(row.floatingLoss > 0),
  }), {onHandCount: 0, marketKnownCount: 0, missingMarketCount: 0, totalMarketValue: 0, floatingLoss: 0, invertedCount: 0});

  const page = Math.max(1, Math.floor(options.page));
  const pageSize = Math.max(1, Math.floor(options.pageSize));
  const start = (page - 1) * pageSize;
  return {data: rows.slice(start, start + pageSize), meta: {page, pageSize, total: rows.length}, summary};
}
