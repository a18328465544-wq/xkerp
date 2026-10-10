import {displayQueryValue} from "@/src/utils/queryDisplay";
import {useDebouncedValue} from "@/src/hooks/useDebouncedValue";
import {keepPreviousData, useMutation, useQuery, useQueryClient} from "@tanstack/react-query";
import {useNavigate} from "@tanstack/react-router";
import type {SortingState, VisibilityState} from "@tanstack/react-table";
import {CircleDollarSign, ClipboardList, Filter, Plus} from "lucide-react";
import {useMemo, useState, type ReactNode} from "react";
import {notify} from "@/src/utils/notification";
import {Card} from "@/src/components/ui";
import {ErpDocumentDeleteDialog, ErpListPage, ErpLoadingState, ErpMetricCard, ErpOutstandingSettlementDialog, ErpPageError, type ErpFilterField, type QuickStatusItemData} from "@/src/components/common";
import {ApiError, financeAccountsApi, financeSettlementApi, purchaseApi, queryKeys} from "@/src/services/api";
import {invalidateErpDomains} from "@/src/services/api";
import {createCapabilities, useAuth} from "@/src/app/auth";
import {useTablePreferences} from "@/src/hooks/useTablePreferences";
import {useUrlSearchState} from "@/src/hooks/useUrlSearchState";
import {useWorkspaceTabActivity} from "@/src/hooks/useWorkspaceTabRuntime";
import type {AuthSession} from "@/src/services/api";
import type {LinkedSettlementContext} from "@/src/types/finance-settlement";
import {formatCurrency} from "@/src/lib/format";
import {isPersonalPurchaseSource} from "@/src/utils/purchaseSources";
import {purchasePaymentStatusValues} from "@/src/types/purchase";
import type {PurchaseListFilters, PurchaseListItem, PurchaseListSortKey} from "@/src/types/purchase";
import {sourceTypeValues} from "@/src/types/core";
import {createPurchaseListColumns} from "../purchase.columns";
import {countActivePurchaseListFilters, defaultPurchaseListFilters, parsePurchaseListFilters, purchaseListFiltersToSearch, selectPurchaseList} from "../purchase.filters";

const permissionDefaults = {showCost: false, showProfit: false, canDelete: false, canEditHistory: false, allowedMenus: [] as string[]};
const emptyVisibility: VisibilityState = {sourceType: false, inventoryCount: false, estTotalSell: false, estTotalProfit: false, handleBy: false};
const sourceOptions = [
  {value: "", label: "全部采购来源"},
  ...sourceTypeValues.map((value) => ({value, label: value})),
];
const paymentOptions = [
  {value: "", label: "全部付款状态"},
  ...purchasePaymentStatusValues.map((value) => ({value, label: value})),
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
  const {active} = useWorkspaceTabActivity();
  const navigate = useNavigate();
  const {session, logout} = useAuth();
  const {filters, commitFilters} = usePurchaseListUrlState();
  const keyword = useDebouncedValue(filters.keyword, 300);
  const requestFilters = {...filters, keyword};
  const permissions = session?.permissions || permissionDefaults;
  const allowed = createCapabilities(session).menu("purchase_list");
  const listQuery = useQuery({
    queryKey: queryKeys.purchase.list({userId: session?.user.id || "anonymous", showCost: permissions.showCost, showProfit: permissions.showProfit}, requestFilters),
    queryFn: ({signal}) => purchaseApi.list(requestFilters, {showCost: permissions.showCost, showProfit: permissions.showProfit}, signal),
    enabled: active && Boolean(session && allowed) && keyword === filters.keyword,
    placeholderData: keepPreviousData,
    retry: false,
  });

  if (!session) return <Card><ErpLoadingState title="正在验证登录状态" /></Card>;
  if (!session || !allowed) return <ErpPageError title="当前账号没有采购单据权限" description="当前账号没有此页面的访问权限，请联系管理员开通。" />;

  const openDetail = (item: PurchaseListItem) => void navigate({to: "/purchase/$purchaseId", params: {purchaseId: item.id}});
  return <PurchaseListContent
    filters={filters}
    commitFilters={commitFilters}
    session={session}
    query={listQuery}
    filterPending={keyword !== filters.keyword}
    onDetail={openDetail}
    onCreate={() => void navigate({to: "/purchase/new"})}
    onRefresh={() => void listQuery.refetch()}
    onAuthExpired={logout}
  />;
}

function PurchaseListContent({filters, commitFilters, session, query, filterPending, onDetail, onCreate, onRefresh, onAuthExpired}: {
  filters: PurchaseListFilters;
  commitFilters: (filters: PurchaseListFilters) => void;
  session: AuthSession;
  filterPending: boolean;
  query: ReturnType<typeof useQuery<Awaited<ReturnType<typeof purchaseApi.list>>>>;
  onDetail: (item: PurchaseListItem) => void;
  onCreate: () => void;
  onRefresh: () => void;
  onAuthExpired: () => void;
}) {
  const {active} = useWorkspaceTabActivity();
  const queryClient = useQueryClient();
  const [deleting, setDeleting] = useState<PurchaseListItem | null>(null);
  const [settling, setSettling] = useState<PurchaseListItem | null>(null);
  const {columnVisibility, setColumnVisibility, density, setDensity} = useTablePreferences<VisibilityState>({feature: "purchase-list", userId: session.user.id, defaultVisibility: emptyVisibility});
  const selection = useMemo(() => query.data?.selection || selectPurchaseList(query.data?.items || [], filters), [filters, query.data]);
  const metricValue = (value: string | number) => displayQueryValue(query, value, filterPending);
  const invalidate = () => invalidateErpDomains(queryClient, ["purchase", "inventory", "finance", "customers", "crm", "state"]);
  const handleMutationError = (error: Error) => {if (error instanceof ApiError && error.isUnauthorized) {onAuthExpired(); return;} notify.error(error.message);};
  const deleteMutation = useMutation({mutationFn: (id: string) => purchaseApi.remove(id), onSuccess: async (result, id) => {setDeleting(null); notify.success(`采购单 ${result.invoice.invoiceNo || id} 已删除`, {description: "待检测库存、付款流水和财务关联已同步清理。"}); await invalidate();}, onError: handleMutationError});
  const canPay = createCapabilities(session).menu("payment_out") && createCapabilities(session).menu("settlement_accounts");
  const accountsQuery = useQuery({queryKey: queryKeys.finance.accounts(), queryFn: ({signal}) => financeAccountsApi.listAll(signal), enabled: active && Boolean(canPay), staleTime: 60_000, retry: false});
  const settlementContext: LinkedSettlementContext | null = settling && (settling.unpaidAmount || 0) > 0 ? {kind: "expense", relatedDocType: "采购单", relatedDocNo: settling.invoiceNo || settling.id, partyName: settling.supplierName, partyId: settling.sourcePartnerId, partnerType: settling.sourcePartnerType || (isPersonalPurchaseSource(settling.sourceType) ? "customer" : "vendor"), defaultAccountId: settling.settlementAccountId, remainingAmount: settling.unpaidAmount || 0} : null;
  const settlementMutation = useMutation({
    mutationFn: (values: Parameters<typeof financeSettlementApi.createExpense>[0]) => {
      if (!settlementContext) throw new Error("采购单未处于待付款状态");
      return financeSettlementApi.createExpense(values, settlementContext, session.user.displayName);
    },
    onSuccess: async () => {setSettling(null); notify.success("采购付款已补录", {description: "已关联原采购单，并同步更新付款状态与往来余额。"}); await invalidateErpDomains(queryClient, ["purchase", "finance", "vendors", "customers", "state"]);},
    onError: handleMutationError,
  });
  const columns = useMemo(() => createPurchaseListColumns({showCost: session.permissions.showCost, showProfit: session.permissions.showProfit, canDelete: session.permissions.canDelete, canPay, onDetail, onDelete: setDeleting, onPay: setSettling}), [canPay, onDetail, session.permissions.canDelete, session.permissions.showCost, session.permissions.showProfit]);
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
    {icon: <CircleDollarSign className="h-4 w-4" />, label: "待付款单", value: metricValue(`${selection.summary.pendingPaymentCount} 单`), description: "未付款与部分付款", tone: selection.summary.pendingPaymentCount ? "warning" : "neutral"},
  ];

  const filterFields: ErpFilterField[] = [
    {kind: "select", key: "sourceType", label: "采购来源", width: "w-36", value: filters.sourceType, defaultValue: "", options: sourceOptions, onChange: (sourceType) => updateFilters({sourceType: sourceType as PurchaseListFilters["sourceType"]})},
    {kind: "select", key: "paymentStatus", label: "付款状态", width: "w-36", value: filters.paymentStatus, defaultValue: "", options: paymentOptions, onChange: (paymentStatus) => updateFilters({paymentStatus: paymentStatus as PurchaseListFilters["paymentStatus"]})},
    {kind: "dateRange", key: "dateRange", label: "采购日期", width: "sm:w-40", value: {startDate: filters.dateStart, endDate: filters.dateEnd}, onChange: ({startDate, endDate}) => updateFilters({dateStart: startDate, dateEnd: endDate})},
  ];
  const table = {
    columns,
    data: selection.data,
    getRowId: (row: PurchaseListItem) => row.id,
    onRowClick: onDetail,
    mobileRow: "columns" as const,
    mobileFieldOrder: ["supplierName", "paymentStatus", "totalCost", "handleBy", "date", "totalCount"],
    mobileFields: 6,
    ariaLabel: "采购单据明细",
    loading: query.isPending,
    fetching: query.isFetching || filterPending,
    error: query.error as Error | null,
    errorTitle: "采购单据加载失败",
    emptyTitle: "暂无采购单据",
    emptyDescription: activeFilterCount ? "当前筛选条件没有匹配的采购单。" : "暂无采购单据。",
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
    title="采购单据"
    phoneTitle="采购单据"
    subtitle="查看采购来源、商品数量、付款状态与已生成库存；具备历史编辑权限时，可在详情页按业务阶段修改。"
    countLabel={(count) => `${count} 单`}
    loading={query.isPending}
    loadError={Boolean(query.error && !query.data)}
    quickStatus={quickStatus}
    metrics={[
      <MetricCard key="count" label="采购单数" value={metricValue(`${selection.summary.orderCount} 单`)} icon={<ClipboardList className="h-4 w-4" />} />,
      ...(session.permissions.showCost ? [<MetricCard key="cost" label="采购总额" value={metricValue(selection.summary.totalCost !== undefined ? formatCurrency(selection.summary.totalCost) : "—")} icon={<CircleDollarSign className="h-4 w-4" />} />] : []),
      ...(session.permissions.showCost && session.permissions.showProfit ? [<MetricCard key="profit" label="预计利润" value={metricValue(selection.summary.estimatedProfit === undefined ? "—" : formatCurrency(selection.summary.estimatedProfit))} icon={<CircleDollarSign className="h-4 w-4" />} />] : []),
    ]}
    search={{value: filters.keyword, onChange: (keyword) => updateFilters({keyword}), label: "搜索采购单据", placeholder: "搜索采购单号、来源、商品或经办人", phonePlaceholder: "搜索单号、来源、商品"}}
    filters={filterFields}
    onResetFilters={() => commitFilters(defaultPurchaseListFilters)}
    quickFilters={[
      {label: "全部", active: !filters.paymentStatus && !filters.sourceType, onSelect: () => commitFilters({...filters, paymentStatus: "", sourceType: "", page: 1})},
      {label: selection.summary.pendingPaymentCount > 0 ? "待付款 (" + selection.summary.pendingPaymentCount + ")" : "待付款", active: filters.paymentStatus === "未付款" && !filters.sourceType, onSelect: () => commitFilters({...filters, paymentStatus: "未付款", sourceType: "", page: 1})},
      {label: "个人回收", active: filters.sourceType === "个人回收", onSelect: () => commitFilters({...filters, sourceType: "个人回收", paymentStatus: "", page: 1})},
      {label: "同行拿货", active: filters.sourceType === "同行拿货", onSelect: () => commitFilters({...filters, sourceType: "同行拿货", paymentStatus: "", page: 1})},
    ]}
    defaultSortLabel="单据日期"
    primaryAction={canCreate ? {label: "新建采购单", icon: <Plus className="h-4 w-4" />, onClick: onCreate} : undefined}
    onRefresh={onRefresh}
    refreshing={query.isFetching}
    resultsLabel="全部采购单"
    desktopResultsSummary={<span className="flex items-center gap-2"><Filter className="h-4 w-4 text-[var(--erp-color-primary)]" />共 {selection.meta.total} 条</span>}
    desktopTableSection={false}
    tableTitle="采购单据"
    columnSettings={{columns, visibility: columnVisibility, onVisibilityChange: setColumnVisibility, density, onDensityChange: setDensity}}
    table={table}
    overlayOpen={Boolean(deleting || settling)}
    overlays={<>
      <ErpDocumentDeleteDialog
        open={Boolean(deleting)}
        title="删除采购单"
        documentName={deleting?.invoiceNo || "当前采购单"}
        description="仅尚未入库且未开始检测的采购单允许删除；删除会同时清理待检测库存、付款流水和财务关联。"
        pending={deleteMutation.isPending}
        error={deleteMutation.error instanceof Error ? deleteMutation.error.message : undefined}
        onOpenChange={(open) => {if (!open) {setDeleting(null); deleteMutation.reset();}}}
        onConfirm={() => {if (deleting) deleteMutation.mutate(deleting.id);}}
      />
      <ErpOutstandingSettlementDialog
        open={Boolean(settling)}
        context={settlementContext}
        accounts={accountsQuery.data?.accounts || []}
        accountsLoading={accountsQuery.isPending || accountsQuery.isFetching}
        error={settlementMutation.error instanceof Error ? settlementMutation.error.message : accountsQuery.error instanceof Error ? accountsQuery.error.message : undefined}
        pending={settlementMutation.isPending}
        onOpenChange={(open) => {if (!open) {setSettling(null); settlementMutation.reset();}}}
        onSubmit={(values) => settlementMutation.mutateAsync(values).then(() => undefined)}
      />
    </>}
  />;
}

function MetricCard({label, value, detail, icon, tone = "neutral"}: {label: string; value: string; detail?: string; icon: ReactNode; tone?: "neutral" | "warning"}) {
  return <ErpMetricCard label={label} value={value} detail={detail} icon={icon} tone={tone === "warning" ? "warning" : "info"} />;
}
