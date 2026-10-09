import type {ReactNode} from "react";
import {
  DashboardSection,
  ErpDataTable,
  ErpListPage,
  ErpPageHeader,
  ErpPageToolbar,
  type ErpDataTableProps,
  type ErpPageHeaderProps,
} from "@/src/components/common";
import {FinanceSectionTabs, type FinanceSectionTab} from "./FinanceSectionTabs";

interface FinanceEntryTable<TData> {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  table: ErpDataTableProps<TData> & {
    mobileRow: NonNullable<ErpDataTableProps<TData>["mobileRow"]>;
  };
}

export interface FinanceEntryPageLayoutProps<TData> {
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
 * Finance entry lists share the global list-page layout; feature-owned filters,
 * columns, mutations and detail content stay unchanged.
 */
export function FinanceEntryPageLayout<TData>({header, tabs, metrics, filters, table, children}: FinanceEntryPageLayoutProps<TData>) {
  const tabContent = tabs ? <FinanceSectionTabs label={tabs.label} items={tabs.items} /> : undefined;
  const desktopTable = <DashboardSection title={table.title} description={table.description} actions={table.actions}>
    <ErpDataTable {...table.table} mobileRow={table.table.mobileRow} surface={table.table.surface ?? "card"} />
  </DashboardSection>;
  const phoneTable = <ErpDataTable {...table.table} mobileRow={table.table.mobileRow} surface="plain" mobilePagination={table.table.mobilePagination ?? "compact"} />;

  return <ErpListPage
    title={typeof header.title === "string" ? header.title : "财务明细"}
    phoneTitle={typeof header.title === "string" ? header.title : "财务明细"}
    tableTitle={typeof table.title === "string" ? table.title : "财务明细"}
    desktopTableSection={false}
    headerContent={<ErpPageHeader {...header} />}
    pageFrame="finance"
    tabs={tabContent}
    metricsContent={metrics}
    metricsPlacement="after-filters"
    desktopFilterContent={<ErpPageToolbar>{filters}</ErpPageToolbar>}
    phoneFilterContent={filters}
    desktopTableContent={desktopTable}
    phoneTableContent={phoneTable}
    overlays={children}
  />;
}
