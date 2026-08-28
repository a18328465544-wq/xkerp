import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import {
  CalendarRange,
  CircleDollarSign,
  Download,
  Landmark,
  Plus,
  RefreshCw,
  RotateCcw,
  Search,
  ShieldCheck,
} from "lucide-react";
import {
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { toast } from "sonner";
import { Button, Card, CardContent, Input, Select } from "@/src/components/ui";
import {
  DashboardSection,
  ErpFinancePageFrame,
  ErpDateRangePicker,
  ErpDetailDrawer,
  ErpFilterBar,
  ErpLoadingState,
  ErpPageContent,
  ErpPageError,
  ErpPageHeader,
  ErpPageToolbar,
  ErpStatusBadge,
  MetricsRegion,
  type QuickStatusItemData,
} from "@/src/components/common";
import {
  ApiError,
  financeAccountsApi,
  financeIncomeApi,
  queryKeys,
  type AuthSession,
} from "@/src/services/api";
import { createCapabilities, useAuth } from "@/src/app/auth";
import { useUrlSearchState } from "@/src/hooks/useUrlSearchState";
import { formatCurrency } from "@/src/lib/format";
import {
  financeIncomeCategories,
  type FinanceIncomeFilters,
  type FinanceIncomeFormValues,
  type FinanceIncomeItem,
} from "@/src/types/finance-income";
import { storeDate } from "@/src/utils/storeTime";
import { createFinanceIncomeColumns } from "../finance-income.columns";
import {
  defaultFinanceIncomeFilters,
  financeIncomeFiltersToSearch,
  parseFinanceIncomeFilters,
} from "../finance-income.filters";
import { FinanceIncomeDialog } from "../components/FinanceIncomeDialog";
import { FinanceSectionTabs } from "../components/FinanceSectionTabs";
import { FinanceTableRegion } from "../components/FinanceTableRegion";

function useIncomeUrlState() {
  return useUrlSearchState({
    defaultValue: defaultFinanceIncomeFilters,
    parse: parseFinanceIncomeFilters,
    serialize: financeIncomeFiltersToSearch,
  });
}

export function FinanceIncomePage() {
  const { session, logout } = useAuth();
  const { value: filters, commit } = useIncomeUrlState();
  const canAccess = createCapabilities(session).menu("payment_in");
  const canReadAccounts = createCapabilities(session).menu("settlement_accounts");
  const incomeQuery = useQuery({
    queryKey: queryKeys.finance.income(filters),
    queryFn: ({ signal }) => financeIncomeApi.list(filters, signal),
    enabled: Boolean(session && canAccess),
    placeholderData: keepPreviousData,
    retry: false,
  });
  const accountsQuery = useQuery({
    queryKey: queryKeys.finance.accounts(),
    queryFn: ({ signal }) => financeAccountsApi.listAll(signal),
    enabled: Boolean(session && canAccess && canReadAccounts),
    staleTime: 60_000,
    retry: false,
  });
  useEffect(() => { if (incomeQuery.error instanceof ApiError && incomeQuery.error.isUnauthorized) logout(); }, [incomeQuery.error, logout]);
  if (!session) return <Card><ErpLoadingState title="正在验证收入登记权限" /></Card>;
  if (!session || !canAccess)
    return (
      <ErpPageError
        title="当前账号没有收入登记权限"
        description="服务端权限未包含 payment_in；页面不会请求或展示收入记录。"
      />
    );
  return (
    <FinanceIncomeContent
      session={session}
      onAuthExpired={logout}
      filters={filters}
      onFiltersChange={commit}
      collection={incomeQuery.data}
      incomeQuery={incomeQuery}
      accounts={accountsQuery.data?.accounts || []}
      canReadAccounts={canReadAccounts && !accountsQuery.error}
    />
  );
}

function FinanceIncomeContent({
  session,
  onAuthExpired,
  filters,
  onFiltersChange,
  collection: loadedCollection,
  incomeQuery,
  accounts,
  canReadAccounts,
}: {
  session: AuthSession;
  onAuthExpired: () => void;
  filters: FinanceIncomeFilters;
  onFiltersChange: (filters: FinanceIncomeFilters) => void;
  collection: Awaited<ReturnType<typeof financeIncomeApi.list>> | undefined;
  incomeQuery: ReturnType<
    typeof useQuery<Awaited<ReturnType<typeof financeIncomeApi.list>>>
  >;
  accounts: Awaited<ReturnType<typeof financeAccountsApi.listAll>>["accounts"];
  canReadAccounts: boolean;
}) {
  const queryClient = useQueryClient();
  const [detail, setDetail] = useState<FinanceIncomeItem | null>(null);
  const [editing, setEditing] = useState<FinanceIncomeItem | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleting, setDeleting] = useState<FinanceIncomeItem | null>(null);
  const collection = loadedCollection || {items: [], total: 0, totalAmount: 0, page: filters.page, pageSize: filters.pageSize, source: "database-page" as const};
  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: queryKeys.finance.all() });
  const mutationError = (caught: Error) => {
    if (caught instanceof ApiError && caught.isUnauthorized) { onAuthExpired(); return; }
    toast.error(caught.message);
  };
  const saveMutation = useMutation({
    mutationFn: ({
      values,
      item,
    }: {
      values: FinanceIncomeFormValues;
      item: FinanceIncomeItem | null;
    }) =>
      item
        ? financeIncomeApi.update(item.id, values, item.handler)
        : financeIncomeApi.create(values, session.user.displayName),
    onSuccess: async (item) => {
      toast.success(`${item.businessType}已保存`);
      setDialogOpen(false);
      setEditing(null);
      setDetail(item);
      await invalidate();
    },
    onError: mutationError,
  });
  const deleteMutation = useMutation({
    mutationFn: (id: string) => financeIncomeApi.remove(id),
    onSuccess: async () => {
      toast.success("收入记录已删除并由服务端回滚账户流水");
      setDeleting(null);
      setDetail(null);
      await invalidate();
    },
    onError: mutationError,
  });
  const openCreate = () => {
    saveMutation.reset();
    setEditing(null);
    setDialogOpen(true);
  };
  const openEdit = (item: FinanceIncomeItem) => {
    saveMutation.reset();
    setEditing(item);
    setDialogOpen(true);
  };
  const canEdit = session.permissions.canEditHistory;
  const columns = useMemo(
    () =>
      createFinanceIncomeColumns({
        canEdit,
        canDelete: session.permissions.canDelete,
        onView: setDetail,
        onEdit: openEdit,
        onDelete: setDeleting,
      }),
    [canEdit, session.permissions.canDelete],
  );
  const update = (partial: Partial<FinanceIncomeFilters>) =>
    onFiltersChange({ ...filters, ...partial, page: partial.page ?? 1 });
  const currentMonth = storeDate().slice(0, 7);
  const monthItems = collection.items.filter((item) =>
    item.time.startsWith(currentMonth),
  );
  const topCategory = Object.entries(
    monthItems.reduce<Record<string, number>>(
      (map, item) => ({
        ...map,
        [item.businessType]: (map[item.businessType] || 0) + item.amount,
      }),
      {},
    ),
  ).sort((a, b) => b[1] - a[1])[0];
  const quickStatus: QuickStatusItemData[] = [
    {
      icon: <ShieldCheck className="h-4 w-4" />,
      label: "账户权限",
      value: canReadAccounts ? "可登记" : "仅查看",
      description: canReadAccounts ? "真实账户候选可用" : "未请求账户余额",
      tone: canReadAccounts ? "success" : "neutral",
    },
  ];
  const exportRows = () => {
    const table = [
      [
        "编号",
        "日期",
        "类型",
        "来源",
        "金额",
        "账户",
        "方式",
        "参考号",
        "经办人",
        "备注",
      ],
      ...collection.items.map((item) => [
        item.id,
        item.time.slice(0, 10),
        item.businessType,
        item.source,
        item.amount,
        item.accountName,
        item.paymentMethod,
        item.referenceNo || "",
        item.handler,
        item.remarks || "",
      ]),
    ];
    const csv = `\uFEFF${table.map((row) => row.map(csvCell).join(",")).join("\n")}`;
    const url = URL.createObjectURL(
      new Blob([csv], { type: "text/csv;charset=utf-8" }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = `非经营收入-第${filters.page}页.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };
  return (
    <ErpFinancePageFrame>
      <ErpPageHeader
        title="其他收支"
        subtitle="仅登记非销售、非采购退货流程产生的非经营收入；采购退款请在退货或账户流水中查看。"
        quickStatus={quickStatus}
        actions={
          <>
            <Button
              size="sm"
              variant="secondary"
              disabled={incomeQuery.isFetching}
              onClick={() => void incomeQuery.refetch()}
            >
              <RefreshCw
                className={`h-4 w-4 ${incomeQuery.isFetching ? "animate-spin" : ""}`}
              />
              刷新
            </Button>
            <Button
              size="sm"
              variant="secondary"
              disabled={!collection.items.length}
              onClick={exportRows}
            >
              <Download className="h-4 w-4" />
              导出当前页
            </Button>
            <Button
              size="sm"
              variant="primary"
              disabled={!canReadAccounts}
              title={canReadAccounts ? undefined : "登记收入需要资金账户权限"}
              onClick={openCreate}
            >
              <Plus className="h-4 w-4" />
              登记收入
            </Button>
          </>
        }
      />
      <FinanceSectionTabs
        label="其他收支分类"
        items={[
          {
            label: "收入登记",
            path: "/finance/income",
            visible: createCapabilities(session).menu("payment_in"),
          },
          {
            label: "支出登记",
            path: "/finance/expense",
            visible: createCapabilities(session).menu("payment_out"),
          },
        ]}
      />
      <MetricsRegion>
        <Metric
          label="筛选收入"
          value={formatCurrency(collection.totalAmount)}
          detail={`${collection.total} 笔匹配记录`}
          icon={<CircleDollarSign className="h-4 w-4" />}
          tone="success"
        />
        <Metric
          label="当前页本月收入"
          value={formatCurrency(
            monthItems.reduce((sum, item) => sum + item.amount, 0),
          )}
          detail={`${monthItems.length} 笔非经营收入`}
          icon={<CalendarRange className="h-4 w-4" />}
          tone="success"
        />
        <Metric
          label="主要来源类型"
          value={topCategory?.[0] || "暂无"}
          detail={topCategory ? formatCurrency(topCategory[1]) : "本月暂无登记"}
          icon={<Landmark className="h-4 w-4" />}
          tone="neutral"
        />
        <Metric
          label="业务流水隔离"
          value="已启用"
          detail="采购退款不计入其他收入"
          icon={<ShieldCheck className="h-4 w-4" />}
          tone="warning"
        />
      </MetricsRegion>
      <ErpPageToolbar>
      <ErpFilterBar
        compact
        actions={
          <Button
            size="sm"
            variant="ghost"
            onClick={() => onFiltersChange(defaultFinanceIncomeFilters)}
          >
            <RotateCcw className="h-4 w-4" />
            重置
          </Button>
        }
      >
        <div className="relative min-w-56 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--erp-color-text-muted)]" />
          <Input
            className="pl-9"
            value={filters.keyword}
            onChange={(event) => update({ keyword: event.target.value })}
            placeholder="搜索来源、编号、参考号或备注"
          />
        </div>
        <Select
          className="w-36"
          value={filters.businessType}
          onValueChange={(businessType) => update({ businessType })}
          options={[
            { value: "all", label: "全部类型" },
            ...financeIncomeCategories.map((value) => ({
              value,
              label: value,
            })),
          ]}
          aria-label="收入类型筛选"
        />
        {canReadAccounts ? (
          <Select
            className="w-40"
            value={filters.accountId}
            onValueChange={(accountId) => update({ accountId })}
            options={[
              { value: "all", label: "全部账户" },
              ...accounts.map((account) => ({
                value: account.id,
                label: account.name,
              })),
            ]}
            aria-label="账户筛选"
          />
        ) : (
          <Select
            className="w-40"
            value="none"
            onValueChange={() => undefined}
            options={[{ value: "none", label: "账户筛选需权限" }]}
            disabled
            aria-label="账户筛选不可用"
          />
        )}
        <Input
          className="w-32"
          value={filters.handler}
          onChange={(event) => update({ handler: event.target.value.trim() })}
          placeholder="经办人"
        />
        <ErpDateRangePicker
          value={{startDate: filters.startDate, endDate: filters.endDate}}
          onChange={({startDate, endDate}) => update({startDate, endDate})}
          density="compact"
          triggerClassName="sm:w-36"
          startAriaLabel="开始日期"
          endAriaLabel="结束日期"
          ariaLabel="收入日期范围"
        />
      </ErpFilterBar>
      </ErpPageToolbar>
      <ErpPageContent className="space-y-[var(--erp-page-gap)]">
      <FinanceTableRegion
        title="收入明细"
        description="点击行查看凭证与登记详情；采购退款属于采购退货结算，不计入其他收入。"
        actions={<ErpStatusBadge label={`共 ${collection.total} 笔`} tone="info" />}
        table={{
          columns,
          data: collection.items,
          getRowId: (row) => row.id,
          loading: incomeQuery.isPending,
          fetching: incomeQuery.isFetching,
          error: incomeQuery.error as Error | null,
          errorTitle: "收入记录加载失败",
          emptyTitle: "暂无匹配收入",
          emptyDescription: "当前筛选条件下没有非经营收入记录。",
          onRetry: () => void incomeQuery.refetch(),
          onRowClick: setDetail,
          page: collection.page,
          pageSize: collection.pageSize,
          total: collection.total,
          onPageChange: (page) => update({ page }),
          onPageSizeChange: (pageSize) => update({ page: 1, pageSize }),
          enableColumnResizing: true,
          stickyHeader: true,
          virtualized: collection.items.length >= 50,
        }}
      />
      <IncomeDetail
        item={detail}
        canEdit={canEdit}
        canDelete={session.permissions.canDelete}
        onClose={() => setDetail(null)}
        onEdit={() => {
          if (detail) openEdit(detail);
        }}
        onDelete={() => {
          if (detail) setDeleting(detail);
        }}
      />
      <FinanceIncomeDialog
        open={dialogOpen}
        item={editing}
        accounts={accounts}
        pending={saveMutation.isPending}
        error={
          saveMutation.error instanceof Error
            ? saveMutation.error.message
            : undefined
        }
        onOpenChange={(open) => {
          setDialogOpen(open);
          if (!open) setEditing(null);
        }}
        onSubmit={async (values) => {
          await saveMutation.mutateAsync({ values, item: editing });
        }}
      />
      <ConfirmDelete
        item={deleting}
        pending={deleteMutation.isPending}
        onClose={() => setDeleting(null)}
        onConfirm={() => {
          if (deleting) deleteMutation.mutate(deleting.id);
        }}
      />
      </ErpPageContent>
    </ErpFinancePageFrame>
  );
}

function IncomeDetail({
  item,
  canEdit,
  canDelete,
  onClose,
  onEdit,
  onDelete,
}: {
  item: FinanceIncomeItem | null;
  canEdit: boolean;
  canDelete: boolean;
  onClose: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <ErpDetailDrawer
      open={Boolean(item)}
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
      title={item?.businessType || "收入详情"}
      description={item ? `${item.id} · ${item.time}` : undefined}
      footer={
        item && (
          <div className="flex justify-end gap-2">
            {canDelete && item.deletable && (
              <Button size="sm" variant="danger" onClick={onDelete}>
                删除
              </Button>
            )}
            {canEdit && item.editable && (
              <Button size="sm" variant="primary" onClick={onEdit}>
                编辑
              </Button>
            )}
          </div>
        )
      }
    >
      <div className="space-y-5">
        {item && (
          <>
            <div className="grid grid-cols-2 gap-3">
              <Fact
                label="金额"
                value={formatCurrency(item.amount)}
                tone="success"
              />
              <Fact label="结算账户" value={item.accountName} />
            </div>
            <DashboardSection title="登记信息">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <Row label="收入来源" value={item.source} />
                <Row label="入账方式" value={item.paymentMethod} />
                <Row label="经办人" value={item.handler} />
                <Row label="外部参考号" value={item.referenceNo || "未填写"} />
              </div>
            </DashboardSection>
            {item.images.length > 0 && (
              <DashboardSection title="收入凭证">
                <div className="grid grid-cols-2 gap-3">
                  {item.images.map((url, index) => (
                    <a key={url} href={url} target="_blank" rel="noreferrer">
                      <img
                        src={url}
                        alt={`收入凭证 ${index + 1}`}
                        className="h-36 w-full rounded-[var(--erp-radius-md)] border border-[var(--erp-color-border)] object-cover"
                      />
                    </a>
                  ))}
                </div>
              </DashboardSection>
            )}
            {item.remarks && (
              <p className="rounded-[var(--erp-radius-md)] bg-[var(--erp-color-surface-muted)] p-3 text-sm">
                {item.remarks}
              </p>
            )}
            {item.restrictionReason && (
              <p className="rounded-[var(--erp-radius-md)] bg-[var(--erp-color-warning-soft)] p-3 text-xs text-[var(--erp-color-warning)]">
                {item.restrictionReason}
              </p>
            )}
          </>
        )}
      </div>
    </ErpDetailDrawer>
  );
}
function ConfirmDelete({
  item,
  pending,
  onClose,
  onConfirm,
}: {
  item: FinanceIncomeItem | null;
  pending: boolean;
  onClose: () => void;
  onConfirm: () => void;
}) {
  return (
    <ErpDetailDrawer
      open={Boolean(item)}
      onOpenChange={(open) => {
        if (!open && !pending) onClose();
      }}
      title="删除收入记录"
      description="服务端将同时回滚账户余额和关联流水"
      footer={
        <div className="flex justify-end gap-2">
          <Button variant="secondary" onClick={onClose} disabled={pending}>
            取消
          </Button>
          <Button variant="danger" onClick={onConfirm} disabled={pending}>
            {pending ? "删除中…" : "确认删除"}
          </Button>
        </div>
      }
    >
      <p className="text-sm leading-6 text-[var(--erp-color-text-secondary)]">
        确认删除 {item?.businessType}「{item?.source}」的{" "}
        {formatCurrency(item?.amount || 0)} 收入？该操作最终仍由服务端校验。
      </p>
    </ErpDetailDrawer>
  );
}
function Metric({
  label,
  value,
  detail,
  icon,
  tone,
}: {
  label: string;
  value: string;
  detail: string;
  icon: ReactNode;
  tone: "neutral" | "info" | "success" | "warning";
}) {
  return (
    <Card>
      <CardContent className="flex min-h-[110px] items-start justify-between gap-3 p-4">
        <div className="min-w-0">
          <p className="text-xs font-semibold text-[var(--erp-color-text-secondary)]">
            {label}
          </p>
          <p className="mt-2 truncate font-mono text-xl font-bold">{value}</p>
          <p className="mt-1 truncate text-[11px] text-[var(--erp-color-text-muted)]">
            {detail}
          </p>
        </div>
        <ErpStatusBadge label={icon} tone={tone} />
      </CardContent>
    </Card>
  );
}
function Fact({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "success";
}) {
  return (
    <div className="rounded-[var(--erp-radius-lg)] border border-[var(--erp-color-border)] p-3">
      <p className="text-xs text-[var(--erp-color-text-muted)]">{label}</p>
      <p
        className={`mt-1 font-mono text-base font-bold ${tone === "success" ? "text-[var(--erp-color-success)]" : ""}`}
      >
        {value}
      </p>
    </div>
  );
}
function Row({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-[var(--erp-color-text-muted)]">{label}</p>
      <p className="mt-1 font-medium">{value}</p>
    </div>
  );
}
function csvCell(value: string | number) {
  const text = String(value ?? "");
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}
