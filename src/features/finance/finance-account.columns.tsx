import type {ColumnDef} from "@tanstack/react-table";
import {Eye, Scale, Trash2} from "lucide-react";
import {Button} from "@/src/components/ui";
import {ErpStatusBadge} from "@/src/components/common";
import {formatCurrency} from "@/src/lib/format";
import type {FinanceAccountItem} from "@/src/types/finance-account";

function amountClass(value: number) {
  return value < 0 ? "text-[var(--erp-color-danger)]" : "text-[var(--erp-color-text)]";
}

export function createFinanceAccountColumns({canDelete, onView, onReconcile, onDelete}: {canDelete: boolean; onView: (account: FinanceAccountItem) => void; onReconcile: (account: FinanceAccountItem) => void; onDelete: (account: FinanceAccountItem) => void}): ColumnDef<FinanceAccountItem, unknown>[] {
  return [
    {id: "name", accessorKey: "name", header: "账户", size: 220, cell: ({row}) => <div className="min-w-0"><p className="max-w-52 truncate font-semibold">{row.original.name}</p><p className="mt-0.5 max-w-52 truncate text-[11px] text-[var(--erp-color-text-muted)]">{row.original.platform || row.original.id}</p></div>},
    {id: "type", accessorKey: "type", header: "类型", size: 120, cell: ({row}) => <ErpStatusBadge label={row.original.type} tone="info" />},
    {id: "owner", accessorKey: "owner", header: "归属", size: 120},
    {id: "balance", accessorKey: "balance", header: "账面余额", size: 150, cell: ({row}) => <span className={`font-mono font-bold ${amountClass(row.original.balance)}`}>{formatCurrency(row.original.balance)}</span>},
    {id: "availableBalance", accessorKey: "availableBalance", header: "可用余额", size: 150, cell: ({row}) => <span className={`font-mono font-semibold ${amountClass(row.original.availableBalance)}`}>{formatCurrency(row.original.availableBalance)}</span>},
    {id: "frozenAmount", accessorKey: "frozenAmount", header: "冻结金额", size: 130, cell: ({row}) => <span className="font-mono">{formatCurrency(row.original.frozenAmount)}</span>},
    {id: "difference", accessorKey: "difference", header: "实盘差额", size: 150, cell: ({row}) => row.original.difference === undefined ? <span className="text-xs text-[var(--erp-color-text-muted)]">尚未核对</span> : <span className={`font-mono font-semibold ${Math.abs(row.original.difference) <= 0.009 ? "text-[var(--erp-color-success)]" : "text-[var(--erp-color-warning)]"}`}>{row.original.difference > 0 ? "+" : ""}{formatCurrency(row.original.difference)}</span>},
    {id: "enabled", accessorKey: "enabled", header: "状态", size: 100, enableSorting: false, cell: ({row}) => <ErpStatusBadge label={row.original.enabled ? "启用" : "停用"} tone={row.original.enabled ? "success" : "neutral"} />},
    {id: "lastChangeTime", accessorKey: "lastChangeTime", header: "最近变动", size: 170, cell: ({row}) => <span className="font-mono text-xs text-[var(--erp-color-text-secondary)]">{row.original.lastChangeTime || "—"}</span>},
    {id: "actions", header: "操作", size: 132, enableSorting: false, cell: ({row}) => <div className="flex items-center justify-end gap-1" onClick={(event) => event.stopPropagation()}><Button type="button" size="icon" variant="ghost" aria-label={`查看${row.original.name}`} title="查看详情" onClick={() => onView(row.original)}><Eye className="h-4 w-4" /></Button><Button type="button" size="icon" variant="ghost" aria-label={`核对${row.original.name}`} title="记录实盘余额" onClick={() => onReconcile(row.original)}><Scale className="h-4 w-4" /></Button>{canDelete && <Button type="button" size="icon" variant="ghost" aria-label={`删除${row.original.name}`} title="删除账户" onClick={() => onDelete(row.original)}><Trash2 className="h-4 w-4 text-[var(--erp-color-danger)]" /></Button>}</div>},
  ];
}
