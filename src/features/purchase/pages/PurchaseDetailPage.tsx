import {useQuery, useQueryClient} from "@tanstack/react-query";
import type {ColumnDef} from "@tanstack/react-table";
import {ArrowLeft, Boxes, CircleDollarSign, ExternalLink, FileImage, LockKeyhole, RefreshCw, ShieldAlert, Truck, UserRound} from "lucide-react";
import {useEffect, useMemo, useState} from "react";
import {Link} from "@tanstack/react-router";
import {Button, Card, CardContent, CardHeader} from "@/src/components/ui";
import {ErpDataTable, ErpDetailPageFrame, ErpEmptyState, ErpLoadingState, ErpPageContent, ErpPageError, ErpPageHeader, ErpStatusBadge, type QuickStatusItemData} from "@/src/components/common";
import {ApiError, apiDownload, purchaseApi, queryKeys} from "@/src/services/api";
import {useAuth} from "@/src/app/auth";
import type {AuthSession} from "@/src/services/api";
import type {PurchaseDetail, PurchaseDetailInventoryItem} from "@/src/types/purchase";
import type {PurchaseInvoice} from "@/src/types/purchase";
import {formatCurrency} from "@/src/lib/format";
import {derivePurchaseEditPolicy, purchaseInventoryStageLabel} from "../purchase.edit-policy";

function errorText(error: unknown) {
  return error instanceof Error ? error.message : "请求失败，请稍后重试";
}

function hasMenu(session: AuthSession | null | undefined, menu: string) {
  const menus = session?.permissions.allowedMenus || [];
  return menus.includes("all") || menus.includes(menu);
}

function statusTone(value: string) {
  if (/已付款|已入库|已上架|通过|已完成/.test(value)) return "success" as const;
  if (/待|部分|检测中|处理中/.test(value)) return "warning" as const;
  if (/退|拒|失败|异常|报废|欠款/.test(value)) return "danger" as const;
  return "neutral" as const;
}

function DetailMetric({label, value, detail, tone = "neutral"}: {label: string; value: string; detail: string; tone?: "neutral" | "success" | "warning"}) {
  const valueClass = tone === "success" ? "text-[var(--erp-color-success)]" : tone === "warning" ? "text-[var(--erp-color-warning)]" : "text-[var(--erp-color-text)]";
  return <Card><CardContent className="min-h-[108px] p-4"><p className="text-xs font-semibold text-[var(--erp-color-text-secondary)]">{label}</p><p className={`mt-2 font-mono text-2xl font-bold ${valueClass}`}>{value}</p><p className="mt-1 text-xs text-[var(--erp-color-text-muted)]">{detail}</p></CardContent></Card>;
}

function PurchaseImages({images}: {images: readonly string[]}) {
  const [loadingUrl, setLoadingUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const preview = async (url: string) => {
    const popup = window.open("", "_blank", "noopener,noreferrer");
    setLoadingUrl(url);
    setError(null);
    try {
      const blob = await apiDownload(url);
      const objectUrl = URL.createObjectURL(blob);
      if (popup) popup.location.href = objectUrl;
      else window.open(objectUrl, "_blank", "noopener,noreferrer");
      window.setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
    } catch (caught) {
      popup?.close();
      setError(errorText(caught));
    } finally {
      setLoadingUrl(null);
    }
  };

  if (!images.length) return <ErpEmptyState title="暂无采购图片" description="该单据没有保存采购凭证或商品图片。" />;
  return <div className="space-y-3">
    {error && <p role="alert" className="rounded-[var(--erp-radius-md)] bg-[var(--erp-color-danger-soft)] px-3 py-2 text-xs text-[var(--erp-color-danger)]">{error}</p>}
    <div className="grid gap-2 sm:grid-cols-2">
      {images.map((url, index) => <Button key={url} type="button" variant="secondary" className="h-auto min-h-12 justify-between" disabled={loadingUrl === url} onClick={() => void preview(url)}>
        <span className="flex min-w-0 items-center gap-2"><FileImage className="h-4 w-4 shrink-0" /><span className="truncate">采购图片 {index + 1}</span></span>
        {loadingUrl === url ? <RefreshCw className="h-4 w-4 animate-spin" /> : <ExternalLink className="h-4 w-4" />}
      </Button>)}
    </div>
  </div>;
}

function PurchaseLineTable({invoice, showCost, showProfit}: {invoice: PurchaseInvoice; showCost: boolean; showProfit: boolean}) {
  const columns = useMemo<ColumnDef<PurchaseInvoice["items"][number], unknown>[]>(() => {
    const base: ColumnDef<PurchaseInvoice["items"][number], unknown>[] = [
      {id: "product", header: "商品", size: 280, cell: ({row}) => <div><p className="font-semibold">{row.original.productName}</p><p className="mt-0.5 text-xs text-[var(--erp-color-text-muted)]">{[row.original.brand, row.original.model, row.original.version, row.original.vram].filter(Boolean).join(" ") || "—"}</p></div>},
      {accessorKey: "sn", header: "SN", size: 150, cell: ({getValue}) => String(getValue() || "待检测绑定")},
      {accessorKey: "condition", header: "成色", size: 100, cell: ({getValue}) => <ErpStatusBadge label={String(getValue() || "—")} tone="neutral" />},
      {accessorKey: "warehouseLocation", header: "采购录入库位", size: 140, cell: ({getValue}) => String(getValue() || "—")},
    ];
    if (showCost) base.push({accessorKey: "buyPrice", header: "采购价", size: 120, cell: ({getValue}) => <span className="font-mono font-semibold">{formatCurrency(Number(getValue() || 0))}</span>});
    if (showProfit) base.push({accessorKey: "estSellPrice", header: "预计售价", size: 120, cell: ({getValue}) => <span className="font-mono font-semibold">{formatCurrency(Number(getValue() || 0))}</span>});
    base.push({accessorKey: "remarks", header: "行备注", size: 200, cell: ({getValue}) => String(getValue() || "—")});
    return base;
  }, [showCost, showProfit]);
  return <ErpDataTable columns={columns} data={invoice.items} getRowId={(row) => row.tempId} density="compact" stickyHeader emptyTitle="该采购单没有商品明细" />;
}

function InventoryFacts({items}: {items: readonly PurchaseDetailInventoryItem[]}) {
  if (!items.length) return <ErpEmptyState title="暂无关联库存" description="当前状态快照未找到与该采购单关联的实物库存。" />;
  return <div className="divide-y divide-[var(--erp-color-border)]">
    {items.map((item) => <div key={item.id} className="grid gap-2 py-3 sm:grid-cols-[minmax(0,1.5fr)_140px_120px] sm:items-center">
      <div className="min-w-0"><p className="truncate text-sm font-semibold">{item.productName}</p><p className="mt-1 font-mono text-xs text-[var(--erp-color-text-muted)]">{item.id}{item.sn ? ` · SN ${item.sn}` : " · SN 待绑定"}</p></div>
      <div><ErpStatusBadge label={item.hasInspection ? `${item.status} · 已检测` : item.status} tone={statusTone(item.status)} /></div>
      <p className="text-xs text-[var(--erp-color-text-secondary)]">{item.warehouseLocation || "库位未定"}</p>
    </div>)}
  </div>;
}

function PurchaseDetailContent({detail, session, onRefresh, refreshing}: {detail: PurchaseDetail; session: AuthSession; onRefresh: () => void; refreshing: boolean}) {
  const invoice = detail.invoice;
  const showCost = session.permissions.showCost;
  const showProfit = session.permissions.showProfit;
  const canReadPayments = hasMenu(session, "payment_out");
  const policy = derivePurchaseEditPolicy(detail);
  const stageLabel = purchaseInventoryStageLabel(policy.inventoryStage);
  const quickStatus: QuickStatusItemData[] = [
    {icon: <UserRound className="h-4 w-4" />, label: "采购来源", value: invoice.supplierName || "未关联", description: invoice.sourceType, tone: invoice.sourcePartnerId ? "success" : "warning"},
    {icon: <CircleDollarSign className="h-4 w-4" />, label: "付款状态", value: invoice.paymentStatus || (invoice.isPaid ? "已付款" : "未付款"), description: canReadPayments ? `${detail.paymentCount ?? 0} 笔关联流水` : "付款流水无查看权限", tone: invoice.isPaid ? "success" : "warning"},
    {icon: <Boxes className="h-4 w-4" />, label: "库存阶段", value: stageLabel, description: `${detail.inventory.length} 件实物 · ${detail.inspectionCount} 条检测`, tone: policy.inventoryStage === "pending-inspection" ? "warning" : policy.inventoryStage === "completed" ? "success" : "info"},
    {icon: <LockKeyhole className="h-4 w-4" />, label: "编辑策略", value: "当前只读", description: "等待安全编辑契约", tone: "warning"},
  ];

  return <ErpDetailPageFrame className="max-w-[1600px] space-y-5 pb-12">
    <ErpPageHeader title={invoice.invoiceNo || invoice.id} subtitle={<span className="flex flex-wrap items-center gap-2"><span>采购单详情 · {invoice.date}</span><ErpStatusBadge label="只读详情" tone="neutral" /></span>} quickStatus={quickStatus} actions={<><Link to="/purchase" className="inline-flex h-9 items-center gap-2 rounded-[var(--erp-radius-md)] border border-[var(--erp-color-border)] bg-white px-3 text-xs font-semibold text-[var(--erp-color-text)]"><ArrowLeft className="h-4 w-4" />返回采购单据</Link><Button type="button" size="sm" variant="secondary" onClick={onRefresh} disabled={refreshing}><RefreshCw className={`h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />刷新</Button></>} />
    <ErpPageContent className="space-y-[var(--erp-page-gap)]">

    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <DetailMetric label="商品数量" value={`${invoice.totalCount} 件`} detail={`${invoice.items.length} 条实物明细`} />
      <DetailMetric label="采购总额" value={showCost ? formatCurrency(invoice.totalCost) : "无权查看"} detail={showCost ? "按实物明细汇总" : "当前账号未开放成本"} />
      <DetailMetric label="预计销售总额" value={showProfit ? formatCurrency(invoice.estTotalSell) : "无权查看"} detail={showProfit ? "仅用于采购评估" : "当前账号未开放利润数据"} />
      <DetailMetric label="未付金额" value={canReadPayments ? formatCurrency(invoice.unpaidAmount) : "无权查看"} detail={canReadPayments ? `现金已付 ${formatCurrency(invoice.paidAmount)}` : "需要支出流水权限"} tone={canReadPayments && invoice.unpaidAmount > 0 ? "warning" : "neutral"} />
    </div>

    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
      <div className="min-w-0 space-y-5">
        <Card><CardHeader><div><h2 className="text-sm font-bold">商品明细</h2><p className="mt-1 text-xs text-[var(--erp-color-text-secondary)]">展示后端已存储的实物行；不在详情页反向猜测原始数量分组。</p></div></CardHeader><CardContent className="p-0"><PurchaseLineTable invoice={invoice} showCost={showCost} showProfit={showProfit} /></CardContent></Card>
        <Card><CardHeader><div><h2 className="text-sm font-bold">关联库存</h2><p className="mt-1 text-xs text-[var(--erp-color-text-secondary)]">库存和检测状态只做事实展示，不由采购详情页修改。</p></div></CardHeader><CardContent><InventoryFacts items={detail.inventory} /></CardContent></Card>
        <Card><CardHeader><div><h2 className="text-sm font-bold">采购图片</h2><p className="mt-1 text-xs text-[var(--erp-color-text-secondary)]">通过带鉴权的媒体请求打开，不重新上传已绑定的正式图片。</p></div></CardHeader><CardContent><PurchaseImages images={invoice.images || []} /></CardContent></Card>
      </div>

      <aside className="space-y-5">
        <Card><CardHeader><h2 className="text-sm font-bold">单据信息</h2></CardHeader><CardContent className="space-y-3">
          <InfoRow label="来源类型" value={invoice.sourceType} />
          <InfoRow label="来源对象" value={invoice.supplierName || "—"} />
          <InfoRow label="联系方式" value={invoice.contact || "—"} />
          <InfoRow label="快递单号" value={invoice.expressNo || "—"} />
          <InfoRow label="经办人" value={invoice.handleBy || "—"} />
          <InfoRow label="备注" value={invoice.remarks || "—"} />
        </CardContent></Card>

        <Card className="border-[var(--erp-color-border-strong)] bg-[var(--erp-color-warning-soft)]/35"><CardHeader><div className="flex items-center gap-2"><ShieldAlert className="h-4 w-4 text-[var(--erp-color-warning)]" /><h2 className="text-sm font-bold">编辑安全评估</h2></div></CardHeader><CardContent className="space-y-3"><p className="text-xs leading-5 text-[var(--erp-color-text-secondary)]">{policy.summary}</p><div className="space-y-2">{policy.reasons.map((reason) => <p key={reason} className="rounded-[var(--erp-radius-md)] bg-white/70 px-3 py-2 text-xs leading-5 text-[var(--erp-color-text-secondary)]">{reason}</p>)}</div><div className="grid gap-2"><RiskRow tone="success" label="低风险" values={policy.fields.green} /><RiskRow tone="warning" label="需条件" values={policy.fields.yellow} /><RiskRow tone="danger" label="暂禁止" values={policy.fields.red} /></div></CardContent></Card>

        <Card><CardHeader><div className="flex items-center gap-2"><Truck className="h-4 w-4 text-[var(--erp-color-primary)]" /><h2 className="text-sm font-bold">付款与抵扣</h2></div></CardHeader><CardContent>{canReadPayments ? <div className="space-y-3"><InfoRow label="付款方式" value={invoice.paymentMethod || "—"} /><InfoRow label="结算账户" value={invoice.settlementAccountName || "—"} /><InfoRow label="现金已付" value={formatCurrency(invoice.paidAmount)} /><InfoRow label="供应商抵扣" value={formatCurrency(invoice.vendorCreditAppliedAmount || 0)} /><InfoRow label="未付" value={formatCurrency(invoice.unpaidAmount)} /><InfoRow label="关联付款流水" value={`${detail.paymentCount ?? 0} 笔`} /></div> : <p className="text-xs leading-5 text-[var(--erp-color-text-secondary)]">当前账号没有支出流水权限，不展示金额、账户和历史流水。</p>}</CardContent></Card>
      </aside>
    </div>
    </ErpPageContent>
  </ErpDetailPageFrame>;
}

function InfoRow({label, value}: {label: string; value: string}) {
  return <div className="grid grid-cols-[96px_minmax(0,1fr)] gap-3 text-xs"><span className="text-[var(--erp-color-text-muted)]">{label}</span><span className="break-words text-right font-semibold text-[var(--erp-color-text)]">{value}</span></div>;
}

function RiskRow({tone, label, values}: {tone: "success" | "warning" | "danger"; label: string; values: readonly string[]}) {
  return <div className="flex items-start gap-2"><ErpStatusBadge label={label} tone={tone} /><p className="pt-0.5 text-xs leading-5 text-[var(--erp-color-text-secondary)]">{values.join("、")}</p></div>;
}

export function PurchaseDetailPage({purchaseId}: {purchaseId: string}) {
  const queryClient = useQueryClient();
  const {session, status, error: authError, refresh, logout} = useAuth();
  const allowed = hasMenu(session, "purchase_list");
  const detailPermissions = useMemo(() => ({
    showCost: Boolean(session?.permissions.showCost),
    showProfit: Boolean(session?.permissions.showProfit),
    canReadPayments: hasMenu(session, "payment_out"),
    canReadPurchaseReturns: hasMenu(session, "return_purchase") || hasMenu(session, "return_orders"),
  }), [session]);
  const detailQuery = useQuery({queryKey: queryKeys.purchase.detail(purchaseId), queryFn: ({signal}) => purchaseApi.detail(purchaseId, detailPermissions, signal), enabled: Boolean(session && allowed), retry: false});

  useEffect(() => {if (detailQuery.error instanceof ApiError && detailQuery.error.isUnauthorized) logout();}, [detailQuery.error, logout]);
  if (status === "loading") return <Card><ErpLoadingState title="正在验证采购权限" /></Card>;
  if (status === "error") return <ErpPageError title="无法读取登录状态" description={authError?.message || "请重新登录后继续。"} onRetry={() => void refresh()} />;
  if (!session || !allowed) return <ErpPageError title="当前账号没有采购单据权限" description="服务器已拒绝 purchase_list 菜单访问，请联系管理员授权。" />;
  if (detailQuery.isPending) return <Card><ErpLoadingState title="正在加载采购详情" description="正在匹配单据、库存、检测和可见付款事实。" /></Card>;
  if (detailQuery.error) return <ErpPageError title="采购详情加载失败" description={errorText(detailQuery.error)} onRetry={() => void detailQuery.refetch()} />;
  if (!detailQuery.data) return <ErpPageError title="采购单不存在" description="该单据可能已删除，或当前账号无权查看。" />;
  return <PurchaseDetailContent detail={detailQuery.data} session={session} refreshing={detailQuery.isFetching} onRefresh={() => {void Promise.all([detailQuery.refetch(), queryClient.invalidateQueries({queryKey: queryKeys.purchase.all()})]);}} />;
}
