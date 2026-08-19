import {keepPreviousData, useMutation, useQuery, useQueryClient, type UseQueryResult} from "@tanstack/react-query";
import {ArrowDownLeft, ArrowLeftRight, ArrowUpRight, CalendarRange, Download, Landmark, Pencil, Plus, RefreshCw, RotateCcw, Search, ShieldCheck, Trash2} from "lucide-react";
import {useEffect, useMemo, useState, type ReactNode} from "react";
import {toast} from "sonner";
import {Button, Card, CardContent, Input, Select} from "@/src/components/ui";
import {DashboardSection, ErpFinancePageFrame, ErpDataTable, ErpDateRangePicker, ErpDetailDrawer, ErpFilterBar, ErpLoadingState, ErpPageError, ErpPageHeader, ErpStatusBadge, MetricsRegion, type QuickStatusItemData} from "@/src/components/common";
import {ApiError, financeAccountsApi, financeTransfersApi, queryKeys, type AuthSession} from "@/src/services/api";
import {createCapabilities, useAuth} from "@/src/app/auth";
import {useUrlSearchState} from "@/src/hooks/useUrlSearchState";
import {filterFinanceTransferCollection} from "@/src/services/api/adapters/finance-transfer.adapter";
import {formatCurrency} from "@/src/lib/format";
import type {FinanceAccountItem} from "@/src/types/finance-account";
import type {FinanceTransferFilters, FinanceTransferFormValues, FinanceTransferItem} from "@/src/types/finance-transfer";
import {storeDate} from "@/src/utils/storeTime";
import {createFinanceTransferColumns} from "../finance-transfer.columns";
import {defaultFinanceTransferFilters, financeTransferFiltersToSearch, parseFinanceTransferFilters} from "../finance-transfer.filters";
import {FinanceTransferDialog} from "../components/FinanceTransferDialog";

function useTransferUrlState() {
  return useUrlSearchState({defaultValue: defaultFinanceTransferFilters, parse: parseFinanceTransferFilters, serialize: financeTransferFiltersToSearch});
}

export function FinanceTransfersPage() {
  const queryClient = useQueryClient();
  const {session, logout} = useAuth();
  const {value: filters, commit} = useTransferUrlState();
  const canAccess = createCapabilities(session).menu("account_transfer");
  const canReadAccounts = createCapabilities(session).menu("settlement_accounts");
  const transferQuery = useQuery({queryKey: queryKeys.finance.transfers("all"), queryFn: ({signal}) => financeTransfersApi.listAll(signal), enabled: Boolean(session && canAccess), placeholderData: keepPreviousData, retry: false});
  const accountsQuery = useQuery({queryKey: queryKeys.finance.accounts(), queryFn: ({signal}) => financeAccountsApi.listAll(signal), enabled: Boolean(session && canAccess && canReadAccounts), staleTime: 60_000, retry: false});
  useEffect(() => {if (transferQuery.error instanceof ApiError && transferQuery.error.isUnauthorized) logout();}, [logout, transferQuery.error]);
  if (!session) return <Card><ErpLoadingState title="正在验证资金调拨权限" /></Card>;
  if (!session || !canAccess) return <ErpPageError title="当前账号没有资金调拨权限" description="服务端权限未包含 account_transfer；页面不会请求或展示调拨记录。" />;
  return <FinanceTransfersContent session={session} onAuthExpired={logout} filters={filters} onFiltersChange={commit} transferQuery={transferQuery} accounts={accountsQuery.data?.accounts || []} accountOptionsAvailable={canReadAccounts && !accountsQuery.isPending && !accountsQuery.error} />;
}

function FinanceTransfersContent({session, onAuthExpired, filters, onFiltersChange, transferQuery, accounts, accountOptionsAvailable}: {session: AuthSession; onAuthExpired: () => void; filters: FinanceTransferFilters; onFiltersChange: (filters: FinanceTransferFilters) => void; transferQuery: UseQueryResult<FinanceTransferItem[], Error>; accounts: FinanceAccountItem[]; accountOptionsAvailable: boolean}) {
  const queryClient = useQueryClient();
  const [detail, setDetail] = useState<FinanceTransferItem | null>(null);
  const [editing, setEditing] = useState<FinanceTransferItem | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleting, setDeleting] = useState<FinanceTransferItem | null>(null);
  const snapshot = transferQuery.data || [];
  const collection = useMemo(() => filterFinanceTransferCollection(snapshot, filters), [filters, snapshot]);
  const invalidate = () => queryClient.invalidateQueries({queryKey: queryKeys.finance.all()});
  const mutationError = (caught: Error) => {if (caught instanceof ApiError && caught.isUnauthorized) {onAuthExpired(); return;} toast.error(caught.message);};
  const saveMutation = useMutation({mutationFn: ({values, item}: {values: FinanceTransferFormValues; item: FinanceTransferItem | null}) => item ? financeTransfersApi.update(item.id, values, session.user.displayName) : financeTransfersApi.create(values, session.user.displayName), onSuccess: async (item) => {toast.success(`${item.id} 调拨已保存，账户余额与流水已同步`); setDialogOpen(false); setEditing(null); setDetail(item); await invalidate();}, onError: mutationError});
  const deleteMutation = useMutation({mutationFn: (id: string) => financeTransfersApi.remove(id), onSuccess: async () => {toast.success("资金调拨已删除，账户余额与流水已反向修正"); setDeleting(null); setDetail(null); await invalidate();}, onError: mutationError});
  const openCreate = () => {saveMutation.reset(); setEditing(null); setDialogOpen(true);};
  const openEdit = (item: FinanceTransferItem) => {saveMutation.reset(); setEditing(item); setDialogOpen(true);};
  const canEdit = session.permissions.canEditHistory;
  const columns = useMemo(() => createFinanceTransferColumns({canEdit, canDelete: session.permissions.canDelete, onView: setDetail, onEdit: openEdit, onDelete: setDeleting}), [canEdit, session.permissions.canDelete]);
  const update = (partial: Partial<FinanceTransferFilters>) => onFiltersChange({...filters, ...partial, page: partial.page ?? 1});
  const currentMonth = storeDate().slice(0, 7);
  const monthItems = snapshot.filter((item) => item.time.startsWith(currentMonth));
  const quickStatus: QuickStatusItemData[] = [
    {icon: <ShieldCheck className="h-4 w-4" />, label: "账户权限", value: accountOptionsAvailable ? "可登记" : "仅查看", description: accountOptionsAvailable ? "可读取真实余额和账户候选" : "账户候选与余额未请求", tone: accountOptionsAvailable ? "success" : "neutral"},
    {icon: <ArrowLeftRight className="h-4 w-4" />, label: "到账规则", value: "实时入账", description: "转入 = 调拨金额 − 手续费", tone: "info"},
  ];
  const exportCurrentPage = () => {
    const table = [["调拨编号", "日期", "转出账户", "转入账户", "调拨金额", "手续费", "实际到账", "经办人", "备注"], ...collection.items.map((item) => [item.id, item.time.slice(0, 10), item.fromAccountName, item.toAccountName, item.amount, item.fee, item.receivedAmount, item.handler, item.remarks || ""])];
    const csv = `\uFEFF${table.map((row) => row.map(csvCell).join(",")).join("\n")}`;
    const url = URL.createObjectURL(new Blob([csv], {type: "text/csv;charset=utf-8"})); const link = document.createElement("a"); link.href = url; link.download = `资金调拨-第${filters.page}页.csv`; link.click(); URL.revokeObjectURL(url);
  };
  return <ErpFinancePageFrame>
    <ErpPageHeader title="资金调拨" subtitle="在结算账户之间转移资金，并同步记录手续费与账户流水。" quickStatus={quickStatus} actions={<><Button type="button" size="sm" variant="secondary" disabled={transferQuery.isFetching} onClick={() => void transferQuery.refetch()}><RefreshCw className={`h-4 w-4 ${transferQuery.isFetching ? "animate-spin" : ""}`} />刷新</Button><Button type="button" size="sm" variant="secondary" disabled={!collection.items.length} onClick={exportCurrentPage}><Download className="h-4 w-4" />导出当前页</Button><Button type="button" size="sm" variant="primary" disabled={!accountOptionsAvailable} title={accountOptionsAvailable ? undefined : "登记调拨需要资金账户权限"} onClick={openCreate}><Plus className="h-4 w-4" />新增调拨</Button></>} />
    <MetricsRegion><Metric label="筛选调拨金额" value={formatCurrency(collection.totalAmount)} detail={`${collection.total} 笔匹配记录`} icon={<ArrowLeftRight className="h-4 w-4" />} tone="info" /><Metric label="筛选实际到账" value={formatCurrency(collection.totalReceived)} detail="转入账户实际增加金额" icon={<ArrowDownLeft className="h-4 w-4" />} tone="success" /><Metric label="筛选手续费" value={formatCurrency(collection.totalFee)} detail="已计入财务流水" icon={<ArrowUpRight className="h-4 w-4" />} tone="warning" /><Metric label="本月调拨笔数" value={`${monthItems.length} 笔`} detail={formatCurrency(monthItems.reduce((sum, item) => sum + item.amount, 0))} icon={<CalendarRange className="h-4 w-4" />} tone="neutral" /></MetricsRegion>
    <ErpFilterBar compact actions={<Button type="button" size="sm" variant="ghost" onClick={() => onFiltersChange(defaultFinanceTransferFilters)}><RotateCcw className="h-4 w-4" />重置</Button>}><div className="relative min-w-56 flex-1"><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--erp-color-text-muted)]" /><Input className="pl-9" value={filters.keyword} onChange={(event) => update({keyword: event.target.value})} placeholder="搜索调拨编号、账户或备注" aria-label="搜索资金调拨" /></div>{accountOptionsAvailable ? <Select className="w-44" value={filters.accountId} onValueChange={(accountId) => update({accountId})} options={[{value: "all", label: "全部账户"}, ...accounts.map((account) => ({value: account.id, label: account.name}))]} aria-label="筛选调拨账户" /> : <Select className="w-44" value="unavailable" onValueChange={() => undefined} options={[{value: "unavailable", label: "账户筛选需权限"}]} disabled aria-label="调拨账户筛选不可用" />}<Input className="w-32" value={filters.handler} onChange={(event) => update({handler: event.target.value.trim()})} placeholder="经办人" aria-label="筛选经办人" /><ErpDateRangePicker value={{startDate: filters.startDate, endDate: filters.endDate}} onChange={({startDate, endDate}) => update({startDate, endDate})} density="compact" fieldClassName="sm:w-36" startAriaLabel="开始日期" endAriaLabel="结束日期" ariaLabel="调拨日期范围" /></ErpFilterBar>
    <DashboardSection title="调拨明细" description="每笔调拨会同时生成转出、转入账户流水；手续费通过财务流水记录。" actions={<ErpStatusBadge label={`共 ${collection.total} 笔`} tone="info" />}><ErpDataTable columns={columns} data={collection.items} getRowId={(row) => row.id} loading={transferQuery.isPending} fetching={transferQuery.isFetching} error={transferQuery.error as Error | null} errorTitle="资金调拨加载失败" emptyTitle="暂无资金调拨" emptyDescription="当前筛选条件下没有调拨记录。" onRetry={() => void transferQuery.refetch()} onRowClick={setDetail} page={collection.page} pageSize={collection.pageSize} total={collection.total} onPageChange={(page) => update({page})} onPageSizeChange={(pageSize) => update({page: 1, pageSize})} enableColumnResizing stickyHeader /></DashboardSection>
    <TransferDetail item={detail} canEdit={canEdit} canDelete={session.permissions.canDelete} onClose={() => setDetail(null)} onEdit={() => {if (detail) openEdit(detail);}} onDelete={() => {if (detail) setDeleting(detail);}} />
    <FinanceTransferDialog open={dialogOpen} item={editing} accounts={accounts} pending={saveMutation.isPending} error={saveMutation.error instanceof Error ? saveMutation.error.message : undefined} handler={session.user.displayName} onOpenChange={(open) => {setDialogOpen(open); if (!open) setEditing(null);}} onSubmit={async (values) => {await saveMutation.mutateAsync({values, item: editing});}} />
    <ConfirmDelete item={deleting} pending={deleteMutation.isPending} onClose={() => setDeleting(null)} onConfirm={() => {if (deleting) deleteMutation.mutate(deleting.id);}} />
  </ErpFinancePageFrame>;
}

function TransferDetail({item, canEdit, canDelete, onClose, onEdit, onDelete}: {item: FinanceTransferItem | null; canEdit: boolean; canDelete: boolean; onClose: () => void; onEdit: () => void; onDelete: () => void}) {
  return <ErpDetailDrawer
    open={Boolean(item)}
    onOpenChange={(open) => {if (!open) onClose();}}
    title="资金调拨详情"
    description={item ? `${item.id} · ${item.time}` : undefined}
    footer={item && <div className="flex justify-end gap-2">{canDelete && <Button size="sm" variant="danger" onClick={onDelete}><Trash2 className="h-4 w-4" />删除</Button>}{canEdit && <Button size="sm" variant="primary" onClick={onEdit}><Pencil className="h-4 w-4" />编辑</Button>}</div>}
  >
    <div className="space-y-5">
      {item && <>
        <div className="grid grid-cols-2 gap-3"><Fact label="调拨金额" value={formatCurrency(item.amount)} /><Fact label="实际到账" value={formatCurrency(item.receivedAmount)} tone="success" /><Fact label="手续费" value={formatCurrency(item.fee)} tone="warning" /><Fact label="状态" value="已入账" tone="success" /></div>
        <DashboardSection title="账户流向"><div className="grid grid-cols-2 gap-x-4 gap-y-3"><Row label="转出账户" value={item.fromAccountName} /><Row label="转入账户" value={item.toAccountName} /><Row label="经办人" value={item.handler} /><Row label="发生时间" value={item.time || "未记录"} /></div></DashboardSection>
        {item.remarks && <p className="rounded-[var(--erp-radius-md)] bg-[var(--erp-color-surface-muted)] p-3 text-sm text-[var(--erp-color-text-secondary)]">{item.remarks}</p>}
        <p className="rounded-[var(--erp-radius-md)] bg-[var(--erp-color-info-soft)] p-3 text-xs text-[var(--erp-color-text-secondary)]">转出账户扣除 {formatCurrency(item.amount)}；转入账户增加 {formatCurrency(item.receivedAmount)}；手续费 {formatCurrency(item.fee)} 记入财务流水。</p>
      </>}
    </div>
  </ErpDetailDrawer>;
}

function ConfirmDelete({item, pending, onClose, onConfirm}: {item: FinanceTransferItem | null; pending: boolean; onClose: () => void; onConfirm: () => void}) {
  return <ErpDetailDrawer open={Boolean(item)} onOpenChange={(open) => {if (!open && !pending) onClose();}} title="删除资金调拨" description="服务端将反向修正两边账户余额与关联流水" footer={<div className="flex justify-end gap-2"><Button variant="secondary" onClick={onClose} disabled={pending}>取消</Button><Button variant="danger" onClick={onConfirm} disabled={pending}>{pending ? "删除中…" : "确认删除"}</Button></div>}><p className="text-sm leading-6 text-[var(--erp-color-text-secondary)]">确认删除调拨「{item?.id}」？转出 {item?.fromAccountName} 的 {formatCurrency(item?.amount || 0)}、转入 {item?.toAccountName} 的 {formatCurrency(item?.receivedAmount || 0)} 将由服务端回滚。</p></ErpDetailDrawer>;
}

function Metric({label, value, detail, icon, tone}: {label: string; value: string; detail: string; icon: ReactNode; tone: "neutral" | "info" | "success" | "warning"}) {
  return <Card><CardContent className="flex min-h-[110px] items-start justify-between gap-3 p-4"><div className="min-w-0"><p className="text-xs font-semibold text-[var(--erp-color-text-secondary)]">{label}</p><p className="mt-2 truncate font-mono text-xl font-bold">{value}</p><p className="mt-1 truncate text-[11px] text-[var(--erp-color-text-muted)]">{detail}</p></div><ErpStatusBadge label={icon} tone={tone} /></CardContent></Card>;
}

function Fact({label, value, tone = "neutral"}: {label: string; value: string; tone?: "neutral" | "success" | "warning"}) {
  return <div className="rounded-[var(--erp-radius-lg)] border border-[var(--erp-color-border)] p-3"><p className="text-xs text-[var(--erp-color-text-muted)]">{label}</p><p className={`mt-1 font-mono text-base font-bold ${tone === "success" ? "text-[var(--erp-color-success)]" : tone === "warning" ? "text-[var(--erp-color-warning)]" : "text-[var(--erp-color-text)]"}`}>{value}</p></div>;
}

function Row({label, value}: {label: string; value: string}) {
  return <div><p className="text-[11px] text-[var(--erp-color-text-muted)]">{label}</p><p className="mt-0.5 truncate text-sm font-medium">{value}</p></div>;
}

function csvCell(value: string | number) {
  const text = String(value ?? "");
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}
