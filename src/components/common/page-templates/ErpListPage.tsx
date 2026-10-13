import {useRef, useState, type ReactNode} from "react";
import type {ColumnDef, VisibilityState} from "@tanstack/react-table";
import {ArrowDown, ArrowLeft, ArrowUp, ChevronDown, Filter, MoreHorizontal, Plus, RefreshCw, RotateCcw, SlidersHorizontal} from "lucide-react";
import {usePhoneBackLayer} from "@/src/hooks/usePhoneBack";
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
import {ErpAnalyticsPageFrame, ErpCrmPageFrame, ErpFinancePageFrame, ErpListPageFrame, ErpSettingsPageFrame, ErpWarehousePageFrame} from "../ErpPageFrames";
import {ErpPageHeader} from "../ErpPageHeader";
import type {QuickStatusItemData} from "../ErpQuickStatus";
import {ErpSearchInput} from "../ErpSearchInput";
import {ErpStatusBadge} from "../ErpStatusBadge";
import {ErpChoiceChips} from "../ErpChoiceChips";
import {countActiveErpFilterFields, ErpFilterFields, getActiveErpFilterTags, type ErpFilterField} from "../filters/ErpFilterFields";
import {ErpFilterTags, type ErpActiveFilterTag} from "../filters/ErpFilterTags";
import {ErpDocumentFilterSheet, type ErpFilterDraft} from "../filters/ErpDocumentFilterSheet";

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

export interface ErpListPagePagination {
  total: number;
  page: number;
  pageSize: number;
  onPageChange?: (page: number) => void;
  onPageSizeChange?: (pageSize: number) => void;
}

export type ErpListPageFrameKind = "list" | "warehouse" | "finance" | "settings" | "analytics" | "crm";

export interface ErpListPageProps<TData> {
  /** Legacy desktop workspace retained verbatim during mobile-only migration. */
  desktopPageContent?: ReactNode;
  /** An existing operation form, folded on phones without a second form controller. */
  phoneWorkflow?: {title: string; content: ReactNode; actionLabel?: string};
  phoneActionPlacement?: "header" | "dock";
  /** Single existing workbench controller; only the template switches list/task views. */
  phoneTask?: {open: boolean; active: boolean; title: string; onClose: () => void; onBack?: () => void; content: ReactNode; actions?: ReactNode};
  phoneAfterTable?: ReactNode;
  phoneMetrics?: ReactNode;
  /** Opt-in document presentation; does not change desktop or unrelated entity lists. */
  phonePresentation?: "standard" | "documents";
  /** Apply a complete draft atomically; never replay field callbacks with stale closures. */
  onApplyPhoneFilters?: (values: ErpFilterDraft) => void;
  title: string;
  /** Shorter phone title, e.g. 「客户」 for 「客户档案」. */
  phoneTitle?: string;
  subtitle?: string;
  /** Result count under the phone title; the only place the count appears on phones. */
  countLabel?: (total: number) => string;
  loading?: boolean;
  loadError?: boolean;
  /** Work items only (M17). */
  quickStatus?: QuickStatusItemData[];
  /** Desktop metric cards, at most 4 (M18). Phone lists do not show them. */
  metrics?: ReactNode[];
  /** Section tabs shown under the header on every viewport. */
  tabs?: ReactNode;
  /** Preserve the existing semantic page frame while the list regions are templated. */
  pageFrame?: ErpListPageFrameKind;
  search?: {value: string; onChange: (value: string) => void; label: string; placeholder: string; phonePlaceholder?: string};
  filters?: readonly ErpFilterField[];
  /** Additional active criteria managed by a page-specific queue/tab outside the field list. */
  additionalActiveFilterCount?: number;
  onResetFilters?: () => void;
  /** Phone quick filters beside the sort button: one scrollable row of choice chips (M13). */
  quickFilters?: readonly ErpListQuickFilter[];
  /** Sort button label while the list uses its default order. */
  defaultSortLabel?: string;
  primaryAction?: ErpListPageAction;
  /** Optional desktop-only header controls such as a view switcher. */
  desktopHeaderActions?: ReactNode;
  /** Optional phone-only header control placed beside the filter button. */
  phoneHeaderActions?: ReactNode;
  /** A domain-owned More sheet can keep its trigger inline without a second action sheet. */
  phoneHeaderActionsMode?: "collapse" | "inline";
  /** Phone dock action when it differs from the desktop primary action. */
  phonePrimaryAction?: ErpListPageAction;
  /** Optional icon action inside the phone search field (e.g. existing barcode scan). */
  phoneSearchAction?: ErpListPageAction;
  /** Secondary actions: desktop filter bar, phone filter sheet. */
  actions?: readonly ErpListPageAction[];
  /** Page-level secondary actions (e.g. 办理销售退货): desktop header, phone filter sheet. */
  pageActions?: readonly ErpListPageAction[];
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
  /** Optional page-specific notice displayed immediately before both table layouts. */
  tableNotice?: ReactNode;
  /** Specialized lists may keep a domain-owned table while sharing page chrome and filters. */
  desktopTableContent?: ReactNode;
  phoneTableContent?: ReactNode;
  /** Table density used where the page does not expose user-configurable density controls. */
  tableDensity?: ErpTableDensity;
  /** Preserve page-specific phone page-size choices where they differ from the default. */
  phonePageSizeOptions?: readonly number[];
  columnSettings?: ErpListColumnSettings<TData>;
  table?: ErpListTableProps<TData>;
  /** Paging state for pages that render distinct domain-owned desktop/phone tables. */
  pagination?: ErpListPagePagination;
  /** Extra read-only content at the end of the phone filter sheet. */
  sheetExtra?: ReactNode;
  /** Domain-specific phone filtering. The original desktop fields are untouched. */
  phoneFilterSheet?: (controls: {open: boolean; onOpenChange: (open: boolean) => void}) => ReactNode;
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
  desktopPageContent,
  phoneWorkflow,
  phoneActionPlacement = "header",
  phoneTask,
  phoneAfterTable,
  phoneMetrics,
  phonePresentation = "standard",
  onApplyPhoneFilters,
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
  additionalActiveFilterCount = 0,
  onResetFilters,
  quickFilters = [],
  defaultSortLabel = "排序",
  primaryAction,
  desktopHeaderActions,
  phoneHeaderActions,
  phoneHeaderActionsMode,
  phonePrimaryAction,
  phoneSearchAction,
  actions = [],
  pageActions = [],
  onRefresh,
  refreshing = false,
  resultsLabel = "全部记录",
  desktopResultsSummary,
  tableTitle,
  tableDescription,
  desktopTableSection = true,
  tableNotice,
  desktopTableContent,
  phoneTableContent,
  tableDensity = "comfortable",
  phonePageSizeOptions = [20, 50, 100],
  pageFrame = "list",
  columnSettings,
  table,
  pagination,
  sheetExtra,
  phoneFilterSheet,
  overlays,
  overlayOpen = false,
  className,
  phone: phoneProp,
}: ErpListPageProps<TData>) {
  const phoneFromHook = useErpPhone();
  const phone = phoneProp ?? phoneFromHook;
  usePhoneBackLayer(Boolean(phone && phoneTask?.active && phoneTask.open), () => (phoneTask?.onBack ?? phoneTask?.onClose)?.(), 50);
  const PageFrame = getListPageFrame(pageFrame);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [workOpen, setWorkOpen] = useState(false);
  const [workflowOpen, setWorkflowOpen] = useState(false);
  const workflowRef = useRef<HTMLDetailsElement>(null);
  const total = table?.total ?? pagination?.total ?? table?.data.length ?? 0;
  const pageSize = table?.pageSize ?? pagination?.pageSize ?? 20;
  const onPageSizeChange = table?.onPageSizeChange ?? pagination?.onPageSizeChange;
  const activeFilters = countActiveErpFilterFields(filters) + (search?.value ? 1 : 0) + additionalActiveFilterCount;
  const resetButton = onResetFilters ? <Button type="button" size="sm" variant="ghost" onClick={onResetFilters}><RotateCcw className="h-4 w-4" />重置</Button> : null;
  const pageActionButtons = pageActions.map((action) => <Button key={action.label} type="button" size="sm" variant="secondary" disabled={action.disabled} onClick={() => {setSheetOpen(false); action.onClick();}}>{action.icon}{action.label}</Button>);
  const actionButtons = actions.map((action) => <Button key={action.label} type="button" size="sm" variant="secondary" disabled={action.disabled} onClick={() => {setSheetOpen(false); action.onClick();}}>{action.icon}{action.label}</Button>);
  const refreshButton = onRefresh ? <Button type="button" size="sm" variant="secondary" onClick={onRefresh} disabled={refreshing}><RefreshCw className={cn("h-4 w-4", refreshing && "animate-spin")} />刷新</Button> : null;
  const searchInput = search ? <ErpSearchInput className={phone ? "w-full" : "min-w-64 flex-1"} value={search.value} onChange={(event) => search.onChange(event.target.value)} placeholder={phone ? search.phonePlaceholder ?? search.placeholder : search.placeholder} aria-label={search.label} trailingAction={phone && phoneSearchAction ? <Button type="button" size="iconTouch" variant="ghost" aria-label={phoneSearchAction.label} title={phoneSearchAction.label} disabled={phoneSearchAction.disabled} onMouseDown={(event) => event.preventDefault()} onClick={phoneSearchAction.onClick}>{phoneSearchAction.icon}</Button> : undefined} /> : null;
  const metricsRegion = (metrics?.length ? <ErpMobileSummary phone={phone}><MetricsRegion>{metrics}</MetricsRegion></ErpMobileSummary> : null);
  const activeTags: ErpActiveFilterTag[] = [
    ...(search?.value ? [{key: "search", label: `搜索：${search.value}`, onRemove: () => search.onChange("")}] : []),
    ...getActiveErpFilterTags(filters),
    ...(additionalActiveFilterCount > 0 ? [{key: "additional", label: `其他条件 ${additionalActiveFilterCount}`}] : []),
  ];
  const filterTags = <ErpFilterTags tags={activeTags} onClearAll={onResetFilters} />;
  // Desktop shows the same quick filters as chips beside the applied-filter tags;
  // both read and write the page's existing filter state.
  const quickChips = quickFilters.length > 0 ? <ErpChoiceChips label={`${title}快捷筛选`} value={quickFilters.find((item) => item.active)?.label ?? ""} options={quickFilters.map((item) => ({value: item.label, label: item.label}))} onValueChange={(label) => quickFilters.find((item) => item.label === label)?.onSelect()} /> : null;
  // A page-specific summary (e.g. 「共 2 条」) replaces the tags but never the quick chips.
  const pageSummary = desktopResultsSummary === undefined ? filterTags : desktopResultsSummary;
  const desktopSummaryContent = quickChips || (desktopResultsSummary === undefined ? activeFilters > 0 : desktopResultsSummary) ? <div className="flex min-w-0 flex-wrap items-center gap-x-4 gap-y-2">{quickChips}{pageSummary}</div> : null;

  if (!phone) {
    if (desktopPageContent) return <>{desktopPageContent}{overlays}</>;
    const dataTable = table ? <ErpDataTable {...table} emptyAction={table.emptyAction ?? (primaryAction && <Button type="button" variant="primary" disabled={primaryAction.disabled} onClick={primaryAction.onClick}>{primaryAction.label}</Button>)} surface="card" mobilePagination="compact" density={columnSettings?.density ?? tableDensity} columnVisibility={columnSettings?.visibility} onColumnVisibilityChange={columnSettings?.onVisibilityChange} phone={phoneProp} /> : null;
    return <PageFrame className={cn("erp-list-page", className)}>
      <ErpPageHeader phone={phone} title={title} subtitle={subtitle} quickStatus={quickStatus} actions={desktopHeaderActions || pageActionButtons.length || refreshButton || primaryAction ? <>{desktopHeaderActions}{pageActionButtons}{refreshButton}{primaryAction && <Button type="button" size="sm" variant="primary" disabled={primaryAction.disabled} onClick={primaryAction.onClick}>{primaryAction.icon}{primaryAction.label}</Button>}</> : undefined} />
      {tabs}
      {metricsRegion}
      <ErpPageToolbar><ErpFilterBar actions={resetButton || actionButtons.length ? <>{resetButton}{actionButtons}</> : undefined}>{searchInput}<ErpFilterFields fields={filters} layout="bar" /></ErpFilterBar></ErpPageToolbar>
      <ErpPageContent className="space-y-[var(--erp-page-gap)]">
        {tableNotice}
        {!columnSettings && (quickChips || (desktopResultsSummary === undefined && activeFilters > 0)) && <div data-erp-region="table-results" className="px-2 sm:px-4">{desktopSummaryContent}</div>}
        {columnSettings && <ErpTableResultsBar
          summary={desktopSummaryContent ?? (desktopResultsSummary === undefined ? <span className="flex flex-wrap items-center gap-2 text-[var(--erp-color-text-muted)]"><Filter className="h-3.5 w-3.5" /><ErpStatusBadge label={resultsLabel} tone="neutral" /></span> : desktopResultsSummary)}
          actions={<><ErpColumnVisibilityMenu columns={columnSettings.columns} visibility={columnSettings.visibility} onVisibilityChange={columnSettings.onVisibilityChange} /><div className="inline-flex rounded-[var(--erp-radius-md)] border border-[var(--erp-color-border)] bg-[var(--erp-color-surface)] p-0.5"><Button type="button" size="sm" variant={columnSettings.density === "comfortable" ? "secondary" : "ghost"} onClick={() => columnSettings.onDensityChange("comfortable")}>舒适</Button><Button type="button" size="sm" variant={columnSettings.density === "compact" ? "secondary" : "ghost"} onClick={() => columnSettings.onDensityChange("compact")}>紧凑</Button></div></>}
        />}
        {desktopTableContent ?? (table && desktopTableSection ? <DashboardSection title={tableTitle} count={`共 ${total} 条`} description={tableDescription}>{dataTable}</DashboardSection> : dataTable)}
        {overlays}
      </ErpPageContent>
    </PageFrame>;
  }

  const sheetFilterCount = countActiveErpFilterFields(filters) + additionalActiveFilterCount;
  const phoneCount = loading ? "正在加载…" : loadError ? "加载失败" : countLabel?.(total);
  const phoneTitleNode = <span className="erp-list-phone-title">{phoneTitle}{phoneCount ? <small>{phoneCount}</small> : null}</span>;
  const hasSheet = Boolean(phoneFilterSheet) || filters.length > 0;
  // Page size, page actions, refresh and summaries live in the More sheet; the
  // filter sheet holds filter criteria only (M13). Specialized sheets own their More.
  const workAvailable = !phoneFilterSheet && (actions.length > 0 || pageActions.length > 0 || Boolean(onRefresh) || Boolean(onPageSizeChange) || Boolean(sheetExtra));
  const documentPresentation = phonePresentation === "documents";
  const dockAction = phonePrimaryAction || primaryAction;
  const dockShowsPrimary = Boolean(searchInput && dockAction && phoneActionPlacement === "dock");
  const headerAction = phoneActionPlacement === "header" ? dockAction : undefined;
  const openPhoneWorkflow = () => {setWorkflowOpen(true); requestAnimationFrame(() => workflowRef.current?.scrollIntoView({block: "start"}));};
  const workflowHeaderAction = !headerAction && phoneWorkflow?.actionLabel && !workflowOpen ? phoneWorkflow.actionLabel : undefined;
  // Creation is already reachable in the header (or explicit task dock).
  // The empty state must not repeat the same action on the phone screen.
  const emptyAction = table?.emptyAction;
  const phonePrimaryButton = headerAction ? <Button type="button" variant="ghost" size="iconTouch" data-erp-phone-action="primary" aria-label={headerAction.label} title={headerAction.label} disabled={headerAction.disabled} onClick={headerAction.onClick}>{headerAction.icon ?? <Plus className="h-5 w-5" />}</Button> : workflowHeaderAction ? <Button type="button" variant="ghost" size="iconTouch" data-erp-phone-action="workflow" aria-label={workflowHeaderAction} title={workflowHeaderAction} onClick={openPhoneWorkflow}><Plus className="h-5 w-5" /></Button> : undefined;
  const filterButton = hasSheet ? <Button type="button" variant="secondary" size="sm" onClick={() => setSheetOpen(true)} aria-label={`${phoneTitle}筛选`}><SlidersHorizontal className="h-4 w-4" />筛选{sheetFilterCount > 0 && <span className="tabular-nums">{sheetFilterCount}</span>}</Button> : undefined;
  const mobileToolbar: ErpDataTableProps<TData>["mobileToolbar"] = ({openSorting, sortLabel, descending}) => <div className="erp-list-toolbar">
    {quickFilters.length > 0 && <ErpChoiceChips className="erp-list-quick-filters" layout="scroll" label={`${phoneTitle}快捷筛选`} value={quickFilters.find((item) => item.active)?.label ?? ""} options={quickFilters.map((item) => ({value: item.label, label: item.label}))} onValueChange={(label) => quickFilters.find((item) => item.label === label)?.onSelect()} />}
    {table?.mobileSorting !== false && <Button type="button" variant="ghost" className="erp-list-sort" aria-label={`${phoneTitle}排序`} onClick={openSorting}><span>{sortLabel || defaultSortLabel}</span>{descending === undefined ? <ChevronDown className="h-4 w-4" /> : descending ? <ArrowDown className="h-4 w-4" /> : <ArrowUp className="h-4 w-4" />}</Button>}
  </div>;
  if (phoneTask?.open) return <PageFrame className={cn("erp-list-page", className)} data-phone-task="true">
    <ErpPageHeader phone={phone} phoneActionsMode="inline" title={phoneTask.title} actions={<><Button type="button" variant="secondary" onClick={phoneTask.onClose}><ArrowLeft className="h-4 w-4" />返回单据列表</Button>{phoneTask.actions}</>} />
    <ErpPageContent>{phoneTask.content}{overlays}</ErpPageContent>
  </PageFrame>;
  return <PageFrame className={cn("erp-list-page", documentPresentation && "erp-document-list", className)} data-phone-layout="thumb">
    <ErpPageHeader phone={phone} phoneActionsMode={phoneHeaderActionsMode ?? (documentPresentation || phonePrimaryButton || workAvailable ? "inline" : "collapse")} title={phoneTitleNode} subtitle={subtitle} quickStatus={quickStatus} actions={phoneHeaderActions || filterButton || workAvailable || phonePrimaryButton ? <>{filterButton}{phoneHeaderActions}{phonePrimaryButton}{workAvailable && <Button type="button" variant="ghost" size="iconTouch" aria-label={`${phoneTitle}更多操作`} title="更多操作" onClick={() => setWorkOpen(true)}><MoreHorizontal className="h-5 w-5" /></Button>}</> : undefined} />
    {/* The thumb layout bleeds rows to the screen edge; everything above the rows keeps the 16px gutter. */}
    {tabs && <div className="px-[var(--erp-mobile-content-inset)]">{tabs}</div>}
    {/* Phones keep list rows near the top; summary metrics stay on desktop (M13/M18). */}
    <ErpPageContent className="space-y-[var(--erp-page-gap)]">
      {phoneMetrics && <div className="px-[var(--erp-mobile-content-inset)]">{phoneMetrics}</div>}
      {tableNotice && <div className="px-[var(--erp-mobile-content-inset)]">{tableNotice}</div>}
      {phoneWorkflow && <details ref={workflowRef} open={workflowOpen} onToggle={(event) => setWorkflowOpen(event.currentTarget.open)} className="group erp-document-workflow"><summary className="flex list-none items-center justify-between gap-3 [&::-webkit-details-marker]:hidden">{phoneWorkflow.title}<ChevronDown aria-hidden="true" className="h-4 w-4 shrink-0 transition-transform group-open:rotate-180" /></summary>{phoneWorkflow.content}</details>}
      {phoneTableContent ?? (table ? <ErpDataTable {...table} emptyAction={emptyAction} surface="plain" mobilePagination="compact" mobilePaginationShowTotal={!documentPresentation} mobileToolbar={mobileToolbar} density={tableDensity} phone={phoneProp} compactViewport={phoneProp} /> : null)}
      {phoneAfterTable && <div className="px-[var(--erp-mobile-content-inset)]">{phoneAfterTable}</div>}
      {searchInput && <ErpMobileActionDock hidden={overlayOpen || sheetOpen || workOpen || Boolean(workflowOpen && phoneWorkflow?.actionLabel)} layout={dockShowsPrimary ? "stacked" : "search"} ariaLabel={`${phoneTitle}搜索`} primaryAction={dockShowsPrimary && dockAction ? <Button type="button" variant="primary" disabled={dockAction.disabled} onClick={dockAction.onClick}>{dockAction.icon}{dockAction.label}</Button> : undefined}>{searchInput}</ErpMobileActionDock>}
      {workAvailable && <ErpDialogShell open={workOpen} onOpenChange={setWorkOpen} title={`${phoneTitle}操作`} mobilePresentation="sheet"><div className="grid gap-3">{onPageSizeChange && <Select aria-label="每页条数" value={String(pageSize)} onValueChange={(value) => onPageSizeChange(Number(value))} options={createErpPageSizeOptions(phonePageSizeOptions)} />}{[...pageActions, ...actions].map((action) => <Button key={action.label} type="button" variant="secondary" disabled={action.disabled} onClick={() => {setWorkOpen(false); action.onClick();}}>{action.icon}{action.label}</Button>)}{onRefresh && <Button type="button" variant="secondary" disabled={refreshing} onClick={() => {setWorkOpen(false); onRefresh();}}>刷新</Button>}{sheetExtra}</div></ErpDialogShell>}
      {phoneFilterSheet?.({open: sheetOpen, onOpenChange: setSheetOpen})}
      {documentPresentation && !phoneFilterSheet && sheetOpen && onApplyPhoneFilters && <ErpDocumentFilterSheet title={`筛选${phoneTitle}`} fields={filters} onClose={() => setSheetOpen(false)} onApply={onApplyPhoneFilters} />}
      {filters.length > 0 && !phoneFilterSheet && !(documentPresentation && onApplyPhoneFilters) && <ErpDialogShell open={sheetOpen} onOpenChange={setSheetOpen} title={`${phoneTitle}筛选`} mobilePresentation="sheet" footer={<>{resetButton}<Button type="button" variant="primary" onClick={() => setSheetOpen(false)}>查看结果</Button></>}>
        <ErpFilterFields fields={filters} layout="sheet" />
      </ErpDialogShell>}
      {overlays}
    </ErpPageContent>
  </PageFrame>;
}

function getListPageFrame(kind: ErpListPageFrameKind) {
  switch (kind) {
    case "warehouse": return ErpWarehousePageFrame;
    case "finance": return ErpFinancePageFrame;
    case "settings": return ErpSettingsPageFrame;
    case "analytics": return ErpAnalyticsPageFrame;
    case "crm": return ErpCrmPageFrame;
    default: return ErpListPageFrame;
  }
}
