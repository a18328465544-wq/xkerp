import {keepPreviousData, useMutation, useQuery, useQueryClient} from "@tanstack/react-query";
import {useNavigate} from "@tanstack/react-router";
import {AlertTriangle, Camera, CheckCircle2, Database, PackageCheck, RefreshCw, ScanLine, Search, ShieldAlert, Truck} from "lucide-react";
import {useCallback, useEffect, useMemo, useState, type ReactNode} from "react";
import {toast} from "sonner";
import {Button, Card, CardContent, Input, Textarea} from "@/src/components/ui";
import {DashboardSection, ErpDataTable, ErpEmptyState, ErpLoadingState, ErpPageError, ErpPageHeader, ErpStatusBadge, ErpWarehousePageFrame, MainRegion, MetricsRegion, type QuickStatusItemData} from "@/src/components/common";
import {ApiError, queryKeys, salesApi} from "@/src/services/api";
import type {AuthSession} from "@/src/services/api";
import {createCapabilities, useAuth} from "@/src/app/auth";
import {useUrlSearchState} from "@/src/hooks/useUrlSearchState";
import {formatCurrency} from "@/src/lib/format";
import type {SalesOutboundInvoice} from "@/src/types/sales";
import {createSalesOutboundColumns} from "../sales.outbound.columns";
import {countManualOutboundAvailability, verifySalesOutbound} from "../sales.outbound";
import {SalesOutboundCameraDialog} from "../components/SalesOutboundCameraDialog";

type OutboundUrlState = {keyword: string; invoiceId: string | null};
function useOutboundUrlState() {
  return useUrlSearchState<OutboundUrlState>({
    defaultValue: {keyword: "", invoiceId: null},
    parse: (search: string) => {const params = new URLSearchParams(search); return {keyword: params.get("keyword") || "", invoiceId: params.get("invoice")};},
    serialize: (state: OutboundUrlState) => {const params = new URLSearchParams(); if (state.keyword.trim()) params.set("keyword", state.keyword.trim()); if (state.invoiceId) params.set("invoice", state.invoiceId); return params;},
  });
}

export function SalesOutboundPage() {
  const {session, logout} = useAuth();
  const allowed = createCapabilities(session).menu("sales_outbound");
  const query = useQuery({queryKey: queryKeys.sales.outbound(session?.user.id || "anonymous"), queryFn: ({signal}) => salesApi.outbound(signal), enabled: Boolean(session && allowed), placeholderData: keepPreviousData, retry: false});
  if (!session) return <Card><ErpLoadingState title="正在验证销售出库权限" /></Card>;
  if (!session || !allowed) return <ErpPageError title="当前账号没有销售出库权限" description="服务器已拒绝 sales_outbound 菜单访问，请联系管理员授权。" />;
  return <SalesOutboundContent session={session} query={query} onAuthExpired={logout} />;
}

function SalesOutboundContent({session, query, onAuthExpired}: {session: AuthSession; query: ReturnType<typeof useQuery<Awaited<ReturnType<typeof salesApi.outbound>>>>; onAuthExpired: () => void}) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const {value: outboundState, commit: commitOutboundState} = useOutboundUrlState();
  const {keyword, invoiceId} = outboundState;
  const setKeyword = (value: string) => commitOutboundState({...outboundState, keyword: value});
  const setInvoiceId = (value: string | null) => commitOutboundState({...outboundState, invoiceId: value});
  const [scanInput, setScanInput] = useState("");
  const [scanCodes, setScanCodes] = useState("");
  const [remarks, setRemarks] = useState("");
  const [cameraOpen, setCameraOpen] = useState(false);
  const [page, setPage] = useState(1);
  const pageSize = 20;
  const invoices = query.data?.invoices || [];
  const filtered = useMemo(() => {
    const normalized = keyword.trim().toLocaleLowerCase("zh-CN");
    return normalized ? invoices.filter((invoice) => invoice.searchText.includes(normalized)) : invoices;
  }, [invoices, keyword]);
  const selectedInvoice = useMemo(() => invoices.find((invoice) => invoice.id === invoiceId || invoice.invoiceNo === invoiceId) || filtered[0] || null, [filtered, invoiceId, invoices]);
  const verification = useMemo(() => verifySalesOutbound(selectedInvoice, query.data?.inventory || [], scanCodes), [query.data?.inventory, scanCodes, selectedInvoice]);
  const manualAvailability = useMemo(() => countManualOutboundAvailability(selectedInvoice, query.data?.inventory || []), [query.data?.inventory, selectedInvoice]);
  const pageRows = filtered.slice((page - 1) * pageSize, page * pageSize);
  const selectInvoice = useCallback((invoice: SalesOutboundInvoice) => {
    setInvoiceId(invoice.id);
    setScanCodes("");
    setScanInput("");
    setRemarks("");
  }, [setInvoiceId]);
  const columns = useMemo(() => createSalesOutboundColumns(selectInvoice), [selectInvoice]);
  const mutation = useMutation({mutationFn: ({manual}: {manual: boolean}) => {
    if (!selectedInvoice) throw new Error("请选择待出库销售单");
    return salesApi.confirmOutbound(selectedInvoice.id, {handler: session.user.displayName, codes: verification.ready ? scanCodes.split(/[\n,，\s]+/).filter(Boolean) : [], manual, remarks});
  }, onSuccess: (result) => {
    toast.success(`${result.invoiceNo} 已完成销售出库`);
    setScanCodes(""); setScanInput(""); setRemarks(""); setInvoiceId(null);
    void queryClient.invalidateQueries({queryKey: queryKeys.sales.all()});
    void queryClient.invalidateQueries({queryKey: queryKeys.inventory.all()});
    void queryClient.invalidateQueries({queryKey: queryKeys.state.all()});
  }, onError: (error) => {
    if (error instanceof ApiError && error.isUnauthorized) {
      onAuthExpired();
    }
  }});
  const appendCode = useCallback((value: string) => {
    const code = value.trim();
    if (!code) return;
    setScanCodes((current) => current.trim() ? `${current.trimEnd()}\n${code}` : code);
    setScanInput("");
  }, []);
  const quickStatus: QuickStatusItemData[] = [
    {icon: <Truck className="h-4 w-4" />, label: "待出库", value: `${invoices.length} 单`, description: "销售开单后的待处理池", tone: invoices.length ? "warning" : "success"},
    {icon: <PackageCheck className="h-4 w-4" />, label: "待核验实物", value: `${invoices.reduce((sum, item) => sum + item.lines.length, 0)} 件`, description: "出库时绑定 SN", tone: invoices.length ? "info" : "neutral"},
    {icon: <ShieldAlert className="h-4 w-4" />, label: "手动出库", value: session.permissions.canManualOutbound ? "已授权" : "未授权", description: "绕过扫码的高风险权限", tone: session.permissions.canManualOutbound ? "warning" : "neutral"},
  ];
  const errorMessage = mutation.error instanceof Error ? mutation.error.message : "";

  useEffect(() => {setPage(1);}, [keyword]);

  return <ErpWarehousePageFrame>
    <ErpPageHeader title="销售出库" subtitle="仓库核验库存 ID / SN 后完成实物出库；服务端负责最终匹配、扣减和审计。" quickStatus={quickStatus} actions={<><Button type="button" size="sm" variant="secondary" onClick={() => void query.refetch()} disabled={query.isFetching}><RefreshCw className={`h-4 w-4 ${query.isFetching ? "animate-spin" : ""}`} />刷新</Button><Button type="button" size="sm" variant="secondary" onClick={() => void navigate({to: "/sales"})}>销售单据</Button></>} />
    <MetricsRegion>
      <MetricCard label="待出库销售单" value={`${filtered.length} 单`} detail={keyword ? "当前搜索结果" : "全部待处理"} icon={<Truck className="h-4 w-4" />} tone={filtered.length ? "warning" : "neutral"} />
      <MetricCard label="待绑定实物" value={`${filtered.reduce((sum, item) => sum + item.lines.length, 0)} 件`} detail="实际 SN 在本页绑定" icon={<PackageCheck className="h-4 w-4" />} />
      <MetricCard label="待出库金额" value={formatCurrency(filtered.reduce((sum, item) => sum + item.totalAmount, 0))} detail="不包含成本和利润" icon={<Database className="h-4 w-4" />} />
      <MetricCard label="当前核验进度" value={selectedInvoice ? `${verification.verifiedCount}/${verification.expectedCount}` : "—"} detail={selectedInvoice?.invoiceNo || "请选择销售单"} icon={<ScanLine className="h-4 w-4" />} tone={selectedInvoice && !verification.ready ? "warning" : "neutral"} />
    </MetricsRegion>
    <MainRegion variant="60-40">
      <MainRegion.Primary>
        <DashboardSection title="待出库销售单" actions={<div className="relative w-72 max-w-full"><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--erp-color-text-muted)]" /><Input className="pl-9" value={keyword} onChange={(event) => setKeyword(event.target.value)} placeholder="单号、客户、商品或 SN" aria-label="搜索待出库销售单" /></div>}>
          <ErpDataTable columns={columns} data={pageRows} getRowId={(row) => row.id} loading={query.isPending} fetching={query.isFetching} error={query.error as Error | null} errorTitle="待出库数据加载失败" emptyTitle="暂无待出库销售单" emptyDescription={keyword ? "当前搜索没有匹配的待出库销售单。" : "销售出库池已清空。"} onRetry={() => void query.refetch()} onRowClick={selectInvoice} page={page} pageSize={pageSize} total={filtered.length} onPageChange={setPage} density="compact" stickyHeader />
        </DashboardSection>
      </MainRegion.Primary>
      <MainRegion.Secondary>
        <DashboardSection title="出库核验" density="default" description="扫码模式必须完成全部实物核验；手动模式必须有权限且填写原因。">
          {!selectedInvoice ? <ErpEmptyState title="选择待出库销售单" description="选择左侧销售单后开始核验库存 ID 或 SN。" /> : <div className="space-y-4">
            <div className="rounded-[var(--erp-radius-md)] bg-[var(--erp-color-surface-muted)] p-3"><div className="flex items-center justify-between gap-2"><span className="font-mono text-xs font-bold text-[var(--erp-color-primary)]">{selectedInvoice.invoiceNo}</span><ErpStatusBadge label={`${verification.verifiedCount}/${verification.expectedCount} 已核验`} tone={verification.ready ? "success" : "warning"} /></div><p className="mt-2 font-semibold">{selectedInvoice.customerName}</p><p className="mt-1 text-xs text-[var(--erp-color-text-secondary)]">{selectedInvoice.lines.length} 件 · {formatCurrency(selectedInvoice.totalAmount)}</p></div>
            <div className="max-h-72 space-y-2 overflow-y-auto pr-1">{verification.rows.map((row) => <div key={row.lineId} className="rounded-[var(--erp-radius-md)] border border-[var(--erp-color-border)] p-3"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="truncate text-sm font-semibold">{row.productName}</p><p className="mt-1 font-mono text-xs text-[var(--erp-color-text-muted)]">{row.matchedInventory ? `${row.matchedInventory.id} · ${row.matchedInventory.serialNumber || "无 SN"}` : row.reason}</p></div><ErpStatusBadge label={row.verified ? "已核验" : "待扫码"} tone={row.verified ? "success" : "neutral"} /></div></div>)}</div>
            <div><label className="text-xs font-semibold text-[var(--erp-color-text-secondary)]">扫码枪输入</label><div className="mt-2 flex gap-2"><Input value={scanInput} onChange={(event) => setScanInput(event.target.value)} onKeyDown={(event) => {if (event.key === "Enter") {event.preventDefault(); appendCode(scanInput);}}} placeholder="扫描后按回车追加" aria-label="销售出库扫码枪输入" autoFocus /><Button type="button" size="icon" variant="secondary" onClick={() => appendCode(scanInput)} aria-label="追加扫码内容"><ScanLine className="h-4 w-4" /></Button><Button type="button" size="icon" variant="secondary" onClick={() => setCameraOpen(true)} aria-label="打开摄像头扫码"><Camera className="h-4 w-4" /></Button></div></div>
            <label className="block text-xs font-semibold text-[var(--erp-color-text-secondary)]">已扫描库存 ID / SN<Textarea className="mt-2 min-h-24 font-mono" value={scanCodes} onChange={(event) => setScanCodes(event.target.value)} placeholder="支持逐行、空格或逗号分隔" /></label>
            {(verification.unknownCodes.length > 0 || verification.duplicateCodes.length > 0) && <div className="rounded-[var(--erp-radius-md)] bg-[var(--erp-color-warning-soft)] p-3 text-xs text-[var(--erp-color-warning)]"><p className="font-semibold">核验提示</p>{verification.unknownCodes.length > 0 && <p className="mt-1">未匹配：{verification.unknownCodes.join("、")}</p>}{verification.duplicateCodes.length > 0 && <p className="mt-1">重复扫码：{verification.duplicateCodes.join("、")}</p>}</div>}
            <label className="block text-xs font-semibold text-[var(--erp-color-text-secondary)]">出库经办人<Input className="mt-2" value={session.user.displayName} disabled /></label>
            <label className="block text-xs font-semibold text-[var(--erp-color-text-secondary)]">出库备注 / 手动原因<Textarea className="mt-2 min-h-20" value={remarks} onChange={(event) => setRemarks(event.target.value)} placeholder="物流说明；手动确认时必须填写具体原因" /></label>
            {!manualAvailability.ready && <div className="flex gap-2 rounded-[var(--erp-radius-md)] bg-[var(--erp-color-danger-soft)] p-3 text-xs text-[var(--erp-color-danger)]"><AlertTriangle className="h-4 w-4 shrink-0" /><span>当前可售库存只能匹配 {manualAvailability.available}/{manualAvailability.expected} 件，最终提交会由服务端再次校验。</span></div>}
            {errorMessage && <p role="alert" className="rounded-[var(--erp-radius-md)] bg-[var(--erp-color-danger-soft)] p-3 text-xs text-[var(--erp-color-danger)]">{errorMessage}</p>}
            <div className="grid gap-2 sm:grid-cols-2"><Button type="button" variant="primary" disabled={!verification.ready || mutation.isPending} onClick={() => mutation.mutate({manual: false})}>{mutation.isPending ? <RefreshCw className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}扫码确认出库</Button><Button type="button" variant="secondary" disabled={!session.permissions.canManualOutbound || !remarks.trim() || mutation.isPending} onClick={() => mutation.mutate({manual: true})}><ShieldAlert className="h-4 w-4" />手动确认</Button></div>
            {!session.permissions.canManualOutbound && <p className="text-center text-xs text-[var(--erp-color-text-muted)]">当前账号未获手动出库授权，请扫码核验或联系管理员。</p>}
          </div>}
        </DashboardSection>
      </MainRegion.Secondary>
    </MainRegion>
    <SalesOutboundCameraDialog open={cameraOpen} onOpenChange={setCameraOpen} onDetected={appendCode} />
  </ErpWarehousePageFrame>;
}

function MetricCard({label, value, detail, icon, tone = "neutral"}: {label: string; value: string; detail: string; icon: ReactNode; tone?: "neutral" | "warning"}) {
  return <Card><CardContent className="min-h-[104px] p-4"><div className="flex items-center justify-between gap-3"><p className="text-xs font-semibold text-[var(--erp-color-text-secondary)]">{label}</p><span className={tone === "warning" ? "text-[var(--erp-color-warning)]" : "text-[var(--erp-color-primary)]"}>{icon}</span></div><p className={`mt-2 font-mono text-2xl font-bold ${tone === "warning" ? "text-[var(--erp-color-warning)]" : "text-[var(--erp-color-text)]"}`}>{value}</p><p className="mt-1 text-xs text-[var(--erp-color-text-muted)]">{detail}</p></CardContent></Card>;
}
