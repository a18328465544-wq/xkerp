import {Input, Select} from "@/src/components/ui";
import type {DateRangeValue} from "@/src/lib/dateRangePickerUtils";
import {cn} from "@/src/lib/cn";
import {ErpDateRangePicker} from "../ErpDateRangePicker";

export interface ErpFilterOption {value: string; label: string}

interface ErpFilterFieldBase {
  key: string;
  /** Field name in the phone sheet and the control's accessible name. */
  label: string;
  /** Desktop width utility, e.g. `w-36`. Phones always use the full width. */
  width?: string;
}

/** One filter definition renders both the desktop filter bar and the phone
 * filter sheet; the active count comes from comparing value with defaultValue. */
export type ErpFilterField =
  | ErpFilterFieldBase & {kind: "select"; value: string; defaultValue: string; options: readonly ErpFilterOption[]; onChange: (value: string) => void}
  | ErpFilterFieldBase & {kind: "dateRange"; value: DateRangeValue; defaultValue?: DateRangeValue; onChange: (value: DateRangeValue) => void}
  | ErpFilterFieldBase & {kind: "text"; value: string; defaultValue?: string; placeholder?: string; onChange: (value: string) => void};

export function isErpFilterFieldActive(field: ErpFilterField) {
  if (field.kind === "dateRange") {
    const fallback = field.defaultValue ?? {startDate: "", endDate: ""};
    return field.value.startDate !== fallback.startDate || field.value.endDate !== fallback.endDate;
  }
  return field.value !== (field.defaultValue ?? "");
}

export function countActiveErpFilterFields(fields: readonly ErpFilterField[]) {
  return fields.filter(isErpFilterFieldActive).length;
}

function FilterControl({field, layout}: {field: ErpFilterField; layout: "bar" | "sheet"}) {
  const width = layout === "sheet" ? "w-full" : field.width;
  if (field.kind === "select") return <Select className={width} value={field.value} options={field.options} onValueChange={field.onChange} aria-label={field.label} />;
  if (field.kind === "dateRange") return <ErpDateRangePicker value={field.value} onChange={field.onChange} density={layout === "bar" ? "compact" : "default"} triggerClassName={layout === "bar" ? field.width ?? "sm:w-36" : "w-full"} ariaLabel={field.label} startAriaLabel={`${field.label}开始`} endAriaLabel={`${field.label}结束`} />;
  return <Input className={width} value={field.value} onChange={(event) => field.onChange(event.target.value)} placeholder={field.placeholder ?? field.label} aria-label={field.label} />;
}

export function ErpFilterFields({fields, layout}: {fields: readonly ErpFilterField[]; layout: "bar" | "sheet"}) {
  if (layout === "bar") return <>{fields.map((field) => <FilterControl key={field.key} field={field} layout="bar" />)}</>;
  return <div data-erp-region="phone-filter-fields" className="grid min-w-0 gap-4">
    {fields.map((field) => <div key={field.key} data-erp-filter-field={field.key} className="grid min-w-0 gap-1.5">
      <span className={cn("text-erp-sm font-medium text-[var(--erp-color-text-secondary)]", isErpFilterFieldActive(field) && "text-[var(--erp-color-text)]")}>{field.label}</span>
      <FilterControl field={field} layout="sheet" />
    </div>)}
  </div>;
}
