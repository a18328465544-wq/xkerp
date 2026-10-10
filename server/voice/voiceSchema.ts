import {z} from "zod";
import {inventoryConditionValues, productCategoryValues, sourceTypeValues} from "../../src/types/core.ts";
import {purchasePaymentMethodValues, purchasePaymentStatusValues} from "../../src/types/purchase.ts";
import {salesChannelValues, salesPaymentMethodValues} from "../../src/types/sales.ts";

export const voiceSceneSchema = z.enum(["purchase", "sales", "customer", "auto"]);
export const voicePartnerCandidateSchema = z.object({id: z.string().min(1), name: z.string().min(1)});
export const voiceProductCandidateSchema = z.object({
  id: z.string().min(1), name: z.string().min(1), category: z.enum(productCategoryValues).optional(),
  model: z.string().optional(), brand: z.string().optional(), version: z.string().optional(), vram: z.string().optional(),
  refBuyPrice: z.number().nonnegative().optional(), refSellPrice: z.number().nonnegative().optional(), currentStock: z.number().nonnegative().optional(),
});
export const voiceIssueSchema = z.object({field: z.string().min(1), level: z.enum(["warning", "error"]), message: z.string().min(1)});
export const voiceParseResultSchema = z.object({
  parseId: z.string().min(1),
  scene: z.enum(["purchase", "sales", "customer"]).nullable(),
  transcript: z.string(),
  source: z.enum(["ai", "rules"]),
  purchase: z.object({
    sourceType: z.enum(sourceTypeValues).optional(),
    partner: z.object({query: z.string(), candidates: z.array(voicePartnerCandidateSchema).max(5), matchedId: z.string().optional(), phone: z.string().max(32).optional()}),
    lines: z.array(z.object({
      productQuery: z.string(), candidates: z.array(voiceProductCandidateSchema).max(10), productId: z.string().optional(),
      quantity: z.number().int().min(1).max(500), buyPrice: z.number().nonnegative().optional(),
      condition: z.enum(inventoryConditionValues).optional(), fullBox: z.boolean().optional(), repaired: z.boolean().optional(), remarks: z.string().max(500).optional(),
    })).max(30),
    payment: z.object({method: z.enum(purchasePaymentMethodValues).optional(), status: z.enum(purchasePaymentStatusValues).optional(), paidAmount: z.number().nonnegative().optional()}).optional(),
  }).optional(),
  sales: z.object({
    customer: z.object({query: z.string(), candidates: z.array(voicePartnerCandidateSchema).max(5), matchedId: z.string().optional(), phone: z.string().max(32).optional(), wechat: z.string().max(48).optional(), qq: z.string().max(24).optional()}),
    lines: z.array(z.object({productQuery: z.string(), snTail: z.string().max(32).optional(), sellPrice: z.number().nonnegative().optional(), quantity: z.number().int().min(1).max(500)})).max(30),
    channel: z.enum(salesChannelValues).optional(), paymentMethod: z.enum(salesPaymentMethodValues).optional(), isPaid: z.boolean().optional(), aftersalesTerms: z.string().max(80).optional(),
  }).optional(),
  customer: z.object({rawTextForQuickCapture: z.string().max(2_000)}).optional(),
  issues: z.array(voiceIssueSchema).max(50),
}).superRefine((value, context) => {
  if (value.scene === "purchase" && !value.purchase) context.addIssue({code: "custom", path: ["purchase"], message: "purchase 场景缺少采购草稿"});
  if (value.scene === "sales" && !value.sales) context.addIssue({code: "custom", path: ["sales"], message: "sales 场景缺少销售草稿"});
  if (value.scene === "customer" && !value.customer) context.addIssue({code: "custom", path: ["customer"], message: "customer 场景缺少客户草稿"});
});

export const voiceParseRequestSchema = z.object({text: z.string().trim().min(1).max(2_000), scene: voiceSceneSchema});
export type VoiceParseResultDto = z.infer<typeof voiceParseResultSchema>;
