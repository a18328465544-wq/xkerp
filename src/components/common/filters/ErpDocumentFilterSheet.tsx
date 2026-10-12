import {useState} from "react";
import {RotateCcw} from "lucide-react";
import {Button} from "@/src/components/ui";
import type {DateRangeValue} from "@/src/lib/dateRangePickerUtils";
import {ErpDialogShell} from "../ErpDialogShell";
import {ErpFilterFields, type ErpFilterField} from "./ErpFilterFields";

export type ErpFilterDraft = Record<string, string | boolean | DateRangeValue>;
export function filterDraftValues(fields: readonly ErpFilterField[], defaults = false): ErpFilterDraft {
  return Object.fromEntries(fields.map((field) => [field.key, field.kind === "checkbox"
    ? defaults ? field.defaultChecked ?? false : field.checked
    : defaults ? field.defaultValue ?? (field.kind === "dateRange" ? {startDate: "", endDate: ""} : "") : field.value]));
}
export function filterFieldsWithDraft(fields: readonly ErpFilterField[], draft: ErpFilterDraft, update: (key: string, value: ErpFilterDraft[string]) => void): ErpFilterField[] {
  return fields.map((field): ErpFilterField => {
    if (field.kind === "checkbox") return {...field, checked: Boolean(draft[field.key]), onChange: (value: boolean) => update(field.key, value)};
    if (field.kind === "dateRange") return {...field, value: draft[field.key] as DateRangeValue, onChange: (value: DateRangeValue) => update(field.key, value)};
    return {...field, value: String(draft[field.key] ?? ""), onChange: (value: string) => update(field.key, value)};
  });
}
/** Mount only while open: each opening starts from applied criteria, not a cancelled draft. */
export function ErpDocumentFilterSheet({title, fields, onClose, onApply}: {
  title: string;
  fields: readonly ErpFilterField[];
  onClose: () => void;
  onApply: (values: ErpFilterDraft) => void;
}) {
  const [draft, setDraft] = useState(() => filterDraftValues(fields));
  return <ErpDialogShell open onOpenChange={(open) => {if (!open) onClose();}} title={title} mobilePresentation="sheet"
    footer={<><Button type="button" variant="secondary" onClick={() => setDraft(filterDraftValues(fields, true))}><RotateCcw className="h-4 w-4" />重置</Button><Button type="button" variant="primary" onClick={() => {onApply(draft); onClose();}}>应用筛选</Button></>}>
    <ErpFilterFields layout="sheet" fields={filterFieldsWithDraft(fields, draft, (key, value) => setDraft((current) => ({...current, [key]: value})))} />
  </ErpDialogShell>;
}
