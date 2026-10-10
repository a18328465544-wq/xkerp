import type {InventoryCondition, ProductCategory, SourceType} from "./core";
import type {PurchasePaymentStatus} from "./purchase";
import type {SalesChannel, SalesPaymentMethod} from "./sales";

export type VoiceScene = "purchase" | "sales" | "customer" | "auto";
export type VoiceResolvedScene = Exclude<VoiceScene, "auto"> | null;
export type VoiceParseSource = "ai" | "rules";

export interface VoicePartnerCandidate {
  id: string;
  name: string;
}

export interface VoiceProductCandidate {
  id: string;
  name: string;
  category?: ProductCategory;
  model?: string;
  brand?: string;
  version?: string;
  vram?: string;
  refBuyPrice?: number;
  refSellPrice?: number;
  currentStock?: number;
}

export interface VoiceIssue {
  field: string;
  level: "warning" | "error";
  message: string;
}

export interface VoicePurchaseLineDraft {
  productQuery: string;
  candidates: VoiceProductCandidate[];
  productId?: string;
  quantity: number;
  buyPrice?: number;
  condition?: InventoryCondition;
  fullBox?: boolean;
  repaired?: boolean;
  remarks?: string;
}

export interface VoiceSalesLineDraft {
  productQuery: string;
  snTail?: string;
  sellPrice?: number;
  quantity: number;
}

export interface VoiceParseResult {
  parseId: string;
  scene: VoiceResolvedScene;
  transcript: string;
  source: VoiceParseSource;
  purchase?: {
    sourceType?: SourceType;
    partner: {query: string; candidates: VoicePartnerCandidate[]; matchedId?: string; phone?: string};
    lines: VoicePurchaseLineDraft[];
    payment?: {method?: string; status?: PurchasePaymentStatus; paidAmount?: number};
  };
  sales?: {
    customer: {query: string; candidates: VoicePartnerCandidate[]; matchedId?: string; phone?: string; wechat?: string; qq?: string};
    lines: VoiceSalesLineDraft[];
    channel?: SalesChannel;
    paymentMethod?: SalesPaymentMethod;
    isPaid?: boolean;
    aftersalesTerms?: string;
  };
  customer?: {rawTextForQuickCapture: string};
  issues: VoiceIssue[];
}
