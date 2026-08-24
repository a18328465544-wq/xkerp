import type { CardInventory } from "../types";
import { matchesKeyword } from "./search";
import { storeDate, storeDateDiffDays } from "./storeTime";

export type InventoryRiskFilter = "mined" | "upturned" | "high";

export type InventoryListFilters = {
  includeSold?: boolean;
  activeOnly?: boolean;
  category?: string;
  status?: string;
  brand?: string;
  keyword?: string;
  risk?: InventoryRiskFilter;
  minStorageDays?: number;
  maxStorageDays?: number;
  minProfitMargin?: number;
};

const inactiveStatuses = new Set(["已售出", "已退货", "已报废", "已拆卸", "已组装"]);

export function hasInventoryMarketLoss(card: Pick<CardInventory, "marketPrice" | "costPrice">) {
  const marketPrice = Number(card.marketPrice || 0);
  return marketPrice > 0 && marketPrice < Number(card.costPrice || 0);
}

export function hasInventoryProfitMargin(card: Pick<CardInventory, "costPrice" | "estSellPrice">, minimum: number) {
  const costPrice = Number(card.costPrice || 0);
  return costPrice > 0 && Number(card.estSellPrice || 0) >= costPrice * (1 + minimum);
}

export function matchesInventoryListFilters(
  card: CardInventory,
  filters: InventoryListFilters = {},
  referenceDate = storeDate(),
) {
  const selectedStatus = filters.status?.trim();
  const selectedSoldStatus = selectedStatus === "已售出";
  if (!selectedStatus && filters.activeOnly) {
    const excludedStatuses = filters.includeSold
      ? new Set([...inactiveStatuses].filter((status) => status !== "已售出"))
      : inactiveStatuses;
    if (excludedStatuses.has(card.status)) return false;
  } else if (!selectedSoldStatus && !filters.includeSold && card.status === "已售出") {
    return false;
  }
  if (filters.status && filters.status !== "all" && card.status !== filters.status) return false;
  if (filters.category && filters.category !== "all" && (card.category || "显卡") !== filters.category) return false;
  if (filters.brand && filters.brand !== "all" && card.brand !== filters.brand) return false;
  if (!matchesKeyword([
    card.id,
    card.productId,
    card.productName,
    card.model,
    card.brand,
    card.version,
    card.vram,
    card.sn,
    card.expressNo,
    card.supplierName,
    card.warehouseLocation,
    card.remarks,
  ], filters.keyword)) return false;

  const marketLoss = hasInventoryMarketLoss(card);
  if (filters.risk === "mined" && !card.gpuRisk) return false;
  if (filters.risk === "upturned" && !marketLoss) return false;
  if (filters.risk === "high" && !card.gpuRisk && !marketLoss) return false;

  const storageDays = storeDateDiffDays(card.entryTime, referenceDate);
  const minStorageDays = Number(filters.minStorageDays);
  if (Number.isFinite(minStorageDays) && minStorageDays > 0 && storageDays < minStorageDays) return false;
  const maxStorageDays = Number(filters.maxStorageDays);
  if (Number.isFinite(maxStorageDays) && maxStorageDays >= 0 && storageDays > maxStorageDays) return false;
  const minProfitMargin = Number(filters.minProfitMargin);
  if (Number.isFinite(minProfitMargin) && minProfitMargin > 0 && !hasInventoryProfitMargin(card, minProfitMargin)) return false;
  return true;
}
