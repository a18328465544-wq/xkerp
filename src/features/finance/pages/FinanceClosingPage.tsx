import {
  keepPreviousData,
  useQuery,
  type UseQueryResult,
} from "@tanstack/react-query";
import type { VisibilityState } from "@tanstack/react-table";
import {
  AlertTriangle,
  CalendarCheck2,
  Download,
  Landmark,
  ReceiptText,
  RefreshCw,
  RotateCcw,
  ShieldAlert,
  WalletCards,
} from "lucide-react";
import {ErpSearchInput} from "@/src/components/common";
import {
  useEffect,
  useMemo,
  useState,
} from "react";
import { useNavigate } from "@tanstack/react-router";
import { Button, Card } from "@/src/components/ui";
import {
  DashboardSection,
  ErpFinancePageFrame,
  ErpDateRangePicker,
  ErpEmptyState,
  ErpFilterBar,
  ErpLoadingState,
  ErpPageContent,
  ErpPageError,
  ErpPageHeader,
  ErpPageToolbar,
  ErpStatusBadge,
  MainRegion,
  MetricsRegion,
  type QuickStatusItemData,
} from "@/src/components/common";
import {
  ApiError,
  financeClosingApi,
  queryKeys,
  type AuthSession,
} from "@/src/services/api";
import {createCapabilities, useAuth} from "@/src/app/auth";
import {useTablePreferences} from "@/src/hooks/useTablePreferences";
import {useUrlSearchState} from "@/src/hooks/useUrlSearchState";
import { formatCurrency } from "@/src/lib/format";
import type {
  FinanceDailyClosing,
  FinanceDailyClosingCollection,
} from "@/src/types/finance-closing";
import {
  countActiveFinanceClosingFilters,
  defaultFinanceClosingFilters,
  financeClosingFiltersToSearch,
  financeClosingStatus,
  financeClosingStatusLabel,
  parseFinanceClosingFilters,
  selectFinanceClosingReport,
  type FinanceClosingFilters,
} from "../finance-closing";
import { FinanceSectionTabs } from "../components/FinanceSectionTabs";
import {FinanceTableControls} from "../components/FinanceTableControls";
import {FinanceLatestExceptions} from "../components/FinanceLatestExceptions";
import {FinanceTableRegion} from "../components/FinanceTableRegion";
import {createFinanceClosingColumns, FinanceClosingDetailDrawer} from "../components/FinanceClosingSections";
import {
  FinanceMetricCard,
} from "../components/FinanceMetricCard";
import {financeNetTone} from "../finance-chart.utils";

function useFinanceClosingUrlState() {
  const state = useUrlSearchState<FinanceClosingFilters>({
    defaultValue: defaultFinanceClosingFilters,
    parse: parseFinanceClosingFilters,
    serialize: financeClosingFiltersToSearch,
  });
  return {filters: state.value, commit: state.commit};
}

export function FinanceClosingPage() {
  const { filters, commit } = useFinanceClosingUrlState();
  const {session, status, error: authError, refresh, logout} = useAuth();
  // Both daily-closing endpoints are protected by the server's `finance`
  // permission. `finance_closing` is a client navigation compatibility id and
  // must not be treated as sufficient to issue a request that would 403.
  const allowed = createCapabilities(session).menu("finance");
  const closingQuery = useQuery({
    queryKey: queryKeys.finance.dailyClosings.list(30),
    queryFn: ({ signal }) => financeClosingApi.list(30, signal),
    enabled: Boolean(session && allowed),
    placeholderData: keepPreviousData,
    retry: false,
  });
  useEffect(() => {
    if (
      closingQuery.error instanceof ApiError &&
      closingQuery.error.isUnauthorized
    ) logout();
  }, [closingQuery.error, logout]);
  if (status === "loading")
    return (
      <Card>
        <ErpLoadingState title="正在验证日结与异常权限" />
      </Card>
    );
  if (status === "error")
    return (
      <ErpPageError
        title="无法读取登录状态"
        description={authError?.message || "请重新登录后继续。"}
        onRetry={() => void refresh()}
      />
    );
  if (!session || !allowed)
    return (
      <ErpPageError
        title="当前账号没有日结与异常权限"
        description="页面需要 finance 权限；未授权时不会请求日结快照。"
      />
    );
  return (
    <FinanceClosingContent
      session={session}
      filters={filters}
      onFiltersChange={commit}
      query={closingQuery}
    />
  );
}

function FinanceClosingContent({
  session,
  filters,
  onFiltersChange,
  query,
}: {
  session: AuthSession;
  filters: FinanceClosingFilters;
  onFiltersChange: (filters: FinanceClosingFilters) => void;
  query: UseQueryResult<FinanceDailyClosingCollection, Error>;
}) {
  const navigate = useNavigate();
  const capabilities = createCapabilities(session);
  const [detail, setDetail] = useState<FinanceDailyClosing | null>(null);
  const {columnVisibility, setColumnVisibility, density, setDensity} = useTablePreferences<VisibilityState>({feature: "finance-closing", userId: session.user.id, defaultVisibility: {}});
  const items = query.data?.items || [];
  const report = useMemo(
    () => selectFinanceClosingReport(items, filters),
    [filters, items],
  );
  const allReport = useMemo(
    () => selectFinanceClosingReport(items, defaultFinanceClosingFilters),
    [items],
  );
  const latest = allReport.rows[0];
  const activeFilters = countActiveFinanceClosingFilters(filters);
  const columns = useMemo(() => createFinanceClosingColumns(setDetail), []);
  const update = (partial: Partial<FinanceClosingFilters>) =>
    onFiltersChange({ ...filters, ...partial, page: partial.page ?? 1 });
  const exportRows = () => {
    const table = [
      [
        "日结编号",
        "日结日期",
        "关闭时间",
        "关闭人",
        "收入",
        "支出",
        "净现金",
        "销售单数",
        "采购单数",
        "应收",
        "应付",
        "待复核",
        "对账差异",
        "状态",
        "备注",
      ],
      ...report.rows.map((item) => [
        item.id,
        item.date,
        item.closedAt,
        item.closedBy,
        item.snapshot.income,
        item.snapshot.expense,
        item.snapshot.netCash,
        item.snapshot.salesCount,
        item.snapshot.purchaseCount,
        item.snapshot.receivable,
        item.snapshot.payable,
        item.snapshot.unreviewed,
        item.snapshot.accountReconciliationDifferences,
        financeClosingStatusLabel(item),
        item.remarks || "",
      ]),
    ];
    const csv = `\uFEFF${table.map((row) => row.map(csvCell).join(",")).join("\n")}`;
    const url = URL.createObjectURL(
      new Blob([csv], { type: "text/csv;charset=utf-8" }),
    );
    const link = document.createElement("a");
    link.href = url;
    link.download = `日结与异常-${filters.dateStart || "全部"}-${filters.dateEnd || ""}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };
  const quickStatus: QuickStatusItemData[] = [
    {
      icon: <CalendarCheck2 className="h-4 w-4" />,
      label: "已保存日结",
      value: `${items.length} 条`,
      description: "最近保存的日结记录",
      tone: "info",
    },
    {
      icon: <ShieldAlert className="h-4 w-4" />,
      label: "最新异常",
      value: latest
        ? `${latest.snapshot.unreviewed + latest.snapshot.accountReconciliationDifferences} 项`
        : "—",
      description: latest ? "待复核与对账差异" : "暂无日结快照",
      tone:
        latest &&
        (latest.snapshot.unreviewed ||
          latest.snapshot.accountReconciliationDifferences)
          ? "warning"
          : "neutral",
    },
  ];
  return (
    <ErpFinancePageFrame>
      <ErpPageHeader
        title="财务核对"
        subtitle="集中复核每日经营快照、账户差异与退货对账。"
        quickStatus={quickStatus}
        actions={
          <>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              disabled={query.isFetching}
              onClick={() => void query.refetch()}
            >
              <RefreshCw
                className={`h-4 w-4 ${query.isFetching ? "animate-spin" : ""}`}
              />
              刷新
            </Button>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              disabled={!report.rows.length}
              onClick={exportRows}
            >
              <Download className="h-4 w-4" />
              导出结果
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => void navigate({ to: "/finance" })}
            >
              财务总览
            </Button>
          </>
        }
      />
      <FinanceSectionTabs
        label="财务核对分类"
        items={[
          {
            label: "日结与异常",
            path: "/finance/closing",
            visible:
              capabilities.menu("finance"),
          },
          {
            label: "退货对账",
            path: "/finance/return-reconcile",
            visible:
              capabilities.menu("return_purchase") ||
              capabilities.menu("return_sales") ||
              capabilities.menu("return_orders"),
          },
        ]}
      />
      <MetricsRegion>
        <FinanceMetricCard
          label="日结收入"
          value={formatCurrency(report.summary.income)}
          detail="当前筛选已保存快照合计"
          icon={<WalletCards className="h-4 w-4" />}
          tone="success"
        />
        <FinanceMetricCard
          label="日结支出"
          value={formatCurrency(report.summary.expense)}
          detail="当前筛选已保存快照合计"
          icon={<ReceiptText className="h-4 w-4" />}
          tone="danger"
        />
        <FinanceMetricCard
          label="净现金变动"
          value={formatCurrency(report.summary.netCash)}
          detail="收入减支出，不代表当前余额"
          icon={<Landmark className="h-4 w-4" />}
          tone={financeNetTone(report.summary.netCash)}
        />
        <FinanceMetricCard
          label="待复核"
          value={`${report.summary.unreviewed} 项`}
          detail="日结时记录的快照值"
          icon={<ShieldAlert className="h-4 w-4" />}
          tone={report.summary.unreviewed ? "danger" : "success"}
        />
        <FinanceMetricCard
          label="对账差异"
          value={`${report.summary.reconciliationDifferences} 项`}
          detail="日结时记录的账户差异"
          icon={<AlertTriangle className="h-4 w-4" />}
          tone={
            report.summary.reconciliationDifferences ? "warning" : "success"
          }
        />
      </MetricsRegion>
      <ErpPageToolbar>
      <ErpFilterBar
        compact
        actions={
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={() => onFiltersChange(defaultFinanceClosingFilters)}
          >
            <RotateCcw className="h-4 w-4" />
            重置
          </Button>
        }
      >
        <ErpSearchInput className="min-w-56 flex-1"
            value={filters.keyword}
            onChange={(event) => update({ keyword: event.target.value })}
            placeholder="搜索日结编号、关闭人或备注"
            aria-label="搜索日结记录" />
        <ErpDateRangePicker
          value={{startDate: filters.dateStart, endDate: filters.dateEnd}}
          onChange={({startDate, endDate}) => update({dateStart: startDate, dateEnd: endDate})}
          density="compact"
          triggerClassName="md:w-36"
          startAriaLabel="日结开始日期"
          endAriaLabel="日结结束日期"
          ariaLabel="日结日期范围"
        />
      </ErpFilterBar>
      </ErpPageToolbar>
      <ErpPageContent className="space-y-[var(--erp-page-gap)]">
      <MainRegion variant="70-30" className="gap-3">
        <MainRegion.Primary>
          <FinanceTableRegion
            title="已保存日结"
            description="点击记录查看应收、应付、销售与采购摘要。"
            actions={
              <div className="flex items-center gap-2">
                <ErpStatusBadge
                  label={`第 ${report.meta.page} 页 · ${report.pageRows.length} 条`}
                  tone="info"
                />
                  <FinanceTableControls
                  columns={columns}
                  visibility={columnVisibility}
                  onVisibilityChange={setColumnVisibility}
                  density={density}
                  onDensityChange={setDensity}
                />
              </div>
            }
            table={{
              columns,
              data: report.pageRows,
              getRowId: (row) => row.id,
              loading: query.isPending,
              fetching: query.isFetching,
              error: query.error as Error | null,
              errorTitle: "日结快照加载失败",
              emptyTitle: "暂无日结快照",
              emptyDescription:
                activeFilters
                  ? "当前筛选条件没有匹配的日结记录。"
                  : "当前还没有已保存的日结快照。",
              onRetry: () => void query.refetch(),
              onRowClick: setDetail,
              page: report.meta.page,
              pageSize: report.meta.pageSize,
              total: report.meta.total,
              onPageChange: (page) => update({ page }),
              onPageSizeChange: (pageSize) => update({ page: 1, pageSize }),
              columnVisibility,
              onColumnVisibilityChange: setColumnVisibility,
              enableColumnResizing: true,
              density,
              stickyHeader: true,
              virtualized: report.pageRows.length >= 50,
            }}
          />
        </MainRegion.Primary>
        <MainRegion.Secondary>
          <DashboardSection
            title="最新异常"
            description={
              latest ? `来自 ${latest.date} 日结快照` : "暂无可供复核的日结快照"
            }
            actions={
              <ErpStatusBadge
                label={latest ? financeClosingStatusLabel(latest) : "无记录"}
                tone={latest ? financeClosingStatus(latest) : "neutral"}
              />
            }
          >
            {latest ? (
              <FinanceLatestExceptions item={latest} />
            ) : (
              <ErpEmptyState
                title="暂无日结记录"
                description="完成日结后，最新记录会显示在这里。"
              />
            )}
          </DashboardSection>
        </MainRegion.Secondary>
      </MainRegion>
      <FinanceClosingDetailDrawer item={detail} onClose={() => setDetail(null)} />
      </ErpPageContent>
    </ErpFinancePageFrame>
  );
}

function csvCell(value: string | number) {
  const text = String(value ?? "");
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}
