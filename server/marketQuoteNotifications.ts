import type {MarketQuote} from "../src/types.ts";
import type {FeishuMarketQuotePriceChange} from "./feishu.ts";
import {quoteIdentityKey, quoteIsExpired, isCoreBaseQuote} from "../src/utils/quoteReference.ts";
import {storeDate} from "../src/utils/storeTime.ts";

function marketQuotePrice(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

export function snapshotMarketQuote(quote: MarketQuote) {
  return {...quote};
}

export function marketQuotePriceChange(before: MarketQuote | undefined, after: MarketQuote | undefined): FeishuMarketQuotePriceChange | null {
  if (!before || !after) return null;
  if (before.quoteScope === "product" || after.quoteScope === "product") return null;
  if (before.quoteScope === "core" && !isCoreBaseQuote(before) || after.quoteScope === "core" && !isCoreBaseQuote(after)) return null;
  if (quoteIdentityKey(before) !== quoteIdentityKey(after) || quoteIsExpired(after, storeDate())) return null;
  const previousBuyPrice = marketQuotePrice(before.quoteScope ? before.refBuyPrice : before.refBuyPrice ?? before.todayBuyPrice ?? before.yestBuyPrice);
  const nextBuyPrice = marketQuotePrice(after.quoteScope ? after.refBuyPrice : after.refBuyPrice ?? after.todayBuyPrice ?? after.yestBuyPrice);
  const previousSellPrice = marketQuotePrice(before.quoteScope ? before.refSellPrice : before.refSellPrice ?? before.todaySellPrice ?? before.maxPrice);
  const nextSellPrice = marketQuotePrice(after.quoteScope ? after.refSellPrice : after.refSellPrice ?? after.todaySellPrice ?? after.maxPrice);
  // The existing outbound notification contract requires four numeric prices.
  // Suppress incomplete comparisons instead of inventing a zero reference.
  if ([previousBuyPrice, nextBuyPrice, previousSellPrice, nextSellPrice].some(value => value === null)) return null;
  if (previousBuyPrice === nextBuyPrice && previousSellPrice === nextSellPrice) return null;
  return {
    quoteId: after.id,
    productName: after.productName,
    model: after.model,
    brand: after.brand,
    previousBuyPrice: previousBuyPrice!,
    nextBuyPrice: nextBuyPrice!,
    previousSellPrice: previousSellPrice!,
    nextSellPrice: nextSellPrice!,
    updateTime: after.updateTime || after.date,
  };
}

export function marketQuotePriceChanges(before: Map<string, MarketQuote>, after: MarketQuote[]) {
  return after
    .map((quote) => marketQuotePriceChange(before.get(quote.id), quote))
    .filter((change): change is FeishuMarketQuotePriceChange => Boolean(change));
}
