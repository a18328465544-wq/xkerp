import "@tanstack/react-table";
import type {RowData} from "@tanstack/react-table";

/** Where a column's value goes in the phone list row built by ErpDataTable.
 * Columns without a role are not shown on phones. */
export type ErpMobileColumnRole = "title" | "subtitle" | "meta" | "amount" | "status" | "image" | "thumbnail";

declare module "@tanstack/react-table" {
  // TData/TValue must match the library's declaration to merge.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  interface ColumnMeta<TData extends RowData, TValue> {
    mobile?: ErpMobileColumnRole;
    /** Small label above the amount, e.g. 「毛利」「应收」. */
    mobileLabel?: string;
    /** Document numbers and SN read better in tabular figures. */
    mobileMono?: boolean;
  }
}
