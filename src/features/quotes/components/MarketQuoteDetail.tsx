import {ErpDetailDrawer, ErpRecordDetail, ErpStatusBadge} from "@/src/components/common";
import type {MarketQuoteItem} from "@/src/types/quote";
import {quoteIdentityKey} from "@/src/utils/quoteReference";
import {formatCurrency} from "@/src/lib/format";
import {quoteNeedsConfirmation, quoteScopeLabel, quoteTitle} from "../quote.reference";

const priceLabel = (value: number | undefined, allowed: boolean) => !allowed ? "无权限" : value === undefined ? "暂无报价" : formatCurrency(value);

export function MarketQuoteDetail({quote, showCost, showProfit, onClose}: {quote: MarketQuoteItem | null; showCost: boolean; showProfit: boolean; onClose: () => void}) {
  const unconfirmed = Boolean(quote && quoteNeedsConfirmation(quote));
  const key = quote && !unconfirmed ? quoteIdentityKey(quote) : null;
  const history = <div className="space-y-2">{quote?.history.length ? quote.history.map((point, index) => <div key={point.date + "-" + index} className="rounded-[var(--erp-radius-md)] bg-[var(--erp-color-surface-muted)] p-3 text-sm"><div className="mb-1 flex flex-wrap items-center gap-2"><span>{point.date}</span><ErpStatusBadge label={key && point.quoteKey === key ? "当前核心" : "历史待确认"} tone={key && point.quoteKey === key ? "info" : "neutral"} /></div><div className="flex flex-wrap gap-x-4 gap-y-1"><span>收 {priceLabel(point.buyPrice, showCost)}</span><span>售 {priceLabel(point.sellPrice, showProfit)}</span></div></div>) : <p className="text-sm text-[var(--erp-color-text-muted)]">暂无历史价格。</p>}</div>;
  return <ErpDetailDrawer modal={false} resizable drawerKey="market-quote-detail" defaultWidth={680} minWidth={520} maxWidth={880} open={Boolean(quote)} onOpenChange={(open) => {if (!open) onClose();}} title={quote ? quoteTitle(quote) : "行情详情"} description="每个完整核心型号仅维护一套基础价，历史待确认记录不参与当前趋势。">
    {quote && <ErpRecordDetail hero={{title: quoteTitle(quote), status: <ErpStatusBadge label={quoteScopeLabel(quote) + (quote.expired ? " · 已过期" : "")} tone={unconfirmed || quote.expired ? "warning" : "info"} />}} sections={[
      {title: "核心信息", facts: [{label: "核心型号", value: quoteTitle(quote)}, {label: "核心映射", value: quote.coreId || "待确认"}, {label: "分类", value: quote.categoryName || "未分类"}], extra: unconfirmed ? <p className="text-sm text-[var(--erp-color-warning)]">历史报价仅作留档；明确转换后才能作为核心基础价维护。</p> : undefined},
      {title: "行情参考", facts: [{label: unconfirmed ? "历史回收价" : "回收参考价", value: priceLabel(quote.buyPrice, showCost)}, {label: unconfirmed ? "历史销售价" : "销售参考价", value: priceLabel(quote.sellPrice, showProfit)}, ...(quote.source ? [{label: "报价来源", value: quote.source}] : []), {label: "有效期至", value: quote.validUntil || (unconfirmed ? "待确认" : "未设截止日期")}, {label: "维护人", value: quote.maintainedBy || "未记录"}, {label: "更新时间", value: quote.updateTime || "—"}]},
      {title: "说明", facts: [], collapsed: true, extra: <p className="text-sm text-[var(--erp-color-text-secondary)]">{quote.note || "暂无补充说明"}</p>},
      {title: "真实历史", facts: [], collapsed: true, extra: history},
    ]} />}
  </ErpDetailDrawer>;
}
