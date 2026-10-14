import assert from "node:assert/strict";
import test from "node:test";
import type {UseFieldArrayAppend, UseFormSetValue} from "react-hook-form";
import type {SalesCustomerOption, SalesFormValues, SalesInventoryCandidate, SalesLineFormValue, SalesProductCandidate} from "@/src/types/sales";
import {createSalesLineDefaults} from "./sales.defaults";
import {applySalesVoiceDraftToForm, isBlankSalesLine, type SalesVoiceLineSelection} from "./sales.voice-draft";

const customer: SalesCustomerOption = {id: "C-1", name: "张三", partnerType: "customer", contact: "13800000000", selectable: true};
const product: SalesProductCandidate = {id: "P-4090", productId: "P-4090", productName: "华硕 RTX 4090 猛禽 24G", category: "显卡", brand: "华硕", model: "RTX 4090", version: "猛禽", vram: "24G", condition: "出库核验", warehouse: "A区", inventoryStatus: "可售库存", inventoryQuantity: 2, reservedQuantity: 0, availableQuantity: 2, costPrice: 17_000, estimatedSellPrice: 19_000, entryTime: "2026-10-01", inventoryDays: 10, saleable: true};
const inventory: SalesInventoryCandidate = {id: "KC-1", productId: "P-4090", productName: product.productName, category: "显卡", brand: "华硕", model: "RTX 4090", version: "猛禽", vram: "24G", serialNumber: "SN-RTX-3821", condition: "99新", warehouse: "A区货架-01", inventoryStatus: "已入库", entryTime: "2026-10-01", inventoryDays: 10, saleable: true};
const sales = {customer: {query: "张三", candidates: []}, lines: [{productQuery: "4090 猛禽", snTail: "3821", quantity: 1, sellPrice: 19_000}], channel: "闲鱼" as const, paymentMethod: "微信" as const, isPaid: true, aftersalesTerms: "店保半年"};
const selection: SalesVoiceLineSelection = {draft: sales.lines[0]!, product, inventory};

function runApply(overrides: Partial<Parameters<typeof applySalesVoiceDraftToForm>[0]> = {}) {
  const calls: Array<[string, unknown, unknown?]> = [];
  const append = ((rows: SalesLineFormValue[]) => calls.push(["append", rows])) as unknown as UseFieldArrayAppend<SalesFormValues, "items">;
  const setValue = ((field: string, value: unknown, options?: unknown) => calls.push([field, value, options])) as unknown as UseFormSetValue<SalesFormValues>;
  const resetPaymentSection = () => calls.push(["resetPaymentSection", true]);
  const result = applySalesVoiceDraftToForm({sales, transcript: "卖给张三一张 4090 猛禽，一万九，微信收了，店保半年，闲鱼的", customer, selections: [selection], existingItems: [], existingRemarks: "已有备注", append, setValue, resetPaymentSection, ...overrides});
  return {calls, result};
}

test("sales voice confirmation appends a model-level draft, applies customer/payment/channel/terms, and keeps the SN as an editable outbound hint", () => {
  const {calls, result} = runApply();
  assert.equal(calls[0]?.[0], "append");
  const rows = calls[0]?.[1] as SalesLineFormValue[];
  assert.equal(rows[0]?.inventoryId, "");
  assert.equal(rows[0]?.productId, "P-4090");
  assert.equal(rows[0]?.sellPrice, 19_000);
  assert.match(rows[0]?.remarks || "", /3821.*录单未锁卡.*出库时仍需扫码确认/);
  assert.ok(calls.some(([field, value]) => field === "customerId" && value === "C-1"));
  assert.ok(calls.some(([field, value]) => field === "channel" && value === "闲鱼"));
  assert.ok(calls.some(([field, value]) => field === "paymentMethod" && value === "微信"));
  assert.ok(calls.some(([field, value]) => field === "aftersalesTerms" && value === "店保半年"));
  assert.ok(calls.some(([field, value]) => field === "paidAmount" && value === 19_000));
  assert.ok(calls.some(([field]) => field === "resetPaymentSection"));
  assert.equal(result.note, "added");
  assert.equal(result.subtotal, 19_000);
});

test("sales voice confirmation accepts a supplier and preserves the vendor identity and channel", () => {
  const supplier: SalesCustomerOption = {id: "GY-1", name: "显卡同行", partnerType: "vendor", type: "上游供应商", contact: "李师傅", selectable: true};
  const {calls} = runApply({customer: supplier, sales: {...sales, channel: undefined}});
  assert.ok(calls.some(([field, value]) => field === "customerId" && value === "GY-1"));
  assert.ok(calls.some(([field, value]) => field === "customerPartnerType" && value === "vendor"));
  assert.ok(calls.some(([field, value]) => field === "customerName" && value === "显卡同行"));
  assert.ok(calls.some(([field, value]) => field === "channel" && value === "同行网店"));
});

test("same product voice lines merge only when their price and terms agree", () => {
  const secondCard = {...inventory, id: "KC-2", serialNumber: "SN-RTX-3822"};
  const {result} = runApply({sales: {...sales, isPaid: false}, selections: [selection, {...selection, draft: {...selection.draft, quantity: 1}, inventory: secondCard}]});
  assert.equal(result.rows.length, 1);
  assert.equal(result.rows[0]?.quantity, 2);
  assert.match(result.rows[0]?.remarks || "", /3821、3822/);
});

test("sales voice helper blocks conflicting duplicate models before touching the existing form", () => {
  const calls: Array<[string, unknown]> = [];
  const append = (() => calls.push(["append", true])) as unknown as UseFieldArrayAppend<SalesFormValues, "items">;
  const setValue = (() => calls.push(["setValue", true])) as unknown as UseFormSetValue<SalesFormValues>;
  assert.throws(() => applySalesVoiceDraftToForm({sales, transcript: "voice", customer, selections: [selection, {...selection, draft: {...selection.draft, sellPrice: 18_000}}], existingItems: [], existingRemarks: "", append, setValue, resetPaymentSection: () => undefined}), /不同售价/);
  assert.deepEqual(calls, []);
});

test("sales voice helper does not duplicate a model already in the form", () => {
  assert.throws(() => runApply({existingItems: [{...createSalesLineDefaults(), productId: product.productId}]}), /已在当前草稿中/);
});

test("untouched sales placeholder rows are recognised so voice lines can replace them", () => {
  assert.equal(isBlankSalesLine(createSalesLineDefaults("店保半年")), true);
  assert.equal(isBlankSalesLine({...createSalesLineDefaults(), productId: "P-1", productName: "RTX 4090"}), false);
  assert.equal(isBlankSalesLine({...createSalesLineDefaults(), sellPrice: 100}), false);
});
