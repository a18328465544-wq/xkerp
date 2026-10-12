import {Input, Select} from "@/src/components/ui";
import type {DateRangeValue} from "@/src/lib/dateRangePickerUtils";
import {cn} from "@/src/lib/cn";
import {ErpCheckboxField} from "../ErpCheckboxField";
import {ErpChoiceChips} from "../ErpChoiceChips";
import {ErpDateRangePicker} from "../ErpDateRangePicker";
import type {ErpActiveFilterTag} from "./ErpFilterTags";

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
  | ErpFilterFieldBase & {kind: "select"; value: string; defaultValue: string; options: readonly ErpFilterOption[]; onChange: (value: string) => void;
    /** Phone sheet presentation (DESIGN.md decision order). `chips` is only for a
     * fixed enum of at most 6 short options written in code; options read from
     * data (accounts, staff, categories) keep the default picker row. */
    phoneControl?: "chips" | "picker"}
  | ErpFilterFieldBase & {kind: "dateRange"; value: DateRangeValue; defaultValue?: DateRangeValue; onChange: (value: DateRangeValue) => void}
  | ErpFilterFieldBase & {kind: "text"; value: string; defaultValue?: string; placeholder?: string; onChange: (value: string) => void}
  | ErpFilterFieldBase & {kind: "checkbox"; checked: boolean; defaultChecked?: boolean; onChange: (checked: boolean) => void};

export function isErpFilterFieldActive(field: ErpFilterField) {
  if (field.kind === "checkbox") return field.checked !== (field.defaultChecked ?? false);
  if (field.kind === "dateRange") {
    const fallback = field.defaultValue ?? {startDate: "", endDate: ""};
    return field.value.startDate !== fallback.startDate || field.value.endDate !== fallback.endDate;
  }
  return field.value !== (field.defaultValue ?? "");
}

export function countActiveErpFilterFields(fields: readonly ErpFilterField[]) {
  return fields.filter(isErpFilterFieldActive).length;
}

/** Most choice chips a phone filter field may show, not counting its 「全部」
 * default; longer lists use the picker row. */
export const ERP_FILTER_CHIP_LIMIT = 6;
/** Picker rows open a searchable list once the options no longer fit on one screen. */
const PICKER_SEARCH_THRESHOLD = 12;

export function erpFilterPhoneControl(field: ErpFilterField): "chips" | "picker" | "field" {
  if (field.kind !== "select") return "field";
  const choices = field.options.filter((option) => option.value !== field.defaultValue).length;
  return field.phoneControl === "chips" && choices <= ERP_FILTER_CHIP_LIMIT ? "chips" : "picker";
}

/** Chips sit under the field label, so 「全部收款状态」 reads as 「全部」. */
function chipOptions(field: Extract<ErpFilterField, {kind: "select"}>) {
  return field.options.map((option) => ({value: option.value, label: option.value === field.defaultValue && option.label.startsWith("全部") ? "全部" : option.label}));
}

function shortDate(value: string) {
  return value.startsWith(`${new Date().getFullYear()}-`) ? value.slice(5) : value;
}

/** Describe the active fields as removable tags: 「渠道：闲鱼」, 「日期：10-01 至 10-31」. */
export function getActiveErpFilterTags(fields: readonly ErpFilterField[]): ErpActiveFilterTag[] {
  return fields.filter(isErpFilterFieldActive).map((field) => {
    if (field.kind === "checkbox") return {key: field.key, label: field.label, onRemove: () => field.onChange(field.defaultChecked ?? false)};
    if (field.kind === "dateRange") {
      const {startDate, endDate} = field.value;
      const range = startDate && endDate ? `${shortDate(startDate)} 至 ${shortDate(endDate)}` : startDate ? `${shortDate(startDate)} 起` : `至 ${shortDate(endDate)}`;
      return {key: field.key, label: `${field.label}：${range}`, onRemove: () => field.onChange(field.defaultValue ?? {startDate: "", endDate: ""})};
    }
    if (field.kind === "select") return {key: field.key, label: `${field.label}：${field.options.find((option) => option.value === field.value)?.label ?? field.value}`, onRemove: () => field.onChange(field.defaultValue)};
    return {key: field.key, label: `${field.label}：${field.value}`, onRemove: () => field.onChange(field.defaultValue ?? "")};
  });
}

function FilterControl({field, layout}: {field: ErpFilterField; layout: "bar" | "sheet"}) {
  // A bar control without a width would stretch across the whole filter row.
  const width = layout === "sheet" ? "w-full" : field.width ?? "w-36";
  if (field.kind === "checkbox") return <ErpCheckboxField className={layout === "bar" ? "min-h-9 px-2 py-1.5 text-xs" : undefined} variant={layout === "sheet" ? "card" : "inline"} label={field.label} checked={field.checked} onChange={(event) => field.onChange(event.target.checked)} />;
  if (field.kind === "select") return <Select className={width} value={field.value} options={field.options} onValueChange={field.onChange} aria-label={field.label} />;
  if (field.kind === "dateRange") return <ErpDateRangePicker value={field.value} onChange={field.onChange} density={layout === "bar" ? "compact" : "default"} triggerClassName={layout === "bar" ? field.width ?? "sm:w-36" : "w-full"} ariaLabel={field.label} startAriaLabel={`${field.label}开始`} endAriaLabel={`${field.label}结束`} />;
  return <Input className={width} value={field.value} onChange={(event) => field.onChange(event.target.value)} placeholder={field.placeholder ?? field.label} aria-label={field.label} />;
}

/** Picker row: 「标签 … 值 ›」. The select trigger fills the row, so the whole
 * row opens the list; the visible label is decoration over its left edge. */
function FilterPickerRow({field}: {field: Extract<ErpFilterField, {kind: "select"}>}) {
  return <div data-erp-filter-field={field.key} data-erp-filter-control="picker" data-active={isErpFilterFieldActive(field) || undefined} className="erp-filter-picker-row">
    <span aria-hidden="true" className="erp-filter-picker-label">{field.label}</span>
    <Select className="erp-filter-picker-select" value={field.value} options={field.options} onValueChange={field.onChange} aria-label={field.label} searchable={field.options.length > PICKER_SEARCH_THRESHOLD} phoneDialogTitle={field.label} searchPlaceholder={`搜索${field.label}`} />
  </div>;
}

export function ErpFilterFields({fields, layout}: {fields: readonly ErpFilterField[]; layout: "bar" | "sheet"}) {
  if (layout === "bar") return <>{fields.map((field) => <FilterControl key={field.key} field={field} layout="bar" />)}</>;
  return <div data-erp-region="phone-filter-fields" className="grid min-w-0 gap-4">
    {fields.map((field) => {
      const control = erpFilterPhoneControl(field);
      if (field.kind === "checkbox") return <div key={field.key} data-erp-filter-field={field.key}><FilterControl field={field} layout="sheet" /></div>;
      if (field.kind === "select" && control === "picker") return <FilterPickerRow key={field.key} field={field} />;
      return <div key={field.key} data-erp-filter-field={field.key} data-erp-filter-control={control === "chips" ? "chips" : undefined} className="grid min-w-0 gap-2">
        <span className={cn("text-erp-sm font-medium text-[var(--erp-color-text-secondary)]", isErpFilterFieldActive(field) && "text-[var(--erp-color-text)]")}>{field.label}</span>
        {field.kind === "select" && control === "chips" ? <ErpChoiceChips label={field.label} value={field.value} options={chipOptions(field)} onValueChange={field.onChange} /> : <FilterControl field={field} layout="sheet" />}
      </div>;
    })}
  </div>;
}
