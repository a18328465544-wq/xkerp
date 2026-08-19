import type {ColumnDef} from "@tanstack/react-table";
import {ErpStatusBadge} from "@/src/components/common";
import {ArrowRight} from "lucide-react";
import {Button} from "@/src/components/ui";
import type {InspectionCandidate, InspectionHistoryItem} from "@/src/types/inspection";

function resultTone(status: InspectionHistoryItem["resultStatus"]): "success" | "warning" | "danger" | "info" {
  if (status === "通过") return "success";
  if (status === "轻微问题" || status === "降价入库") return "warning";
  if (status === "需要维修" || status === "拒收入库") return "danger";
  return "info";
}

export function createInspectionHistoryColumns(): ColumnDef<InspectionHistoryItem, unknown>[] {
  return [
    {accessorKey: "id", header: "检测单号", size: 140, cell: ({row}) => <div><p className="font-mono text-xs font-bold text-[var(--erp-color-primary)]">{row.original.id}</p><p className="mt-1 font-mono text-xs text-[var(--erp-color-text-muted)]">{row.original.inspectTime || "—"}</p></div>},
    {accessorKey: "productName", header: "商品 / SN", size: 250, cell: ({row}) => <div><p className="max-w-64 truncate font-semibold" title={row.original.productName}>{row.original.productName}</p><p className="mt-1 text-xs text-[var(--erp-color-text-muted)]">{row.original.serialNumber ? <span className="font-mono">{row.original.serialNumber}</span> : "未记录 SN"}</p></div>},
    {accessorKey: "category", header: "分类", size: 90, cell: ({getValue}) => <ErpStatusBadge label={String(getValue() || "其他配件")} tone="info" />},
    {accessorKey: "resultStatus", header: "检测结论", size: 110, cell: ({row}) => <ErpStatusBadge label={row.original.resultStatus} tone={resultTone(row.original.resultStatus)} />},
    {accessorKey: "condition", header: "成色", size: 90},
    {accessorKey: "warehouseLocation", header: "最终库位", size: 130, cell: ({getValue}) => String(getValue() || "—")},
    {accessorKey: "temperature", header: "温度 / 功耗", size: 130, cell: ({row}) => row.original.category === "显卡" ? <span className="font-mono text-xs">{row.original.temperature || 0}℃ · {row.original.wattage || 0}W</span> : <span className="text-xs text-[var(--erp-color-text-muted)]">简易检测</span>},
    {accessorKey: "inspector", header: "检测员", size: 100, cell: ({getValue}) => String(getValue() || "—")},
  ];
}

export function createInspectionCandidateColumns(onInspect: (item: InspectionCandidate) => void): ColumnDef<InspectionCandidate, unknown>[] {
  return [
    {accessorKey: "id", header: "库存编号 / SN", size: 180, cell: ({row}) => <div><p className="font-mono text-xs font-bold text-[var(--erp-color-primary)]">{row.original.id}</p><p className="mt-1 text-xs text-[var(--erp-color-text-muted)]">{row.original.serialNumber ? <span className="font-mono">{row.original.serialNumber}</span> : "待录入实物 SN"}</p></div>},
    {accessorKey: "productName", header: "商品", size: 260, cell: ({row}) => <div><p className="max-w-64 truncate font-semibold" title={row.original.productName}>{row.original.productName}</p><p className="mt-1 text-xs text-[var(--erp-color-text-muted)]">{[row.original.brand, row.original.model, row.original.version, row.original.vram].filter(Boolean).join(" · ") || row.original.category}</p></div>},
    {accessorKey: "category", header: "检测类型", size: 110, cell: ({row}) => <ErpStatusBadge label={row.original.isGpu ? "显卡完整检测" : "配件简易检测"} tone={row.original.isGpu ? "warning" : "info"} />},
    {accessorKey: "supplierName", header: "采购来源", size: 150, cell: ({row}) => <div><p className="font-semibold">{row.original.supplierName || "—"}</p><p className="mt-1 text-xs text-[var(--erp-color-text-muted)]">{row.original.purchaseInvoiceNo ? <span className="font-mono">{row.original.purchaseInvoiceNo}</span> : "未关联采购单"}</p></div>},
    {accessorKey: "status", header: "当前状态", size: 100, cell: ({getValue}) => <ErpStatusBadge label={String(getValue() || "待检测")} tone="warning" />},
    {accessorKey: "inventoryDays", header: "等待天数", size: 90, cell: ({getValue}) => <span><span className="font-mono">{Number(getValue() || 0)}</span> 天</span>},
    {accessorKey: "warehouseLocation", header: "当前库位", size: 120, cell: ({getValue}) => String(getValue() || "—")},
    {id: "actions", header: "操作", size: 100, enableSorting: false, cell: ({row}) => <Button type="button" size="sm" variant="ghost" onClick={(event) => {event.stopPropagation(); onInspect(row.original);}}>开始检测<ArrowRight className="h-3.5 w-3.5" /></Button>},
  ];
}
