import type {ReactNode} from "react";
import {ErpDataTable, type ErpDataTableProps, DashboardSection} from "@/src/components/common";
import {useErpPhone} from "@/src/hooks/useErpViewport";

/**
 * Shared finance list region: keeps table framing consistent while columns stay feature-owned.
 * Every viewport keeps the titled section, so phone finance pages all read
 * 「指标 → X明细」 like transfers and ledger; phone rows sit flat inside it.
 */
export function FinanceTableRegion<TData>({
  title,
  count,
  description,
  actions,
  table,
}: {
  title: ReactNode;
  count?: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  table: ErpDataTableProps<TData> & {
    mobileRow: NonNullable<ErpDataTableProps<TData>["mobileRow"]>;
  };
}) {
  const phone = useErpPhone();
  return (
    <DashboardSection title={title} count={count} description={description} actions={actions}>
      <ErpDataTable
        {...table}
        mobileRow={table.mobileRow}
        surface={table.surface ?? (phone ? "plain" : "card")}
        mobilePagination={table.mobilePagination ?? "compact"}
        ariaLabel={table.ariaLabel || (typeof title === "string" ? `${title}列表` : "财务数据列表")}
      />
    </DashboardSection>
  );
}
