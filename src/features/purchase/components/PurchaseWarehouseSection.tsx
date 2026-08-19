import {ClipboardCheck, PackageCheck, ScanLine} from "lucide-react";
import {ErpFormSection, ErpStatusBadge} from "@/src/components/common";
import type {PurchaseLineFormValue} from "@/src/types/purchase";

export function PurchaseWarehouseSection({items}: {items: PurchaseLineFormValue[]}) {
  const filled = items.filter((item) => item.productId);
  const gpuCount = filled.filter((item) => item.category === "显卡").reduce((sum, item) => sum + item.quantity, 0);
  const accessoryCount = filled.filter((item) => item.category !== "显卡").reduce((sum, item) => sum + item.quantity, 0);
  return <ErpFormSection title="检测与入库阶段" description="采购页不提前设定物理商品的 SN、成色、库位或库存状态。">
    <div className="grid gap-3 md:grid-cols-3"><div className="flex items-start gap-3 rounded-[var(--erp-radius-md)] border border-[var(--erp-color-border)] bg-[var(--erp-color-surface-muted)] p-3"><ScanLine className="mt-0.5 h-5 w-5 shrink-0 text-[var(--erp-color-primary)]" /><div><p className="text-sm font-semibold">显卡待质检</p><p className="mt-1 text-xs text-[var(--erp-color-text-secondary)]">{gpuCount} 件，在检测质检中绑定 SN，并确认成色、质保和结论。</p><ErpStatusBadge label="质检阶段确认" tone="info" /></div></div><div className="flex items-start gap-3 rounded-[var(--erp-radius-md)] border border-[var(--erp-color-border)] bg-[var(--erp-color-surface-muted)] p-3"><PackageCheck className="mt-0.5 h-5 w-5 shrink-0 text-[var(--erp-color-success)]" /><div><p className="text-sm font-semibold">配件后续处理</p><p className="mt-1 text-xs text-[var(--erp-color-text-secondary)]">{accessoryCount} 件，按服务端现有品类规则进入检测与入库流程。</p><ErpStatusBadge label="不提前改库存" tone="neutral" /></div></div><div className="flex items-start gap-3 rounded-[var(--erp-radius-md)] border border-[var(--erp-color-border)] bg-[var(--erp-color-surface-muted)] p-3"><ClipboardCheck className="mt-0.5 h-5 w-5 shrink-0 text-[var(--erp-color-warning)]" /><div><p className="text-sm font-semibold">采购单阶段</p><p className="mt-1 text-xs text-[var(--erp-color-text-secondary)]">此处只确认商品、数量、价格、来源和付款，不代表已正式入库。</p><ErpStatusBadge label="保持阶段边界" tone="warning" /></div></div></div>
  </ErpFormSection>;
}
