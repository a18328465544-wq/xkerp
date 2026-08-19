import {apiRequest} from "../client";
import {adaptInventoryModelSummaries, adaptInventoryPage, adaptInventorySummary} from "../adapters/inventory.adapter";
import type {InventoryPageResponseDto, InventorySummaryResponseDto} from "../dto/inventory.dto";
import type {InventoryFilters, InventoryListResult, InventoryModelSummary, InventorySummary} from "@/src/types/inventory";

export interface InventoryPermissions {
  showCost: boolean;
  showProfit: boolean;
}

export function toInventoryQueryParams(filters: InventoryFilters, includePaging = true) {
  const params = new URLSearchParams();
  const set = (key: string, value: string | number | boolean | undefined) => {
    if (value === undefined || value === "" || value === false) return;
    params.set(key, String(value));
  };
  if (includePaging) {
    set("page", filters.page);
    set("pageSize", filters.pageSize);
  }
  set("keyword", filters.keyword);
  set("brand", filters.brand);
  set("warehouseLocation", filters.warehouseLocation);
  set("status", filters.status || filters.inspectionStatus);
  set("risk", filters.risk);
  set("minStorageDays", filters.minStorageDays);
  set("maxStorageDays", filters.maxStorageDays);
  set("minProfitMargin", filters.minProfitMargin);
  set("activeOnly", filters.activeOnly);
  set("includeSold", filters.includeSold);
  set("sortKey", filters.sortKey);
  set("sortDirection", filters.sortDirection);
  return params;
}

export const inventoryApi = {
  async list(filters: InventoryFilters, permissions: InventoryPermissions, signal?: AbortSignal): Promise<InventoryListResult> {
    const params = toInventoryQueryParams(filters);
    const response = await apiRequest<InventoryPageResponseDto>(`/api/inventory/items?${params.toString()}`, {signal});
    return adaptInventoryPage(response, permissions);
  },

  async summary(filters: InventoryFilters, permissions: InventoryPermissions, signal?: AbortSignal): Promise<InventorySummary> {
    const params = toInventoryQueryParams(filters, false);
    const response = await apiRequest<InventorySummaryResponseDto>(`/api/inventory/summary?${params.toString()}`, {signal});
    return adaptInventorySummary(response, permissions);
  },

  async modelSummaries(filters: InventoryFilters, permissions: InventoryPermissions, signal?: AbortSignal): Promise<InventoryModelSummary[]> {
    const params = toInventoryQueryParams(filters, false);
    const response = await apiRequest<InventorySummaryResponseDto>(`/api/inventory/summary?${params.toString()}`, {signal});
    return adaptInventoryModelSummaries(response, permissions);
  },

  async detail(id: string, permissions: InventoryPermissions, signal?: AbortSignal) {
    const filters: InventoryFilters = {
      keyword: id,
      brand: "",
      model: "",
      warehouseLocation: "",
      condition: "",
      inspectionStatus: "",
      status: "",
      entryStart: "",
      entryEnd: "",
      risk: "",
      minStorageDays: "",
      maxStorageDays: "",
      minProfitMargin: "",
      activeOnly: false,
      includeSold: true,
      page: 1,
      pageSize: 1,
      sortKey: "entryTime",
      sortDirection: "desc",
    };
    const params = toInventoryQueryParams(filters);
    const response = await apiRequest<InventoryPageResponseDto>(`/api/inventory/items?${params.toString()}`, {signal});
    const page = adaptInventoryPage(response, permissions);
    return {item: page.data.find((item) => item.id === id) || null, fallback: true};
  },
};
