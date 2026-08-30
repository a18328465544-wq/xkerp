import {Plus, Trash2} from "lucide-react";
import {Controller, type Control, type FieldArrayWithId} from "react-hook-form";
import {Button, Card, CardContent, Input} from "@/src/components/ui";
import {ErpAmountInput, ErpStatusBadge} from "@/src/components/common";
import {InventoryItemPicker} from "@/src/components/domain";
import type {SalesFormValues, SalesProductCandidate} from "@/src/types/sales";

export function SalesLineItemsTable({control, fields, selectedCandidates, pickerKeyword, pickerOptions, pickerLoading, pickerError, pickerDisabled, onPickerKeywordChange, onPickerFocus, onPickerRetry, onCandidateSelect, onCandidateClear, onAdd, onRemove}: {
  control: Control<SalesFormValues>;
  fields: FieldArrayWithId<SalesFormValues, "items", "id">[];
  selectedCandidates: Record<string, SalesProductCandidate | null>;
  pickerKeyword: (fieldId: string) => string;
  pickerOptions: (fieldId: string) => SalesProductCandidate[];
  pickerLoading: (fieldId: string) => boolean;
  pickerError?: (fieldId: string) => string | undefined;
  pickerDisabled?: boolean;
  onPickerKeywordChange: (fieldId: string, value: string) => void;
  onPickerFocus: (fieldId: string) => void;
  onPickerRetry: () => void;
  onCandidateSelect: (fieldId: string, index: number, option: SalesProductCandidate) => void;
  onCandidateClear: (fieldId: string, index: number) => void;
  onAdd: () => void;
  onRemove: (index: number) => void;
}) {
  return <Card data-erp-component="transaction-line-items"><CardContent className="p-3 sm:p-4">
    <div className="hidden grid-cols-[minmax(0,2.2fr)_5rem_9rem_8rem_minmax(0,1.6fr)_3rem] gap-0 border-b border-[var(--erp-color-border)] pb-2 text-left text-xs font-semibold text-[var(--erp-color-text-secondary)] sm:grid">
      <div className="px-2">商品 / 可售数量</div>
      <div className="px-2">数量</div>
      <div className="px-2">销售价</div>
      <div className="px-2">状态</div>
      <div className="px-2">备注</div>
      <div aria-hidden="true" />
    </div>
    <div className="space-y-3 sm:space-y-0">{fields.map((field, index) => {
      const selected = selectedCandidates[field.id] || null;
      return <div key={field.id} className="relative grid min-w-0 grid-cols-2 gap-x-3 gap-y-3 rounded-[var(--erp-radius-lg)] border border-[var(--erp-color-border)] p-3 sm:grid-cols-[minmax(0,2.2fr)_5rem_9rem_8rem_minmax(0,1.6fr)_3rem] sm:gap-0 sm:rounded-none sm:border-x-0 sm:border-t-0 sm:px-2 sm:py-3 sm:last:border-0">
        <div className="col-span-2 min-w-0 pr-10 sm:col-span-1 sm:pr-0">
          <InventoryItemPicker value={selected} keyword={pickerKeyword(field.id)} options={pickerOptions(field.id)} loading={pickerLoading(field.id)} error={pickerError?.(field.id)} disabled={pickerDisabled} onFocus={() => onPickerFocus(field.id)} onKeywordChange={(value) => onPickerKeywordChange(field.id, value)} onRetry={onPickerRetry} onSelect={(option) => onCandidateSelect(field.id, index, option)} onClear={() => onCandidateClear(field.id, index)} />
          {selected && <div className="mt-2 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-xs text-[var(--erp-color-text-muted)]"><span className="break-words">{selected.brand} {selected.model}</span><span aria-hidden="true">·</span><span>{selected.vram || "无规格信息"}</span><span aria-hidden="true">·</span><span className="text-[var(--erp-color-success)]">可售 {selected.availableQuantity} 张</span><span aria-hidden="true">·</span><span>出库时扫码绑定 SN</span></div>}
        </div>
        <div className="min-w-0 sm:px-2">
          <span className="mb-1 block text-[11px] font-semibold text-[var(--erp-color-text-secondary)] sm:hidden">数量</span>
          <Controller
            control={control}
            name={`items.${index}.quantity`}
            render={({field: input}) => (
              <Input
                {...input}
                type="number"
                min={1}
                max={selected?.availableQuantity || undefined}
                step={1}
                className="w-full sm:w-20"
                onChange={(event) => {
                  const requested = Math.max(1, Math.floor(Number(event.target.value) || 1));
                  const available = selected?.availableQuantity;
                  input.onChange(available && available > 0 ? Math.min(requested, available) : requested);
                }}
                onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); document.querySelector<HTMLElement>(`[aria-label="选择销售商品"]`)?.focus(); } }}
                aria-label={`第 ${index + 1} 行数量`}
              />
            )}
          />
        </div>
        <div className="min-w-0 sm:px-2">
          <span className="mb-1 block text-[11px] font-semibold text-[var(--erp-color-text-secondary)] sm:hidden">销售价</span>
          <Controller
            control={control}
            name={`items.${index}.sellPrice`}
            render={({field: input}) => (
              <ErpAmountInput
                value={input.value}
                onBlur={input.onBlur}
                onValueChange={(values) => input.onChange(Math.round(values.floatValue || 0))}
                aria-label={`第 ${index + 1} 行销售价`}
              />
            )}
          />
        </div>
        <div className="col-span-2 min-w-0 sm:col-span-1 sm:px-2">
          <span className="mb-1 block text-[11px] font-semibold text-[var(--erp-color-text-secondary)] sm:hidden">状态</span>
          {selected ? <ErpStatusBadge label={selected.saleable ? `可售 ${selected.availableQuantity} 张 · 待出库绑定 SN` : "可售数量不足"} tone={selected.saleable ? "success" : "danger"} /> : <span className="text-xs text-[var(--erp-color-text-muted)]">待选择</span>}
        </div>
        <div className="col-span-2 min-w-0 sm:col-span-1 sm:px-2">
          <span className="mb-1 block text-[11px] font-semibold text-[var(--erp-color-text-secondary)] sm:hidden">备注</span>
          <Controller
            control={control}
            name={`items.${index}.remarks`}
            render={({field: input}) => <Input {...input} placeholder="明细备注（可选）" aria-label={`第 ${index + 1} 行备注`} />}
          />
        </div>
        <div className="absolute right-2 top-2 sm:static sm:flex sm:justify-end sm:px-2">
          <Button type="button" variant="ghost" size="iconTouch" aria-label={`删除第 ${index + 1} 行`} onClick={() => onRemove(index)} disabled={fields.length <= 1}><Trash2 className="h-4 w-4 text-[var(--erp-color-danger)]" /></Button>
        </div>
      </div>;
    })}</div><div className="mt-4 flex flex-wrap items-center justify-between gap-3"><Button type="button" variant="secondary" size="sm" onClick={onAdd}><Plus className="h-4 w-4" />增加商品</Button><p className="text-xs text-[var(--erp-color-text-muted)]">按商品汇总可售数量，已扣除待出库订单占用；出库时再扫码绑定 SN。</p></div>
  </CardContent></Card>;
}
