import type {ReactNode} from "react";
import {ErpDataTable, type ErpDataTableProps, DashboardSection} from "@/src/components/common";
import {useErpPhone} from "@/src/hooks/useErpViewport";

/** Shared finance list region: keeps table framing consistent while columns stay feature-owned. */
export function FinanceTableRegion<TData>({
  title,
  description,
  actions,
  table,
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  table: ErpDataTableProps<TData> & {
    mobileRow: NonNullable<ErpDataTableProps<TData>["mobileRow"]>;
  };
}) {
  const phone = useErpPhone();
  const content = (
    <ErpDataTable
      {...table}
      mobileRow={table.mobileRow}
      surface={table.surface ?? (phone ? "plain" : "card")}
      mobilePagination={table.mobilePagination ?? "compact"}
      ariaLabel={table.ariaLabel || (typeof title === "string" ? `${title}列表` : "财务数据列表")}
    />
  );
  if (phone) {
    return content;
  }
  return (
    <DashboardSection title={title} description={description} actions={actions}>
      {content}
    </DashboardSection>
  );
}
