import {keepPreviousData, useMutation, useQuery, useQueryClient, type UseQueryResult} from "@tanstack/react-query";
import {useNavigate} from "@tanstack/react-router";
import {AlertCircle, AlertTriangle, ArrowDownToLine, ArrowLeftRight, ArrowUpFromLine, Banknote, Building2, CheckCircle2, CircleDollarSign, CreditCard, Download, FileCheck2, FileText, Landmark, LockKeyhole, Plus, RefreshCw, Search, Settings2, WalletCards} from "lucide-react";
import {useEffect, useMemo, useState, type ReactNode} from "react";
import {Cell, Pie, PieChart} from "recharts";
import {toast} from "sonner";
import {Button, Card, ChartContainer, ChartMeta, ChartTooltip, ChartTooltipContent, Input, Select, type ChartConfig} from "@/src/components/ui";
import {DashboardSection, ErpEmptyState, ErpFinancePageFrame, ErpFilterBar, ErpLoadingState, ErpPageContent, ErpPageError, ErpPageToolbar, ErpStatusBadge} from "@/src/components/common";
import {ApiError, financeAccountsApi, queryKeys} from "@/src/services/api";
import {invalidateErpDomains} from "@/src/services/api/invalidation";
import {createCapabilities, useAuth} from "@/src/app/auth";
import {useUrlSearchState} from "@/src/hooks/useUrlSearchState";
import type {AuthSession} from "@/src/services/api/endpoints/auth";
import {financeAccountTypes, type FinanceAccountCollection, type FinanceAccountCreateValues, type FinanceAccountItem, type FinanceAccountLedgerItem, type FinanceAccountReconcileValues} from "@/src/types/finance-account";
import {FinanceAccountCreateDialog, FinanceAccountDeleteDialog, FinanceAccountReconcileDialog} from "../components/FinanceAccountDialogs";
import {FinanceAccountDetailDrawer} from "../components/FinanceAccountDetailDrawer";
import {defaultFinanceAccountFilters, filterFinanceAccounts, financeAccountFiltersToSearch, parseFinanceAccountFilters} from "../finance-account.filters";
import {summarizeFinanceAccounts} from "../finance-account.summary";
import {storeDate} from "@/src/utils/storeTime";

const chartColors = ["var(--erp-color-primary)", "var(--erp-color-success)", "var(--erp-color-warning)", "var(--erp-color-danger)", "var(--erp-color-info)"];
const accountChartConfig = {
  value: {label: "账户余额", color: "var(--erp-color-primary)", indicator: "dot" as const},
} satisfies ChartConfig;

function useFinanceAccountUrlState() {
  const {value: filters, commit} = useUrlSearchState({defaultValue: defaultFinanceAccountFilters, parse: parseFinanceAccountFilters, serialize: financeAccountFiltersToSearch});
  return {filters, commit};
}

export function FinanceAccountsPage() {
  const {session, logout} = useAuth();
  const {filters, commit} = useFinanceAccountUrlState();
  const allowed = createCapabilities(session).menu("settlement_accounts");
  const accountsQuery = useQuery({queryKey: queryKeys.finance.accounts(), queryFn: ({signal}) => financeAccountsApi.listAll(signal), enabled: Boolean(session && allowed), placeholderData: keepPreviousData, retry: false});

  useEffect(() => {
    if (accountsQuery.error instanceof ApiError && accountsQuery.error.isUnauthorized) logout();
  }, [accountsQuery.error, logout]);

  if (!session) return <Card><ErpLoadingState title="正在验证登录状态" description="正在读取当前账号的资金账户权限。" /></Card>;
  if (!allowed) return <ErpPageError title="当前账号没有资金账户权限" description="服务器权限未包含 settlement_accounts 菜单；页面不会加载或展示账户余额。" />;
  if (accountsQuery.isPending) return <ErpFinancePageFrame><FinanceAccountsHeader loading /><Card><ErpLoadingState title="正在加载真实资金账户" /></Card></ErpFinancePageFrame>;
  if (accountsQuery.error && !accountsQuery.data) return <ErpFinancePageFrame><FinanceAccountsHeader /><ErpPageError title="资金账户加载失败" description={accountsQuery.error.message} onRetry={() => void accountsQuery.refetch()} /></ErpFinancePageFrame>;
  return <FinanceAccountsContent session={session} query={accountsQuery} filters={filters} onFiltersChange={commit} onAuthExpired={logout} />;
}

function FinanceAccountsContent({session, query, filters, onFiltersChange, onAuthExpired}: {session: AuthSession; query: UseQueryResult<FinanceAccountCollection, Error>; filters: ReturnType<typeof parseFinanceAccountFilters>; onFiltersChange: (filters: ReturnType<typeof parseFinanceAccountFilters>) => void; onAuthExpired: () => void}) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [detailId, setDetailId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [reconcileId, setReconcileId] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const accounts = query.data?.accounts || [];
  const detail = accounts.find((item) => item.id === detailId) || null;
  const reconciling = accounts.find((item) => item.id === reconcileId) || null;
  const deleting = accounts.find((item) => item.id === deleteId) || null;
  const capabilities = createCapabilities(session);
  const canViewLedger = capabilities.menu("settlement_ledger");
  const canTransfer = capabilities.menu("account_transfer");
  const canCollect = capabilities.menu("payment_in");
  const canDelete = session.permissions.canDelete;
  const summary = useMemo(() => summarizeFinanceAccounts(accounts), [accounts]);
  const filtered = useMemo(() => filterFinanceAccounts(accounts, filters), [accounts, filters]);
  const distribution = useMemo(() => buildDistribution(accounts), [accounts]);
  const statusRows = useMemo(() => buildAccountStatuses(accounts), [accounts]);
  const exceptions = useMemo(() => buildExceptions(accounts), [accounts]);
  const accountLedgerQuery = useQuery({queryKey: queryKeys.finance.accountLedger(detail?.id || ""), queryFn: ({signal}) => financeAccountsApi.ledger(detail?.id || "", 1, 20, signal), enabled: Boolean(detail && canViewLedger), retry: false});
  const recentLedgerQuery = useQuery({queryKey: queryKeys.finance.accountLedger("__recent__"), queryFn: ({signal}) => financeAccountsApi.ledger("", 1, 6, signal), enabled: Boolean(canViewLedger), retry: false});

  useEffect(() => {
    const unauthorized = [accountLedgerQuery.error, recentLedgerQuery.error].some((error) => error instanceof ApiError && error.isUnauthorized);
    if (unauthorized) onAuthExpired();
  }, [accountLedgerQuery.error, recentLedgerQuery.error, onAuthExpired]);

  const invalidate = async () => invalidateErpDomains(queryClient, ["finance", "state", "sales", "purchase"]);
  const handleError = (error: Error) => {
    if (error instanceof ApiError && error.isUnauthorized) {
      onAuthExpired();
      return;
    }
    toast.error(error.message);
  };
  const createMutation = useMutation({mutationFn: (values: FinanceAccountCreateValues) => financeAccountsApi.create(values), onSuccess: async (account) => {toast.success(`${account.name} 已创建`); setCreateOpen(false); setDetailId(account.id); await invalidate();}, onError: handleError});
  const reconcileMutation = useMutation({mutationFn: ({id, values}: {id: string; values: FinanceAccountReconcileValues}) => financeAccountsApi.reconcile(id, values), onSuccess: async (account) => {toast.success(`${account.name} 的实盘余额已记录`); setReconcileId(null); setDetailId(account.id); await invalidate();}, onError: handleError});
  const deleteMutation = useMutation({mutationFn: (id: string) => financeAccountsApi.remove(id), onSuccess: async () => {toast.success("资金账户已删除"); setDeleteId(null); setDetailId(null); await invalidate();}, onError: handleError});
  const updateFilters = (partial: Partial<typeof filters>) => onFiltersChange({...filters, ...partial, page: partial.page ?? 1});
  const openCreate = () => {createMutation.reset(); setCreateOpen(true);};

  return <ErpFinancePageFrame>
    <FinanceAccountsHeader accounts={accounts} loading={query.isFetching} onRefresh={() => void query.refetch()} onCreate={openCreate} />
    <ErpPageContent className="space-y-[var(--erp-page-gap)]">
    <div className="grid min-w-0 gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
      <main className="min-w-0 space-y-4">
        <SummaryCards summary={summary} accountCount={accounts.length} />
        <ErpPageToolbar>
        <ErpFilterBar className="bg-[var(--erp-color-surface)]" actions={<div className="flex flex-wrap items-center gap-2"><Button type="button" size="sm" variant={advancedOpen ? "secondary" : "ghost"} onClick={() => setAdvancedOpen((value) => !value)}><Settings2 className="h-4 w-4" />更多筛选</Button><Button type="button" size="sm" variant="ghost" onClick={() => onFiltersChange(defaultFinanceAccountFilters)}><RefreshCw className="h-4 w-4" />重置</Button></div>}>
          <div className="relative min-w-[220px] flex-1"><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--erp-color-text-muted)]" /><Input className="pl-9" value={filters.keyword} onChange={(event) => updateFilters({keyword: event.target.value})} placeholder="搜索账户名称、账号或备注..." aria-label="搜索资金账户" /></div>
          <Select className="w-36" value={filters.type} onValueChange={(type) => updateFilters({type: type as typeof filters.type})} options={[{value: "all", label: "全部类型"}, ...financeAccountTypes.map((value) => ({value, label: value}))]} aria-label="筛选账户类型" />
          <Select className="w-32" value={filters.status} onValueChange={(status) => updateFilters({status: status as typeof filters.status})} options={[{value: "all", label: "全部状态"}, {value: "enabled", label: "正常账户"}, {value: "disabled", label: "停用账户"}, {value: "difference", label: "存在差额"}]} aria-label="筛选账户状态" />
          {advancedOpen && <><Input className="w-32" value={filters.owner} onChange={(event) => updateFilters({owner: event.target.value})} placeholder="账户归属" aria-label="筛选账户归属" /><Input className="w-32" value={filters.platform} onChange={(event) => updateFilters({platform: event.target.value})} placeholder="平台 / 银行" aria-label="筛选平台或银行" /></>}
        </ErpFilterBar>
        </ErpPageToolbar>
        {filtered.length !== accounts.length && <div className="px-1 text-xs text-[var(--erp-color-text-secondary)]">已筛选 {filtered.length} / {accounts.length} 个账户 <button type="button" className="ml-2 font-semibold text-[var(--erp-color-primary)] hover:underline" onClick={() => onFiltersChange(defaultFinanceAccountFilters)}>清空筛选</button></div>}
        <AccountCards accounts={filtered} onCreate={openCreate} onView={(account) => setDetailId(account.id)} onCollect={(account) => void navigate({to: "/finance/income", search: {accountId: account.id}})} onTransfer={(account) => void navigate({to: "/finance/transfers", search: {fromAccountId: account.id}})} onLedger={(account) => void navigate({to: "/finance/ledger", search: {accountId: account.id}})} canCollect={canCollect} canTransfer={canTransfer} canViewLedger={canViewLedger} />
        <RecentChangesCard rows={recentLedgerQuery.data?.items || []} loading={recentLedgerQuery.isPending} error={recentLedgerQuery.error} onRetry={() => void recentLedgerQuery.refetch()} onRowClick={(row) => setDetailId(row.accountId)} onViewAll={() => void navigate({to: "/finance/ledger"})} />
      </main>
      <aside className="space-y-4 xl:sticky xl:top-20 xl:self-start"><DistributionCard rows={distribution.rows} total={distribution.total} /><AccountStatusCard rows={statusRows} /><ExceptionsCard exceptions={exceptions} pendingCount={statusRows.find((row) => row.key === "pending")?.value || 0} onViewPending={() => updateFilters({status: "all"})} /><QuickActionsCard onTransfer={canTransfer ? () => void navigate({to: "/finance/transfers"}) : undefined} onCollect={canCollect ? () => void navigate({to: "/finance/income"}) : undefined} onLedger={canViewLedger ? () => void navigate({to: "/finance/ledger"}) : undefined} onReports={() => void navigate({to: "/finance/profit"})} onSettings={() => openCreate()} /></aside>
    </div>
    <p className="px-1 text-xs text-[var(--erp-color-text-muted)]">注：以上余额和流水均来自真实账户接口；账户卡片快捷操作不会绕过服务端权限。</p>
    <FinanceAccountDetailDrawer account={detail} canViewLedger={canViewLedger} canDelete={canDelete} ledgerQuery={accountLedgerQuery} onClose={() => setDetailId(null)} onOpenLedger={() => void navigate({to: "/finance/ledger"})} onReconcile={() => {if (detail) {reconcileMutation.reset(); setReconcileId(detail.id);}}} onDelete={() => {if (detail) setDeleteId(detail.id);}} />
    <FinanceAccountCreateDialog open={createOpen} pending={createMutation.isPending} error={createMutation.error?.message} onOpenChange={setCreateOpen} onSubmit={async (values) => {await createMutation.mutateAsync(values);}} />
    <FinanceAccountReconcileDialog account={reconciling} pending={reconcileMutation.isPending} error={reconcileMutation.error?.message} onOpenChange={(open) => {if (!open) setReconcileId(null);}} onSubmit={async (values) => {if (reconciling) await reconcileMutation.mutateAsync({id: reconciling.id, values});}} />
    <FinanceAccountDeleteDialog account={deleting} pending={deleteMutation.isPending} onOpenChange={(open) => {if (!open) setDeleteId(null);}} onConfirm={() => {if (deleting) deleteMutation.mutate(deleting.id);}} />
    </ErpPageContent>
  </ErpFinancePageFrame>;
}

function FinanceAccountsHeader({accounts = [], loading = false, onRefresh, onCreate}: {accounts?: FinanceAccountItem[]; loading?: boolean; onRefresh?: () => void; onCreate?: () => void}) {
  return <Card className="overflow-hidden"><div className="flex flex-wrap items-center gap-4 px-5 py-4"><div className="min-w-[200px] flex-1"><h1 className="text-lg font-bold text-[var(--erp-color-text)]">资金账户</h1><p className="mt-1 text-xs text-[var(--erp-color-text-secondary)]">管理所有资金账户，掌握资金分布与账户状态。</p></div><div className="hidden min-w-[270px] items-center divide-x divide-[var(--erp-color-border)] md:flex"><ConnectionStatus /><ReconcileStatus accounts={accounts} /></div><div className="flex shrink-0 items-center gap-2"><Button type="button" size="sm" variant="secondary" onClick={onRefresh} disabled={!onRefresh || loading}><RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />刷新</Button><Button type="button" size="sm" variant="primary" onClick={onCreate} disabled={!onCreate}><Plus className="h-4 w-4" />新增账户</Button></div></div></Card>;
}

function ConnectionStatus() {
  return <div className="flex items-center gap-2 px-4 first:pl-0"><span className="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--erp-color-success-soft)] text-[var(--erp-color-success)]"><CheckCircle2 className="h-4 w-4" /></span><span><span className="block text-[11px] text-[var(--erp-color-text-muted)]">数据连接</span><span className="block text-xs font-semibold text-[var(--erp-color-success)]">已连接 <span className="ml-1">◆</span></span><span className="block text-[10px] text-[var(--erp-color-text-muted)]">实时同步</span></span></div>;
}

function ReconcileStatus({accounts}: {accounts: FinanceAccountItem[]}) {
  const hasDifference = accounts.some((account) => account.difference !== undefined && Math.abs(account.difference) > 0.009);
  const reconciled = accounts.filter((account) => account.lastReconciledAt).sort((left, right) => String(right.lastReconciledAt).localeCompare(String(left.lastReconciledAt)))[0];
  const label = hasDifference ? "有差异" : reconciled ? "已平衡" : "待对账";
  const valueClass = hasDifference ? "text-[var(--erp-color-warning)]" : reconciled ? "text-[var(--erp-color-primary)]" : "text-[var(--erp-color-text-secondary)]";
  return <div className="flex items-center gap-2 px-4"><span className={`flex h-8 w-8 items-center justify-center rounded-full ${hasDifference ? "bg-[var(--erp-color-warning-soft)] text-[var(--erp-color-warning)]" : "bg-[var(--erp-color-info-soft)] text-[var(--erp-color-primary)]"}`}><FileCheck2 className="h-4 w-4" /></span><span><span className="block text-[11px] text-[var(--erp-color-text-muted)]">对账状态</span><span className={`block text-xs font-semibold ${valueClass}`}>{label}</span><span className="block text-[10px] text-[var(--erp-color-text-muted)]">{reconciled?.lastReconciledAt ? `最近 ${reconciled.lastReconciledAt.slice(0, 10)}` : "尚未记录实盘余额"}</span></span></div>;
}

function SummaryCards({summary, accountCount}: {summary: ReturnType<typeof summarizeFinanceAccounts>; accountCount: number}) {
  return <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 2xl:grid-cols-4"><SummaryCard label="总资产" value={summary.bookBalance} detail="当前账面余额" icon={<WalletCards className="h-4 w-4" />} tone="info" /><SummaryCard label="可用资金" value={summary.availableBalance} detail="账面余额减冻结金额" icon={<Banknote className="h-4 w-4" />} tone="success" /><SummaryCard label="冻结资金" value={summary.frozenAmount} detail="暂不可动用的资金" icon={<LockKeyhole className="h-4 w-4" />} tone="warning" /><SummaryCard label="账户数量" value={accountCount} detail={`${summary.enabledCount} 个正常账户`} icon={<Landmark className="h-4 w-4" />} tone="info" count /> </div>;
}

function SummaryCard({label, value, detail, icon, tone, count = false}: {label: string; value: number; detail: string; icon: ReactNode; tone: "info" | "success" | "warning"; count?: boolean}) {
  const toneClass = tone === "success" ? "bg-[var(--erp-color-success-soft)] text-[var(--erp-color-success)]" : tone === "warning" ? "bg-[var(--erp-color-warning-soft)] text-[var(--erp-color-warning)]" : "bg-[var(--erp-color-info-soft)] text-[var(--erp-color-primary)]";
  return <Card><div className="flex min-h-[116px] items-start gap-3 p-4"><span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${toneClass}`}>{icon}</span><div className="min-w-0"><p className="text-xs font-semibold text-[var(--erp-color-text-secondary)]">{label}</p><p className="mt-2 truncate font-mono text-xl font-bold text-[var(--erp-color-text)]">{count ? `${value} 个` : formatMoney(value)}</p><p className="mt-1 truncate text-[11px] text-[var(--erp-color-text-muted)]">{detail}</p></div></div></Card>;
}

function AccountCards({accounts, onCreate, onView, onCollect, onTransfer, onLedger, canCollect, canTransfer, canViewLedger}: {accounts: FinanceAccountItem[]; onCreate: () => void; onView: (account: FinanceAccountItem) => void; onCollect: (account: FinanceAccountItem) => void; onTransfer: (account: FinanceAccountItem) => void; onLedger: (account: FinanceAccountItem) => void; canCollect: boolean; canTransfer: boolean; canViewLedger: boolean}) {
  return <Card className="p-4"><div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-5">{accounts.map((account) => <AccountCard key={account.id} account={account} onView={() => onView(account)} onCollect={() => onCollect(account)} onTransfer={() => onTransfer(account)} onLedger={() => onLedger(account)} canCollect={canCollect} canTransfer={canTransfer} canViewLedger={canViewLedger} />)}<button type="button" className="flex min-h-[178px] flex-col items-center justify-center gap-2 rounded-[var(--erp-radius-lg)] border border-dashed border-[var(--erp-color-border-strong)] bg-[var(--erp-color-surface-muted)]/40 text-sm font-semibold text-[var(--erp-color-text-secondary)] transition-colors hover:border-[var(--erp-color-primary)] hover:bg-[var(--erp-color-info-soft)] hover:text-[var(--erp-color-primary)]" onClick={onCreate}><span className="flex h-8 w-8 items-center justify-center rounded-full border border-[var(--erp-color-border-strong)] bg-[var(--erp-color-surface)]"><Plus className="h-4 w-4" /></span>新增账户</button></div>{accounts.length === 0 && <div className="mt-3"><ErpEmptyState title="暂无匹配账户" description="请调整筛选条件，或新增一个资金账户。" /></div>}</Card>;
}

function AccountCard({account, onView, onCollect, onTransfer, onLedger, canCollect, canTransfer, canViewLedger}: {account: FinanceAccountItem; onView: () => void; onCollect: () => void; onTransfer: () => void; onLedger: () => void; canCollect: boolean; canTransfer: boolean; canViewLedger: boolean}) {
  const status = accountStatus(account);
  return <article className="flex min-h-[178px] flex-col overflow-hidden rounded-[var(--erp-radius-lg)] border border-[var(--erp-color-border)] bg-[var(--erp-color-surface)] transition-shadow hover:shadow-[var(--erp-shadow-card)]"><button type="button" className="flex min-w-0 flex-1 flex-col p-3 text-left" onClick={onView}><div className="flex items-start gap-2"><span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--erp-color-info-soft)] text-[var(--erp-color-primary)]">{accountIcon(account.type)}</span><span className="min-w-0 flex-1"><span className="flex items-center gap-1.5"><span className="truncate text-sm font-bold text-[var(--erp-color-text)]">{account.name}</span><ErpStatusBadge label={status.label} tone={status.tone} /></span><span className="mt-1 block truncate text-[11px] text-[var(--erp-color-text-muted)]">{account.platform || account.type}</span></span></div><span className={`mt-4 block font-mono text-lg font-bold ${account.balance < 0 ? "text-[var(--erp-color-danger)]" : "text-[var(--erp-color-text)]"}`}>{formatMoney(account.balance)}</span><span className="mt-1 block text-[11px] text-[var(--erp-color-text-secondary)]">可用 {formatMoney(account.availableBalance)}</span></button><div className="flex items-center justify-between border-t border-[var(--erp-color-border)] px-2 py-2"><CardAction label="收款" icon={<ArrowDownToLine className="h-3.5 w-3.5" />} onClick={onCollect} disabled={!canCollect} /><CardAction label="转账" icon={<ArrowLeftRight className="h-3.5 w-3.5" />} onClick={onTransfer} disabled={!canTransfer} /><CardAction label="流水" icon={<FileText className="h-3.5 w-3.5" />} onClick={onLedger} disabled={!canViewLedger} /></div></article>;
}

function CardAction({label, icon, onClick, disabled}: {label: string; icon: ReactNode; onClick: () => void; disabled?: boolean}) {
  return <button type="button" className="erp-focus-ring inline-flex items-center gap-0.5 whitespace-nowrap rounded-[var(--erp-radius-sm)] px-1 py-1 text-[10px] font-semibold text-[var(--erp-color-text-secondary)] hover:bg-[var(--erp-color-surface-muted)] disabled:cursor-not-allowed disabled:opacity-40" onClick={(event) => {event.stopPropagation(); onClick();}} disabled={disabled}>{icon}{label}</button>;
}

function RecentChangesCard({rows, loading, error, onRetry, onRowClick, onViewAll}: {rows: FinanceAccountLedgerItem[]; loading: boolean; error: Error | null; onRetry: () => void; onRowClick: (row: FinanceAccountLedgerItem) => void; onViewAll: () => void}) {
  return <DashboardSection title={<span>最近资金变动 <span className="ml-1 text-xs font-normal text-[var(--erp-color-text-muted)]">共 {rows.length} 笔</span></span>} actions={<Button type="button" size="sm" variant="ghost" onClick={onViewAll}>查看全部</Button>} className="overflow-hidden p-0"><div className="p-0">{loading ? <ErpLoadingState title="正在加载最近资金变动" /> : error ? <ErpEmptyState title="资金变动加载失败" description={error.message} action={<Button type="button" size="sm" onClick={onRetry}>重试</Button>} /> : rows.length === 0 ? <ErpEmptyState title="暂无资金变动" description="创建收入、支出或调拨后，最近变动会显示在这里。" /> : <div className="erp-scrollbar overflow-x-auto"><table className="w-full min-w-[780px] border-collapse text-left text-xs"><thead className="bg-[var(--erp-color-surface-muted)] text-[var(--erp-color-text-secondary)]"><tr>{["交易时间", "账户", "交易类型", "交易方向", "金额(元)", "对方账户/备注", "单号"].map((label) => <th key={label} className="whitespace-nowrap border-b border-[var(--erp-color-border)] px-3 py-3 font-semibold">{label}</th>)}</tr></thead><tbody>{rows.map((row) => <tr key={row.id} className="cursor-pointer border-b border-[var(--erp-color-border)] last:border-0 hover:bg-[var(--erp-color-info-soft)]" onClick={() => onRowClick(row)}><td className="whitespace-nowrap px-3 py-3 font-mono text-[var(--erp-color-text-secondary)]">{formatLedgerDateTime(row.time)}</td><td className="max-w-[130px] truncate px-3 py-3 font-semibold">{row.accountName}</td><td className="whitespace-nowrap px-3 py-3">{row.businessType}</td><td className={`whitespace-nowrap px-3 py-3 font-semibold ${row.changeAmount >= 0 ? "text-[var(--erp-color-income)]" : "text-[var(--erp-color-expense)]"}`}>{row.changeAmount >= 0 ? "收入" : "支出"}</td><td className={`whitespace-nowrap px-3 py-3 font-mono font-bold ${row.changeAmount >= 0 ? "text-[var(--erp-color-income)]" : "text-[var(--erp-color-expense)]"}`}>{row.changeAmount >= 0 ? "+" : "−"}{formatMoney(Math.abs(row.changeAmount))}</td><td className="max-w-[170px] truncate px-3 py-3 text-[var(--erp-color-text-secondary)]">{row.party || row.customerName || row.supplierName || row.remarks || "—"}</td><td className="whitespace-nowrap px-3 py-3 font-mono text-[var(--erp-color-text-secondary)]">{row.relatedDocNo || "—"}</td></tr>)}</tbody></table></div>}</div></DashboardSection>;
}

function DistributionCard({rows, total}: {rows: DistributionRow[]; total: number}) {
  return <Card><div className="border-b border-[var(--erp-color-border)] px-4 py-3"><h2 className="text-sm font-bold">资金分布</h2></div><div className="grid grid-cols-[136px_minmax(0,1fr)] items-center gap-3 p-4">{total > 0 ? <><div className="relative h-36"><ChartContainer config={accountChartConfig} className="h-full" role="img" aria-label="资金账户分布图"><PieChart><Pie data={rows} dataKey="value" nameKey="name" innerRadius={42} outerRadius={62} paddingAngle={rows.length > 1 ? 2 : 0} stroke="var(--erp-color-surface)" strokeWidth={2}>{rows.map((row, index) => <Cell key={row.id} fill={chartColors[index % chartColors.length]} />)}</Pie><ChartTooltip content={<ChartTooltipContent formatter={(value) => formatMoney(Number(value) || 0)} />} /></PieChart></ChartContainer><div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center"><span className="font-mono text-sm font-bold">{compactMoney(total)}</span><span className="text-[10px] text-[var(--erp-color-text-muted)]">总资产</span></div></div><div className="space-y-2">{rows.map((row, index) => <div key={row.id} className="flex items-center justify-between gap-2 text-xs"><span className="flex min-w-0 items-center gap-1.5 truncate"><span className="h-2 w-2 shrink-0 rounded-full" style={{backgroundColor: chartColors[index % chartColors.length]}} />{row.name}</span><span className="shrink-0 font-mono text-[var(--erp-color-text-secondary)]">{formatPercent(row.value, total)}</span></div>)}</div></> : <div className="col-span-2"><ErpEmptyState title="暂无可分布资金" description="新增或启用资金账户后会显示分布。" /></div>}</div><ChartMeta className="mx-4 mb-3" summary={`${rows.length} 个账户 · 总资产 ${formatMoney(total)}`} updatedAt={storeDate()} /></Card>;
}

function AccountStatusCard({rows}: {rows: StatusRow[]}) {
  return <Card><div className="border-b border-[var(--erp-color-border)] px-4 py-3"><h2 className="text-sm font-bold">账户状态概览</h2></div><div className="space-y-3 p-4">{rows.map((row) => <div key={row.key} className="flex items-center justify-between gap-3 text-xs"><span className="flex items-center gap-2"><span className={`h-2.5 w-2.5 rounded-full ${row.dot}`} />{row.label}</span><span className="font-semibold">{row.value} 个</span></div>)}</div></Card>;
}

function ExceptionsCard({exceptions, pendingCount, onViewPending}: {exceptions: ExceptionRow[]; pendingCount: number; onViewPending: () => void}) {
  return <Card><div className="flex items-center justify-between border-b border-[var(--erp-color-border)] px-4 py-3"><h2 className="text-sm font-bold">异常提醒</h2><button type="button" className="text-xs font-semibold text-[var(--erp-color-primary)] hover:underline" onClick={onViewPending}>查看全部</button></div><div className="space-y-3 p-4">{exceptions.map((exception) => <div key={exception.key} className="flex items-start gap-2"><span className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full ${exception.tone === "warning" ? "bg-[var(--erp-color-warning-soft)] text-[var(--erp-color-warning)]" : "bg-[var(--erp-color-info-soft)] text-[var(--erp-color-primary)]"}`}>{exception.tone === "warning" ? <AlertTriangle className="h-3 w-3" /> : <AlertCircle className="h-3 w-3" />}</span><div className="min-w-0"><p className="text-xs font-semibold">{exception.title}</p><p className="mt-0.5 text-[11px] text-[var(--erp-color-text-muted)]">{exception.description}</p></div></div>)}{pendingCount > 0 && <button type="button" className="text-xs font-semibold text-[var(--erp-color-primary)] hover:underline" onClick={onViewPending}>查看待核对账户 →</button>}</div></Card>;
}

function QuickActionsCard({onTransfer, onCollect, onLedger, onReports, onSettings}: {onTransfer?: () => void; onCollect?: () => void; onLedger?: () => void; onReports: () => void; onSettings: () => void}) {
  const actions = [{label: "资金转账", icon: <ArrowLeftRight className="h-4 w-4" />, onClick: onTransfer}, {label: "账户收款", icon: <ArrowDownToLine className="h-4 w-4" />, onClick: onCollect}, {label: "资金划转", icon: <ArrowUpFromLine className="h-4 w-4" />, onClick: onTransfer}, {label: "对账管理", icon: <FileCheck2 className="h-4 w-4" />, onClick: onLedger}, {label: "导出报表", icon: <Download className="h-4 w-4" />, onClick: onReports}, {label: "账户设置", icon: <WalletCards className="h-4 w-4" />, onClick: onSettings}];
  return <Card><div className="border-b border-[var(--erp-color-border)] px-4 py-3"><h2 className="text-sm font-bold">快捷操作</h2></div><div className="grid grid-cols-3 gap-3 p-4">{actions.map((action) => <button key={action.label} type="button" className="erp-focus-ring flex min-h-[70px] flex-col items-center justify-center gap-2 rounded-[var(--erp-radius-md)] border border-[var(--erp-color-border)] text-[11px] font-semibold text-[var(--erp-color-text-secondary)] transition-colors hover:border-[var(--erp-color-primary)] hover:bg-[var(--erp-color-info-soft)] hover:text-[var(--erp-color-primary)] disabled:cursor-not-allowed disabled:opacity-40" onClick={action.onClick} disabled={!action.onClick}>{action.icon}{action.label}</button>)}</div></Card>;
}

type DistributionRow = {id: string; name: string; value: number};
type StatusRow = {key: string; label: string; value: number; dot: string};
type ExceptionRow = {key: string; title: string; description: string; tone: "info" | "warning"};

function buildDistribution(accounts: FinanceAccountItem[]) {
  const rows = accounts.filter((account) => account.enabled && account.balance > 0).sort((left, right) => right.balance - left.balance).slice(0, 5).map((account) => ({id: account.id, name: account.name, value: account.balance}));
  return {rows, total: rows.reduce((sum, row) => sum + row.value, 0)};
}

function buildAccountStatuses(accounts: FinanceAccountItem[]): StatusRow[] {
  const abnormal = accounts.filter((account) => account.difference !== undefined && Math.abs(account.difference) > 0.009).length;
  const frozen = accounts.filter((account) => account.frozenAmount > 0).length;
  const pending = accounts.filter((account) => account.enabled && account.actualBalance === undefined && account.frozenAmount <= 0 && !(account.difference !== undefined && Math.abs(account.difference) > 0.009)).length;
  const normal = Math.max(0, accounts.length - abnormal - frozen - pending);
  return [{key: "normal", label: "正常账户", value: normal, dot: "bg-[var(--erp-color-success)]"}, {key: "pending", label: "待核对账户", value: pending, dot: "bg-[var(--erp-color-warning)]"}, {key: "abnormal", label: "异常账户", value: abnormal, dot: "bg-[var(--erp-color-danger)]"}, {key: "frozen", label: "已冻结账户", value: frozen, dot: "bg-[var(--erp-color-text-muted)]"}];
}

function buildExceptions(accounts: FinanceAccountItem[]): ExceptionRow[] {
  const difference = accounts.filter((account) => account.difference !== undefined && Math.abs(account.difference) > 0.009);
  const pending = accounts.filter((account) => account.enabled && account.actualBalance === undefined);
  if (difference.length) return difference.slice(0, 2).map((account) => ({key: account.id, title: `${account.name} 存在实盘差额`, description: `差额 ${formatMoney(account.difference || 0)}，建议尽快核对。`, tone: "warning"}));
  return [{key: "healthy", title: "暂无异常账户", description: "所有账户状态正常。", tone: "info"}, {key: "reconcile", title: "建议定期对账", description: pending.length ? `${pending.length} 个账户尚未记录实盘余额。` : "上次对账状态已平衡。", tone: "info"}];
}

function accountStatus(account: FinanceAccountItem) {
  if (!account.enabled) return {label: "停用", tone: "neutral" as const};
  if (account.difference !== undefined && Math.abs(account.difference) > 0.009) return {label: "异常", tone: "danger" as const};
  if (account.frozenAmount > 0) return {label: "冻结", tone: "warning" as const};
  return {label: "正常", tone: "success" as const};
}

function accountIcon(type: FinanceAccountItem["type"]) {
  if (type === "现金") return <Banknote className="h-4 w-4" />;
  if (type === "银行卡" || type === "对公账户") return <CreditCard className="h-4 w-4" />;
  if (type === "微信" || type === "支付宝") return <WalletCards className="h-4 w-4" />;
  if (type === "老板个人账户") return <Building2 className="h-4 w-4" />;
  return <Landmark className="h-4 w-4" />;
}

function formatMoney(value: number) {return new Intl.NumberFormat("zh-CN", {style: "currency", currency: "CNY", minimumFractionDigits: 2, maximumFractionDigits: 2}).format(value);}
function compactMoney(value: number) {return Math.abs(value) >= 10000 ? `¥${(value / 10000).toFixed(1)}万` : formatMoney(value);}
function formatPercent(value: number, total: number) {return total ? `${((value / total) * 100).toFixed(1)}%` : "0.0%";}
function formatLedgerDateTime(value: string) {return value ? value.replace("T", " ").slice(0, 16) : "—";}
