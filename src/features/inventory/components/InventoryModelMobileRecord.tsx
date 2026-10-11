import {ArrowRight, Boxes, ChevronRight} from "lucide-react";
import {ErpEntityThumbnail} from "@/src/components/common/ErpEntityThumbnail";
import {Button} from "@/src/components/ui";
import type {InventoryModelSummary} from "@/src/types/inventory";

export function InventoryModelMobileRecord({row, onOpenLedger, onOpenCards}: {
  row: InventoryModelSummary;
  onOpenLedger: (row: InventoryModelSummary) => void;
  onOpenCards: (row: InventoryModelSummary) => void;
}) {
  const openLedger = () => onOpenLedger(row);

  return <div className="erp-inventory-model-phone-row" data-erp-component="inventory-model-phone-row">
    <Button type="button" variant="ghost" size="iconTouch" className="erp-inventory-model-phone-thumbnail" aria-label={`查看 ${row.productName} 出入明细`} onClick={openLedger}>
      <ErpEntityThumbnail name={row.productName} category={row.category} fallbackIcon={<Boxes className="h-5 w-5" aria-hidden="true" />} />
    </Button>
    <div className="erp-inventory-model-phone-content">
      <Button type="button" variant="ghost" className="erp-inventory-model-phone-title" aria-label={`查看 ${row.productName} 出入明细`} onClick={openLedger}>
        {row.productName}
      </Button>
      <div className="erp-inventory-model-phone-subtitle">
        <span>{row.category}</span>
      </div>
      <Button type="button" variant="ghost" size="xs" className="erp-inventory-model-phone-cards-action" aria-label={`查看 ${row.productName} 单卡库存`} onClick={() => onOpenCards(row)}>
        查看单卡<ArrowRight className="h-4 w-4" aria-hidden="true" />
      </Button>
      <Button type="button" variant="ghost" className="erp-inventory-model-phone-meta" aria-label={`查看 ${row.productName} 库存明细`} onClick={openLedger}>
        <span className="erp-inventory-model-phone-counts">
          <span>在库 {row.availableCount}</span>
          <span>待检 {row.pendingCount}</span>
          <span>锁定 {row.lockedCount}</span>
        </span>
        <span className="erp-inventory-model-phone-location">{row.warehouseLocations.join("、") || "未设置库位"}</span>
      </Button>
    </div>
    <div className="erp-inventory-model-phone-end">
      <div className="erp-inventory-model-phone-quantity" aria-label={`库存数量 ${row.totalCount} 件`}>
        <span className="erp-inventory-model-phone-quantity-label">库存数量</span>
        <span className="erp-inventory-model-phone-quantity-value"><span>{row.totalCount}</span><span className="erp-inventory-model-phone-quantity-unit">件</span></span>
      </div>
      <Button type="button" variant="ghost" size="iconTouch" aria-label={`查看 ${row.productName} 出入明细`} onClick={openLedger}>
        <ChevronRight className="h-5 w-5" aria-hidden="true" />
      </Button>
    </div>
  </div>;
}
