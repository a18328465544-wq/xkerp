import {keepPreviousData, useMutation, useQuery, useQueryClient} from "@tanstack/react-query";
import type {OnChangeFn, SortingState} from "@tanstack/react-table";
import {Boxes, Download, Filter, Layers3, PackageCheck, Plus, RefreshCw, Search, ShieldAlert, Upload} from "lucide-react";
import {useEffect, useMemo, useRef, useState, type ReactNode} from "react";
import {toast} from "sonner";
import {Button, Card, CardContent, Dialog, Input, Select} from "@/src/components/ui";
import {DashboardSection, ErpDataTable, ErpFilterBar, ErpListPageFrame, ErpLoadingState, ErpMetricCard, ErpPageContent, ErpPageError, ErpPageHeader, ErpPageToolbar, ErpProductLedgerDrawer, ErpProductTemplateDialog, ErpStatusBadge, MetricsRegion, type ProductLedgerSubject, type QuickStatusItemData} from "@/src/components/common";
import {ApiError, productsApi, queryKeys, type AuthSession} from "@/src/services/api";
import {createCapabilities, useAuth} from "@/src/app/auth";
import {useProductLedger} from "@/src/hooks/useProductLedger";
import {useDebouncedValue} from "@/src/hooks/useDebouncedValue";
import {useUrlSearchState} from "@/src/hooks/useUrlSearchState";
import type {ProductLibraryFilters, ProductLibraryItem, ProductTemplateFormValues} from "@/src/types/product";
import type {ProductLedgerRow} from "@/src/types/product-ledger";
import {useNavigate} from "@tanstack/react-router";
import {createProductColumns} from "../product.columns";
import {defaultProductFilters, parseProductFilters, productFiltersToSearch} from "../product.filters";
import {parseProductImportCsv, productCsv, productImportHeaders, type ProductImportRow} from "../product.import";

function useProductUrlState() {
  return useUrlSearchState({defaultValue: defaultProductFilters, parse: parseProductFilters, serialize: productFiltersToSearch});
}

export function ProductLibraryPage() {
  const {session, logout} = useAuth();
  const {value: filters, commit} = useProductUrlState();
  const [sorting, setSorting] = useState<SortingState>([]);
  const debouncedKeyword = useDebouncedValue(filters.keyword, 250);
  const serverFilters = {...filters, keyword: debouncedKeyword};
  const allowed = createCapabilities(session).menu("products");
  const canViewLedger = createCapabilities(session).menu("inventory");
  const permissions = session?.permissions;
  const listQuery = useQuery({queryKey: queryKeys.products.list({showCost: Boolean(permissions?.showCost), showProfit: Boolean(permissions?.showProfit)}, serverFilters, sorting), queryFn: ({signal}) => productsApi.list(serverFilters, sorting, {showCost: Boolean(permissions?.showCost), showProfit: Boolean(permissions?.showProfit)}, signal), enabled: Boolean(session && allowed), placeholderData: keepPreviousData, retry: false});
  if (!session) return <Card><ErpLoadingState title="正在验证商品库权限" /></Card>;
  if (!session || !allowed) return <ErpPageError title="当前账号没有商品库权限" description="服务器已拒绝 products 菜单访问，请联系管理员授权。" />;
  return <ProductLibraryContent session={session} query={listQuery} filters={filters} sorting={sorting} onSortingChange={(next) => {setSorting(next); commit({...filters, page: 1});}} onFiltersChange={commit} onAuthExpired={logout} canViewLedger={canViewLedger} />;
}

function ProductLibraryContent({session, query, filters, sorting, onSortingChange, onFiltersChange, onAuthExpired, canViewLedger}: {session: AuthSession; query: ReturnType<typeof useQuery<Awaited<ReturnType<typeof productsApi.list>>>>; filters: ProductLibraryFilters; sorting: SortingState; onSortingChange: OnChangeFn<SortingState>; onFiltersChange: (filters: ProductLibraryFilters) => void; onAuthExpired: () => void; canViewLedger: boolean}) {
  const queryClient = useQueryClient();
  const importRef = useRef<HTMLInputElement>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<ProductLibraryItem | null>(null);
  const [ledgerSubject, setLedgerSubject] = useState<ProductLedgerSubject | null>(null);
  const [confirmState, setConfirmState] = useState<{kind: "delete"; product: ProductLibraryItem} | {kind: "import"; rows: ProductImportRow[]; overwrite: number} | null>(null);
  const productLedger = useProductLedger({open: Boolean(ledgerSubject), productSkuId: ledgerSubject?.key || "", permissions: session.permissions});
  const navigate = useNavigate();
  const products = query.data?.products || [];
  const fullPriceAccess = session.permissions.showCost && session.permissions.showProfit;

  const total = query.data?.meta?.total ?? products.length;
  const totalPages = query.data?.meta?.totalPages ?? Math.max(1, Math.ceil(total / filters.pageSize));
  useEffect(() => {if (filters.page > totalPages) onFiltersChange({...filters, page: totalPages});}, [filters, onFiltersChange, totalPages]);
  const stockUnits = query.data?.meta?.summary.stockUnits ?? products.reduce((sum, item) => sum + item.currentStock, 0);
  const stockedTemplates = query.data?.meta?.summary.stockedTemplates ?? products.filter((item) => item.currentStock > 0).length;

  const invalidate = async () => {
    await Promise.all([queryClient.invalidateQueries({queryKey: queryKeys.products.all()}), queryClient.invalidateQueries({queryKey: queryKeys.state.all()})]);
  };
  const handleMutationError = (error: Error) => {
    if (error instanceof ApiError && error.isUnauthorized) {onAuthExpired(); return;}
    toast.error(error.message);
  };
  const saveMutation = useMutation({
    mutationFn: ({values, product}: {values: ProductTemplateFormValues; product: ProductLibraryItem | null}) => product ? productsApi.update(product.id, values, session.permissions) : productsApi.create(values, session.permissions),
    onSuccess: async (product) => {toast.success(`${product.name} 已保存`); setDialogOpen(false); setEditing(null); await invalidate();},
    onError: handleMutationError,
  });
  const deleteMutation = useMutation({mutationFn: (id: string) => productsApi.remove(id), onSuccess: async () => {toast.success("商品模板已删除"); setConfirmState(null); await invalidate();}, onError: handleMutationError});
  const importMutation = useMutation({mutationFn: (rows: ProductImportRow[]) => productsApi.importTemplates(rows), onSuccess: async (count) => {toast.success(`已导入 ${count} 行商品模板`); setConfirmState(null); onFiltersChange(defaultProductFilters); await invalidate();}, onError: handleMutationError});

  const openCreate = () => {setEditing(null); setDialogOpen(true); saveMutation.reset();};
  const openEdit = (product: ProductLibraryItem) => {if (!fullPriceAccess) return; setEditing(product); setDialogOpen(true); saveMutation.reset();};
  const openLedger = (product: ProductLibraryItem) => setLedgerSubject({key: product.id, productName: product.name, category: product.category, brand: product.brand, model: product.model, version: product.version, vram: product.vram, currentStock: product.currentStock, imageUrl: product.imageUrls[0]});
  const openProductLedgerDocument = (row: ProductLedgerRow) => {
    setLedgerSubject(null);
    if (row.documentType === "采购入库") return void navigate({to: "/purchase", search: {keyword: row.documentNo}});
    if (row.documentType === "采购退货") return void navigate({to: "/purchase/returns", search: {keyword: row.documentNo, detail: row.documentNo, page: 1}});
    if (row.documentType === "销售出库") return void navigate({to: "/sales", search: {keyword: row.documentNo, detail: row.documentNo, page: 1}});
    if (row.documentType === "销售退货") return void navigate({to: "/sales/returns", search: {keyword: row.documentNo, detail: row.documentNo, page: 1}});
    if (row.documentType === "组装拆卸") return void navigate({to: "/assembly", search: {q: row.documentNo}});
    return void navigate({to: "/inventory", search: {keyword: row.documentNo}});
  };
  const columns = useMemo(() => createProductColumns({showCost: session.permissions.showCost, showProfit: session.permissions.showProfit, canEdit: fullPriceAccess, canDelete: session.permissions.canDelete, onEdit: openEdit, onDelete: (product) => setConfirmState({kind: "delete", product}), onOpenLedger: canViewLedger ? openLedger : undefined}), [canViewLedger, fullPriceAccess, session.permissions.canDelete, session.permissions.showCost, session.permissions.showProfit]);

  const onImportFile = async (file: File) => {
    if (!file.name.toLowerCase().endsWith(".csv")) {toast.error("商品库仅支持 CSV；请先在 Excel/WPS 中另存为 CSV。"); return;}
    const rows = parseProductImportCsv(await file.text());
    if (!rows.length) {toast.error("没有识别到有效商品；请检查表头以及商品名称、型号、品牌列。"); return;}
    const ids = new Set(products.map((item) => item.id));
    const overwrite = new Set(rows.map((item) => item.id).filter((id): id is string => Boolean(id && ids.has(id)))).size;
    if (overwrite) setConfirmState({kind: "import", rows, overwrite}); else importMutation.mutate(rows);
  };

  const download = (name: string, content: string) => {
    const url = URL.createObjectURL(new Blob([content], {type: "text/csv;charset=utf-8"}));
    const link = document.createElement("a");
    link.href = url; link.download = name; link.click(); URL.revokeObjectURL(url);
  };
  const downloadTemplate = () => download("商品库导入模板.csv", productCsv([productImportHeaders, ["SP-EXAMPLE", "显卡", "华硕 RTX 4090 猛禽 24G", "RTX 4090", "华硕", "猛禽", "24G", 18000, 19500, "示例行，导入前删除"]]));
  const exportProducts = () => download("商品库-当前页.csv", productCsv([["配件ID", "分类", "商品名称", "核心型号", "品牌", "版本/系列", "规格参数", ...(session.permissions.showCost ? ["参考回收价"] : []), ...(session.permissions.showProfit ? ["参考销售价"] : []), "当前库存", "备注"], ...products.map((item) => [item.id, item.category, item.name, item.model, item.brand, item.version, item.vram, ...(session.permissions.showCost ? [item.refBuyPrice || 0] : []), ...(session.permissions.showProfit ? [item.refSellPrice || 0] : []), item.currentStock, item.remarks || ""])]));

  const quickStatus: QuickStatusItemData[] = [
    {icon: <Layers3 className="h-4 w-4" />, label: "模板总数", value: `${total} 款`, description: `${query.data?.categories.length || 0} 个品类`, tone: "info"},
    {icon: <PackageCheck className="h-4 w-4" />, label: "有库存模板", value: `${stockedTemplates} 款`, description: `共 ${stockUnits} 件在库`, tone: stockedTemplates ? "success" : "neutral"},
    {icon: <ShieldAlert className="h-4 w-4" />, label: "价格权限", value: fullPriceAccess ? "完整" : "受限", description: fullPriceAccess ? "可安全编辑模板" : "隐藏字段不会被编辑覆盖", tone: fullPriceAccess ? "success" : "warning"},
  ];
  const activeFilters = Number(Boolean(filters.keyword)) + Number(filters.category !== "all") + Number(filters.brand !== "all");

  return <ErpListPageFrame>
    <ErpPageHeader title="商品库" subtitle="统一维护采购、检测、库存和行情共用的商品规格模板；商品身份和历史关联仍由服务端负责。" quickStatus={quickStatus} actions={<><input ref={importRef} type="file" accept=".csv,text/csv" className="sr-only" onChange={(event) => {const file = event.target.files?.[0]; if (file) void onImportFile(file); event.target.value = "";}} /><Button type="button" size="sm" variant="secondary" onClick={() => void query.refetch()} disabled={query.isFetching}><RefreshCw className={`h-4 w-4 ${query.isFetching ? "animate-spin" : ""}`} />刷新</Button><Button type="button" size="sm" variant="primary" onClick={openCreate}><Plus className="h-4 w-4" />新建模板</Button></>} />
    <MetricsRegion>
      <MetricCard label="商品模板" value={`${total} 款`} detail="当前筛选的服务端汇总" icon={<Boxes className="h-4 w-4" />} />
      <MetricCard label="有库存规格" value={`${stockedTemplates} 款`} detail={`${stockUnits} 件物理库存`} icon={<PackageCheck className="h-4 w-4" />} tone="success" />
      <MetricCard label="品类覆盖" value={`${query.data?.categories.length || 0} 类`} detail={`${query.data?.brands.length || 0} 个品牌`} icon={<Layers3 className="h-4 w-4" />} />
      <MetricCard label="当前筛选" value={`${total} 款`} detail={activeFilters ? `${activeFilters} 项筛选生效` : "全部商品模板"} icon={<Filter className="h-4 w-4" />} tone={activeFilters ? "warning" : "neutral"} />
    </MetricsRegion>
    <ErpPageToolbar><ErpFilterBar actions={<><Button type="button" size="sm" variant="ghost" onClick={() => onFiltersChange(defaultProductFilters)}>重置</Button><Button type="button" size="sm" variant="secondary" onClick={downloadTemplate}><Download className="h-4 w-4" />导入模板</Button><Button type="button" size="sm" variant="secondary" onClick={() => importRef.current?.click()} disabled={importMutation.isPending}><Upload className="h-4 w-4" />CSV 导入</Button><Button type="button" size="sm" variant="secondary" onClick={exportProducts}><Download className="h-4 w-4" />导出</Button></>}>
      <div className="relative min-w-64 flex-1"><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--erp-color-text-muted)]" /><Input className="pl-9" value={filters.keyword} onChange={(event) => onFiltersChange({...filters, keyword: event.target.value, page: 1})} placeholder="商品名称、型号、品牌、版本、规格或配件 ID" aria-label="搜索商品模板" /></div>
      <Select value={filters.category} onValueChange={(category) => onFiltersChange({...filters, category, page: 1})} options={[{value: "all", label: "全部品类"}, ...(query.data?.categories || []).map((value) => ({value, label: value}))]} className="w-40" aria-label="筛选商品品类" />
      <Select value={filters.brand} onValueChange={(brand) => onFiltersChange({...filters, brand, page: 1})} options={[{value: "all", label: "全部品牌"}, ...(query.data?.brands || []).map((value) => ({value, label: value}))]} className="w-40" aria-label="筛选商品品牌" />
    </ErpFilterBar></ErpPageToolbar>
    <ErpPageContent className="space-y-[var(--erp-page-gap)]">
    {!fullPriceAccess && <div className="rounded-[var(--erp-radius-md)] bg-[var(--erp-color-warning-soft)] px-4 py-3 text-xs text-[var(--erp-color-warning)]">当前账号缺少完整成本或利润权限：列表已脱敏，已有模板编辑入口被禁用，避免用不可见的 0 覆盖真实价格；新建模板仍按当前字段权限提交。</div>}
    <DashboardSection title="商品规格列表">
      <ErpDataTable columns={columns} data={products} getRowId={(row) => row.id} loading={query.isPending} fetching={query.isFetching} error={query.error as Error | null} errorTitle="商品库加载失败" emptyTitle="暂无匹配商品" emptyDescription={activeFilters ? "请调整搜索或筛选条件。" : "点击新建模板创建第一条商品规格。"} onRetry={() => void query.refetch()} onRowClick={fullPriceAccess ? openEdit : undefined} manualSorting sorting={sorting} onSortingChange={onSortingChange} page={filters.page} pageSize={filters.pageSize} total={total} onPageChange={(page) => onFiltersChange({...filters, page})} onPageSizeChange={(pageSize) => onFiltersChange({...filters, page: 1, pageSize})} enableColumnResizing density="compact" stickyHeader />
    </DashboardSection>
    <ErpProductTemplateDialog open={dialogOpen} product={editing} showCost={session.permissions.showCost} showProfit={session.permissions.showProfit} pending={saveMutation.isPending} error={saveMutation.error instanceof Error ? saveMutation.error.message : undefined} onOpenChange={(open) => {setDialogOpen(open); if (!open) setEditing(null);}} onSubmit={async (values) => {await saveMutation.mutateAsync({values, product: editing});}} />
    <ConfirmationDialog state={confirmState} pending={deleteMutation.isPending || importMutation.isPending} onClose={() => setConfirmState(null)} onConfirm={() => {if (confirmState?.kind === "delete") deleteMutation.mutate(confirmState.product.id); if (confirmState?.kind === "import") importMutation.mutate(confirmState.rows);}} />
    <ErpProductLedgerDrawer open={Boolean(ledgerSubject)} subject={ledgerSubject} permissions={session.permissions} filters={productLedger.filters} page={productLedger.query.data} loading={productLedger.query.isPending} fetching={productLedger.query.isFetching} error={productLedger.query.error as Error | null} onRetry={() => { void productLedger.query.refetch(); }} onFiltersChange={productLedger.updateFilter} onResetFilters={productLedger.clearFilters} onPageChange={productLedger.changePage} onPageSizeChange={productLedger.changePageSize} onOpenChange={(open) => {if (!open) setLedgerSubject(null);}} onOpenDocument={openProductLedgerDocument} />
    </ErpPageContent>
  </ErpListPageFrame>;
}

function MetricCard({label, value, detail, icon, tone = "info"}: {label: string; value: string; detail: string; icon: ReactNode; tone?: "info" | "success" | "warning" | "neutral"}) {
  return <ErpMetricCard label={label} value={value} detail={detail} icon={icon} tone={tone} />;
}

function ConfirmationDialog({state, pending, onClose, onConfirm}: {state: {kind: "delete"; product: ProductLibraryItem} | {kind: "import"; rows: ProductImportRow[]; overwrite: number} | null; pending: boolean; onClose: () => void; onConfirm: () => void}) {
  const deleting = state?.kind === "delete";
  return <Dialog.Root open={Boolean(state)} onOpenChange={(open) => {if (!open && !pending) onClose();}}><Dialog.Portal><Dialog.Backdrop className="fixed inset-0 erp-modal-layer bg-[var(--erp-color-backdrop)]" /><Dialog.Viewport className="fixed inset-0 erp-modal-layer flex items-center justify-center p-4"><Dialog.Popup className="w-full max-w-md rounded-[var(--erp-radius-xl)] border border-[var(--erp-color-border)] bg-[var(--erp-color-surface)] p-5 shadow-[var(--erp-shadow-popover)]"><Dialog.Title className="text-base font-bold">{deleting ? "删除商品模板" : "导入将覆盖已有模板"}</Dialog.Title><Dialog.Description className="mt-2 text-sm leading-relaxed text-[var(--erp-color-text-secondary)]">{deleting ? `确认删除「${state?.kind === "delete" ? state.product.name : ""}」？被库存或单据引用的模板会由服务端拒绝删除。` : `本次共识别 ${state?.kind === "import" ? state.rows.length : 0} 行，其中 ${state?.kind === "import" ? state.overwrite : 0} 个配件 ID 已存在。继续后将按现有后端规则覆盖模板，但不改写历史单据名称。`}</Dialog.Description><div className="mt-5 flex justify-end gap-2"><Button type="button" variant="secondary" onClick={onClose} disabled={pending}>取消</Button><Button type="button" variant={deleting ? "danger" : "primary"} onClick={onConfirm} disabled={pending}>{pending ? "处理中…" : deleting ? "确认删除" : "继续导入"}</Button></div></Dialog.Popup></Dialog.Viewport></Dialog.Portal></Dialog.Root>;
}
