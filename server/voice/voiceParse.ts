import {randomUUID} from "node:crypto";
import type {CardInventory, CustomerCard, ProductTemplate, Vendor} from "../../src/types.ts";
import type {VoiceIssue, VoiceParseResult, VoiceResolvedScene} from "../../src/types/voice.ts";
import {inventoryConditionValues, sourceTypeValues} from "../../src/types/core.ts";
import {purchasePaymentMethodValues, purchasePaymentStatusValues, purchasePersonalSourceValues} from "../../src/types/purchase.ts";
import {salesChannelValues, salesPaymentMethodValues} from "../../src/types/sales.ts";
import {expandProductAliases} from "./productAliases.ts";
import {
  inferVoiceAftersalesTerms, inferVoiceChannel, inferVoiceCondition, inferVoiceFullBox,
  inferVoicePaidStatus, inferVoicePaymentMethod, inferVoicePurchaseSource, inferVoiceRepaired,
  inferVoiceSalesPaid, resolveVoiceScene,
} from "./voiceIntent.ts";
import {parseVoiceAmount, parseVoiceQuantity} from "./voiceNumbers.ts";
import {voiceParseResultSchema} from "./voiceSchema.ts";

export interface VoiceParseContext {
  products: ProductTemplate[];
  customers: CustomerCard[];
  vendors: Vendor[];
  inventory?: CardInventory[];
}

export interface VoiceModelRequest {
  text: string;
  scene: VoiceResolvedScene;
  candidates: {
    products: Array<{id: string; name: string}>;
    customers: Array<{id: string; name: string}>;
    vendors: Array<{id: string; name: string}>;
    enums: {
      sourceTypes: readonly string[];
      purchasePaymentMethods: readonly string[];
      purchasePaymentStatuses: readonly string[];
      salesChannels: readonly string[];
      salesPaymentMethods: readonly string[];
      conditions: readonly string[];
    };
  };
}

export type VoiceModelParser = (request: VoiceModelRequest) => Promise<unknown>;

const AI_PROVIDER_FAILURE_COOLDOWN_MS = Math.max(0, Number(process.env.AI_PROVIDER_FAILURE_COOLDOWN_MS || 5 * 60 * 1000));
let aiProviderFailureAt = 0;

function clean(value: string) {
  return value.trim().replace(/[\s,，。；;、]+/g, " ").trim();
}

function rankProducts(products: ProductTemplate[]) {
  return [...products].sort((left, right) =>
    String(right.lastDealTime || "").localeCompare(String(left.lastDealTime || "")) ||
    (right.currentStock || 0) - (left.currentStock || 0) || left.name.localeCompare(right.name, "zh-Hans-CN"));
}

function productCandidate(product: ProductTemplate) {
  return {
    id: product.id,
    name: product.name,
    ...(product.category ? {category: product.category} : {}),
    model: product.model,
    brand: product.brand,
    version: product.version,
    vram: product.vram,
    ...(Number.isFinite(product.refBuyPrice) ? {refBuyPrice: product.refBuyPrice} : {}),
    ...(Number.isFinite(product.refSellPrice) ? {refSellPrice: product.refSellPrice} : {}),
    ...(Number.isFinite(product.currentStock) ? {currentStock: Math.max(0, product.currentStock)} : {}),
  };
}

export function findVoiceProductCandidates(query: string, products: ProductTemplate[], limit = 10) {
  const normalizedQuery = expandProductAliases(query).replace(/[^\p{L}\p{N}]+/gu, "");
  const ranked = rankProducts(products).map((product) => {
    const searchable = expandProductAliases(`${product.name} ${product.brand} ${product.model} ${product.version} ${product.vram}`).replace(/[^\p{L}\p{N}]+/gu, "");
    const score = normalizedQuery && searchable.includes(normalizedQuery) ? 0 : normalizedQuery && normalizedQuery.split(/(?=RTX|GTX|RX|ROG)/i).some((part) => part.length >= 3 && searchable.includes(part)) ? 1 : normalizedQuery && searchable.includes(normalizedQuery.slice(0, 4)) ? 2 : 3;
    return {product, score};
  }).sort((left, right) => {
    const difference = left.score - right.score;
    if (difference) return difference;
    const rankedPair = rankProducts([left.product, right.product]);
    return rankedPair[0]?.id === left.product.id ? -1 : 1;
  });
  const matching = normalizedQuery ? ranked.filter((entry) => entry.score < 3) : [];
  return matching.slice(0, limit).map(({product}) => productCandidate(product));
}

function partnerCandidates<T extends {id: string; name: string; lastDealTime?: string}>(query: string, values: T[], limit = 5) {
  const normalizedQuery = clean(query).toLowerCase();
  return [...values].sort((left, right) => String(right.lastDealTime || "").localeCompare(String(left.lastDealTime || "")))
    .map((item) => ({item, match: normalizedQuery && item.name.toLowerCase().includes(normalizedQuery) ? 0 : normalizedQuery && normalizedQuery.length > 1 && normalizedQuery.includes(item.name.toLowerCase()) ? 1 : 2}))
    .sort((left, right) => left.match - right.match)
    .filter((entry) => !normalizedQuery || entry.match < 2)
    .slice(0, limit)
    .map(({item}) => ({id: item.id, name: item.name}));
}

function partnerQuery(text: string, scene: VoiceResolvedScene) {
  const marker = scene === "sales"
    ? /(?:卖给|出给|发给|客户)\s*([\p{Script=Han}]{2,8}|[a-zA-Z][a-zA-Z0-9_-]{1,20})(?=\s|[一二两三四五六七八九十0-9]|[,，。]|$)/u
    : /(?:回收|收购|采购|进货|拿货|供应商)\s*([\p{Script=Han}]{2,8}|[a-zA-Z][a-zA-Z0-9_-]{1,20})(?=\s|[一二两三四五六七八九十0-9]|[,，。]|$)/u;
  return text.match(marker)?.[1]?.replace(/(?:一张|两张|三张|四张|五张|[0-9]+张)$/, "") || "";
}

function productQuery(text: string) {
  return clean(text
    .replace(/(?:卖给|出给|发给|回收|收购|采购|进货|拿货|客户|供应商)\s*(?:[\p{Script=Han}]{2,8}|[a-zA-Z][a-zA-Z0-9_-]{1,20})/gu, " ")
    .replace(/(?:每张|每片|每台|每个|单价|收购价|采购价|售价|销售价|报价|价格|成本价|总价|一共)\s*[零〇洞一幺二两三四五六七八九十百千万亿点\d,.，]+(?:元|块)?/g, " ")
    .replace(/[零〇洞一幺二两三四五六七八九十百千万亿点\d,.，]+\s*(?:张|片|台|个|件)/g, " ")
    .replace(/(?:全新|99\s*新|95\s*新|90\s*新|85\s*新|充新|靓机|良品|带盒|有盒|全套|修过|维修过|换过显存|付清|已付款|未付款|欠着|挂账|微信|支付宝|现金|银行卡|店保(?:半年|三个月|一年)|保到手好|闲鱼|抖音|小红书|B站|哔哩哔哩|微信私域|同行网店|到店|门店)/g, " ")
    .replace(/(?:电话|手机|微信号|微信|QQ)(?:是|号)?\s*[\w+\-\s]{5,20}/g, " "));
}

function phoneFromText(text: string) {
  const match = text.match(/(?<!\d)1[3-9](?:[\s-]?\d){9}(?!\d)/);
  return match?.[0].replace(/[\s-]/g, "");
}

function extractQuantity(text: string, issues: VoiceIssue[]) {
  const match = text.match(/([零〇洞一幺二两三四五六七八九十几来多百千万亿点\d.]+)\s*(张|片|台|个|件)/);
  if (!match?.[1]) return 1;
  const parsed = parseVoiceQuantity(match[0]);
  if (parsed.ambiguous) {
    issues.push({field: "quantity", level: "warning", message: "数量不明确，请手动确认"});
    return 1;
  }
  return parsed.value && Number.isInteger(parsed.value) && parsed.value > 0 ? parsed.value : 1;
}

function extractMoney(text: string) {
  const number = "((?:[零〇洞一幺二两三四五六七八九十百千万亿点\\d]+)(?:[.．][零〇洞一幺二两三四五六七八九十\\d]+)?(?:万|千)?)";
  const labeled = new RegExp(`(?:每张|每片|每台|每个|单价|收购价|采购价|售价|销售价|报价|价格|成本价|总价|一共|预算|成交价)\\s*[:：]?\\s*${number}\\s*(?:元|块)?`);
  const labeledMatch = text.match(labeled);
  if (labeledMatch?.[1]) return parseVoiceAmount(labeledMatch[1]);
  const currency = text.match(new RegExp(`[￥¥]\\s*${number}\\s*(?:元|块)?`));
  if (currency?.[1]) return parseVoiceAmount(currency[1]);
  const trailing = text.match(new RegExp(`[，,、]\\s*${number}\\s*(?:元|块)?(?=\\s*(?:[，,。]|微信|支付宝|现金|银行卡|店保|闲鱼|抖音|$))`));
  if (trailing?.[1]) return parseVoiceAmount(trailing[1]);
  return undefined;
}

function splitPurchaseLinesByExplicitUnitTraits(text: string, quantity: number, productQueryText: string, candidates: ReturnType<typeof findVoiceProductCandidates>, buyPrice: number | undefined) {
  const descriptors = text.split(/[，,、。；;]/)
    .map((clause) => clause.trim())
    .filter((clause) => /[零〇洞一幺二两三四五六七八九十\d.]+\s*(?:张|片|台|个|件)/.test(clause)
      && Boolean(inferVoiceCondition(clause) || inferVoiceFullBox(clause) !== undefined || inferVoiceRepaired(clause) !== undefined));
  if (descriptors.length < 2) return null;
  const quantities = descriptors.map((clause) => extractQuantity(clause, []));
  if (quantities.reduce((total, value) => total + value, 0) !== quantity) return null;
  return descriptors.map((clause, index) => {
    const matchedProduct = candidates.length === 1 ? candidates[0] : undefined;
    return {
      productQuery: productQueryText,
      candidates,
      ...(matchedProduct ? {productId: matchedProduct.id} : {}),
      quantity: quantities[index] || 1,
      ...(buyPrice === undefined ? {} : {buyPrice}),
      ...(inferVoiceCondition(clause) ? {condition: inferVoiceCondition(clause)} : {}),
      ...(inferVoiceFullBox(clause) === undefined ? {} : {fullBox: inferVoiceFullBox(clause)}),
      ...(inferVoiceRepaired(clause) === undefined ? {} : {repaired: inferVoiceRepaired(clause)}),
    };
  });
}

function extractSnTail(text: string) {
  const match = text.match(/(?:尾号|SN\s*尾号?)\s*([a-z0-9]{3,12})/i);
  return match?.[1];
}

function ruleParse(text: string, scene: VoiceResolvedScene, state: VoiceParseContext): VoiceParseResult {
  const issues: VoiceIssue[] = [];
  const query = productQuery(text);
  const productCandidates = findVoiceProductCandidates(query, state.products, 10);
  const matchedProduct = productCandidates.length === 1 ? productCandidates[0] : undefined;
  const quantity = extractQuantity(text, issues);
  const amount = extractMoney(text);
  const candidateName = partnerQuery(text, scene);
  const customers = partnerCandidates(candidateName, state.customers, 5);
  const vendors = partnerCandidates(candidateName, state.vendors, 5);
  const result: VoiceParseResult = {
    parseId: randomUUID(), scene, transcript: text, source: "rules", issues,
  };
  if (!scene) {
    issues.push({field: "scene", level: "warning", message: "未判断出录入场景，请选择采购、销售或新建客户"});
    return result;
  }
  if (scene === "customer") {
    result.customer = {rawTextForQuickCapture: text};
    return result;
  }
  if (scene === "purchase") {
    const buyPrice = amount;
    const sourceType = inferVoicePurchaseSource(text);
    const purchasePartners = sourceType && purchasePersonalSourceValues.includes(sourceType as (typeof purchasePersonalSourceValues)[number]) ? customers : vendors;
    const product = matchedProduct;
    const purchaseLines = query || productCandidates.length ? splitPurchaseLinesByExplicitUnitTraits(text, quantity, query, productCandidates, buyPrice) || [{
      productQuery: query,
      candidates: productCandidates,
      ...(product ? {productId: product.id} : {}),
      quantity,
      ...(buyPrice === undefined ? {} : {buyPrice}),
      ...(inferVoiceCondition(text) ? {condition: inferVoiceCondition(text)} : {}),
      ...(inferVoiceFullBox(text) === undefined ? {} : {fullBox: inferVoiceFullBox(text)}),
      ...(inferVoiceRepaired(text) === undefined ? {} : {repaired: inferVoiceRepaired(text)}),
    }] : [];
    if (buyPrice !== undefined && product?.refBuyPrice && Math.abs(buyPrice - product.refBuyPrice) / product.refBuyPrice > 0.3) {
      issues.push({field: "buyPrice", level: "warning", message: "采购价与商品参考回收价偏差超过 30%，请复核"});
    }
    result.purchase = {
      ...(sourceType ? {sourceType} : {}),
      partner: {query: candidateName, candidates: purchasePartners, ...(purchasePartners.length === 1 ? {matchedId: purchasePartners[0]?.id} : {}), ...(phoneFromText(text) ? {phone: phoneFromText(text)} : {})},
      lines: purchaseLines,
      ...((inferVoicePaymentMethod(text) || inferVoicePaidStatus(text) || buyPrice !== undefined) ? {payment: {
        ...(inferVoicePaymentMethod(text) ? {method: inferVoicePaymentMethod(text)} : {}),
        ...(inferVoicePaidStatus(text) ? {status: inferVoicePaidStatus(text)} : {}),
        ...(inferVoicePaidStatus(text) === "已付款" && buyPrice !== undefined ? {paidAmount: buyPrice * quantity} : {}),
      }} : {}),
    };
    return result;
  }
  const sellPrice = amount;
  const salesCandidates = customers;
  if (sellPrice !== undefined && productCandidates.length === 1 && productCandidates[0]?.refBuyPrice && sellPrice < productCandidates[0].refBuyPrice) {
    issues.push({field: "sellPrice", level: "error", message: "销售价低于商品参考采购价，请复核"});
  }
  const inventoryForProduct = state.inventory?.filter((item) => productCandidates.some((candidate) => candidate.id === item.productId && ["已入库", "已上架"].includes(item.status))) || [];
  if (sellPrice !== undefined && inventoryForProduct.length && inventoryForProduct.every((item) => sellPrice < item.costPrice)) {
    issues.push({field: "sellPrice", level: "error", message: "销售价低于匹配库存的成本价，请复核"});
  }
  result.sales = {
    customer: {query: candidateName, candidates: salesCandidates, ...(salesCandidates.length === 1 ? {matchedId: salesCandidates[0]?.id} : {})},
    lines: query || productCandidates.length ? [{productQuery: query, ...(extractSnTail(text) ? {snTail: extractSnTail(text)} : {}), ...(sellPrice === undefined ? {} : {sellPrice}), quantity}] : [],
    ...(inferVoiceChannel(text) ? {channel: inferVoiceChannel(text)} : {}),
    ...(inferVoicePaymentMethod(text) && salesPaymentMethodValues.includes(inferVoicePaymentMethod(text) as never) ? {paymentMethod: inferVoicePaymentMethod(text) as VoiceParseResult["sales"] extends {paymentMethod?: infer T} ? T : never} : {}),
    ...(inferVoiceSalesPaid(text) === undefined ? {} : {isPaid: inferVoiceSalesPaid(text)}),
    ...(inferVoiceAftersalesTerms(text) ? {aftersalesTerms: inferVoiceAftersalesTerms(text)} : {}),
  };
  return result;
}

interface RedactedText {text: string; replacements: Map<string, string>}

export function redactVoicePersonalData(text: string): RedactedText {
  const replacements = new Map<string, string>();
  let index = 0;
  const replace = (value: string, label: string) => {
    const placeholder = `<${label}_${++index}>`;
    replacements.set(placeholder, value);
    return placeholder;
  };
  let redacted = text.replace(/(?<!\d)1[3-9](?:[\s-]?\d){9}(?!\d)/g, (value) => replace(value.replace(/[\s-]/g, ""), "PHONE"));
  redacted = redacted.replace(/((?:微信(?:号|号是)?|wx)\s*[：:]?\s*)([a-zA-Z][\w-]{4,30})/gi, (_all, prefix: string, value: string) => `${prefix}${replace(value, "WECHAT")}`);
  redacted = redacted.replace(/((?:QQ(?:号|号码)?|扣扣)\s*[：:]?\s*)(\d{5,12})/gi, (_all, prefix: string, value: string) => `${prefix}${replace(value, "QQ")}`);
  return {text: redacted, replacements};
}

function restorePersonalData(value: unknown, replacements: Map<string, string>): unknown {
  if (typeof value === "string") {
    return [...replacements.entries()].reduce((result, [placeholder, original]) => result.replaceAll(placeholder, original), value);
  }
  if (Array.isArray(value)) return value.map((item) => restorePersonalData(item, replacements));
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, restorePersonalData(item, replacements)]));
  return value;
}

function modelCandidateRequest(text: string, scene: VoiceResolvedScene, context: VoiceParseContext): VoiceModelRequest {
  const sortPartners = <T extends {id: string; name: string; lastDealTime?: string}>(items: T[]) => [...items]
    .sort((left, right) => String(right.lastDealTime || "").localeCompare(String(left.lastDealTime || "")))
    .slice(0, 5).map(({id, name}) => ({id, name}));
  return {
    text, scene,
    candidates: {
      products: rankProducts(context.products).slice(0, 10).map(({id, name}) => ({id, name})),
      customers: sortPartners(context.customers), vendors: sortPartners(context.vendors),
      enums: {
        sourceTypes: sourceTypeValues,
        purchasePaymentMethods: purchasePaymentMethodValues,
        purchasePaymentStatuses: purchasePaymentStatusValues,
        salesChannels: salesChannelValues,
        salesPaymentMethods: salesPaymentMethodValues,
        conditions: inventoryConditionValues,
      },
    },
  };
}

async function callConfiguredAi(request: VoiceModelRequest): Promise<unknown> {
  const apiKey = process.env.AI_API_KEY?.trim();
  if (!apiKey) throw new Error("AI API key is not configured");
  const baseUrl = (process.env.AI_BASE_URL || "https://api.deepseek.com").replace(/\/$/, "");
  const model = process.env.AI_MODEL || "deepseek-v4-flash";
  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json"},
    signal: AbortSignal.timeout(12_000),
    body: JSON.stringify({
      model,
      response_format: {type: "json_object"},
      temperature: 0,
      messages: [
        {role: "system", content: "你是 ERP 语音录入草稿解析器。只返回 JSON，不执行或提交操作。候选商品、客户、供应商只可返回清单中的 id，不能编造 id；不确定时用 null。所有枚举必须从给定值选择。数量不明确按 1 返回并在 issues 标记 warning。采购同型号商品如果逐张成色、包装或维修描述不同，必须拆成多个 lines，并为每行保留对应数量和属性；明确的每张价格可逐行沿用。返回完整 VoiceParseResult，不得扩展业务字段。"},
        {role: "user", content: JSON.stringify(request)},
      ],
    }),
  });
  if (!response.ok) throw new Error(`AI provider returned ${response.status}`);
  const payload: unknown = await response.json();
  if (!payload || typeof payload !== "object" || !("choices" in payload) || !Array.isArray(payload.choices)) throw new Error("AI provider response was malformed");
  const choice = payload.choices[0];
  if (!choice || typeof choice !== "object" || !("message" in choice) || !choice.message || typeof choice.message !== "object" || !("content" in choice.message) || typeof choice.message.content !== "string") throw new Error("AI provider content was malformed");
  return JSON.parse(choice.message.content);
}

function constrainModelIds(candidate: unknown, products: VoiceModelRequest["candidates"]["products"], customers: VoiceModelRequest["candidates"]["customers"], vendors: VoiceModelRequest["candidates"]["vendors"], fallback: VoiceParseResult) {
  if (!candidate || typeof candidate !== "object") return candidate;
  const value = structuredClone(candidate) as Record<string, unknown>;
  const allowed = (list: Array<{id: string; name: string}>) => new Set(list.map((item) => item.id));
  const allowedProducts = allowed(products), allowedCustomers = allowed(customers), allowedVendors = allowed(vendors);
  const sanitizePartner = (target: unknown, ids: Set<string>) => {
    if (!target || typeof target !== "object") return;
    const partner = target as Record<string, unknown>;
    partner.candidates = [];
    if (typeof partner.matchedId === "string" && !ids.has(partner.matchedId)) delete partner.matchedId;
  };
  if (value.purchase && typeof value.purchase === "object") {
    const purchase = value.purchase as Record<string, unknown>;
    if (fallback.purchase?.sourceType) purchase.sourceType = fallback.purchase.sourceType;
    const sourceType = typeof purchase.sourceType === "string" ? purchase.sourceType : "";
    const isPersonalSource = purchasePersonalSourceValues.includes(sourceType as (typeof purchasePersonalSourceValues)[number]);
    sanitizePartner(purchase.partner, isPersonalSource ? allowedCustomers : allowedVendors);
    if (Array.isArray(purchase.lines)) purchase.lines = purchase.lines.map((line) => {
      if (!line || typeof line !== "object") return line;
      const row = line as Record<string, unknown>;
      row.candidates = [];
      if (typeof row.productId === "string" && !allowedProducts.has(row.productId)) delete row.productId;
      return row;
    });
  }
  if (value.sales && typeof value.sales === "object") {
    const sales = value.sales as Record<string, unknown>;
    sanitizePartner(sales.customer, allowedCustomers);
  }
  return value;
}

function materializeModelResult(value: unknown, fallback: VoiceParseResult, context: VoiceParseContext): VoiceParseResult | undefined {
  if (!value || typeof value !== "object") return undefined;
  const output = structuredClone(value) as Record<string, unknown>;
  output.parseId = fallback.parseId;
  output.transcript = fallback.transcript;
  output.scene = fallback.scene;
  output.source = "ai";
  const products = new Map(context.products.map((product) => [product.id, productCandidate(product)]));
  const customers = new Map(context.customers.map((item) => [item.id, {id: item.id, name: item.name}]));
  const vendors = new Map(context.vendors.map((item) => [item.id, {id: item.id, name: item.name}]));
  const attachPartnerCandidates = (target: unknown, index: Map<string, {id: string; name: string}>) => {
    if (!target || typeof target !== "object") return;
    const partner = target as Record<string, unknown>;
    const query = typeof partner.query === "string" ? partner.query : "";
    const matched = [...index.values()].filter((item) => query && item.name.toLowerCase().includes(query.toLowerCase()));
    const allowed = (matched.length ? matched : [...index.values()]).slice(0, 5);
    partner.candidates = allowed;
    if (typeof partner.matchedId !== "string" || !index.has(partner.matchedId) || !allowed.some((item) => item.id === partner.matchedId)) delete partner.matchedId;
  };
  if (output.purchase && typeof output.purchase === "object") {
    const purchase = output.purchase as Record<string, unknown>;
    if (fallback.purchase?.sourceType) purchase.sourceType = fallback.purchase.sourceType;
    const sourceType = typeof purchase.sourceType === "string" ? purchase.sourceType : "";
    const partnerIndex = purchasePersonalSourceValues.includes(sourceType as (typeof purchasePersonalSourceValues)[number]) ? customers : vendors;
    attachPartnerCandidates(purchase.partner, partnerIndex);
    if (purchase.partner && typeof purchase.partner === "object") {
      const partner = purchase.partner as Record<string, unknown>;
      if (fallback.purchase?.partner.phone) partner.phone = fallback.purchase.partner.phone;
      else delete partner.phone;
    }
    if (Array.isArray(purchase.lines)) purchase.lines = purchase.lines.map((line) => {
      if (!line || typeof line !== "object") return line;
      const row = line as Record<string, unknown>;
      const query = typeof row.productQuery === "string" ? row.productQuery : "";
      const candidates = findVoiceProductCandidates(query, context.products, 10);
      row.candidates = candidates;
      if (typeof row.productId !== "string" || !products.has(row.productId) || !candidates.some((candidate) => candidate.id === row.productId)) delete row.productId;
      return row;
    });
  }
  if (output.sales && typeof output.sales === "object") attachPartnerCandidates((output.sales as Record<string, unknown>).customer, customers);
  const parsed = voiceParseResultSchema.safeParse(output);
  return parsed.success ? parsed.data as VoiceParseResult : undefined;
}

export interface ParseVoiceOptions {modelParser?: VoiceModelParser; now?: () => number}

export async function parseVoiceText(input: {text: string; scene: "purchase" | "sales" | "customer" | "auto"; state: VoiceParseContext}, options: ParseVoiceOptions = {}): Promise<VoiceParseResult> {
  const text = input.text.trim();
  const scene = input.scene === "auto" ? resolveVoiceScene(text) : input.scene;
  const fallback = ruleParse(text, scene, input.state);
  const modelParser = options.modelParser || (process.env.AI_API_KEY?.trim() ? callConfiguredAi : undefined);
  if (!modelParser) return fallback;
  const now = options.now?.() ?? Date.now();
  if (AI_PROVIDER_FAILURE_COOLDOWN_MS > 0 && now - aiProviderFailureAt < AI_PROVIDER_FAILURE_COOLDOWN_MS) return fallback;
  const redacted = redactVoicePersonalData(text);
  const request = modelCandidateRequest(redacted.text, scene, input.state);
  try {
    const response = await modelParser(request);
    const constrained = constrainModelIds(response, request.candidates.products, request.candidates.customers, request.candidates.vendors, fallback);
    const restored = restorePersonalData(constrained, redacted.replacements);
    const materialized = materializeModelResult(restored, fallback, input.state);
    if (!materialized) throw new Error("AI provider payload did not match the voice schema");
    return materialized;
  } catch {
    aiProviderFailureAt = now;
    return fallback;
  }
}

export function resetVoiceAiCooldownForTests() { aiProviderFailureAt = 0; }
