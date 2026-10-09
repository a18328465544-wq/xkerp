import {useState, type ReactNode} from "react";
import type {ColumnDef, VisibilityState} from "@tanstack/react-table";
import {ArrowDown, ArrowUp, ChevronDown, Filter, RefreshCw, RotateCcw, SlidersHorizontal} from "lucide-react";
import {Button, Select} from "@/src/components/ui";
import {useErpPhone} from "@/src/hooks/useErpViewport";
import {cn} from "@/src/lib/cn";
import {DashboardSection, MetricsRegion} from "../DashboardShell";
import {ErpColumnVisibilityMenu} from "../ErpColumnVisibilityMenu";
import {ErpDataTable, type ErpDataTableProps, type ErpTableDensity} from "../ErpDataTable";
import {ErpDialogShell} from "../ErpDialogShell";
import {ErpFilterBar} from "../ErpFilterBar";
import {ErpMobileActionDock} from "../ErpMobileActionDock";
import {ErpMobileSummary} from "../ErpMobileSummary";
import {ErpPageContent, ErpPageToolbar, ErpTableResultsBar} from "../ErpPageFrame";
import {ErpListPageFrame} from "../ErpPageFrames";
import {ErpPageHeader} from "../ErpPageHeader";
import type {QuickStatusItemData} from "../ErpQuickStatus";
import {ErpSearchInput} from "../ErpSearchInput";
import {ErpStatusBadge} from "../ErpStatusBadge";
import {countActiveErpFilterFields, ErpFilterFields, type ErpFilterField} from "../filters/ErpFilterFields";

export interface ErpListPageAction {
  label: string;
  icon?: ReactNode;
  onClick: () => void;
  disabled?: boolean;
}

export interface ErpListQuickFilter {
  label: string;
  active: boolean;
  onSelect: () => void;
}

export interface ErpListColumnSettings<TData> {
  columns: ColumnDef<TData, unknown>[];
  visibility: VisibilityState;
  onVisibilityChange: (updater: VisibilityState | ((old: VisibilityState) => VisibilityState)) => void;
  density: ErpTableDensity;
  onDensityChange: (density: ErpTableDensity) => void;
}

export type ErpListTableProps<TData> = Omit<ErpDataTableProps<TData>, "surface" | "mobilePagination" | "mobileToolbar" | "density" | "columnVisibility" | "onColumnVisibilityChange" | "phone" | "compactViewport">;

export interface ErpListPageProps<TData> {
  title: string;
  /** Shorter phone title, e.g. 「客户」 for 「客户档案」. */
  phoneTitle?: string;
  subtitle?: string;
  /** Result count under the phone title; the only place the count appears on phones. */
  countLabel: (total: number) => string;
  loading?: boolean;
  loadError?: boolean;
  /** Work items only (M17). */
  quickStatus?: QuickStatusItemData[];
  /** Desktop metric cards, at most 4 (M18). Phones keep them behind a summary toggle. */
  metrics?: ReactNode[];
  /** Section tabs shown under the header on every viewport. */
  tabs?: ReactNode;
  search: {value: string; onChange: (value: string) => void; label: string; placeholder: string; phonePlaceholder?: string};
  filters?: readonly ErpFilterField[];
  onResetFilters?: () => void;
  /** Phone quick filters beside the sort button, at most 4 (M13). */
  quickFilters?: readonly ErpListQuickFilter[];
  /** Sort button label while the list uses its default order. */
  defaultSortLabel?: string;
  primaryAction?: ErpListPageAction;
  /** Secondary actions: desktop filter bar, phone filter sheet. */
  actions?: readonly ErpListPageAction[];
  onRefresh?: () => void;
  refreshing?: boolean;
  /** Desktop results label when no filter is active, e.g. 「全部客户」. */
  resultsLabel?: string;
  /** Keep the existing desktop result bar wording; undefined uses the template default, null hides its summary. */
  desktopResultsSummary?: ReactNode;
  tableTitle: string;
  tableDescription?: string;
  /** Set false when the legacy desktop table had no titled DashboardSection wrapper. */
  desktopTableSection?: boolean;
  /** Preserve page-specific phone page-size choices where they differ from the default. */
  phonePageSizeOptions?: readonly number[];
  columnSettings?: ErpListColumnSettings<TData>;
  table: ErpListTableProps<TData>;
  /** Extra read-only content at the end of the phone filter sheet. */
  sheetExtra?: ReactNode;
  /** Drawers and dialogs owned by the page. */
  overlays?: ReactNode;
  /** True while a page overlay is open; hides the phone dock (M24). */
  overlayOpen?: boolean;
  className?: string;
  /** @internal 仅测试用 */
  phone?: boolean;
}

export function createErpPageSizeOptions(values: readonly number[]) {
  return values.map((value) => ({value: String(value), label: `${value} 条/页`}));
}

/**
 * List page template (MOBILE_UI_RULES M13). Pages describe what the list has;
 * this template decides how it is laid out on desktop and on phones.
 */
export function ErpListPage<TData>({
  title,
  phoneTitle = title,
  subtitle,
  countLabel,
  loading = false,
  loadError = false,
  quickStatus,
  metrics,
  tabs,
  search,
  filters = [],
  onResetFilters,
  quickFilters = [],
  defaultSortLabel = "排序",
  primaryAction,
  actions = [],
  onRefresh,
  refreshing = false,
  resultsLabel = "全部记录",
  desktopResultsSummary,
  tableTitle,
  tableDescription,
  desktopTableSection = true,
  phonePageSizeOptions = [20, 50, 100],
  columnSettings,
  table,
  sheetExtra,
  overlays,
  overlayOpen = false,
  className,
  phone: phoneProp,
}: ErpListPageProps<TData>) {
  const phoneFromHook = useErpPhone();
  const phone = phoneProp ?? phoneFromHook;
  const [sheetOpen, setSheetOpen] = useState(false);
  const total = table.total ?? table.data.length;
  const activeFilters = countActiveErpFilterFields(filters) + (search.value ? 1 : 0);
  const resetButton = onResetFilters ? <Button type="button" size="sm" variant="ghost" onClick={onResetFilters}><RotateCcw className="h-4 w-4" />重置</Button> : null;
  const actionButtons = actions.map((action) => <Button key={action.label} type="button" size="sm" variant="secondary" disabled={action.disabled} onClick={action.onClick}>{action.icon}{action.label}</Button>);
  const refreshButton = onRefresh ? <Button type="button" size="sm" variant="secondary" onClick={onRefresh} disabled={refreshing}><RefreshCw className={cn("h-4 w-4", refreshing && "animate-spin")} />刷新</Button> : null;
  const searchInput = <ErpSearchInput className={phone ? "w-full" : "min-w-64 flex-1"} value={search.value} onChange={(event) => search.onChange(event.target.value)} placeholder={phone ? search.phonePlaceholder ?? search.placeholder : search.placeholder} aria-label={search.label} />;

  if (!phone) {
    const dataTable = <ErpDataTable {...table} surface="card" mobilePagination="compact" density={columnSettings?.density} columnVisibility={columnSettings?.visibility} onColumnVisibilityChange={columnSettings?.onVisibilityChange} phone={phoneProp} />;
    return <ErpListPageFrame className={cn("erp-list-page", className)}>
      <ErpPageHeader title={title} subtitle={subtitle} quickStatus={quickStatus} actions={refreshButton || primaryAction ? <>{refreshButton}{primaryAction && <Button type="button" size="sm" variant="primary" disabled={primaryAction.disabled} onClick={primaryAction.onClick}>{primaryAction.icon}{primaryAction.label}</Button>}</> : undefined} />
      {tabs}
      {metrics?.length ? <ErpMobileSummary><MetricsRegion>{metrics}</MetricsRegion></ErpMobileSummary> : null}
      <ErpPageToolbar><ErpFilterBar actions={resetButton || actionButtons.length ? <>{resetButton}{actionButtons}</> : undefined}>{searchInput}<ErpFilterFields fields={filters} layout="bar" /></ErpFilterBar></ErpPageToolbar>
      <ErpPageContent className="space-y-[var(--erp-page-gap)]">
        {columnSettings && <ErpTableResultsBar
          summary={desktopResultsSummary === undefined ? <span className="flex flex-wrap items-center gap-2 text-[var(--erp-color-text-muted)]"><Filter className="h-3.5 w-3.5" /><ErpStatusBadge label={activeFilters ? `${activeFilters} 项筛选` : resultsLabel} tone={activeFilters ? "info" : "neutral"} /></span> : desktopResultsSummary}
          actions={<><ErpColumnVisibilityMenu columns={columnSettings.columns} visibility={columnSettings.visibility} onVisibilityChange={columnSettings.onVisibilityChange} /><div className="inline-flex rounded-[var(--erp-radius-md)] border border-[var(--erp-color-border)] bg-[var(--erp-color-surface)] p-0.5"><Button type="button" size="sm" variant={columnSettings.density === "comfortable" ? "secondary" : "ghost"} onClick={() => columnSettings.onDensityChange("comfortable")}>舒适</Button><Button type="button" size="sm" variant={columnSettings.density === "compact" ? "secondary" : "ghost"} onClick={() => columnSettings.onDensityChange("compact")}>紧凑</Button></div></>}
        />}
        {desktopTableSection ? <DashboardSection title={tableTitle} description={tableDescription} actions={<ErpStatusBadge label={`共 ${total} 条`} tone="info" />}>{dataTable}</DashboardSection> : dataTable}
        {overlays}
      </ErpPageContent>
    </ErpListPageFrame>;
  }

  const sheetFilterCount = countActiveErpFilterFields(filters);
  const phoneTitleNode = <span className="erp-list-phone-title">{phoneTitle}<small>{loading ? "正在加载…" : loadError ? "加载失败" : countLabel(total)}</small></span>;
  const hasSheet = filters.length > 0 || actions.length > 0 || Boolean(onRefresh) || Boolean(table.onPageSizeChange);
  const filterButton = hasSheet ? <Button type="button" variant="secondary" size="sm" onClick={() => setSheetOpen(true)} aria-label={`${phoneTitle}筛选与操作`}><SlidersHorizontal className="h-4 w-4" />筛选{sheetFilterCount > 0 && <span className="tabular-nums">{sheetFilterCount}</span>}</Button> : undefined;
  const mobileToolbar: ErpDataTableProps<TData>["mobileToolbar"] = ({openSorting, sortLabel, descending}) => <div className="erp-list-toolbar">
    {quickFilters.length > 0 && <div className="erp-list-quick-filters" role="group" aria-label={`${phoneTitle}快捷筛选`}>{quickFilters.slice(0, 4).map((item) => <Button key={item.label} type="button" variant={item.active ? "primary" : "ghost"} aria-pressed={item.active} onClick={item.onSelect}>{item.label}</Button>)}</div>}
    <Button type="button" variant="ghost" className="erp-list-sort" aria-label={`${phoneTitle}排序`} onClick={openSorting}><span>{sortLabel || defaultSortLabel}</span>{descending === undefined ? <ChevronDown className="h-4 w-4" /> : descending ? <ArrowDown className="h-4 w-4" /> : <ArrowUp className="h-4 w-4" />}</Button>
  </div>;
  return <ErpListPageFrame className={cn("erp-list-page", className)} data-phone-layout="thumb">
    <ErpPageHeader title={phoneTitleNode} subtitle={subtitle} quickStatus={quickStatus} actions={filterButton} />
    {tabs}
    <ErpPageContent className="space-y-[var(--erp-page-gap)]">
      <ErpDataTable {...table} surface="plain" mobilePagination="compact" mobileToolbar={mobileToolbar} phone={phoneProp} compactViewport={phoneProp} />
      <ErpMobileActionDock hidden={overlayOpen || sheetOpen} ariaLabel={`${phoneTitle}搜索`} primaryAction={primaryAction ? <Button type="button" variant="primary" disabled={primaryAction.disabled} onClick={primaryAction.onClick}>{primaryAction.icon}{primaryAction.label}</Button> : undefined}>{searchInput}</ErpMobileActionDock>
      {hasSheet && <ErpDialogShell open={sheetOpen} onOpenChange={setSheetOpen} title={`${phoneTitle}筛选与操作`} mobilePresentation="sheet" footer={<>{resetButton}<Button type="button" variant="primary" onClick={() => setSheetOpen(false)}>查看结果</Button></>}>
        <div className="space-y-4">
          <ErpFilterFields fields={filters} layout="sheet" />
          {table.onPageSizeChange && <Select aria-label="每页条数" value={String(table.pageSize ?? 20)} onValueChange={(value) => table.onPageSizeChange?.(Number(value))} options={createErpPageSizeOptions(phonePageSizeOptions)} />}
          {(actionButtons.length > 0 || refreshButton) && <div className="flex flex-wrap gap-2">{actionButtons}{refreshButton}</div>}
          {sheetExtra}
        </div>
      </ErpDialogShell>}
      {overlays}
    </ErpPageContent>
  </ErpListPageFrame>;
}
