import type {ColumnDef} from "@tanstack/react-table";
import {Eye, ImageIcon} from "lucide-react";
import {Button} from "@/src/components/ui";
import {ErpStatusBadge} from "@/src/components/common";
import {formatCurrency} from "@/src/lib/format";
import type {PurchaseListItem} from "@/src/types/purchase";

function statusTone(value: string) {
  if (/已付款|已退款/.test(value)) return "success" as const;
  if (/未付款|部分付款/.test(value)) return "warning" as const;
  return "neutral" as const;
}

export function createPurchaseListColumns({showCost, showProfit, onDetail}: {
  showCost: boolean;
  showProfit: boolean;
  onDetail: (item: PurchaseListItem) => void;
}): ColumnDef<PurchaseListItem, unknown>[] {
  const columns: ColumnDef<PurchaseListItem, unknown>[] = [
    {accessorKey: "invoiceNo", header: "采购单号", size: 180, cell: ({row}) => <div><p className="font-mono font-semibold text-[var(--erp-color-primary)]">{row.original.invoiceNo}</p>{row.original.hasImages && <p className="mt-1 flex items-center gap-1 text-xs text-[var(--erp-color-text-muted)]"><ImageIcon className="h-3 w-3" />含采购图片</p>}</div>},
    {accessorKey: "date", header: "日期", size: 110, cell: ({getValue}) => <span className="text-xs text-[var(--erp-color-text-secondary)]">{String(getValue() || "—").slice(0, 10)}</span>},
    {accessorKey: "supplierName", header: "来源对象", size: 180, cell: ({row}) => <div><p className="font-semibold">{row.original.supplierName || "未关联"}</p><p className="mt-1 text-xs text-[var(--erp-color-text-muted)]">{row.original.productSummary || "暂无商品摘要"}</p></div>},
    {accessorKey: "sourceType", header: "采购来源", size: 105, cell: ({getValue}) => <ErpStatusBadge label={String(getValue() || "—")} tone="neutral" />},
    {accessorKey: "totalCount", header: "数量", size: 80, cell: ({row}) => <span className="font-mono font-semibold">{row.original.totalCount} 件</span>},
    {accessorKey: "inventoryCount", header: "关联库存", size: 95, enableSorting: false, cell: ({row}) => <span className="font-mono text-[var(--erp-color-text-secondary)]">{row.original.inventoryCount} 件</span>},
  ];
  if (showCost) columns.push({accessorKey: "totalCost", header: "采购金额", size: 120, cell: ({row}) => <span className="font-mono font-semibold">{row.original.totalCost === undefined ? "—" : formatCurrency(row.original.totalCost)}</span>});
  if (showProfit) columns.push({accessorKey: "estTotalSell", header: "预计销售额", size: 120, enableSorting: false, cell: ({row}) => <span className="font-mono">{row.original.estTotalSell === undefined ? "—" : formatCurrency(row.original.estTotalSell)}</span>});
  if (showCost && showProfit) columns.push({accessorKey: "estTotalProfit", header: "预计利润", size: 110, enableSorting: false, cell: ({row}) => <span className="font-mono font-semibold text-[var(--erp-color-success)]">{row.original.estTotalProfit === undefined ? "—" : formatCurrency(row.original.estTotalProfit)}</span>});
  columns.push(
    {accessorKey: "paymentStatus", header: "付款状态", size: 105, cell: ({getValue}) => <ErpStatusBadge label={String(getValue() || "未付款")} tone={statusTone(String(getValue() || ""))} />},
    {accessorKey: "handleBy", header: "经办人", size: 100, cell: ({getValue}) => String(getValue() || "—")},
    {id: "actions", header: "操作", enableSorting: false, enableResizing: false, enableHiding: false, size: 82, cell: ({row}) => <Button type="button" size="sm" variant="ghost" onClick={(event) => {event.stopPropagation(); onDetail(row.original);}}><Eye className="h-3.5 w-3.5" />详情</Button>},
  );
  return columns;
}
