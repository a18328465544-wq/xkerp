import {keepPreviousData, useQuery, type UseQueryResult} from "@tanstack/react-query";
import {Boxes, Filter, ImageOff, LockKeyhole, PackageCheck, RefreshCw, RotateCcw, Search, ShieldAlert, SlidersHorizontal, Sparkles, Warehouse} from "lucide-react";
import {useEffect, useMemo, useState, type ReactNode} from "react";
import {Button, Card, CardContent, Input, Select} from "@/src/components/ui";
import {ErpColumnVisibilityMenu, ErpDataTable, ErpDetailDrawer, ErpEmptyState, ErpFilterBar, ErpLoadingState, ErpPageContent, ErpPageError, ErpPageHeader, ErpStatusBadge, ErpWarehousePageFrame, MetricsRegion, type QuickStatusItemData} from "@/src/components/common";
import {InventoryStatus, ProfitDisplay} from "@/src/components/domain";
import {queryKeys, inventoryApi} from "@/src/services/api";
import {createCapabilities, useAuth} from "@/src/app/auth";
import {useTablePreferences} from "@/src/hooks/useTablePreferences";
import {useUrlSearchState} from "@/src/hooks/useUrlSearchState";
import {formatCurrency} from "@/src/lib/format";
import type {InventoryFilters, InventoryListItem, InventoryModelSummary, InventorySummary, InventoryView} from "@/src/types/inventory";
import {createInventoryColumns} from "@/src/features/inventory/inventory.columns";
import {createInventoryModelColumns} from "@/src/features/inventory/inventory.model-columns";
import {defaultInventoryFilters, inventoryFiltersToSearch, inventorySummaryFilters, parseInventoryFilters} from "@/src/features/inventory/inventory.filters";
import type {VisibilityState, RowSelectionState, SortingState} from "@tanstack/react-table";
import type {PermissionModel} from "@/src/services/api/endpoints/auth";

const emptyInventoryVisibility: VisibilityState = {};

type InventoryUrlState = {filters: InventoryFilters; detailId: string | null; view: InventoryView};

function parseInventoryUrlState(search: string): InventoryUrlState {
  const params = new URLSearchParams(search);
  return {filters: parseInventoryFilters(search), detailId: params.get("detail"), view: params.get("view") === "models" ? "models" : "cards"};
}

function serializeInventoryUrlState(state: InventoryUrlState) {
  const params = inventoryFiltersToSearch(state.filters);
  if (state.detailId) params.set("detail", state.detailId);
  if (state.view === "models") params.set("view", "models");
  return params;
}

function useInventoryUrlState() {
  const {value, commit} = useUrlSearchState<InventoryUrlState>({defaultValue: {filters: defaultInventoryFilters, detailId: null, view: "cards"}, parse: parseInventoryUrlState, serialize: serializeInventoryUrlState});
  return {
    filters: value.filters,
    detailId: value.detailId,
    view: value.view,
    commitFilters: (filters: InventoryFilters) => commit({filters, detailId: value.detailId, view: value.view}),
    commitDetail: (detailId: string | null) => commit({filters: value.filters, detailId, view: value.view}),
    commitView: (view: InventoryView) => commit({filters: value.filters, detailId: null, view}),
    commitState: (state: InventoryUrlState) => commit(state),
  };
}

export function InventoryListPage() {
  const {session} = useAuth();
  if (!session) return <Card><ErpLoadingState title="正在验证库存权限" description="请稍候，正在读取当前账号权限。" /></Card>;
  const {filters, commitFilters, detailId, commitDetail, view, commitView, commitState} = useInventoryUrlState();
  const permissions = session.permissions;
  const accessGranted = createCapabilities(session).menu("inventory");
  const listEnabled = accessGranted;
  const listQuery = useQuery({
    queryKey: queryKeys.inventory.list(filters),
    queryFn: ({signal}) => inventoryApi.list(filters, permissions, signal),
    enabled: listEnabled && view === "cards",
    placeholderData: keepPreviousData,
    retry: false,
  });
  const summaryFilters = useMemo(() => inventorySummaryFilters(filters), [filters]);
  const modelSummaryQuery = useQuery({
    queryKey: queryKeys.inventory.models(summaryFilters),
    queryFn: ({signal}) => inventoryApi.modelSummaries(summaryFilters, permissions, signal),
    enabled: listEnabled,
    placeholderData: keepPreviousData,
    retry: false,
  });
  const detailQuery = useQuery({
    queryKey: queryKeys.inventory.detail(detailId || ""),
    queryFn: ({signal}) => inventoryApi.detail(detailId || "", permissions, signal),
    enabled: listEnabled && view === "cards" && Boolean(detailId),
    retry: false,
  });

  if (!accessGranted) return <ErpPageError title="当前账号没有库存入口权限" description="服务器已拒绝库存菜单访问（403）。请联系管理员授权后再试。" />;

  const rows = listQuery.data?.data || [];
  const openDetail = (item: InventoryListItem) => commitDetail(item.id);
  const openCardsForModel = (row: InventoryModelSummary) => commitState({filters: {...filters, keyword: row.productName, page: 1}, detailId: null, view: "cards"});
  return <InventoryPageContent
    filters={filters}
    commitFilters={commitFilters}
    listQuery={listQuery}
    modelSummaryQuery={modelSummaryQuery}
    detailQuery={detailQuery}
    detailId={detailId}
    onDetail={openDetail}
    onCloseDetail={() => commitDetail(null)}
    rows={rows}
    permissions={permissions}
    onRefresh={() => { void Promise.all([listQuery.refetch(), modelSummaryQuery.refetch()]); }}
    view={view}
    onChangeView={commitView}
    onOpenCards={openCardsForModel}
    userId={session.user.id}
  />;
}

function InventoryPageContent({filters, commitFilters, listQuery, modelSummaryQuery, detailQuery, detailId, onDetail, onCloseDetail, rows, permissions, onRefresh, view, onChangeView, onOpenCards, userId}: {
  filters: InventoryFilters;
  commitFilters: (filters: InventoryFilters) => void;
  listQuery: ReturnType<typeof useQuery<Awaited<ReturnType<typeof inventoryApi.list>>>>;
  modelSummaryQuery: UseQueryResult<InventoryModelSummary[], Error>;
  detailQuery: ReturnType<typeof useQuery<Awaited<ReturnType<typeof inventoryApi.detail>>>>;
  detailId: string | null;
  onDetail: (item: InventoryListItem) => void;
  onCloseDetail: () => void;
  rows: InventoryListItem[];
  permissions: PermissionModel;
  onRefresh: () => void;
  view: InventoryView;
  onChangeView: (view: InventoryView) => void;
  onOpenCards: (row: InventoryModelSummary) => void;
  userId: string;
}) {
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});
  const {columnVisibility, setColumnVisibility, density, setDensity} = useTablePreferences<VisibilityState>({feature: "inventory", userId, defaultVisibility: emptyInventoryVisibility});
  const {columnVisibility: modelColumnVisibility, setColumnVisibility: setModelColumnVisibility, density: modelDensity, setDensity: setModelDensity} = useTablePreferences<VisibilityState>({feature: "inventory-models", userId, defaultVisibility: emptyInventoryVisibility});
  const modelRows = modelSummaryQuery.data || [];
  const summary = useMemo(() => summarizeInventoryModelRows(modelRows, permissions.showCost), [modelRows, permissions.showCost]);
  const modelPageStart = (filters.page - 1) * filters.pageSize;
  const modelPageRows = modelRows.slice(modelPageStart, modelPageStart + filters.pageSize);
  const selectedCount = Object.values(rowSelection).filter(Boolean).length;
  const activeFilterCount = countActiveInventoryFilters(filters);
  const quickStatus: QuickStatusItemData[] = [
    {icon: <Warehouse className="h-4 w-4" />, label: "库存状态", value: "已连接", description: "库存与库位可查询", tone: "success"},
    {icon: <ShieldAlert className="h-4 w-4" />, label: "待检测", value: modelSummaryQuery.data ? `${summary.pendingCount} 件` : "—", description: "检测前库存", tone: summary.pendingCount ? "warning" : "success"},
    {icon: <SlidersHorizontal className="h-4 w-4" />, label: "筛选状态", value: activeFilterCount ? `${activeFilterCount} 项` : "全部", description: "筛选状态已同步 URL", tone: activeFilterCount ? "info" : "neutral"},
    {icon: <LockKeyhole className="h-4 w-4" />, label: "成本权限", value: permissions.showCost ? "可查看" : "已隐藏", description: permissions.showCost ? "按账号权限展示" : "服务器已隐藏", tone: permissions.showCost ? "success" : "neutral"},
  ];
  const columns = useMemo(() => createInventoryColumns({showCost: permissions.showCost, showProfit: permissions.showProfit, onDetail}), [onDetail, permissions.showCost, permissions.showProfit]);
  const modelColumns = useMemo(() => createInventoryModelColumns({showCost: permissions.showCost, showProfit: permissions.showProfit, onOpenCards}), [onOpenCards, permissions.showCost, permissions.showProfit]);
  const updateFilter = (patch: Partial<InventoryFilters>) => commitFilters({...filters, ...patch, page: 1});
  const serverToColumnSort: Record<InventoryFilters["sortKey"], string> = {id: "id", product: "product", cost: "costPrice", profit: "estimatedProfit", days: "inventoryDays", status: "status", warehouseLocation: "warehouseLocation", entryTime: "entryTime"};
  const columnToServerSort: Record<string, InventoryFilters["sortKey"]> = {id: "id", product: "product", costPrice: "cost", estimatedProfit: "profit", inventoryDays: "days", status: "status", warehouseLocation: "warehouseLocation", entryTime: "entryTime"};
  const sorting: SortingState = filters.sortKey ? [{id: serverToColumnSort[filters.sortKey], desc: filters.sortDirection === "desc"}] : [];
  const onSortingChange = (updater: SortingState | ((old: SortingState) => SortingState)) => {
    const next = typeof updater === "function" ? updater(sorting) : updater;
    const first = next[0];
    commitFilters({...filters, sortKey: columnToServerSort[first?.id || ""] || "entryTime", sortDirection: first?.desc ? "desc" : "asc", page: 1});
  };
  const unsupported = ["model", "condition", "entryStart", "entryEnd"];

  useEffect(() => setRowSelection({}), [filters]);

  return <>
    <ErpWarehousePageFrame>
      <ErpPageHeader title="库存中心" subtitle="按 SN、型号、库位和状态快速定位库存；数据视图只切换下方表格。" quickStatus={quickStatus} actions={<><InventoryViewSwitcher view={view} onChange={onChangeView} /><Button variant="secondary" onClick={onRefresh} disabled={listQuery.isFetching || modelSummaryQuery.isFetching}><RefreshCw className={listQuery.isFetching || modelSummaryQuery.isFetching ? "h-4 w-4 animate-spin" : "h-4 w-4"} />刷新</Button><Button variant="primary" disabled title="新增库存接口将在录单纵向切片中接入"><PackageCheck className="h-4 w-4" />新增库存</Button></>} />
      <ErpPageContent className="space-y-[var(--erp-page-gap)]">
      <MetricsRegion>
        <MetricCard label="库存总数" value={modelSummaryQuery.data ? `${summary.totalCount} 件` : "—"} detail="按当前筛选" icon={<Boxes className="h-4 w-4" />} />
        <MetricCard label="在库数量" value={modelSummaryQuery.data ? `${summary.availableCount} 件` : "—"} detail="已入库 / 已上架" icon={<Warehouse className="h-4 w-4" />} />
        <MetricCard label="待检测" value={modelSummaryQuery.data ? `${summary.pendingCount} 件` : "—"} detail="待检测 / 检测中" tone="warning" icon={<ShieldAlert className="h-4 w-4" />} />
        <MetricCard label="已预订" value={modelSummaryQuery.data ? `${summary.lockedCount} 件` : "—"} detail="已锁定库存" icon={<LockKeyhole className="h-4 w-4" />} />
        {permissions.showCost ? <MetricCard label="库存总成本" value={summary.totalCost === undefined ? "—" : formatCurrency(summary.totalCost)} detail="按接口摘要汇总" icon={<Boxes className="h-4 w-4" />} /> : <MetricCard label="成本信息" value="无权限" detail="服务器已隐藏成本字段" tone="muted" icon={<LockKeyhole className="h-4 w-4" />} />}
      </MetricsRegion>
      <ErpFilterBar actions={<Button variant="ghost" size="sm" onClick={() => commitFilters(defaultInventoryFilters)}><RotateCcw className="h-4 w-4" />重置筛选</Button>}>
        <div className="relative min-w-[240px] flex-1"><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--erp-color-text-muted)]" /><Input className="pl-9" value={filters.keyword} onChange={(event) => updateFilter({keyword: event.target.value})} placeholder="搜索 SN、商品、品牌、型号" aria-label="搜索库存" /></div>
        <FilterInput value={filters.brand} onChange={(value) => updateFilter({brand: value})} label="品牌" placeholder="品牌" />
        <FilterInput value={filters.warehouseLocation} onChange={(value) => updateFilter({warehouseLocation: value})} label="仓库 / 库位" placeholder="仓位" />
        <FilterSelect value={filters.status} onChange={(value) => updateFilter({status: value, inspectionStatus: ""})} label="库存 / 检测状态" placeholder="全部状态" options={["待检测", "检测中", "已入库", "已上架", "已锁定", "已售出", "维修中", "售后中", "已报废"]} />
        <FilterSelect value={filters.risk} onChange={(value) => updateFilter({risk: value as InventoryFilters["risk"]})} label="风险" placeholder="全部风险" options={["high", "mined", "upturned"]} optionLabels={{high: "高风险", mined: "疑似矿卡", upturned: "倒挂价"}} />
        <Input className="w-28" value={filters.model} disabled title="型号精确筛选待后端接口补充" placeholder="型号（待补充）" aria-label="型号筛选（待补充）" />
        <Input className="w-24" value={filters.condition} disabled title="成色筛选待后端接口补充" placeholder="成色（待补充）" aria-label="成色筛选（待补充）" />
        <label className="flex h-10 items-center gap-2 rounded-[var(--erp-radius-md)] border border-[var(--erp-color-border)] bg-[var(--erp-color-surface)] px-3 text-xs text-[var(--erp-color-text-secondary)]"><input type="checkbox" checked={filters.includeSold} onChange={(event) => updateFilter({includeSold: event.target.checked})} />包含已售出</label>
      </ErpFilterBar>
      <div className="flex flex-wrap items-center gap-2 text-xs text-[var(--erp-color-text-muted)]"><SlidersHorizontal className="h-3.5 w-3.5" /><span>暂不可服务端筛选：</span>{unsupported.map((key) => <ErpStatusBadge key={key} label={key === "model" ? "型号" : key === "condition" ? "成色" : "入库日期"} tone="neutral" />)}<span>关键字仍可搜索型号和 SN；其余筛选将在后端契约补齐后启用。</span></div>
      {view === "models" ? <InventoryModelTableRegion filters={filters} commitFilters={commitFilters} modelSummaryQuery={modelSummaryQuery} rows={modelRows} pageRows={modelPageRows} columns={modelColumns} columnVisibility={modelColumnVisibility} setColumnVisibility={setModelColumnVisibility} density={modelDensity} setDensity={setModelDensity} onOpenCards={onOpenCards} /> : <>
        {selectedCount > 0 && <Card className="flex flex-wrap items-center justify-between gap-3 border-[var(--erp-color-border-strong)] bg-[var(--erp-color-info-soft)] px-4 py-3"><span className="text-sm font-semibold text-[var(--erp-color-primary)]">已选择 {selectedCount} 条库存</span><div className="flex items-center gap-2"><Button size="sm" variant="ghost" onClick={() => setRowSelection({})}>清除选择</Button><Button size="sm" variant="secondary" disabled title="批量编辑权限和字段契约待确认">批量操作（待权限契约）</Button></div></Card>}
        <div className="flex flex-wrap items-center justify-between gap-3"><div className="flex items-center gap-2 text-xs text-[var(--erp-color-text-secondary)]"><Boxes className="h-4 w-4 text-[var(--erp-color-primary)]" />服务端分页 · {listQuery.data?.meta.total ?? 0} 条</div><div className="flex items-center gap-2"><ErpColumnVisibilityMenu columns={columns} visibility={columnVisibility} onVisibilityChange={setColumnVisibility} exclude={["select", "actions"]} /> <div className="inline-flex rounded-[var(--erp-radius-md)] border border-[var(--erp-color-border)] bg-[var(--erp-color-surface)] p-0.5"><Button type="button" size="sm" variant={density === "comfortable" ? "secondary" : "ghost"} onClick={() => setDensity("comfortable")}>舒适</Button><Button type="button" size="sm" variant={density === "compact" ? "secondary" : "ghost"} onClick={() => setDensity("compact")}>紧凑</Button></div></div></div>
        <ErpDataTable columns={columns} data={rows} getRowId={(row) => row.id} loading={listQuery.isPending} fetching={listQuery.isFetching} error={listQuery.error as Error | null} errorTitle="库存加载失败" onRetry={() => void listQuery.refetch()} onRowClick={onDetail} manualSorting sorting={sorting} onSortingChange={onSortingChange} page={filters.page} pageSize={filters.pageSize} total={listQuery.data?.meta.total} onPageChange={(page) => commitFilters({...filters, page})} onPageSizeChange={(pageSize) => commitFilters({...filters, page: 1, pageSize})} columnVisibility={columnVisibility} onColumnVisibilityChange={setColumnVisibility} rowSelection={rowSelection} onRowSelectionChange={setRowSelection} enableSelection enableColumnResizing density={density} stickyHeader virtualized={rows.length >= 50} />
      </>}
      </ErpPageContent>
    </ErpWarehousePageFrame>
    <ErpDetailDrawer open={Boolean(detailId)} onOpenChange={(open) => {if (!open) onCloseDetail();}} title={detailQuery.data?.item?.productName || detailId || "库存详情"} description={detailQuery.data?.fallback ? "通过列表接口兼容查询，专用详情接口待补充。" : undefined}>
      {detailQuery.isPending ? <ErpLoadingState title="正在加载库存详情" /> : detailQuery.error ? <ErpEmptyState title="详情加载失败" description={(detailQuery.error as Error).message} action={<Button size="sm" onClick={() => void detailQuery.refetch()}>重试</Button>} /> : detailQuery.data?.item ? <InventoryDetail item={detailQuery.data.item} showCost={permissions.showCost} showProfit={permissions.showProfit} /> : <ErpEmptyState title="库存记录不存在" description="该记录可能已被删除或当前账号无权访问。" />}
    </ErpDetailDrawer>
  </>;
}

function InventoryModelTableRegion({filters, commitFilters, modelSummaryQuery, rows, pageRows, columns, columnVisibility, setColumnVisibility, density, setDensity, onOpenCards}: {
  filters: InventoryFilters;
  commitFilters: (filters: InventoryFilters) => void;
  modelSummaryQuery: UseQueryResult<InventoryModelSummary[], Error>;
  rows: InventoryModelSummary[];
  pageRows: InventoryModelSummary[];
  columns: ReturnType<typeof createInventoryModelColumns>;
  columnVisibility: VisibilityState;
  setColumnVisibility: (updater: VisibilityState | ((old: VisibilityState) => VisibilityState)) => void;
  density: "comfortable" | "compact";
  setDensity: (density: "comfortable" | "compact") => void;
  onOpenCards: (row: InventoryModelSummary) => void;
}) {
  return <>
    <div className="flex flex-wrap items-center justify-between gap-3"><div className="flex items-center gap-2 text-xs text-[var(--erp-color-text-secondary)]"><Boxes className="h-4 w-4 text-[var(--erp-color-primary)]" />服务端型号聚合 · {rows.length} 个型号</div><div className="flex items-center gap-2"><ErpColumnVisibilityMenu columns={columns} visibility={columnVisibility} onVisibilityChange={setColumnVisibility} exclude={["select", "actions"]} /><div className="inline-flex rounded-[var(--erp-radius-md)] border border-[var(--erp-color-border)] bg-[var(--erp-color-surface)] p-0.5"><Button type="button" size="sm" variant={density === "comfortable" ? "secondary" : "ghost"} onClick={() => setDensity("comfortable")}>舒适</Button><Button type="button" size="sm" variant={density === "compact" ? "secondary" : "ghost"} onClick={() => setDensity("compact")}>紧凑</Button></div></div></div>
    <ErpDataTable columns={columns} data={pageRows} getRowId={(row) => row.key} loading={modelSummaryQuery.isPending} fetching={modelSummaryQuery.isFetching} error={modelSummaryQuery.error as Error | null} errorTitle="型号库存加载失败" emptyTitle="暂无型号库存" emptyDescription="当前筛选条件下没有可聚合的库存。" onRetry={() => void modelSummaryQuery.refetch()} onRowClick={onOpenCards} page={filters.page} pageSize={filters.pageSize} total={rows.length} onPageChange={(page) => commitFilters({...filters, page})} onPageSizeChange={(pageSize) => commitFilters({...filters, page: 1, pageSize})} columnVisibility={columnVisibility} onColumnVisibilityChange={setColumnVisibility} enableColumnResizing density={density} stickyHeader virtualized={pageRows.length >= 50} />
  </>;
}

function InventoryViewSwitcher({view, onChange}: {view: InventoryView; onChange: (view: InventoryView) => void}) {
  return <div role="group" aria-label="库存视图" className="inline-flex rounded-[var(--erp-radius-md)] border border-[var(--erp-color-border)] bg-[var(--erp-color-surface-muted)] p-0.5">
    <Button type="button" aria-pressed={view === "cards"} size="sm" variant={view === "cards" ? "secondary" : "ghost"} onClick={() => onChange("cards")}>单卡 / SN</Button>
    <Button type="button" aria-pressed={view === "models"} size="sm" variant={view === "models" ? "secondary" : "ghost"} onClick={() => onChange("models")}>型号汇总</Button>
  </div>;
}

function InventoryDetail({item, showCost, showProfit}: {item: InventoryListItem; showCost: boolean; showProfit: boolean}) {
  const details: Array<[string, string | undefined]> = [
    ["SN / 库存编号", item.serialNumber], ["品牌 / 型号", `${item.brand} ${item.model}`], ["显存 / 版本", `${item.vram || "—"} ${item.version || ""}`.trim()], ["成色", item.condition], ["仓库 / 库位", item.warehouse], ["检测状态", item.inspectionStatus], ["库存状态", item.inventoryStatus], ["入库时间", item.entryTime || "—"], ["库存龄", `${item.inventoryDays} 天`], ["来源", item.sourceType || "—"], ["供应商 / 客户", item.supplierName || item.buyerName || "—"],
  ];
  return <div className="space-y-6">
    <section className="space-y-3">
      <div className="flex h-36 items-center justify-center overflow-hidden rounded-[var(--erp-radius-lg)] bg-[var(--erp-color-surface-muted)]">{item.imageUrl ? <img src={item.imageUrl} alt={item.productName} className="h-full max-w-full object-contain" /> : <div className="flex flex-col items-center gap-2 text-xs text-[var(--erp-color-text-muted)]"><ImageOff className="h-7 w-7" />接口未返回商品图片</div>}</div>
      <div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="truncate text-lg font-bold text-[var(--erp-color-text)]">{item.productName}</p><p className="mt-1 text-xs text-[var(--erp-color-text-muted)]">{item.category}</p></div><InventoryStatus status={item.inventoryStatus} /></div>
    </section>
    <InventoryDetailSection title="基础信息"><div className="grid grid-cols-1 gap-2 sm:grid-cols-2">{details.map(([label, value]) => <DetailField key={label} label={label} value={value} />)}</div></InventoryDetailSection>
    {showCost && <InventoryDetailSection title="成本与售价"><div className="grid grid-cols-2 gap-4 sm:grid-cols-3"><DetailAmount label="成本价" value={item.costPrice} /><DetailAmount label="当前售价" value={item.estimatedSellPrice} /><div><p className="text-xs text-[var(--erp-color-text-muted)]">预计利润</p><p className="mt-1 text-base"><ProfitDisplay value={showProfit ? item.estimatedProfit : undefined} /></p></div></div></InventoryDetailSection>}
    <InventoryDetailSection title="库存属性"><div className="flex flex-wrap gap-2"><ErpStatusBadge label={item.inWarranty ? "质保中" : "无质保"} tone={item.inWarranty ? "success" : "neutral"} />{item.repaired && <ErpStatusBadge label="维修记录" tone="warning" />}{item.gpuRisk && <ErpStatusBadge label="风险库存" tone="danger" />}{item.fullBox && <ErpStatusBadge label="全套包装" tone="info" />}</div>{item.remarks && <p className="mt-3 text-xs leading-5 text-[var(--erp-color-text-secondary)]">备注：{item.remarks}</p>}</InventoryDetailSection>
    <section className="rounded-[var(--erp-radius-lg)] border border-dashed border-[var(--erp-color-border)] bg-[var(--erp-color-surface-muted)] p-4"><div className="flex items-center gap-2 text-sm font-semibold"><Sparkles className="h-4 w-4 text-[var(--erp-color-primary)]" />AI 分析<ErpStatusBadge label="准备中" tone="neutral" /></div><p className="mt-2 text-xs text-[var(--erp-color-text-secondary)]">本轮只预留入口，不生成假建议、不调用 AI 接口。</p><Button className="mt-3" size="sm" variant="secondary" disabled><Sparkles className="h-3.5 w-3.5" />暂未接入</Button></section>
  </div>;
}

function InventoryDetailSection({title, children}: {title: string; children: ReactNode}) { return <section className="rounded-[var(--erp-radius-lg)] border border-[var(--erp-color-border)] bg-[var(--erp-color-surface)] p-4"><h3 className="text-sm font-bold text-[var(--erp-color-text)]">{title}</h3><div className="mt-3">{children}</div></section>; }
function DetailField({label, value}: {label: string; value: string | undefined}) { return <div className="rounded-[var(--erp-radius-md)] bg-[var(--erp-color-surface-muted)] p-3"><p className="text-[11px] text-[var(--erp-color-text-muted)]">{label}</p><p className="mt-1 break-words text-sm font-semibold text-[var(--erp-color-text)]">{value || "—"}</p></div>; }
function DetailAmount({label, value}: {label: string; value: number | undefined}) { return <div><p className="text-xs text-[var(--erp-color-text-muted)]">{label}</p><p className="mt-1 font-mono text-base font-semibold">{value === undefined ? "—" : formatCurrency(value)}</p></div>; }

function MetricCard({label, value, detail, icon, tone = "normal"}: {label: string; value: string; detail: string; icon: ReactNode; tone?: "normal" | "warning" | "muted"}) { return <Card><CardContent className="flex min-h-[112px] items-start justify-between p-4"><div><p className="text-xs font-semibold text-[var(--erp-color-text-secondary)]">{label}</p><p className={tone === "warning" ? "mt-2 font-mono text-2xl font-bold text-[var(--erp-color-warning)]" : tone === "muted" ? "mt-2 text-xl font-bold text-[var(--erp-color-text-muted)]" : "mt-2 font-mono text-2xl font-bold text-[var(--erp-color-text)]"}>{value}</p><p className="mt-1 text-xs text-[var(--erp-color-text-muted)]">{detail}</p></div><span className="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--erp-color-info-soft)] text-[var(--erp-color-primary)]">{icon}</span></CardContent></Card>; }

function summarizeInventoryModelRows(rows: InventoryModelSummary[], showCost: boolean): InventorySummary {
  const summary = rows.reduce<InventorySummary>((result, row) => ({
    totalCount: result.totalCount + row.totalCount,
    availableCount: result.availableCount + row.availableCount,
    pendingCount: result.pendingCount + row.pendingCount,
    lockedCount: result.lockedCount + row.lockedCount,
    soldCount: result.soldCount + row.soldCount,
    totalCost: result.totalCost === undefined || row.totalCost === undefined ? undefined : result.totalCost + row.totalCost,
    totalEstSell: result.totalEstSell === undefined || row.totalEstSell === undefined ? undefined : result.totalEstSell + row.totalEstSell,
  }), {totalCount: 0, availableCount: 0, pendingCount: 0, lockedCount: 0, soldCount: 0, ...(showCost ? {totalCost: 0, totalEstSell: 0} : {})});
  return summary;
}

function FilterSelect({value, onChange, label, placeholder, options = [], optionLabels = {}}: {value: string; onChange: (value: string) => void; label: string; placeholder: string; options?: string[]; optionLabels?: Record<string, string>}) { const selectOptions = options.map((option) => ({value: option, label: optionLabels[option] || option})); return <label className="relative"><span className="sr-only">{label}</span><Select aria-label={label} className="min-w-[132px]" value={value} onValueChange={onChange} options={selectOptions} placeholder={placeholder} /></label>; }

function FilterInput({value, onChange, label, placeholder}: {value: string; onChange: (value: string) => void; label: string; placeholder: string}) { return <label className="relative"><span className="sr-only">{label}</span><Input className="w-28" value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} aria-label={label} /></label>; }

function countActiveInventoryFilters(filters: InventoryFilters) {
  return [filters.keyword, filters.brand, filters.model, filters.warehouseLocation, filters.condition, filters.inspectionStatus, filters.status, filters.entryStart, filters.entryEnd, filters.risk, filters.minStorageDays, filters.maxStorageDays, filters.minProfitMargin].filter(Boolean).length + (filters.includeSold ? 1 : 0);
}
