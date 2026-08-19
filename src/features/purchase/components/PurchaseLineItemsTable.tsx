import {Plus, Trash2} from "lucide-react";
import {Controller, type Control, type FieldArrayWithId} from "react-hook-form";
import {Button, Card, CardContent, Input, Select} from "@/src/components/ui";
import {ErpAmountInput, ErpEmptyState} from "@/src/components/common";
import {formatCurrency} from "@/src/lib/format";
import type {PurchaseFormValues, PurchaseLineFormValue, PurchaseProductOption} from "@/src/types/purchase";

function productLabel(product: PurchaseProductOption) {
  return `${product.brand || "未标品牌"} ${product.model || product.name}${product.vram ? ` · ${product.vram}` : ""}`;
}

export function PurchaseLineItemsTable({control, fields, items, products, canEnterCost, showProfit, canCreateProduct, disabled, onProductSelect, onProductClear, onAdd, onRemove, onOpenCreateProduct}: {
  control: Control<PurchaseFormValues>;
  fields: FieldArrayWithId<PurchaseFormValues, "items", "id">[];
  items: PurchaseLineFormValue[];
  products: PurchaseProductOption[];
  /** Current purchase price entry follows purchase_add/form semantics, not historical showCost. */
  canEnterCost: boolean;
  showProfit: boolean;
  canCreateProduct?: boolean;
  disabled?: boolean;
  onProductSelect: (index: number, productId: string) => void;
  onProductClear: (index: number) => void;
  onAdd: () => void;
  onRemove: (index: number) => void;
  onOpenCreateProduct?: (index: number, initialName?: string) => void;
}) {
  return <Card><CardContent>
    {!products.length ? <div className="rounded-[var(--erp-radius-md)] border border-dashed border-[var(--erp-color-warning)] bg-[var(--erp-color-warning-soft)] px-4 py-3 text-sm text-[var(--erp-color-warning)]">当前没有可用商品规格，或当前账号没有商品读取权限。请先建立商品模板并确认 products 权限。</div> : null}
    <div className={`${!products.length ? "mt-3 " : ""}overflow-hidden rounded-[var(--erp-radius-md)] border border-[var(--erp-color-border)]`}>
      <div className="erp-scrollbar max-h-[420px] overflow-auto">
      <table className="w-full min-w-[1076px] table-fixed border-collapse text-sm">
        <colgroup><col className="w-[300px]" /><col className="w-[132px]" /><col className="w-[132px]" /><col className="w-[96px]" /><col className="w-[112px]" /><col className="w-[220px]" /><col className="w-[84px]" /></colgroup>
        <thead className="sticky top-0 erp-refresh-indicator-layer bg-[var(--erp-color-surface-muted)]"><tr className="text-xs text-[var(--erp-color-text-secondary)]"><th className="sticky left-0 erp-table-sticky-edge-layer border-b border-r border-[var(--erp-color-border)] bg-[var(--erp-color-surface-muted)] px-3 py-3 text-center font-semibold">商品型号</th><th className="border-b border-r border-[var(--erp-color-border)] px-3 py-3 text-center font-semibold">进货价(元)</th><th className="border-b border-r border-[var(--erp-color-border)] px-3 py-3 text-center font-semibold">预估售价(元)</th><th className="border-b border-r border-[var(--erp-color-border)] px-3 py-3 text-center font-semibold">数量</th><th className="border-b border-r border-[var(--erp-color-border)] px-3 py-3 text-center font-semibold">预计利润</th><th className="border-b border-r border-[var(--erp-color-border)] px-3 py-3 text-center font-semibold">备注</th><th className="sticky right-0 erp-table-sticky-edge-layer border-b border-[var(--erp-color-border)] bg-[var(--erp-color-surface-muted)] px-3 py-3 text-center font-semibold">操作</th></tr></thead>
        <tbody>{fields.map((field, index) => {
          const item = items[index] || field;
          const missingProductIdentity = (!item.productId || !item.productName.trim());
          const expectedProfit = (item.estSellPrice - item.buyPrice) * item.quantity;
          return <tr key={field.id} className="group align-middle last:[&>td]:border-b-0 hover:bg-[var(--erp-color-surface-muted)]/60">
            <td className="sticky left-0 erp-content-sticky-layer border-b border-r border-[var(--erp-color-border)] bg-[var(--erp-color-surface)] px-3 py-2 group-hover:bg-[var(--erp-color-surface-muted)]">
              <Controller control={control} name={`items.${index}.productId` as const} render={({field: input}) => <Select searchable searchPlaceholder="搜索商品…" emptyText="没有找到匹配的商品规格" className="min-w-0" value={input.value} options={products.map((product) => ({value: product.id, label: productLabel(product), labelText: productLabel(product), description: [product.category, product.version, product.vram].filter(Boolean).join(" · "), searchText: `${product.name} ${product.brand} ${product.model} ${product.version} ${product.vram}`}))} onValueChange={(value) => { input.onChange(value); onProductSelect(index, value); }} onClear={() => onProductClear(index)} quickCreateAction={canCreateProduct && onOpenCreateProduct ? {label: "新建商品", onClick: (searchText) => onOpenCreateProduct(index, searchText || item.productName), disabled} : undefined} disabled={disabled || (!products.length && !(canCreateProduct && onOpenCreateProduct))} placeholder={products.length ? "选择商品规格" : "搜索或新建商品"} aria-label={`第 ${index + 1} 行商品`} aria-invalid={missingProductIdentity} />} />
            </td>
            <td className="border-b border-r border-[var(--erp-color-border)] px-3 py-2">{canEnterCost ? <Controller control={control} name={`items.${index}.buyPrice` as const} render={({field: input}) => <ErpAmountInput value={input.value} onBlur={input.onBlur} onValueChange={(detail) => input.onChange(detail.floatValue || 0)} disabled={disabled} aria-label={`第 ${index + 1} 行进货价`} />} /> : <span className="flex h-10 items-center justify-center rounded-[var(--erp-radius-md)] bg-[var(--erp-color-surface-muted)] px-2 text-xs text-[var(--erp-color-text-muted)]">不可录入</span>}</td>
            <td className="border-b border-r border-[var(--erp-color-border)] px-3 py-2">{showProfit ? <Controller control={control} name={`items.${index}.estSellPrice` as const} render={({field: input}) => <ErpAmountInput value={input.value} onBlur={input.onBlur} onValueChange={(detail) => input.onChange(detail.floatValue || 0)} disabled={disabled} aria-label={`第 ${index + 1} 行预估售价`} />} /> : <span className="flex h-10 items-center justify-center rounded-[var(--erp-radius-md)] bg-[var(--erp-color-surface-muted)] px-2 text-xs text-[var(--erp-color-text-muted)]">—</span>}</td>
            <td className="border-b border-r border-[var(--erp-color-border)] px-3 py-2">
              <Controller control={control} name={`items.${index}.quantity` as const} render={({field: input}) => <Input {...input} type="number" min={1} step={1} className="text-center font-mono font-semibold" onChange={(event) => input.onChange(Math.max(1, Number(event.target.value) || 1))} disabled={disabled} aria-label={`第 ${index + 1} 行数量`} />} />
            </td>
            <td className="border-b border-r border-[var(--erp-color-border)] px-3 py-2 text-center"><span className={`whitespace-nowrap font-mono text-sm font-bold ${expectedProfit < 0 ? "text-[var(--erp-color-danger)]" : expectedProfit > 0 ? "text-[var(--erp-color-success)]" : "text-[var(--erp-color-text)]"}`}>{canEnterCost && showProfit ? formatCurrency(expectedProfit) : "—"}</span></td>
            <td className="border-b border-r border-[var(--erp-color-border)] px-3 py-2"><Controller control={control} name={`items.${index}.remarks` as const} render={({field: input}) => <Input {...input} className="text-center text-xs" placeholder="商品来源、包装或谈价说明" disabled={disabled} aria-label={`第 ${index + 1} 行备注`} />} /></td>
            <td className="sticky right-0 erp-content-sticky-layer border-b border-[var(--erp-color-border)] bg-[var(--erp-color-surface)] px-3 py-2 text-center group-hover:bg-[var(--erp-color-surface-muted)]"><Button type="button" variant="ghost" size="icon" aria-label={`删除第 ${index + 1} 行`} onClick={() => onRemove(index)} disabled={disabled || fields.length <= 1}><Trash2 className="h-4 w-4 text-[var(--erp-color-danger)]" /></Button></td>
          </tr>;
        })}</tbody>
      </table>
      </div>
      <div className="flex min-h-14 flex-wrap items-center justify-between gap-3 border-t border-[var(--erp-color-border)] bg-[var(--erp-color-surface-muted)]/40 px-3 py-2"><Button type="button" variant="secondary" size="sm" onClick={onAdd} disabled={disabled}><Plus className="h-4 w-4" />增加一行商品</Button><p className="text-xs text-[var(--erp-color-text-muted)]">提示：数量可录入同型号多张；显卡入库后在“检测质检”绑定 SN。</p></div>
    </div>
    {fields.length === 0 ? <ErpEmptyState title="暂无采购明细" description="添加至少一行商品后才能提交采购单。" /> : null}
  </CardContent></Card>;
}
