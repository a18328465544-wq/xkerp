import {useId, type ReactNode} from "react";
import {ChevronDown, ChevronUp} from "lucide-react";
import {ErpListPage} from "@/src/components/common";
import {Button} from "@/src/components/ui";
import {cn} from "@/src/lib/cn";
import {useFinanceAnalysisPreference} from "@/src/hooks/useFinanceAnalysisPreference";
import {FinanceSectionTabs, type FinanceSectionTab} from "./FinanceSectionTabs";

export interface FinanceDetailPageLayoutProps {
  header: ReactNode;
  title?: string;
  phoneTitle?: string;
  countLabel?: (total: number) => string;
  tabs?: {label: string; items: FinanceSectionTab[]};
  filters?: ReactNode;
  phoneFilters?: ReactNode;
  phoneSearch?: ReactNode;
  phoneHeaderActions?: ReactNode;
  phonePageFrame?: "finance" | "analytics";
  additionalActiveFilterCount?: number;
  onResetFilters?: () => void;
  metrics?: ReactNode;
  beforeTable?: ReactNode;
  table: ReactNode;
  phoneTable?: ReactNode;
  analysis?: {title: string; preferenceKey: string; children: ReactNode};
  phoneAnalysis?: ReactNode;
  children?: ReactNode;
  overlayOpen?: boolean;
  loading?: boolean;
  loadError?: boolean;
}

/**
 * Finance detail lists share ErpListPage's responsive shell and filter sheet;
 * their own columns, searches, metrics and reconciliation details remain local.
 */
export function FinanceDetailPageLayout({header, title = "财务明细", phoneTitle, countLabel, tabs, filters, phoneFilters, phoneSearch, phoneHeaderActions, phonePageFrame, additionalActiveFilterCount, onResetFilters, metrics, beforeTable, table, phoneTable, analysis, phoneAnalysis, children, overlayOpen, loading, loadError}: FinanceDetailPageLayoutProps) {
  const tabContent = tabs ? <FinanceSectionTabs label={tabs.label} items={tabs.items} /> : undefined;
  const desktopContent = <>
    {beforeTable && <div data-finance-layout-slot="before-table">{beforeTable}</div>}
    <div data-finance-layout-slot="table">{table}</div>
    {analysis && <FinanceAnalysisDisclosure key={analysis.preferenceKey} title={analysis.title} preferenceKey={analysis.preferenceKey}>{analysis.children}</FinanceAnalysisDisclosure>}
  </>;
  const mobileContent = <>
    {beforeTable && <div data-finance-layout-slot="before-table">{beforeTable}</div>}
    <div data-finance-layout-slot="table">{phoneTable ?? table}</div>
    {phoneAnalysis ?? (analysis ? <FinanceAnalysisDisclosure key={analysis.preferenceKey} title={analysis.title} preferenceKey={analysis.preferenceKey}>{analysis.children}</FinanceAnalysisDisclosure> : null)}
  </>;

  return <ErpListPage
    title={title}
    phoneTitle={phoneTitle ?? title}
    countLabel={countLabel}
    headerContent={header}
    pageFrame="finance"
    phonePageFrame={phonePageFrame}
    tabs={tabContent}
    desktopFilterContent={filters}
    phoneFilterContent={phoneFilters ?? filters}
    phoneSearchContent={phoneSearch}
    phoneHeaderActions={phoneHeaderActions}
    metricsPlacement="after-filters"
    additionalActiveFilterCount={additionalActiveFilterCount}
    onResetFilters={onResetFilters}
    metricsContent={metrics === undefined || metrics === null ? undefined : <div data-finance-layout-slot="metrics">{metrics}</div>}
    tableTitle={title}
    desktopTableSection={false}
    desktopTableContent={desktopContent}
    phoneTableContent={mobileContent}
    loading={loading}
    loadError={loadError}
    overlayOpen={overlayOpen}
    overlays={children}
  />;
}

function FinanceAnalysisDisclosure({title, preferenceKey, children}: {title: string; preferenceKey: string; children: ReactNode}) {
  const contentId = `finance-analysis-${useId().replace(/:/g, "")}`;
  const [expanded, setExpanded] = useFinanceAnalysisPreference(preferenceKey);
  const toggle = () => setExpanded((current) => !current);

  return (
    <section className="erp-card-surface min-w-0 p-[var(--erp-card-padding-compact)]" data-finance-layout-slot="analysis">
      <div className="flex min-w-0 items-center justify-between gap-3">
        <h2 className="text-erp-lg font-semibold text-[var(--erp-color-text)]">{title}</h2>
        <Button type="button" size="sm" variant="ghost" aria-expanded={expanded} aria-controls={contentId} onClick={toggle}>
          {expanded ? <ChevronUp aria-hidden="true" className="h-4 w-4" /> : <ChevronDown aria-hidden="true" className="h-4 w-4" />}
          {expanded ? "收起分析" : "展开分析"}
        </Button>
      </div>
      <div id={contentId} hidden={!expanded} aria-hidden={!expanded} className={cn("min-w-0", expanded && "pt-3")}>
        {children}
      </div>
    </section>
  );
}
