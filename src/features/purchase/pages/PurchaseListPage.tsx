import {displayQueryValue} from "@/src/utils/queryDisplay";
import {useDebouncedValue} from "@/src/hooks/useDebouncedValue";
import {keepPreviousData, useMutation, useQuery, useQueryClient} from "@tanstack/react-query";
import {useNavigate} from "@tanstack/react-router";
import type {SortingState, VisibilityState} from "@tanstack/react-table";
import {ArrowDown, ArrowUp, ChevronDown, CircleDollarSign, ClipboardList, Filter, Plus, RefreshCw, RotateCcw, SlidersHorizontal} from "lucide-react";
import {ErpDialogShell, ErpMobileActionDock, ErpSearchInput, ErpStatusBadge} from "@/src/components/common";
import {useMemo, useState, type ReactNode} from "react";
import {notify} from "@/src/utils/notification";
import {Button, Card, Select} from "@/src/components/ui";
import {ErpMobileRecordRow} from "@/src/components/common/ErpMobileRecordRow";
import {ErpMobileSummary, ErpColumnVisibilityMenu, ErpDataTable, ErpDateRangePicker, ErpDocumentDeleteDialog, ErpFilterBar, ErpListPageFrame, ErpLoadingState, ErpMetricCard, ErpOutstandingSettlementDialog, ErpPageContent, ErpPageError, ErpPageHeader, ErpPageToolbar, ErpTableResultsBar, MetricsRegion, type QuickStatusItemData} from "@/src/components/common";
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
import {useErpPhone} from "@/src/hooks/useErpViewport";
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
  const phone = useErpPhone();
  const queryClient = useQueryClient();
  const [phoneFiltersOpen, setPhoneFiltersOpen] = useState(false);
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

  const phoneSearch = (
    <ErpSearchInput
      className={phone ? "w-full" : "min-w-[260px] flex-1"}
      value={filters.keyword}
      onChange={(event) => updateFilters({keyword: event.target.value})}
      placeholder={phone ? "搜索单号、来源、商品" : "搜索采购单号、来源、商品或经办人"}
      aria-label="搜索采购单据"
    />
  );

  const purchaseTable = (
    <ErpDataTable
      surface={phone ? "plain" : "card"}
      mobilePagination="compact"
      mobileToolbar={({openSorting, sortLabel, descending}) => (
        <div className="erp-customer-list-toolbar">
          <div className="erp-customer-quick-filters" role="group" aria-label="快捷状态筛选">
            <Button
              type="button"
              variant={!filters.paymentStatus && !filters.sourceType ? "primary" : "ghost"}
              aria-pressed={!filters.paymentStatus && !filters.sourceType}
              onClick={() => commitFilters({...filters, paymentStatus: "", sourceType: "", page: 1})}
            >
              全部
            </Button>
            <Button
              type="button"
              variant={filters.paymentStatus === "未付款" && !filters.sourceType ? "primary" : "ghost"}
              aria-pressed={filters.paymentStatus === "未付款" && !filters.sourceType}
              onClick={() => commitFilters({...filters, paymentStatus: "未付款", sourceType: "", page: 1})}
            >
              待付款{selection.summary.pendingPaymentCount > 0 ? ` (${selection.summary.pendingPaymentCount})` : ""}
            </Button>
            <Button
              type="button"
              variant={filters.sourceType === "个人回收" ? "primary" : "ghost"}
              aria-pressed={filters.sourceType === "个人回收"}
              onClick={() => commitFilters({...filters, sourceType: "个人回收", paymentStatus: "", page: 1})}
            >
              个人回收
            </Button>
            <Button
              type="button"
              variant={filters.sourceType === "同行拿货" ? "primary" : "ghost"}
              aria-pressed={filters.sourceType === "同行拿货"}
              onClick={() => commitFilters({...filters, sourceType: "同行拿货", paymentStatus: "", page: 1})}
            >
              同行拿货
            </Button>
          </div>
          <Button
            type="button"
            variant="ghost"
            className="erp-customer-sort"
            aria-label="采购单排序"
            onClick={openSorting}
          >
            <span>{sortLabel || "单据日期"}</span>
            {descending === undefined ? <ChevronDown className="h-4 w-4" /> : descending ? <ArrowDown className="h-4 w-4" /> : <ArrowUp className="h-4 w-4" />}
          </Button>
        </div>
      )}
      mobileRow={(item) => {
        const isPendingPayment = item.paymentStatus === "未付款" || item.paymentStatus === "部分付款";
        const badgeTone = isPendingPayment ? "warning" : item.paymentStatus === "已付款" ? "success" : "neutral";
        return (
          <ErpMobileRecordRow
            title={item.invoiceNo}
            titleMono
            subtitle={item.supplierName}
            meta={`${item.totalCount} 件 · ${item.date}${item.handleBy ? ` · ${item.handleBy}` : ""}`}
            amount={item.totalCost !== undefined ? formatCurrency(item.totalCost) : undefined}
            status={<ErpStatusBadge label={item.paymentStatus} tone={badgeTone} />}
            onOpen={() => onDetail(item)}
          />
        );
      }}
      columns={columns}
      data={selection.data}
      mobileFieldOrder={["supplierName","paymentStatus","totalCost","handleBy","date","totalCount"]}
      mobileFields={6}
      ariaLabel="采购单据明细"
      getRowId={(row) => row.id}
      loading={query.isPending}
      fetching={query.isFetching || filterPending}
      error={query.error as Error | null}
      errorTitle="采购单据加载失败"
      emptyTitle="暂无采购单据"
      emptyDescription={activeFilterCount ? "当前筛选条件没有匹配的采购单。" : "暂无采购单据。"}
      onRetry={() => void query.refetch()}
      onRowClick={onDetail}
      mobileShowDetailAction={false}
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
  );

  return <ErpListPageFrame data-phone-layout={phone ? "thumb" : undefined} mobileSearchFirst={!phone}>
    <ErpPageHeader
      title={phone ? (
        <span className="erp-customer-phone-title">
          采购单据<small>{query.isPending ? "正在加载…" : query.error && !query.data ? "加载失败" : `${selection.meta.total} 单`}</small>
        </span>
      ) : "采购单据"}
      subtitle="查看采购来源、商品数量、付款状态与已生成库存；具备历史编辑权限时，可在详情页按业务阶段修改。"
      quickStatus={quickStatus}
      actions={phone ? (
        <Button
          type="button"
          variant="secondary"
          onClick={() => setPhoneFiltersOpen(true)}
          aria-label="采购筛选与操作"
        >
          <SlidersHorizontal className="h-5 w-5" />
          筛选{activeFilterCount > 0 && <span className="tabular-nums">{activeFilterCount}</span>}
        </Button>
      ) : (
        <>
          <Button type="button" size="sm" variant="secondary" onClick={onRefresh} disabled={query.isFetching}>
            <RefreshCw className={`h-4 w-4 ${query.isFetching ? "animate-spin" : ""}`} />刷新
          </Button>
          {canCreate && (
            <Button type="button" size="sm" variant="primary" onClick={onCreate}>
              <Plus className="h-4 w-4" />新建采购单
            </Button>
          )}
        </>
      )}
    />

    {!phone && <>
      <ErpMobileSummary label="采购统计" summary={metricValue(`${selection.summary.orderCount} 单 · 待付款 ${selection.summary.pendingPaymentCount}`)}><MetricsRegion>
        <MetricCard label="采购单数" value={metricValue(`${selection.summary.orderCount} 单`)} icon={<ClipboardList className="h-4 w-4" />} />
        {session.permissions.showCost && <MetricCard label="采购总额" value={metricValue(selection.summary.totalCost !== undefined ? formatCurrency(selection.summary.totalCost) : "—")} icon={<CircleDollarSign className="h-4 w-4" />} />}
        {session.permissions.showCost && session.permissions.showProfit && <MetricCard label="预计利润" value={metricValue(selection.summary.estimatedProfit === undefined ? "—" : formatCurrency(selection.summary.estimatedProfit))} icon={<CircleDollarSign className="h-4 w-4" />} />}
      </MetricsRegion></ErpMobileSummary>

      <ErpPageToolbar>
        <ErpFilterBar actions={<Button type="button" variant="ghost" size="sm" onClick={() => commitFilters(defaultPurchaseListFilters)}><RotateCcw className="h-4 w-4" />重置筛选</Button>}>
          {phoneSearch}
          <Select className="w-36" value={filters.sourceType} options={sourceOptions} onValueChange={(value) => updateFilters({sourceType: value as PurchaseListFilters["sourceType"]})} aria-label="采购来源筛选" />
          <Select className="w-36" value={filters.paymentStatus} options={paymentOptions} onValueChange={(value) => updateFilters({paymentStatus: value as PurchaseListFilters["paymentStatus"]})} aria-label="付款状态筛选" />
          <ErpDateRangePicker value={{startDate: filters.dateStart, endDate: filters.dateEnd}} onChange={({startDate, endDate}) => updateFilters({dateStart: startDate, dateEnd: endDate})} triggerClassName="sm:w-36" startAriaLabel="采购开始日期" endAriaLabel="采购结束日期" ariaLabel="采购日期范围" />
        </ErpFilterBar>
      </ErpPageToolbar>

      <ErpTableResultsBar summary={<span className="flex items-center gap-2"><Filter className="h-4 w-4 text-[var(--erp-color-primary)]" />共 {selection.meta.total} 条</span>} actions={<>
        <ErpColumnVisibilityMenu columns={columns} visibility={columnVisibility} defaultVisibility={emptyVisibility} onVisibilityChange={setColumnVisibility} />
        <div className="inline-flex rounded-[var(--erp-radius-md)] border border-[var(--erp-color-border)] bg-[var(--erp-color-surface)] p-0.5"><Button type="button" size="sm" variant={density === "comfortable" ? "secondary" : "ghost"} onClick={() => setDensity("comfortable")}>舒适</Button><Button type="button" size="sm" variant={density === "compact" ? "secondary" : "ghost"} onClick={() => setDensity("compact")}>紧凑</Button></div>
      </>} />
    </>}

    <ErpPageContent className="space-y-[var(--erp-page-gap)]">

    {purchaseTable}

    <ErpMobileActionDock
      hidden={Boolean(deleting || settling || phoneFiltersOpen)}
      ariaLabel="采购单搜索与新建"
      primaryAction={canCreate ? (
        <Button type="button" variant="primary" onClick={onCreate}>
          <Plus className="h-5 w-5" />新建采购单
        </Button>
      ) : undefined}
    >
      {phoneSearch}
    </ErpMobileActionDock>

    {phone && (
      <ErpDialogShell
        open={phoneFiltersOpen}
        onOpenChange={setPhoneFiltersOpen}
        title="采购单筛选与操作"
        mobilePresentation="sheet"
        footer={
          <>
            <Button type="button" variant="ghost" onClick={() => commitFilters(defaultPurchaseListFilters)}>
              <RotateCcw className="h-4 w-4" />重置
            </Button>
            <Button type="button" variant="primary" onClick={() => setPhoneFiltersOpen(false)}>
              查看结果
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <div data-erp-region="phone-filter-fields" className="grid gap-3">
            <Select className="w-full" value={filters.sourceType} options={sourceOptions} onValueChange={(value) => updateFilters({sourceType: value as PurchaseListFilters["sourceType"]})} aria-label="采购来源筛选" />
            <Select className="w-full" value={filters.paymentStatus} options={paymentOptions} onValueChange={(value) => updateFilters({paymentStatus: value as PurchaseListFilters["paymentStatus"]})} aria-label="付款状态筛选" />
            <ErpDateRangePicker value={{startDate: filters.dateStart, endDate: filters.dateEnd}} onChange={({startDate, endDate}) => updateFilters({dateStart: startDate, dateEnd: endDate})} triggerClassName="w-full" startAriaLabel="采购开始日期" endAriaLabel="采购结束日期" ariaLabel="采购日期范围" />
            <Select aria-label="每页条数" value={String(filters.pageSize)} onValueChange={(value) => updateFilters({pageSize: Number(value)})} options={[20, 50, 100].map((value) => ({value: String(value), label: `${value} 条/页`}))} />
          </div>
          <div className="flex flex-wrap gap-2">
            <ErpStatusBadge label={canCreate ? "可新建采购单" : "仅查看"} tone={canCreate ? "success" : "neutral"} />
          </div>
          <dl className="erp-customer-filter-summary">
            <div><dt>采购单数</dt><dd>{selection.summary.orderCount} 单</dd></div>
            <div><dt>待付款</dt><dd>{selection.summary.pendingPaymentCount} 单</dd></div>
            {session.permissions.showCost && selection.summary.totalCost !== undefined && (
              <div><dt>采购总额</dt><dd>{formatCurrency(selection.summary.totalCost)}</dd></div>
            )}
          </dl>
        </div>
      </ErpDialogShell>
    )}
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
    <ErpOutstandingSettlementDialog open={Boolean(settling)} context={settlementContext} accounts={accountsQuery.data?.accounts || []} accountsLoading={accountsQuery.isPending || accountsQuery.isFetching} error={settlementMutation.error instanceof Error ? settlementMutation.error.message : accountsQuery.error instanceof Error ? accountsQuery.error.message : undefined} pending={settlementMutation.isPending} onOpenChange={(open) => {if (!open) {setSettling(null); settlementMutation.reset();}}} onSubmit={(values) => settlementMutation.mutateAsync(values).then(() => undefined)} />
    </ErpPageContent>
  </ErpListPageFrame>;
}

function MetricCard({label, value, detail, icon, tone = "neutral"}: {label: string; value: string; detail?: string; icon: ReactNode; tone?: "neutral" | "warning"}) {
  return <ErpMetricCard label={label} value={value} detail={detail} icon={icon} tone={tone === "warning" ? "warning" : "info"} />;
}
