import type {PurchaseSourceOption} from "@/src/types/purchase";
import type {VoiceParseResult} from "@/src/types/voice";
import {isPersonalPurchaseSource} from "@/src/utils/purchaseSources";

type VoicePurchasePartner = NonNullable<VoiceParseResult["purchase"]>["partner"];

export function voicePurchasePartnerType(sourceType?: string): "customer" | "vendor" {
  return isPersonalPurchaseSource(sourceType) ? "customer" : "vendor";
}

export function voiceSourceTypeMatchesPartner(sourceType: string | undefined, partnerType: PurchaseSourceOption["partnerType"]): boolean {
  return !sourceType || voicePurchasePartnerType(sourceType) === partnerType;
}

function normalizePartnerName(value: string) {
  return value.normalize("NFKC").toLocaleLowerCase().replace(/[\s\p{P}\p{S}]+/gu, "");
}

/** Auto-select only an exact, selectable result already present in parser candidates. */
export function findExactVoicePurchasePartner(partner: VoicePurchasePartner, options: readonly PurchaseSourceOption[]): PurchaseSourceOption[] {
  const query = normalizePartnerName(partner.query.trim());
  const candidateIds = new Set(partner.candidates.map((candidate) => candidate.id));
  if (!query || !candidateIds.size) return [];
  return options.filter((option) => option.selectable && candidateIds.has(option.id) && normalizePartnerName(option.name) === query);
}
