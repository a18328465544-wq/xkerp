import {ErpMobileRecordRow} from "@/src/components/common/ErpMobileRecordRow";
import {keepPreviousData, useMutation, useQuery, useQueryClient} from "@tanstack/react-query";
import {useNavigate} from "@tanstack/react-router";
import type {OnChangeFn, SortingState, VisibilityState} from "@tanstack/react-table";
import {ArrowDown, ArrowUp, Banknote, CheckCircle2, ChevronDown, ClipboardCheck, Download, Filter, Plus, RefreshCw, RotateCcw, SlidersHorizontal, Undo2} from "lucide-react";
import {ErpDialogShell, ErpMobileActionDock, ErpMobileSummary, ErpSearchInput, ErpStatusBadge} from "@/src/components/common";
import {useCallback, useEffect, useMemo, useState, type ReactNode} from "react";
import {notify} from "@/src/utils/notification";
import {Button, Card, CardContent, Select} from "@/src/components/ui";
import {ErpColumnVisibilityMenu, ErpConfirmDialog, ErpDataTable, ErpDetailDrawer, ErpDetailFact, ErpEmptyState, ErpFilterBar, ErpListPageFrame, ErpLoadingState, ErpMetricCard, ErpPageContent, ErpPageError, ErpPageHeader, ErpPageToolbar, ErpTableResultsBar, MetricsRegion, type QuickStatusItemData} from "@/src/components/common";
import {ApiError, queryKeys, returnsApi} from "@/src/services/api";
import {invalidateErpDomains} from "@/src/services/api";
import type {AuthSession} from "@/src/services/api";
import {createCapabilities, useAuth} from "@/src/app/auth";
import {useTablePreferences} from "@/src/hooks/useTablePreferences";
import {useUrlSearchState} from "@/src/hooks/useUrlSearchState";
import {useWorkspaceTabActivity} from "@/src/hooks/useWorkspaceTabRuntime";
import {formatCurrency} from "@/src/lib/format";
import {returnOrderStatusValues} from "@/src/types/returns";
import type {SalesReturnListFilters, SalesReturnListItem} from "@/src/types/returns";
import {useErpPhone} from "@/src/hooks/useErpViewport";
import {createSalesReturnColumns} from "../sales-return.columns";
import {countActiveSalesReturnFilters, defaultSalesReturnListFilters, parseSalesReturnListFilters, salesReturnListFiltersToSearch} from "../sales-return.filters";
import {csvCell, DeleteReturnDialog, ReturnEditDialog, VoidReturnDialog, type ReturnEditDraft} from "../components/ReturnMutationDialogs";
import {ReturnItemsSummary} from "../components/ReturnItemsSummary";
import {ReturnDetailActions} from "../components/ReturnDetailActions";
import {returnDisplayLabel} from "../return-display";

const statusOptions = [{value: "", label: "全部处理状态"}, ...returnOrderStatusValues.map((value) => ({value, label: value}))];

function useSalesReturnUrlState() {
  const {value, commit} = useUrlSearchState({
    defaultValue: {filters: defaultSalesReturnListFilters, detailId: null as string | null},
    parse: (search) => ({filters: parseSalesReturnListFilters(search), detailId: new URLSearchParams(search).get("detail")}),
    serialize: (state: {filters: SalesReturnListFilters; detailId: string | null}) => {
      const params = salesReturnListFiltersToSearch(state.filters);
      if (state.detailId) params.set("detail", state.detailId);
      return params;
    },
  });
  return {filters: value.filters, commitFilters: (filters: SalesReturnListFilters) => commit({filters, detailId: value.detailId}), detailId: value.detailId, commitDetail: (detailId: string | null) => commit({filters: value.filters, detailId})};
}

export function SalesReturnListPage() {
  const {active} = useWorkspaceTabActivity();
  const {session, logout} = useAuth();
  const {filters, commitFilters, detailId, commitDetail} = useSalesReturnUrlState();
  const allowed = createCapabilities(session).menu("return_sales") || createCapabilities(session).menu("return_orders");
  const listQuery = useQuery({
    queryKey: queryKeys.returns.salesList(filters),
    queryFn: ({signal}) => returnsApi.listSales(filters, signal),
    enabled: active && Boolean(session && allowed),
    placeholderData: keepPreviousData,
    retry: false,
  });
  useEffect(() => {if (listQuery.error instanceof ApiError && listQuery.error.isUnauthorized) logout();}, [listQuery.error, logout]);
  if (!session) return <Card><ErpLoadingState title="正在验证销售退货权限" /></Card>;
  if (!session || !allowed) return <ErpPageError title="当前账号没有销售退货权限" description="当前账号没有此页面的访问权限，请联系管理员开通。" />;
  return <SalesReturnListContent session={session} filters={filters} commitFilters={commitFilters} detailId={detailId} commitDetail={commitDetail} query={listQuery} onAuthExpired={logout} />;
}

function SalesReturnListContent({session, filters, commitFilters, detailId, commitDetail, query, onAuthExpired}: {
  session: AuthSession;
  filters: SalesReturnListFilters;
  commitFilters: (filters: SalesReturnListFilters) => void;
  detailId: string | null;
  commitDetail: (id: string | null) => void;
  query: ReturnType<typeof useQuery<Awaited<ReturnType<typeof returnsApi.listSales>>>>;
  onAuthExpired: () => void;
}) {
  const phone = useErpPhone();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [phoneFiltersOpen, setPhoneFiltersOpen] = useState(false);
  const [completeTarget, setCompleteTarget] = useState<SalesReturnListItem | null>(null);
  const [voidTarget, setVoidTarget] = useState<SalesReturnListItem | null>(null);
  const [editTarget, setEditTarget] = useState<SalesReturnListItem | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<SalesReturnListItem | null>(null);
  const [editDraft, setEditDraft] = useState<ReturnEditDraft>({handler: "", reason: "", remarks: ""});
  const {columnVisibility, setColumnVisibility, density, setDensity} = useTablePreferences<VisibilityState>({feature: "sales-returns", userId: session.user.id, defaultVisibility: {}});
  const items = query.data?.items || [];
  const {active: tabActive} = useWorkspaceTabActivity();
  const selectedDetailFromPage = items.find((item) => item.id === detailId || item.returnNo === detailId) || null;
  const detailQuery = useQuery({
    queryKey: queryKeys.returns.salesDetail(detailId || ""),
    queryFn: ({signal}) => returnsApi.findSalesByReference(detailId || "", signal),
    enabled: tabActive && Boolean(detailId && !selectedDetailFromPage),
    retry: false,
  });
  useEffect(() => {if (detailQuery.error instanceof ApiError && detailQuery.error.isUnauthorized) onAuthExpired();}, [detailQuery.error, onAuthExpired]);
  const selectedDetail = selectedDetailFromPage || detailQuery.data || null;
  const activeFilterCount = countActiveSalesReturnFilters(filters);
  const pageAmount = items.reduce((sum, item) => sum + item.amount, 0);
  const pendingOnPage = items.filter((item) => item.status === "待处理").length;
  const completedOnPage = items.filter((item) => item.status === "已完成").length;
  const canEdit = session.permissions.canEditHistory;
  const canDelete = session.permissions.canDelete;
  const invalidateReturns = () => invalidateErpDomains(queryClient, ["returns", "sales", "inventory", "state"]);
  const handleMutationError = (error: Error) => {
    if (error instanceof ApiError && error.isUnauthorized) {
      onAuthExpired();
      return;
    }
    notify.error(error.message);
  };
  const completeMutation = useMutation({
    mutationFn: (item: SalesReturnListItem) => returnsApi.complete(item.id),
    onSuccess: (result) => {
      notify.success(`${result.returnNo} 已完成退货处理`);
      setCompleteTarget(null);
      void invalidateReturns();
    },
    onError: handleMutationError,
  });
  const voidMutation = useMutation({
    mutationFn: (item: SalesReturnListItem) => returnsApi.voidReturn(item.id),
    onSuccess: (result) => {
      notify.success(`${result?.returnNo || voidTarget?.returnNo || "退货单"} 已作废`);
      setVoidTarget(null);
      if (detailId) commitDetail(null);
      void invalidateReturns();
    },
    onError: handleMutationError,
  });
  const updateMutation = useMutation({
    mutationFn: ({item, values}: {item: SalesReturnListItem; values: ReturnEditDraft}) => returnsApi.update(item.id, values),
    onSuccess: (result) => {
      notify.success(`${result?.returnNo || editTarget?.returnNo || "退货单"} 已保存修改`);
      setEditTarget(null);
      void invalidateReturns();
    },
    onError: handleMutationError,
  });
  const deleteMutation = useMutation({
    mutationFn: (item: SalesReturnListItem) => item.status === "已完成" ? returnsApi.reverse(item.id) : returnsApi.remove(item.id),
    onSuccess: (result) => {
      notify.success(`${result?.returnNo || deleteTarget?.returnNo || "退货单"} ${deleteTarget?.status === "已完成" ? "已冲销" : "已删除"}`);
      setDeleteTarget(null);
      if (detailId) commitDetail(null);
      void invalidateReturns();
    },
    onError: handleMutationError,
  });
  const openDetail = useCallback((item: SalesReturnListItem) => commitDetail(item.id), [commitDetail]);
  const openEdit = useCallback((item: SalesReturnListItem) => {
    updateMutation.reset();
    setEditDraft({handler: item.handler || session.user.displayName, reason: item.reason || "", remarks: item.remarks || ""});
    setEditTarget(item);
    commitDetail(null);
  }, [commitDetail, session.user.displayName, updateMutation]);
  const openDelete = useCallback((item: SalesReturnListItem) => {
    deleteMutation.reset();
    setDeleteTarget(item);
    commitDetail(null);
  }, [commitDetail, deleteMutation]);
  const openVoid = useCallback((item: SalesReturnListItem) => {
    voidMutation.reset();
    setVoidTarget(item);
    commitDetail(null);
  }, [commitDetail, voidMutation]);
  const columns = useMemo(() => createSalesReturnColumns({onDetail: openDetail, onComplete: (item) => {completeMutation.reset(); setCompleteTarget(item);}, onVoid: openVoid, onEdit: openEdit, onDelete: openDelete, canEdit, canDelete}), [canDelete, canEdit, completeMutation, openDelete, openDetail, openEdit, openVoid]);
  const updateFilters = (patch: Partial<SalesReturnListFilters>) => commitFilters({...filters, ...patch, page: 1});
  const sorting: SortingState = filters.sortKey ? [{id: filters.sortKey, desc: filters.sortDirection === "desc"}] : [];
  const handleSortingChange: OnChangeFn<SortingState> = (updater) => {
    const next = typeof updater === "function" ? updater(sorting) : updater;
    const first = next[0];
    updateFilters({sortKey: first?.id || undefined, sortDirection: first ? (first.desc ? "desc" : "asc") : undefined});
  };
  const quickStatus: QuickStatusItemData[] = [
    {icon: <ClipboardCheck className="h-4 w-4" />, label: "待处理（本页）", value: `${pendingOnPage} 单`, description: "完成后才变更退款与库存", tone: pendingOnPage ? "warning" : "success"},
  ];
  const exportCurrentPage = () => {
    const rows = [
      ["退货单号", "状态", "关联销售单", "客户", "商品", "SN / 库存卡片", "退款金额", "退款方式", "库存处理", "经办人", "退货日期", "退货原因", "备注"],
      ...items.map((item) => [item.returnNo, item.status, item.relatedDocNo, item.partyName, returnDisplayLabel(item), item.returnItems?.map((line) => `${line.sourceInventoryId}${line.sn ? ` · ${line.sn}` : ""}`).join("；") || item.sn, item.amount, item.settlementMode, item.inventoryAction, item.handler, item.date, item.reason, item.remarks]),
    ];
    const csv = `\uFEFF${rows.map((row) => row.map(csvCell).join(",")).join("\n")}`;
    const url = URL.createObjectURL(new Blob([csv], {type: "text/csv;charset=utf-8"}));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `销售退货-第${filters.page}页.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  };


  const phoneSearch = (
    <ErpSearchInput
      className={phone ? "w-full" : "min-w-[280px] flex-1"}
      value={filters.keyword}
      onChange={(event) => updateFilters({keyword: event.target.value})}
      placeholder={phone ? "搜索退货单、客户、商品、SN" : "搜索退货单、销售单、客户、商品、SN 或原因"}
      aria-label="搜索销售退货"
    />
  );

  const salesReturnTable = (
    <ErpDataTable
      surface={phone ? "plain" : "card"}
      mobilePagination="compact"
      mobileToolbar={({openSorting, sortLabel, descending}) => (
        <div className="erp-customer-list-toolbar">
          <div className="erp-customer-quick-filters" role="group" aria-label="快捷状态筛选">
            <Button
              type="button"
              variant={!filters.status ? "primary" : "ghost"}
              aria-pressed={!filters.status}
              onClick={() => updateFilters({status: ""})}
            >
              全部
            </Button>
            <Button
              type="button"
              variant={filters.status === "待处理" ? "primary" : "ghost"}
              aria-pressed={filters.status === "待处理"}
              onClick={() => updateFilters({status: "待处理"})}
            >
              待处理{pendingOnPage > 0 ? ` (${pendingOnPage})` : ""}
            </Button>
            <Button
              type="button"
              variant={filters.status === "已完成" ? "primary" : "ghost"}
              aria-pressed={filters.status === "已完成"}
              onClick={() => updateFilters({status: "已完成"})}
            >
              已完成
            </Button>
          </div>
          <Button
            type="button"
            variant="ghost"
            className="erp-customer-sort"
            aria-label="退货单排序"
            onClick={openSorting}
          >
            <span>{sortLabel || "退货日期"}</span>
            {descending === undefined ? <ChevronDown className="h-4 w-4" /> : descending ? <ArrowDown className="h-4 w-4" /> : <ArrowUp className="h-4 w-4" />}
          </Button>
        </div>
      )}
      mobileRow={(item) => {
        const isPending = item.status === "待处理";
        const isCompleted = item.status === "已完成";
        const tone = isPending ? "warning" : isCompleted ? "success" : "neutral";
        return (
          <ErpMobileRecordRow
            title={item.returnNo}
            titleMono
            subtitle={item.partyName || item.productName}
            meta={`${item.relatedDocNo ? `${item.relatedDocNo} · ` : ""}${item.date || ""}${item.handler ? ` · ${item.handler}` : ""}`}
            amount={formatCurrency(item.amount)}
            status={<ErpStatusBadge label={item.status} tone={tone} />}
            onOpen={() => openDetail(item)}
          />
        );
      }}
      mobileFieldOrder={["status","partyName","amount","relatedDocNo"]}
      ariaLabel="销售退货明细"
      columns={columns}
      data={items}
      getRowId={(item) => item.id}
      loading={query.isPending}
      fetching={query.isFetching}
      error={query.error as Error | null}
      errorTitle="销售退货加载失败"
      emptyTitle="暂无销售退货"
      emptyDescription={activeFilterCount ? "当前筛选没有匹配的销售退货记录。" : "暂无销售退货记录。"}
      onRetry={() => void query.refetch()}
      onRowClick={openDetail}
      mobileShowDetailAction={false}
      manualSorting
      sorting={sorting}
      onSortingChange={handleSortingChange}
      page={query.data?.meta.page || filters.page}
      pageSize={query.data?.meta.pageSize || filters.pageSize}
      total={query.data?.meta.total || 0}
      onPageChange={(page) => commitFilters({...filters, page})}
      onPageSizeChange={(pageSize) => commitFilters({...filters, page: 1, pageSize})}
      columnVisibility={columnVisibility}
      onColumnVisibilityChange={setColumnVisibility}
      enableColumnResizing
      density={density}
      stickyHeader
    />
  );

  return (
    <ErpListPageFrame data-phone-layout={phone ? "thumb" : undefined}>
      <ErpPageHeader
        title={phone ? (
          <span className="erp-customer-phone-title">
            销售退货<small>{query.isPending ? "正在加载…" : query.error && !query.data ? "加载失败" : `${query.data?.meta.total || 0} 单`}</small>
          </span>
        ) : "销售退货"}
        subtitle="查看退货单，完成原路退款与库存处理。"
        quickStatus={quickStatus}
        actions={phone ? (
          <Button
            type="button"
            variant="secondary"
            onClick={() => setPhoneFiltersOpen(true)}
            aria-label="退货筛选与操作"
          >
            <SlidersHorizontal className="h-5 w-5" />
            筛选{activeFilterCount > 0 && <span className="tabular-nums">{activeFilterCount}</span>}
          </Button>
        ) : (
          <>
            <Button type="button" size="sm" variant="secondary" onClick={() => void query.refetch()} disabled={query.isFetching}>
              <RefreshCw className={`h-4 w-4 ${query.isFetching ? "animate-spin" : ""}`} />刷新
            </Button>
            <Button type="button" size="sm" variant="secondary" onClick={exportCurrentPage} disabled={!items.length}>
              <Download className="h-4 w-4" />导出当前页
            </Button>
            <Button type="button" size="sm" variant="primary" onClick={() => void navigate({to: "/sales/returns/new"})}>
              <Plus className="h-4 w-4" />新建销售退货
            </Button>
          </>
        )}
      />
      {!phone && (
        <>
          <ErpMobileSummary>
            <MetricsRegion>
              <MetricCard label="当前结果" value={`${query.data?.meta.total || 0} 单`} detail={filters.status ? `${filters.status}筛选结果` : ""} icon={<Undo2 className="h-4 w-4" />} />
              <MetricCard label="退款金额（本页）" value={formatCurrency(pageAmount)} detail="仅汇总当前页" icon={<Banknote className="h-4 w-4" />} />
              <MetricCard label="待处理（本页）" value={`${pendingOnPage} 单`} detail="完成动作会触发业务变更" icon={<ClipboardCheck className="h-4 w-4" />} tone={pendingOnPage ? "warning" : "neutral"} />
              <MetricCard label="已完成（本页）" value={`${completedOnPage} 单`} detail="退款与库存已处理" icon={<CheckCircle2 className="h-4 w-4" />} />
            </MetricsRegion>
          </ErpMobileSummary>
          <ErpPageToolbar>
            <ErpFilterBar actions={<Button type="button" variant="ghost" size="sm" onClick={() => commitFilters(defaultSalesReturnListFilters)} disabled={!activeFilterCount}><Filter className="h-4 w-4" />重置筛选</Button>}>
              {phoneSearch}
              <Select className="w-40" value={filters.status} options={statusOptions} onValueChange={(value) => updateFilters({status: value as SalesReturnListFilters["status"]})} aria-label="退货处理状态筛选" />
            </ErpFilterBar>
          </ErpPageToolbar>
          <ErpTableResultsBar actions={<><ErpColumnVisibilityMenu columns={columns} visibility={columnVisibility} onVisibilityChange={setColumnVisibility} /><div className="inline-flex rounded-[var(--erp-radius-md)] border border-[var(--erp-color-border)] bg-[var(--erp-color-surface)] p-0.5"><Button type="button" size="sm" variant={density === "comfortable" ? "secondary" : "ghost"} onClick={() => setDensity("comfortable")}>舒适</Button><Button type="button" size="sm" variant={density === "compact" ? "secondary" : "ghost"} onClick={() => setDensity("compact")}>紧凑</Button></div></>} />
        </>
      )}
      <ErpPageContent className="space-y-[var(--erp-page-gap)]">
        {salesReturnTable}
        <ErpMobileActionDock
          hidden={Boolean(detailId || completeTarget || voidTarget || editTarget || deleteTarget || phoneFiltersOpen)}
          ariaLabel="销售退货搜索与新建"
          primaryAction={
            <Button type="button" variant="primary" onClick={() => void navigate({to: "/sales/returns/new"})}>
              <Plus className="h-5 w-5" />新建销售退货
            </Button>
          }
        >
          {phoneSearch}
        </ErpMobileActionDock>
        {phone && (
          <ErpDialogShell
            open={phoneFiltersOpen}
            onOpenChange={setPhoneFiltersOpen}
            mobilePresentation="sheet"
            title="销售退货筛选与设置"
            description="调整状态、每页条数及导出"
            footer={
              <div className="flex w-full items-center justify-between gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    commitFilters(defaultSalesReturnListFilters);
                    setPhoneFiltersOpen(false);
                  }}
                  disabled={!activeFilterCount}
                >
                  <RotateCcw className="h-4 w-4" />重置
                </Button>
                <div className="flex gap-2">
                  <Button type="button" variant="secondary" size="sm" onClick={exportCurrentPage} disabled={!items.length}>
                    <Download className="h-4 w-4" />导出
                  </Button>
                  <Button type="button" variant="primary" size="sm" onClick={() => setPhoneFiltersOpen(false)}>
                    完成
                  </Button>
                </div>
              </div>
            }
          >
            <div className="space-y-4 py-2">
              <div className="space-y-2">
                <label className="text-xs font-medium text-[var(--erp-color-text-secondary)]">处理状态</label>
                <Select
                  className="w-full"
                  value={filters.status}
                  options={statusOptions}
                  onValueChange={(value) => updateFilters({status: value as SalesReturnListFilters["status"]})}
                  aria-label="退货处理状态筛选"
                />
              </div>
              <div className="space-y-2">
                <label className="text-xs font-medium text-[var(--erp-color-text-secondary)]">每页显示</label>
                <div className="flex gap-2">
                  {[10, 20, 50].map((size) => (
                    <Button
                      key={size}
                      type="button"
                      size="sm"
                      variant={filters.pageSize === size ? "primary" : "secondary"}
                      onClick={() => updateFilters({pageSize: size})}
                    >
                      {size} 条/页
                    </Button>
                  ))}
                </div>
              </div>
            </div>
          </ErpDialogShell>
        )}
        <ErpDetailDrawer open={Boolean(detailId)} onOpenChange={(open) => {if (!open) commitDetail(null);}} modal={false} resizable drawerKey="sales-return-detail" defaultWidth={860} minWidth={680} maxWidth={1080} title={selectedDetail?.returnNo || detailId || "销售退货详情"} footer={selectedDetail && <ReturnDetailActions item={selectedDetail} canDelete={canDelete} canEdit={canEdit} onVoid={openVoid} onReverse={openDelete} onEdit={openEdit} onComplete={setCompleteTarget} completeLabel="完成退货处理" />}>
          {selectedDetail ? <SalesReturnDetail item={selectedDetail} /> : detailQuery.isPending || query.isPending ? <ErpLoadingState title="正在定位销售退货单" description="正在跨页查找完整退货明细。" /> : detailQuery.error ? <ErpEmptyState title="销售退货详情加载失败" description={(detailQuery.error as Error).message} action={<Button type="button" size="sm" variant="secondary" onClick={() => void detailQuery.refetch()}>重试</Button>} /> : <div className="rounded-[var(--erp-radius-md)] bg-[var(--erp-color-warning-soft)] p-4 text-sm text-[var(--erp-color-warning)]">当前未找到该退货单，可能已删除或当前账号无权查看。</div>}
        </ErpDetailDrawer>
        <CompleteReturnDialog target={completeTarget} pending={completeMutation.isPending} error={completeMutation.error instanceof Error ? completeMutation.error.message : ""} onClose={() => {if (!completeMutation.isPending) setCompleteTarget(null);}} onConfirm={() => {if (completeTarget) completeMutation.mutate(completeTarget);}} />
        <VoidReturnDialog target={voidTarget} pending={voidMutation.isPending} error={voidMutation.error instanceof Error ? voidMutation.error.message : ""} onClose={() => {if (!voidMutation.isPending) setVoidTarget(null);}} onConfirm={() => {if (voidTarget) voidMutation.mutate(voidTarget);}} />
        <ReturnEditDialog target={editTarget} draft={editDraft} pending={updateMutation.isPending} error={updateMutation.error instanceof Error ? updateMutation.error.message : ""} onClose={() => {if (!updateMutation.isPending) setEditTarget(null);}} onDraftChange={setEditDraft} onConfirm={() => {if (editTarget) updateMutation.mutate({item: editTarget, values: editDraft});}} />
        <DeleteReturnDialog target={deleteTarget} pending={deleteMutation.isPending} error={deleteMutation.error instanceof Error ? deleteMutation.error.message : ""} onClose={() => {if (!deleteMutation.isPending) setDeleteTarget(null);}} onConfirm={() => {if (deleteTarget) deleteMutation.mutate(deleteTarget);}} />
      </ErpPageContent>
    </ErpListPageFrame>
  );
}

function SalesReturnDetail({item}: {item: SalesReturnListItem}) {
  return <div className="space-y-5">
    <div className="grid gap-3 sm:grid-cols-2"><DetailFact label="处理状态" value={item.status} /><DetailFact label="退货日期" value={item.date || "—"} /><DetailFact label="关联销售单" value={item.relatedDocNo || "—"} /><DetailFact label="退货范围" value={returnDisplayLabel(item)} /><DetailFact label="原库存卡片" value={item.sourceInventoryId || "—"} /><DetailFact label="客户" value={item.partyName || "—"} /><DetailFact label="联系方式" value={item.contact || "—"} /><DetailFact label="商品" value={item.productName} /><DetailFact label="SN" value={item.sn || "—"} /><DetailFact label="退款金额" value={formatCurrency(item.amount)} /><DetailFact label="退款方式" value={item.settlementMode || "—"} /><DetailFact label="库存处理" value={item.inventoryAction || "—"} /><DetailFact label="责任归属" value={item.responsibility || "—"} /><DetailFact label="经办人" value={item.handler || "—"} /><DetailFact label="完成时间" value={item.completedAt || "尚未完成"} /></div>
    <ReturnItemsSummary item={item} />
    <Card><CardContent className="grid gap-4 p-4"><DetailFact label="退货原因" value={item.reason || "—"} /><DetailFact label="备注" value={item.remarks || "—"} /></CardContent></Card>
  </div>;
}

function CompleteReturnDialog({target, pending, error, onClose, onConfirm}: {target: SalesReturnListItem | null; pending: boolean; error: string; onClose: () => void; onConfirm: () => void}) {
  return <ErpConfirmDialog open={Boolean(target)} onOpenChange={(open) => {if (!open) onClose();}} title="确认完成销售退货" description="将按退货单处理退款、库存状态和原销售单金额，操作后无法撤销。" documentName={target ? `${target.returnNo} · ${target.productName} · ${target.partyName || "未命名客户"} · 退款 ${formatCurrency(target.amount)} · ${target.inventoryAction || "未记录库存处理"}` : undefined} confirmLabel="确认完成" pendingLabel="处理中…" pending={pending} error={error} onConfirm={onConfirm} />;
}

const DetailFact = ErpDetailFact;

function MetricCard({label, value, detail, icon, tone = "neutral"}: {label: string; value: string; detail?: string; icon: ReactNode; tone?: "neutral" | "warning"}) { return <ErpMetricCard label={label} value={value} detail={detail} icon={icon} tone={tone === "warning" ? "warning" : "info"} />; }
