import {useQuery} from "@tanstack/react-query";
import {AlertCircle, CheckCircle2, Clock3, RefreshCw, Sparkles, TriangleAlert} from "lucide-react";
import {Link} from "@tanstack/react-router";
import {useEffect} from "react";
import {Button, Card, CardContent} from "@/src/components/ui";
import {AnalyticsInsightItem, AnalyticsKpiRegion, AnalyticsMainRegion, DashboardSection, ErpAnalyticsPageFrame, ErpEmptyState, ErpMetricCard, ErpPageHeader, ErpStatusBadge, type QuickStatusItemData} from "@/src/components/common";
import {ApiError, aiApi, queryKeys} from "@/src/services/api";
import {createCapabilities, useAuth} from "@/src/app/auth";

export function AiInsightsPage() {
  const {session, status, error: authError, refresh, logout} = useAuth();
  const allowed = createCapabilities(session).menu("ai_insights");
  const query = useQuery({queryKey: queryKeys.ai.insights(), queryFn: ({signal}) => aiApi.insights(signal), enabled: Boolean(session && allowed), retry: false});
  useEffect(() => {if (query.error instanceof ApiError && query.error.isUnauthorized) logout();}, [logout, query.error]);

  if (status === "loading") return <ErpAnalyticsPageFrame><Card><CardContent className="p-6 text-sm">正在验证 AI 建议权限…</CardContent></Card></ErpAnalyticsPageFrame>;
  if (status === "error") return <ErpAnalyticsPageFrame><Card><CardContent className="p-6"><ErpPageHeader title="AI 经营建议" /><p className="text-sm text-[var(--erp-color-danger)]">{authError?.message || "请重新登录后继续。"}</p><Button size="sm" className="mt-4" onClick={() => void refresh()}>重试</Button></CardContent></Card></ErpAnalyticsPageFrame>;
  if (!session || !allowed) return <ErpAnalyticsPageFrame><Card><CardContent className="p-6 text-sm">当前账号没有 AI 建议权限。</CardContent></Card></ErpAnalyticsPageFrame>;

  const insights = query.data?.insights || [];
  const hasData = Boolean(query.data);
  const highCount = insights.filter((item) => item.severity === "high").length;
  const quickStatus: QuickStatusItemData[] = [
    {icon: <Sparkles className="h-4 w-4" />, label: "建议数量", value: `${insights.length} 条`, description: "当前有效建议", tone: insights.length ? "info" : "neutral"},
    {icon: <TriangleAlert className="h-4 w-4" />, label: "高优先级", value: `${highCount} 条`, description: "需要优先处理", tone: highCount ? "danger" : "success"},
    {icon: query.data?.source === "ai" ? <Sparkles className="h-4 w-4" /> : <CheckCircle2 className="h-4 w-4" />, label: "建议来源", value: query.data?.source === "ai" ? "AI" : "规则", description: "服务器返回来源", tone: query.data?.source === "ai" ? "info" : "neutral"},
    {icon: <Clock3 className="h-4 w-4" />, label: "生成时间", value: query.data?.generatedAt || "—", description: query.data?.expiresAt ? `有效至 ${query.data.expiresAt}` : "暂无过期时间", tone: "neutral"},
  ];

  return <ErpAnalyticsPageFrame>
    <ErpPageHeader density="default" title="AI 经营建议" subtitle="基于服务器聚合经营数据生成可执行建议，不直接修改订单、价格或账务。" quickStatus={hasData ? quickStatus : []} actions={<Button variant="secondary" size="sm" onClick={() => void query.refetch()} disabled={query.isFetching}><RefreshCw className={query.isFetching ? "h-4 w-4 animate-spin" : "h-4 w-4"} />刷新建议</Button>} />
    {hasData && <AnalyticsKpiRegion primary={<>
      <ErpMetricCard label="建议数量" value={`${insights.length} 条`} detail="当前有效建议" icon={<Sparkles className="h-4 w-4" />} tone="info" />
      <ErpMetricCard label="高优先级" value={`${highCount} 条`} detail="需要优先处理" icon={<TriangleAlert className="h-4 w-4" />} tone={highCount ? "danger" : "success"} />
      <ErpMetricCard label="建议来源" value={query.data?.source === "ai" ? "AI" : "规则"} detail={query.data?.model || "服务器规则建议"} icon={<CheckCircle2 className="h-4 w-4" />} tone="neutral" />
    </>} />}
    {query.error ? <AnalyticsMainRegion variant="full"><AnalyticsMainRegion.Visualization size="standard"><Card><CardContent className="flex h-full flex-col items-center justify-center gap-3 text-center"><AlertCircle className="h-8 w-8 text-[var(--erp-color-danger)]" /><h2 className="text-lg font-bold">AI 建议暂时不可用</h2><p className="text-sm text-[var(--erp-color-text-secondary)]">{(query.error as Error).message}</p><Button size="sm" onClick={() => void query.refetch()}>重试</Button></CardContent></Card></AnalyticsMainRegion.Visualization></AnalyticsMainRegion> : query.isPending ? <AnalyticsMainRegion variant="full"><AnalyticsMainRegion.Visualization size="standard"><Card><CardContent className="space-y-3 p-6"><div className="h-20 animate-pulse rounded-xl bg-[var(--erp-color-surface-muted)]" /><div className="h-20 animate-pulse rounded-xl bg-[var(--erp-color-surface-muted)]" /></CardContent></Card></AnalyticsMainRegion.Visualization></AnalyticsMainRegion> : <AnalyticsMainRegion variant="3-1">
      <AnalyticsMainRegion.Visualization size="expanded"><DashboardSection title={<span className="flex items-center gap-2"><Sparkles className="h-5 w-5 text-[var(--erp-color-primary)]" />今日建议</span>} description={query.data?.source === "ai" ? `模型：${query.data.model || "已配置模型"}` : "当前使用服务器规则建议"} actions={<ErpStatusBadge label={`${insights.length} 条`} tone={insights.length ? "info" : "neutral"} />}><div>{insights.map((item) => <AnalyticsInsightItem key={item.id} label={<span className="flex items-center gap-2"><ErpStatusBadge label={item.label} tone={item.severity === "high" ? "danger" : item.severity === "medium" ? "warning" : "success"} /><span>置信度 {item.confidence}%</span></span>} title={item.title} value={<Link to={item.actionTab === "finance_reports" ? "/finance/profit" : item.actionTab === "quotes" ? "/quotes" : item.actionTab === "purchase_add" ? "/purchase/new" : item.actionTab === "sales_list" ? "/sales" : "/inventory"} className="text-xs font-semibold text-[var(--erp-color-primary)]">{item.actionLabel} →</Link>} metadata={<span>{item.detail}{item.evidence.length ? ` · ${item.evidence.join("；")}` : ""}</span>} tone={item.severity === "high" ? "danger" : item.severity === "medium" ? "warning" : "success"} />)}{!insights.length && <ErpEmptyState title="暂无经营建议" description="当前没有需要提醒的经营异常。" />}</div></DashboardSection></AnalyticsMainRegion.Visualization>
      <AnalyticsMainRegion.Insights><DashboardSection title="建议处理状态" description="先处理高优先级建议，再查看其他经营提示。"><div className="space-y-3 text-sm"><div className="flex items-center justify-between border-b border-[var(--erp-color-border)] pb-3"><span className="text-[var(--erp-color-text-secondary)]">高优先级</span><strong className="font-mono text-[var(--erp-color-danger)]">{highCount}</strong></div><div className="flex items-center justify-between border-b border-[var(--erp-color-border)] pb-3"><span className="text-[var(--erp-color-text-secondary)]">其他建议</span><strong className="font-mono text-[var(--erp-color-primary)]">{Math.max(0, insights.length - highCount)}</strong></div><div className="flex items-start gap-2 text-xs text-[var(--erp-color-text-muted)]"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-[var(--erp-color-success)]" />建议只提供决策参考，执行仍需人工确认。</div></div></DashboardSection></AnalyticsMainRegion.Insights>
    </AnalyticsMainRegion>}
  </ErpAnalyticsPageFrame>;
}
