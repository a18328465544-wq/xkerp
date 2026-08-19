import {keepPreviousData, useMutation, useQuery, useQueryClient} from "@tanstack/react-query";
import {useNavigate} from "@tanstack/react-router";
import type {VisibilityState} from "@tanstack/react-table";
import {Banknote, CheckCircle2, ClipboardCheck, Download, Filter, ListFilter, LockKeyhole, Plus, RefreshCw, Search, Undo2} from "lucide-react";
import {useCallback, useEffect, useMemo, useState, type ReactNode} from "react";
import {toast} from "sonner";
import {Button, Card, CardContent, Dialog, Input, Select} from "@/src/components/ui";
import {ErpColumnVisibilityMenu, ErpDataTable, ErpDetailDrawer, ErpFilterBar, ErpListPageFrame, ErpLoadingState, ErpPageError, ErpPageHeader, ErpStatusBadge, MetricsRegion, type QuickStatusItemData} from "@/src/components/common";
import {ApiError, queryKeys, returnsApi} from "@/src/services/api";
import type {AuthSession} from "@/src/services/api";
import {createCapabilities, useAuth} from "@/src/app/auth";
import {useTablePreferences} from "@/src/hooks/useTablePreferences";
import {useUrlSearchState} from "@/src/hooks/useUrlSearchState";
import {formatCurrency} from "@/src/lib/format";
import type {SalesReturnListFilters, SalesReturnListItem} from "@/src/types/returns";
import {createSalesReturnColumns} from "../sales-return.columns";
import {countActiveSalesReturnFilters, defaultSalesReturnListFilters, parseSalesReturnListFilters, salesReturnListFiltersToSearch} from "../sales-return.filters";
import {csvCell, DeleteReturnDialog, ReturnEditDialog, type ReturnEditDraft} from "../components/ReturnMutationDialogs";

const statusOptions = [{value: "", label: "全部处理状态"}, {value: "待处理", label: "待处理"}, {value: "已完成", label: "已完成"}, {value: "已作废", label: "已作废"}];

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
  const {session, logout} = useAuth();
  const {filters, commitFilters, detailId, commitDetail} = useSalesReturnUrlState();
  const allowed = createCapabilities(session).menu("return_sales") || createCapabilities(session).menu("return_orders");
  const listQuery = useQuery({
    queryKey: queryKeys.returns.salesList(filters),
    queryFn: ({signal}) => returnsApi.listSales(filters, signal),
    enabled: Boolean(session && allowed),
    placeholderData: keepPreviousData,
    retry: false,
  });
  useEffect(() => {if (listQuery.error instanceof ApiError && listQuery.error.isUnauthorized) logout();}, [listQuery.error, logout]);
  if (!session) return <Card><ErpLoadingState title="正在验证销售退货权限" /></Card>;
  if (!session || !allowed) return <ErpPageError title="当前账号没有销售退货权限" description="服务器已拒绝 return_sales / return_orders 菜单访问，请联系管理员授权。" />;
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
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [completeTarget, setCompleteTarget] = useState<SalesReturnListItem | null>(null);
  const [editTarget, setEditTarget] = useState<SalesReturnListItem | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<SalesReturnListItem | null>(null);
  const [editDraft, setEditDraft] = useState<ReturnEditDraft>({handler: "", reason: "", remarks: ""});
  const {columnVisibility, setColumnVisibility, density, setDensity} = useTablePreferences<VisibilityState>({feature: "sales-returns", userId: session.user.id, defaultVisibility: {}});
  const items = query.data?.items || [];
  const selectedDetail = items.find((item) => item.id === detailId || item.returnNo === detailId) || null;
  const activeFilterCount = countActiveSalesReturnFilters(filters);
  const pageAmount = items.reduce((sum, item) => sum + item.amount, 0);
  const pendingOnPage = items.filter((item) => item.status === "待处理").length;
  const completedOnPage = items.filter((item) => item.status === "已完成").length;
  const canEdit = session.permissions.canEditHistory;
  const canDelete = session.permissions.canDelete;
  const invalidateReturns = () => Promise.all([
    queryClient.invalidateQueries({queryKey: queryKeys.returns.all()}),
    queryClient.invalidateQueries({queryKey: queryKeys.sales.all()}),
    queryClient.invalidateQueries({queryKey: queryKeys.inventory.all()}),
    queryClient.invalidateQueries({queryKey: queryKeys.state.all()}),
  ]);
  const handleMutationError = (error: Error) => {
    if (error instanceof ApiError && error.isUnauthorized) {
      onAuthExpired();
      return;
    }
    toast.error(error.message);
  };
  const completeMutation = useMutation({
    mutationFn: (item: SalesReturnListItem) => returnsApi.complete(item.id),
    onSuccess: (result) => {
      toast.success(`${result.returnNo} 已完成退货处理`);
      setCompleteTarget(null);
      void invalidateReturns();
    },
    onError: handleMutationError,
  });
  const updateMutation = useMutation({
    mutationFn: ({item, values}: {item: SalesReturnListItem; values: ReturnEditDraft}) => returnsApi.update(item.id, values),
    onSuccess: (result) => {
      toast.success(`${result?.returnNo || editTarget?.returnNo || "退货单"} 已保存修改`);
      setEditTarget(null);
      void invalidateReturns();
    },
    onError: handleMutationError,
  });
  const deleteMutation = useMutation({
    mutationFn: (item: SalesReturnListItem) => returnsApi.remove(item.id),
    onSuccess: (result) => {
      toast.success(`${result?.returnNo || deleteTarget?.returnNo || "退货单"} 已删除${deleteTarget?.status === "已完成" ? "并完成冲销" : ""}`);
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
  const columns = useMemo(() => createSalesReturnColumns({onDetail: openDetail, onComplete: (item) => {completeMutation.reset(); setCompleteTarget(item);}, onEdit: openEdit, onDelete: openDelete, canEdit, canDelete}), [canDelete, canEdit, completeMutation, openDelete, openDetail, openEdit]);
  const updateFilters = (patch: Partial<SalesReturnListFilters>) => commitFilters({...filters, ...patch, page: 1});
  const quickStatus: QuickStatusItemData[] = [
    {icon: <ListFilter className="h-4 w-4" />, label: "筛选状态", value: activeFilterCount ? `${activeFilterCount} 项` : "全部", description: "已同步到当前 URL", tone: activeFilterCount ? "info" : "neutral"},
    {icon: <ClipboardCheck className="h-4 w-4" />, label: "待处理（本页）", value: `${pendingOnPage} 单`, description: "完成后才变更退款与库存", tone: pendingOnPage ? "warning" : "success"},
    {icon: <LockKeyhole className="h-4 w-4" />, label: "权限边界", value: "服务端校验", description: "按退货类型裁剪数据", tone: "neutral"},
  ];
  const exportCurrentPage = () => {
    const rows = [
      ["退货单号", "状态", "关联销售单", "客户", "商品", "SN", "退款金额", "退款方式", "库存处理", "经办人", "退货日期", "退货原因", "备注"],
      ...items.map((item) => [item.returnNo, item.status, item.relatedDocNo, item.partyName, item.productName, item.sn, item.amount, item.settlementMode, item.inventoryAction, item.handler, item.date, item.reason, item.remarks]),
    ];
    const csv = `\uFEFF${rows.map((row) => row.map(csvCell).join(",")).join("\n")}`;
    const url = URL.createObjectURL(new Blob([csv], {type: "text/csv;charset=utf-8"}));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `销售退货-第${filters.page}页.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  };


  return <ErpListPageFrame>
    <ErpPageHeader title="销售退货" subtitle="查看退货单，完成原路退款与库存处理；编辑和删除由现有权限及服务端冲销规则控制。" quickStatus={quickStatus} actions={<><Button type="button" size="sm" variant="secondary" onClick={() => void query.refetch()} disabled={query.isFetching}><RefreshCw className={`h-4 w-4 ${query.isFetching ? "animate-spin" : ""}`} />刷新</Button><Button type="button" size="sm" variant="secondary" onClick={exportCurrentPage} disabled={!items.length}><Download className="h-4 w-4" />导出当前页</Button><Button type="button" size="sm" variant="primary" onClick={() => void navigate({to: "/sales/returns/new"})}><Plus className="h-4 w-4" />新建销售退货</Button></>} />
    <MetricsRegion>
      <MetricCard label="当前结果" value={`${query.data?.meta.total || 0} 单`} detail={filters.status ? `${filters.status}筛选结果` : "服务端返回总数"} icon={<Undo2 className="h-4 w-4" />} />
      <MetricCard label="退款金额（本页）" value={formatCurrency(pageAmount)} detail="仅汇总当前页真实记录" icon={<Banknote className="h-4 w-4" />} />
      <MetricCard label="待处理（本页）" value={`${pendingOnPage} 单`} detail="完成动作会触发业务变更" icon={<ClipboardCheck className="h-4 w-4" />} tone={pendingOnPage ? "warning" : "neutral"} />
      <MetricCard label="已完成（本页）" value={`${completedOnPage} 单`} detail="退款与库存已由服务端处理" icon={<CheckCircle2 className="h-4 w-4" />} />
    </MetricsRegion>
    <ErpFilterBar actions={<Button type="button" variant="ghost" size="sm" onClick={() => commitFilters(defaultSalesReturnListFilters)} disabled={!activeFilterCount}><Filter className="h-4 w-4" />重置筛选</Button>}>
      <div className="relative min-w-[280px] flex-1"><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--erp-color-text-muted)]" /><Input className="pl-9" value={filters.keyword} onChange={(event) => updateFilters({keyword: event.target.value})} placeholder="搜索退货单、销售单、客户、商品、SN 或原因" aria-label="搜索销售退货" /></div>
      <Select className="w-40" value={filters.status} options={statusOptions} onValueChange={(value) => updateFilters({status: value as SalesReturnListFilters["status"]})} aria-label="退货处理状态筛选" />
    </ErpFilterBar>
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="flex items-center gap-2"><ErpColumnVisibilityMenu columns={columns} visibility={columnVisibility} onVisibilityChange={setColumnVisibility} /><div className="inline-flex rounded-[var(--erp-radius-md)] border border-[var(--erp-color-border)] bg-[var(--erp-color-surface)] p-0.5"><Button type="button" size="sm" variant={density === "comfortable" ? "secondary" : "ghost"} onClick={() => setDensity("comfortable")}>舒适</Button><Button type="button" size="sm" variant={density === "compact" ? "secondary" : "ghost"} onClick={() => setDensity("compact")}>紧凑</Button></div></div>
    </div>
    <ErpDataTable columns={columns} data={items} getRowId={(item) => item.id} loading={query.isPending} fetching={query.isFetching} error={query.error as Error | null} errorTitle="销售退货加载失败" emptyTitle="暂无销售退货" emptyDescription={activeFilterCount ? "当前筛选没有匹配的销售退货记录。" : "服务器当前没有销售退货记录。"} onRetry={() => void query.refetch()} onRowClick={openDetail} page={query.data?.meta.page || filters.page} pageSize={query.data?.meta.pageSize || filters.pageSize} total={query.data?.meta.total || 0} onPageChange={(page) => commitFilters({...filters, page})} onPageSizeChange={(pageSize) => commitFilters({...filters, page: 1, pageSize})} columnVisibility={columnVisibility} onColumnVisibilityChange={setColumnVisibility} enableColumnResizing density={density} stickyHeader />
    <ErpDetailDrawer open={Boolean(detailId)} onOpenChange={(open) => {if (!open) commitDetail(null);}} title={selectedDetail?.returnNo || detailId || "销售退货详情"} description="详情来自真实退货列表响应；退款、库存和冲销均由现有服务端动作处理。" footer={selectedDetail && <div className="flex flex-wrap justify-end gap-2">{canDelete && <Button type="button" size="sm" variant="danger" onClick={() => openDelete(selectedDetail)}>{selectedDetail.status === "已完成" ? "删除并冲销" : "删除"}</Button>}{canEdit && <Button type="button" size="sm" variant="secondary" onClick={() => openEdit(selectedDetail)}>编辑资料</Button>}{selectedDetail.status === "待处理" && <Button type="button" size="sm" variant="primary" onClick={() => setCompleteTarget(selectedDetail)}><CheckCircle2 className="h-4 w-4" />完成退货处理</Button>}</div>}>
      {selectedDetail ? <SalesReturnDetail item={selectedDetail} /> : <div className="rounded-[var(--erp-radius-md)] bg-[var(--erp-color-warning-soft)] p-4 text-sm text-[var(--erp-color-warning)]">当前页未找到该退货单。它可能位于其他分页、已被删除，或当前账号无权查看。</div>}
    </ErpDetailDrawer>
    <CompleteReturnDialog target={completeTarget} pending={completeMutation.isPending} error={completeMutation.error instanceof Error ? completeMutation.error.message : ""} onClose={() => {if (!completeMutation.isPending) setCompleteTarget(null);}} onConfirm={() => {if (completeTarget) completeMutation.mutate(completeTarget);}} />
    <ReturnEditDialog target={editTarget} draft={editDraft} pending={updateMutation.isPending} error={updateMutation.error instanceof Error ? updateMutation.error.message : ""} onClose={() => {if (!updateMutation.isPending) setEditTarget(null);}} onDraftChange={setEditDraft} onConfirm={() => {if (editTarget) updateMutation.mutate({item: editTarget, values: editDraft});}} />
    <DeleteReturnDialog target={deleteTarget} pending={deleteMutation.isPending} error={deleteMutation.error instanceof Error ? deleteMutation.error.message : ""} onClose={() => {if (!deleteMutation.isPending) setDeleteTarget(null);}} onConfirm={() => {if (deleteTarget) deleteMutation.mutate(deleteTarget);}} />
  </ErpListPageFrame>;
}

function SalesReturnDetail({item}: {item: SalesReturnListItem}) {
  return <div className="space-y-5">
    <div className="grid gap-3 sm:grid-cols-2"><DetailFact label="处理状态" value={item.status} /><DetailFact label="退货日期" value={item.date || "—"} /><DetailFact label="关联销售单" value={item.relatedDocNo || "—"} /><DetailFact label="原库存卡片" value={item.sourceInventoryId || "—"} /><DetailFact label="客户" value={item.partyName || "—"} /><DetailFact label="联系方式" value={item.contact || "—"} /><DetailFact label="商品" value={item.productName} /><DetailFact label="SN" value={item.sn || "—"} /><DetailFact label="退款金额" value={formatCurrency(item.amount)} /><DetailFact label="退款方式" value={item.settlementMode || "—"} /><DetailFact label="库存处理" value={item.inventoryAction || "—"} /><DetailFact label="责任归属" value={item.responsibility || "—"} /><DetailFact label="经办人" value={item.handler || "—"} /><DetailFact label="完成时间" value={item.completedAt || "尚未完成"} /></div>
    <Card><CardContent className="grid gap-4 p-4"><DetailFact label="退货原因" value={item.reason || "—"} /><DetailFact label="备注" value={item.remarks || "—"} /></CardContent></Card>
  </div>;
}

function CompleteReturnDialog({target, pending, error, onClose, onConfirm}: {target: SalesReturnListItem | null; pending: boolean; error: string; onClose: () => void; onConfirm: () => void}) {
  return <Dialog.Root open={Boolean(target)} onOpenChange={(open) => {if (!open) onClose();}}><Dialog.Portal><Dialog.Backdrop className="fixed inset-0 erp-modal-layer bg-[var(--erp-color-backdrop)] backdrop-blur-sm" /><Dialog.Viewport className="fixed inset-0 erp-modal-layer flex items-center justify-center p-4"><Dialog.Popup className="w-full max-w-lg rounded-[var(--erp-radius-xl)] border border-[var(--erp-color-border)] bg-[var(--erp-color-surface)] p-5 shadow-[var(--erp-shadow-popover)]"><Dialog.Title className="text-base font-bold">确认完成销售退货</Dialog.Title><Dialog.Description className="mt-2 text-sm text-[var(--erp-color-text-secondary)]">服务端将按退货单处理退款、库存状态和原销售单金额。这不是只修改页面状态的操作。</Dialog.Description>{target && <div className="mt-4 rounded-[var(--erp-radius-md)] bg-[var(--erp-color-surface-muted)] p-4"><div className="flex items-center justify-between gap-3"><span className="font-mono text-xs font-bold text-[var(--erp-color-primary)]">{target.returnNo}</span><ErpStatusBadge label={target.status} tone="warning" /></div><p className="mt-2 font-semibold">{target.productName} · {target.partyName || "未命名客户"}</p><p className="mt-1 text-sm text-[var(--erp-color-text-secondary)]">退款 {formatCurrency(target.amount)} · {target.inventoryAction || "未记录库存处理"}</p></div>}{error && <p role="alert" className="mt-4 rounded-[var(--erp-radius-md)] bg-[var(--erp-color-danger-soft)] p-3 text-xs text-[var(--erp-color-danger)]">{error}</p>}<div className="mt-5 flex justify-end gap-2"><Button type="button" variant="secondary" disabled={pending} onClick={onClose}>取消</Button><Button type="button" variant="primary" disabled={pending} onClick={onConfirm}>{pending ? <RefreshCw className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}确认完成</Button></div></Dialog.Popup></Dialog.Viewport></Dialog.Portal></Dialog.Root>;
}

function DetailFact({label, value}: {label: string; value: string}) { return <div className="rounded-[var(--erp-radius-md)] bg-[var(--erp-color-surface-muted)] p-3"><p className="text-xs text-[var(--erp-color-text-muted)]">{label}</p><p className="mt-1 break-words text-sm font-semibold text-[var(--erp-color-text)]">{value}</p></div>; }

function MetricCard({label, value, detail, icon, tone = "neutral"}: {label: string; value: string; detail: string; icon: ReactNode; tone?: "neutral" | "warning"}) { return <Card><CardContent className="min-h-[104px] p-4"><div className="flex items-center justify-between gap-3"><p className="text-xs font-semibold text-[var(--erp-color-text-secondary)]">{label}</p><span className={tone === "warning" ? "text-[var(--erp-color-warning)]" : "text-[var(--erp-color-primary)]"}>{icon}</span></div><p className={`mt-2 font-mono text-2xl font-bold ${tone === "warning" ? "text-[var(--erp-color-warning)]" : "text-[var(--erp-color-text)]"}`}>{value}</p><p className="mt-1 text-xs text-[var(--erp-color-text-muted)]">{detail}</p></CardContent></Card>; }
