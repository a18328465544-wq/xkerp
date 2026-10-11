import {randomUUID} from "node:crypto";
import {z} from "zod";
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

const SPOKEN_DIGITS: Record<string, string> = {零: "0", 〇: "0", 洞: "0", 一: "1", 幺: "1", 二: "2", 两: "2", 三: "3", 四: "4", 五: "5", 六: "6", 七: "7", 八: "8", 九: "9"};

/**
 * Normalises a product phrase so speech and catalogue text compare equally:
 * aliases (猛禽 → rog strix), digit-by-digit model numbers (四零九零 → 4090),
 * and the "4080S" shorthand for SUPER cards.
 */
export function normalizeVoiceProductText(value: string) {
  const spokenModels = value.replace(/[零〇洞一幺二两三四五六七八九]{3,}/g, (run) => [...run].map((char) => SPOKEN_DIGITS[char] ?? char).join(""));
  return expandProductAliases(spokenModels)
    .replace(/(\d{3,4})\s*s(?![a-z])/g, "$1super")
    .replace(/[^\p{L}\p{N}]+/gu, "");
}

type ProductMatchScore = 0 | 1 | 2 | 3;

function productSearchText(product: ProductTemplate) {
  return normalizeVoiceProductText(`${product.name} ${product.brand} ${product.model} ${product.version} ${product.vram}`);
}

/**
 * Splits a normalised spoken phrase into match tokens. Chinese runs that no catalogue entry
 * contains ("同行", "那张", stray price words) are noise and dropped; Latin/number tokens and
 * Chinese brand words that do occur in the catalogue are kept as required tokens.
 */
function productQueryTokens(query: string, searchTexts: string[]) {
  const normalized = normalizeVoiceProductText(query);
  const tokens = normalized.match(/\d+|[a-z]+|\p{Script=Han}+/gu) || [];
  return [...new Set(tokens.filter((token) => {
    if (/\p{Script=Han}/u.test(token)) return searchTexts.some((text) => text.includes(token));
    return token.length >= 2;
  }))];
}

function scoreProduct(tokens: string[], searchText: string): ProductMatchScore {
  if (!tokens.length) return 3;
  const hits = tokens.filter((token) => searchText.includes(token));
  if (hits.length === tokens.length) return 0;
  const modelTokens = tokens.filter((token) => /\d{3,}/.test(token));
  if (modelTokens.length && modelTokens.every((token) => searchText.includes(token))) return 1;
  return hits.some((token) => token.length >= 3) ? 2 : 3;
}

export interface VoiceProductMatch {
  candidates: ReturnType<typeof productCandidate>[];
  /** Set only when exactly one catalogue entry contains every spoken product token. */
  matchedId?: string;
}

/**
 * Ranks catalogue entries for a spoken product phrase. Partial hits are offered as candidates
 * only; auto-selection requires a unique full match, so "4090 猛禽" never silently becomes the
 * only 4090 TUF in stock (PURCHASE_PASTE_CONTRACT: unmatched rows need a manual choice).
 */
export function matchVoiceProducts(query: string, products: ProductTemplate[], limit = 10): VoiceProductMatch {
  const ranked = rankProducts(products).map((product) => ({product, searchText: productSearchText(product)}));
  const tokens = productQueryTokens(query, ranked.map((entry) => entry.searchText));
  const scored = ranked.map((entry) => ({product: entry.product, score: scoreProduct(tokens, entry.searchText)}))
    .filter((entry) => entry.score < 3);
  scored.sort((left, right) => left.score - right.score);
  const fullMatches = scored.filter((entry) => entry.score === 0);
  return {
    candidates: scored.slice(0, limit).map(({product}) => productCandidate(product)),
    ...(fullMatches.length === 1 && fullMatches[0] ? {matchedId: fullMatches[0].product.id} : {}),
  };
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

/** A partner is linked automatically only when exactly one record has the spoken name verbatim. */
function exactPartnerId(query: string, candidates: Array<{id: string; name: string}>) {
  const normalizedQuery = clean(query).toLowerCase();
  if (!normalizedQuery) return undefined;
  const exact = candidates.filter((candidate) => candidate.name.trim().toLowerCase() === normalizedQuery);
  return exact.length === 1 ? exact[0]?.id : undefined;
}

function partnerQuery(text: string, scene: VoiceResolvedScene) {
  const marker = scene === "sales"
    ? /(?:卖给|出给|发给|客户)\s*([\p{Script=Han}]{2,8}|[a-zA-Z][a-zA-Z0-9_-]{1,20})(?=\s|[一二两三四五六七八九十0-9]|[,，。]|$)/u
    : /(?:回收|收购|采购|进货|拿货|供应商)\s*([\p{Script=Han}]{2,8}|[a-zA-Z][a-zA-Z0-9_-]{1,20})(?=\s|[一二两三四五六七八九十0-9]|[,，。]|$)/u;
  if (scene === "purchase") {
    // "跟老王拿货 / 从李四那收" puts the name before the verb.
    const before = text.match(/(?:跟|找|从|向)\s*([\p{Script=Han}]{2,4}?|[a-zA-Z][a-zA-Z0-9_-]{1,20})(?=那边|那里|那|这|拿货|进货|收|买|采购)/u)?.[1];
    if (before) return before;
  }
  // The name run is greedy, so trim words that start the next phrase: "李四电话…" → "李四".
  return text.match(marker)?.[1]
    ?.replace(/(?:电话|手机|微信|扣扣|的|说|要|想|这边|那边).*$/, "")
    .replace(/(?:一张|两张|三张|四张|五张|[0-9]+张)$/, "") || "";
}

function productQuery(text: string) {
  return clean(text
    .replace(/(?:跟|找|从|向)\s*(?:[\p{Script=Han}]{2,4}?|[a-zA-Z][a-zA-Z0-9_-]{1,20})(?=那边|那里|那|这|拿货|进货|收|买|采购)/gu, " ")
    .replace(/(?:卖给|出给|发给|回收|收购|采购|进货|拿货|客户|供应商)\s*(?:[\p{Script=Han}]{2,8}|[a-zA-Z][a-zA-Z0-9_-]{1,20})/gu, " ")
    .replace(/(?:先付了?|付了|定金|首付|还差|尾款)\s*[零〇洞一幺二两三四五六七八九十百千万亿点\d,.]*(?:元|块)?/g, " ")
    .replace(/(?:加了|收了|收到了?|就是|上次|那张|这张|那块|这块|一下|的)/g, " ")
    .replace(/(?:每张|每片|每台|每个|单价|收购价|采购价|售价|销售价|报价|价格|成本价|总价|一共)\s*[零〇洞一幺二两三四五六七八九十百千万亿点\d,.，]+(?:元|块)?/g, " ")
    .replace(/[零〇洞一幺二两三四五六七八九十百千万亿点\d,.，]+\s*(?:张|片|台|个|件)/g, " ")
    .replace(/(?:全新|99\s*新|95\s*新|90\s*新|85\s*新|充新|靓机|良品|带盒|有盒|全套|修过|维修过|换过显存|付清|已付款|未付款|欠着|挂账|微信|支付宝|现金|银行卡|店保(?:半年|三个月|一年)|保到手好|闲鱼|抖音|小红书|B站|哔哩哔哩|微信私域|同行网店|到店|门店)/g, " ")
    .replace(/(?:电话|手机|微信号|微信|QQ)(?:是|号)?\s*[\w+\-\s]{5,20}/g, " "));
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

const MONEY_NUMBER = "((?:[零〇洞一幺二两三四五六七八九十百千万亿点\\d]+)(?:[.．][零〇洞一幺二两三四五六七八九十\\d]+)?(?:万|千)?)";

interface VoiceMoney {value: number; raw: string; kind: "unit" | "total" | "unlabeled"}

/** Total-price wording ("一共 / 总价 / 合计") is kept apart from per-card prices. */
function extractMoney(text: string): VoiceMoney | undefined {
  const patterns: Array<[VoiceMoney["kind"], RegExp]> = [
    ["total", new RegExp(`(?:总价|一共|总共|合计|总计|打包价|打包)\\s*[:：]?\\s*${MONEY_NUMBER}\\s*(?:元|块)?`)],
    ["unit", new RegExp(`(?:每张|每片|每台|每个|单价|收购价|采购价|售价|销售价|报价|价格|成本价|预算|成交价)\\s*[:：]?\\s*${MONEY_NUMBER}\\s*(?:元|块)?`)],
    ["unlabeled", new RegExp(`[￥¥]\\s*${MONEY_NUMBER}\\s*(?:元|块)?`)],
    ["unlabeled", new RegExp(`[，,、]\\s*${MONEY_NUMBER}\\s*(?:元|块)?(?=\\s*(?:[，,。]|微信|支付宝|现金|银行卡|店保|闲鱼|抖音|$))`)],
  ];
  for (const [kind, pattern] of patterns) {
    const match = text.match(pattern);
    const value = match?.[1] ? parseVoiceAmount(match[1]) : undefined;
    if (match && value !== undefined) return {value, raw: match[0], kind};
  }
  return undefined;
}

function roundMoney(value: number) {
  return Math.round(value * 100) / 100;
}

/** Converts the spoken amount into a per-card price; a total is spread evenly with a warning. */
function unitPriceFor(money: VoiceMoney | undefined, quantity: number, issues: VoiceIssue[], field: string) {
  if (!money) return undefined;
  if (money.kind === "total" && quantity > 1) {
    issues.push({field, level: "warning", message: `按总价 ¥${money.value} 平均到每张 ¥${roundMoney(money.value / quantity)}，请核对`});
    return roundMoney(money.value / quantity);
  }
  if (money.kind === "unlabeled" && quantity > 1) {
    issues.push({field, level: "warning", message: "没有说明是单价还是总价，已按每张价格处理，请核对"});
  }
  return money.value;
}

function splitPurchaseLinesByExplicitUnitTraits(text: string, quantity: number, productQueryText: string, match: VoiceProductMatch, buyPrice: number | undefined) {
  const descriptors = text.split(/[，,、。；;]/)
    .map((clause) => clause.trim())
    .filter((clause) => /[零〇洞一幺二两三四五六七八九十\d.]+\s*(?:张|片|台|个|件)/.test(clause)
      && Boolean(inferVoiceCondition(clause) || inferVoiceFullBox(clause) !== undefined || inferVoiceRepaired(clause) !== undefined));
  if (descriptors.length < 2) return null;
  const quantities = descriptors.map((clause) => extractQuantity(clause, []));
  if (quantities.reduce((total, value) => total + value, 0) !== quantity) return null;
  return descriptors.map((clause, index) => ({
    productQuery: productQueryText,
    candidates: match.candidates,
    ...(match.matchedId ? {productId: match.matchedId} : {}),
    quantity: quantities[index] || 1,
    ...(buyPrice === undefined ? {} : {buyPrice}),
    ...(inferVoiceCondition(clause) ? {condition: inferVoiceCondition(clause)} : {}),
    ...(inferVoiceFullBox(clause) === undefined ? {} : {fullBox: inferVoiceFullBox(clause)}),
    ...(inferVoiceRepaired(clause) === undefined ? {} : {repaired: inferVoiceRepaired(clause)}),
  }));
}

function extractSnTail(text: string) {
  const match = text.match(/(?:尾号|SN\s*尾号?)\s*([a-z0-9]{3,12})/i);
  return match?.[1];
}

function contactsFromText(text: string) {
  const contacts: {phone?: string; wechat?: string; qq?: string} = {};
  for (const [placeholder, value] of redactVoicePersonalData(text).replacements) {
    if (placeholder.startsWith("<PHONE_") && !contacts.phone) contacts.phone = value;
    if (placeholder.startsWith("<WECHAT_") && !contacts.wechat) contacts.wechat = value;
    if (placeholder.startsWith("<QQ_") && !contacts.qq) contacts.qq = value;
  }
  return contacts;
}

function isPersonalPurchaseSource(sourceType: string | undefined) {
  return Boolean(sourceType && purchasePersonalSourceValues.includes(sourceType as (typeof purchasePersonalSourceValues)[number]));
}

function purchasePartnerPool(sourceType: string | undefined, state: VoiceParseContext): Array<{id: string; name: string; lastDealTime?: string}> {
  return isPersonalPurchaseSource(sourceType) ? state.customers : state.vendors;
}

function partnerDraft<T extends {id: string; name: string; lastDealTime?: string}>(name: string, pool: T[]) {
  const candidates = partnerCandidates(name, pool, 5);
  const matchedId = exactPartnerId(name, pool);
  return {query: name, candidates, ...(matchedId ? {matchedId} : {})};
}

export interface VoiceParseOptionsForUser {
  /** Whether the caller may see cost-derived hints (the `showCost` permission). */
  canViewCost?: boolean;
  /** Whether the caller may see reference selling prices (the `showProfit` permission). */
  canViewProfit?: boolean;
}

/** Mirrors publicState's product projection: hidden price fields never leave the server. */
function projectDraftForUser(result: VoiceParseResult, options: VoiceParseOptionsForUser): VoiceParseResult {
  if (!result.purchase) return result;
  const lines = result.purchase.lines.map((line) => ({
    ...line,
    candidates: line.candidates.map(({refBuyPrice, refSellPrice, ...candidate}) => ({
      ...candidate,
      ...(options.canViewCost && refBuyPrice !== undefined ? {refBuyPrice} : {}),
      ...(options.canViewProfit && refSellPrice !== undefined ? {refSellPrice} : {}),
    })),
  }));
  return {...result, purchase: {...result.purchase, lines}};
}

type PurchaseLine = NonNullable<VoiceParseResult["purchase"]>["lines"][number];
type SalesLine = NonNullable<VoiceParseResult["sales"]>["lines"][number];

function purchasePriceIssues(lines: PurchaseLine[], state: VoiceParseContext, options: VoiceParseOptionsForUser): VoiceIssue[] {
  // The deviation hint is derived from the reference purchase price, which only showCost users see.
  if (!options.canViewCost) return [];
  const issues: VoiceIssue[] = [];
  for (const line of lines) {
    const product = line.productId ? state.products.find((item) => item.id === line.productId) : undefined;
    if (line.buyPrice !== undefined && product?.refBuyPrice && Math.abs(line.buyPrice - product.refBuyPrice) / product.refBuyPrice > 0.3) {
      issues.push({field: "buyPrice", level: "warning", message: "采购价与商品参考回收价偏差超过 30%，请复核"});
      break;
    }
  }
  return issues;
}

function salesPriceIssues(lines: SalesLine[], state: VoiceParseContext, options: VoiceParseOptionsForUser): VoiceIssue[] {
  // Cost-derived hints reveal purchase cost, so they are only produced for showCost users.
  if (!options.canViewCost) return [];
  const issues: VoiceIssue[] = [];
  for (const line of lines) {
    if (line.sellPrice === undefined) continue;
    const match = matchVoiceProducts(line.productQuery, state.products, 10);
    const reference = match.matchedId ? state.products.find((item) => item.id === match.matchedId) : undefined;
    if (reference?.refBuyPrice && line.sellPrice < reference.refBuyPrice) {
      issues.push({field: "sellPrice", level: "error", message: "销售价低于商品参考采购价，请复核"});
      break;
    }
    const candidateIds = new Set(match.candidates.map((candidate) => candidate.id));
    const stock = state.inventory?.filter((item) => candidateIds.has(item.productId) && ["已入库", "已上架"].includes(item.status)) || [];
    if (stock.length && stock.every((item) => line.sellPrice !== undefined && line.sellPrice < item.costPrice)) {
      issues.push({field: "sellPrice", level: "error", message: "销售价低于匹配库存的成本价，请复核"});
      break;
    }
  }
  return issues;
}

/** "先付了两万" / "定金三千" → the amount actually handed over for a partial payment. */
function partialPaidAmount(text: string) {
  const match = text.match(new RegExp(`(?:先付了?|付了|定金|首付|预付)\\s*${MONEY_NUMBER}\\s*(?:元|块)?`));
  return match?.[1] ? parseVoiceAmount(match[1]) : undefined;
}

function purchasePayment(text: string, lines: PurchaseLine[], money: VoiceMoney | undefined) {
  const method = inferVoicePaymentMethod(text);
  const status = inferVoicePaidStatus(text);
  if (!method && !status && !money) return undefined;
  const lineTotal = lines.every((line) => line.buyPrice !== undefined)
    ? roundMoney(lines.reduce((total, line) => total + (line.buyPrice || 0) * line.quantity, 0))
    : undefined;
  const paidAmount = status === "已付款" ? (money?.kind === "total" ? money.value : lineTotal)
    : status === "部分付款" ? partialPaidAmount(text) : undefined;
  return {
    ...(method && purchasePaymentMethodValues.includes(method as never) ? {method} : {}),
    ...(status ? {status} : {}),
    ...(paidAmount === undefined ? {} : {paidAmount}),
  };
}

function ruleParse(text: string, scene: VoiceResolvedScene, state: VoiceParseContext, options: VoiceParseOptionsForUser): VoiceParseResult {
  const issues: VoiceIssue[] = [];
  const result: VoiceParseResult = {parseId: randomUUID(), scene, transcript: text, source: "rules", issues};
  if (!scene) {
    issues.push({field: "scene", level: "warning", message: "未判断出录入场景，请选择采购、销售或新建客户"});
    return result;
  }
  if (scene === "customer") {
    result.customer = {rawTextForQuickCapture: text};
    return result;
  }
  const money = extractMoney(text);
  // Contacts and the spoken price are removed before product matching so a phone number,
  // WeChat ID or "19000" can never become a required product token.
  const productText = redactVoicePersonalData(money ? text.replace(money.raw, " ") : text).text.replace(/<[A-Z]+_\d+>/g, " ");
  const query = productQuery(productText);
  const match = matchVoiceProducts(query, state.products, 10);
  const quantity = extractQuantity(text, issues);
  const partnerName = partnerQuery(text, scene);
  const contacts = contactsFromText(text);

  if (scene === "purchase") {
    const sourceType = inferVoicePurchaseSource(text);
    const buyPrice = unitPriceFor(money, quantity, issues, "buyPrice");
    const lines: PurchaseLine[] = query || match.candidates.length ? splitPurchaseLinesByExplicitUnitTraits(text, quantity, query, match, buyPrice) || [{
      productQuery: query,
      candidates: match.candidates,
      ...(match.matchedId ? {productId: match.matchedId} : {}),
      quantity,
      ...(buyPrice === undefined ? {} : {buyPrice}),
      ...(inferVoiceCondition(text) ? {condition: inferVoiceCondition(text)} : {}),
      ...(inferVoiceFullBox(text) === undefined ? {} : {fullBox: inferVoiceFullBox(text)}),
      ...(inferVoiceRepaired(text) === undefined ? {} : {repaired: inferVoiceRepaired(text)}),
    }] : [];
    issues.push(...purchasePriceIssues(lines, state, options));
    const payment = purchasePayment(text, lines, money);
    result.purchase = {
      ...(sourceType ? {sourceType} : {}),
      partner: {...partnerDraft(partnerName, purchasePartnerPool(sourceType, state)), ...(contacts.phone ? {phone: contacts.phone} : {})},
      lines,
      ...(payment ? {payment} : {}),
    };
    return result;
  }

  const sellPrice = unitPriceFor(money, quantity, issues, "sellPrice");
  const lines: SalesLine[] = query || match.candidates.length ? [{productQuery: query, ...(extractSnTail(text) ? {snTail: extractSnTail(text)} : {}), ...(sellPrice === undefined ? {} : {sellPrice}), quantity}] : [];
  issues.push(...salesPriceIssues(lines, state, options));
  const paymentMethod = inferVoicePaymentMethod(text);
  const channel = inferVoiceChannel(text);
  const isPaid = inferVoiceSalesPaid(text);
  const aftersalesTerms = inferVoiceAftersalesTerms(text);
  result.sales = {
    customer: {...partnerDraft(partnerName, state.customers), ...contacts},
    lines,
    ...(channel ? {channel} : {}),
    ...(paymentMethod && salesPaymentMethodValues.includes(paymentMethod as never) ? {paymentMethod: paymentMethod as (typeof salesPaymentMethodValues)[number]} : {}),
    ...(isPaid === undefined ? {} : {isPaid}),
    ...(aftersalesTerms ? {aftersalesTerms} : {}),
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

const voiceModelLineSchema = z.object({
  productQuery: z.string().max(120).nullish(),
  quantity: z.number().int().min(1).max(500).nullish(),
  unitPrice: z.number().nonnegative().max(10_000_000).nullish(),
  condition: z.string().nullish(),
  fullBox: z.boolean().nullish(),
  repaired: z.boolean().nullish(),
  snTail: z.string().max(32).nullish(),
});

/**
 * The model returns this small flat shape, never ERP IDs. The server re-matches every product and
 * partner name against the catalogue, so the model cannot select records the rules would not.
 */
const voiceModelOutputSchema = z.object({
  sourceType: z.string().nullish(),
  partnerName: z.string().max(40).nullish(),
  lines: z.array(voiceModelLineSchema).max(30).nullish(),
  paymentMethod: z.string().nullish(),
  paymentStatus: z.string().nullish(),
  isPaid: z.boolean().nullish(),
  channel: z.string().nullish(),
  aftersalesTerms: z.string().max(80).nullish(),
});
type VoiceModelOutput = z.infer<typeof voiceModelOutputSchema>;

const VOICE_MODEL_SYSTEM_PROMPT = [
  "你是 ERP 语音录入草稿解析器，只把一句门店口语整理成 JSON，不执行、不提交任何操作。",
  "只返回一个 JSON 对象，字段固定如下（不知道的字段填 null，不要增加其他字段）：",
  '{"sourceType":null,"partnerName":null,"lines":[{"productQuery":"","quantity":1,"unitPrice":null,"condition":null,"fullBox":null,"repaired":null,"snTail":null}],"paymentMethod":null,"paymentStatus":null,"isPaid":null,"channel":null,"aftersalesTerms":null}',
  "规则：",
  "1. productQuery 写商品的品牌、系列和型号原话，例如“华硕 4090 猛禽”；如果 catalogue 里有对应写法，尽量照抄 catalogue 中的名称。不要写数量、价格、成色。",
  "2. unitPrice 是每张的价格（数字）。如果只说了总价，用总价除以数量。",
  "3. 同型号多张卡如果成色、包装或维修情况不同，必须拆成多行，每行写自己的 quantity 和属性。",
  "4. partnerName 是对方的称呼原话（如“李四”“老王”），只能取原文中出现的人名；partners 列表里有相同写法时照抄。",
  "5. sourceType / paymentMethod / paymentStatus / channel / condition 只能从 enums 里选，选不出就填 null。",
  "6. 采购场景用 paymentStatus，销售场景用 isPaid（true 已收款 / false 未收款）。",
  "7. 文本里形如 <PHONE_1> 的占位符原样保留，不要猜测其内容。",
].join("\n");

export interface VoiceModelRequest {
  text: string;
  scene: Exclude<VoiceResolvedScene, null | "customer">;
  catalogue: string[];
  partners: string[];
  enums: {
    sourceTypes: readonly string[];
    purchasePaymentMethods: readonly string[];
    purchasePaymentStatuses: readonly string[];
    salesChannels: readonly string[];
    salesPaymentMethods: readonly string[];
    conditions: readonly string[];
  };
}

export type VoiceModelParser = (request: VoiceModelRequest) => Promise<unknown>;

/** Raised when the provider answered but its content is not usable JSON; this never triggers the cooldown. */
class VoiceModelFormatError extends Error {}

/**
 * Only names that the rules already matched against the spoken words are sent: the model helps
 * normalise wording and split lines, and unrelated customers or products never leave the server.
 */
function modelRequestFor(redactedText: string, scene: "purchase" | "sales", fallback: VoiceParseResult): VoiceModelRequest {
  const lines = fallback.purchase?.lines || [];
  const catalogue = scene === "purchase"
    ? [...new Set(lines.flatMap((line) => line.candidates.map((candidate) => candidate.name)))].slice(0, 10)
    : [];
  const partners = (scene === "purchase" ? fallback.purchase?.partner.candidates : fallback.sales?.customer.candidates) || [];
  return {
    text: redactedText,
    scene,
    catalogue,
    partners: partners.map((partner) => partner.name).slice(0, 5),
    enums: {
      sourceTypes: sourceTypeValues,
      purchasePaymentMethods: purchasePaymentMethodValues,
      purchasePaymentStatuses: purchasePaymentStatusValues,
      salesChannels: salesChannelValues,
      salesPaymentMethods: salesPaymentMethodValues,
      conditions: inventoryConditionValues,
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
        {role: "system", content: VOICE_MODEL_SYSTEM_PROMPT},
        {role: "user", content: JSON.stringify(request)},
      ],
    }),
  });
  if (!response.ok) throw new Error(`AI provider returned ${response.status}`);
  const payload: unknown = await response.json();
  if (!payload || typeof payload !== "object" || !("choices" in payload) || !Array.isArray(payload.choices)) throw new Error("AI provider response was malformed");
  const choice = payload.choices[0];
  if (!choice || typeof choice !== "object" || !("message" in choice) || !choice.message || typeof choice.message !== "object" || !("content" in choice.message) || typeof choice.message.content !== "string") throw new Error("AI provider content was malformed");
  try {
    return JSON.parse(choice.message.content);
  } catch {
    throw new VoiceModelFormatError("AI provider content was not JSON");
  }
}

function enumValue<T extends string>(values: readonly T[], value: string | null | undefined): T | undefined {
  return value && values.includes(value as T) ? value as T : undefined;
}

function cleanModelText(value: string | null | undefined, maxLength: number) {
  return (value || "").replace(/<[A-Z]+_\d+>/g, " ").replace(/\s+/g, " ").trim().slice(0, maxLength);
}

/**
 * Builds the draft from the model's flat answer on top of the rule draft. Everything identifying a
 * record (product, partner) is re-derived by the same matching the rules use, and fields the model
 * left empty keep the rule value.
 */
function mergeModelDraft(model: VoiceModelOutput, fallback: VoiceParseResult, state: VoiceParseContext, options: VoiceParseOptionsForUser): VoiceParseResult | undefined {
  const issues = fallback.issues.filter((issue) => issue.field !== "buyPrice" && issue.field !== "sellPrice");
  const result: VoiceParseResult = {parseId: fallback.parseId, scene: fallback.scene, transcript: fallback.transcript, source: "ai", issues};
  const modelLines = (model.lines || []).filter((line) => cleanModelText(line.productQuery, 120) || line.unitPrice != null);

  if (fallback.scene === "purchase" && fallback.purchase) {
    const sourceType = fallback.purchase.sourceType || enumValue(sourceTypeValues, model.sourceType);
    const partnerName = cleanModelText(model.partnerName, 40) || fallback.purchase.partner.query;
    const lines: PurchaseLine[] = modelLines.length ? modelLines.map((line) => {
      const query = cleanModelText(line.productQuery, 120) || fallback.purchase?.lines[0]?.productQuery || "";
      const match = matchVoiceProducts(query, state.products, 10);
      const condition = enumValue(inventoryConditionValues, line.condition);
      return {
        productQuery: query,
        candidates: match.candidates,
        ...(match.matchedId ? {productId: match.matchedId} : {}),
        quantity: line.quantity ?? 1,
        ...(line.unitPrice == null ? {} : {buyPrice: roundMoney(line.unitPrice)}),
        ...(condition ? {condition} : {}),
        ...(line.fullBox == null ? {} : {fullBox: line.fullBox}),
        ...(line.repaired == null ? {} : {repaired: line.repaired}),
      };
    }) : fallback.purchase.lines;
    const method = enumValue(purchasePaymentMethodValues, model.paymentMethod) || fallback.purchase.payment?.method;
    const status = enumValue(purchasePaymentStatusValues, model.paymentStatus) || fallback.purchase.payment?.status;
    const lineTotal = lines.every((line) => line.buyPrice !== undefined)
      ? roundMoney(lines.reduce((total, line) => total + (line.buyPrice || 0) * line.quantity, 0))
      : undefined;
    const paidAmount = status === "已付款" ? lineTotal : status === "部分付款" ? partialPaidAmount(fallback.transcript) : undefined;
    issues.push(...purchasePriceIssues(lines, state, options));
    result.purchase = {
      ...(sourceType ? {sourceType} : {}),
      partner: {...partnerDraft(partnerName, purchasePartnerPool(sourceType, state)), ...(fallback.purchase.partner.phone ? {phone: fallback.purchase.partner.phone} : {})},
      lines,
      ...(method || status ? {payment: {...(method ? {method} : {}), ...(status ? {status} : {}), ...(paidAmount === undefined ? {} : {paidAmount})}} : {}),
    };
  } else if (fallback.scene === "sales" && fallback.sales) {
    const partnerName = cleanModelText(model.partnerName, 40) || fallback.sales.customer.query;
    const {query: _query, candidates: _candidates, matchedId: _matchedId, ...contacts} = fallback.sales.customer;
    const lines: SalesLine[] = modelLines.length ? modelLines.map((line) => {
      const snTail = cleanModelText(line.snTail, 32);
      return {
        productQuery: cleanModelText(line.productQuery, 120) || fallback.sales?.lines[0]?.productQuery || "",
        ...(snTail ? {snTail} : {}),
        ...(line.unitPrice == null ? {} : {sellPrice: roundMoney(line.unitPrice)}),
        quantity: line.quantity ?? 1,
      };
    }) : fallback.sales.lines;
    const channel = enumValue(salesChannelValues, model.channel) || fallback.sales.channel;
    const paymentMethod = enumValue(salesPaymentMethodValues, model.paymentMethod) || fallback.sales.paymentMethod;
    const isPaid = model.isPaid ?? fallback.sales.isPaid;
    const aftersalesTerms = cleanModelText(model.aftersalesTerms, 80) || fallback.sales.aftersalesTerms;
    issues.push(...salesPriceIssues(lines, state, options));
    result.sales = {
      customer: {...partnerDraft(partnerName, state.customers), ...contacts},
      lines,
      ...(channel ? {channel} : {}),
      ...(paymentMethod ? {paymentMethod} : {}),
      ...(isPaid === undefined ? {} : {isPaid}),
      ...(aftersalesTerms ? {aftersalesTerms} : {}),
    };
  } else {
    return undefined;
  }
  const parsed = voiceParseResultSchema.safeParse(result);
  return parsed.success ? parsed.data as VoiceParseResult : undefined;
}

export interface ParseVoiceOptions {modelParser?: VoiceModelParser; now?: () => number}

export async function parseVoiceText(input: {text: string; scene: "purchase" | "sales" | "customer" | "auto"; state: VoiceParseContext} & VoiceParseOptionsForUser, options: ParseVoiceOptions = {}): Promise<VoiceParseResult> {
  const text = input.text.trim();
  const scene = input.scene === "auto" ? resolveVoiceScene(text) : input.scene;
  const userOptions: VoiceParseOptionsForUser = {canViewCost: input.canViewCost === true, canViewProfit: input.canViewProfit === true};
  const draft = await parseVoiceDraft(text, scene, input.state, userOptions, options);
  return projectDraftForUser(draft, userOptions);
}

async function parseVoiceDraft(text: string, scene: VoiceResolvedScene, state: VoiceParseContext, userOptions: VoiceParseOptionsForUser, options: ParseVoiceOptions): Promise<VoiceParseResult> {
  const fallback = ruleParse(text, scene, state, userOptions);
  // Customer drafts go through quick-capture, and an unknown scene has nothing to refine.
  if (scene !== "purchase" && scene !== "sales") return fallback;
  const modelParser = options.modelParser || (process.env.AI_API_KEY?.trim() ? callConfiguredAi : undefined);
  if (!modelParser) return fallback;
  const now = options.now?.() ?? Date.now();
  if (AI_PROVIDER_FAILURE_COOLDOWN_MS > 0 && now - aiProviderFailureAt < AI_PROVIDER_FAILURE_COOLDOWN_MS) return fallback;
  const redacted = redactVoicePersonalData(text);
  let response: unknown;
  try {
    response = await modelParser(modelRequestFor(redacted.text, scene, fallback));
  } catch (error) {
    // Only an unreachable or failing provider pauses AI parsing; a bad answer affects this request alone.
    if (!(error instanceof VoiceModelFormatError)) aiProviderFailureAt = now;
    return fallback;
  }
  // Contacts in the draft always come from the rules on the original text; placeholders the model
  // echoes back are stripped rather than restored, so no contact can drift into a name or product.
  const parsed = voiceModelOutputSchema.safeParse(response);
  if (!parsed.success) return fallback;
  return mergeModelDraft(parsed.data, fallback, state, userOptions) || fallback;
}

export function resetVoiceAiCooldownForTests() { aiProviderFailureAt = 0; }
