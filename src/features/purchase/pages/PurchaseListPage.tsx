import {keepPreviousData, useQuery} from "@tanstack/react-query";
import {useNavigate} from "@tanstack/react-router";
import type {SortingState, VisibilityState} from "@tanstack/react-table";
import {CircleDollarSign, ClipboardList, Filter, ListFilter, LockKeyhole, PackageCheck, Plus, RefreshCw, RotateCcw, Search} from "lucide-react";
import {useMemo, type ReactNode} from "react";
import {Button, Card, CardContent, Input, Select} from "@/src/components/ui";
import {ErpColumnVisibilityMenu, ErpDataTable, ErpDateRangePicker, ErpFilterBar, ErpListPageFrame, ErpLoadingState, ErpPageContent, ErpPageError, ErpPageHeader, ErpPageToolbar, MetricsRegion, type QuickStatusItemData} from "@/src/components/common";
import {purchaseApi, queryKeys} from "@/src/services/api";
import {createCapabilities, useAuth} from "@/src/app/auth";
import {useTablePreferences} from "@/src/hooks/useTablePreferences";
import {useUrlSearchState} from "@/src/hooks/useUrlSearchState";
import type {AuthSession} from "@/src/services/api";
import {formatCurrency} from "@/src/lib/format";
import type {PurchaseListFilters, PurchaseListItem, PurchaseListSortKey} from "@/src/types/purchase";
import {createPurchaseListColumns} from "../purchase.columns";
import {countActivePurchaseListFilters, defaultPurchaseListFilters, parsePurchaseListFilters, purchaseListFiltersToSearch, selectPurchaseList} from "../purchase.filters";

const permissionDefaults = {showCost: false, showProfit: false, canDelete: false, canEditHistory: false, allowedMenus: [] as string[]};
const emptyVisibility: VisibilityState = {};
const sourceOptions = [
  {value: "", label: "全部采购来源"},
  ...["个人回收", "同行拿货", "批量采购", "客户置换", "门店自采", "门市自采"].map((value) => ({value, label: value})),
];
const paymentOptions = [
  {value: "", label: "全部付款状态"},
  ...["未付款", "部分付款", "已付款", "已退款"].map((value) => ({value, label: value})),
];

function usePurchaseListUrlState() {
  const {value: filters, commit: commitFilters} = useUrlSearchState({
    defaultValue: defaultPurchaseListFilters,
    parse: parsePurchaseListFilters,
    serialize: purchaseListFiltersToSearch,
  });
  return {filters, commitFilters};
}

export function PurchaseListPage() {
  const navigate = useNavigate();
  const {session} = useAuth();
  const {filters, commitFilters} = usePurchaseListUrlState();
  const permissions = session?.permissions || permissionDefaults;
  const allowed = createCapabilities(session).menu("purchase_list");
  const listQuery = useQuery({
    queryKey: queryKeys.purchase.list({userId: session?.user.id || "anonymous", showCost: permissions.showCost, showProfit: permissions.showProfit}, filters),
    queryFn: ({signal}) => purchaseApi.list(filters, {showCost: permissions.showCost, showProfit: permissions.showProfit}, signal),
    enabled: Boolean(session && allowed),
    placeholderData: keepPreviousData,
    retry: false,
  });

  if (!session) return <Card><ErpLoadingState title="正在验证登录状态" /></Card>;
  if (!session || !allowed) return <ErpPageError title="当前账号没有采购单据权限" description="服务器已拒绝 purchase_list 菜单访问，请联系管理员授权。" />;

  const openDetail = (item: PurchaseListItem) => void navigate({to: "/purchase/$purchaseId", params: {purchaseId: item.id}});
  return <PurchaseListContent
    filters={filters}
    commitFilters={commitFilters}
    session={session}
    query={listQuery}
    onDetail={openDetail}
    onCreate={() => void navigate({to: "/purchase/new"})}
    onRefresh={() => void listQuery.refetch()}
  />;
}

function PurchaseListContent({filters, commitFilters, session, query, onDetail, onCreate, onRefresh}: {
  filters: PurchaseListFilters;
  commitFilters: (filters: PurchaseListFilters) => void;
  session: AuthSession;
  query: ReturnType<typeof useQuery<Awaited<ReturnType<typeof purchaseApi.list>>>>;
  onDetail: (item: PurchaseListItem) => void;
  onCreate: () => void;
  onRefresh: () => void;
}) {
  const {columnVisibility, setColumnVisibility, density, setDensity} = useTablePreferences<VisibilityState>({feature: "purchase-list", userId: session.user.id, defaultVisibility: emptyVisibility});
  const selection = useMemo(() => query.data?.selection || selectPurchaseList(query.data?.items || [], filters), [filters, query.data]);
  const columns = useMemo(() => createPurchaseListColumns({showCost: session.permissions.showCost, showProfit: session.permissions.showProfit, onDetail}), [onDetail, session.permissions.showCost, session.permissions.showProfit]);
  const activeFilterCount = countActivePurchaseListFilters(filters);
  const canCreate = createCapabilities(session).menu("purchase_add");
  const sorting: SortingState = [{id: filters.sortKey, desc: filters.sortDirection === "desc"}];
  const sortableColumns = new Set<PurchaseListSortKey>(["date", "invoiceNo", "supplierName", "totalCount", "totalCost", "paymentStatus", "handleBy"]);
  const onSortingChange = (updater: SortingState | ((old: SortingState) => SortingState)) => {
    const next = typeof updater === "function" ? updater(sorting) : updater;
    const first = next[0];
    const candidate = first?.id as PurchaseListSortKey | undefined;
    const sortKey = candidate && sortableColumns.has(candidate) ? candidate : "date";
    commitFilters({...filters, sortKey, sortDirection: first?.desc ? "desc" : "asc", page: 1});
  };
  const updateFilters = (patch: Partial<PurchaseListFilters>) => commitFilters({...filters, ...patch, page: 1});
  const quickStatus: QuickStatusItemData[] = [
    {icon: <ListFilter className="h-4 w-4" />, label: "筛选状态", value: activeFilterCount ? `${activeFilterCount} 项` : "全部", description: "已同步到当前 URL", tone: activeFilterCount ? "info" : "neutral"},
    {icon: <CircleDollarSign className="h-4 w-4" />, label: "待付款单", value: `${selection.summary.pendingPaymentCount} 单`, description: "未付款与部分付款", tone: selection.summary.pendingPaymentCount ? "warning" : "success"},
    {icon: <LockKeyhole className="h-4 w-4" />, label: "成本权限", value: session.permissions.showCost ? "可查看" : "已隐藏", description: "按账号权限裁剪", tone: session.permissions.showCost ? "success" : "neutral"},
  ];

  return <ErpListPageFrame>
    <ErpPageHeader
      title="采购单据"
      subtitle="查看采购来源、商品数量、付款状态与已生成库存；具备历史编辑权限时，可在详情页按业务阶段修改。"
      quickStatus={quickStatus}
      actions={<><Button type="button" size="sm" variant="secondary" onClick={onRefresh} disabled={query.isFetching}><RefreshCw className={`h-4 w-4 ${query.isFetching ? "animate-spin" : ""}`} />刷新</Button>{canCreate && <Button type="button" size="sm" variant="primary" onClick={onCreate}><Plus className="h-4 w-4" />新建采购单</Button>}</>}
    />

    <MetricsRegion>
      <MetricCard label="采购单数" value={`${selection.summary.orderCount} 单`} detail="按当前筛选" icon={<ClipboardList className="h-4 w-4" />} />
      <MetricCard label="采购件数" value={`${selection.summary.unitCount} 件`} detail="采购单实物数量" icon={<PackageCheck className="h-4 w-4" />} />
      <MetricCard label="待付款" value={`${selection.summary.pendingPaymentCount} 单`} detail="未付款 / 部分付款" tone={selection.summary.pendingPaymentCount ? "warning" : "neutral"} icon={<CircleDollarSign className="h-4 w-4" />} />
      <MetricCard label="采购总额" value={session.permissions.showCost && selection.summary.totalCost !== undefined ? formatCurrency(selection.summary.totalCost) : "无权查看"} detail={session.permissions.showCost ? "当前筛选汇总" : "成本字段已裁剪"} icon={<LockKeyhole className="h-4 w-4" />} />
      {session.permissions.showCost && session.permissions.showProfit && <MetricCard label="预计利润" value={selection.summary.estimatedProfit === undefined ? "—" : formatCurrency(selection.summary.estimatedProfit)} detail="当前筛选汇总" icon={<CircleDollarSign className="h-4 w-4" />} />}
    </MetricsRegion>

    <ErpPageToolbar><ErpFilterBar actions={<Button type="button" variant="ghost" size="sm" onClick={() => commitFilters(defaultPurchaseListFilters)}><RotateCcw className="h-4 w-4" />重置筛选</Button>}>
      <div className="relative min-w-[260px] flex-1"><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--erp-color-text-muted)]" /><Input className="pl-9" value={filters.keyword} onChange={(event) => updateFilters({keyword: event.target.value})} placeholder="搜索采购单号、来源、商品或经办人" aria-label="搜索采购单据" /></div>
      <Select className="w-36" value={filters.sourceType} options={sourceOptions} onValueChange={(value) => updateFilters({sourceType: value as PurchaseListFilters["sourceType"]})} aria-label="采购来源筛选" />
      <Select className="w-36" value={filters.paymentStatus} options={paymentOptions} onValueChange={(value) => updateFilters({paymentStatus: value as PurchaseListFilters["paymentStatus"]})} aria-label="付款状态筛选" />
      <ErpDateRangePicker value={{startDate: filters.dateStart, endDate: filters.dateEnd}} onChange={({startDate, endDate}) => updateFilters({dateStart: startDate, dateEnd: endDate})} fieldClassName="sm:w-36" startAriaLabel="采购开始日期" endAriaLabel="采购结束日期" ariaLabel="采购日期范围" />
    </ErpFilterBar></ErpPageToolbar>

    <ErpPageContent className="space-y-[var(--erp-page-gap)]">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex items-center gap-2 text-xs text-[var(--erp-color-text-secondary)]"><Filter className="h-4 w-4 text-[var(--erp-color-primary)]" /><span>共 {selection.meta.total} 条</span></div>
      <div className="flex items-center gap-2">
        <ErpColumnVisibilityMenu columns={columns} visibility={columnVisibility} onVisibilityChange={setColumnVisibility} />
        <div className="inline-flex rounded-[var(--erp-radius-md)] border border-[var(--erp-color-border)] bg-[var(--erp-color-surface)] p-0.5"><Button type="button" size="sm" variant={density === "comfortable" ? "secondary" : "ghost"} onClick={() => setDensity("comfortable")}>舒适</Button><Button type="button" size="sm" variant={density === "compact" ? "secondary" : "ghost"} onClick={() => setDensity("compact")}>紧凑</Button></div>
      </div>
    </div>

    <ErpDataTable
      columns={columns}
      data={selection.data}
      getRowId={(row) => row.id}
      loading={query.isPending}
      fetching={query.isFetching}
      error={query.error as Error | null}
      errorTitle="采购单据加载失败"
      emptyTitle="暂无采购单据"
      emptyDescription={activeFilterCount ? "当前筛选条件没有匹配的采购单。" : "服务器当前没有返回采购单据。"}
      onRetry={() => void query.refetch()}
      onRowClick={onDetail}
      manualSorting
      sorting={sorting}
      onSortingChange={onSortingChange}
      page={selection.meta.page}
      pageSize={selection.meta.pageSize}
      total={selection.meta.total}
      onPageChange={(page) => commitFilters({...filters, page})}
      onPageSizeChange={(pageSize) => commitFilters({...filters, page: 1, pageSize})}
      columnVisibility={columnVisibility}
      onColumnVisibilityChange={setColumnVisibility}
      enableColumnResizing
      density={density}
      stickyHeader
    />
    </ErpPageContent>
  </ErpListPageFrame>;
}

function MetricCard({label, value, detail, icon, tone = "neutral"}: {label: string; value: string; detail: string; icon: ReactNode; tone?: "neutral" | "warning"}) {
  return <Card><CardContent className="min-h-[104px] p-4"><div className="flex items-center justify-between gap-3"><p className="text-xs font-semibold text-[var(--erp-color-text-secondary)]">{label}</p><span className={tone === "warning" ? "text-[var(--erp-color-warning)]" : "text-[var(--erp-color-primary)]"}>{icon}</span></div><p className={`mt-2 font-mono text-2xl font-bold ${tone === "warning" ? "text-[var(--erp-color-warning)]" : "text-[var(--erp-color-text)]"}`}>{value}</p><p className="mt-1 text-xs text-[var(--erp-color-text-muted)]">{detail}</p></CardContent></Card>;
}
