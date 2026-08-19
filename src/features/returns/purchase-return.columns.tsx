import type {ColumnDef} from "@tanstack/react-table";
import {ArrowRight, CheckCircle2, Edit3, Trash2} from "lucide-react";
import {Button} from "@/src/components/ui";
import {ErpStatusBadge} from "@/src/components/common";
import {formatCurrency} from "@/src/lib/format";
import type {PurchaseReturnListItem} from "@/src/types/returns";

function tone(status: PurchaseReturnListItem["status"]): "warning" | "success" | "neutral" { return status === "已完成" ? "success" : status === "待处理" ? "warning" : "neutral"; }

export function createPurchaseReturnColumns({onDetail, onComplete, onEdit, onDelete, canEdit, canDelete}: {onDetail: (item: PurchaseReturnListItem) => void; onComplete: (item: PurchaseReturnListItem) => void; onEdit?: (item: PurchaseReturnListItem) => void; onDelete?: (item: PurchaseReturnListItem) => void; canEdit?: boolean; canDelete?: boolean}): ColumnDef<PurchaseReturnListItem, unknown>[] {
  return [
    {accessorKey: "returnNo", header: "退货单号", size: 170, cell: ({row}) => <div><p className="font-mono text-xs font-bold text-[var(--erp-color-primary)]">{row.original.returnNo}</p><p className="mt-1 text-xs text-[var(--erp-color-text-muted)]">{row.original.date || "—"}</p></div>},
    {accessorKey: "relatedDocNo", header: "关联采购单", size: 160, cell: ({getValue}) => <span className="font-mono text-xs font-semibold">{String(getValue() || "—")}</span>},
    {accessorKey: "partyName", header: "供应商 / 来源", size: 170, cell: ({row}) => <div><p className="font-semibold">{row.original.partyName || "—"}</p><p className="mt-1 max-w-40 truncate text-xs text-[var(--erp-color-text-muted)]">{row.original.contact || "未填写联系方式"}</p></div>},
    {accessorKey: "productName", header: "退货商品", size: 230, cell: ({row}) => <div><p className="max-w-56 truncate font-semibold" title={row.original.productName}>{row.original.productName}</p><p className="mt-1 font-mono text-xs text-[var(--erp-color-text-muted)]">{row.original.sn || "未记录 SN"}</p></div>},
    {accessorKey: "amount", header: "退货金额", size: 120, cell: ({getValue}) => <span className="font-mono font-semibold">{formatCurrency(Number(getValue() || 0))}</span>},
    {accessorKey: "settlementMode", header: "结算方式", size: 130, cell: ({getValue}) => <ErpStatusBadge label={String(getValue() || "—")} tone="info" />},
    {accessorKey: "inventoryAction", header: "库存处理", size: 120, cell: ({getValue}) => String(getValue() || "—")},
    {accessorKey: "status", header: "状态", size: 100, cell: ({row}) => <ErpStatusBadge label={row.original.status} tone={tone(row.original.status)} />},
    {accessorKey: "handler", header: "经办人", size: 100, cell: ({getValue}) => String(getValue() || "—")},
    {id: "actions", header: "操作", size: 270, enableSorting: false, cell: ({row}) => <div className="flex items-center gap-1"><Button type="button" size="sm" variant="ghost" onClick={(event) => {event.stopPropagation(); onDetail(row.original);}}>详情<ArrowRight className="h-3.5 w-3.5" /></Button>{row.original.status === "待处理" && <Button type="button" size="sm" variant="ghost" onClick={(event) => {event.stopPropagation(); onComplete(row.original);}}><CheckCircle2 className="h-3.5 w-3.5" />完成</Button>}{canEdit && onEdit && <Button type="button" size="sm" variant="ghost" onClick={(event) => {event.stopPropagation(); onEdit(row.original);}}><Edit3 className="h-3.5 w-3.5" />编辑</Button>}{canDelete && onDelete && <Button type="button" size="sm" variant="ghost" className="text-[var(--erp-color-danger)] hover:text-[var(--erp-color-danger)]" onClick={(event) => {event.stopPropagation(); onDelete(row.original);}}><Trash2 className="h-3.5 w-3.5" />{row.original.status === "已完成" ? "冲销" : "删除"}</Button>}</div>},
  ];
}
