import type {MarketQuoteItem, QuoteProductOption} from "@/src/types/quote";
import {gpuCoreIdentity, isCoreBaseQuote, productCoreIdentity, quoteIdentityKey} from "@/src/utils/quoteReference";

export function quoteNeedsConfirmation(quote: Pick<MarketQuoteItem, "quoteScope" | "profile">) {
  return !isCoreBaseQuote(quote);
}

export function quoteScopeLabel(quote: Pick<MarketQuoteItem, "quoteScope" | "profile">) {
  return quoteNeedsConfirmation(quote) ? "历史报价 · 待确认" : "核心基础价";
}

export function quoteTitle(quote: MarketQuoteItem) {
  return gpuCoreIdentity(quote.coreModel || quote.model)?.coreModel || quote.model;
}

export function currentQuoteHistory(quote: MarketQuoteItem) {
  const key = quoteNeedsConfirmation(quote) ? null : quoteIdentityKey(quote);
  return key ? quote.history.filter((point) => point.quoteKey === key) : [];
}

export function quoteCoreSuggestions(products: QuoteProductOption[], quotes: MarketQuoteItem[]) {
  const identities = [...products.map(productCoreIdentity), ...quotes.map((quote) => gpuCoreIdentity(quote.coreModel || quote.model))];
  return [...new Map(identities.flatMap((core) => core ? [[core.coreId, core] as const] : [])).values()]
    .sort((left, right) => left.coreModel.localeCompare(right.coreModel, "en", {numeric: true}));
}
