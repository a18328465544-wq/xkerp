import {z} from "zod";
import type {MarketQuoteFormValues} from "@/src/types/quote";
import {quoteTrendValues} from "@/src/types/quote";
import {coreQuoteProfile, gpuCoreIdentity} from "@/src/utils/quoteReference";
import {isDateKey} from "@/src/lib/dateRangePickerUtils";

const price = z.number().finite().min(0, "参考价不能小于 0").max(100_000_000, "参考价过大").nullable();

export const marketQuoteSchema = z.object({
  model: z.string().trim().max(120),
  brand: z.string().trim().max(60),
  categoryId: z.string().max(120),
  buyPrice: price,
  sellPrice: price,
  productId: z.string().optional(),
  quoteScope: z.enum(["core", "product"]).optional(),
  coreId: z.string().optional(),
  coreModel: z.string().optional(),
  profile: z.object({condition: z.enum(["any", "new", "used"]), grade: z.string(), warranty: z.enum(["any", "in", "out"]), packaging: z.enum(["any", "boxed", "unboxed"]), vram: z.string(), currency: z.literal("CNY")}).optional(),
  source: z.string().trim().max(300, "报价来源最多 300 个字符").optional(),
  validUntil: z.string().refine((value) => !value || isDateKey(value), "请输入有效日期").optional(),
  trend: z.enum(quoteTrendValues),
  note: z.string().trim().max(300, "说明最多 300 个字符"),
}).superRefine((values, ctx) => {
  if (values.quoteScope !== "core") ctx.addIssue({code: "custom", path: ["quoteScope"], message: "仅支持核心基础价；旧报价请明确转换"});
  const core = gpuCoreIdentity(values.coreModel || values.model);
  if (!core || values.coreId && values.coreId !== core.coreId) ctx.addIssue({code: "custom", path: ["coreModel"], message: "请输入完整核心型号，例如 RTX4070TI；不能省略 RTX"});
  if (values.buyPrice === null && values.sellPrice === null) ctx.addIssue({code: "custom", path: ["buyPrice"], message: "至少填写一个参考价格"});
}).transform((values) => {
  const core = gpuCoreIdentity(values.coreModel || values.model);
  return {...values, quoteScope: "core" as const, coreId: core?.coreId || "", coreModel: core?.coreModel || "", model: core?.coreModel || values.model, brand: core?.vendor || values.brand, profile: coreQuoteProfile(), productId: ""};
});

export const defaultMarketQuoteValues: MarketQuoteFormValues = {model: "", brand: "NVIDIA", categoryId: "", quoteScope: "core", coreId: "", coreModel: "", profile: coreQuoteProfile(), source: "", validUntil: "", buyPrice: null, sellPrice: null, trend: "stable", note: ""};
