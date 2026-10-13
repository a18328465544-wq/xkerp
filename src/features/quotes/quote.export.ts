import type {MarketQuoteItem} from "@/src/types/quote";
import {quoteNeedsConfirmation, quoteScopeLabel, quoteTitle} from "./quote.reference";

export function quoteExportRows(quotes: MarketQuoteItem[], permissions: {showCost: boolean; showProfit: boolean}): Array<Array<string | number>> {
  return [["行情ID", "完整核心型号", "品牌", "分类", "报价状态", "核心ID", ...(permissions.showCost ? ["回收参考价"] : []), ...(permissions.showProfit ? ["销售参考价"] : []), "来源", "有效期至", "有效状态", "维护人", "说明", "更新时间"],
    ...quotes.map((quote) => [quote.id, quoteTitle(quote), quote.brand, quote.categoryName || "未分类", quoteScopeLabel(quote), quote.coreId || "待确认",
      ...(permissions.showCost ? [quote.buyPrice ?? "暂无报价"] : []), ...(permissions.showProfit ? [quote.sellPrice ?? "暂无报价"] : []), quote.source || "", quote.validUntil || (quoteNeedsConfirmation(quote) ? "待确认" : "未设截止日期"), quoteNeedsConfirmation(quote) ? "历史待确认" : quote.expired ? "已过期" : "未过期", quote.maintainedBy || "", quote.note || "", quote.updateTime || ""])];
}
