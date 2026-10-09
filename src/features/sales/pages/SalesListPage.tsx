import {displayQueryValue} from "@/src/utils/queryDisplay";
import {useDebouncedValue} from "@/src/hooks/useDebouncedValue";
import {keepPreviousData, useMutation, useQuery, useQueryClient} from "@tanstack/react-query";
import {useNavigate} from "@tanstack/react-router";
import type {ColumnDef, SortingState, VisibilityState} from "@tanstack/react-table";
import {Banknote, CircleDollarSign, Filter, Plus, ShoppingCart, Truck} from "lucide-react";
import {ErpEntityThumbnail} from "@/src/components/common";
import {useCallback, useEffect, useMemo, useState, type ReactNode} from "react";
import {notify} from "@/src/utils/notification";
import {Button, Card, CardContent} from "@/src/components/ui";
import {useErpPhone} from "@/src/hooks/useErpViewport";
import {ErpDataTable, ErpDetailDrawer, ErpDetailFact, ErpDocumentDeleteDialog, ErpEmptyState, ErpListPage, ErpLoadingState, ErpMetricCard, ErpOutstandingSettlementDialog, ErpPageError, type ErpFilterField, type QuickStatusItemData} from "@/src/components/common";
import {ApiError, queryKeys, salesApi} from "@/src/services/api";
import {financeAccountsApi, financeSettlementApi, invalidateErpDomains} from "@/src/services/api";
import {createCapabilities, useAuth} from "@/src/app/auth";
import {useTablePreferences} from "@/src/hooks/useTablePreferences";
import {useUrlSearchState} from "@/src/hooks/useUrlSearchState";
import {useWorkspaceTabActivity} from "@/src/hooks/useWorkspaceTabRuntime";
import type {AuthSession} from "@/src/services/api";
import type {LinkedSettlementContext} from "@/src/types/finance-settlement";
import {formatCurrency} from "@/src/lib/format";
import {salesChannelValues, salesOutboundStatusValues, salesPaymentStatusValues} from "@/src/types/sales";
import type {SalesListFilters, SalesListItem, SalesListLine, SalesListSortKey} from "@/src/types/sales";
import {createSalesListColumns} from "../sales.columns";
import {SalesDetailActions} from "../components/SalesDetailActions";
import {countActiveSalesListFilters, defaultSalesListFilters, parseSalesListFilters, salesListFiltersToSearch, selectSalesList} from "../sales.filters";

const permissionDefaults = {showCost: false, showProfit: false, canDelete: false, canEditHistory: false, allowedMenus: [] as string[]};
const emptyVisibility: VisibilityState = {channel: false, handleBy: false};
const channelOptions = [{value: "", label: "全部销售渠道"}, ...salesChannelValues.map((value) => ({value, label: value}))];
const paymentOptions = [{value: "", label: "全部收款状态"}, ...salesPaymentStatusValues.map((value) => ({value, label: value}))];
const outboundOptions = [{value: "", label: "全部出库状态"}, ...salesOutboundStatusValues.map((value) => ({value, label: value}))];

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
  const {active} = useWorkspaceTabActivity();
  const navigate = useNavigate();
  const {session, logout} = useAuth();
  const {filters, commitFilters, detailId, commitDetail} = useSalesListUrlState();
  const keyword = useDebouncedValue(filters.keyword, 300);
  const requestFilters = {...filters, keyword};
  const permissions = session?.permissions || permissionDefaults;
  const allowed = createCapabilities(session).menu("sales_list");
  const listQuery = useQuery({
    queryKey: queryKeys.sales.list({userId: session?.user.id || "anonymous", showCost: permissions.showCost, showProfit: permissions.showProfit}, requestFilters),
    queryFn: ({signal}) => salesApi.list(requestFilters, {showCost: permissions.showCost, showProfit: permissions.showProfit}, signal),
    enabled: active && Boolean(session && allowed) && keyword === filters.keyword,
    placeholderData: keepPreviousData,
    retry: false,
  });

  if (!session) return <Card><ErpLoadingState title="正在验证登录状态" /></Card>;
  if (!session || !allowed) return <ErpPageError title="当前账号没有销售单据权限" description="当前账号没有此页面的访问权限，请联系管理员开通。" />;

  return <SalesListContent
    filters={filters}
    commitFilters={commitFilters}
    detailId={detailId}
    commitDetail={commitDetail}
    session={session}
    query={listQuery}
    filterPending={keyword !== filters.keyword}
    onCreate={() => void navigate({to: "/sales/new"})}
    onRefresh={() => void listQuery.refetch()}
    onAuthExpired={logout}
  />;
}

function SalesListContent({filters, commitFilters, detailId, commitDetail, session, query, filterPending, onCreate, onRefresh, onAuthExpired}: {
  filters: SalesListFilters;
  commitFilters: (filters: SalesListFilters) => void;
  detailId: string | null;
  commitDetail: (id: string | null) => void;
  session: AuthSession;
  filterPending: boolean;
  query: ReturnType<typeof useQuery<Awaited<ReturnType<typeof salesApi.list>>>>;
  onCreate: () => void;
  onRefresh: () => void;
  onAuthExpired: () => void;
}) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [deleting, setDeleting] = useState<SalesListItem | null>(null);
  const [settling, setSettling] = useState<SalesListItem | null>(null);
  const {columnVisibility, setColumnVisibility, density, setDensity} = useTablePreferences<VisibilityState>({feature: "sales-list", userId: session.user.id, defaultVisibility: emptyVisibility});
  const selection = useMemo(() => query.data?.selection || selectSalesList(query.data?.items || [], filters), [filters, query.data]);
  const metricValue = (value: string | number) => displayQueryValue(query, value, filterPending);
  const {active} = useWorkspaceTabActivity();
  const updateFilters = useCallback((patch: Partial<SalesListFilters>) => commitFilters({...filters, ...patch, page: 1}), [commitFilters, filters]);
  const selectedDetailFromPage = useMemo(() => query.data?.items.find((item) => item.id === detailId || item.invoiceNo === detailId) || null, [detailId, query.data?.items]);
  const detailQuery = useQuery({
    queryKey: queryKeys.sales.detail(detailId || ""),
    queryFn: ({signal}) => salesApi.findByReference(detailId || "", {showCost: session.permissions.showCost, showProfit: session.permissions.showProfit}, signal),
    enabled: active && Boolean(detailId && !selectedDetailFromPage),
    retry: false,
  });
  useEffect(() => {if (detailQuery.error instanceof ApiError && detailQuery.error.isUnauthorized) onAuthExpired();}, [detailQuery.error, onAuthExpired]);
  const selectedDetail = selectedDetailFromPage || detailQuery.data || null;
  const canReceive = createCapabilities(session).menu("payment_in") && createCapabilities(session).menu("settlement_accounts");
  const accountsQuery = useQuery({queryKey: queryKeys.finance.accounts(), queryFn: ({signal}) => financeAccountsApi.listAll(signal), enabled: active && Boolean(canReceive), staleTime: 60_000, retry: false});
  const openDetail = useCallback((item: SalesListItem) => commitDetail(item.id), [commitDetail]);
  const invalidate = () => invalidateErpDomains(queryClient, ["sales", "inventory", "finance", "customers", "crm", "state"]);
  const handleMutationError = (error: Error) => {if (error instanceof ApiError && error.isUnauthorized) {onAuthExpired(); return;} notify.error(error.message);};
  const deleteMutation = useMutation({mutationFn: (id: string) => salesApi.remove(id), onSuccess: async (result, id) => {setDeleting(null); commitDetail(null); notify.success(`销售单 ${result.invoiceNo || id} 已删除`, {description: "关联的待出库占用、收款流水和财务记录已同步清理。"}); await invalidate();}, onError: handleMutationError});
  const settlementContext: LinkedSettlementContext | null = settling && settling.unpaidAmount > 0 ? {kind: "income", relatedDocType: "销售单", relatedDocNo: settling.invoiceNo || settling.id, partyName: settling.customerName, partyId: settling.customerId, partnerType: settling.customerPartnerType, defaultAccountId: settling.settlementAccountId, remainingAmount: settling.unpaidAmount} : null;
  const settlementMutation = useMutation({
    mutationFn: (values: Parameters<typeof financeSettlementApi.createIncome>[0]) => {
      if (!settlementContext) throw new Error("销售单未处于待收款状态");
      return financeSettlementApi.createIncome(values, settlementContext, session.user.displayName);
    },
    onSuccess: async () => {setSettling(null); notify.success("销售收款已补录", {description: "已关联原销售单，并同步更新收款状态与往来余额。"}); await invalidateErpDomains(queryClient, ["sales", "finance", "customers", "vendors", "state"]);},
    onError: handleMutationError,
  });
  const columns = useMemo(() => createSalesListColumns({showProfit: session.permissions.showProfit, canDelete: session.permissions.canDelete, canReceive, onDetail: openDetail, onDelete: setDeleting, onReceive: setSettling}), [canReceive, openDetail, session.permissions.canDelete, session.permissions.showProfit]);
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
  const quickStatus: QuickStatusItemData[] = [
    {icon: <Truck className="h-4 w-4" />, label: "待出库", value: metricValue(`${selection.summary.pendingOutboundCount} 单`), description: "去扫码出库", tone: selection.summary.pendingOutboundCount ? "warning" : "neutral", action: session.permissions.allowedMenus.includes("all") || session.permissions.allowedMenus.includes("sales_outbound") ? () => void navigate({to: "/sales/outbound"}) : undefined},
  ];

  const filterFields: ErpFilterField[] = [
    {kind: "select", key: "channel", label: "销售渠道", width: "w-36", value: filters.channel, defaultValue: "", options: channelOptions, onChange: (channel) => updateFilters({channel: channel as SalesListFilters["channel"]})},
    {kind: "select", key: "paymentStatus", label: "收款状态", width: "w-36", value: filters.paymentStatus, defaultValue: "", options: paymentOptions, onChange: (paymentStatus) => updateFilters({paymentStatus: paymentStatus as SalesListFilters["paymentStatus"]})},
    {kind: "select", key: "outboundStatus", label: "出库状态", width: "w-36", value: filters.outboundStatus, defaultValue: "", options: outboundOptions, onChange: (outboundStatus) => updateFilters({outboundStatus: outboundStatus as SalesListFilters["outboundStatus"]})},
    {kind: "dateRange", key: "dateRange", label: "销售日期", width: "sm:w-40", value: {startDate: filters.dateStart, endDate: filters.dateEnd}, onChange: ({startDate, endDate}) => updateFilters({dateStart: startDate, dateEnd: endDate})},
  ];
  const table = {
    columns,
    data: selection.data,
    getRowId: (row: SalesListItem) => row.id,
    onRowClick: openDetail,
    mobileRow: "columns" as const,
    mobileFieldOrder: ["customerName", "totalAmount", "paymentStatus", "outboundStatus", "handleBy", "date", "totalCount"],
    mobileFields: 6,
    ariaLabel: "销售单据明细",
    loading: query.isPending,
    fetching: query.isFetching || filterPending,
    error: query.error as Error | null,
    errorTitle: "销售单据加载失败",
    emptyTitle: "暂无销售单据",
    emptyDescription: activeFilterCount ? "当前筛选条件没有匹配的销售单。" : "暂无销售单据。",
    onRetry: () => void query.refetch(),
    manualSorting: true,
    sorting,
    onSortingChange,
    page: selection.meta.page,
    pageSize: selection.meta.pageSize,
    total: selection.meta.total,
    onPageChange: (page: number) => commitFilters({...filters, page}),
    onPageSizeChange: (pageSize: number) => commitFilters({...filters, page: 1, pageSize}),
    enableColumnResizing: true,
    stickyHeader: true,
    mobileShowDetailAction: false,
  };
  return <ErpListPage
    title="销售单据"
    phoneTitle="销售单据"
    subtitle="查看销售客户、成交金额、收款状态和出库进度。"
    countLabel={(count) => count + " 单"}
    loading={query.isPending}
    loadError={Boolean(query.error && !query.data)}
    quickStatus={quickStatus}
    metrics={[
      <MetricCard key="amount" label="销售金额" value={metricValue(formatCurrency(selection.summary.totalAmount))} icon={<ShoppingCart className="h-4 w-4" />} />,
      <MetricCard key="pending-payment" label="待收款" value={metricValue(selection.summary.pendingPaymentCount + " 单")} detail="未收款 / 部分收款" tone={selection.summary.pendingPaymentCount ? "warning" : "neutral"} icon={<Banknote className="h-4 w-4" />} />,
      ...(session.permissions.showProfit ? [<MetricCard key="profit" label="销售利润" value={metricValue(selection.summary.totalProfit === undefined ? "—" : formatCurrency(selection.summary.totalProfit))} icon={<CircleDollarSign className="h-4 w-4" />} />] : []),
    ]}
    search={{value: filters.keyword, onChange: (keyword) => updateFilters({keyword}), label: "搜索销售单据", placeholder: "搜索销售单号、客户、商品、SN 或经办人", phonePlaceholder: "搜索单号、客户、商品、SN"}}
    filters={filterFields}
    onResetFilters={() => commitFilters(defaultSalesListFilters)}
    quickFilters={[
      {label: "全部", active: !filters.paymentStatus && !filters.outboundStatus, onSelect: () => updateFilters({paymentStatus: "", outboundStatus: ""})},
      {label: selection.summary.pendingOutboundCount ? "待出库 (" + selection.summary.pendingOutboundCount + ")" : "待出库", active: filters.outboundStatus === "待出库" && !filters.paymentStatus, onSelect: () => updateFilters({outboundStatus: "待出库", paymentStatus: ""})},
      {label: selection.summary.pendingPaymentCount ? "待收款 (" + selection.summary.pendingPaymentCount + ")" : "待收款", active: filters.paymentStatus === "未收款" && !filters.outboundStatus, onSelect: () => updateFilters({paymentStatus: "未收款", outboundStatus: ""})},
      {label: "已完成", active: filters.outboundStatus === "已出库" && filters.paymentStatus === "已收款", onSelect: () => updateFilters({outboundStatus: "已出库", paymentStatus: "已收款"})},
    ]}
    defaultSortLabel="单据日期"
    primaryAction={canCreate ? {label: "新建销售单", icon: <Plus className="h-4 w-4" />, onClick: onCreate} : undefined}
    onRefresh={onRefresh}
    refreshing={query.isFetching}
    resultsLabel="全部销售单"
    desktopResultsSummary={<span className="flex items-center gap-2"><Filter className="h-4 w-4 text-[var(--erp-color-primary)]" />共 {selection.meta.total} 条</span>}
    desktopTableSection={false}
    tableTitle="销售单据"
    columnSettings={{columns, visibility: columnVisibility, onVisibilityChange: setColumnVisibility, density, onDensityChange: setDensity}}
    table={table}
    overlayOpen={Boolean(detailId || deleting || settling)}
    overlays={<>
      <ErpDetailDrawer open={Boolean(detailId)} onOpenChange={(open) => {if (!open) commitDetail(null);}} modal={false} resizable drawerKey="sales-detail" defaultWidth={900} minWidth={720} maxWidth={1160} title={selectedDetail?.invoiceNo || detailId || "销售单摘要"} description="销售单摘要" footer={selectedDetail ? <SalesDetailActions item={selectedDetail} canReceive={canReceive} canEditHistory={session.permissions.canEditHistory} canDelete={session.permissions.canDelete} onReceive={(item) => {settlementMutation.reset(); setSettling(item);}} onDelete={setDeleting} /> : undefined}>
        {selectedDetail ? <SalesSnapshotDetail item={selectedDetail} showCost={session.permissions.showCost} showProfit={session.permissions.showProfit} /> : detailQuery.isPending || query.isPending ? <ErpLoadingState title="正在定位销售单" description="正在跨页查找完整销售单明细。" /> : detailQuery.error ? <ErpEmptyState title="销售单详情加载失败" description={(detailQuery.error as Error).message} action={<Button type="button" size="sm" variant="secondary" onClick={() => void detailQuery.refetch()}>重试</Button>} /> : <div className="rounded-[var(--erp-radius-md)] bg-[var(--erp-color-warning-soft)] p-4 text-sm text-[var(--erp-color-warning)]">当前未找到该销售单，可能已删除或当前账号无权查看。</div>}
      </ErpDetailDrawer>
      <ErpOutstandingSettlementDialog open={Boolean(settling)} context={settlementContext} accounts={accountsQuery.data?.accounts || []} accountsLoading={accountsQuery.isPending || accountsQuery.isFetching} error={settlementMutation.error instanceof Error ? settlementMutation.error.message : accountsQuery.error instanceof Error ? accountsQuery.error.message : undefined} pending={settlementMutation.isPending} onOpenChange={(open) => {if (!open) {setSettling(null); settlementMutation.reset();}}} onSubmit={(values) => settlementMutation.mutateAsync(values).then(() => undefined)} />
      <ErpDocumentDeleteDialog
        open={Boolean(deleting)}
        title="删除销售单"
        documentName={deleting?.invoiceNo || "当前销售单"}
        description="仅待出库销售单允许删除；删除后会同步恢复关联库存、收款流水和财务记录。"
        pending={deleteMutation.isPending}
        error={deleteMutation.error instanceof Error ? deleteMutation.error.message : undefined}
        onOpenChange={(open) => {if (!open) {setDeleting(null); deleteMutation.reset();}}}
        onConfirm={() => {if (deleting) deleteMutation.mutate(deleting.id);}}
      />
    </>}
  />;
}

export function SalesSnapshotDetail({item, showCost, showProfit}: {item: SalesListItem; showCost: boolean; showProfit: boolean}) {
  const phone = useErpPhone();
  const columns = useMemo<ColumnDef<SalesListLine, unknown>[]>(() => {
    const result: ColumnDef<SalesListLine, unknown>[] = [
      {accessorKey: "productName", header: "商品", size: 220, cell: ({row}) => <div><p className="font-semibold">{row.original.productName}</p><p className="mt-1 erp-data-number text-xs text-[var(--erp-color-text-muted)]">{row.original.sn || "SN 待出库绑定"}</p></div>},
      {accessorKey: "condition", header: "成色", size: 90, cell: ({getValue}) => String(getValue() || "—")},
      {accessorKey: "quantity", header: "数量", size: 70, cell: ({getValue}) => `${Number(getValue() || 0)} 件`},
      {accessorKey: "sellPrice", header: "售价", size: 100, cell: ({getValue}) => <span className="erp-data-number font-semibold">{formatCurrency(Number(getValue() || 0))}</span>},
    ];
    if (showCost) result.push({accessorKey: "costPrice", header: "成本", size: 100, cell: ({getValue}) => getValue() === undefined ? "—" : formatCurrency(Number(getValue()))});
    if (showProfit) result.push({accessorKey: "profit", header: "利润", size: 100, cell: ({getValue}) => <span className="erp-data-number text-[var(--erp-color-success)]">{getValue() === undefined ? "—" : formatCurrency(Number(getValue()))}</span>});
    return result;
  }, [showCost, showProfit]);
  if (phone) return <div className="erp-phone-document" data-phone-detail="document">
    <section data-erp-region="detail-hero"><div className="erp-phone-customer-identity"><ErpEntityThumbnail kind="customer" name={item.customerName || ""} /><div><h2>{item.customerName || "未关联客户"}</h2><p className="erp-phone-detail-status">{item.paymentStatus} · {item.outboundStatus}</p></div></div><div className="erp-detail-hero-amount"><span>销售金额</span><strong className="erp-data-number">{formatCurrency(item.totalAmount)}</strong></div><DetailFact label="下单日期" value={item.date} /><DetailFact label="经办人" value={item.handleBy || "—"} /></section>
    <section><h2>商品明细</h2><ErpDataTable mobileSorting={false} mobileRow={(line) => <div className="erp-phone-line-fact"><div><strong>{line.productName}</strong><small>{line.condition} · {line.quantity} 件 · SN {line.sn || "待出库绑定"}</small>{showCost && line.costPrice !== undefined && <small>成本 {formatCurrency(line.costPrice)}</small>}{showProfit && line.profit !== undefined && <small>利润 {formatCurrency(line.profit)}</small>}</div><span className="erp-data-number">{formatCurrency(line.sellPrice)}</span></div>} ariaLabel="销售单商品明细" columns={columns} data={item.lines} getRowId={(line) => line.id} surface="plain" emptyTitle="该销售单没有商品明细" /></section>
    <section><h2>结算</h2><DetailFact label="销售金额" value={formatCurrency(item.totalAmount)} /><DetailFact label="已收款" value={formatCurrency(item.paidAmount)} /><DetailFact label="未收款" value={formatCurrency(item.unpaidAmount)} />{showProfit && item.totalProfit !== undefined && <DetailFact label="销售利润" value={formatCurrency(item.totalProfit)} />}</section>
    <details><summary>物流与补充信息</summary><DetailFact label="联系方式" value={item.contact || "—"} /><DetailFact label="渠道" value={item.channel} /><DetailFact label="物流" value={item.freeShipping ? "客户自提 / 无需物流" : [item.expressCompany, item.expressNo].filter(Boolean).join(" · ") || "未填写"} /><DetailFact label="需要发票" value={item.needInvoice ? "是" : "否"} /><DetailFact label="售后条款" value={item.aftersalesTerms || "—"} /><DetailFact label="备注" value={item.remarks || "—"} /></details>
  </div>;
  return <div className="space-y-5" data-phone-detail="document">
    <div className="grid gap-3 sm:grid-cols-2"><DetailFact label="客户" value={item.customerName || "—"} /><DetailFact label="联系方式" value={item.contact || "—"} /><DetailFact label="渠道" value={item.channel} /><DetailFact label="经办人" value={item.handleBy || "—"} /><DetailFact label="销售金额" value={formatCurrency(item.totalAmount)} /><DetailFact label="销售利润" value={showProfit && item.totalProfit !== undefined ? formatCurrency(item.totalProfit) : "无权查看"} /><DetailFact label="收款状态" value={`${item.paymentStatus} · 已收 ${formatCurrency(item.paidAmount)} · 未收 ${formatCurrency(item.unpaidAmount)}`} /><DetailFact label="出库状态" value={`${item.outboundStatus}${item.outboundTime ? ` · ${item.outboundTime}` : ""}`} /></div>
    <Card><CardContent className="p-4"><div className="grid gap-3 sm:grid-cols-2"><DetailFact label="物流" value={item.freeShipping ? "客户自提 / 无需物流" : [item.expressCompany, item.expressNo].filter(Boolean).join(" · ") || "未填写"} /><DetailFact label="需要发票" value={item.needInvoice ? "是" : "否"} /><DetailFact label="售后条款" value={item.aftersalesTerms || "—"} /><DetailFact label="备注" value={item.remarks || "—"} /></div></CardContent></Card>
    <div><h3 className="mb-3 text-sm font-semibold">商品明细</h3><ErpDataTable mobileRow={(line) => <div className="erp-phone-line-fact"><div><strong>{line.productName}</strong><small>{line.condition} · {line.quantity} 件 · SN {line.sn || "待出库绑定"}</small></div><span className="erp-data-number">{formatCurrency(line.sellPrice)}</span></div>} ariaLabel="销售单商品明细" columns={columns} data={item.lines} getRowId={(line) => line.id} density="compact" stickyHeader emptyTitle="该销售单没有商品明细" /></div>
  </div>;
}

const DetailFact = ErpDetailFact;

function MetricCard({label, value, detail, icon, tone = "neutral"}: {label: string; value: string; detail?: string; icon: ReactNode; tone?: "neutral" | "warning"}) {
  return <ErpMetricCard label={label} value={value} detail={detail} icon={icon} tone={tone === "warning" ? "warning" : "info"} />;
}
