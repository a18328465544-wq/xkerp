import {createTable, getCoreRowModel, getSortedRowModel, type ColumnDef, type SortingState} from "@tanstack/react-table";
import type {InventoryModelSummary} from "@/src/types/inventory";

/** Reuse the displayed columns' accessors and sorting rules across the entire
 * model result, before pagination. Removed permission columns cannot own sort. */
export function inventoryModelSorting(columns: ColumnDef<InventoryModelSummary, unknown>[], sorting: SortingState): SortingState {
  const allowed = new Set(columns.filter(column => column.enableSorting !== false).map(column => column.id));
  const valid = sorting.filter(sort => allowed.has(sort.id));
  return valid.length ? valid : [{id: "totalCount", desc: true}];
}

export function sortInventoryModels(rows: InventoryModelSummary[], columns: ColumnDef<InventoryModelSummary, unknown>[], sorting: SortingState): InventoryModelSummary[] {
  const table = createTable({data: rows, columns, state: {sorting: inventoryModelSorting(columns, sorting)},
    onStateChange: () => undefined, renderFallbackValue: null,
    getCoreRowModel: getCoreRowModel(), getSortedRowModel: getSortedRowModel()});
  return table.getSortedRowModel().rows.map(row => row.original);
}
