import {ArrowRight, ChevronRight, MapPin} from "lucide-react";
import {ErpEntityThumbnail} from "@/src/components/common/ErpEntityThumbnail";
import {Button} from "@/src/components/ui";
import type {InventoryModelSummary} from "@/src/types/inventory";

export function InventoryModelMobileRecord({row, onOpenLedger, onOpenCards}: {
  row: InventoryModelSummary;
  onOpenLedger: (row: InventoryModelSummary) => void;
  onOpenCards: (row: InventoryModelSummary) => void;
}) {
  const openLedger = () => onOpenLedger(row);
  // Only render supplied identity facts; never infer a brand, socket or capacity.
  const specifications = [...new Set([row.brand, row.model, row.vram]
    .map((value) => value.trim())
    .filter((value) => value && value !== row.category && value !== row.productName && !["未标注品牌", "未标注型号"].includes(value)))];

  return <div className="erp-inventory-model-phone-row" data-erp-component="inventory-model-phone-row">
    <Button type="button" variant="ghost" size="iconTouch" className="erp-inventory-model-phone-thumbnail" aria-label={`查看 ${row.productName} 出入明细`} onClick={openLedger}>
      <ErpEntityThumbnail name={row.productName} category={row.category} />
    </Button>
    <div className="erp-inventory-model-phone-content">
      <Button type="button" variant="ghost" className="erp-inventory-model-phone-title" aria-label={`查看 ${row.productName} 出入明细，库存数量 ${row.totalCount} 件`} onClick={openLedger}>
        <span className="erp-inventory-model-phone-name">{row.productName}</span>
        <span className="erp-inventory-model-phone-subtitle">
          <span className="erp-inventory-model-phone-category">{row.category}</span>
          {specifications.map((value) => <span className="erp-inventory-model-phone-spec" key={value}>{value}</span>)}
        </span>
      </Button>
      <div className="erp-inventory-model-phone-meta">
        <span className="erp-inventory-model-phone-counts">
          <span className="erp-inventory-model-phone-quantity" aria-label={`库存数量 ${row.totalCount} 件`}>总 <span className="erp-inventory-model-phone-quantity-value">{row.totalCount}</span></span>
          <span>在库 <span className="erp-inventory-model-phone-quantity-value">{row.availableCount}</span></span>
          <span>待检 <span className="erp-inventory-model-phone-quantity-value">{row.pendingCount}</span></span>
          <span>锁定 <span className="erp-inventory-model-phone-quantity-value">{row.lockedCount}</span></span>
          {row.soldCount > 0 && <span>已售 <span className="erp-inventory-model-phone-quantity-value">{row.soldCount}</span></span>}
          {row.repairCount > 0 && <span>售后 / 维修 <span className="erp-inventory-model-phone-quantity-value">{row.repairCount}</span></span>}
        </span>
        <span className="erp-inventory-model-phone-location"><MapPin className="h-4 w-4" aria-hidden="true" /><span>{row.warehouseLocations.join("、") || "未设置库位"}</span></span>
      </div>
    </div>
    <div className="erp-inventory-model-phone-actions">
        <Button type="button" variant="ghost" size="xs" className="erp-inventory-model-phone-cards-action" aria-label={`查看 ${row.productName} 单卡库存`} onClick={() => onOpenCards(row)}>
          查看单卡<ArrowRight className="h-4 w-4" aria-hidden="true" />
        </Button>
        <Button type="button" variant="ghost" size="xs" className="erp-inventory-model-phone-ledger-action" aria-label={`查看 ${row.productName} 出入明细`} onClick={openLedger}>
          出入明细<ChevronRight className="h-4 w-4" aria-hidden="true" />
        </Button>
    </div>
  </div>;
}
