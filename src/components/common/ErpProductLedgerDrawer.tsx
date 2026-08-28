import type {ColumnDef} from "@tanstack/react-table";
import {Boxes, CalendarRange, PackageSearch, RefreshCw, RotateCcw, Search} from "lucide-react";
import {useMemo} from "react";
import {Button, Input, Select} from "@/src/components/ui";
import {formatCurrency} from "@/src/lib/format";
import {cn} from "@/src/lib/cn";
import {productLedgerDocumentTypes, type ProductLedgerFilters, type ProductLedgerOperationType, type ProductLedgerPage, type ProductLedgerRow} from "@/src/types/product-ledger";
import type {DateRangeValue} from "@/src/lib/dateRangePickerUtils";
import {ErpDataTable} from "./ErpDataTable";
import {ErpDateRangePicker} from "./ErpDateRangePicker";
import {ErpDetailDrawer} from "./ErpDetailDrawer";
import {ErpStatusBadge} from "./ErpStatusBadge";

export interface ProductLedgerSubject {
  key: string;
  productName: string;
  category?: string;
  brand?: string;
  model?: string;
  version?: string;
  vram?: string;
  currentStock?: number;
  imageUrl?: string;
}

export interface ProductLedgerDrawerProps {
  open: boolean;
  subject: ProductLedgerSubject | null;
  permissions: {showCost: boolean; showProfit: boolean};
  filters: ProductLedgerFilters;
  page?: ProductLedgerPage;
  loading: boolean;
  fetching: boolean;
  error: Error | null;
  onRetry: () => void;
  onFiltersChange: (patch: Partial<ProductLedgerFilters>) => void;
  onResetFilters: () => void;
  onPageChange: (page: number) => void;
  onPageSizeChange: (pageSize: number) => void;
  onOpenChange: (open: boolean) => void;
  onOpenDocument?: (row: ProductLedgerRow) => void;
}

const documentTypeOptions = [
  {value: "", label: "全部类型"},
  ...productLedgerDocumentTypes.map((value) => ({value, label: value})),
];

function operationTone(operation: ProductLedgerOperationType) {
  if (operation === "增加" || operation === "释放") return "success" as const;
  if (operation === "减少" || operation === "锁定") return "danger" as const;
  return "neutral" as const;
}

function documentTone(documentType: string) {
  if (documentType.includes("入库") || documentType === "销售退货") return "success" as const;
  if (documentType.includes("出库") || documentType === "采购退货") return "danger" as const;
  if (documentType === "组装拆卸") return "info" as const;
  return "neutral" as const;
}

function formatQuantity(value: number) {
  return `${value > 0 ? "+" : ""}${value}`;
}

function formatDateTime(value: string) {
  return value ? value.replace("T", " ").slice(0, 16) : "—";
}

function rowParty(row: ProductLedgerRow) {
  if (row.customerName) return `客户 · ${row.customerName}`;
  if (row.supplierName) return `供应商 · ${row.supplierName}`;
  return "—";
}

function rowRemarks(row: ProductLedgerRow) {
  return [row.productRemarks, row.documentRemarks].filter(Boolean).join("；") || "—";
}

function createColumns(onOpenDocument: ((row: ProductLedgerRow) => void) | undefined): ColumnDef<ProductLedgerRow, unknown>[] {
  return [
    {id: "operatedAt", accessorKey: "operatedAt", header: "操作时间", size: 145, cell: ({row}) => <span className="font-mono text-xs text-[var(--erp-color-text-secondary)]">{formatDateTime(row.original.operatedAt)}</span>},
    {id: "documentType", accessorKey: "documentType", header: "单据类型", size: 120, cell: ({row}) => <ErpStatusBadge label={row.original.documentType} tone={documentTone(row.original.documentType)} />},
    {id: "documentNo", accessorKey: "documentNo", header: "单据编号", size: 180, cell: ({row}) => onOpenDocument ? <button type="button" className="erp-focus-ring rounded text-left font-mono text-xs font-semibold text-[var(--erp-color-primary)] underline-offset-2 hover:underline" onClick={(event) => {event.stopPropagation(); onOpenDocument(row.original);}}>{row.original.documentNo}</button> : <span className="font-mono text-xs">{row.original.documentNo}</span>},
    {id: "operationType", accessorKey: "operationType", header: "变动方向", size: 100, cell: ({row}) => <ErpStatusBadge label={row.original.operationType} tone={operationTone(row.original.operationType)} />},
    {id: "quantity", accessorKey: "quantity", header: "数量", size: 85, cell: ({row}) => <span className={cn("font-mono font-semibold", row.original.quantity > 0 ? "text-[var(--erp-color-success)]" : row.original.quantity < 0 ? "text-[var(--erp-color-danger)]" : "text-[var(--erp-color-text-secondary)]")}>{formatQuantity(row.original.quantity)}</span>},
    {id: "unitPrice", accessorKey: "unitPrice", header: "单价", size: 110, cell: ({row}) => <span className="font-mono text-xs">{row.original.unitPrice === undefined ? "—" : formatCurrency(row.original.unitPrice)}</span>},
    {id: "amount", accessorKey: "amount", header: "金额", size: 120, cell: ({row}) => <span className={cn("font-mono text-xs font-semibold", row.original.amount === undefined ? "text-[var(--erp-color-text-muted)]" : row.original.amount < 0 ? "text-[var(--erp-color-danger)]" : "text-[var(--erp-color-text)]")}>{row.original.amount === undefined ? "—" : formatCurrency(row.original.amount)}</span>},
    {id: "party", header: "客户 / 供应商", size: 150, enableSorting: false, cell: ({row}) => <span className="block max-w-36 truncate text-xs text-[var(--erp-color-text-secondary)]" title={rowParty(row.original)}>{rowParty(row.original)}</span>},
    {id: "createdBy", accessorKey: "createdBy", header: "制单人", size: 100, cell: ({row}) => <span className="text-xs text-[var(--erp-color-text-secondary)]">{row.original.createdBy || "—"}</span>},
    {id: "remarks", header: "备注", size: 220, enableSorting: false, cell: ({row}) => <span className="block max-w-52 truncate text-xs text-[var(--erp-color-text-secondary)]" title={rowRemarks(row.original)}>{rowRemarks(row.original)}</span>},
  ];
}

export function ErpProductLedgerDrawer({open, subject, permissions, filters, page, loading, fetching, error, onRetry, onFiltersChange, onResetFilters, onPageChange, onPageSizeChange, onOpenChange, onOpenDocument}: ProductLedgerDrawerProps) {
  const columns = useMemo(() => createColumns(onOpenDocument), [onOpenDocument]);
  const range: DateRangeValue = {startDate: filters.startDate, endDate: filters.endDate};
  const identity = subject ? [subject.category, subject.brand, subject.model, subject.version, subject.vram].filter(Boolean).join(" · ") : "";
  const rows = page?.rows || [];
  const hasActiveFilters = Boolean(filters.documentNo || filters.createdBy || filters.documentType || filters.startDate || filters.endDate);

  return <ErpDetailDrawer open={open} onOpenChange={onOpenChange} title={subject?.productName || "型号出入库明细"} description={identity || "按型号汇总查看库存单据"}>
    {!subject ? <div className="p-2 text-sm text-[var(--erp-color-text-secondary)]">未选择商品型号</div> : <div className="space-y-4">
      <section className="flex items-center gap-3 rounded-[var(--erp-radius-lg)] border border-[var(--erp-color-border)] bg-[var(--erp-color-surface-muted)] p-3">
        <div className="flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded-[var(--erp-radius-md)] bg-[var(--erp-color-surface)]">
          {subject.imageUrl ? <img src={subject.imageUrl} alt="" className="h-full w-full object-contain" /> : <PackageSearch className="h-6 w-6 text-[var(--erp-color-text-muted)]" />}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-bold text-[var(--erp-color-text)]">{subject.productName}</p>
          <p className="mt-1 truncate text-xs text-[var(--erp-color-text-muted)]">{identity || "型号信息待补充"}</p>
        </div>
        <div className="shrink-0 text-right">
          <p className="text-[11px] text-[var(--erp-color-text-muted)]">当前库存</p>
          <p className="mt-1 font-mono text-lg font-bold text-[var(--erp-color-text)]">{subject.currentStock === undefined ? "—" : `${subject.currentStock} 件`}</p>
        </div>
      </section>

      <div className="flex flex-wrap items-center gap-2 text-xs text-[var(--erp-color-text-secondary)]">
        <span className="inline-flex items-center gap-1 rounded-full bg-[var(--erp-color-info-soft)] px-2.5 py-1"><Boxes className="h-3.5 w-3.5 text-[var(--erp-color-primary)]" />共 {page?.total ?? "—"} 条单据记录</span>
        {fetching && <span className="inline-flex items-center gap-1 text-[var(--erp-color-primary)]" role="status"><RefreshCw className="h-3.5 w-3.5 animate-spin" />刷新中</span>}
      </div>

      <div className="rounded-[var(--erp-radius-lg)] border border-[var(--erp-color-border)] bg-[var(--erp-color-surface)] p-3">
        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
          <div className="relative min-w-0 flex-1 sm:min-w-48"><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--erp-color-text-muted)]" /><Input className="pl-9" value={filters.documentNo} onChange={(event) => onFiltersChange({documentNo: event.target.value})} placeholder="搜索单据编号" aria-label="搜索单据编号" /></div>
          <Input className="w-full sm:w-32" value={filters.createdBy} onChange={(event) => onFiltersChange({createdBy: event.target.value})} placeholder="制单人" aria-label="筛选制单人" />
          <Select className="w-full sm:w-36" value={filters.documentType} onValueChange={(value) => onFiltersChange({documentType: value as ProductLedgerFilters["documentType"]})} options={documentTypeOptions} aria-label="筛选单据类型" />
          <ErpDateRangePicker value={range} onChange={(value) => onFiltersChange({startDate: value.startDate, endDate: value.endDate})} density="compact" triggerClassName="w-full sm:w-64" ariaLabel="筛选出入库日期" startPlaceholder="开始日期" endPlaceholder="结束日期" />
          <Button type="button" size="sm" variant="ghost" onClick={onResetFilters}><RotateCcw className="h-3.5 w-3.5" />重置</Button>
        </div>
        {hasActiveFilters && <p className="mt-2 flex items-center gap-1 text-[11px] text-[var(--erp-color-text-muted)]"><CalendarRange className="h-3.5 w-3.5" />{filters.startDate || "不限开始"} 至 {filters.endDate || "不限结束"}</p>}
      </div>

      {error && rows.length > 0 && <div className="flex items-center justify-between gap-3 rounded-[var(--erp-radius-md)] bg-[var(--erp-color-danger-soft)] px-3 py-2 text-xs text-[var(--erp-color-danger)]"><span className="truncate">刷新失败：{error.message}</span><Button type="button" size="sm" variant="ghost" onClick={onRetry}>重试</Button></div>}
      <ErpDataTable
        columns={columns}
        data={rows}
        getRowId={(row) => row.id}
        loading={loading}
        fetching={fetching}
        error={error}
        errorTitle="型号出入库明细加载失败"
        emptyTitle="暂无出入库单据"
        emptyDescription={hasActiveFilters ? "当前筛选条件下没有匹配记录。" : "该型号暂未形成采购、销售或退货单据。"}
        onRetry={onRetry}
        page={page?.page || filters.page}
        pageSize={page?.pageSize || filters.pageSize}
        total={page?.total || 0}
        onPageChange={onPageChange}
        onPageSizeChange={onPageSizeChange}
        density="compact"
        stickyHeader
        mobileMode="cards"
        mobileFields={5}
        surface="plain"
        ariaLabel={`${subject.productName}型号出入库单据`}
      />
    </div>}
  </ErpDetailDrawer>;
}
