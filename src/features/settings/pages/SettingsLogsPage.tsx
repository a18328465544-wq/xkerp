import {keepPreviousData, useQuery} from "@tanstack/react-query";
import {useWorkspaceTabActivity} from "@/src/hooks/useWorkspaceTabRuntime";
import type {ColumnDef} from "@tanstack/react-table";
import {ClipboardList} from "lucide-react";
import {useEffect, useState} from "react";
import {Button, Card} from "@/src/components/ui";
import {DashboardSection, ErpDetailDrawer, ErpDetailFact, ErpListPage, ErpMetricCard, ErpMobileRecordRow, ErpPageError, ErpStatusBadge, type QuickStatusItemData} from "@/src/components/common";
import {ApiError, logsApi, queryKeys, type AuthSession} from "@/src/services/api";
import {createCapabilities, useAuth} from "@/src/app/auth";
import type {AuditLogItem} from "@/src/types/finance-remaining";
import type {LogsFilters} from "@/src/services/api/endpoints/finance-remaining";

function allowed(session: AuthSession | null | undefined) {return Boolean(session?.permissions.allowedMenus.some((id) => id === "all" || id === "logs"));}
export function SettingsLogsPage() {
  const {active} = useWorkspaceTabActivity();
  const {session, status, error: authError, refresh, logout} = useAuth();
  const canRead = createCapabilities(session).menu("logs") || allowed(session);
  const [filters, setFilters] = useState<LogsFilters>({page: 1, pageSize: 20, keyword: ""});
  const query = useQuery({queryKey: queryKeys.settings.logs(filters), queryFn: ({signal}) => logsApi.list(filters, signal), enabled: active && Boolean(session && canRead), placeholderData: keepPreviousData, retry: false});
  useEffect(() => {if (query.error instanceof ApiError && query.error.isUnauthorized) logout();}, [logout, query.error]);
  if (status === "loading") return <Card><p className="p-5 text-sm">正在验证操作日志权限…</p></Card>;
  if (status === "error") return <ErpPageError title="无法读取登录状态" description={authError?.message || "请重新登录后继续。"} onRetry={() => void refresh()} />;
  if (!session || !canRead) return <ErpPageError title="当前账号没有操作日志权限" description="当前账号没有查看操作日志的权限。" />;
  if (query.error && !query.data) return <ErpPageError title="操作日志加载失败" description={query.error.message} onRetry={() => void query.refetch()} />;
  return <SettingsLogsContent filters={filters} setFilters={setFilters} query={query} />;
}
function SettingsLogsContent({filters, setFilters, query}: {filters: LogsFilters; setFilters: (value: LogsFilters) => void; query: ReturnType<typeof useQuery<Awaited<ReturnType<typeof logsApi.list>>>>}) {
  const [detail, setDetail] = useState<AuditLogItem | null>(null); const data = query.data; const items = data?.items || []; const meta = data?.meta; const columns: ColumnDef<AuditLogItem, unknown>[] = [{accessorKey: "time", header: "时间", size: 150, cell: ({row}) => <span className="erp-data-number text-xs">{row.original.time}</span>}, {accessorKey: "user", header: "操作人", size: 120}, {accessorKey: "module", header: "模块", size: 120}, {accessorKey: "type", header: "动作", size: 120, cell: ({row}) => <ErpStatusBadge label={row.original.type} tone="info" />}, {accessorKey: "target", header: "目标", size: 220}, {id: "action", header: "操作", size: 80, cell: ({row}) => <Button type="button" size="sm" variant="ghost" onClick={(event) => {event.stopPropagation(); setDetail(row.original);}}>详情</Button>}]; const active = Boolean(filters.keyword); const quickStatus: QuickStatusItemData[] = [{icon: <ClipboardList className="h-4 w-4" />, label: "日志记录", value: `${meta?.total || 0} 条`, tone: "info"}]; const updateKeyword = (keyword: string) => setFilters({...filters, keyword, page: 1});
  const reset = () => setFilters({page: 1, pageSize: filters.pageSize, keyword: ""});
  return <ErpListPage
    pageFrame="settings"
    title="操作日志"
    phoneTitle="日志"
    subtitle="查看谁在什么时间对哪个业务对象执行了什么操作。"
    countLabel={(total) => `${total} 条`}
    quickStatus={quickStatus}
    metrics={[
      <Metric key="total" label="日志总数" value={`${meta?.total || 0} 条`} />,
      <Metric key="page" label="当前页" value={`${items.length} 条`} detail={`第 ${meta?.page || filters.page} 页`} />,
      <Metric key="filter" label="筛选状态" value={active ? "已筛选" : "全部"} detail="关键字过滤" />,
    ]}
    search={{value: filters.keyword, onChange: updateKeyword, label: "搜索操作日志", placeholder: "操作人、模块、目标或动作"}}
    onResetFilters={reset}
    onRefresh={() => void query.refetch()}
    refreshing={query.isFetching}
    tableTitle="审计记录"
    tableDescription="按时间倒序查看每一次操作。"
    tableDensity="compact"
    table={{ariaLabel: "操作日志明细", columns, data: items, getRowId: (row) => row.id, loading: query.isPending, fetching: query.isFetching, error: query.error as Error | null, errorTitle: "操作日志刷新失败", emptyTitle: "暂无操作日志", emptyDescription: active ? "当前关键字没有匹配记录。" : "系统尚未记录可见操作。", onRetry: () => void query.refetch(), onRowClick: setDetail, page: meta?.page || filters.page, pageSize: meta?.pageSize || filters.pageSize, total: meta?.total || 0, onPageChange: (page) => setFilters({...filters, page}), onPageSizeChange: (pageSize) => setFilters({...filters, page: 1, pageSize}), stickyHeader: true, mobileRow: (item) => <ErpMobileRecordRow title={item.target || item.type} subtitle={`${item.user} · ${item.module}`} meta={item.time} status={<ErpStatusBadge label={item.type} tone="info" />} onOpen={() => setDetail(item)} />}}
    overlayOpen={Boolean(detail)}
    overlays={<ErpDetailDrawer modal={false} resizable drawerKey="settings-log-detail" defaultWidth={620} minWidth={500} maxWidth={780} open={Boolean(detail)} onOpenChange={(open) => {if (!open) setDetail(null);}} title="操作日志详情" description={detail ? `${detail.module} · ${detail.type}` : undefined}>{detail && <div className="space-y-4"><div className="grid grid-cols-2 gap-3"><Fact label="时间" value={detail.time} /><Fact label="操作人" value={detail.user} /><Fact label="模块" value={detail.module} /><Fact label="动作" value={detail.type} /><Fact label="目标" value={detail.target} /></div><DashboardSection title="变更前后"><div className="space-y-3"><pre className="erp-scrollbar max-h-48 overflow-auto rounded-[var(--erp-radius-md)] bg-[var(--erp-color-surface-muted)] p-3 text-xs whitespace-pre-wrap">变更前：{detail.beforeVal || "—"}</pre><pre className="erp-scrollbar max-h-48 overflow-auto rounded-[var(--erp-radius-md)] bg-[var(--erp-color-surface-muted)] p-3 text-xs whitespace-pre-wrap">变更后：{detail.afterVal || "—"}</pre></div></DashboardSection></div>}</ErpDetailDrawer>}
  />;
}
const Metric = ErpMetricCard;
const Fact = ErpDetailFact;
