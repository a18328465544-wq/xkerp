import {Plus, Trash2} from "lucide-react";
import {Controller, useWatch, type Control, type FieldArrayWithId, type UseFormSetValue} from "react-hook-form";
import {Button, Card, CardContent, Input} from "@/src/components/ui";
import {ErpAmountInput, ErpEmptyState} from "@/src/components/common";
import {InventoryItemPicker} from "@/src/components/domain";
import type {SalesFormValues, SalesProductCandidate} from "@/src/types/sales";
import {calculateSalesLineTotal, calculateSalesUnitPrice} from "@/src/features/sales/sales.calculations";

export function SalesLineItemsTable({
  control,
  setValue,
  fields,
  selectedCandidates,
  pickerKeyword,
  pickerOptions,
  pickerLoading,
  pickerError,
  pickerDisabled,
  onPickerKeywordChange,
  onPickerFocus,
  onPickerRetry,
  onCandidateSelect,
  onCandidateClear,
  onAdd,
  onRemove,
}: {
  control: Control<SalesFormValues>;
  setValue: UseFormSetValue<SalesFormValues>;
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
  const items = useWatch({control, name: "items"});

  return (
    <Card data-erp-component="transaction-line-items">
      <CardContent>
        <div className="overflow-hidden rounded-[var(--erp-radius-md)] border border-[var(--erp-color-border)]">
          <div className="erp-scrollbar max-h-[420px] overflow-auto">
            <table className="w-full min-w-[984px] table-fixed border-collapse text-sm">
              <colgroup>
                <col className="w-[320px]" />
                <col className="w-[96px]" />
                <col className="w-[132px]" />
                <col className="w-[132px]" />
                <col className="w-[220px]" />
                <col className="w-[84px]" />
              </colgroup>
              <thead className="erp-refresh-indicator-layer sticky top-0 bg-[var(--erp-color-surface-muted)]">
                <tr className="text-xs text-[var(--erp-color-text-secondary)]">
                  <th className="erp-table-sticky-edge-layer sticky left-0 border-b border-r border-[var(--erp-color-border)] bg-[var(--erp-color-surface-muted)] px-3 py-3 text-center font-semibold">
                    商品规格 / 可售库存
                  </th>
                  <th className="border-b border-r border-[var(--erp-color-border)] px-3 py-3 text-center font-semibold">
                    数量
                  </th>
                  <th className="border-b border-r border-[var(--erp-color-border)] px-3 py-3 text-center font-semibold">
                    销售单价(元)
                  </th>
                  <th className="border-b border-r border-[var(--erp-color-border)] px-3 py-3 text-center font-semibold">
                    销售总价(元)
                  </th>
                  <th className="border-b border-r border-[var(--erp-color-border)] px-3 py-3 text-center font-semibold">
                    备注
                  </th>
                  <th className="erp-table-sticky-edge-layer sticky right-0 border-b border-[var(--erp-color-border)] bg-[var(--erp-color-surface-muted)] px-3 py-3 text-center font-semibold">
                    操作
                  </th>
                </tr>
              </thead>
              <tbody>
                {fields.map((field, index) => {
                  const selected = selectedCandidates[field.id] || null;
                  const quantity = items[index]?.quantity || 1;
                  const lineTotal = calculateSalesLineTotal(quantity, items[index]?.sellPrice || 0);

                  return (
                    <tr
                      key={field.id}
                      className="group align-middle transition-colors hover:bg-[var(--erp-color-surface-muted)]/60 last:[&>td]:border-b-0"
                    >
                      <td className="erp-content-sticky-layer sticky left-0 border-b border-r border-[var(--erp-color-border)] bg-[var(--erp-color-surface)] px-3 py-2 group-hover:bg-[var(--erp-color-surface-muted)]">
                        <InventoryItemPicker
                          value={selected}
                          keyword={pickerKeyword(field.id)}
                          options={pickerOptions(field.id)}
                          loading={pickerLoading(field.id)}
                          error={pickerError?.(field.id)}
                          disabled={pickerDisabled}
                          onFocus={() => onPickerFocus(field.id)}
                          onKeywordChange={(value) => onPickerKeywordChange(field.id, value)}
                          onRetry={onPickerRetry}
                          onSelect={(option) => onCandidateSelect(field.id, index, option)}
                          onClear={() => onCandidateClear(field.id, index)}
                        />
                        {selected && (
                          <div className="mt-1.5 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-[var(--erp-color-text-muted)]">
                            <span className="break-words font-medium text-[var(--erp-color-text-secondary)]">
                              {selected.brand} {selected.model}
                            </span>
                            <span aria-hidden="true">·</span>
                            <span>{selected.vram || "无规格信息"}</span>
                            <span aria-hidden="true">·</span>
                            <span className="font-semibold text-[var(--erp-color-success)]">
                              可售 {selected.availableQuantity} 张
                            </span>
                          </div>
                        )}
                      </td>
                      <td className="border-b border-r border-[var(--erp-color-border)] px-3 py-2">
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
                              className="text-center font-mono font-semibold"
                              onChange={(event) => {
                                const requested = Math.max(1, Math.floor(Number(event.target.value) || 1));
                                const available = selected?.availableQuantity;
                                input.onChange(available && available > 0 ? Math.min(requested, available) : requested);
                              }}
                              onKeyDown={(event) => {
                                if (event.key === "Enter") {
                                  event.preventDefault();
                                  document.querySelector<HTMLElement>(`[aria-label="选择销售商品"]`)?.focus();
                                }
                              }}
                              aria-label={`第 ${index + 1} 行数量`}
                            />
                          )}
                        />
                      </td>
                      <td className="border-b border-r border-[var(--erp-color-border)] px-3 py-2">
                        <Controller
                          control={control}
                          name={`items.${index}.sellPrice`}
                          render={({field: input}) => (
                            <ErpAmountInput
                              value={input.value}
                              onBlur={input.onBlur}
                              onValueChange={(values) => input.onChange(Math.round(values.floatValue || 0))}
                              aria-label={`第 ${index + 1} 行销售单价`}
                            />
                          )}
                        />
                      </td>
                      <td className="border-b border-r border-[var(--erp-color-border)] px-3 py-2">
                        <ErpAmountInput
                          value={lineTotal}
                          onValueChange={(values) => {
                            const unitPrice = calculateSalesUnitPrice(values.floatValue || 0, quantity);
                            setValue(`items.${index}.sellPrice`, unitPrice, {
                              shouldDirty: true,
                              shouldValidate: true,
                            });
                          }}
                          aria-label={`第 ${index + 1} 行销售总价`}
                        />
                      </td>
                      <td className="border-b border-r border-[var(--erp-color-border)] px-3 py-2">
                        <Controller
                          control={control}
                          name={`items.${index}.remarks`}
                          render={({field: input}) => (
                            <Input
                              {...input}
                              className="text-center text-xs"
                              placeholder="客户特殊要求或包装说明"
                              aria-label={`第 ${index + 1} 行备注`}
                            />
                          )}
                        />
                      </td>
                      <td className="erp-content-sticky-layer sticky right-0 border-b border-[var(--erp-color-border)] bg-[var(--erp-color-surface)] px-3 py-2 text-center group-hover:bg-[var(--erp-color-surface-muted)]">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          aria-label={`删除第 ${index + 1} 行`}
                          onClick={() => onRemove(index)}
                          disabled={fields.length <= 1}
                        >
                          <Trash2 className="h-4 w-4 text-[var(--erp-color-danger)]" />
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="flex min-h-14 flex-wrap items-center justify-between gap-3 border-t border-[var(--erp-color-border)] bg-[var(--erp-color-surface-muted)]/40 px-3 py-2">
            <Button type="button" variant="secondary" size="sm" onClick={onAdd}>
              <Plus className="h-4 w-4" />
              增加一行商品
            </Button>
            <p className="text-xs text-[var(--erp-color-text-muted)]">
              提示：按商品规格汇总可售库存，已扣除待出库占用；出库时按单扫码核验绑定实物 SN。
            </p>
          </div>
        </div>
        {fields.length === 0 ? (
          <ErpEmptyState title="暂无销售明细" description="添加至少一行商品后才能提交销售单。" />
        ) : null}
      </CardContent>
    </Card>
  );
}
