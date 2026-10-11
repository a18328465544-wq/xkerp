import {defaultInventoryFilters} from "./inventory.filters";
import type {InventoryFilters, InventoryListItem} from "@/src/types/inventory";
import type {ErpFilterField} from "@/src/components/common/filters/ErpFilterFields";

export type InventoryFilterSource = "brand" | "supplierName" | "warehouseLocation";

export function resetInventorySheetFilters(current: InventoryFilters): InventoryFilters {
  return {...defaultInventoryFilters, keyword: current.keyword, sortKey: current.sortKey, sortDirection: current.sortDirection, pageSize: current.pageSize};
}

export function applyInventorySheetFilters(draft: InventoryFilters, current: InventoryFilters): InventoryFilters {
  const status = draft.status || draft.inspectionStatus;
  return {...draft, keyword: current.keyword, sortKey: current.sortKey, sortDirection: current.sortDirection, pageSize: current.pageSize, status, inspectionStatus: "", includeSold: draft.includeSold || status === "已售出", page: 1};
}

/** Reuse the current page's canonical options; only the phone's empty-value copy differs. */
export function inventorySheetSelectOptions(fields: readonly ErpFilterField[], key: string, allLabel: string) {
  const field = fields.find((item) => item.key === key);
  return field?.kind === "select" ? field.options.map((option) => option.value === "" ? {...option, label: allLabel} : option) : [];
}

export function inventoryFilterSourceQuery(source: InventoryFilterSource, search: string): InventoryFilters {
  return {...defaultInventoryFilters, [source]: search.trim(), includeSold: true, pageSize: 50};
}

export function inventoryFilterSourceOptions(rows: readonly InventoryListItem[], source: InventoryFilterSource, selected: string, search: string) {
  const term = search.trim().toLocaleLowerCase();
  const values = rows.map((row) => source === "warehouseLocation" ? row.warehouse : row[source]);
  return [...new Set([selected, ...values].map((value) => value.trim()).filter((value) => value && (!term || value.toLocaleLowerCase().includes(term))))].sort((a, b) => a.localeCompare(b, "zh-CN"));
}
