import type {MarketQuote, QuoteBinding, QuoteProductOption, QuoteProfile} from "../types/quote";

/** Commercial GPU identity, not a chip die code or fuzzy product-search key. */
export function gpuCoreIdentity(value: string) {
  const text = value.normalize("NFKC").toUpperCase();
  const matches = [...text.matchAll(/\b(RTX|GTX|RX|ARC)\s*-?\s*([A-Z]?\d{3,4})(?:\s*(TI(?:\s*SUPER)?|SUPER|XTX|XT|GRE|D))?(?:\s*(V2))?(?![A-Z0-9])/g)];
  const identities = matches.map(match => {
    const family = match[1];
    const model = `${family}${match[2]}${(match[3] || "").replace(/\s+/g, "")}${match[4] || ""}`;
    const vendor = family === "RX" ? "AMD" : family === "ARC" ? "INTEL" : "NVIDIA";
    return {coreId: `GPU-${vendor}-${model}`, coreModel: model, vendor};
  });
  const unique = new Map(identities.map(item => [item.coreId, item]));
  return unique.size === 1 ? [...unique.values()][0] : null;
}

export function productCoreIdentity(product: Pick<QuoteProductOption, "model" | "name" | "category">) {
  if (product.category !== "显卡") return null;
  const model = gpuCoreIdentity(product.model);
  const name = gpuCoreIdentity(product.name);
  if (model && name && model.coreId !== name.coreId) return null;
  return model || name;
}

export function normalizeQuoteVram(value: string) {
  return value.normalize("NFKC").toUpperCase().replace(/\s+/g, "").replace(/GB$/, "G");
}

export function quoteProfileKey(profile: QuoteProfile) {
  return [profile.condition, profile.grade.trim(), profile.warranty, profile.packaging, normalizeQuoteVram(profile.vram), profile.currency].join("|");
}

/** The only active pricing model: one base quote per complete GPU core. */
export function coreQuoteProfile(): QuoteProfile {
  return {condition: "any", grade: "any", warranty: "any", packaging: "any", vram: "", currency: "CNY"};
}

export function isCoreBaseQuote(quote: Pick<Partial<QuoteBinding>, "quoteScope" | "profile">) {
  const profile = quote.profile;
  return quote.quoteScope === "core" && profile?.condition === "any" && profile.grade === "any"
    && profile.warranty === "any" && profile.packaging === "any" && !profile.vram && profile.currency === "CNY";
}

export function quoteIdentityKey(quote: Partial<QuoteBinding> & {productId?: string}) {
  if (!quote.quoteScope || !quote.coreId) return null;
  if (quote.quoteScope === "core") return `core|${quote.coreId}|CNY`;
  if (!quote.profile || !quote.productId) return null;
  return `product|${quote.productId}|${quoteProfileKey(quote.profile)}`;
}

export function quoteIsExpired(quote: {validUntil?: string}, date: string) {
  return Boolean(quote.validUntil && quote.validUntil < date);
}

/** No legacy/expired/ambiguous fallback and no inventory or product-price writes. */
export function resolveQuoteReference(product: QuoteProductOption, quotes: readonly MarketQuote[], date: string) {
  const core = productCoreIdentity(product);
  if (!core) return {status: "unmatched" as const};
  const applicable = quotes.filter(quote => quote.quoteScope === "core" && quote.coreId === core.coreId && !quoteIsExpired(quote, date));
  if (applicable.length > 1) return {status: "ambiguous" as const};
  const candidate = applicable[0];
  if (!candidate || !isCoreBaseQuote(candidate)) return {status: "unmatched" as const};
  return {status: "matched" as const, quote: candidate, source: "core" as const};
}

export function quoteProfileLabel(profile?: QuoteProfile, scope?: QuoteBinding["quoteScope"]) {
  if (!profile) return "旧报价 · 条件待确认";
  if (scope === "core" || profile.condition === "any") return isCoreBaseQuote({quoteScope: "core", profile})
    ? "核心基础价 · 不分新旧" : "原条件报价 · 待确认为核心基础价";
  return [profile.condition === "new" ? "全新" : "二手", profile.grade === "any" ? "成色不限" : profile.condition === "new" && profile.grade === "全新" ? "" : profile.grade,
    profile.warranty === "in" ? "在保" : profile.warranty === "out" ? "无保" : "质保不限",
    profile.packaging === "boxed" ? "带盒" : profile.packaging === "unboxed" ? "无盒" : "包装不限", profile.vram].filter(Boolean).join(" · ");
}

/** Dashboard/AI consumers must not treat unconfirmed or missing prices as zero. */
export function quoteReferenceSummary(quote: MarketQuote, date: string) {
  const key = quoteIdentityKey(quote);
  if (!key || !isCoreBaseQuote(quote) || quoteIsExpired(quote, date)) return null;
  const numeric = (value: unknown) => typeof value === "number" && Number.isFinite(value) ? value : null;
  const points = (quote.history || []).filter(point => point.quoteKey === key && numeric(point.buyPrice) !== null);
  const comparison = points.length >= 2 && numeric(quote.refBuyPrice) !== null ? numeric(quote.changeRatio) : null;
  return {
    title: `${gpuCoreIdentity(quote.coreModel || quote.model)?.coreModel || quote.coreModel || quote.model} · ${quoteProfileLabel(quote.profile, quote.quoteScope)}`,
    sellPrice: numeric(quote.refSellPrice), changeRatio: comparison,
  };
}
