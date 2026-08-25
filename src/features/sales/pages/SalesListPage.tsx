import {keepPreviousData, useMutation, useQuery, useQueryClient} from "@tanstack/react-query";
import {useNavigate} from "@tanstack/react-router";
import type {ColumnDef, SortingState, VisibilityState} from "@tanstack/react-table";
import {Banknote, CircleDollarSign, FileText, Filter, ListFilter, LockKeyhole, PackageCheck, Plus, RefreshCw, RotateCcw, Search, ShoppingCart, Truck} from "lucide-react";
import {useCallback, useMemo, useState, type ReactNode} from "react";
import {toast} from "sonner";
import {Button, Card, CardContent, Input, Select} from "@/src/components/ui";
import {ErpColumnVisibilityMenu, ErpDataTable, ErpDateRangePicker, ErpDetailDrawer, ErpDocumentDeleteDialog, ErpFilterBar, ErpListPageFrame, ErpLoadingState, ErpPageContent, ErpPageError, ErpPageHeader, ErpPageToolbar, ErpStatusBadge, MetricsRegion, type QuickStatusItemData} from "@/src/components/common";
import {ApiError, queryKeys, salesApi} from "@/src/services/api";
import {createCapabilities, useAuth} from "@/src/app/auth";
import {useTablePreferences} from "@/src/hooks/useTablePreferences";
import {useUrlSearchState} from "@/src/hooks/useUrlSearchState";
import type {AuthSession} from "@/src/services/api";
import {formatCurrency} from "@/src/lib/format";
import type {SalesListFilters, SalesListItem, SalesListLine, SalesListSortKey} from "@/src/types/sales";
import {createSalesListColumns} from "../sales.columns";
import {countActiveSalesListFilters, defaultSalesListFilters, parseSalesListFilters, salesListFiltersToSearch, selectSalesList} from "../sales.filters";

const permissionDefaults = {showCost: false, showProfit: false, canDelete: false, canEditHistory: false, allowedMenus: [] as string[]};
const emptyVisibility: VisibilityState = {};
const channelOptions = [{value: "", label: "全部销售渠道"}, ...["到店", "闲鱼", "抖音", "小红书", "B站", "微信私域", "同行网店"].map((value) => ({value, label: value}))];
const paymentOptions = [{value: "", label: "全部收款状态"}, ...["未收款", "部分收款", "已收款", "已退款"].map((value) => ({value, label: value}))];
const outboundOptions = [{value: "", label: "全部出库状态"}, ...["待出库", "已出库"].map((value) => ({value, label: value}))];

function useSalesListUrlState() {
  const {value, commit} = useUrlSearchState({
    defaultValue: {filters: defaultSalesListFilters, detailId: null as string | null},
    parse: (search) => ({filters: parseSalesListFilters(search), detailId: new URLSearchParams(search).get("detail")}),
    serialize: (state: {filters: SalesListFilters; detailId: string | null}) => {
      const params = salesListFiltersToSearch(state.filters);
      if (state.detailId) params.set("detail", state.detailId);
      return params;
    },
  });
  const commitFilters = (filters: SalesListFilters) => commit({filters, detailId: value.detailId});
  const commitDetail = (detailId: string | null) => commit({filters: value.filters, detailId});
  return {filters: value.filters, commitFilters, detailId: value.detailId, commitDetail};
}

export function SalesListPage() {
  const navigate = useNavigate();
  const {session, logout} = useAuth();
  const {filters, commitFilters, detailId, commitDetail} = useSalesListUrlState();
  const permissions = session?.permissions || permissionDefaults;
  const allowed = createCapabilities(session).menu("sales_list");
  const listQuery = useQuery({
    queryKey: queryKeys.sales.list({userId: session?.user.id || "anonymous", showCost: permissions.showCost, showProfit: permissions.showProfit}, filters),
    queryFn: ({signal}) => salesApi.list(filters, {showCost: permissions.showCost, showProfit: permissions.showProfit}, signal),
    enabled: Boolean(session && allowed),
    placeholderData: keepPreviousData,
    retry: false,
  });

  if (!session) return <Card><ErpLoadingState title="正在验证登录状态" /></Card>;
  if (!session || !allowed) return <ErpPageError title="当前账号没有销售单据权限" description="服务器已拒绝 sales_list 菜单访问，请联系管理员授权。" />;

  return <SalesListContent
    filters={filters}
    commitFilters={commitFilters}
    detailId={detailId}
    commitDetail={commitDetail}
    session={session}
    query={listQuery}
    onCreate={() => void navigate({to: "/sales/new"})}
    onRefresh={() => void listQuery.refetch()}
    onAuthExpired={logout}
  />;
}

function SalesListContent({filters, commitFilters, detailId, commitDetail, session, query, onCreate, onRefresh, onAuthExpired}: {
  filters: SalesListFilters;
  commitFilters: (filters: SalesListFilters) => void;
  detailId: string | null;
  commitDetail: (id: string | null) => void;
  session: AuthSession;
  query: ReturnType<typeof useQuery<Awaited<ReturnType<typeof salesApi.list>>>>;
  onCreate: () => void;
  onRefresh: () => void;
  onAuthExpired: () => void;
}) {
  const queryClient = useQueryClient();
  const [deleting, setDeleting] = useState<SalesListItem | null>(null);
  const {columnVisibility, setColumnVisibility, density, setDensity} = useTablePreferences<VisibilityState>({feature: "sales-list", userId: session.user.id, defaultVisibility: emptyVisibility});
  const selection = useMemo(() => query.data?.selection || selectSalesList(query.data?.items || [], filters), [filters, query.data]);
  const selectedDetail = useMemo(() => query.data?.items.find((item) => item.id === detailId || item.invoiceNo === detailId) || null, [detailId, query.data?.items]);
  const openDetail = useCallback((item: SalesListItem) => commitDetail(item.id), [commitDetail]);
  const invalidate = async () => {await Promise.all([
    queryClient.invalidateQueries({queryKey: queryKeys.sales.all()}),
    queryClient.invalidateQueries({queryKey: queryKeys.inventory.all()}),
    queryClient.invalidateQueries({queryKey: queryKeys.finance.all()}),
    queryClient.invalidateQueries({queryKey: queryKeys.customers.all()}),
    queryClient.invalidateQueries({queryKey: queryKeys.crm.all()}),
    queryClient.invalidateQueries({queryKey: queryKeys.state.all()}),
  ]);};
  const handleMutationError = (error: Error) => {if (error instanceof ApiError && error.isUnauthorized) {onAuthExpired(); return;} toast.error(error.message);};
  const deleteMutation = useMutation({mutationFn: (id: string) => salesApi.remove(id), onSuccess: async (result, id) => {setDeleting(null); commitDetail(null); toast.success(`销售单 ${result.invoiceNo || id} 已删除`, {description: "关联待出库占用、收款流水和财务关联已由服务端同步清理。"}); await invalidate();}, onError: handleMutationError});
  const columns = useMemo(() => createSalesListColumns({showProfit: session.permissions.showProfit, canDelete: session.permissions.canDelete, onDetail: openDetail, onDelete: setDeleting}), [openDetail, session.permissions.canDelete, session.permissions.showProfit]);
  const activeFilterCount = countActiveSalesListFilters(filters);
  const canCreate = createCapabilities(session).menu("sales_add");
  const sorting: SortingState = [{id: filters.sortKey, desc: filters.sortDirection === "desc"}];
  const sortableColumns = new Set<SalesListSortKey>(["date", "invoiceNo", "customerName", "totalCount", "totalAmount", "totalProfit", "paymentStatus", "outboundStatus", "handleBy"]);
  const onSortingChange = (updater: SortingState | ((old: SortingState) => SortingState)) => {
    const next = typeof updater === "function" ? updater(sorting) : updater;
    const first = next[0];
    const candidate = first?.id as SalesListSortKey | undefined;
    const sortKey = candidate && sortableColumns.has(candidate) ? candidate : "date";
    commitFilters({...filters, sortKey, sortDirection: first?.desc ? "desc" : "asc", page: 1});
  };
  const updateFilters = (patch: Partial<SalesListFilters>) => commitFilters({...filters, ...patch, page: 1});
  const quickStatus: QuickStatusItemData[] = [
    {icon: <ListFilter className="h-4 w-4" />, label: "筛选状态", value: activeFilterCount ? `${activeFilterCount} 项` : "全部", description: "已同步到当前 URL", tone: activeFilterCount ? "info" : "neutral"},
    {icon: <Truck className="h-4 w-4" />, label: "待出库", value: `${selection.summary.pendingOutboundCount} 单`, description: "等待仓库绑定 SN", tone: selection.summary.pendingOutboundCount ? "warning" : "success"},
    {icon: <LockKeyhole className="h-4 w-4" />, label: "利润权限", value: session.permissions.showProfit ? "可查看" : "已隐藏", description: "按账号权限裁剪", tone: session.permissions.showProfit ? "success" : "neutral"},
  ];

  return <>
    <ErpListPageFrame>
      <ErpPageHeader title="销售单据" subtitle="查看销售客户、成交金额、收款状态和出库进度。" quickStatus={quickStatus} actions={<><Button type="button" size="sm" variant="secondary" onClick={onRefresh} disabled={query.isFetching}><RefreshCw className={`h-4 w-4 ${query.isFetching ? "animate-spin" : ""}`} />刷新</Button>{canCreate && <Button type="button" size="sm" variant="primary" onClick={onCreate}><Plus className="h-4 w-4" />新建销售单</Button>}</>} />
      <ErpPageContent className="space-y-[var(--erp-page-gap)]">
      <MetricsRegion>
        <MetricCard label="销售单数" value={`${selection.summary.orderCount} 单`} detail="按当前筛选" icon={<FileText className="h-4 w-4" />} />
        <MetricCard label="销售金额" value={formatCurrency(selection.summary.totalAmount)} detail="当前筛选汇总" icon={<ShoppingCart className="h-4 w-4" />} />
        <MetricCard label="销售件数" value={`${selection.summary.unitCount} 件`} detail="销售单实物数量" icon={<PackageCheck className="h-4 w-4" />} />
        <MetricCard label="待收款" value={`${selection.summary.pendingPaymentCount} 单`} detail="未收款 / 部分收款" tone={selection.summary.pendingPaymentCount ? "warning" : "neutral"} icon={<Banknote className="h-4 w-4" />} />
        <MetricCard label="待出库" value={`${selection.summary.pendingOutboundCount} 单`} detail="等待仓库处理" tone={selection.summary.pendingOutboundCount ? "warning" : "neutral"} icon={<Truck className="h-4 w-4" />} />
        {session.permissions.showProfit && <MetricCard label="销售利润" value={selection.summary.totalProfit === undefined ? "—" : formatCurrency(selection.summary.totalProfit)} detail="当前筛选汇总" icon={<CircleDollarSign className="h-4 w-4" />} />}
      </MetricsRegion>

      <ErpPageToolbar><ErpFilterBar actions={<Button type="button" variant="ghost" size="sm" onClick={() => commitFilters(defaultSalesListFilters)}><RotateCcw className="h-4 w-4" />重置筛选</Button>}>
        <div className="relative min-w-[260px] flex-1"><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--erp-color-text-muted)]" /><Input className="pl-9" value={filters.keyword} onChange={(event) => updateFilters({keyword: event.target.value})} placeholder="搜索销售单号、客户、商品、SN 或经办人" aria-label="搜索销售单据" /></div>
        <Select className="w-36" value={filters.channel} options={channelOptions} onValueChange={(value) => updateFilters({channel: value as SalesListFilters["channel"]})} aria-label="销售渠道筛选" />
        <Select className="w-36" value={filters.paymentStatus} options={paymentOptions} onValueChange={(value) => updateFilters({paymentStatus: value as SalesListFilters["paymentStatus"]})} aria-label="收款状态筛选" />
        <Select className="w-36" value={filters.outboundStatus} options={outboundOptions} onValueChange={(value) => updateFilters({outboundStatus: value as SalesListFilters["outboundStatus"]})} aria-label="出库状态筛选" />
        <ErpDateRangePicker value={{startDate: filters.dateStart, endDate: filters.dateEnd}} onChange={({startDate, endDate}) => updateFilters({dateStart: startDate, dateEnd: endDate})} triggerClassName="sm:w-36" startAriaLabel="销售开始日期" endAriaLabel="销售结束日期" ariaLabel="销售日期范围" />
      </ErpFilterBar></ErpPageToolbar>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-xs text-[var(--erp-color-text-secondary)]"><Filter className="h-4 w-4 text-[var(--erp-color-primary)]" /><span>共 {selection.meta.total} 条</span></div>
        <div className="flex items-center gap-2"><ErpColumnVisibilityMenu columns={columns} visibility={columnVisibility} onVisibilityChange={setColumnVisibility} /><div className="inline-flex rounded-[var(--erp-radius-md)] border border-[var(--erp-color-border)] bg-[var(--erp-color-surface)] p-0.5"><Button type="button" size="sm" variant={density === "comfortable" ? "secondary" : "ghost"} onClick={() => setDensity("comfortable")}>舒适</Button><Button type="button" size="sm" variant={density === "compact" ? "secondary" : "ghost"} onClick={() => setDensity("compact")}>紧凑</Button></div></div>
      </div>

      <ErpDataTable columns={columns} data={selection.data} getRowId={(row) => row.id} loading={query.isPending} fetching={query.isFetching} error={query.error as Error | null} errorTitle="销售单据加载失败" emptyTitle="暂无销售单据" emptyDescription={activeFilterCount ? "当前筛选条件没有匹配的销售单。" : "服务器当前没有返回销售单据。"} onRetry={() => void query.refetch()} onRowClick={openDetail} manualSorting sorting={sorting} onSortingChange={onSortingChange} page={selection.meta.page} pageSize={selection.meta.pageSize} total={selection.meta.total} onPageChange={(page) => commitFilters({...filters, page})} onPageSizeChange={(pageSize) => commitFilters({...filters, page: 1, pageSize})} columnVisibility={columnVisibility} onColumnVisibilityChange={setColumnVisibility} enableColumnResizing density={density} stickyHeader />
      </ErpPageContent>
    </ErpListPageFrame>

    <ErpDetailDrawer open={Boolean(detailId)} onOpenChange={(open) => {if (!open) commitDetail(null);}} title={selectedDetail?.invoiceNo || detailId || "销售单摘要"} description="销售单摘要" footer={selectedDetail && session.permissions.canDelete ? <div className="flex flex-wrap items-center justify-end gap-2">{selectedDetail.outboundStatus === "已出库" ? <span className="text-xs text-[var(--erp-color-text-muted)]">已出库销售单不能删除</span> : <Button type="button" size="sm" variant="danger" onClick={() => setDeleting(selectedDetail)}>删除销售单</Button>}</div> : undefined}>
      {selectedDetail ? <SalesSnapshotDetail item={selectedDetail} showCost={session.permissions.showCost} showProfit={session.permissions.showProfit} /> : <div className="rounded-[var(--erp-radius-md)] bg-[var(--erp-color-warning-soft)] p-4 text-sm text-[var(--erp-color-warning)]">当前快照中未找到该销售单，可能已删除或当前账号无权查看。</div>}
    </ErpDetailDrawer>
    <ErpDocumentDeleteDialog
      open={Boolean(deleting)}
      title="删除销售单"
      documentName={deleting?.invoiceNo || "当前销售单"}
      description="仅待出库销售单允许删除；服务端会再次检查出库状态，并同步恢复关联库存、收款流水和财务记录。"
      pending={deleteMutation.isPending}
      error={deleteMutation.error instanceof Error ? deleteMutation.error.message : undefined}
      onOpenChange={(open) => {if (!open) {setDeleting(null); deleteMutation.reset();}}}
      onConfirm={() => {if (deleting) deleteMutation.mutate(deleting.id);}}
    />
  </>;
}

function SalesSnapshotDetail({item, showCost, showProfit}: {item: SalesListItem; showCost: boolean; showProfit: boolean}) {
  const columns = useMemo<ColumnDef<SalesListLine, unknown>[]>(() => {
    const result: ColumnDef<SalesListLine, unknown>[] = [
      {accessorKey: "productName", header: "商品", size: 220, cell: ({row}) => <div><p className="font-semibold">{row.original.productName}</p><p className="mt-1 font-mono text-xs text-[var(--erp-color-text-muted)]">{row.original.sn || "SN 待出库绑定"}</p></div>},
      {accessorKey: "condition", header: "成色", size: 90, cell: ({getValue}) => String(getValue() || "—")},
      {accessorKey: "quantity", header: "数量", size: 70, cell: ({getValue}) => `${Number(getValue() || 0)} 件`},
      {accessorKey: "sellPrice", header: "售价", size: 100, cell: ({getValue}) => <span className="font-mono font-semibold">{formatCurrency(Number(getValue() || 0))}</span>},
    ];
    if (showCost) result.push({accessorKey: "costPrice", header: "成本", size: 100, cell: ({getValue}) => getValue() === undefined ? "—" : formatCurrency(Number(getValue()))});
    if (showProfit) result.push({accessorKey: "profit", header: "利润", size: 100, cell: ({getValue}) => <span className="font-mono text-[var(--erp-color-success)]">{getValue() === undefined ? "—" : formatCurrency(Number(getValue()))}</span>});
    return result;
  }, [showCost, showProfit]);
  return <div className="space-y-5">
    <div className="grid gap-3 sm:grid-cols-2"><DetailFact label="客户" value={item.customerName || "—"} /><DetailFact label="联系方式" value={item.contact || "—"} /><DetailFact label="渠道" value={item.channel} /><DetailFact label="经办人" value={item.handleBy || "—"} /><DetailFact label="销售金额" value={formatCurrency(item.totalAmount)} /><DetailFact label="销售利润" value={showProfit && item.totalProfit !== undefined ? formatCurrency(item.totalProfit) : "无权查看"} /><DetailFact label="收款状态" value={`${item.paymentStatus} · 已收 ${formatCurrency(item.paidAmount)} · 未收 ${formatCurrency(item.unpaidAmount)}`} /><DetailFact label="出库状态" value={`${item.outboundStatus}${item.outboundTime ? ` · ${item.outboundTime}` : ""}`} /></div>
    <Card><CardContent className="p-4"><div className="grid gap-3 sm:grid-cols-2"><DetailFact label="物流" value={item.freeShipping ? "客户自提 / 无需物流" : [item.expressCompany, item.expressNo].filter(Boolean).join(" · ") || "未填写"} /><DetailFact label="需要发票" value={item.needInvoice ? "是" : "否"} /><DetailFact label="售后条款" value={item.aftersalesTerms || "—"} /><DetailFact label="备注" value={item.remarks || "—"} /></div></CardContent></Card>
    <div><h3 className="mb-3 text-sm font-bold">商品明细</h3><ErpDataTable columns={columns} data={item.lines} getRowId={(line) => line.id} density="compact" stickyHeader emptyTitle="该销售单没有商品明细" /></div>
  </div>;
}

function DetailFact({label, value}: {label: string; value: string}) {
  return <div className="rounded-[var(--erp-radius-md)] bg-[var(--erp-color-surface-muted)] p-3"><p className="text-xs text-[var(--erp-color-text-muted)]">{label}</p><p className="mt-1 break-words text-sm font-semibold text-[var(--erp-color-text)]">{value}</p></div>;
}

function MetricCard({label, value, detail, icon, tone = "neutral"}: {label: string; value: string; detail: string; icon: ReactNode; tone?: "neutral" | "warning"}) {
  return <Card><CardContent className="min-h-[104px] p-4"><div className="flex items-center justify-between gap-3"><p className="text-xs font-semibold text-[var(--erp-color-text-secondary)]">{label}</p><span className={tone === "warning" ? "text-[var(--erp-color-warning)]" : "text-[var(--erp-color-primary)]"}>{icon}</span></div><p className={`mt-2 font-mono text-2xl font-bold ${tone === "warning" ? "text-[var(--erp-color-warning)]" : "text-[var(--erp-color-text)]"}`}>{value}</p><p className="mt-1 text-xs text-[var(--erp-color-text-muted)]">{detail}</p></CardContent></Card>;
}
