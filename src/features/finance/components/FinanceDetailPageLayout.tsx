import {useId, type ReactNode} from "react";
import {ChevronDown, ChevronUp} from "lucide-react";
import {
  ErpFinancePageFrame,
  ErpPageContent,
  ErpPageHeader,
  ErpPageToolbar,
  type ErpPageHeaderProps,
} from "@/src/components/common";
import {Button} from "@/src/components/ui";
import {cn} from "@/src/lib/cn";
import {useFinanceAnalysisPreference} from "@/src/hooks/useFinanceAnalysisPreference";
import {FinanceSectionTabs, type FinanceSectionTab} from "./FinanceSectionTabs";

export interface FinanceDetailPageLayoutProps {
  header: ErpPageHeaderProps;
  tabs?: {
    label: string;
    items: FinanceSectionTab[];
  };
  filters?: ReactNode;
  metrics?: ReactNode;
  table: ReactNode;
  analysis?: {
    title: string;
    preferenceKey: string;
    children: ReactNode;
  };
  children?: ReactNode;
}

/**
 * Shared desktop-first finance detail layout. Mobile keeps the existing
 * Finance frame search-first ordering; desktop follows filters → metrics → table.
 */
export function FinanceDetailPageLayout({header, tabs, filters, metrics, table, analysis, children}: FinanceDetailPageLayoutProps) {
  return (
    <ErpFinancePageFrame>
      <ErpPageHeader {...header} />
      {tabs && (
        <div data-finance-layout-slot="tabs">
          <FinanceSectionTabs label={tabs.label} items={tabs.items} />
        </div>
      )}
      {filters && <ErpPageToolbar>{filters}</ErpPageToolbar>}
      {metrics && <div data-finance-layout-slot="metrics">{metrics}</div>}
      <ErpPageContent className="space-y-[var(--erp-page-gap)]">
        <div data-finance-layout-slot="table">{table}</div>
        {analysis && (
          <FinanceAnalysisDisclosure
            key={analysis.preferenceKey}
            title={analysis.title}
            preferenceKey={analysis.preferenceKey}
          >
            {analysis.children}
          </FinanceAnalysisDisclosure>
        )}
        {children}
      </ErpPageContent>
    </ErpFinancePageFrame>
  );
}

function FinanceAnalysisDisclosure({title, preferenceKey, children}: {title: string; preferenceKey: string; children: ReactNode}) {
  const contentId = `finance-analysis-${useId().replace(/:/g, "")}`;
  const [expanded, setExpanded] = useFinanceAnalysisPreference(preferenceKey);
  const toggle = () => setExpanded((current) => !current);

  return (
    <section className="erp-card-surface min-w-0 p-[var(--erp-card-padding-compact)]" data-finance-layout-slot="analysis">
      <div className="flex min-w-0 items-center justify-between gap-3">
        <h2 className="text-erp-lg font-semibold text-[var(--erp-color-text)]">{title}</h2>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          aria-expanded={expanded}
          aria-controls={contentId}
          onClick={toggle}
        >
          {expanded ? <ChevronUp aria-hidden="true" className="h-4 w-4" /> : <ChevronDown aria-hidden="true" className="h-4 w-4" />}
          {expanded ? "收起分析" : "展开分析"}
        </Button>
      </div>
      <div
        id={contentId}
        hidden={!expanded}
        aria-hidden={!expanded}
        className={cn("min-w-0", expanded && "pt-3")}
      >
        {children}
      </div>
    </section>
  );
}
