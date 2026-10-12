import type {ReactNode} from "react";
import {
  ErpFinancePageFrame,
  ErpPageContent,
  ErpPageHeader,
  ErpPageToolbar,
  ErpListPage,
  type ErpListPageProps,
  type ErpDataTableProps,
  type ErpPageHeaderProps,
} from "@/src/components/common";
import {FinanceSectionTabs, type FinanceSectionTab} from "./FinanceSectionTabs";
import {FinanceTableRegion} from "./FinanceTableRegion";
import {useErpPhone} from "@/src/hooks/useErpViewport";

interface FinanceEntryTable<TData> {
  title: ReactNode;
  count?: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  table: ErpDataTableProps<TData> & {
    mobileRow: NonNullable<ErpDataTableProps<TData>["mobileRow"]>;
  };
}

export interface FinanceEntryPageLayoutProps<TData> {
  phoneDocumentList?: Omit<ErpListPageProps<TData>, "table" | "overlays">;
  header: ErpPageHeaderProps;
  tabs?: {
    label: string;
    items: FinanceSectionTab[];
  };
  metrics: ReactNode;
  filters: ReactNode;
  table: FinanceEntryTable<TData>;
  children?: ReactNode;
}

/**
 * Shared frame for finance entry lists. It owns only stable page regions;
 * filters, columns, mutations and detail content remain feature-owned.
 */
export function FinanceEntryPageLayout<TData>({header, tabs, metrics, filters, table, children, phoneDocumentList}: FinanceEntryPageLayoutProps<TData>) {
  const phone = useErpPhone();
  if (phone && phoneDocumentList) return <ErpListPage {...phoneDocumentList} phonePresentation="documents" phoneMetrics={metrics} pageFrame="finance" table={table.table} tabs={tabs && <FinanceSectionTabs label={tabs.label} items={tabs.items} />}  overlays={children} />;
  return (
    <ErpFinancePageFrame>
      <ErpPageHeader {...header} />
      {tabs && <FinanceSectionTabs label={tabs.label} items={tabs.items} />}
      <ErpPageToolbar>{filters}</ErpPageToolbar>
      {metrics}
      <ErpPageContent className="space-y-[var(--erp-page-gap)]">
        <FinanceTableRegion {...table} />
        {children}
      </ErpPageContent>
    </ErpFinancePageFrame>
  );
}
