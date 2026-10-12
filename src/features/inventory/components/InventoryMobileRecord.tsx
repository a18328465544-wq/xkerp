import {useState} from "react";
import {Copy} from "lucide-react";
import {ErpMobileRecordRow} from "@/src/components/common/ErpMobileRecordRow";
import {ErpEntityThumbnail} from "@/src/components/common/ErpEntityThumbnail";
import {Button} from "@/src/components/ui";
import {InventoryStatus} from "@/src/components/domain";
import {formatCurrency} from "@/src/lib/format";
import type {InventoryListItem} from "@/src/types/inventory";
import {notify} from "@/src/utils/notification";

/** A presentation of the same fields used by the desktop inventory columns.
 * Missing prices stay missing; a zero price must not fall back to another price. */
export function InventoryMobileRecord({item, onOpen}: {item: InventoryListItem; onOpen: () => void}) {
  const sold = item.inventoryStatus === "已售出";
  const price = sold ? item.salesPrice : item.estimatedSellPrice;
  const priceText = price === undefined ? "未设置" : formatCurrency(price);
  const hasSerialNumber = Boolean(item.serialNumber.trim() && !["待录入", "未录入 SN"].includes(item.serialNumber.trim()));
  const [copying, setCopying] = useState(false);
  const copySerialNumber = async () => {
    if (!hasSerialNumber || copying) return;
    setCopying(true);
    try {
      await navigator.clipboard.writeText(item.serialNumber);
      notify.success("SN 已复制");
    } catch {
      notify.error("复制失败，请长按 SN 手动复制。");
    } finally {
      setCopying(false);
    }
  };

  // The read-only facts are outside the open-record button: no nested actions.
  // Wide formatted amounts use a separate line; their value is never abbreviated.
  return <div className="erp-inventory-phone-record" data-erp-component="inventory-phone-record" data-price-layout={priceText.length > 11 ? "wide" : "inline"}>
    <ErpMobileRecordRow title={item.productName} imageUrl={item.imageUrl}
    thumbnail={<ErpEntityThumbnail name={item.productName} category={item.category} imageUrl={item.imageUrl} />}
    statusPlacement="title"
    subtitle={<span className="erp-inventory-phone-subtitle"><InventoryStatus status={item.inventoryStatus} /><span>{[item.category, item.vram, item.condition].filter(Boolean).join(" · ")}</span></span>}
    amountLabel={sold ? "成交价" : "预计售价"} amount={priceText}
    onOpen={onOpen} />
    <div className="erp-inventory-phone-facts">
      <div className="erp-inventory-phone-sn">
        <span className="erp-inventory-phone-fact-label">SN</span>
        <span className="erp-inventory-phone-sn-value">{hasSerialNumber ? item.serialNumber : "待录入"}</span>
        {hasSerialNumber && <Button type="button" variant="ghost" size="iconTouch" aria-label={`复制 SN ${item.serialNumber}`} title="复制 SN" loading={copying} onClick={(event) => { event.stopPropagation(); void copySerialNumber(); }}><Copy className="h-5 w-5" aria-hidden="true" /></Button>}
      </div>
      <div className="erp-inventory-phone-location">
        <span className="erp-inventory-phone-fact-label">位置</span>
        <span className="erp-inventory-phone-location-value">{item.warehouse || "未设置库位"}</span>
        <span className="erp-inventory-phone-age">库龄 {item.inventoryDays} 天</span>
      </div>
    </div>
  </div>;
}
