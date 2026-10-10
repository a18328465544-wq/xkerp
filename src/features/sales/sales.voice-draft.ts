import type {UseFieldArrayAppend, UseFormSetValue} from "react-hook-form";
import type {SalesCustomerOption, SalesFormValues, SalesInventoryCandidate, SalesLineFormValue, SalesProductCandidate} from "@/src/types/sales";
import type {VoiceParseResult, VoiceSalesLineDraft} from "@/src/types/voice";

type SalesVoiceDraft = NonNullable<VoiceParseResult["sales"]>;

export interface SalesVoiceLineSelection {
  draft: VoiceSalesLineDraft;
  product: SalesProductCandidate;
  inventory: SalesInventoryCandidate;
}

export interface ApplySalesVoiceDraftInput {
  sales: SalesVoiceDraft;
  transcript: string;
  customer: SalesCustomerOption;
  selections: SalesVoiceLineSelection[];
  existingItems: readonly SalesLineFormValue[];
  existingRemarks: string;
  append: UseFieldArrayAppend<SalesFormValues, "items">;
  setValue: UseFormSetValue<SalesFormValues>;
  resetPaymentSection: () => void;
}

export interface ApplySalesVoiceDraftResult {
  rows: SalesLineFormValue[];
  candidates: SalesProductCandidate[];
  note: "added" | "empty" | "too-long";
  subtotal: number;
}

const dirty = {shouldDirty: true, shouldValidate: true} as const;

function cardTail(serialNumber: string) {
  const compact = serialNumber.replace(/\s/g, "");
  return compact.slice(-4) || "未知";
}

/**
 * Convert only an explicitly reviewed sales parse into existing form values.
 * The physical card is a draft hint; the sales order remains model-level and
 * the warehouse still binds the actual inventory item during outbound.
 */
export function applySalesVoiceDraftToForm({sales, transcript, customer, selections, existingItems, existingRemarks, append, setValue, resetPaymentSection}: ApplySalesVoiceDraftInput): ApplySalesVoiceDraftResult {
  if (!selections.length) throw new Error("至少确认一条可售商品后才能应用草稿");
  if (!customer.selectable || customer.partnerType !== "customer") throw new Error("请选择有效的客户档案");

  const existingProductIds = new Set(existingItems.filter((item) => item.productId).map((item) => item.productId));
  const grouped = new Map<string, {row: SalesLineFormValue; candidate: SalesProductCandidate; tails: string[]}>();
  const terms = sales.aftersalesTerms?.trim() || "";

  for (const selection of selections) {
    const {draft, product, inventory} = selection;
    if (!product.saleable || !inventory.saleable || inventory.productId !== product.productId) throw new Error("库存候选已变化，请重新解析后再应用");
    if (existingProductIds.has(product.productId)) throw new Error(`“${product.productName}”已在当前草稿中，请修改现有行数量，避免重复型号`);
    const sellPrice = Math.max(0, Math.round(draft.sellPrice ?? product.estimatedSellPrice ?? 0));
    const lineTerms = terms;
    const current = grouped.get(product.productId);
    if (current) {
      if (current.row.sellPrice !== sellPrice || current.row.aftersalesTerms !== lineTerms) throw new Error(`“${product.productName}”出现不同售价或售后条款；请拆分单据或先手工整理明细`);
      current.row.quantity += Math.max(1, Math.floor(draft.quantity));
      current.tails.push(cardTail(inventory.serialNumber));
      continue;
    }
    grouped.set(product.productId, {
      candidate: product,
      tails: [cardTail(inventory.serialNumber)],
      row: {
        inventoryId: "",
        productId: product.productId,
        productName: product.productName,
        brand: product.brand,
        model: product.model,
        vram: product.vram,
        condition: "出库核验",
        quantity: Math.max(1, Math.floor(draft.quantity)),
        sellPrice,
        costPrice: product.costPrice,
        remarks: "",
        aftersalesTerms: lineTerms,
      },
    });
  }

  const groups = [...grouped.values()];
  for (const group of groups) {
    if (group.row.quantity > group.candidate.availableQuantity) throw new Error(`“${group.row.productName}”可售库存不足，当前可售 ${group.candidate.availableQuantity} 件`);
    const tails = [...new Set(group.tails)];
    group.row.remarks = `语音建议出库卡尾号：${tails.join("、")}（录单未锁卡，出库时仍需扫码确认）`;
  }

  const rows = groups.map(({row}) => row);
  const candidates = groups.map(({candidate}) => candidate);
  const subtotal = [...existingItems, ...rows].reduce((sum, item) => sum + (item.productId ? Math.max(0, item.quantity) * Math.max(0, item.sellPrice) : 0), 0);

  append(rows);
  setValue("customerId", customer.id, dirty);
  setValue("customerPartnerType", "customer", dirty);
  setValue("customerName", customer.name, dirty);
  setValue("contact", customer.contact || "", dirty);
  if (sales.channel) setValue("channel", sales.channel, dirty);
  if (sales.paymentMethod) setValue("paymentMethod", sales.paymentMethod, dirty);
  if (sales.aftersalesTerms) setValue("aftersalesTerms", sales.aftersalesTerms, dirty);

  let note: ApplySalesVoiceDraftResult["note"] = "empty";
  const voiceNote = transcript.trim() ? `【语音】${transcript.trim()}` : "";
  if (voiceNote && !existingRemarks.includes(voiceNote)) {
    const nextRemarks = [existingRemarks.trim(), voiceNote].filter(Boolean).join("\n");
    if (nextRemarks.length <= 500) {
      setValue("remarks", nextRemarks, dirty);
      note = "added";
    } else {
      note = "too-long";
    }
  }

  if (sales.isPaid !== undefined) {
    setValue("paidAmount", sales.isPaid ? subtotal : 0, dirty);
    if (!sales.isPaid) setValue("paymentMethod", "账期欠款", dirty);
    resetPaymentSection();
  }

  return {rows, candidates, note, subtotal};
}
