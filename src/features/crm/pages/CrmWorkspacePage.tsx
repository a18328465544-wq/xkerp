import {keepPreviousData, useMutation, useQuery, useQueryClient} from "@tanstack/react-query";
import {useNavigate} from "@tanstack/react-router";
import {CalendarClock, MessageSquarePlus, Sparkles, Target, UserPlus, Users} from "lucide-react";
import {ErpEntityThumbnail, ErpMobileRecordRow, ErpListPage, type ErpFilterField} from "@/src/components/common";
import {useEffect, useMemo, useState, type ReactNode} from "react";
import {notify} from "@/src/utils/notification";
import {Button, Card} from "@/src/components/ui";
import {DashboardSection, ErpDetailDrawer, ErpDetailFact, ErpDetailFactGrid, ErpEmptyState, ErpLoadingState, ErpMetricCard, ErpPageError, ErpStatusBadge, type QuickStatusItemData} from "@/src/components/common";
import {ApiError, crmApi, queryKeys, type AuthSession} from "@/src/services/api";
import {createCapabilities, useAuth} from "@/src/app/auth";
import {useTablePreferences} from "@/src/hooks/useTablePreferences";
import {useUrlSearchState} from "@/src/hooks/useUrlSearchState";
import {useWorkspaceTabActivity} from "@/src/hooks/useWorkspaceTabRuntime";
import {formatCurrency} from "@/src/lib/format";
import {formatStoreDateTime} from "@/src/utils/storeTime";
import type {CrmAccount, CrmFollowUpFormValues, CrmTimelineEvent} from "@/src/types/crm";
import {createCrmColumns} from "../crm.columns";
import {crmFiltersToSearch, defaultCrmFilters, parseCrmFilters} from "../crm.filters";
import {CrmFollowUpDialog} from "../components/CrmFollowUpDialog";

function useCrmUrlState() {
  return useUrlSearchState({defaultValue: defaultCrmFilters, parse: parseCrmFilters, serialize: crmFiltersToSearch});
}

export function CrmWorkspacePage() {
  const {session, logout} = useAuth();
  const canAccess = createCapabilities(session).menu("crm");
  if (!session) return <Card><ErpLoadingState title="正在验证客户 CRM 权限" />;</Card>;
  if (!canAccess) return <ErpPageError title="当前账号没有客户 CRM 权限" description="当前账号没有此页面的访问权限，请联系管理员开通。" />;
  return <CrmWorkspaceContent session={session} onAuthExpired={logout} />;
}

function CrmWorkspaceContent({session, onAuthExpired}: {session: AuthSession; onAuthExpired: () => void}) {
  const {active} = useWorkspaceTabActivity();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const {value: filters, commit} = useCrmUrlState();
  const [detail, setDetail] = useState<CrmAccount | null>(null);
  const [followUp, setFollowUp] = useState<CrmAccount | null>(null);
  const {columnVisibility, setColumnVisibility, density, setDensity} = useTablePreferences<Record<string, boolean>>({feature: "crm", userId: session.user.id, defaultVisibility: {}, defaultDensity: "comfortable"});
  const accountQuery = useQuery({queryKey: queryKeys.crm.accounts(filters), queryFn: ({signal}) => crmApi.accounts(filters, signal), enabled: active, placeholderData: keepPreviousData, retry: false});
  const summaryFilters = {keyword: filters.keyword, owner: filters.owner};
  const summaryQuery = useQuery({queryKey: queryKeys.crm.summary(summaryFilters), queryFn: ({signal}) => crmApi.summary(summaryFilters, signal), enabled: active, placeholderData: keepPreviousData, retry: false});
  const timelineQuery = useQuery({queryKey: queryKeys.crm.timeline(detail?.id || ""), queryFn: ({signal}) => crmApi.timeline(detail!.id, signal), enabled: active && Boolean(detail?.id), retry: false});
  const followUpMutation = useMutation({mutationFn: (values: CrmFollowUpFormValues) => crmApi.createFollowUp(values), onSuccess: async () => {notify.success("客户跟进已保存"); setFollowUp(null); await queryClient.invalidateQueries({queryKey: queryKeys.crm.all()});}, onError: (error: Error) => {if (error instanceof ApiError && error.isUnauthorized) {onAuthExpired();} else notify.error(error.message);}});
  useEffect(() => {const error = accountQuery.error || summaryQuery.error || timelineQuery.error; if (error instanceof ApiError && error.isUnauthorized) onAuthExpired();}, [accountQuery.error, onAuthExpired, summaryQuery.error, timelineQuery.error]);

  const columns = useMemo(() => createCrmColumns({onDetail: setDetail, onFollowUp: setFollowUp}), []);
  const accounts = accountQuery.data?.items || [];
  const owners = useMemo(() => Array.from(new Set([...(summaryQuery.data?.owners.map((item) => item.owner) || []), ...accounts.map((item) => item.owner).filter((item): item is string => Boolean(item))])).sort((a, b) => a.localeCompare(b, "zh-CN")), [accounts, summaryQuery.data?.owners]);
  const totals = summaryQuery.data?.totals;
  const quickStatus: QuickStatusItemData[] = [
    {icon: <Users className="h-4 w-4" />, label: "客户主体", value: `${accountQuery.data?.total || 0} 位`, description: "可直接打开客户档案", tone: "success"},
  ];
  const refresh = async () => {await Promise.all([accountQuery.refetch(), summaryQuery.refetch(), detail ? timelineQuery.refetch() : Promise.resolve()]);};
  const activeFilters = Number(Boolean(filters.keyword.trim())) + Number(Boolean(filters.owner));

  const setOwner = (owner: string) => commit({...filters, owner, page: 1});
  const filterFields: ErpFilterField[] = [
    {kind: "select", key: "owner", label: "负责人", width: "w-40", value: filters.owner, defaultValue: "", options: [{value: "", label: "全部负责人"}, ...owners.map((owner) => ({value: owner, label: owner}))], onChange: setOwner},
  ];
  const openNewLead = () => void navigate({to: "/crm/customers/new"});

  return <ErpListPage
    title="客户 CRM"
    subtitle="查看客户档案、跟进计划和业务时间线。"
    countLabel={(count) => `${count} 位客户`}
    loading={accountQuery.isPending}
    loadError={Boolean(accountQuery.error && !accountQuery.data)}
    quickStatus={quickStatus}
    pageFrame="crm"
    metrics={[
      <MetricCard key="customers" label="客户档案统计" value={totals ? `${totals.customers} 位` : "—"} detail="按客户档案统计，可能与客户列表数量不同" icon={<Users className="h-4 w-4" />} />,
      <MetricCard key="pending" label="到期跟进" value={totals ? `${totals.pendingFollowUps} 项` : "—"} detail="下次跟进时间不晚于今日" icon={<CalendarClock className="h-4 w-4" />} tone={totals?.pendingFollowUps ? "warning" : "normal"} />,
      <MetricCard key="intent" label="高意向客户" value={totals ? `${totals.highIntent} 位` : "—"} detail="沿用原 CRM 意向字段" icon={<Target className="h-4 w-4" />} />,
      <MetricCard key="deals" label="已成交客户" value={totals ? `${totals.deals} 位` : "—"} detail={totals ? `跟进中 ${totals.following} · 线索 ${totals.leads}` : "真实汇总加载中"} icon={<Sparkles className="h-4 w-4" />} tone="success" />,
    ]}
    search={{value: filters.keyword, onChange: (keyword) => commit({...filters, keyword, page: 1}), label: "搜索客户", placeholder: "搜索客户、电话、微信、城市或公司", phonePlaceholder: "搜索客户、电话、微信"}}
    filters={filterFields}
    onResetFilters={() => commit(defaultCrmFilters)}
    quickFilters={[
      {label: "全部", active: !filters.owner, onSelect: () => setOwner("")},
      ...(session.user.displayName ? [{label: "我的客户", active: filters.owner === session.user.displayName, onSelect: () => setOwner(session.user.displayName)}] : []),
    ]}
    defaultSortLabel="默认排序"
    primaryAction={{label: "新增客户线索", icon: <UserPlus className="h-4 w-4" />, onClick: openNewLead}}
    phonePrimaryAction={{label: "新增线索", icon: <UserPlus className="h-5 w-5" />, onClick: openNewLead}}
    onRefresh={() => void refresh()}
    refreshing={accountQuery.isFetching || summaryQuery.isFetching}
    resultsLabel="全部客户"
    tableTitle="客户池"
    columnSettings={{columns, visibility: columnVisibility, onVisibilityChange: setColumnVisibility, density, onDensityChange: setDensity}}
    table={{ariaLabel: "CRM 客户池", columns, data: accounts, getRowId: (row) => row.id, mobileShowDetailAction: false, mobileRow: (item) => (
        <ErpMobileRecordRow
          title={item.displayName}
          thumbnail={<ErpEntityThumbnail kind="customer" name={item.displayName} />}
          subtitle={item.phone || item.wechat || "未记录联系方式"}
          meta={`${item.businessStatus}${item.stage ? ` · ${item.stage}` : ""}${item.owner ? ` · ${item.owner}` : ""}`}
          statusPlacement="title"
          status={<ErpStatusBadge label={item.level || "未评级"} tone={item.level === "S级" ? "info" : "neutral"} />}
          amountLabel={item.estimatedAmount ? "预计成交" : undefined}
          amount={item.estimatedAmount ? formatCurrency(item.estimatedAmount) : undefined}
          onOpen={() => setDetail(item)}
        />
      ), mobileFieldOrder: ["contact","status","owner","nextFollowAt"], loading: accountQuery.isPending, fetching: accountQuery.isFetching, error: accountQuery.error as Error | null, errorTitle: "客户列表加载失败", emptyTitle: "暂无匹配客户", emptyDescription: activeFilters ? "请调整关键词或负责人筛选。" : "当前 CRM 尚无客户主体。", onRetry: () => void accountQuery.refetch(), onRowClick: setDetail, page: filters.page, pageSize: filters.pageSize, total: accountQuery.data?.total, onPageChange: (page) => commit({...filters, page}), onPageSizeChange: (pageSize) => commit({...filters, page: 1, pageSize}), enableColumnResizing: true, stickyHeader: true}}
    overlayOpen={Boolean(detail || followUp)}
    overlays={<>
      <CrmDetailDrawer account={detail} events={timelineQuery.data?.items || []} loading={timelineQuery.isPending} error={timelineQuery.error as Error | null} onRetry={() => void timelineQuery.refetch()} onClose={() => setDetail(null)} onFollowUp={() => {if (detail) setFollowUp(detail);}} />
      <CrmFollowUpDialog account={followUp} pending={followUpMutation.isPending} error={followUpMutation.error instanceof Error ? followUpMutation.error.message : undefined} onOpenChange={(open) => {if (!open) {setFollowUp(null); followUpMutation.reset();}}} onSubmit={async (values) => {await followUpMutation.mutateAsync(values);}} />
    </>}
  />;
}

function CrmDetailDrawer({account, events, loading, error, onRetry, onClose, onFollowUp}: {account: CrmAccount | null; events: CrmTimelineEvent[]; loading: boolean; error: Error | null; onRetry: () => void; onClose: () => void; onFollowUp: () => void}) {
  return <ErpDetailDrawer modal={false} resizable drawerKey="crm-detail" defaultWidth={720} minWidth={560} maxWidth={920} open={Boolean(account)} onOpenChange={(open) => {if (!open) onClose();}} title={account?.displayName || "客户详情"} description="客户档案与业务时间线" footer={account?.legacyCustomerId ? <Button className="w-full" variant="primary" onClick={onFollowUp}><MessageSquarePlus className="h-4 w-4" />新增跟进</Button> : <p className="text-center text-xs text-[var(--erp-color-warning)]">该客户档案尚未关联完整，暂不能新增跟进，请联系管理员。</p>}><div className="space-y-5">{account && <><ErpDetailFactGrid><Fact label="客户等级" value={account.level || "未评级"} /><Fact label="业务状态" value={`${account.businessStatus}${account.stage ? ` · ${account.stage}` : ""}`} /><Fact label="负责人" value={account.owner || "未分配"} /><Fact label="来源" value={account.source || "—"} /><Fact label="电话" value={account.phone || "—"} /><Fact label="微信 / QQ" value={account.wechat || account.qq || "—"} /><Fact label="城市 / 公司" value={[account.city, account.companyName].filter(Boolean).join(" · ") || "—"} /><Fact label="预计成交" value={account.estimatedAmount === undefined ? "—" : `${formatCurrency(account.estimatedAmount)} · ${account.dealProbability ?? 0}%`} /></ErpDetailFactGrid>{account.nextAction && <DashboardSection title="下一步动作"><p className="text-sm text-[var(--erp-color-text-secondary)]">{account.nextAction}</p><p className="mt-2 text-xs text-[var(--erp-color-text-muted)]">计划时间：{formatDateTime(account.nextFollowAt)}</p></DashboardSection>}<DashboardSection title="客户时间线" description="查看客户跟进与业务事件。">{loading ? <ErpLoadingState title="正在加载客户轨迹" /> : error ? <ErpEmptyState title="时间线加载失败" description={error.message} action={<Button size="sm" onClick={onRetry}>重试</Button>} /> : events.length ? <div className="space-y-3">{events.map((event) => <div key={event.id} className="flex gap-3"><span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-[var(--erp-color-primary)]" /><div className="min-w-0 flex-1 border-b border-[var(--erp-color-border)] pb-3 last:border-0"><p className="text-sm font-semibold">{event.summary}</p><p className="mt-1 erp-data-number text-xs text-[var(--erp-color-text-muted)]">{formatDateTime(event.occurredAt)} · {event.sourceType || event.eventType}{event.actorId ? ` · ${event.actorId}` : ""}</p></div></div>)}</div> : <ErpEmptyState title="暂无客户轨迹" description="新增客户、跟进、需求、报价或关联业务后会写入真实时间线。" />}</DashboardSection>{account.tags.length > 0 && <div className="flex flex-wrap gap-2">{account.tags.map((tag) => <ErpStatusBadge key={tag} label={tag} tone="neutral" />)}</div>}{account.remarks && <p className="rounded-[var(--erp-radius-md)] bg-[var(--erp-color-surface-muted)] p-3 text-sm text-[var(--erp-color-text-secondary)]">{account.remarks}</p>}</>}</div></ErpDetailDrawer>;
}

function formatDateTime(value: string | undefined) {
  return formatStoreDateTime(value);
}

function MetricCard({label, value, detail, icon, tone = "normal"}: {label: string; value: string; detail?: string; icon: ReactNode; tone?: "normal" | "success" | "warning"}) {return <ErpMetricCard label={label} value={value} detail={detail} icon={icon} tone={tone === "normal" ? "neutral" : tone} />;}
const Fact = ErpDetailFact;
