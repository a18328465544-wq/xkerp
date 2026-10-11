import assert from "node:assert/strict";
import test from "node:test";
import type {UseFieldArrayAppend, UseFormSetValue} from "react-hook-form";
import type {PurchaseFormValues, PurchaseLineFormValue} from "@/src/types/purchase";
import {createPurchaseLineDefaults} from "../purchase.defaults";
import {applyPurchaseVoiceDraftToForm, isBlankPurchaseLine} from "./apply-purchase-voice-draft";

const row: PurchaseLineFormValue = {...createPurchaseLineDefaults(), productId: "P-1", productName: "RTX 4090", quantity: 2, buyPrice: 7_800};

function runApply(purchase: Parameters<typeof applyPurchaseVoiceDraftToForm>[0]["purchase"], paidCredit = 0) {
  const calls: Array<[string, unknown, unknown?]> = [];
  const append = ((value: PurchaseLineFormValue[]) => calls.push(["append", value])) as unknown as UseFieldArrayAppend<PurchaseFormValues, "items">;
  const setValue = ((field: string, value: unknown, options?: unknown) => calls.push([field, value, options])) as unknown as UseFormSetValue<PurchaseFormValues>;
  const resetPaymentSection = () => calls.push(["resetPaymentSection", true]);
  const result = applyPurchaseVoiceDraftToForm({purchase, transcript: "回收李四两张 4090，每张 7800", rows: [row], existingItems: [], existingRemarks: "已有备注", vendorCreditAppliedAmount: paidCredit, append, setValue, resetPaymentSection});
  return {calls, result};
}

test("purchase voice confirmation appends rows and writes the original transcript into the existing remarks field", () => {
  const {calls, result} = runApply({partner: {query: "李四", candidates: []}, lines: [{productQuery: "4090", candidates: [], quantity: 2}], payment: {method: "现金", status: "已付款"}});
  assert.equal(calls[0]?.[0], "append");
  assert.deepEqual(calls[0]?.[1], [row]);
  assert.ok(calls.some(([field, value]) => field === "remarks" && value === "已有备注\n【语音】回收李四两张 4090，每张 7800"));
  assert.ok(calls.some(([field, value]) => field === "paymentMethod" && value === "现金"));
  assert.ok(calls.some(([field, value]) => field === "paidAmount" && value === 15_600));
  assert.equal(result.paymentPreset, "applied");
  assert.equal(result.note, "added");
});

test("partial payment is never guessed; only an explicit in-range amount is applied", () => {
  const missing = runApply({partner: {query: "李四", candidates: []}, lines: [], payment: {status: "部分付款"}});
  assert.equal(missing.result.paymentPreset, "partial-needs-amount");
  assert.ok(missing.calls.some(([field, value]) => field === "paidAmount" && value === 0));

  const outOfRange = runApply({partner: {query: "李四", candidates: []}, lines: [], payment: {status: "部分付款", paidAmount: 15_600}});
  assert.equal(outOfRange.result.paymentPreset, "partial-out-of-range");
  assert.ok(outOfRange.calls.some(([field, value]) => field === "paidAmount" && value === 0));

  const valid = runApply({partner: {query: "李四", candidates: []}, lines: [], payment: {status: "部分付款", paidAmount: 3_000}});
  assert.equal(valid.result.paymentPreset, "applied");
  assert.ok(valid.calls.some(([field, value]) => field === "paidAmount" && value === 3_000));
});

test("voice notes that exceed the purchase remarks limit are not silently truncated", () => {
  const calls: Array<[string, unknown]> = [];
  const append = (() => undefined) as unknown as UseFieldArrayAppend<PurchaseFormValues, "items">;
  const setValue = ((field: string, value: unknown) => calls.push([field, value])) as unknown as UseFormSetValue<PurchaseFormValues>;
  const result = applyPurchaseVoiceDraftToForm({purchase: {partner: {query: "", candidates: []}, lines: []}, transcript: "话".repeat(1_001), rows: [row], existingItems: [], existingRemarks: "", vendorCreditAppliedAmount: 0, append, setValue, resetPaymentSection: () => undefined});
  assert.equal(result.note, "too-long");
  assert.equal(calls.some(([field]) => field === "remarks"), false);
});

test("voice rows replace untouched placeholder rows instead of landing below them", () => {
  const calls: Array<[string, unknown]> = [];
  const append = ((value: PurchaseLineFormValue[]) => calls.push(["append", value])) as unknown as UseFieldArrayAppend<PurchaseFormValues, "items">;
  const setValue = ((field: string, value: unknown) => calls.push([field, value])) as unknown as UseFormSetValue<PurchaseFormValues>;
  const filled = {...createPurchaseLineDefaults(), productId: "P-9", productName: "RTX 3060", buyPrice: 1_000};
  const existingItems = [createPurchaseLineDefaults(), filled, createPurchaseLineDefaults()];
  applyPurchaseVoiceDraftToForm({purchase: {partner: {query: "", candidates: []}, lines: [], payment: {status: "已付款"}}, transcript: "", rows: [row], existingItems, existingRemarks: "", vendorCreditAppliedAmount: 0, append, remove: (indexes) => calls.push(["remove", indexes]), setValue, resetPaymentSection: () => undefined});
  assert.deepEqual(calls[0], ["remove", [0, 2]]);
  assert.equal(calls[1]?.[0], "append");
  // The paid total covers the kept line plus the voice row, not the removed placeholders.
  assert.ok(calls.some(([field, value]) => field === "paidAmount" && value === 1_000 + 15_600));
  assert.equal(isBlankPurchaseLine(createPurchaseLineDefaults()), true);
  assert.equal(isBlankPurchaseLine(filled), false);
});
