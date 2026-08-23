import {useMutation, useQuery, useQueryClient} from "@tanstack/react-query";
import {Link, useBlocker, useNavigate} from "@tanstack/react-router";
import {ArrowLeft, LockKeyhole, LogIn, RefreshCw} from "lucide-react";
import {useMemo, useState, type FormEvent, type ReactNode} from "react";
import {toast} from "sonner";
import {Button, Card, CardContent, Input, Select, Textarea} from "@/src/components/ui";
import {ErpDatePicker, ErpFormSection, ErpPageContent, ErpPageError, ErpPageHeader, ErpStatusBadge, ErpSubmitBar, ErpTransactionPageFrame, ErpUnsavedChangesDialog, MetricsRegion, useErpDirtyGuard} from "@/src/components/common";
import {ApiError, queryKeys, returnsApi} from "@/src/services/api";
import {createCapabilities, useAuth} from "@/src/app/auth";
import type {AuthSession} from "@/src/services/api";
import {formatCurrency} from "@/src/lib/format";
import type {CardInventory} from "@/src/types/core";
import type {PurchaseInvoice, PurchaseItem} from "@/src/types/purchase";
import type {PurchaseReturnFormValues} from "@/src/types/returns";
import {isInventoryLinkedToPurchase} from "@/src/utils/inventoryRelations";
import {createProductIdentityIndex, sameProductIdentity} from "@/src/utils/productIdentity";
import {storeDate} from "@/src/utils/storeTime";
import {calculatePurchaseReturnPreview, canDirectWriteOffPurchase} from "../purchase-return.calculations";

const settlementOptions = [{value: "原路退款", label: "原路退款"}, {value: "抵扣账款", label: "转为供应商抵扣"}, {value: "直接冲销", label: "直接冲销误录付款"}];
const actionOptions = [{value: "退回供应商", label: "退回供应商"}, {value: "直接报废", label: "直接报废"}];

export function NewPurchaseReturnPage() {
  const queryClient = useQueryClient();
  const {session, status, error: authError, refresh, logout} = useAuth();
  const allowed = createCapabilities(session).menu("return_purchase") || createCapabilities(session).menu("return_orders");
  const stateQuery = useQuery({queryKey: queryKeys.returns.reference(), queryFn: ({signal}) => returnsApi.reference(signal), enabled: Boolean(session && allowed), retry: false});
  if (status === "loading") return <Card><CardContent><ReturnState title="正在验证采购退货权限" icon={<RefreshCw className="h-5 w-5 animate-spin" />} /></CardContent></Card>;
  if (status === "error") return <ErpPageError title="无法读取登录状态" description={authError?.message || "请重新登录后继续。"} onRetry={() => void refresh()} />;
  if (!session || !allowed) return <ErpPageError title="当前账号没有采购退货权限" description="服务器已拒绝 return_purchase / return_orders 菜单访问，请联系管理员授权。" />;
  if (stateQuery.isPending || !stateQuery.data) return <Card><CardContent><ReturnState title="正在加载采购单、库存与付款关系" icon={<RefreshCw className="h-5 w-5 animate-spin" />} /></CardContent></Card>;
  if (stateQuery.error) return <ErpPageError title="无法加载采购退货基础数据" description={stateQuery.error.message} onRetry={() => void stateQuery.refetch()} />;
  return <PurchaseReturnForm session={session} state={stateQuery.data} onAuthExpired={logout} onSuccess={() => {void queryClient.invalidateQueries({queryKey: queryKeys.returns.all()}); void queryClient.invalidateQueries({queryKey: queryKeys.purchase.all()}); void queryClient.invalidateQueries({queryKey: queryKeys.inventory.all()});}} />;
}

function PurchaseReturnForm({session, state, onAuthExpired, onSuccess}: {session: AuthSession; state: Awaited<ReturnType<typeof returnsApi.reference>>; onAuthExpired: () => void; onSuccess: () => void}) {
  const navigate = useNavigate();
  const [values, setValues] = useState<PurchaseReturnFormValues>(() => ({date: storeDate(), relatedDocNo: "", sourceInventoryId: "", amount: 0, settlementMode: "抵扣账款", settlementAccountId: "", handler: session.user.displayName, reason: "", inventoryAction: "退回供应商", remarks: ""}));
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const productIndex = useMemo(() => createProductIdentityIndex(state.products), [state.products]);
  const selectedInvoice = state.purchaseInvoices.find((invoice) => invoice.invoiceNo === values.relatedDocNo || invoice.id === values.relatedDocNo);
  const eligibleCards = useMemo(() => selectedInvoice ? state.inventory.filter((card) => isInventoryLinkedToPurchase(card, selectedInvoice) && !["已售出", "已退货", "已报废", "已拆卸", "已组装"].includes(card.status)) : [], [selectedInvoice, state.inventory]);
  const selectedCard = eligibleCards.find((card) => card.id === values.sourceInventoryId);
  const selectedLine = useMemo(() => findPurchaseLine(selectedInvoice, selectedCard, productIndex), [productIndex, selectedCard, selectedInvoice]);
  const returnAmount = Number(selectedLine?.buyPrice || selectedCard?.costPrice || 0);
  const linkedPayments = selectedInvoice ? state.paymentOutRecords.filter((payment) => payment.relatedDocNo === selectedInvoice.invoiceNo || payment.relatedDocNo === selectedInvoice.id) : [];
  const preview = selectedInvoice && selectedCard ? calculatePurchaseReturnPreview({totalCost: selectedInvoice.totalCost, paidAmount: selectedInvoice.paidAmount, unpaidAmount: selectedInvoice.unpaidAmount, vendorCreditAppliedAmount: selectedInvoice.vendorCreditAppliedAmount, returnAmount, settlementMode: values.settlementMode}) : null;
  const directWriteOffAllowed = selectedInvoice && selectedCard ? canDirectWriteOffPurchase({totalCost: selectedInvoice.totalCost, returnAmount, vendorCreditAppliedAmount: selectedInvoice.vendorCreditAppliedAmount, paidAmount: selectedInvoice.paidAmount, linkedPayments}) : false;
  const needsLegacyAccount = Boolean(values.settlementMode === "原路退款" && (preview?.cashRefundAmount || 0) > 0 && linkedPayments.every((payment) => payment.businessType !== "采购付款"));
  const enabledAccounts = state.settlementAccounts.filter((account) => account.enabled);
  const mutation = useMutation({mutationFn: () => returnsApi.createPurchase({...values, amount: returnAmount})});

  const selectInvoice = (invoiceNo: string) => setValues((current) => ({...current, relatedDocNo: invoiceNo, sourceInventoryId: "", amount: 0, settlementAccountId: ""}));
  const selectCard = (inventoryId: string) => {
    const card = eligibleCards.find((candidate) => candidate.id === inventoryId);
    const line = findPurchaseLine(selectedInvoice, card, productIndex);
    setValues((current) => ({...current, sourceInventoryId: inventoryId, amount: Number(line?.buyPrice || card?.costPrice || 0)}));
  };
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setError(""); setSuccess("");
    if (!selectedInvoice) return setError("请选择原采购单");
    if (!selectedCard || !selectedLine) return setError("请选择可追溯到该采购单的库存卡片");
    if (!values.reason.trim()) return setError("请填写退货原因");
    if (needsLegacyAccount && !values.settlementAccountId) return setError("该历史采购单缺少付款流水，请选择人工退款账户");
    if (values.settlementMode === "直接冲销" && !directWriteOffAllowed) return setError("直接冲销只允许整张采购单、无供应商抵扣且仅有一笔完全匹配的采购付款");
    if (["个人回收", "客户置换"].includes(selectedInvoice.sourceType) && values.settlementMode === "抵扣账款" && (preview?.cashRefundAmount || 0) > 0) return setError("个人回收的已付款退货不能形成供应商抵扣，请选择原路退款");
    try {
      const result = await mutation.mutateAsync();
      const payload = result.data && typeof result.data === "object" ? result.data as Record<string, unknown> : {};
      setSuccess(`采购退货单 ${String(payload.returnNo || "已创建")} 已提交，等待完成处理。`);
      toast.success("采购退货单已提交");
      setValues((current) => ({...current, relatedDocNo: "", sourceInventoryId: "", amount: 0, settlementAccountId: "", reason: "", remarks: ""}));
      onSuccess();
    } catch (caught) {
      if (caught instanceof ApiError && caught.isUnauthorized) onAuthExpired();
      setError(caught instanceof Error ? caught.message : "采购退货提交失败");
    }
  };
  const dirty = Boolean(values.relatedDocNo || values.sourceInventoryId || values.reason || values.remarks);
  useErpDirtyGuard(dirty);
  const blocker = useBlocker({withResolver: true, shouldBlockFn: () => dirty, enableBeforeUnload: false, disabled: !dirty});

  return <ErpTransactionPageFrame className="max-w-[1400px]">
    <ErpPageHeader title="新建采购退货" subtitle={<span className="flex flex-wrap items-center gap-2"><span>必须关联原采购单和真实库存卡片，最终金额与结算由服务端再次校验。</span><ErpStatusBadge label="待完成处理" tone="warning" /></span>} actions={<Link to="/purchase/returns" className="inline-flex h-9 items-center gap-2 rounded-[var(--erp-radius-md)] border border-[var(--erp-color-border)] bg-white px-3 text-xs font-semibold"><ArrowLeft className="h-4 w-4" />返回采购退货</Link>} />
    <ErpPageContent className="space-y-[var(--erp-page-gap)]">
    {success && <Card className="border-[var(--erp-color-border-strong)] bg-[var(--erp-color-success-soft)]"><CardContent className="p-4 text-sm font-semibold text-[var(--erp-color-success)]">{success}</CardContent></Card>}
    {error && <Card className="border-[var(--erp-color-border-strong)] bg-[var(--erp-color-danger-soft)]"><CardContent className="p-4 text-sm text-[var(--erp-color-danger)]">{error}</CardContent></Card>}
    <form className="flex flex-col gap-5" onSubmit={submit}>
      <ErpFormSection title="原采购单与库存" description="只允许选择仍可退回、且与采购单存在精确结构化关联的库存卡片。"><div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4"><label className="text-sm font-semibold">退货日期<ErpDatePicker className="mt-2" value={values.date} onChange={(date) => setValues((current) => ({...current, date}))} aria-label="采购退货日期" /></label><label className="text-sm font-semibold md:col-span-2">采购单<Select searchable searchPlaceholder="搜索采购单号或供应商" className="mt-2" value={values.relatedDocNo} options={state.purchaseInvoices.map((invoice) => ({value: invoice.invoiceNo, label: `${invoice.invoiceNo} · ${invoice.supplierName} · ${formatCurrency(invoice.totalCost)}`}))} onValueChange={selectInvoice} placeholder="请选择原采购单" aria-label="原采购单" /></label><label className="text-sm font-semibold">供应商<Input className="mt-2" value={selectedInvoice?.supplierName || ""} disabled /></label><label className="text-sm font-semibold md:col-span-2">退货库存<Select searchable searchPlaceholder="搜索库存编号、商品或 SN" className="mt-2" value={values.sourceInventoryId} options={eligibleCards.map((card) => ({value: card.id, label: `${card.id} · ${card.productName} · ${card.sn || "无 SN"}`}))} onValueChange={selectCard} placeholder={selectedInvoice ? "选择可退库存卡片" : "先选择采购单"} disabled={!selectedInvoice} aria-label="采购退货库存" /></label><label className="text-sm font-semibold">原采购价<Input className="mt-2" value={selectedCard ? formatCurrency(returnAmount) : "—"} disabled /></label><label className="text-sm font-semibold">当前库存状态<Input className="mt-2" value={selectedCard ? `${selectedCard.status} · ${selectedCard.warehouseLocation}` : "—"} disabled /></label></div></ErpFormSection>
      <ErpFormSection title="结算与库存处理" description="退货金额依次冲减未付应付、释放已用抵扣，再处理现金；抵扣账款不会生成现金流水。"><div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4"><label className="text-sm font-semibold">结算方式<Select className="mt-2" value={values.settlementMode} options={settlementOptions} onValueChange={(value) => setValues((current) => ({...current, settlementMode: value as PurchaseReturnFormValues["settlementMode"], settlementAccountId: ""}))} aria-label="采购退货结算方式" /></label><label className="text-sm font-semibold">库存处理<Select className="mt-2" value={values.inventoryAction} options={actionOptions} onValueChange={(value) => setValues((current) => ({...current, inventoryAction: value as PurchaseReturnFormValues["inventoryAction"]}))} aria-label="采购退货库存处理" /></label>{needsLegacyAccount && <label className="text-sm font-semibold md:col-span-2">人工退款账户<Select className="mt-2" value={values.settlementAccountId} options={enabledAccounts.map((account) => ({value: account.id, label: `${account.name} · ${formatCurrency(account.balance)}`}))} onValueChange={(value) => setValues((current) => ({...current, settlementAccountId: value}))} placeholder="请选择退款入账账户" aria-label="采购退款账户" /></label>}</div>{values.settlementMode === "直接冲销" && !directWriteOffAllowed && selectedCard && <p className="mt-3 rounded-[var(--erp-radius-md)] bg-[var(--erp-color-warning-soft)] p-3 text-xs text-[var(--erp-color-warning)]">当前采购单不满足直接冲销条件，请改用原路退款或抵扣账款。</p>}</ErpFormSection>
      <MetricsRegion><Metric label="退货金额" value={formatCurrency(returnAmount)} detail="必须等于原商品采购价" /><Metric label="冲减应付款" value={formatCurrency(preview?.payableOffset || 0)} detail="优先减少原采购欠款" /><Metric label="现金退款" value={formatCurrency(preview?.cashRefundAmount || 0)} detail={values.settlementMode === "抵扣账款" ? "将转入供应商抵扣余额" : "按原付款来源退款"} /><Metric label="新增供应商抵扣" value={formatCurrency(preview?.vendorCreditIncrease || 0)} detail="非现金结算，不生成资金流水" /></MetricsRegion>
      <ErpFormSection title="原因与备注" description="采购退货创建后需回到列表执行完成，届时才正式改变采购单、供应商余额和库存。"><div className="grid gap-4 md:grid-cols-2"><label className="text-sm font-semibold">经办人<Input className="mt-2" value={values.handler} disabled /></label><label className="text-sm font-semibold md:col-span-2">退货原因<Textarea className="mt-2" value={values.reason} onChange={(event) => setValues((current) => ({...current, reason: event.target.value}))} placeholder="例如：到货检测不符、型号错误、供应商同意退回" required /></label><label className="text-sm font-semibold md:col-span-2">备注<Textarea className="mt-2" value={values.remarks} onChange={(event) => setValues((current) => ({...current, remarks: event.target.value}))} placeholder="补充物流、沟通或财务说明" /></label></div></ErpFormSection>
      <ErpSubmitBar dirty={dirty} submitting={mutation.isPending} onCancel={() => void navigate({to: "/purchase/returns"})} submitLabel="提交采购退货"><span>创建后状态：待处理</span></ErpSubmitBar>
    </form>
    <ErpUnsavedChangesDialog open={blocker.status === "blocked"} onStay={() => blocker.reset?.()} onLeave={() => blocker.proceed?.()} />
    </ErpPageContent>
  </ErpTransactionPageFrame>;
}

function findPurchaseLine(invoice: PurchaseInvoice | undefined, card: CardInventory | undefined, index: ReturnType<typeof createProductIdentityIndex>): PurchaseItem | undefined {
  if (!invoice || !card) return undefined;
  return invoice.items.find((item) => sameProductIdentity(item, card, index) && (card.sn ? item.sn === card.sn || !item.sn : true));
}

function Metric({label, value, detail}: {label: string; value: string; detail: string}) { return <Card><CardContent className="min-h-[104px] p-4"><p className="text-xs font-semibold text-[var(--erp-color-text-secondary)]">{label}</p><p className="mt-2 font-mono text-2xl font-bold">{value}</p><p className="mt-1 text-xs text-[var(--erp-color-text-muted)]">{detail}</p></CardContent></Card>; }
function ReturnState({title, icon}: {title: string; icon: ReactNode}) { return <div className="flex min-h-52 flex-col items-center justify-center gap-3 text-center"><span className="flex h-11 w-11 items-center justify-center rounded-full bg-[var(--erp-color-info-soft)] text-[var(--erp-color-primary)]">{icon}</span><p className="font-bold">{title}</p></div>; }
