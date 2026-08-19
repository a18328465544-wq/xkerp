import { keepPreviousData, useQuery } from "@tanstack/react-query";
import type { ColumnDef } from "@tanstack/react-table";
import {
  BadgePercent,
  CheckCircle2,
  Clock3,
  Filter,
  RefreshCw,
  Search,
  UserRound,
} from "lucide-react";
import { useMemo, useState } from "react";
import { Button, Card, Input, Select } from "@/src/components/ui";
import {
  DashboardSection,
  AnalyticsKpiRegion,
  AnalyticsMainRegion,
  AnalyticsToolbar,
  ErpAnalyticsPageFrame,
  ErpDataTable,
  ErpDetailDrawer,
  ErpMetricCard,
  ErpPageError,
  ErpPageHeader,
  ErpStatusBadge,
  type QuickStatusItemData,
} from "@/src/components/common";
import {
  financeCommissionApi,
  queryKeys,
  type AuthSession,
} from "@/src/services/api";
import {createCapabilities, useAuth} from "@/src/app/auth";
import { formatCurrency } from "@/src/lib/format";
import type { FinanceCommissionItem } from "@/src/types/finance-remaining";
import { FinanceSectionTabs } from "../components/FinanceSectionTabs";

export function FinanceCommissionPage({
  mode,
}: {
  mode: "purchase" | "sales";
}) {
  const {session, status, error: authError, refresh} = useAuth();
  const menu = mode === "purchase" ? "purchase_commission" : "sales_commission";
  const allowed = Boolean(
    createCapabilities(session).menu(menu),
  );
  const query = useQuery({
    queryKey: queryKeys.finance.commissions(mode),
    queryFn: ({ signal }) => financeCommissionApi.list(mode, signal),
    enabled: allowed,
    placeholderData: keepPreviousData,
    retry: false,
  });
  if (status === "loading")
    return (
      <Card>
        <p className="p-5 text-sm">正在验证提成权限…</p>
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
        title={`当前账号没有${mode === "purchase" ? "进货" : "销售"}提成权限`}
        description="服务端不会为未授权账号加载提成数据。"
      />
    );
  if (query.error && !query.data)
    return (
      <ErpPageError
        title="提成记录加载失败"
        description={query.error.message}
        onRetry={() => void query.refetch()}
      />
    );
  return (
    <FinanceCommissionContent
      mode={mode}
      session={session}
      items={query.data || []}
      loading={query.isPending}
      fetching={query.isFetching}
      error={query.error as Error | null}
      onRetry={() => void query.refetch()}
    />
  );
}

function FinanceCommissionContent({
  mode,
  session,
  items,
  loading,
  fetching,
  error,
  onRetry,
}: {
  mode: "purchase" | "sales";
  session: AuthSession;
  items: FinanceCommissionItem[];
  loading: boolean;
  fetching: boolean;
  error: Error | null;
  onRetry: () => void;
}) {
  const [keyword, setKeyword] = useState("");
  const [status, setStatus] = useState("");
  const [detail, setDetail] = useState<FinanceCommissionItem | null>(null);
  const showProfit = session.permissions.showProfit;
  const filtered = useMemo(() => {
    const value = keyword.trim().toLocaleLowerCase();
    return items.filter(
      (item) =>
        (!status || item.status === status) &&
        (!value ||
          [item.id, item.sn, item.productName, item.handler, item.documentNo]
            .join(" ")
            .toLocaleLowerCase()
            .includes(value)),
    );
  }, [items, keyword, status]);
  const commissionTotal = showProfit
    ? filtered.reduce((sum, item) => sum + (item.commissionAmount || 0), 0)
    : undefined;
  const columns = useMemo<ColumnDef<FinanceCommissionItem, unknown>[]>(
    () => [
      {
        accessorKey: "id",
        header: "记录编号",
        size: 150,
        cell: ({ row }) => (
          <span className="font-mono text-[var(--erp-color-primary)]">
            {row.original.id}
          </span>
        ),
      },
      {
        accessorKey: "sn",
        header: "SN",
        size: 140,
        cell: ({ row }) => (
          <span className="font-mono">{row.original.sn || "—"}</span>
        ),
      },
      { accessorKey: "productName", header: "商品", size: 220 },
      { accessorKey: "handler", header: "经办人", size: 120 },
      { accessorKey: "documentNo", header: "关联单据", size: 150 },
      {
        id: "baseAmount",
        header: mode === "purchase" ? "成本" : "销售额",
        size: 120,
        cell: ({ row }) =>
          showProfit ? (
            formatCurrency(row.original.baseAmount || 0)
          ) : (
            <span className="text-xs text-[var(--erp-color-text-muted)]">
              无权限
            </span>
          ),
      },
      {
        id: "grossProfit",
        header: "毛利",
        size: 120,
        cell: ({ row }) =>
          showProfit ? (
            formatCurrency(row.original.grossProfit || 0)
          ) : (
            <span className="text-xs text-[var(--erp-color-text-muted)]">
              无权限
            </span>
          ),
      },
      {
        id: "commissionAmount",
        header: "提成",
        size: 110,
        cell: ({ row }) =>
          showProfit ? (
            <span className="font-mono font-semibold text-[var(--erp-color-success)]">
              {formatCurrency(row.original.commissionAmount || 0)}
            </span>
          ) : (
            <span className="text-xs text-[var(--erp-color-text-muted)]">
              无权限
            </span>
          ),
      },
      {
        accessorKey: "status",
        header: "状态",
        size: 100,
        cell: ({ row }) => (
          <ErpStatusBadge
            label={row.original.status}
            tone={row.original.status === "已结算" ? "success" : "warning"}
          />
        ),
      },
      {
        id: "action",
        header: "操作",
        size: 80,
        cell: ({ row }) => (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={(event) => {
              event.stopPropagation();
              setDetail(row.original);
            }}
          >
            详情
          </Button>
        ),
      },
    ],
    [mode, showProfit],
  );
  const statuses = [
    ...new Set(items.map((item) => item.status).filter(Boolean)),
  ].map((value) => ({ value, label: value }));
  const quickStatus: QuickStatusItemData[] = [
    {
      icon: <BadgePercent className="h-4 w-4" />,
      label: "记录数",
      value: `${filtered.length} 条`,
      description: "当前筛选范围",
      status: "info",
    },
    {
      icon: <UserRound className="h-4 w-4" />,
      label: "经办人",
      value: `${new Set(filtered.map((item) => item.handler).filter(Boolean)).size} 人`,
      description: "当前筛选范围",
      status: "neutral",
    },
  ];
  return (
    <ErpAnalyticsPageFrame>
      <ErpPageHeader
        title="员工提成"
        subtitle={
          mode === "purchase"
            ? "查看采购经办人的真实提成计算结果。"
            : "查看销售经办人的真实提成计算结果。"
        }
        quickStatus={quickStatus}
        actions={
          <Button
            type="button"
            size="sm"
            variant="secondary"
            onClick={onRetry}
            disabled={fetching}
          >
            <RefreshCw
              className={fetching ? "h-4 w-4 animate-spin" : "h-4 w-4"}
            />
            刷新
          </Button>
        }
      />
      <FinanceSectionTabs
        label="员工提成分类"
        items={[
          {label: "进货提成", path: "/finance/purchase-commission", visible: session.permissions.allowedMenus.some((id) => id === "all" || id === "purchase_commission")},
          {label: "销售提成", path: "/finance/sales-commission", visible: session.permissions.allowedMenus.some((id) => id === "all" || id === "sales_commission")},
        ]}
      />
      <AnalyticsKpiRegion primary={<>
        <ErpMetricCard label="提成金额" value={commissionTotal === undefined ? "无权限" : formatCurrency(commissionTotal)} detail={showProfit ? "当前筛选范围" : "需要 showProfit 权限"} icon={<BadgePercent className="h-4 w-4" />} tone={showProfit ? "success" : "neutral"} />
        <ErpMetricCard label="已结算" value={`${filtered.filter((item) => item.status === "已结算").length} 条`} detail="后端记录状态" icon={<CheckCircle2 className="h-4 w-4" />} tone="success" />
      </>} secondary={<>
        <ErpMetricCard label="提成记录" value={`${filtered.length} 条`} detail="当前筛选范围" icon={<BadgePercent className="h-4 w-4" />} tone="info" variant="compact" />
        <ErpMetricCard label="待结算" value={`${filtered.filter((item) => item.status !== "已结算").length} 条`} detail="尚未完成结算" icon={<Clock3 className="h-4 w-4" />} tone="warning" variant="compact" />
      </>} />
      <AnalyticsToolbar
        actions={
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={() => {
              setKeyword("");
              setStatus("");
            }}
            disabled={!keyword && !status}
          >
            <Filter className="h-4 w-4" />
            重置筛选
          </Button>
        }
      >
        <div className="relative min-w-64 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--erp-color-text-muted)]" />
          <Input
            className="pl-9"
            value={keyword}
            onChange={(event) => setKeyword(event.target.value)}
            placeholder="记录编号、SN、商品或经办人"
            aria-label="搜索提成记录"
          />
        </div>
        <Select className="w-32" value={status} options={[{ value: "", label: "全部状态" }, ...statuses]} onValueChange={setStatus} aria-label="提成状态" />
      </AnalyticsToolbar>
      <AnalyticsMainRegion variant="full">
        <AnalyticsMainRegion.Visualization size="expanded">
          <DashboardSection title="提成明细" description="按员工、状态和关键词查看提成记录。">
            <ErpDataTable surface="plain" columns={columns} data={filtered} getRowId={(row) => row.id} loading={loading} fetching={fetching} error={error} errorTitle="提成记录刷新失败" emptyTitle="暂无提成记录" emptyDescription="当前筛选没有匹配记录。" onRetry={onRetry} onRowClick={setDetail} stickyHeader density="compact" />
          </DashboardSection>
        </AnalyticsMainRegion.Visualization>
      </AnalyticsMainRegion>
      <ErpDetailDrawer
        open={Boolean(detail)}
        onOpenChange={(open) => {
          if (!open) setDetail(null);
        }}
        title={detail?.productName || "提成详情"}
        description={
          detail ? `${detail.handlerType} · ${detail.id}` : undefined
        }
      >
        {detail && (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <Fact label="经办人" value={detail.handler} />
              <Fact label="关联单据" value={detail.documentNo} />
              <Fact label="状态" value={detail.status} />
              <Fact label="创建时间" value={detail.createdAt || "—"} />
              {showProfit && (
                <>
                  <Fact
                    label="基础金额"
                    value={formatCurrency(detail.baseAmount || 0)}
                  />
                  <Fact
                    label="毛利"
                    value={formatCurrency(detail.grossProfit || 0)}
                  />
                  <Fact
                    label="提成比例"
                    value={`${((detail.rate || 0) * 100).toFixed(2)}%`}
                  />
                  <Fact
                    label="提成金额"
                    value={formatCurrency(detail.commissionAmount || 0)}
                  />
                </>
              )}
            </div>
            {detail.remarks && (
              <p className="rounded-[var(--erp-radius-md)] bg-[var(--erp-color-surface-muted)] p-3 text-sm text-[var(--erp-color-text-secondary)]">
                {detail.remarks}
              </p>
            )}
          </div>
        )}
      </ErpDetailDrawer>
    </ErpAnalyticsPageFrame>
  );
}
function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[var(--erp-radius-md)] border border-[var(--erp-color-border)] p-3">
      <p className="text-[11px] text-[var(--erp-color-text-muted)]">{label}</p>
      <p className="mt-1 truncate text-sm font-semibold">{value}</p>
    </div>
  );
}
