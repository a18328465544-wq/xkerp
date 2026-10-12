import {keepPreviousData, useMutation, useQuery, useQueryClient, type UseQueryResult} from "@tanstack/react-query";
import {useWorkspaceTabActivity} from "@/src/hooks/useWorkspaceTabRuntime";
import {useNavigate} from "@tanstack/react-router";
import {AlertTriangle, ArrowDownToLine, ArrowLeftRight, Banknote, Building2, CreditCard, Download, FileCheck2, FileText, Landmark, LockKeyhole, MoreHorizontal, Plus, RefreshCw, Settings2, WalletCards} from "lucide-react";
import {ErpChoiceChips, ErpSearchInput} from "@/src/components/common";
import {useEffect, useMemo, useState, type ReactNode} from "react";
import {notify} from "@/src/utils/notification";
import {Button, Card, Input, Select} from "@/src/components/ui";
import {ErpEmptyState, ErpFinancePageFrame, ErpFilterBar, ErpLoadingState, ErpMetricCard, MetricsRegion, ErpPageContent, ErpPageError, ErpPageHeader, ErpPageToolbar, ErpStatusBadge, type QuickStatusItemData} from "@/src/components/common";
import {ApiError, financeAccountsApi, queryKeys} from "@/src/services/api";
import {invalidateErpDomains} from "@/src/services/api/invalidation";
import {createCapabilities, useAuth} from "@/src/app/auth";
import {useUrlSearchState} from "@/src/hooks/useUrlSearchState";
import {useErpDesktop} from "@/src/hooks/useErpViewport";
import type {AuthSession} from "@/src/services/api/endpoints/auth";
import {financeAccountTypes, type FinanceAccountCollection, type FinanceAccountCreateValues, type FinanceAccountItem, type FinanceAccountReconcileValues} from "@/src/types/finance-account";
import {FinanceAccountCreateDialog, FinanceAccountDeleteDialog, FinanceAccountReconcileDialog} from "../components/FinanceAccountDialogs";
import {FinanceAccountDetailDrawer} from "../components/FinanceAccountDetailDrawer";
import {defaultFinanceAccountFilters, filterFinanceAccounts, financeAccountFiltersToSearch, parseFinanceAccountFilters} from "../finance-account.filters";
import {countFinanceAccountStatuses, financeAccountStatusKey, summarizeFinanceAccounts, type FinanceAccountStatusKey} from "../finance-account.summary";
import {financeChartCategoryColor} from "../finance-chart.utils";
import {formatStoreDateTime, storeDate} from "@/src/utils/storeTime";

function useFinanceAccountUrlState() {
  const {value: filters, commit} = useUrlSearchState({defaultValue: defaultFinanceAccountFilters, parse: parseFinanceAccountFilters, serialize: financeAccountFiltersToSearch});
  return {filters, commit};
}

export function FinanceAccountsPage() {
  const {active} = useWorkspaceTabActivity();
  const {session, logout} = useAuth();
  const {filters, commit} = useFinanceAccountUrlState();
  const allowed = createCapabilities(session).menu("settlement_accounts");
  const accountsQuery = useQuery({queryKey: queryKeys.finance.accounts(), queryFn: ({signal}) => financeAccountsApi.listAll(signal), enabled: active && Boolean(session && allowed), placeholderData: keepPreviousData, retry: false});

  useEffect(() => {
    if (accountsQuery.error instanceof ApiError && accountsQuery.error.isUnauthorized) logout();
  }, [accountsQuery.error, logout]);

  if (!session) return <Card><ErpLoadingState title="正在验证登录状态" description="正在读取当前账号的资金账户权限。" /></Card>;
  if (!allowed) return <ErpPageError title="当前账号没有资金账户权限" description="当前账号没有查看账户余额的权限，请联系管理员开通。" />;
  if (accountsQuery.isPending) return <ErpFinancePageFrame><FinanceAccountsHeader loading /><Card><ErpLoadingState title="正在加载真实资金账户" /></Card></ErpFinancePageFrame>;
  if (accountsQuery.error && !accountsQuery.data) return <ErpFinancePageFrame><FinanceAccountsHeader /><ErpPageError title="资金账户加载失败" description={accountsQuery.error.message} onRetry={() => void accountsQuery.refetch()} /></ErpFinancePageFrame>;
  return <FinanceAccountsContent session={session} query={accountsQuery} filters={filters} onFiltersChange={commit} onAuthExpired={logout} />;
}

function FinanceAccountsContent({session, query, filters, onFiltersChange, onAuthExpired}: {session: AuthSession; query: UseQueryResult<FinanceAccountCollection, Error>; filters: ReturnType<typeof parseFinanceAccountFilters>; onFiltersChange: (filters: ReturnType<typeof parseFinanceAccountFilters>) => void; onAuthExpired: () => void}) {
  const {active} = useWorkspaceTabActivity();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [detailId, setDetailId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [reconcileId, setReconcileId] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [quickStatus, setQuickStatus] = useState<FinanceAccountStatusKey>("all");
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
  const matchingFilters = useMemo(() => filterFinanceAccounts(accounts, filters), [accounts, filters]);
  const filtered = useMemo(() => matchingFilters.filter((account) => quickStatus === "all" || financeAccountStatusKey(account) === quickStatus), [matchingFilters, quickStatus]);
  const distribution = useMemo(() => buildDistribution(accounts), [accounts]);
  const statusCounts = useMemo(() => countFinanceAccountStatuses(accounts), [accounts]);
  const anomalies = useMemo(() => buildAnomalies(accounts), [accounts]);
  const accountLedgerQuery = useQuery({queryKey: queryKeys.finance.accountLedger(detail?.id || ""), queryFn: ({signal}) => financeAccountsApi.ledger(detail?.id || "", 1, 20, signal), enabled: active && Boolean(detail && canViewLedger), retry: false});

  useEffect(() => {
    const unauthorized = [accountLedgerQuery.error].some((error) => error instanceof ApiError && error.isUnauthorized);
    if (unauthorized) onAuthExpired();
  }, [accountLedgerQuery.error, onAuthExpired]);

  const invalidate = async () => invalidateErpDomains(queryClient, ["finance", "state", "sales", "purchase"]);
  const handleError = (error: Error) => {
    if (error instanceof ApiError && error.isUnauthorized) {
      onAuthExpired();
      return;
    }
    notify.error(error.message);
  };
  const createMutation = useMutation({mutationFn: (values: FinanceAccountCreateValues) => financeAccountsApi.create(values), onSuccess: async (account) => {notify.success(`${account.name} 已创建`); setCreateOpen(false); setDetailId(account.id); await invalidate();}, onError: handleError});
  const reconcileMutation = useMutation({mutationFn: ({id, values}: {id: string; values: FinanceAccountReconcileValues}) => financeAccountsApi.reconcile(id, values), onSuccess: async (account) => {notify.success(`${account.name} 的实盘余额已记录`); setReconcileId(null); setDetailId(account.id); await invalidate();}, onError: handleError});
  const deleteMutation = useMutation({mutationFn: (id: string) => financeAccountsApi.remove(id), onSuccess: async () => {notify.success("资金账户已删除"); setDeleteId(null); setDetailId(null); await invalidate();}, onError: handleError});
  const updateFilters = (partial: Partial<typeof filters>) => {
    if (partial.status !== undefined) setQuickStatus("all");
    onFiltersChange({...filters, ...partial, page: partial.page ?? 1});
  };
  const resetFilters = () => {
    setQuickStatus("all");
    onFiltersChange(defaultFinanceAccountFilters);
  };
  const changeQuickStatus = (status: FinanceAccountStatusKey) => {
    setQuickStatus(status);
    if (filters.status !== "all") onFiltersChange({...filters, status: "all", page: 1});
  };
  const openCreate = () => {createMutation.reset(); setCreateOpen(true);};
  const refreshAll = async () => {
    const requests: Array<Promise<unknown>> = [query.refetch()];
    if (canViewLedger && detail) requests.push(accountLedgerQuery.refetch());
    await Promise.all(requests);
  };
  const refreshing = query.isFetching || (canViewLedger && accountLedgerQuery.isFetching);
  const exportAccounts = () => {
    const rows = [
      ["账户编号", "账户名称", "账户类型", "归属", "平台 / 银行", "账面余额", "可用余额", "冻结金额", "状态"],
      ...filtered.map((account) => [account.id, account.name, account.type, account.owner, account.platform, account.balance, account.availableBalance, account.frozenAmount, account.enabled ? "启用" : "停用"]),
    ];
    const csv = `\uFEFF${rows.map((row) => row.map(csvCell).join(",")).join("\n")}`;
    const url = URL.createObjectURL(new Blob([csv], {type: "text/csv;charset=utf-8"}));
    const link = document.createElement("a");
    link.href = url;
    link.download = `资金账户-${storeDate()}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return <ErpFinancePageFrame>
    <FinanceAccountsHeader accounts={accounts} loading={refreshing} onRefresh={() => void refreshAll()} onCreate={openCreate} onTransfer={canTransfer ? () => void navigate({to: "/finance/transfers"}) : undefined} onReconcile={() => void navigate({to: "/finance/closing"})} canViewReconciliation={capabilities.menu("finance")} onLedger={canViewLedger ? () => void navigate({to: "/finance/ledger"}) : undefined} onExport={exportAccounts} />
    <ErpPageContent className="space-y-[var(--erp-page-gap)]">
<div className="min-w-0 space-y-4">
      <SummaryCards summary={summary} accountCount={accounts.length} desktop distribution={distribution} negativeAccountCount={accounts.filter((account) => account.enabled && account.balance < 0).length} />
      <ErpPageToolbar>
        <ErpFilterBar className="bg-[var(--erp-color-surface)]" actions={<div className="flex flex-wrap items-center gap-2"><Button type="button" size="sm" variant={advancedOpen ? "secondary" : "ghost"} onClick={() => setAdvancedOpen((value) => !value)}><Settings2 className="h-4 w-4" />更多筛选</Button><Button type="button" size="sm" variant="ghost" onClick={resetFilters}><RefreshCw className="h-4 w-4" />重置</Button></div>}>
          <ErpSearchInput className="min-w-[220px] flex-1" value={filters.keyword} onChange={(event) => updateFilters({keyword: event.target.value})} placeholder="搜索账户名称、账号或备注..." aria-label="搜索资金账户" />
          <Select className="w-36" value={filters.type} onValueChange={(type) => updateFilters({type: type as typeof filters.type})} options={[{value: "all", label: "全部类型"}, ...financeAccountTypes.map((value) => ({value, label: value}))]} aria-label="筛选账户类型" />
          <Select className="w-32" value={filters.status} onValueChange={(status) => updateFilters({status: status as typeof filters.status})} options={[{value: "all", label: "全部状态"}, {value: "enabled", label: "启用账户"}, {value: "pending", label: "待核对账户"}, {value: "disabled", label: "停用账户"}, {value: "difference", label: "存在差额"}]} aria-label="筛选账户状态" />
          {advancedOpen && <><Input className="w-32" value={filters.owner} onChange={(event) => updateFilters({owner: event.target.value})} placeholder="账户归属" aria-label="筛选账户归属" /><Input className="w-32" value={filters.platform} onChange={(event) => updateFilters({platform: event.target.value})} placeholder="平台 / 银行" aria-label="筛选平台或银行" /></>}
        </ErpFilterBar>
      </ErpPageToolbar>
      <AccountStatusFilters counts={statusCounts} value={quickStatus} onChange={changeQuickStatus} />
      {filtered.length !== accounts.length && <div className="flex items-center gap-1 px-1 text-xs text-[var(--erp-color-text-secondary)]">已筛选 {filtered.length} / {accounts.length} 个账户 <Button type="button" size="xs" variant="ghost" className="h-auto px-1 font-semibold text-[var(--erp-color-primary)] hover:underline" onClick={resetFilters}>清空筛选</Button></div>}
      {anomalies.length > 0 && <AccountAnomalyNotice rows={anomalies} onOpen={() => void navigate({to: "/finance/closing"})} />}
      <AccountCards accounts={filtered} onCreate={openCreate} onView={(account) => setDetailId(account.id)} onCollect={(account) => void navigate({to: "/finance/income", search: {accountId: account.id}})} onTransfer={(account) => void navigate({to: "/finance/transfers", search: {fromAccountId: account.id}})} onLedger={(account) => void navigate({to: "/finance/ledger", search: {accountId: account.id}})} canCollect={canCollect} canTransfer={canTransfer} canViewLedger={canViewLedger} showCreateCard={false} />
    </div>
    
    <FinanceAccountDetailDrawer account={detail} canViewLedger={canViewLedger} canDelete={canDelete} ledgerQuery={accountLedgerQuery} onClose={() => setDetailId(null)} onOpenLedger={() => void navigate({to: "/finance/ledger"})} onReconcile={() => {if (detail) {reconcileMutation.reset(); setReconcileId(detail.id);}}} onDelete={() => {if (detail) setDeleteId(detail.id);}} />
    <FinanceAccountCreateDialog open={createOpen} pending={createMutation.isPending} error={createMutation.error?.message} onOpenChange={setCreateOpen} onSubmit={async (values) => {await createMutation.mutateAsync(values);}} />
    <FinanceAccountReconcileDialog account={reconciling} pending={reconcileMutation.isPending} error={reconcileMutation.error?.message} onOpenChange={(open) => {if (!open) setReconcileId(null);}} onSubmit={async (values) => {if (reconciling) await reconcileMutation.mutateAsync({id: reconciling.id, values});}} />
    <FinanceAccountDeleteDialog account={deleting} pending={deleteMutation.isPending} onOpenChange={(open) => {if (!open) setDeleteId(null);}} onConfirm={() => {if (deleting) deleteMutation.mutate(deleting.id);}} />
    </ErpPageContent>
  </ErpFinancePageFrame>;
}

function FinanceAccountsHeader({accounts = [], loading = false, onRefresh, onCreate, onTransfer, onReconcile, canViewReconciliation = false, onLedger, onExport}: {accounts?: FinanceAccountItem[]; loading?: boolean; onRefresh?: () => void; onCreate?: () => void; onTransfer?: () => void; onReconcile?: () => void; canViewReconciliation?: boolean; onLedger?: () => void; onExport?: () => void}) {
  const desktop = useErpDesktop();
  const hasDifference = accounts.some((account) => account.difference !== undefined && Math.abs(account.difference) > 0.009);
  const pending = accounts.some(isPendingAccount);
  const reconciled = accounts.filter((account) => account.lastReconciledAt).sort((left, right) => String(right.lastReconciledAt).localeCompare(String(left.lastReconciledAt)))[0];
  const reconciliation = hasDifference
    ? {label: "有差异", tone: "warning" as const, description: "存在账户余额差异"}
    : pending
      ? {label: "待对账", tone: "info" as const, description: "存在尚未记录实盘余额的账户"}
      : reconciled
      ? {label: "已平衡", tone: "success" as const, description: `最近 ${formatStoreDateTime(reconciled.lastReconciledAt).slice(0, 10)}`}
      : {label: "待对账", tone: "info" as const, description: "尚未记录实盘余额"};
  const quickStatus: QuickStatusItemData[] = [
    {icon: <FileCheck2 className="h-4 w-4" />, label: "对账状态", value: reconciliation.label, tone: reconciliation.tone, description: reconciliation.description},
  ];
  return <ErpPageHeader title="资金账户" quickStatus={desktop ? undefined : quickStatus} actions={<><Button type="button" size="sm" variant="secondary" onClick={onRefresh} disabled={!onRefresh || loading}><RefreshCw className={loading ? "h-4 w-4 animate-spin" : "h-4 w-4"} />刷新</Button>{onLedger && <Button type="button" size="sm" variant="secondary" onClick={onLedger}><FileText className="h-4 w-4" />查看流水</Button>}{desktop ? <FinanceAccountsMoreMenu onTransfer={onTransfer} onReconcile={canViewReconciliation ? onReconcile : undefined} onExport={onExport} /> : <>{onTransfer && <Button type="button" size="sm" variant="secondary" onClick={onTransfer}><ArrowLeftRight className="h-4 w-4" />资金调拨</Button>}{canViewReconciliation && onReconcile && <Button type="button" size="sm" variant="secondary" onClick={onReconcile}><FileCheck2 className="h-4 w-4" />对账管理</Button>}{onExport && <Button type="button" size="sm" variant="secondary" onClick={onExport}><Download className="h-4 w-4" />导出账户</Button>}</>}<Button type="button" size="sm" variant="primary" onClick={onCreate} disabled={!onCreate}><Plus className="h-4 w-4" />新增账户</Button></>} />;
}

function FinanceAccountsMoreMenu({onTransfer, onReconcile, onExport}: {onTransfer?: () => void; onReconcile?: () => void; onExport?: () => void}) {
  if (!onTransfer && !onReconcile && !onExport) return null;
  const run = (event: React.MouseEvent<HTMLButtonElement>, action?: () => void) => {
    event.currentTarget.closest("details")?.removeAttribute("open");
    action?.();
  };
  return <details className="relative">
    <summary className="erp-focus-ring inline-flex h-9 cursor-pointer list-none items-center gap-1.5 rounded-[var(--erp-radius-md)] border border-[var(--erp-color-border)] bg-[var(--erp-color-surface)] px-3 text-sm font-medium text-[var(--erp-color-text-secondary)] hover:bg-[var(--erp-color-surface-muted)]"><MoreHorizontal className="h-4 w-4" />更多</summary>
    <div className="erp-popover-layer absolute right-0 top-full mt-2 min-w-44 rounded-[var(--erp-radius-md)] border border-[var(--erp-color-border)] bg-[var(--erp-color-surface)] p-1 shadow-[var(--erp-shadow-popover)]">
      {onTransfer && <Button type="button" size="sm" variant="ghost" className="w-full justify-start" onClick={(event) => run(event, onTransfer)}><ArrowLeftRight className="h-4 w-4" />资金调拨</Button>}
      {onReconcile && <Button type="button" size="sm" variant="ghost" className="w-full justify-start" onClick={(event) => run(event, onReconcile)}><FileCheck2 className="h-4 w-4" />对账管理</Button>}
      {onExport && <Button type="button" size="sm" variant="ghost" className="w-full justify-start" onClick={(event) => run(event, onExport)}><Download className="h-4 w-4" />导出账户</Button>}
    </div>
  </details>;
}

function SummaryCards({summary, accountCount, desktop = false, distribution, negativeAccountCount = 0}: {summary: ReturnType<typeof summarizeFinanceAccounts>; accountCount: number; desktop?: boolean; distribution?: ReturnType<typeof buildDistribution>; negativeAccountCount?: number}) {
  const positiveRows = distribution?.rows || [];
  const positiveTotal = distribution?.positiveTotal || 0;
  // The distribution bar needs a full-width card; half-width phone cards keep label, value, detail.
  const supplement = desktop ? <div className="space-y-1.5 max-md:hidden">
    <div className="flex items-center justify-between gap-2 text-xs text-[var(--erp-color-text-muted)]"><span>正余额资金分布</span><span>{formatMoney(positiveTotal)}</span></div>
    <div role="img" aria-label={`正余额资金分布，共 ${positiveRows.length} 个分类`} className="flex h-1.5 w-full overflow-hidden rounded-full bg-[var(--erp-color-surface-muted)]">
      {positiveTotal > 0 ? positiveRows.map((row) => <span key={row.id} title={row.name} className="h-full min-w-0" style={{flexGrow: row.value, flexBasis: 0, backgroundColor: financeChartCategoryColor(row.id)}} />) : <span className="h-full w-full bg-[var(--erp-color-border-strong)]" />}
    </div>
    {negativeAccountCount > 0 && <span className="block text-xs font-medium text-[var(--erp-color-warning)]">{negativeAccountCount} 个账户余额为负</span>}
  </div> : undefined;
  return <MetricsRegion><SummaryCard label="账面余额" value={summary.bookBalance} detail="全部资金账户，包含负余额" supplementalContent={supplement} icon={<WalletCards className="h-4 w-4" />} tone="info" /><SummaryCard label="可用资金" value={summary.availableBalance} detail="账面余额减冻结金额" icon={<Banknote className="h-4 w-4" />} tone="info" /><SummaryCard label="冻结资金" value={summary.frozenAmount} detail="暂不可动用的资金" icon={<LockKeyhole className="h-4 w-4" />} tone="warning" /><SummaryCard label="账户数量" value={accountCount} detail={`启用 ${summary.enabledCount} 个${summary.disabledCount ? ` · 停用 ${summary.disabledCount} 个` : ""}`} icon={<Landmark className="h-4 w-4" />} tone="info" count /></MetricsRegion>;
}

function SummaryCard({label, value, detail, icon, tone, count = false, supplementalContent}: {label: string; value: number; detail: string; icon: ReactNode; tone: "info" | "success" | "warning"; count?: boolean; supplementalContent?: ReactNode}) {
  return <ErpMetricCard label={label} value={count ? `${value} 个` : formatMoney(value)} detail={detail} supplementalContent={supplementalContent} icon={icon} tone={!count && value < 0 ? "danger" : tone} valueTone={!count && value < 0 ? "danger" : tone} />;
}

function AccountStatusFilters({counts, value, onChange}: {counts: ReturnType<typeof countFinanceAccountStatuses>; value: FinanceAccountStatusKey; onChange: (value: FinanceAccountStatusKey) => void}) {
  const items: Array<{key: FinanceAccountStatusKey; label: string; count: number}> = [
    {key: "all", label: "全部", count: Object.values(counts).reduce((sum, count) => sum + count, 0)},
    {key: "normal", label: "正常", count: counts.normal},
    {key: "pending", label: "待核对", count: counts.pending},
    {key: "abnormal", label: "异常", count: counts.abnormal},
    {key: "frozen", label: "冻结", count: counts.frozen},
    {key: "disabled", label: "停用", count: counts.disabled},
  ];
  return <ErpChoiceChips label="按资金账户状态筛选" value={value} options={items.map((item) => ({value: item.key, label: item.label, count: item.count}))} onValueChange={onChange} />;
}

function AccountAnomalyNotice({rows, onOpen}: {rows: ExceptionRow[]; onOpen: () => void}) {
  return <div role="status" className="flex flex-wrap items-center justify-between gap-3 rounded-[var(--erp-radius-md)] border border-[var(--erp-color-warning)]/30 bg-[var(--erp-color-warning-soft)] px-4 py-3">
    <div className="flex min-w-0 items-start gap-2">
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-[var(--erp-color-warning)]" />
      <div className="min-w-0 space-y-1">{rows.map((row) => <p key={row.key} className="text-sm text-[var(--erp-color-text)]"><span className="font-semibold">{row.title}</span><span className="ml-2 text-xs text-[var(--erp-color-text-secondary)]">{row.description}</span></p>)}</div>
    </div>
    <Button type="button" size="sm" variant="secondary" onClick={onOpen}>去财务核对</Button>
  </div>;
}

function AccountCards({accounts, onCreate, onView, onCollect, onTransfer, onLedger, canCollect, canTransfer, canViewLedger, showCreateCard = true}: {accounts: FinanceAccountItem[]; onCreate: () => void; onView: (account: FinanceAccountItem) => void; onCollect: (account: FinanceAccountItem) => void; onTransfer: (account: FinanceAccountItem) => void; onLedger: (account: FinanceAccountItem) => void; canCollect: boolean; canTransfer: boolean; canViewLedger: boolean; showCreateCard?: boolean}) {
  // Phones list accounts as rows inside one card (no card-in-card); the header owns 新增账户.
  return <Card className="p-4 max-md:px-4 max-md:py-1"><div className="grid grid-cols-1 gap-3 max-md:gap-0 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-5">{accounts.map((account) => <AccountCard key={account.id} account={account} onView={() => onView(account)} onCollect={() => onCollect(account)} onTransfer={() => onTransfer(account)} onLedger={() => onLedger(account)} canCollect={canCollect} canTransfer={canTransfer} canViewLedger={canViewLedger} />)}{showCreateCard && <Button type="button" variant="ghost" className="h-auto min-h-[178px] w-full flex-col items-center justify-center gap-2 rounded-[var(--erp-radius-lg)] border border-dashed max-md:hidden border-[var(--erp-color-border-strong)] bg-[var(--erp-color-surface-muted)]/40 text-sm font-semibold text-[var(--erp-color-text-secondary)] hover:border-[var(--erp-color-primary)] hover:bg-[var(--erp-color-info-soft)] hover:text-[var(--erp-color-primary)]" onClick={onCreate}><span className="flex h-8 w-8 items-center justify-center rounded-full border border-[var(--erp-color-border-strong)] bg-[var(--erp-color-surface)]"><Plus className="h-4 w-4" /></span>新增账户</Button>}</div>{accounts.length === 0 && <div className="mt-3"><ErpEmptyState title="暂无匹配账户" description="请调整筛选条件，或新增一个资金账户。" /></div>}</Card>;
}

function AccountCard({account, onView, onCollect, onTransfer, onLedger, canCollect, canTransfer, canViewLedger}: {account: FinanceAccountItem; onView: () => void; onCollect: () => void; onTransfer: () => void; onLedger: () => void; canCollect: boolean; canTransfer: boolean; canViewLedger: boolean}) {
  const status = accountStatus(account);
  return <article className="flex min-h-[178px] flex-col overflow-hidden rounded-[var(--erp-radius-lg)] border border-[var(--erp-color-border)] bg-[var(--erp-color-surface)] transition-shadow hover:shadow-[var(--erp-shadow-card)] max-md:min-h-0 max-md:rounded-none max-md:border-x-0 max-md:border-b-0 max-md:first:border-t-0 max-md:hover:shadow-none"><Button type="button" variant="ghost" className="h-auto min-h-0 w-full flex-1 flex-col items-stretch justify-start p-3 text-left" onClick={onView}><div className="flex items-start gap-2"><span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--erp-color-info-soft)] text-[var(--erp-color-primary)]">{accountIcon(account.type)}</span><span className="min-w-0 flex-1"><span className="flex items-center gap-1.5"><span className="truncate text-sm font-semibold text-[var(--erp-color-text)]">{account.name}</span><ErpStatusBadge label={status.label} tone={status.tone} /></span><span className="mt-1 block truncate text-xs text-[var(--erp-color-text-muted)]">{account.platform || account.type}</span></span></div><span className={`mt-4 block erp-data-number text-lg font-semibold ${account.balance < 0 ? "text-[var(--erp-color-danger)]" : "text-[var(--erp-color-text)]"}`}>{formatMoney(account.balance)}</span><span className="mt-1 block text-xs text-[var(--erp-color-text-secondary)]">可用 {formatMoney(account.availableBalance)}</span></Button><div className="flex items-center justify-between border-t border-[var(--erp-color-border)] px-2 py-2"><CardAction label="收款" icon={<ArrowDownToLine className="h-3.5 w-3.5" />} onClick={onCollect} disabled={!canCollect} /><CardAction label="转账" icon={<ArrowLeftRight className="h-3.5 w-3.5" />} onClick={onTransfer} disabled={!canTransfer} /><CardAction label="流水" icon={<FileText className="h-3.5 w-3.5" />} onClick={onLedger} disabled={!canViewLedger} /></div></article>;
}

function CardAction({label, icon, onClick, disabled}: {label: string; icon: ReactNode; onClick: () => void; disabled?: boolean}) {
  return <Button type="button" size="xs" variant="ghost" className="h-7 gap-0.5 whitespace-nowrap rounded-[var(--erp-radius-sm)] px-1 text-xs font-semibold text-[var(--erp-color-text-secondary)] hover:bg-[var(--erp-color-surface-muted)]" onClick={(event) => {event.stopPropagation(); onClick();}} disabled={disabled}>{icon}{label}</Button>;
}







type ExceptionRow = {key: string; title: string; description: string; tone: "info" | "warning"};

function buildDistribution(accounts: FinanceAccountItem[]) {
  const positiveAccounts = accounts.filter((account) => account.enabled && account.balance > 0).sort((left, right) => right.balance - left.balance);
  const rows = positiveAccounts.slice(0, 5).map((account) => ({id: account.id, name: account.name, value: account.balance}));
  const remainder = positiveAccounts.slice(5).reduce((sum, account) => sum + account.balance, 0);
  if (remainder > 0) rows.push({id: "other-positive", name: "其他账户", value: remainder});
  return {
    rows,
    positiveTotal: positiveAccounts.reduce((sum, account) => sum + account.balance, 0),
    netBalance: accounts.filter((account) => account.enabled).reduce((sum, account) => sum + account.balance, 0),
  };
}



function buildAnomalies(accounts: FinanceAccountItem[]): ExceptionRow[] {
  return accounts
    .filter((account) => account.difference !== undefined && Math.abs(account.difference) > 0.009)
    .slice(0, 3)
    .map((account) => ({key: account.id, title: `${account.name} 存在实盘差额`, description: `差额 ${formatMoney(account.difference || 0)}`, tone: "warning" as const}));
}

function isPendingAccount(account: FinanceAccountItem) {
  return account.enabled && account.actualBalance === undefined && account.frozenAmount <= 0 && !(account.difference !== undefined && Math.abs(account.difference) > 0.009);
}

function accountStatus(account: FinanceAccountItem) {
  const status = financeAccountStatusKey(account);
  if (status === "disabled") return {label: "停用", tone: "neutral" as const};
  if (status === "abnormal") return {label: "异常", tone: "danger" as const};
  if (status === "frozen") return {label: "冻结", tone: "warning" as const};
  if (status === "pending") return {label: "待核对", tone: "warning" as const};
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
function csvCell(value: unknown) {const text = String(value ?? ""); return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;}
