import {useMutation, useQuery, useQueryClient} from "@tanstack/react-query";
import {useWorkspaceTabActivity} from "@/src/hooks/useWorkspaceTabRuntime";
import {CircleDollarSign, LockKeyhole, Pencil, RefreshCw, ShieldCheck, Truck, UserRound} from "lucide-react";
import {useEffect, useMemo, useState} from "react";
import {notify} from "@/src/utils/notification";
import {Card} from "@/src/components/ui";
import {ErpRecordPage, ErpLoadingState, ErpOutstandingSettlementDialog, ErpPageError, ErpStatusBadge, type QuickStatusItemData} from "@/src/components/common";
import {ApiError, financeAccountsApi, financeSettlementApi, invalidateErpDomains, queryKeys, salesApi} from "@/src/services/api";
import {useAuth} from "@/src/app/auth";
import type {AuthSession} from "@/src/services/api";
import {formatCurrency} from "@/src/lib/format";
import type {LinkedSettlementContext} from "@/src/types/finance-settlement";
import {deriveSalesEditPolicy, salesInventoryStageLabel} from "../sales.edit-policy";
import {SalesSnapshotDetail} from "./SalesListPage";

function hasMenu(session: AuthSession | null | undefined, menu: string) {
  const menus = session?.permissions.allowedMenus || [];
  return menus.includes("all") || menus.includes(menu);
}

function hasFullSalesRecordAccess(session: AuthSession) {
  return hasMenu(session, "sales_add")
    && hasMenu(session, "inventory")
    && hasMenu(session, "settlement_accounts")
    && session.permissions.showCost
    && session.permissions.showProfit;
}

function errorText(error: unknown) {
  return error instanceof Error ? error.message : "请求失败，请稍后重试";
}

export function SalesDetailPage({salesId}: {salesId: string}) {
  const {active} = useWorkspaceTabActivity();
  const queryClient = useQueryClient();
  const {session, status, error: authError, refresh, logout} = useAuth();
  const [settlementOpen, setSettlementOpen] = useState(false);
  const allowed = hasMenu(session, "sales_list");
  const canCollect = hasMenu(session, "payment_in") && hasMenu(session, "settlement_accounts");
  const permissions = useMemo(() => ({showCost: Boolean(session?.permissions.showCost), showProfit: Boolean(session?.permissions.showProfit)}), [session?.permissions.showCost, session?.permissions.showProfit]);
  const detailQuery = useQuery({
    queryKey: queryKeys.sales.detail(salesId),
    queryFn: ({signal}) => salesApi.detail(salesId, permissions, signal),
    enabled: active && (Boolean(session && allowed)),
    retry: false,
  });
  const accountQuery = useQuery({
    queryKey: queryKeys.finance.accounts(),
    queryFn: ({signal}) => financeAccountsApi.listAll(signal),
    enabled: active && (Boolean(session && canCollect)),
    staleTime: 60_000,
    retry: false,
  });
  const settlementMutation = useMutation({
    mutationFn: (values: Parameters<typeof financeSettlementApi.createIncome>[0]) => {
      if (!detailQuery.data) throw new Error("销售单详情尚未加载完成");
      const item = detailQuery.data;
      const context: LinkedSettlementContext = {
        kind: "income",
        relatedDocType: "销售单",
        relatedDocNo: item.invoiceNo || item.id,
        partyName: item.customerName,
        partyId: item.customerId,
        partnerType: item.customerPartnerType,
        defaultAccountId: item.settlementAccountId,
        remainingAmount: item.unpaidAmount,
      };
      return financeSettlementApi.createIncome(values, context, session?.user.displayName || "当前操作人");
    },
    onSuccess: async () => {
      notify.success("销售收款已补录", {description: "已关联原销售单，并同步更新收款状态与往来余额。"});
      setSettlementOpen(false);
      await Promise.all([
        detailQuery.refetch(),
        invalidateErpDomains(queryClient, ["sales", "finance", "customers", "vendors", "state"]),
      ]);
    },
    onError: (error: Error) => {
      if (error instanceof ApiError && error.isUnauthorized) logout();
      else notify.error(error.message);
    },
  });

  useEffect(() => {
    if (detailQuery.error instanceof ApiError && detailQuery.error.isUnauthorized) logout();
  }, [detailQuery.error, logout]);

  if (status === "loading") return <Card><ErpLoadingState title="正在验证销售权限" /></Card>;
  if (status === "error") return <ErpPageError title="无法读取登录状态" description={authError?.message || "请重新登录后继续。"} onRetry={() => void refresh()} />;
  if (!session || !allowed) return <ErpPageError title="当前账号没有销售单据权限" description="当前账号没有此页面的访问权限，请联系管理员开通。" />;
  if (detailQuery.isPending) return <Card><ErpLoadingState title="正在加载销售详情" description="正在定位销售单和出库状态。" /></Card>;
  if (detailQuery.error) return <ErpPageError title="销售详情加载失败" description={errorText(detailQuery.error)} onRetry={() => void detailQuery.refetch()} />;
  if (!detailQuery.data) return <ErpPageError title="销售单不存在" description="该单据可能已删除，或当前账号无权查看。" />;

  const item = detailQuery.data;
  const settlementContext: LinkedSettlementContext | null = canCollect && item.unpaidAmount > 0 ? {
    kind: "income",
    relatedDocType: "销售单",
    relatedDocNo: item.invoiceNo || item.id,
    partyName: item.customerName,
    partyId: item.customerId,
    partnerType: item.customerPartnerType,
    defaultAccountId: item.settlementAccountId,
    remainingAmount: item.unpaidAmount,
  } : null;
  const policy = deriveSalesEditPolicy(item, {canEditHistory: session.permissions.canEditHistory, hasFullRecordAccess: hasFullSalesRecordAccess(session)});
  const quickStatus: QuickStatusItemData[] = [
    {icon: <UserRound className="h-4 w-4" />, label: "客户", value: item.customerName || "未关联", description: item.contact || "未填写联系方式", tone: item.customerId ? "success" : "warning"},
    {icon: <Truck className="h-4 w-4" />, label: "出库状态", value: item.outboundStatus, description: salesInventoryStageLabel(policy.inventoryStage), tone: item.outboundStatus === "已出库" ? "success" : "warning"},
    {icon: policy.mode === "full" ? <ShieldCheck className="h-4 w-4" /> : <LockKeyhole className="h-4 w-4" />, label: "编辑策略", value: policy.mode === "full" ? "可完整编辑" : policy.mode === "limited" ? "可编辑备注" : "当前只读", description: policy.summary, tone: policy.mode === "full" ? "success" : policy.mode === "limited" ? "warning" : "neutral"},
  ];

  return <>
    <ErpRecordPage
      title={item.invoiceNo || item.id}
      subtitle={<span className="flex flex-wrap items-center gap-2"><span>销售单详情 · {item.date}</span><ErpStatusBadge label={item.paymentStatus} tone={item.paymentStatus === "已收款" ? "success" : "warning"} /></span>}
      quickStatus={quickStatus}
      back={{to: "/sales", label: "返回销售单据"}}
      actions={[
        ...(settlementContext ? [{key: "settle", label: `待收款 ${formatCurrency(item.unpaidAmount)}`, phoneLabel: `收款 ${formatCurrency(item.unpaidAmount)}`, icon: <CircleDollarSign className="h-4 w-4" />, onClick: () => {settlementMutation.reset(); setSettlementOpen(true);}, phone: "primary" as const}] : []),
        ...(policy.canEditMetadata ? [{key: "edit", label: "编辑销售单", icon: <Pencil className="h-4 w-4" />, to: `/sales/${encodeURIComponent(item.id)}/edit`, variant: "primary" as const, phone: "both" as const}] : []),
        {key: "refresh", label: "刷新", phoneLabel: "刷新单据", icon: <RefreshCw className={`h-4 w-4 ${detailQuery.isFetching ? "animate-spin" : ""}`} />, onClick: () => {void Promise.all([detailQuery.refetch(), queryClient.invalidateQueries({queryKey: queryKeys.sales.all()})]);}, disabled: detailQuery.isFetching, phone: "more" as const},
      ]}
      phoneMoreTitle="销售单操作"
      phoneMoreNote={policy.summary}
      notice={policy.mode !== "full" ? {title: `编辑范围：${policy.mode === "limited" ? "仅快递单号和备注" : "只读"}`, body: policy.reasons.join(" ")} : undefined}
    >
      <SalesSnapshotDetail item={item} showCost={session.permissions.showCost} showProfit={session.permissions.showProfit} />
    </ErpRecordPage>
    <ErpOutstandingSettlementDialog
      open={settlementOpen}
      context={settlementContext}
      accounts={accountQuery.data?.accounts || []}
      accountsLoading={accountQuery.isPending || accountQuery.isFetching}
      error={settlementMutation.error instanceof Error ? settlementMutation.error.message : accountQuery.error instanceof Error ? accountQuery.error.message : undefined}
      pending={settlementMutation.isPending}
      onOpenChange={(open) => {setSettlementOpen(open); if (!open) settlementMutation.reset();}}
      onSubmit={(values) => settlementMutation.mutateAsync(values).then(() => undefined)}
    />
  </>;
}
