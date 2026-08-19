import type {ColumnDef} from "@tanstack/react-table";
import {Eye, ImageOff} from "lucide-react";
import {InventoryStatus, ProfitDisplay} from "@/src/components/domain";
import {formatCurrency} from "@/src/lib/format";
import type {InventoryListItem} from "@/src/types/inventory";

const amount = (value: number | undefined) => value === undefined ? "—" : formatCurrency(value);

export function createInventoryColumns({showCost, showProfit, onDetail}: {showCost: boolean; showProfit: boolean; onDetail: (item: InventoryListItem) => void}): ColumnDef<InventoryListItem, unknown>[] {
  const columns: ColumnDef<InventoryListItem, unknown>[] = [
    {id: "select", header: "", enableSorting: false, enableResizing: false, size: 44, enableHiding: false, cell: ({row}) => <input type="checkbox" aria-label={`选择 ${row.original.serialNumber}`} checked={row.getIsSelected()} disabled={!row.getCanSelect()} onChange={row.getToggleSelectedHandler()} className="h-4 w-4 rounded border-[var(--erp-color-border-strong)] text-[var(--erp-color-primary)]" />},
    {id: "product", header: "商品", accessorFn: (row) => row.productName, size: 240, cell: ({row}) => <div className="flex min-w-0 items-center gap-3"><div className="flex h-9 w-12 shrink-0 items-center justify-center overflow-hidden rounded-md bg-[var(--erp-color-surface-muted)]">{row.original.imageUrl ? <img src={row.original.imageUrl} alt="" className="h-full w-full object-contain" /> : <ImageOff className="h-4 w-4 text-[var(--erp-color-text-muted)]" />}</div><div className="min-w-0"><p className="truncate font-semibold text-[var(--erp-color-text)]">{row.original.productName}</p><p className="truncate font-mono text-xs text-[var(--erp-color-primary)]">{row.original.serialNumber}</p></div></div>},
    {accessorKey: "brand", header: "品牌", size: 100, enableSorting: false},
    {accessorKey: "model", header: "型号", size: 160, enableSorting: false, cell: ({row}) => <div><p className="font-semibold">{row.original.model}</p>{row.original.vram && <p className="text-xs text-[var(--erp-color-text-muted)]">{row.original.vram}</p>}</div>},
    {accessorKey: "condition", header: "成色", size: 86, enableSorting: false},
    {accessorKey: "warehouse", header: "仓库 / 库位", size: 140, enableSorting: true, id: "warehouseLocation", cell: ({row}) => <span className="text-[var(--erp-color-text-secondary)]">{row.original.warehouse}</span>},
    {accessorKey: "inspectionStatus", header: "检测状态", size: 100, enableSorting: false, cell: ({row}) => <InventoryStatus status={row.original.inventoryStatus} />},
    {accessorKey: "inventoryStatus", header: "库存状态", size: 100, id: "status", cell: ({row}) => <InventoryStatus status={row.original.inventoryStatus} />},
  ];
  if (showCost) columns.push({id: "costPrice", header: "成本价", accessorFn: (row) => row.costPrice, size: 110, cell: ({row}) => <span className="font-mono">{amount(row.original.costPrice)}</span>});
  columns.push({id: "estimatedSellPrice", header: "当前售价", accessorFn: (row) => row.estimatedSellPrice, size: 110, enableSorting: false, cell: ({row}) => <span className="font-mono">{amount(row.original.estimatedSellPrice)}</span>});
  if (showProfit) columns.push({id: "estimatedProfit", header: "预计利润", accessorFn: (row) => row.estimatedProfit, size: 110, enableSorting: true, cell: ({row}) => <ProfitDisplay value={row.original.estimatedProfit} />});
  columns.push(
    {accessorKey: "entryTime", header: "入库时间", size: 120, cell: ({row}) => <span className="text-xs text-[var(--erp-color-text-secondary)]">{row.original.entryTime ? row.original.entryTime.slice(0, 10) : "—"}</span>},
    {accessorKey: "inventoryDays", header: "库龄", size: 80, cell: ({row}) => <span className={row.original.inventoryDays >= 30 ? "font-mono font-semibold text-[var(--erp-color-danger)]" : "font-mono"}>{row.original.inventoryDays} 天</span>},
    {id: "actions", header: "操作", enableSorting: false, enableResizing: false, size: 72, enableHiding: false, cell: ({row}) => <button type="button" className="erp-focus-ring inline-flex items-center gap-1 rounded px-2 py-1 text-xs font-semibold text-[var(--erp-color-primary)] hover:bg-[var(--erp-color-info-soft)]" onClick={(event) => {event.stopPropagation(); onDetail(row.original);}}><Eye className="h-3.5 w-3.5" />详情</button>},
  );
  return columns;
}
