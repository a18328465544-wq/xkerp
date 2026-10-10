import type {UseFieldArrayAppend, UseFormSetValue} from "react-hook-form";
import type {PurchaseFormValues, PurchaseLineFormValue} from "@/src/types/purchase";
import type {VoiceParseResult} from "@/src/types/voice";
import {calculatePurchaseSummary} from "@/src/lib/purchase";

type PurchaseVoiceDraft = NonNullable<VoiceParseResult["purchase"]>;

export interface ApplyPurchaseVoiceDraftInput {
  purchase: PurchaseVoiceDraft;
  transcript: string;
  rows: PurchaseLineFormValue[];
  existingItems: readonly PurchaseLineFormValue[];
  existingRemarks: string;
  vendorCreditAppliedAmount: number;
  append: UseFieldArrayAppend<PurchaseFormValues, "items">;
  setValue: UseFormSetValue<PurchaseFormValues>;
  resetPaymentSection: () => void;
}

export interface ApplyPurchaseVoiceDraftResult {
  paymentPreset: "unchanged" | "applied" | "partial-needs-amount" | "partial-out-of-range";
  note: "added" | "empty" | "too-long";
}

const dirty = {shouldDirty: true, shouldValidate: true} as const;

/** Apply only after the user confirms rows in PurchasePasteDrawer. */
export function applyPurchaseVoiceDraftToForm({purchase, transcript, rows, existingItems, existingRemarks, vendorCreditAppliedAmount, append, setValue, resetPaymentSection}: ApplyPurchaseVoiceDraftInput): ApplyPurchaseVoiceDraftResult {
  append(rows);

  const text = transcript.trim();
  const voiceNote = text ? `【语音】${text}` : "";
  let note: ApplyPurchaseVoiceDraftResult["note"] = "empty";
  if (voiceNote && !existingRemarks.includes(voiceNote)) {
    const nextRemarks = [existingRemarks.trim(), voiceNote].filter(Boolean).join("\n");
    if (nextRemarks.length <= 1_000) {
      setValue("remarks", nextRemarks, dirty);
      note = "added";
    } else {
      note = "too-long";
    }
  }

  const payment = purchase.payment;
  let paymentPreset: ApplyPurchaseVoiceDraftResult["paymentPreset"] = "unchanged";
  if (payment?.method) setValue("paymentMethod", payment.method, dirty);
  if (payment?.status === "已付款" || payment?.status === "未付款" || payment?.status === "部分付款") {
    const totalCost = calculatePurchaseSummary([...existingItems, ...rows]).totalCost;
    const due = Math.max(0, totalCost - Math.max(0, vendorCreditAppliedAmount));
    if (payment.status === "已付款") {
      setValue("isPaid", true, dirty);
      setValue("paidAmount", due, dirty);
      paymentPreset = "applied";
    } else if (payment.status === "未付款") {
      setValue("isPaid", false, dirty);
      setValue("paidAmount", 0, dirty);
      paymentPreset = "applied";
    } else {
      setValue("isPaid", false, dirty);
      const amount = payment.paidAmount;
      if (amount === undefined || amount <= 0) {
        setValue("paidAmount", 0, dirty);
        paymentPreset = "partial-needs-amount";
      } else if (amount >= due) {
        setValue("paidAmount", 0, dirty);
        paymentPreset = "partial-out-of-range";
      } else {
        setValue("paidAmount", amount, dirty);
        paymentPreset = "applied";
      }
    }
    resetPaymentSection();
  }
  return {paymentPreset, note};
}
