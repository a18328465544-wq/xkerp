import {useErpPhone} from "@/src/hooks/useErpViewport";
import {keepPreviousData, useMutation, useQuery, useQueryClient} from "@tanstack/react-query";
import {useWorkspaceTabActivity} from "@/src/hooks/useWorkspaceTabRuntime";
import type {OnChangeFn, SortingState, VisibilityState} from "@tanstack/react-table";
import {ErpListPage, type ErpFilterField} from "@/src/components/common";
import {BadgeDollarSign, CircleDollarSign, Download, Plus, Star, Users} from "lucide-react";
import {ErpEntityThumbnail} from "@/src/components/common";
import {useEffect, useMemo, useState, type ReactNode} from "react";
import {notify} from "@/src/utils/notification";
import {Button, Card} from "@/src/components/ui";
import {DashboardSection, ErpConfirmDialog, ErpDetailDrawer, ErpDetailFact, ErpLoadingState, ErpMetricCard, ErpPageError, ErpStatusBadge, type QuickStatusItemData} from "@/src/components/common";
import {ApiError, customersApi, queryKeys, type AuthSession} from "@/src/services/api";
import {invalidateErpDomains} from "@/src/services/api";
import {createCapabilities, useAuth} from "@/src/app/auth";
import {useTablePreferences} from "@/src/hooks/useTablePreferences";
import {useDebouncedValue} from "@/src/hooks/useDebouncedValue";
import {useUrlSearchState} from "@/src/hooks/useUrlSearchState";
import {formatCurrency} from "@/src/lib/format";
import type {CustomerDirectoryFilters, CustomerDirectoryItem, CustomerRecordFormValues} from "@/src/types/customer";
import {customerLevels} from "@/src/types/customer";
import {createCustomerColumns, customerLevelTone} from "../customer.columns";
import {customerFiltersToSearch, defaultCustomerFilters, parseCustomerFilters} from "../customer.filters";
import {CustomerRecordDialog} from "../components/CustomerRecordDialog";

function useCustomerUrlState() {
  return useUrlSearchState({defaultValue: defaultCustomerFilters, parse: parseCustomerFilters, serialize: customerFiltersToSearch});
}

export function CustomerDirectoryPage() {
  const {active} = useWorkspaceTabActivity();
  const {session, logout} = useAuth();
  const {value: filters, commit: commitFilters} = useCustomerUrlState();
  const [sorting, setSorting] = useState<SortingState>([]);
  const debouncedKeyword = useDebouncedValue(filters.keyword);
  const requestFilters = useMemo(() => ({...filters, keyword: debouncedKeyword}), [debouncedKeyword, filters]);
  const allowed = createCapabilities(session).menu("customers");
  const listQuery = useQuery({queryKey: queryKeys.customers.directory({showProfit: Boolean(session?.permissions.showProfit)}, requestFilters, sorting), queryFn: ({signal}) => customersApi.list(requestFilters, sorting, {showProfit: Boolean(session?.permissions.showProfit)}, signal), enabled: active && Boolean(session && allowed), placeholderData: keepPreviousData, retry: false});
  useEffect(() => {if (listQuery.error instanceof ApiError && listQuery.error.isUnauthorized) logout();}, [listQuery.error, logout]);
  if (!session) return <Card><ErpLoadingState title="正在验证客户档案权限" /></Card>;
  if (!session || !allowed) return <ErpPageError title="当前账号没有客户档案权限" description="当前账号没有此页面的访问权限，请联系管理员开通。" />;
  return <CustomerDirectoryContent session={session} query={listQuery} filters={filters} sorting={sorting} onSortingChange={setSorting} onFiltersChange={commitFilters} onAuthExpired={logout} />;
}

function CustomerDirectoryContent({session, query, filters, sorting, onSortingChange, onFiltersChange, onAuthExpired}: {session: AuthSession; query: ReturnType<typeof useQuery<Awaited<ReturnType<typeof customersApi.list>>>>; filters: CustomerDirectoryFilters; sorting: SortingState; onSortingChange: OnChangeFn<SortingState>; onFiltersChange: (filters: CustomerDirectoryFilters) => void; onAuthExpired: () => void}) {
  const queryClient = useQueryClient();
  const {columnVisibility, setColumnVisibility, density, setDensity} = useTablePreferences<VisibilityState>({feature: "customers", userId: session.user.id, defaultVisibility: {}});
  const [detail, setDetail] = useState<CustomerDirectoryItem | null>(null);
  const [editing, setEditing] = useState<CustomerDirectoryItem | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleting, setDeleting] = useState<CustomerDirectoryItem | null>(null);
  const customers = query.data?.customers || [];
  const canEdit = createCapabilities(session).menu("crm");
  const canDelete = session.permissions.canDelete;

  const total = query.data?.total || 0;
  const totalPages = Math.max(1, Math.ceil(total / filters.pageSize));
  useEffect(() => {if (filters.page > totalPages) onFiltersChange({...filters, page: totalPages});}, [filters, onFiltersChange, totalPages]);
  const invalidate = () => invalidateErpDomains(queryClient, ["customers", "state", "crm"]);
  const handleMutationError = (error: Error) => {if (error instanceof ApiError && error.isUnauthorized) {onAuthExpired(); return;} notify.error(error.message);};
  const saveMutation = useMutation({mutationFn: ({values, current}: {values: CustomerRecordFormValues; current: CustomerDirectoryItem | null}) => current ? customersApi.update(current.id, values, session.permissions) : customersApi.create(values, session.permissions), onSuccess: async (customer) => {notify.success(`${customer.name} 已保存`); setDialogOpen(false); setEditing(null); setDetail(customer); await invalidate();}, onError: handleMutationError});
  const deleteMutation = useMutation({mutationFn: (id: string) => customersApi.remove(id), onSuccess: async () => {notify.success("客户档案已删除"); setDeleting(null); setDetail(null); await invalidate();}, onError: handleMutationError});
  const openCreate = () => {setEditing(null); setDialogOpen(true); saveMutation.reset();};
  const openEdit = (customer: CustomerDirectoryItem) => {if (!canEdit) return; setEditing(customer); setDialogOpen(true); saveMutation.reset();};
  const columns = useMemo(() => createCustomerColumns({showProfit: session.permissions.showProfit, canEdit, canDelete, onEdit: openEdit, onDelete: setDeleting}), [canDelete, canEdit, session.permissions.showProfit]);
  const coreCount = query.data?.summary.coreCount || 0;
  const receivable = query.data?.summary.receivable || 0;
  const payable = query.data?.summary.payable || 0;
  const activeFilters = Number(Boolean(filters.keyword)) + Number(filters.type !== "all") + Number(filters.channel !== "all") + Number(filters.level !== "all");
  const quickStatus: QuickStatusItemData[] = [
    {icon: <Star className="h-4 w-4" />, label: "核心客户", value: `${coreCount} 位`, description: "核心身份固定 S 级", tone: coreCount ? "info" : "neutral"},
  ];

  const exportCustomers = () => {
    const rows = [["档案编号", "客户名称", "联系方式", "类型", "来源", "等级", "CRM状态", "负责人", "累计交易", ...(session.permissions.showProfit ? ["累计利润"] : []), "应收", "应付", "最近交易", "备注"], ...customers.map((item) => [item.id, item.name, item.contact, item.type, item.source, item.level, item.crmStatus, item.owner || "", item.totalAmount, ...(session.permissions.showProfit ? [item.totalProfit || 0] : []), item.receivableBalance, item.payableBalance, item.lastDealTime || "", item.remarks || ""])];
    const csv = `\uFEFF${rows.map((row) => row.map(csvCell).join(",")).join("\n")}`;
    const url = URL.createObjectURL(new Blob([csv], {type: "text/csv;charset=utf-8"}));
    const link = document.createElement("a"); link.href = url; link.download = "客户档案.csv"; link.click(); URL.revokeObjectURL(url);
  };

  const filterFields: ErpFilterField[] = [
    {kind: "select", key: "type", label: "客户类型", width: "w-40", value: filters.type, defaultValue: "all", options: [{value: "all", label: "全部类型"}, ...(query.data?.types || []).map((value) => ({value, label: value}))], onChange: (type) => onFiltersChange({...filters, type, page: 1})},
    {kind: "select", key: "channel", label: "客户来源", width: "w-36", value: filters.channel, defaultValue: "all", options: [{value: "all", label: "全部来源"}, ...(query.data?.channels || []).map((value) => ({value, label: value}))], onChange: (channel) => onFiltersChange({...filters, channel, page: 1})},
    {kind: "select", key: "level", label: "客户等级", width: "w-32", value: filters.level, defaultValue: "all", options: [{value: "all", label: "全部等级"}, ...customerLevels.map((value) => ({value, label: value}))], onChange: (level) => onFiltersChange({...filters, level, page: 1})},
  ];

  return <ErpListPage
    title="客户档案"
    phoneTitle="客户"
    subtitle="集中维护个人客户的身份、等级、联系方式和往来余额。"
    countLabel={(count) => `${count} 位客户`}
    loading={query.isPending}
    loadError={Boolean(query.error && !query.data)}
    quickStatus={quickStatus}
    metrics={[
      <MetricCard key="total" label="客户总数" value={`${total} 位`} icon={<Users className="h-4 w-4" />} />,
      <MetricCard key="core" label="核心 / S级" value={`${coreCount} 位`} icon={<Star className="h-4 w-4" />} tone="info" />,
      <MetricCard key="receivable" label="应收余额" value={formatCurrency(receivable)} icon={<BadgeDollarSign className="h-4 w-4" />} tone={receivable ? "warning" : "success"} />,
      <MetricCard key="payable" label="应付余额" value={formatCurrency(payable)} icon={<CircleDollarSign className="h-4 w-4" />} tone={payable ? "info" : "success"} />,
    ]}
    search={{value: filters.keyword, onChange: (keyword) => onFiltersChange({...filters, keyword, page: 1}), label: "搜索客户档案", placeholder: "客户名称、电话、微信、档案编号或备注", phonePlaceholder: "搜索名称、电话、微信"}}
    filters={filterFields}
    onResetFilters={() => onFiltersChange(defaultCustomerFilters)}
    quickFilters={[
      {label: "全部", active: filters.level === "all", onSelect: () => onFiltersChange({...filters, level: "all", page: 1})},
      {label: "核心 / S级", active: filters.level === "S级", onSelect: () => onFiltersChange({...filters, level: "S级", page: 1})},
    ]}
    defaultSortLabel="最近交易"
    primaryAction={{label: "新建客户", icon: <Plus className="h-4 w-4" />, onClick: openCreate}}
    actions={[{label: "导出", icon: <Download className="h-4 w-4" />, onClick: exportCustomers}]}
    onRefresh={() => void query.refetch()}
    refreshing={query.isFetching}
    resultsLabel="全部客户"
    tableTitle="个人客户明细"
    columnSettings={{columns, visibility: columnVisibility, onVisibilityChange: setColumnVisibility, density, onDensityChange: setDensity}}
    table={{ariaLabel: "个人客户明细", columns, data: customers, getRowId: (row) => row.id, mobileRow: "columns", mobileEntity: "customer", loading: query.isPending, fetching: query.isFetching, error: query.error as Error | null, errorTitle: "客户档案加载失败", emptyTitle: "暂无匹配客户", emptyDescription: activeFilters ? "请调整搜索或筛选条件。" : "点击新建客户创建第一份档案。", onRetry: () => void query.refetch(), onRowClick: setDetail, manualSorting: true, sorting, onSortingChange, page: filters.page, pageSize: filters.pageSize, total, onPageChange: (page) => onFiltersChange({...filters, page}), onPageSizeChange: (pageSize) => onFiltersChange({...filters, page: 1, pageSize}), enableColumnResizing: true, stickyHeader: true}}
    sheetExtra={<dl className="erp-customer-filter-summary"><div><dt>核心 / S级</dt><dd>{coreCount} 位</dd></div><div><dt>应收余额</dt><dd>{formatCurrency(receivable)}</dd></div><div><dt>应付余额</dt><dd>{formatCurrency(payable)}</dd></div></dl>}
    overlayOpen={Boolean(detail || dialogOpen || deleting)}
    overlays={<>
      <CustomerDetailDrawer customer={detail} showProfit={session.permissions.showProfit} canEdit={canEdit} onClose={() => setDetail(null)} onEdit={() => {if (detail) openEdit(detail);}} />
      <CustomerRecordDialog open={dialogOpen} customer={editing} channels={query.data?.channels || []} types={query.data?.types || []} pending={saveMutation.isPending} error={saveMutation.error instanceof Error ? saveMutation.error.message : undefined} onOpenChange={(open) => {setDialogOpen(open); if (!open) setEditing(null);}} onSubmit={async (values) => {await saveMutation.mutateAsync({values, current: editing});}} />
      <DeleteCustomerDialog customer={deleting} pending={deleteMutation.isPending} error={deleteMutation.error instanceof Error ? deleteMutation.error.message : undefined} onClose={() => {setDeleting(null); deleteMutation.reset();}} onConfirm={() => {if (deleting) deleteMutation.mutate(deleting.id);}} />
    </>}
  />;
}

function CustomerDetailDrawer({customer, showProfit, canEdit, onClose, onEdit}: {customer: CustomerDirectoryItem | null; showProfit: boolean; canEdit: boolean; onClose: () => void; onEdit: () => void}) {
  const phone = useErpPhone();
  if (phone) return <ErpDetailDrawer modal={false} resizable drawerKey="customer-detail" defaultWidth={720} minWidth={560} maxWidth={920} open={Boolean(customer)} onOpenChange={(open) => {if (!open) onClose();}} title={customer?.name || "客户详情"} description={customer ? `${customer.id} · ${customer.type}` : undefined} footer={canEdit && customer ? <Button className="w-full" variant="primary" onClick={onEdit}>编辑客户档案</Button> : undefined}>
    {customer && <div className="erp-phone-document" data-phone-detail="document"><section data-erp-region="detail-hero"><div className="erp-phone-customer-identity"><ErpEntityThumbnail kind="customer" name={customer.name} /><div><h2>{customer.name}</h2><ErpStatusBadge label={`${customer.level}${customer.isCoreCustomer ? " · 核心客户" : ""}`} tone={customerLevelTone(customer.level)} /></div></div><div className="erp-detail-hero-amount"><span>累计交易</span><strong className="erp-data-number">{formatCurrency(customer.totalAmount)}</strong></div></section>
    <section><h2>往来概览</h2><Fact label="交易次数" value={`买 ${customer.buyCount} · 回收 ${customer.recycleCount}`} /><Fact label="应收余额" value={formatCurrency(customer.receivableBalance)} /><Fact label="应付余额" value={formatCurrency(customer.payableBalance)} />{showProfit && <Fact label="累计利润" value={formatCurrency(customer.totalProfit ?? 0)} />}<Fact label="最近交易" value={customer.lastDealTime?.slice(0, 10) || "暂无"} /></section>
    <section><h2>联系与跟进</h2><Fact label="联系方式" value={customer.contact || "未记录"} /><Fact label="负责人" value={customer.owner || "未分配"} /><Fact label="CRM 状态" value={[customer.crmStatus, customer.crmStage].filter(Boolean).join(" · ")} /><Fact label="来源" value={customer.source} /></section>
    <details><summary>档案与备注</summary><Fact label="意向" value={customer.intent || "未记录"} /><Fact label="售后次数" value={`${customer.aftersalesCount} 次`} />{customer.riskReason && <Fact label="风险原因" value={customer.riskReason} />}{customer.levelReason && <Fact label="等级说明" value={customer.levelReason} />}{customer.tags.length > 0 && <div className="flex flex-wrap gap-2">{customer.tags.map((tag) => <ErpStatusBadge key={tag} label={tag} tone="neutral" />)}</div>}<Fact label="备注" value={customer.remarks || "—"} /></details></div>}
  </ErpDetailDrawer>;
  return <ErpDetailDrawer modal={false} resizable drawerKey="customer-detail" defaultWidth={720} minWidth={560} maxWidth={920} open={Boolean(customer)} onOpenChange={(open) => {if (!open) onClose();}} title={customer?.name || "客户详情"} description={customer ? `${customer.id} · ${customer.type}` : undefined} footer={canEdit && customer ? <Button className="w-full" variant="primary" onClick={onEdit}>编辑客户档案</Button> : undefined}><div className="space-y-5" data-phone-detail="customer">{customer && <><div className="erp-phone-only erp-phone-customer-identity"><Users className="h-8 w-8" /><div><h2>{customer.name}</h2><ErpStatusBadge label={`${customer.level}${customer.isCoreCustomer ? " · 核心客户" : ""}`} tone="info" /></div></div><div className="grid grid-cols-2 gap-3"><Fact label="客户等级" value={`${customer.level}${customer.isCoreCustomer ? " · 核心" : ""}`} /><Fact label="CRM 状态" value={[customer.crmStatus, customer.crmStage].filter(Boolean).join(" · ")} /><Fact label="联系方式" value={customer.contact || "未记录"} /><Fact label="来源" value={customer.source} /><Fact label="负责人" value={customer.owner || "未分配"} /><Fact label="意向" value={customer.intent || "未记录"} /><Fact label="累计交易" value={formatCurrency(customer.totalAmount)} /><Fact label="交易次数" value={`买 ${customer.buyCount} · 回收 ${customer.recycleCount}`} />{showProfit && <Fact label="累计利润" value={formatCurrency(customer.totalProfit || 0)} />}<Fact label="售后次数" value={`${customer.aftersalesCount} 次`} /><Fact label="应收余额" value={formatCurrency(customer.receivableBalance)} /><Fact label="应付余额" value={formatCurrency(customer.payableBalance)} /></div>{customer.riskReason && <DashboardSection title="风险原因"><p className="text-sm text-[var(--erp-color-danger)]">{customer.riskReason}</p></DashboardSection>}{customer.levelReason && <DashboardSection title="等级说明"><p className="text-sm text-[var(--erp-color-text-secondary)]">{customer.levelReason}</p></DashboardSection>}{customer.tags.length > 0 && <div className="flex flex-wrap gap-2">{customer.tags.map((tag) => <ErpStatusBadge key={tag} label={tag} tone="neutral" />)}</div>}{customer.remarks && <p className="rounded-[var(--erp-radius-md)] bg-[var(--erp-color-surface-muted)] p-3 text-sm text-[var(--erp-color-text-secondary)]">{customer.remarks}</p>}</>}</div></ErpDetailDrawer>;
}

function DeleteCustomerDialog({customer, pending, error, onClose, onConfirm}: {customer: CustomerDirectoryItem | null; pending: boolean; error?: string; onClose: () => void; onConfirm: () => void}) {
  return <ErpConfirmDialog open={Boolean(customer)} onOpenChange={(open) => {if (!open && !pending) onClose();}} title="删除客户档案" description="已有交易、收付款、售后或 CRM 记录的客户无法删除。" documentName={customer?.name} confirmLabel="确认删除" pendingLabel="删除中…" confirmVariant="danger" pending={pending} error={error} onConfirm={onConfirm} />;
}

function MetricCard({label, value, detail, icon, tone = "neutral"}: {label: string; value: string; detail?: string; icon: ReactNode; tone?: "neutral" | "info" | "success" | "warning"}) {return <ErpMetricCard label={label} value={value} detail={detail} icon={icon} tone={tone} />;}
const Fact = ErpDetailFact;
function csvCell(value: string | number) {const text = String(value); return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;}
