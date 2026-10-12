import {useState} from "react";
import type {ColumnDef, SortingState} from "@tanstack/react-table";
import {ArrowDown, ArrowUp, Check, ListFilter, RotateCcw} from "lucide-react";
import {Button, Select} from "@/src/components/ui";
import {formatCurrency} from "@/src/lib/format";
import {productDisplayName} from "@/src/lib/productName";
import {formatStoreDateTime} from "@/src/utils/storeTime";
import {productLedgerDocumentTypes, type ProductLedgerFilters, type ProductLedgerRow} from "@/src/types/product-ledger";
import type {ProductLedgerDrawerProps} from "./ErpProductLedgerDrawer";
import {ErpDetailDrawer} from "./ErpDetailDrawer";
import {ErpDialogShell} from "./ErpDialogShell";
import {ErpDataTable} from "./ErpDataTable";
import {ErpMobileRecordRow} from "./ErpMobileRecordRow";
import {ErpSearchInput} from "./ErpSearchInput";
import {ErpStatusBadge} from "./ErpStatusBadge";
import {ErpFilterFields, countActiveErpFilterFields, type ErpFilterField} from "./filters/ErpFilterFields";

export type LedgerCriteria = Pick<ProductLedgerFilters, "createdBy" | "documentType" | "startDate" | "endDate">;
export function ledgerCriteria(filters: LedgerCriteria): LedgerCriteria {
  return {createdBy: filters.createdBy, documentType: filters.documentType, startDate: filters.startDate, endDate: filters.endDate};
}
export const emptyLedgerCriteria: LedgerCriteria = {createdBy: "", documentType: "", startDate: "", endDate: ""};

/** Direction is the recorded operation, not an inferred stock/financial event. */
export function ledgerQuantityLabel(row: Pick<ProductLedgerRow, "operationType" | "quantity">) {
  const quantity = row.operationType === "增加" && row.quantity >= 0 || row.operationType === "减少" && row.quantity <= 0
    ? Math.abs(row.quantity) : row.quantity;
  return `${row.operationType} ${quantity} 件`;
}

export function ErpProductLedgerMobileRow({row, onOpen}: {row: ProductLedgerRow; onOpen?: () => void}) {
  const incoming = row.documentType.includes("入库") || row.documentType === "销售退货";
  const party = row.customerName ? `客户 · ${row.customerName}` : row.supplierName ? `供应商 · ${row.supplierName}` : "未记录往来方";
  return <ErpMobileRecordRow title={row.documentNo} statusPlacement="title"
    status={<span className="erp-ledger-row-state"><ErpStatusBadge label={row.documentType} tone={incoming ? "success" : "neutral"} /><span data-direction={row.operationType}>{ledgerQuantityLabel(row)}</span></span>}
    subtitle={<>{party}<span className="erp-ledger-row-creator">制单人 · {row.createdBy || "未记录"}</span></>}
    meta={formatStoreDateTime(row.operatedAt)}
    amount={row.amount === undefined ? undefined : formatCurrency(row.amount)} onOpen={onOpen} />;
}

/** Phone-only presentation. The owning hook/API retains filters, permissions and paging. */
export function ErpProductLedgerMobile({open, subject, subjects = [], columns, filters, page, loading, fetching, error, onRetry, onFiltersChange, onPageChange, onPageSizeChange, onOpenChange, onSubjectChange, onOpenDocument}: ProductLedgerDrawerProps & {columns: ColumnDef<ProductLedgerRow, unknown>[]}) {
  const [filterOpen, setFilterOpen] = useState(false);
  const [draft, setDraft] = useState<LedgerCriteria>(() => ledgerCriteria(filters));
  const [sortOpen, setSortOpen] = useState(false);
  const [sorting, setSorting] = useState<SortingState>([]);
  const [subjectOpenRequest, setSubjectOpenRequest] = useState(0);
  const subjectLabel = subject ? productDisplayName({name: subject.productName, ...subject}) : "未选择商品型号";
  const rows = page?.rows ?? [];
  const fieldsFor = (criteria: LedgerCriteria, update: (patch: Partial<LedgerCriteria>) => void): ErpFilterField[] => [
    {key: "documentType", label: "单据类型", kind: "select", phoneControl: "chips" as const, value: criteria.documentType, defaultValue: "", options: [{value: "", label: "全部类型"}, ...productLedgerDocumentTypes.map((value) => ({value, label: value}))], onChange: (value) => update({documentType: value as LedgerCriteria["documentType"]})},
    {key: "createdBy", label: "制单人", kind: "text", value: criteria.createdBy, placeholder: "搜索制单人", onChange: (value) => update({createdBy: value})},
    {key: "date", label: "出入日期", kind: "dateRange", value: {startDate: criteria.startDate, endDate: criteria.endDate}, onChange: (value) => update(value)},
  ];
  const activeCount = countActiveErpFilterFields(fieldsFor(filters, () => undefined));
  const hasFilters = Boolean(activeCount || filters.documentNo);
  return <ErpDetailDrawer open={open} onOpenChange={onOpenChange} title="出入记录" resizable allowFullWidth drawerKey="product-ledger" defaultWidth={820} minWidth={640} maxWidth={1100} contentClassName="erp-ledger-phone-body"
    headerActions={subject && subjects.length > 1 && onSubjectChange ? <Button type="button" variant="ghost" className="erp-ledger-subject-action" onClick={() => setSubjectOpenRequest((value) => value + 1)}>切换型号</Button> : <span aria-hidden="true" />}
    footer={<ErpSearchInput value={filters.documentNo} onChange={(event) => onFiltersChange({documentNo: event.target.value})} placeholder="搜索单据编号" aria-label="搜索单据编号" />}>
    <div className="erp-product-ledger-phone">
      <section className="erp-ledger-identity" aria-label="当前商品型号"><h3>{subjectLabel}</h3><p>{subject?.category || "商品"} · 库存 {subject?.currentStock === undefined ? "—" : `${subject.currentStock} 件`}</p></section>
      {subject && onSubjectChange && subjects.length > 1 ? <Select searchable value={subject.key} options={subjects.map((option) => {const label = productDisplayName({name: option.productName, ...option}); return {value: option.key, label, labelText: label};})} disabled={!open} hidePhoneTrigger phoneOpenRequest={subjectOpenRequest} phoneDialogTitle="切换商品型号" searchPlaceholder="搜索商品名称、品牌或型号" aria-label="切换商品型号" onValueChange={(value) => {const next = subjects.find((option) => option.key === value); if (next && next.key !== subject.key) onSubjectChange(next);}} /> : null}
      <div className="erp-ledger-toolbar"><span aria-live="polite">{loading ? "加载中…" : `${page?.total ?? "—"} 条记录`}</span><div>
        <Button type="button" variant="ghost" aria-label={`筛选出入记录${activeCount ? `，已应用 ${activeCount} 项` : ""}`} onClick={() => {setDraft(ledgerCriteria(filters)); setFilterOpen(true);}}><ListFilter className="h-4 w-4" />筛选{activeCount ? ` ${activeCount}` : ""}</Button>
        <Button type="button" variant="ghost" className="erp-ledger-time-sort" aria-label="时间排序" onClick={() => setSortOpen(true)}>{sorting.length ? "本页时间" : "时间"}{sorting.length ? <ArrowUp className="h-4 w-4" /> : <ArrowDown className="h-4 w-4" />}</Button>
      </div></div>
      {error && rows.length > 0 ? <div role="alert" className="erp-ledger-refresh-error"><span>刷新失败：{error.message}</span><Button type="button" variant="ghost" onClick={onRetry}>重试</Button></div> : null}
      <ErpDataTable columns={columns} data={rows} getRowId={(row) => row.id} loading={loading} fetching={fetching} error={error} onRetry={onRetry}
        errorTitle="出入记录加载失败" emptyTitle="暂无出入记录" emptyDescription={hasFilters ? "当前筛选条件下没有匹配记录。" : "该型号暂未形成采购、销售或退货单据。"}
        page={page?.page ?? filters.page} pageSize={page?.pageSize ?? filters.pageSize} total={page?.total ?? 0} onPageChange={onPageChange} onPageSizeChange={onPageSizeChange}
        sorting={sorting} onSortingChange={setSorting} mobileMode="cards" mobileSorting={false} mobilePagination="compact" mobilePaginationShowTotal={false}
        mobileRow={(row) => <ErpProductLedgerMobileRow row={row} onOpen={onOpenDocument ? () => onOpenDocument(row) : undefined} />} surface="plain" density="compact" ariaLabel={`${subjectLabel}型号出入库单据`} />
    </div>
    <ErpDialogShell open={open && filterOpen} onOpenChange={setFilterOpen} title="筛选出入记录" mobilePresentation="sheet" footer={<><Button type="button" variant="secondary" onClick={() => setDraft({...emptyLedgerCriteria})}><RotateCcw className="h-4 w-4" />重置</Button><Button type="button" onClick={() => {onFiltersChange(ledgerCriteria(draft)); setFilterOpen(false);}}>应用筛选</Button></>}>
      <ErpFilterFields layout="sheet" fields={fieldsFor(draft, (patch) => setDraft((current) => ({...current, ...patch})))} />
    </ErpDialogShell>
    <ErpDialogShell open={open && sortOpen} onOpenChange={setSortOpen} title="时间排序" mobilePresentation="sheet">
      <div className="erp-ledger-sort-options">
        <Button type="button" variant="ghost" aria-pressed={!sorting.length} onClick={() => {setSorting([]); setSortOpen(false);}}><span>由近到远<small>全部记录 · 默认</small></span>{!sorting.length && <Check className="h-4 w-4" />}</Button>
        <Button type="button" variant="ghost" aria-pressed={Boolean(sorting.length)} onClick={() => {setSorting([{id: "operatedAt", desc: false}]); setSortOpen(false);}}><span>由远到近<small>仅排序当前页，跨页仍按原查询顺序</small></span>{sorting.length > 0 && <Check className="h-4 w-4" />}</Button>
      </div>
    </ErpDialogShell>
  </ErpDetailDrawer>;
}
