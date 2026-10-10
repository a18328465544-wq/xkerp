import {keepPreviousData, useMutation, useQuery, useQueryClient} from "@tanstack/react-query";
import {useWorkspaceTabActivity} from "@/src/hooks/useWorkspaceTabRuntime";
import {useNavigate} from "@tanstack/react-router";
import type {SortingState} from "@tanstack/react-table";
import {AlertTriangle, CheckCircle2, Download, History, Plus, ShieldAlert, Wrench} from "lucide-react";
import {ErpMobileRecordRow, ErpListPage, type ErpFilterField} from "@/src/components/common";
import {useEffect, useMemo, useState, type ReactNode} from "react";
import {notify} from "@/src/utils/notification";
import {Button, Card} from "@/src/components/ui";
import {DashboardSection, ErpDetailDrawer, ErpDetailFact, ErpDetailFactGrid, ErpLoadingState, ErpMetricCard, ErpPageError, ErpStatusBadge, type QuickStatusItemData} from "@/src/components/common";
import {ApiError, aftersalesApi, queryKeys, type AuthSession} from "@/src/services/api";
import {invalidateErpDomains, refreshErpAfterDocument} from "@/src/services/api";
import {createCapabilities, useAuth} from "@/src/app/auth";
import {useTablePreferences} from "@/src/hooks/useTablePreferences";
import {useUrlSearchState} from "@/src/hooks/useUrlSearchState";
import {formatCurrency} from "@/src/lib/format";
import {aftersalesActiveStatusValues, aftersalesStatuses, aftersalesTypes, type AftersalesCreateFormValues, type AftersalesFilters, type AftersalesListItem, type AftersalesResolutionFormValues, type AftersalesWorkspaceSnapshot} from "@/src/types/aftersales";
import {AftersalesCreateDialog} from "../components/AftersalesCreateDialog";
import {AftersalesResolutionDialog} from "../components/AftersalesResolutionDialog";
import {createAftersalesColumns, formatDateTime, statusTone} from "../aftersales.columns";
import {aftersalesFiltersToSearch, defaultAftersalesFilters, filterAftersales, parseAftersalesFilters, sortAftersales} from "../aftersales.filters";

function useUrlState() {return useUrlSearchState({defaultValue: defaultAftersalesFilters, parse: parseAftersalesFilters, serialize: aftersalesFiltersToSearch});}

export function AftersalesWorkspacePage() {
  const {active} = useWorkspaceTabActivity();
  const {session, logout} = useAuth(); const {value: filters, commit} = useUrlState(); const allowed = createCapabilities(session).menu("aftersales");
  const workspaceQuery = useQuery({queryKey: queryKeys.aftersales.workspace(session?.user.id || "anonymous"), queryFn: ({signal}) => aftersalesApi.workspace(signal), enabled: active && Boolean(session && allowed), placeholderData: keepPreviousData, retry: false});
  if (!session) return <Card><ErpLoadingState title="正在验证售后维护权限" /></Card>;
  if (!allowed) return <ErpPageError title="当前账号没有售后维护权限" description="当前账号没有此页面的访问权限，请联系管理员开通。" />;
  return <AftersalesContent session={session} snapshot={workspaceQuery.data} pending={workspaceQuery.isPending} fetching={workspaceQuery.isFetching} error={workspaceQuery.error as Error | null} filters={filters} onFiltersChange={commit} onRetry={() => void workspaceQuery.refetch()} onAuthExpired={logout} />;
}

function AftersalesContent({session, snapshot, pending, fetching, error, filters, onFiltersChange, onRetry, onAuthExpired}: {session: AuthSession; snapshot?: AftersalesWorkspaceSnapshot; pending: boolean; fetching: boolean; error: Error | null; filters: AftersalesFilters; onFiltersChange: (filters: AftersalesFilters) => void; onRetry: () => void; onAuthExpired: () => void}) {
  const navigate = useNavigate(); const queryClient = useQueryClient(); const [sorting, setSorting] = useState<SortingState>([]); const {columnVisibility, setColumnVisibility, density, setDensity} = useTablePreferences<Record<string, boolean>>({feature: "aftersales", userId: session.user.id, defaultVisibility: {}, defaultDensity: "compact"}); const [detail, setDetail] = useState<AftersalesListItem | null>(null); const [createOpen, setCreateOpen] = useState(false); const [resolving, setResolving] = useState<AftersalesListItem | null>(null);
  const items = snapshot?.items || []; const candidates = snapshot?.candidates || [];
  const filtered = useMemo(() => sortAftersales(filterAftersales(items, filters), sorting), [filters, items, sorting]); const totalPages = Math.max(1, Math.ceil(filtered.length / filters.pageSize)); useEffect(() => {if (filters.page > totalPages) onFiltersChange({...filters, page: totalPages});}, [filters, onFiltersChange, totalPages]); const pageRows = filtered.slice((filters.page - 1) * filters.pageSize, filters.page * filters.pageSize);
  const goToReturns = () => {void navigate({to: "/sales/returns/new"});};
  const invalidate = () => invalidateErpDomains(queryClient, ["aftersales", "state", "inventory", "sales", "customers"]);
  const handleError = (caught: Error) => {if (caught instanceof ApiError && caught.isUnauthorized) {onAuthExpired(); return;} notify.error(caught.message);};
  const createMutation = useMutation({mutationFn: async (values: AftersalesCreateFormValues) => {const candidate = candidates.find((item) => item.inventoryId === values.candidateId); if (!candidate) throw new Error("所选库存卡已不存在，请刷新后重试"); if (candidate.activeClaimId) throw new Error(`该 SN 已存在处理中工单 ${candidate.activeClaimId}`); return aftersalesApi.create(values, candidate, session.user.displayName);}, onSuccess: async (created) => {notify.success("售后工单已登记，库存卡已进入售后中"); setCreateOpen(false); setDetail(created); await refreshErpAfterDocument(queryClient, ["state","aftersales","inventory","sales","finance","ai"]);}, onError: handleError});
  const resolveMutation = useMutation({mutationFn: async ({record, values}: {record: AftersalesListItem; values: AftersalesResolutionFormValues}) => aftersalesApi.resolve(record.id, values, session.user.displayName), onSuccess: async (updated) => {notify.success(updated.status === "已拒绝" ? "售后工单已拒绝" : "售后工单已结案"); setResolving(null); setDetail(updated); await invalidate();}, onError: handleError});
  const columns = useMemo(() => createAftersalesColumns({onOpen: setDetail, onReturn: goToReturns}), []);
  const activeCount = items.filter((item) => aftersalesActiveStatusValues.includes(item.status as (typeof aftersalesActiveStatusValues)[number])).length; const completeCount = items.filter((item) => item.status === "已完成").length; const repairCost = items.reduce((sum, item) => sum + item.repairCost, 0); const activeFilters = Number(Boolean(filters.keyword)) + Number(filters.status !== "all") + Number(filters.type !== "all");
  const quickStatus: QuickStatusItemData[] = [{icon: <ShieldAlert className="h-4 w-4" />, label: "待处理", value: `${activeCount} 件`, description: "待处理与检测中", tone: activeCount ? "warning" : "success"}, {icon: <Wrench className="h-4 w-4" />, label: "可登记 SN", value: `${candidates.filter((item) => !item.activeClaimId).length} 张`, description: "已售且已关联销售单", tone: "info"}];
  const exportRows = () => {const rows = [["售后编号", "销售单号", "客户", "联系方式", "商品", "SN", "类型", "状态", "客户反馈", "维修支出", "退款金额", "结论", "经办人", "登记时间"], ...filtered.map((item) => [item.id, item.salesInvoiceNo, item.customerName, item.contact, item.productName, item.serialNumber, item.type, item.status, item.description, item.repairCost, item.refundAmount, item.finalResult, item.handler || "", item.createdAt])]; const url = URL.createObjectURL(new Blob([`\uFEFF${rows.map((row) => row.map(csvCell).join(",")).join("\n")}`], {type: "text/csv;charset=utf-8"})); const link = document.createElement("a"); link.href = url; link.download = "售后工单.csv"; link.click(); URL.revokeObjectURL(url);};

  const setStatus = (status: AftersalesFilters["status"]) => onFiltersChange({...filters, status, page: 1});
  const filterFields: ErpFilterField[] = [
    {kind: "select", key: "status", label: "售后状态", width: "w-36", value: filters.status, defaultValue: "all", options: [{value: "all", label: "全部状态"}, ...aftersalesStatuses.map((value) => ({value, label: value}))], onChange: (status) => setStatus(status as AftersalesFilters["status"])},
    {kind: "select", key: "type", label: "售后类型", width: "w-36", value: filters.type, defaultValue: "all", options: [{value: "all", label: "全部类型"}, ...aftersalesTypes.map((value) => ({value, label: value}))], onChange: (type) => onFiltersChange({...filters, type: type as AftersalesFilters["type"], page: 1})},
  ];

  return <ErpListPage
    title="售后维护"
    subtitle="按已售 SN 登记并追踪维修、检测争议、换货与补差价；退货退款统一走销售退货。"
    countLabel={(count) => `${count} 件工单`}
    loading={pending}
    loadError={Boolean(error && !snapshot)}
    quickStatus={quickStatus}
    pageFrame="warehouse"
    metrics={[
      <MetricCard key="all" label="售后工单" value={`${items.length} 件`} detail="当前账号可见整库" icon={<History className="h-4 w-4" />} />,
      <MetricCard key="active" label="待处理 / 检测中" value={`${activeCount} 件`} detail="需要继续跟进" icon={<AlertTriangle className="h-4 w-4" />} tone={activeCount ? "warning" : "success"} />,
      <MetricCard key="done" label="已完成" value={`${completeCount} 件`} detail="已记录处理结论" icon={<CheckCircle2 className="h-4 w-4" />} tone="success" />,
      <MetricCard key="cost" label="累计维修支出" value={formatCurrency(repairCost)} detail="结案记录中的维修费用" icon={<Wrench className="h-4 w-4" />} tone={repairCost ? "warning" : "neutral"} />,
    ]}
    search={{value: filters.keyword, onChange: (keyword) => onFiltersChange({...filters, keyword, page: 1}), label: "搜索售后工单", placeholder: "工单、销售单、客户、SN、型号或问题描述", phonePlaceholder: "搜索工单、客户、SN"}}
    filters={filterFields}
    onResetFilters={() => onFiltersChange(defaultAftersalesFilters)}
    quickFilters={[
      {label: "全部", active: filters.status === "all", onSelect: () => setStatus("all")},
      {label: "待处理", active: filters.status === "待处理", onSelect: () => setStatus("待处理")},
      {label: "已完成", active: filters.status === "已完成", onSelect: () => setStatus("已完成")},
    ]}
    defaultSortLabel="默认排序"
    primaryAction={{label: "登记售后", icon: <Plus className="h-4 w-4" />, onClick: () => {createMutation.reset(); setCreateOpen(true);}}}
    pageActions={[{label: "办理销售退货", onClick: goToReturns}]}
    actions={[{label: "导出", icon: <Download className="h-4 w-4" />, onClick: exportRows}]}
    onRefresh={onRetry}
    refreshing={fetching}
    resultsLabel="全部工单"
    tableTitle="售后工单流水"
    tableDescription="点击行查看完整反馈、处理结论和费用；历史退货工单只读并引导到销售退货。"
    columnSettings={{columns, visibility: columnVisibility, onVisibilityChange: setColumnVisibility, density, onDensityChange: setDensity}}
    table={{ariaLabel: "售后工单流水", columns, data: pageRows, getRowId: (row) => row.id, mobileShowDetailAction: false, mobileRow: (item) => (
        <ErpMobileRecordRow
          title={item.model || item.productName || item.serialNumber || item.id}
          subtitle={item.customerName}
          meta={`${item.serialNumber ? `SN: ${item.serialNumber} · ` : ""}${item.type} · ${item.createdAt?.slice(0, 10)}`}
          statusPlacement="title"
          status={<ErpStatusBadge label={item.status} tone={statusTone(item.status)} />}
          amountLabel={item.repairCost ? "维修支出" : undefined}
          amount={item.repairCost ? formatCurrency(item.repairCost) : undefined}
          onOpen={() => setDetail(item)}
        />
      ), loading: pending, fetching, error, errorTitle: "售后工单加载失败", emptyTitle: "暂无匹配售后工单", emptyDescription: activeFilters ? "请调整搜索或筛选条件。" : "点击登记售后创建第一张工单。", onRetry, onRowClick: setDetail, manualSorting: true, sorting, onSortingChange: setSorting, page: filters.page, pageSize: filters.pageSize, total: filtered.length, onPageChange: (page) => onFiltersChange({...filters, page}), onPageSizeChange: (pageSize) => onFiltersChange({...filters, page: 1, pageSize}), enableColumnResizing: true, stickyHeader: true}}
    overlayOpen={Boolean(detail || createOpen || resolving)}
    overlays={<>
      <AftersalesDetailDrawer record={detail} onClose={() => setDetail(null)} onResolve={() => {if (detail) {resolveMutation.reset(); setResolving(detail);}}} onReturn={goToReturns} />
      <AftersalesCreateDialog open={createOpen} candidates={candidates} pending={createMutation.isPending} error={createMutation.error instanceof Error ? createMutation.error.message : undefined} onOpenChange={setCreateOpen} onSubmit={async (values) => {await createMutation.mutateAsync(values);}} />
      <AftersalesResolutionDialog record={resolving} pending={resolveMutation.isPending} error={resolveMutation.error instanceof Error ? resolveMutation.error.message : undefined} onClose={() => setResolving(null)} onSubmit={async (values) => {if (resolving) await resolveMutation.mutateAsync({record: resolving, values});}} />
    </>}
  />;
}

function AftersalesDetailDrawer({record, onClose, onResolve, onReturn}: {record: AftersalesListItem | null; onClose: () => void; onResolve: () => void; onReturn: () => void}) {const active = record && ["待处理", "检测中"].includes(record.status); return <ErpDetailDrawer modal={false} resizable drawerKey="aftersales-detail" defaultWidth={720} minWidth={560} maxWidth={920} open={Boolean(record)} onOpenChange={(open) => {if (!open) onClose();}} title={record?.id || "售后工单"} description={record ? `${record.salesInvoiceNo} · ${formatDateTime(record.createdAt)}` : undefined} footer={record ? record.historicalReturn ? <Button className="w-full" variant="primary" onClick={onReturn}>前往销售退货</Button> : active ? <Button className="w-full" variant="primary" onClick={onResolve}>处理并结案</Button> : undefined : undefined}><div className="space-y-5">{record && <><div className="flex flex-wrap gap-2"><ErpStatusBadge label={record.status} tone={statusTone(record.status)} /><ErpStatusBadge label={record.type} tone={record.historicalReturn ? "warning" : "neutral"} /></div><ErpDetailFactGrid><Fact label="客户" value={record.customerName} /><Fact label="联系方式" value={record.contact || "未记录"} /><Fact label="商品" value={record.model || record.productName} /><Fact label="SN" value={record.serialNumber || "未记录"} /><Fact label="库存编号" value={record.inventoryNo || "未记录"} /><Fact label="经办人" value={record.handler || "未记录"} /><Fact label="维修支出" value={formatCurrency(record.repairCost)} /><Fact label="退款记录" value={formatCurrency(record.refundAmount)} /></ErpDetailFactGrid><DashboardSection title="客户反馈"><p className="whitespace-pre-wrap text-sm leading-relaxed text-[var(--erp-color-text-secondary)]">{record.description || "未记录"}</p></DashboardSection>{record.finalResult && <DashboardSection title="处理结论"><p className="whitespace-pre-wrap text-sm leading-relaxed text-[var(--erp-color-text-secondary)]">{record.finalResult}</p></DashboardSection>}{record.historicalReturn && <div className="rounded-[var(--erp-radius-lg)] bg-[var(--erp-color-warning-soft)] p-4 text-sm leading-relaxed text-[var(--erp-color-warning)]">这是历史售后退货记录。新退货必须在销售退货中关联原销售单处理，此处不直接结案或退款。</div>}</>}</div></ErpDetailDrawer>;}

function MetricCard({label, value, detail, icon, tone = "neutral"}: {label: string; value: string; detail?: string; icon: ReactNode; tone?: "neutral" | "info" | "success" | "warning"}) {return <ErpMetricCard label={label} value={value} detail={detail} icon={icon} tone={tone} />;}
// Detail facts use the shared component directly so drawer spacing and tones
// cannot drift from the rest of the ERP.
const Fact = ErpDetailFact;
function csvCell(value: string | number) {const text = String(value); return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;}
