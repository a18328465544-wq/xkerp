import type {PurchaseCondition, PurchaseFormValues, PurchaseLineFormValue} from "@/src/types/purchase";
import {storeDate} from "@/src/utils/storeTime";

export const PURCHASE_INITIAL_LINE_COUNT = 4;

/**
 * The current purchase API still requires inspection-owned fields. These are
 * compatibility placeholders only; inspection is the authoritative stage for
 * SN, condition, warranty, warehouse and final inventory state.
 */
export const PURCHASE_PENDING_INSPECTION_DEFAULTS = {
  sn: "",
  condition: "95新" as PurchaseCondition,
  inWarranty: false,
  warrantyDate: "",
  repaired: false,
  gpuRisk: false,
  fullBox: false,
  warehouseLocation: "待检测区",
} as const;

export function createPurchaseLineDefaults(): PurchaseLineFormValue {
  return {
    productId: "",
    productName: "",
    category: "显卡",
    model: "",
    brand: "",
    version: "",
    vram: "",
    ...PURCHASE_PENDING_INSPECTION_DEFAULTS,
    quantity: 1,
    buyPrice: 0,
    estSellPrice: 0,
    remarks: "",
  };
}

export function createPurchaseDefaults(handleBy: string): PurchaseFormValues {
  return {
    date: storeDate(),
    sourceType: "个人回收",
    sourcePartnerId: "",
    sourcePartnerType: "customer",
    supplierName: "",
    contact: "",
    expressNo: "",
    paymentMethod: "",
    isPaid: true,
    settlementAccountId: "",
    paidAmount: 0,
    vendorCreditAppliedAmount: 0,
    paymentHandler: handleBy,
    handleBy,
    remarks: "",
    items: Array.from({length: PURCHASE_INITIAL_LINE_COUNT}, () => createPurchaseLineDefaults()),
  };
}
