import {keepPreviousData, useMutation, useQuery, useQueryClient} from "@tanstack/react-query";
import {useWorkspaceTabActivity} from "@/src/hooks/useWorkspaceTabRuntime";
import type {OnChangeFn, SortingState} from "@tanstack/react-table";
import {Boxes, Download, Layers3, PackageCheck, Plus, Upload} from "lucide-react";
import {ErpEntityThumbnail, ErpListPage, ErpMobileRecordRow, type ErpFilterField} from "@/src/components/common";
import {useEffect, useMemo, useRef, useState, type ReactNode} from "react";
import {notify} from "@/src/utils/notification";
import {Card} from "@/src/components/ui";
import {ErpConfirmDialog, ErpDataTable, ErpLoadingState, ErpMetricCard, ErpPageError, ErpProductLedgerDrawer, ErpProductTemplateDialog, type ProductLedgerSubject, type QuickStatusItemData} from "@/src/components/common";
import {ApiError, productsApi, queryKeys, type AuthSession} from "@/src/services/api";
import {invalidateErpDomains} from "@/src/services/api";
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
import {productDisplayName} from "@/src/lib/productName";
import {formatCurrency} from "@/src/lib/format";

function useProductUrlState() {
  return useUrlSearchState({defaultValue: defaultProductFilters, parse: parseProductFilters, serialize: productFiltersToSearch});
}

function toProductLedgerSubject(product: ProductLibraryItem): ProductLedgerSubject {
  return {key: product.id, productName: productDisplayName(product), category: product.category, brand: product.brand, model: product.model, version: product.version, vram: product.vram, currentStock: product.currentStock, imageUrl: product.imageUrls[0]};
}

export function ProductLibraryPage() {
  const {active} = useWorkspaceTabActivity();
  const {session, logout} = useAuth();
  const {value: filters, commit} = useProductUrlState();
  const [sorting, setSorting] = useState<SortingState>([]);
  const debouncedKeyword = useDebouncedValue(filters.keyword, 250);
  const serverFilters = {...filters, keyword: debouncedKeyword};
  const allowed = createCapabilities(session).menu("products");
  const canViewLedger = createCapabilities(session).menu("inventory");
  const permissions = session?.permissions;
  const listQuery = useQuery({queryKey: queryKeys.products.list({showCost: Boolean(permissions?.showCost), showProfit: Boolean(permissions?.showProfit)}, serverFilters, sorting), queryFn: ({signal}) => productsApi.list(serverFilters, sorting, {showCost: Boolean(permissions?.showCost), showProfit: Boolean(permissions?.showProfit)}, signal), enabled: active && Boolean(session && allowed), placeholderData: keepPreviousData, retry: false});
  if (!session) return <Card><ErpLoadingState title="正在验证商品库权限" /></Card>;
  if (!session || !allowed) return <ErpPageError title="当前账号没有商品库权限" description="当前账号没有此页面的访问权限，请联系管理员开通。" />;
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
  const ledgerSubjects = useMemo(() => products.map(toProductLedgerSubject), [products]);
  const fullPriceAccess = session.permissions.showCost && session.permissions.showProfit;

  const total = query.data?.meta?.total ?? products.length;
  const totalPages = query.data?.meta?.totalPages ?? Math.max(1, Math.ceil(total / filters.pageSize));
  useEffect(() => {if (filters.page > totalPages) onFiltersChange({...filters, page: totalPages});}, [filters, onFiltersChange, totalPages]);
  const stockUnits = query.data?.meta?.summary.stockUnits ?? products.reduce((sum, item) => sum + item.currentStock, 0);
  const stockedTemplates = query.data?.meta?.summary.stockedTemplates ?? products.filter((item) => item.currentStock > 0).length;

  const invalidate = () => invalidateErpDomains(queryClient, ["products", "state"]);
  const handleMutationError = (error: Error) => {
    if (error instanceof ApiError && error.isUnauthorized) {onAuthExpired(); return;}
    notify.error(error.message);
  };
  const saveMutation = useMutation({
    mutationFn: ({values, product}: {values: ProductTemplateFormValues; product: ProductLibraryItem | null}) => product ? productsApi.update(product.id, values, session.permissions) : productsApi.create(values, session.permissions),
    onSuccess: async (product) => {notify.success(`${productDisplayName(product)} 已保存`); setDialogOpen(false); setEditing(null); await invalidate();},
    onError: handleMutationError,
  });
  const deleteMutation = useMutation({mutationFn: (id: string) => productsApi.remove(id), onSuccess: async () => {notify.success("商品模板已删除"); setConfirmState(null); await invalidate();}, onError: handleMutationError});
  const importMutation = useMutation({mutationFn: (rows: ProductImportRow[]) => productsApi.importTemplates(rows), onSuccess: async (count) => {notify.success(`已导入 ${count} 行商品模板`); setConfirmState(null); onFiltersChange(defaultProductFilters); await invalidate();}, onError: handleMutationError});

  const openCreate = () => {setEditing(null); setDialogOpen(true); saveMutation.reset();};
  const openEdit = (product: ProductLibraryItem) => {if (!fullPriceAccess) return; setEditing(product); setDialogOpen(true); saveMutation.reset();};
  const openLedger = (product: ProductLibraryItem) => setLedgerSubject(toProductLedgerSubject(product));
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
    if (!file.name.toLowerCase().endsWith(".csv")) {notify.error("商品库仅支持 CSV；请先在 Excel/WPS 中另存为 CSV。"); return;}
    const rows = parseProductImportCsv(await file.text());
    if (!rows.length) {notify.error("没有识别到有效商品；请检查表头以及商品名称、型号、品牌列。"); return;}
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
  const exportProducts = () => download("商品库-当前页.csv", productCsv([["配件ID", "分类", "商品名称", "核心型号", "品牌", "版本/系列", "规格参数", ...(session.permissions.showCost ? ["参考回收价"] : []), ...(session.permissions.showProfit ? ["参考销售价"] : []), "当前库存", "备注"], ...products.map((item) => [item.id, item.category, productDisplayName(item), item.model, item.brand, item.version, item.vram, ...(session.permissions.showCost ? [item.refBuyPrice || 0] : []), ...(session.permissions.showProfit ? [item.refSellPrice || 0] : []), item.currentStock, item.remarks || ""])]));

  const quickStatus: QuickStatusItemData[] = [
    {icon: <Layers3 className="h-4 w-4" />, label: "模板总数", value: `${total} 款`, description: `${query.data?.categories.length || 0} 个品类`, tone: "info"},
    {icon: <PackageCheck className="h-4 w-4" />, label: "有库存模板", value: `${stockedTemplates} 款`, description: `共 ${stockUnits} 件在库`, tone: stockedTemplates ? "success" : "neutral"},
  ];
  const filterFields: ErpFilterField[] = [
    {kind: "select", key: "category", label: "商品品类", width: "w-40", value: filters.category, defaultValue: "all", options: [{value: "all", label: "全部品类"}, ...(query.data?.categories || []).map((value) => ({value, label: value}))], onChange: (category) => onFiltersChange({...filters, category, page: 1})},
    {kind: "select", key: "brand", label: "商品品牌", width: "w-40", value: filters.brand, defaultValue: "all", options: [{value: "all", label: "全部品牌"}, ...(query.data?.brands || []).map((value) => ({value, label: value}))], onChange: (brand) => onFiltersChange({...filters, brand, page: 1})},
  ];
  const table: React.ComponentProps<typeof ErpDataTable<ProductLibraryItem>> = {
    mobileRow: (item) => {
      const subtitle = [item.category, item.brand, item.model].filter(Boolean).join(" · ");
      const price = session.permissions.showCost && item.refBuyPrice ? formatCurrency(item.refBuyPrice) : undefined;
      return <ErpMobileRecordRow title={productDisplayName(item)} subtitle={subtitle} meta={`当前库存 ${item.currentStock} 件${item.version && item.version !== item.model ? ` · ${item.version}` : ""}`} amount={price} amountLabel={price ? "参考回收价" : undefined} thumbnail={<ErpEntityThumbnail name={productDisplayName(item)} imageUrl={item.imageUrls?.[0]} category={item.category} />} onOpen={fullPriceAccess ? () => openEdit(item) : undefined} />;
    },
    mobileShowDetailAction: false,
    ariaLabel: "商品规格库",
    columns,
    data: products,
    getRowId: (row) => row.id,
    loading: query.isPending,
    fetching: query.isFetching,
    error: query.error as Error | null,
    errorTitle: "商品库加载失败",
    emptyTitle: "暂无匹配商品",
    emptyDescription: filters.keyword || filters.category !== "all" || filters.brand !== "all" ? "请调整搜索或筛选条件。" : "点击新建模板创建第一条商品规格。",
    onRetry: () => void query.refetch(),
    onRowClick: fullPriceAccess ? openEdit : undefined,
    manualSorting: true,
    sorting,
    onSortingChange,
    page: filters.page,
    pageSize: filters.pageSize,
    total,
    onPageChange: (page) => onFiltersChange({...filters, page}),
    onPageSizeChange: (pageSize) => onFiltersChange({...filters, page: 1, pageSize}),
    enableColumnResizing: true,
    density: "compact",
    stickyHeader: true,
  };
  const categories = query.data?.categories || [];

  return <ErpListPage
    title="商品库"
    subtitle="维护采购、检测、库存与行情共用的商品规格模板。"
    countLabel={(count) => `${count} 款`}
    loading={query.isPending}
    loadError={Boolean(query.error && !query.data)}
    quickStatus={quickStatus}
    metrics={[
      <MetricCard key="products" label="商品模板" value={`${total} 款`} icon={<Boxes className="h-4 w-4" />} />,
      <MetricCard key="stocked" label="有库存规格" value={`${stockedTemplates} 款`} detail={`${stockUnits} 件物理库存`} icon={<PackageCheck className="h-4 w-4" />} tone="success" />,
      <MetricCard key="categories" label="品类覆盖" value={`${categories.length} 类`} detail={`${query.data?.brands.length || 0} 个品牌`} icon={<Layers3 className="h-4 w-4" />} />,
    ]}
    search={{value: filters.keyword, onChange: (keyword) => onFiltersChange({...filters, keyword, page: 1}), label: "搜索商品模板", placeholder: "商品名称、型号、品牌、版本、规格或配件 ID", phonePlaceholder: "搜索商品名、型号、品牌"}}
    filters={filterFields}
    onResetFilters={() => onFiltersChange(defaultProductFilters)}
    quickFilters={[{label: "全部", active: filters.category === "all", onSelect: () => onFiltersChange({...filters, category: "all", page: 1})}, ...categories.slice(0, 3).map((category) => ({label: category, active: filters.category === category, onSelect: () => onFiltersChange({...filters, category, page: 1})}))]}
    defaultSortLabel="默认排序"
    primaryAction={{label: "新建模板", icon: <Plus className="h-4 w-4" />, onClick: openCreate}}
    actions={[
      {label: "导入模板", icon: <Download className="h-4 w-4" />, onClick: downloadTemplate},
      {label: "CSV 导入", icon: <Upload className="h-4 w-4" />, onClick: () => importRef.current?.click(), disabled: importMutation.isPending},
      {label: "导出", icon: <Download className="h-4 w-4" />, onClick: exportProducts},
    ]}
    onRefresh={() => void query.refetch()}
    refreshing={query.isFetching}
    resultsLabel="全部商品模板"
    tableTitle="商品规格列表"
    table={table}
    tableDensity="compact"
    phonePageSizeOptions={[10, 20, 50]}
    tableNotice={!fullPriceAccess ? <div className="rounded-[var(--erp-radius-md)] bg-[var(--erp-color-warning-soft)] px-4 py-3 text-xs text-[var(--erp-color-warning)]">当前账号缺少完整成本或利润权限：列表已脱敏，已有模板编辑入口被禁用，避免用不可见的 0 覆盖真实价格；新建模板仍按当前字段权限提交。</div> : undefined}
    overlayOpen={Boolean(dialogOpen || confirmState || ledgerSubject)}
    overlays={<>
      <input ref={importRef} type="file" accept=".csv,text/csv" className="sr-only" onChange={(event) => {const file = event.target.files?.[0]; if (file) void onImportFile(file); event.target.value = "";}} />
      <ErpProductTemplateDialog open={dialogOpen} product={editing} showCost={session.permissions.showCost} showProfit={session.permissions.showProfit} pending={saveMutation.isPending} error={saveMutation.error instanceof Error ? saveMutation.error.message : undefined} onOpenChange={(open) => {setDialogOpen(open); if (!open) setEditing(null);}} onSubmit={async (values) => {await saveMutation.mutateAsync({values, product: editing});}} />
      <ConfirmationDialog state={confirmState} pending={deleteMutation.isPending || importMutation.isPending} onClose={() => setConfirmState(null)} onConfirm={() => {if (confirmState?.kind === "delete") deleteMutation.mutate(confirmState.product.id); if (confirmState?.kind === "import") importMutation.mutate(confirmState.rows);}} />
      <ErpProductLedgerDrawer open={Boolean(ledgerSubject)} subject={ledgerSubject} subjects={ledgerSubjects} onSubjectChange={setLedgerSubject} filters={productLedger.filters} page={productLedger.query.data} loading={productLedger.query.isPending} fetching={productLedger.query.isFetching} error={productLedger.query.error as Error | null} onRetry={() => {void productLedger.query.refetch();}} onFiltersChange={productLedger.updateFilter} onResetFilters={productLedger.clearFilters} onPageChange={productLedger.changePage} onPageSizeChange={productLedger.changePageSize} onOpenChange={(open) => {if (!open) setLedgerSubject(null);}} onOpenDocument={openProductLedgerDocument} />
    </>}
  />;
}

function MetricCard({label, value, detail, icon, tone = "info"}: {label: string; value: string; detail?: string; icon: ReactNode; tone?: "info" | "success" | "warning" | "neutral"}) {
  return <ErpMetricCard label={label} value={value} detail={detail} icon={icon} tone={tone} />;
}

function ConfirmationDialog({state, pending, onClose, onConfirm}: {state: {kind: "delete"; product: ProductLibraryItem} | {kind: "import"; rows: ProductImportRow[]; overwrite: number} | null; pending: boolean; onClose: () => void; onConfirm: () => void}) {
  const deleting = state?.kind === "delete";
  return <ErpConfirmDialog open={Boolean(state)} onOpenChange={(open) => {if (!open && !pending) onClose();}} title={deleting ? "删除商品模板" : "导入将覆盖已有模板"} description={deleting ? "已被库存或单据使用的模板无法删除。" : `本次共识别 ${state?.kind === "import" ? state.rows.length : 0} 行，其中 ${state?.kind === "import" ? state.overwrite : 0} 个配件 ID 已存在。继续将覆盖这些模板，但不会改写历史单据中的名称。`} documentName={deleting && state?.kind === "delete" ? productDisplayName(state.product) : undefined} confirmLabel={deleting ? "确认删除" : "继续导入"} pendingLabel="处理中…" confirmVariant={deleting ? "danger" : "primary"} pending={pending} onConfirm={onConfirm} />;
}
