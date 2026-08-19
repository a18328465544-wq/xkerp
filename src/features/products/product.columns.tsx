import type {ColumnDef} from "@tanstack/react-table";
import {ImageOff, Pencil, Trash2} from "lucide-react";
import {Button} from "@/src/components/ui";
import {ErpStatusBadge} from "@/src/components/common";
import {formatCurrency} from "@/src/lib/format";
import type {ProductLibraryItem} from "@/src/types/product";

function Price({value, hidden}: {value?: number; hidden: string}) {
  return value === undefined ? <span className="text-xs text-[var(--erp-color-text-muted)]">{hidden}</span> : <span className="font-mono font-semibold">{formatCurrency(value)}</span>;
}

export function createProductColumns({showCost, showProfit, canEdit, canDelete, onEdit, onDelete}: {showCost: boolean; showProfit: boolean; canEdit: boolean; canDelete: boolean; onEdit: (product: ProductLibraryItem) => void; onDelete: (product: ProductLibraryItem) => void}): ColumnDef<ProductLibraryItem, unknown>[] {
  const columns: ColumnDef<ProductLibraryItem, unknown>[] = [
    {id: "name", accessorKey: "name", header: "商品规格", size: 360, cell: ({row}) => <div className="flex min-w-0 items-center gap-3"><div className="flex h-10 w-14 shrink-0 items-center justify-center overflow-hidden rounded-[var(--erp-radius-sm)] bg-[var(--erp-color-surface-muted)]">{row.original.imageUrls[0] ? <img src={row.original.imageUrls[0]} alt="" className="h-full w-full object-cover" /> : <ImageOff className="h-4 w-4 text-[var(--erp-color-text-muted)]" />}</div><div className="min-w-0"><div className="flex items-center gap-2"><ErpStatusBadge label={row.original.category} tone="info" /><span className="truncate font-semibold" title={row.original.name}>{row.original.name}</span></div><p className="mt-1 truncate font-mono text-[11px] text-[var(--erp-color-text-muted)]">{row.original.id} · {[row.original.brand, row.original.model, row.original.version, row.original.vram].filter(Boolean).join(" · ")}</p></div></div>},
    {id: "refBuyPrice", accessorKey: "refBuyPrice", header: "参考回收价", size: 130, cell: ({row}) => <Price value={showCost ? row.original.refBuyPrice : undefined} hidden="无成本权限" />},
    {id: "refSellPrice", accessorKey: "refSellPrice", header: "参考销售价", size: 130, cell: ({row}) => <Price value={showProfit ? row.original.refSellPrice : undefined} hidden="无利润权限" />},
    {id: "currentStock", accessorKey: "currentStock", header: "当前库存", size: 100, cell: ({row}) => <ErpStatusBadge label={`${row.original.currentStock} 件`} tone={row.original.currentStock > 0 ? "success" : "neutral"} />},
    {id: "recentPrice", header: "近期成交价", size: 150, enableSorting: false, cell: ({row}) => <div className="space-y-1 text-xs"><div>收：<Price value={showCost ? row.original.lastBuyPrice : undefined} hidden="—" /></div><div>售：<Price value={showProfit ? row.original.lastSellPrice : undefined} hidden="—" /></div></div>},
    {id: "lastDealTime", accessorKey: "lastDealTime", header: "最后交易", size: 130, cell: ({row}) => <span className="font-mono text-xs text-[var(--erp-color-text-secondary)]">{row.original.lastDealTime || "暂无"}</span>},
    {id: "remarks", accessorKey: "remarks", header: "备注", size: 200, enableSorting: false, cell: ({row}) => <span className="block max-w-48 truncate text-xs text-[var(--erp-color-text-secondary)]" title={row.original.remarks}>{row.original.remarks || "—"}</span>},
    {id: "actions", header: "操作", size: 112, enableSorting: false, cell: ({row}) => <div className="flex items-center justify-end gap-1" onClick={(event) => event.stopPropagation()}>{canEdit && <Button type="button" size="icon" variant="ghost" aria-label={`编辑${row.original.name}`} title="编辑" onClick={() => onEdit(row.original)}><Pencil className="h-4 w-4" /></Button>}{canDelete && <Button type="button" size="icon" variant="ghost" aria-label={`删除${row.original.name}`} title="删除" onClick={() => onDelete(row.original)}><Trash2 className="h-4 w-4 text-[var(--erp-color-danger)]" /></Button>}</div>},
  ];
  return columns;
}
