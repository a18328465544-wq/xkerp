import {Plus, Trash2} from "lucide-react";
import {Controller, type Control, type FieldArrayWithId} from "react-hook-form";
import {Button, Card, CardContent, Input} from "@/src/components/ui";
import {ErpAmountInput, ErpStatusBadge} from "@/src/components/common";
import {InventoryItemPicker} from "@/src/components/domain";
import type {SalesFormValues, SalesInventoryCandidate} from "@/src/types/sales";

export function SalesLineItemsTable({control, fields, selectedCandidates, pickerKeyword, pickerOptions, pickerLoading, pickerError, pickerDisabled, onPickerKeywordChange, onPickerRetry, onCandidateSelect, onCandidateClear, onAdd, onRemove}: {
  control: Control<SalesFormValues>;
  fields: FieldArrayWithId<SalesFormValues, "items", "id">[];
  selectedCandidates: Record<string, SalesInventoryCandidate | null>;
  pickerKeyword: string;
  pickerOptions: SalesInventoryCandidate[];
  pickerLoading: boolean;
  pickerError?: string;
  pickerDisabled?: boolean;
  onPickerKeywordChange: (value: string) => void;
  onPickerRetry: () => void;
  onCandidateSelect: (fieldId: string, index: number, option: SalesInventoryCandidate) => void;
  onCandidateClear: (fieldId: string, index: number) => void;
  onAdd: () => void;
  onRemove: (index: number) => void;
}) {
  return <Card><CardContent className="p-4">
    <div className="overflow-x-auto"><table className="w-full min-w-[1060px] border-collapse text-left text-sm"><thead><tr className="border-b border-[var(--erp-color-border)] text-xs text-[var(--erp-color-text-secondary)]"><th className="w-[36%] px-2 py-3 font-semibold">商品 / 库存候选</th><th className="w-20 px-2 py-3 font-semibold">数量</th><th className="w-36 px-2 py-3 font-semibold">销售价</th><th className="w-32 px-2 py-3 font-semibold">状态</th><th className="w-52 px-2 py-3 font-semibold">备注</th><th className="w-12 px-2 py-3" /></tr></thead><tbody>{fields.map((field, index) => {
      const selected = selectedCandidates[field.id] || null;
      return <tr key={field.id} className="border-b border-[var(--erp-color-border)] align-top last:border-0"><td className="px-2 py-3"><InventoryItemPicker value={selected} keyword={pickerKeyword} options={pickerOptions} loading={pickerLoading} error={pickerError} disabled={pickerDisabled} onKeywordChange={onPickerKeywordChange} onRetry={onPickerRetry} onSelect={(option) => onCandidateSelect(field.id, index, option)} onClear={() => onCandidateClear(field.id, index)} />{selected && <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-[var(--erp-color-text-muted)]"><span>{selected.brand} {selected.model}</span><span>·</span><span>{selected.vram || "无显存信息"}</span><span>·</span><span>{selected.serialNumber ? `可检索 SN：${selected.serialNumber}` : "SN 将在出库阶段绑定"}</span></div>}</td><td className="px-2 py-3"><Controller control={control} name={`items.${index}.quantity`} render={({field: input}) => <Input {...input} type="number" min={1} step={1} className="w-20" onChange={(event) => input.onChange(Math.max(1, Number(event.target.value) || 1))} aria-label={`第 ${index + 1} 行数量`} />} /></td><td className="px-2 py-3"><Controller control={control} name={`items.${index}.sellPrice`} render={({field: input}) => <ErpAmountInput value={input.value} onBlur={input.onBlur} onValueChange={(values) => input.onChange(Math.round(values.floatValue || 0))} aria-label={`第 ${index + 1} 行销售价`} />} /></td><td className="px-2 py-3">{selected ? <ErpStatusBadge label={selected.saleable ? "可销售候选（待出库绑定 SN）" : "不可销售"} tone={selected.saleable ? "success" : "danger"} /> : <span className="text-xs text-[var(--erp-color-text-muted)]">待选择</span>}</td><td className="px-2 py-3"><Controller control={control} name={`items.${index}.remarks`} render={({field: input}) => <Input {...input} placeholder="明细备注（可选）" aria-label={`第 ${index + 1} 行备注`} />} /></td><td className="px-2 py-3"><Button type="button" variant="ghost" size="icon" aria-label={`删除第 ${index + 1} 行`} onClick={() => onRemove(index)} disabled={fields.length <= 1}><Trash2 className="h-4 w-4 text-[var(--erp-color-danger)]" /></Button></td></tr>;
    })}</tbody></table></div><div className="mt-4 flex flex-wrap items-center justify-between gap-3"><Button type="button" variant="secondary" size="sm" onClick={onAdd}><Plus className="h-4 w-4" />增加商品</Button><p className="text-xs text-[var(--erp-color-text-muted)]">库存候选来自当前可售库存，重复候选会被表单拦截。</p></div>
  </CardContent></Card>;
}
