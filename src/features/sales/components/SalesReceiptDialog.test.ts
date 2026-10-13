import assert from "node:assert/strict";
import test from "node:test";
import type {SalesListItem} from "@/src/types/sales";
import {buildSalesReceiptSvgMarkup} from "./SalesReceiptDialog";

const item: SalesListItem = {
  id: "S-1", invoiceNo: "XS-1", date: "2026-10-14", customerName: "客户 & A", contact: "13800000000", channel: "到店", paymentMethod: "现金", paymentStatus: "已收款", outboundStatus: "待出库", outboundTime: "", outboundHandler: "", totalCount: 1, totalAmount: 18000, paidAmount: 18000, unpaidAmount: 0, linkedInventoryCount: 0, needInvoice: false, freeShipping: true, expressCompany: "", expressNo: "", aftersalesTerms: "店保 30 天", storeWarrantyDays: 30, handleBy: "销售", remarks: "", productSummary: "RTX 5090", searchText: "", lines: [{id: "L-1", productId: "P-1", productName: "华硕 RTX 5090", sn: "", condition: "95新", quantity: 1, sellPrice: 18000, aftersalesTerms: "店保 30 天", remarks: ""}],
};

test("receipt image includes purchase facts and states when the physical SN is not bound yet", () => {
  const svg = buildSalesReceiptSvgMarkup(item);
  assert.match(svg, /XS-1/);
  assert.match(svg, /客户 &amp; A/);
  assert.match(svg, /华硕 RTX 5090/);
  assert.match(svg, /待出库绑定 SN/);
  assert.match(svg, /95新/);
  assert.match(svg, /店保 30 天/);
  assert.match(svg, /待出库 · 出库后绑定实际 SN/);
});
