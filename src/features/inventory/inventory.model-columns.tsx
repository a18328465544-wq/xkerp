import type {ColumnDef} from "@tanstack/react-table";
import {ArrowUpRight, Boxes} from "lucide-react";
import {Button} from "@/src/components/ui";
import {ErpStatusBadge} from "@/src/components/common";
import {ProfitDisplay} from "@/src/components/domain";
import {formatCurrency} from "@/src/lib/format";
import type {InventoryModelSummary} from "@/src/types/inventory";

const amount = (value: number | undefined) => value === undefined ? "—" : formatCurrency(value);

export function createInventoryModelColumns({showCost, showProfit, onOpenCards}: {showCost: boolean; showProfit: boolean; onOpenCards: (row: InventoryModelSummary) => void}): ColumnDef<InventoryModelSummary, unknown>[] {
  const columns: ColumnDef<InventoryModelSummary, unknown>[] = [
    {
      id: "product",
      header: "商品型号",
      accessorFn: (row) => row.productName,
      size: 270,
      cell: ({row}) => <div className="flex min-w-0 items-center gap-3"><span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[var(--erp-radius-md)] bg-[var(--erp-color-info-soft)] text-[var(--erp-color-primary)]"><Boxes className="h-4 w-4" /></span><div className="min-w-0"><p className="truncate font-semibold text-[var(--erp-color-text)]">{row.original.productName}</p><p className="truncate text-xs text-[var(--erp-color-text-muted)]">{[row.original.brand, row.original.model, row.original.version, row.original.vram].filter(Boolean).join(" · ") || "型号信息待补充"}</p></div></div>,
    },
    {id: "totalCount", header: "总数量", accessorKey: "totalCount", size: 100, cell: ({row}) => <span className="font-mono text-base font-semibold">{row.original.totalCount} 张</span>},
    {id: "availableCount", header: "在库", accessorKey: "availableCount", size: 88, cell: ({row}) => <span className="font-mono font-semibold text-[var(--erp-color-success)]">{row.original.availableCount}</span>},
    {id: "pendingCount", header: "待检测", accessorKey: "pendingCount", size: 92, cell: ({row}) => row.original.pendingCount > 0 ? <ErpStatusBadge label={`${row.original.pendingCount}`} tone="warning" /> : <span className="text-[var(--erp-color-text-muted)]">0</span>},
    {id: "lockedCount", header: "已锁定", accessorKey: "lockedCount", size: 92, cell: ({row}) => row.original.lockedCount > 0 ? <ErpStatusBadge label={`${row.original.lockedCount}`} tone="info" /> : <span className="text-[var(--erp-color-text-muted)]">0</span>},
    {id: "soldCount", header: "已售出", accessorKey: "soldCount", size: 88, cell: ({row}) => <span className="font-mono text-[var(--erp-color-text-secondary)]">{row.original.soldCount}</span>},
    {id: "repairCount", header: "售后 / 维修", accessorKey: "repairCount", size: 110, cell: ({row}) => row.original.repairCount > 0 ? <ErpStatusBadge label={`${row.original.repairCount}`} tone="danger" /> : <span className="text-[var(--erp-color-text-muted)]">0</span>},
    {id: "warehouseLocation", header: "仓库 / 库位", accessorKey: "warehouseLocation", size: 170, enableSorting: false, cell: ({row}) => <span className="block max-w-[170px] truncate text-[var(--erp-color-text-secondary)]" title={row.original.warehouseLocations.join("、")}>{row.original.warehouseLocation}</span>},
  ];

  if (showCost) {
    columns.push({id: "inventoryValue", header: "库存成本", accessorFn: (row) => row.totalCost, size: 150, cell: ({row}) => <div><p className="font-mono font-semibold">{amount(row.original.totalCost)}</p><p className="text-xs text-[var(--erp-color-text-muted)]">均价 {amount(row.original.avgCost)}</p></div>});
  }
  columns.push({id: "estimatedSell", header: "预计售价", accessorFn: (row) => row.totalEstSell, size: 140, cell: ({row}) => <div><p className="font-mono font-semibold">{amount(row.original.totalEstSell)}</p><p className="text-xs text-[var(--erp-color-text-muted)]">均价 {amount(row.original.avgEstSell)}</p></div>});
  if (showProfit) columns.push({id: "estimatedProfit", header: "预计利润", accessorFn: (row) => row.estimatedProfit, size: 120, cell: ({row}) => <ProfitDisplay value={row.original.estimatedProfit} />});
  columns.push(
    {id: "lastEntryTime", header: "最近入库", accessorKey: "lastEntryTime", size: 120, cell: ({row}) => <span className="text-xs text-[var(--erp-color-text-secondary)]">{row.original.lastEntryTime ? row.original.lastEntryTime.slice(0, 10) : "—"}</span>},
    {id: "actions", header: "操作", enableSorting: false, enableResizing: false, size: 112, enableHiding: false, cell: ({row}) => <Button type="button" size="sm" variant="ghost" onClick={(event) => {event.stopPropagation(); onOpenCards(row.original);}}><ArrowUpRight className="h-3.5 w-3.5" />查看单卡</Button>},
  );
  return columns;
}
