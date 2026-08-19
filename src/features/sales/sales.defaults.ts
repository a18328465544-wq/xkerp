import type {SalesFormValues, SalesLineFormValue} from "@/src/types/sales";
import {storeDate} from "@/src/utils/storeTime";

export const SALES_INITIAL_LINE_COUNT = 4;

export function createSalesLineDefaults(aftersalesTerms = "店保三个月"): SalesLineFormValue {
  return {inventoryId: "", productId: "", productName: "", brand: "", model: "", vram: "", condition: "出库核验", quantity: 1, sellPrice: 0, costPrice: undefined, remarks: "", aftersalesTerms};
}

export function createSalesDefaults(handleBy: string): SalesFormValues {
  return {
    date: storeDate(),
    customerId: "",
    customerPartnerType: "customer",
    customerName: "",
    contact: "",
    channel: "到店",
    paymentMethod: "微信",
    settlementAccountId: "",
    paidAmount: 0,
    needInvoice: false,
    freeShipping: false,
    expressCompany: "顺丰速运",
    expressNo: "",
    aftersalesTerms: "店保三个月",
    handleBy,
    paymentHandler: handleBy,
    remarks: "",
    // Keep the four initial editors in RHF defaults so opening a new order is
    // still a clean form. Empty placeholder rows are ignored on validation,
    // totals and request conversion.
    items: Array.from({length: SALES_INITIAL_LINE_COUNT}, () => createSalesLineDefaults()),
  };
}
