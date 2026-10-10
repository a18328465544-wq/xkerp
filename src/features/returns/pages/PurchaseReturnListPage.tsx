import {keepPreviousData, useMutation, useQuery, useQueryClient} from "@tanstack/react-query";
import {useNavigate} from "@tanstack/react-router";
import type {OnChangeFn, SortingState, VisibilityState} from "@tanstack/react-table";
import {Banknote, CheckCircle2, ClipboardCheck, Download, Plus, Undo2} from "lucide-react";
import {useCallback, useEffect, useMemo, useState, type ReactNode} from "react";
import {notify} from "@/src/utils/notification";
import {Button, Card, CardContent} from "@/src/components/ui";
import {ErpConfirmDialog, ErpDetailDrawer, ErpDetailFact, ErpEmptyState, ErpListPage, ErpLoadingState, ErpMetricCard, ErpPageError, type ErpFilterField, type QuickStatusItemData} from "@/src/components/common";
import {ApiError, queryKeys, returnsApi} from "@/src/services/api";
import {invalidateErpDomains} from "@/src/services/api";
import type {AuthSession} from "@/src/services/api";
import {createCapabilities, useAuth} from "@/src/app/auth";
import {useTablePreferences} from "@/src/hooks/useTablePreferences";
import {useUrlSearchState} from "@/src/hooks/useUrlSearchState";
import {useWorkspaceTabActivity} from "@/src/hooks/useWorkspaceTabRuntime";
import {formatCurrency} from "@/src/lib/format";
import {returnOrderStatusValues} from "@/src/types/returns";
import type {PurchaseReturnListFilters, PurchaseReturnListItem} from "@/src/types/returns";
import {createPurchaseReturnColumns} from "../purchase-return.columns";
import {countActiveSalesReturnFilters, defaultSalesReturnListFilters, parseSalesReturnListFilters, salesReturnListFiltersToSearch} from "../sales-return.filters";
import {csvCell, DeleteReturnDialog, ReturnEditDialog, VoidReturnDialog, type ReturnEditDraft} from "../components/ReturnMutationDialogs";
import {ReturnItemsSummary} from "../components/ReturnItemsSummary";
import {ReturnDetailActions} from "../components/ReturnDetailActions";
import {returnDisplayLabel} from "../return-display";

const statusOptions = [{value: "", label: "全部处理状态"}, ...returnOrderStatusValues.map((value) => ({value, label: value}))];
function useUrlState() {
  const {value, commit} = useUrlSearchState({
    defaultValue: {filters: defaultSalesReturnListFilters, detailId: null as string | null},
    parse: (search) => ({filters: parseSalesReturnListFilters(search), detailId: new URLSearchParams(search).get("detail")}),
    serialize: (state: {filters: PurchaseReturnListFilters; detailId: string | null}) => {
      const params = salesReturnListFiltersToSearch(state.filters);
      if (state.detailId) params.set("detail", state.detailId);
      return params;
    },
  });
  return {filters: value.filters, commitFilters: (filters: PurchaseReturnListFilters) => commit({filters, detailId: value.detailId}), detailId: value.detailId, commitDetail: (detailId: string | null) => commit({filters: value.filters, detailId})};
}

export function PurchaseReturnListPage() {
  const {active} = useWorkspaceTabActivity();
  const {session, logout} = useAuth();
  const {filters, commitFilters, detailId, commitDetail} = useUrlState();
  const allowed = createCapabilities(session).menu("return_purchase") || createCapabilities(session).menu("return_orders");
  const listQuery = useQuery({queryKey: queryKeys.returns.purchaseList(filters), queryFn: ({signal}) => returnsApi.listPurchase(filters, signal), enabled: active && Boolean(session && allowed), placeholderData: keepPreviousData, retry: false});
  useEffect(() => {if (listQuery.error instanceof ApiError && listQuery.error.isUnauthorized) logout();}, [listQuery.error, logout]);
  if (!session) return <Card><ErpLoadingState title="正在验证采购退货权限" /></Card>;
  if (!session || !allowed) return <ErpPageError title="当前账号没有采购退货权限" description="当前账号没有此页面的访问权限，请联系管理员开通。" />;
  return <PurchaseReturnContent session={session} filters={filters} commitFilters={commitFilters} detailId={detailId} commitDetail={commitDetail} query={listQuery} onAuthExpired={logout} />;
}

function PurchaseReturnContent({session, filters, commitFilters, detailId, commitDetail, query, onAuthExpired}: {session: AuthSession; filters: PurchaseReturnListFilters; commitFilters: (filters: PurchaseReturnListFilters) => void; detailId: string | null; commitDetail: (id: string | null) => void; query: ReturnType<typeof useQuery<Awaited<ReturnType<typeof returnsApi.listPurchase>>>>; onAuthExpired: () => void}) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [completeTarget, setCompleteTarget] = useState<PurchaseReturnListItem | null>(null);
  const [voidTarget, setVoidTarget] = useState<PurchaseReturnListItem | null>(null);
  const [editTarget, setEditTarget] = useState<PurchaseReturnListItem | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<PurchaseReturnListItem | null>(null);
  const [editDraft, setEditDraft] = useState<ReturnEditDraft>({handler: "", reason: "", remarks: ""});
  const {columnVisibility, setColumnVisibility, density, setDensity} = useTablePreferences<VisibilityState>({feature: "purchase-returns", userId: session.user.id, defaultVisibility: {}});
  const items = query.data?.items || [];
  const {active: tabActive} = useWorkspaceTabActivity();
  const detailFromPage = items.find((item) => item.id === detailId || item.returnNo === detailId) || null;
  const detailQuery = useQuery({
    queryKey: queryKeys.returns.purchaseDetail(detailId || ""),
    queryFn: ({signal}) => returnsApi.findPurchaseByReference(detailId || "", signal),
    enabled: tabActive && Boolean(detailId && !detailFromPage),
    retry: false,
  });
  useEffect(() => {if (detailQuery.error instanceof ApiError && detailQuery.error.isUnauthorized) onAuthExpired();}, [detailQuery.error, onAuthExpired]);
  const detail = detailFromPage || detailQuery.data || null;
  const active = countActiveSalesReturnFilters(filters);
  const pending = items.filter((item) => item.status === "待处理").length;
  const pageAmount = items.reduce((sum, item) => sum + item.amount, 0);
  const pageCredit = items.reduce((sum, item) => sum + item.creditAmount + item.vendorCreditAmount, 0);
  const canCreate = createCapabilities(session).menu("return_purchase") || createCapabilities(session).menu("return_orders");
  const canEdit = session.permissions.canEditHistory;
  const canDelete = session.permissions.canDelete;
  const invalidateReturns = () => invalidateErpDomains(queryClient, ["returns", "purchase", "inventory", "state"]);
  const handleMutationError = (error: Error) => {if (error instanceof ApiError && error.isUnauthorized) {onAuthExpired(); return;} notify.error(error.message);};
  const mutation = useMutation({mutationFn: (item: PurchaseReturnListItem) => returnsApi.complete(item.id), onSuccess: (result) => {notify.success(`${result.returnNo} 已完成采购退货`); setCompleteTarget(null); void invalidateReturns();}, onError: handleMutationError});
  const voidMutation = useMutation({mutationFn: (item: PurchaseReturnListItem) => returnsApi.voidReturn(item.id), onSuccess: (result) => {notify.success(`${result?.returnNo || voidTarget?.returnNo || "采购退货单"} 已作废`); setVoidTarget(null); if (detailId) commitDetail(null); void invalidateReturns();}, onError: handleMutationError});
  const updateMutation = useMutation({mutationFn: ({item, values}: {item: PurchaseReturnListItem; values: ReturnEditDraft}) => returnsApi.update(item.id, values), onSuccess: (result) => {notify.success(`${result?.returnNo || editTarget?.returnNo || "采购退货单"} 已保存修改`); setEditTarget(null); void invalidateReturns();}, onError: handleMutationError});
  const deleteMutation = useMutation({mutationFn: (item: PurchaseReturnListItem) => item.status === "已完成" ? returnsApi.reverse(item.id) : returnsApi.remove(item.id), onSuccess: (result) => {notify.success(`${result?.returnNo || deleteTarget?.returnNo || "采购退货单"} ${deleteTarget?.status === "已完成" ? "已冲销" : "已删除"}`); setDeleteTarget(null); if (detailId) commitDetail(null); void invalidateReturns();}, onError: handleMutationError});
  const openDetail = useCallback((item: PurchaseReturnListItem) => commitDetail(item.id), [commitDetail]);
  const openEdit = useCallback((item: PurchaseReturnListItem) => {updateMutation.reset(); setEditDraft({handler: item.handler || session.user.displayName, reason: item.reason || "", remarks: item.remarks || ""}); setEditTarget(item); commitDetail(null);}, [commitDetail, session.user.displayName, updateMutation]);
  const openDelete = useCallback((item: PurchaseReturnListItem) => {deleteMutation.reset(); setDeleteTarget(item); commitDetail(null);}, [commitDetail, deleteMutation]);
  const openVoid = useCallback((item: PurchaseReturnListItem) => {voidMutation.reset(); setVoidTarget(item); commitDetail(null);}, [commitDetail, voidMutation]);
  const columns = useMemo(() => createPurchaseReturnColumns({onDetail: openDetail, onComplete: (item) => {mutation.reset(); setCompleteTarget(item);}, onVoid: openVoid, onEdit: openEdit, onDelete: openDelete, canEdit, canDelete}), [canDelete, canEdit, mutation, openDelete, openDetail, openEdit, openVoid]);
  const update = (patch: Partial<PurchaseReturnListFilters>) => commitFilters({...filters, ...patch, page: 1});
  const sorting: SortingState = filters.sortKey ? [{id: filters.sortKey, desc: filters.sortDirection === "desc"}] : [];
  const handleSortingChange: OnChangeFn<SortingState> = (updater) => {
    const next = typeof updater === "function" ? updater(sorting) : updater;
    const first = next[0];
    update({sortKey: first?.id || undefined, sortDirection: first ? (first.desc ? "desc" : "asc") : undefined});
  };
  const quickStatus: QuickStatusItemData[] = [ {icon: <ClipboardCheck className="h-4 w-4" />, label: "待处理（本页）", value: `${pending} 单`, description: "完成后才改变库存与账款", tone: pending ? "warning" : "success"}];
  const exportCurrentPage = () => {const rows = [["退货单号", "状态", "关联采购单", "供应商 / 来源", "商品", "SN / 库存卡片", "退货金额", "结算方式", "冲减应付", "供应商抵扣", "释放现金", "库存处理", "经办人", "退货日期", "原因", "备注"], ...items.map((item) => [item.returnNo, item.status, item.relatedDocNo, item.partyName, returnDisplayLabel(item), item.returnItems?.map((line) => `${line.sourceInventoryId}${line.sn ? ` · ${line.sn}` : ""}`).join("；") || item.sn, item.amount, item.settlementMode, item.creditAmount, item.vendorCreditAmount, item.cashReleasedAmount, item.inventoryAction, item.handler, item.date, item.reason, item.remarks])]; const csv = `\uFEFF${rows.map((row) => row.map(csvCell).join(",")).join("\n")}`; const url = URL.createObjectURL(new Blob([csv], {type: "text/csv;charset=utf-8"})); const anchor = document.createElement("a"); anchor.href = url; anchor.download = `采购退货-第${filters.page}页.csv`; anchor.click(); URL.revokeObjectURL(url);};

  const filterFields: ErpFilterField[] = [
    {kind: "select", key: "status", label: "处理状态", width: "w-40", value: filters.status, defaultValue: "", options: statusOptions, onChange: (status) => update({status: status as PurchaseReturnListFilters["status"]})},
  ];
  const table = {
    columns,
    data: items,
    getRowId: (item: PurchaseReturnListItem) => item.id,
    onRowClick: openDetail,
    mobileRow: "columns" as const,
    mobileFieldOrder: ["partyName", "status", "amount", "relatedDocNo", "productName"],
    mobileFields: 4,
    ariaLabel: "采购退货明细",
    loading: query.isPending,
    fetching: query.isFetching,
    error: query.error as Error | null,
    errorTitle: "采购退货加载失败",
    emptyTitle: "暂无采购退货",
    emptyDescription: active ? "当前筛选没有匹配记录。" : "暂无采购退货记录。",
    onRetry: () => void query.refetch(),
    manualSorting: true,
    sorting,
    onSortingChange: handleSortingChange,
    page: query.data?.meta.page || filters.page,
    pageSize: query.data?.meta.pageSize || filters.pageSize,
    total: query.data?.meta.total || 0,
    onPageChange: (page: number) => commitFilters({...filters, page}),
    onPageSizeChange: (pageSize: number) => commitFilters({...filters, page: 1, pageSize}),
    enableColumnResizing: true,
    stickyHeader: true,
    mobileShowDetailAction: false,
  };
  return <ErpListPage
    title="采购退货"
    phoneTitle="采购退货"
    subtitle="管理原路退款、供应商抵扣与误录付款冲销。"
    countLabel={(count) => count + " 单"}
    loading={query.isPending}
    loadError={Boolean(query.error && !query.data)}
    quickStatus={quickStatus}
    metrics={[
      <Metric key="count" label="当前结果" value={(query.data?.meta.total || 0) + " 单"} icon={<Undo2 className="h-4 w-4" />} />,
      <Metric key="amount" label="退货金额（本页）" value={formatCurrency(pageAmount)} detail="当前页" icon={<Banknote className="h-4 w-4" />} />,
      <Metric key="credit" label="账款抵扣（本页）" value={formatCurrency(pageCredit)} detail="完成后显示" icon={<ClipboardCheck className="h-4 w-4" />} />,
      <Metric key="pending" label="待处理（本页）" value={pending + " 单"} detail="尚未改变采购和库存" icon={<CheckCircle2 className="h-4 w-4" />} tone={pending ? "warning" : "neutral"} />,
    ]}
    search={{value: filters.keyword, onChange: (keyword) => update({keyword}), label: "搜索采购退货", placeholder: "搜索退货单、采购单、供应商、商品、SN 或原因", phonePlaceholder: "搜索退货单、供应商、商品、SN"}}
    filters={filterFields}
    onResetFilters={() => commitFilters(defaultSalesReturnListFilters)}
    quickFilters={[
      {label: "全部", active: !filters.status, onSelect: () => update({status: ""})},
      {label: pending ? "待处理 (" + pending + ")" : "待处理", active: filters.status === "待处理", onSelect: () => update({status: "待处理"})},
      {label: "已完成", active: filters.status === "已完成", onSelect: () => update({status: "已完成"})},
    ]}
    defaultSortLabel="退货日期"
    primaryAction={canCreate ? {label: "新建采购退货", icon: <Plus className="h-4 w-4" />, onClick: () => void navigate({to: "/purchase/returns/new"})} : undefined}
    actions={[{label: "导出当前页", icon: <Download className="h-4 w-4" />, onClick: exportCurrentPage, disabled: !items.length}]}
    onRefresh={() => void query.refetch()}
    refreshing={query.isFetching}
    resultsLabel="全部采购退货"
    desktopResultsSummary={null}
    desktopTableSection={false}
    phonePageSizeOptions={[10, 20, 50]}
    tableTitle="采购退货明细"
    columnSettings={{columns, visibility: columnVisibility, onVisibilityChange: setColumnVisibility, density, onDensityChange: setDensity}}
    table={table}
    overlayOpen={Boolean(detailId || completeTarget || voidTarget || editTarget || deleteTarget)}
    overlays={<>
      <ErpDetailDrawer open={Boolean(detailId)} onOpenChange={(open) => {if (!open) commitDetail(null);}} modal={false} resizable drawerKey="purchase-return-detail" defaultWidth={860} minWidth={680} maxWidth={1080} title={detail?.returnNo || detailId || "采购退货详情"} description="财务变化以退货完成后的结果为准。" footer={detail && <ReturnDetailActions item={detail} canDelete={canDelete} canEdit={canEdit} onVoid={openVoid} onReverse={openDelete} onEdit={openEdit} onComplete={setCompleteTarget} completeLabel="完成采购退货" />}>
        {detail ? <PurchaseReturnDetail item={detail} /> : detailQuery.isPending || query.isPending ? <ErpLoadingState title="正在定位采购退货单" description="正在跨页查找完整退货明细。" /> : detailQuery.error ? <ErpEmptyState title="采购退货详情加载失败" description={(detailQuery.error as Error).message} action={<Button type="button" size="sm" variant="secondary" onClick={() => void detailQuery.refetch()}>重试</Button>} /> : <div className="rounded-[var(--erp-radius-md)] bg-[var(--erp-color-warning-soft)] p-4 text-sm text-[var(--erp-color-warning)]">当前未找到该退货单，可能已删除或当前账号无权查看。</div>}
      </ErpDetailDrawer>
      <CompleteDialog target={completeTarget} pending={mutation.isPending} error={mutation.error instanceof Error ? mutation.error.message : ""} onClose={() => {if (!mutation.isPending) setCompleteTarget(null);}} onConfirm={() => {if (completeTarget) mutation.mutate(completeTarget);}} />
      <VoidReturnDialog target={voidTarget} pending={voidMutation.isPending} error={voidMutation.error instanceof Error ? voidMutation.error.message : ""} onClose={() => {if (!voidMutation.isPending) setVoidTarget(null);}} onConfirm={() => {if (voidTarget) voidMutation.mutate(voidTarget);}} />
      <ReturnEditDialog target={editTarget} draft={editDraft} pending={updateMutation.isPending} error={updateMutation.error instanceof Error ? updateMutation.error.message : ""} onClose={() => {if (!updateMutation.isPending) setEditTarget(null);}} onDraftChange={setEditDraft} onConfirm={() => {if (editTarget) updateMutation.mutate({item: editTarget, values: editDraft});}} />
      <DeleteReturnDialog target={deleteTarget} pending={deleteMutation.isPending} error={deleteMutation.error instanceof Error ? deleteMutation.error.message : ""} onClose={() => {if (!deleteMutation.isPending) setDeleteTarget(null);}} onConfirm={() => {if (deleteTarget) deleteMutation.mutate(deleteTarget);}} />
    </>}
  />;
}

function PurchaseReturnDetail({item}: {item: PurchaseReturnListItem}) { return <div className="space-y-4"><div className="grid gap-3 sm:grid-cols-2"><Fact label="状态" value={item.status} /><Fact label="原采购单" value={item.relatedDocNo || "—"} /><Fact label="供应商 / 来源" value={item.partyName || "—"} /><Fact label="退货范围" value={returnDisplayLabel(item)} /><Fact label="商品" value={`${item.productName}${item.sn ? ` · ${item.sn}` : ""}`} /><Fact label="退货金额" value={formatCurrency(item.amount)} /><Fact label="结算方式" value={item.settlementMode || "—"} /><Fact label="冲减应付款" value={formatCurrency(item.creditAmount)} /><Fact label="供应商抵扣变化" value={formatCurrency(item.vendorCreditAmount)} /><Fact label="释放现金付款" value={formatCurrency(item.cashReleasedAmount)} /><Fact label="库存处理" value={item.inventoryAction || "—"} /><Fact label="经办人" value={item.handler || "—"} /><Fact label="完成时间" value={item.completedAt || "尚未完成"} /></div><ReturnItemsSummary item={item} /><Card><CardContent className="grid gap-3 p-4"><Fact label="退货原因" value={item.reason || "—"} /><Fact label="备注" value={item.remarks || "—"} /></CardContent></Card></div>; }
function CompleteDialog({target, pending, error, onClose, onConfirm}: {target: PurchaseReturnListItem | null; pending: boolean; error: string; onClose: () => void; onConfirm: () => void}) {
  return <ErpConfirmDialog open={Boolean(target)} onOpenChange={(open) => {if (!open) onClose();}} title="确认完成采购退货" description="将冲减采购单、处理现金或供应商抵扣，并把库存标记为退回或报废。" documentName={target ? `${target.returnNo} · ${target.productName} · ${formatCurrency(target.amount)} · ${target.settlementMode} · ${target.inventoryAction}` : undefined} confirmLabel="确认完成" pendingLabel="处理中…" pending={pending} error={error} onConfirm={onConfirm} />;
}
const Fact = ErpDetailFact;
function Metric({label, value, detail, icon, tone = "neutral"}: {label: string; value: string; detail?: string; icon: ReactNode; tone?: "neutral" | "warning"}) { return <ErpMetricCard label={label} value={value} detail={detail} icon={icon} tone={tone === "warning" ? "warning" : "info"} />; }
