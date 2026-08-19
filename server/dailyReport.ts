import type { AppState } from "./store.ts";
import type { AiInsightsPayload } from "./aiInsights.ts";

const money = (value: unknown) => Number(value || 0) || 0;

function beforeCutoff(value: string | undefined, date: string, cutoff: string) {
  if (!value) return false;
  const normalized = String(value).trim();
  if (!normalized.startsWith(date)) return false;
  // Date-only business records are counted for that business day. Timestamp records respect the
  // scheduled report cutoff so the message never implies it includes transactions after 20:00.
  return normalized.length <= date.length || normalized.slice(0, `${date} `.length + cutoff.length) <= `${date} ${cutoff}`;
}

export interface DailyBusinessReport {
  date: string;
  cutoff: string;
  personalRecycleCount: number;
  personalRecycleCost: number;
  peerPurchaseCount: number;
  peerPurchaseCost: number;
  salesOrderCount: number;
  salesOrderAmount: number;
  outboundCount: number;
  outboundAmount: number;
  realizedGrossProfit: number;
  cashIncome: number;
  cashExpense: number;
  netCashChange: number;
  receivable: number;
  payable: number;
  pendingInspection: number;
  pendingOutbound: number;
  pendingReturns: number;
  accountReconciliationDifferences: number;
}

export function buildDailyBusinessReport(state: AppState, date: string, cutoff = "20:00"): DailyBusinessReport {
  const purchases = state.purchaseInvoices.filter(invoice => beforeCutoff(invoice.date, date, cutoff));
  const personalPurchases = purchases.filter(invoice => invoice.sourceType === "个人回收" || invoice.sourceType === "客户置换");
  const peerPurchases = purchases.filter(invoice => !personalPurchases.includes(invoice));
  const outboundCards = state.inventory.filter(card => card.status === "已售出" && beforeCutoff(card.salesTime, date, cutoff));
  const salesOrders = state.salesInvoices.filter(invoice => beforeCutoff(invoice.date, date, cutoff));
  const cashRows = state.settlementLedger.filter(row => beforeCutoff(row.time, date, cutoff));
  const receivable = state.salesInvoices.reduce((sum, invoice) => sum + Math.max(0, money(invoice.unpaidAmount)), 0);
  const payable = state.purchaseInvoices.reduce((sum, invoice) => sum + Math.max(0, money(invoice.unpaidAmount)), 0);

  return {
    date,
    cutoff,
    personalRecycleCount: personalPurchases.reduce((sum, invoice) => sum + money(invoice.totalCount), 0),
    personalRecycleCost: personalPurchases.reduce((sum, invoice) => sum + money(invoice.totalCost), 0),
    peerPurchaseCount: peerPurchases.reduce((sum, invoice) => sum + money(invoice.totalCount), 0),
    peerPurchaseCost: peerPurchases.reduce((sum, invoice) => sum + money(invoice.totalCost), 0),
    salesOrderCount: salesOrders.length,
    salesOrderAmount: salesOrders.reduce((sum, invoice) => sum + money(invoice.totalAmount), 0),
    outboundCount: outboundCards.length,
    outboundAmount: outboundCards.reduce((sum, card) => sum + money(card.salesPrice), 0),
    realizedGrossProfit: outboundCards.reduce((sum, card) => sum + money(card.salesPrice) - money(card.costPrice), 0),
    cashIncome: cashRows.reduce((sum, row) => sum + money(row.incomeAmount), 0),
    cashExpense: cashRows.reduce((sum, row) => sum + money(row.expenseAmount), 0),
    netCashChange: cashRows.reduce((sum, row) => sum + money(row.incomeAmount) - money(row.expenseAmount), 0),
    receivable,
    payable,
    pendingInspection: state.inventory.filter(card => card.status === "待检测").length,
    pendingOutbound: state.salesInvoices.filter(invoice => invoice.outboundStatus === "待出库").length,
    pendingReturns: state.returnOrders.filter(order => order.status === "待处理").length,
    accountReconciliationDifferences: state.settlementAccounts.filter(account => account.actualBalance !== undefined && Math.abs(money(account.actualBalance) - money(account.balance)) > 0.009).length,
  };
}

export function buildFeishuDailyBusinessReportMessage(report: DailyBusinessReport) {
  const formatMoney = (value: number) => `¥${value.toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const signMoney = (value: number) => `${value >= 0 ? "+" : "-"}${formatMoney(Math.abs(value))}`;
  return [
    "📊 成都显卡一号店 · 经营日报",
    `日期：${report.date}（截至 ${report.cutoff}）`,
    "",
    "库存流转",
    `• 个人回收：${report.personalRecycleCount} 张 / ${formatMoney(report.personalRecycleCost)}`,
    `• 同行进货：${report.peerPurchaseCount} 张 / ${formatMoney(report.peerPurchaseCost)}`,
    `• 实际出库：${report.outboundCount} 张`,
    `• 销售开单：${report.salesOrderCount} 单 / ${formatMoney(report.salesOrderAmount)}`,
    "",
    "经营结果",
    `• 已出库销售额：${formatMoney(report.outboundAmount)}`,
    `• 已实现毛利：${signMoney(report.realizedGrossProfit)}`,
    `• 今日资金流入：${formatMoney(report.cashIncome)}`,
    `• 今日资金流出：${formatMoney(report.cashExpense)}`,
    `• 净现金变动：${signMoney(report.netCashChange)}`,
    "",
    "资金与待办",
    `• 当前应收：${formatMoney(report.receivable)} · 当前应付：${formatMoney(report.payable)}`,
    `• 待检测：${report.pendingInspection} 张 · 待出库：${report.pendingOutbound} 单 · 待处理退货：${report.pendingReturns} 单`,
    `• 账户实盘差额：${report.accountReconciliationDifferences} 个`,
    "",
    "注：已实现毛利按当天实际出库卡的真实成本计算；净现金变动不等于利润。",
  ].join("\n");
}

export function buildFeishuDailyAiSummaryMessage(report: DailyBusinessReport, ai: AiInsightsPayload) {
  const base = buildFeishuDailyBusinessReportMessage(report);
  const suggestions = ai.insights.length
    ? ai.insights.map((insight, index) => [
      `${index + 1}. 【${insight.label}】${insight.title}`,
      `   ${insight.detail}`,
      insight.evidence.length ? `   依据：${insight.evidence.join("；")}` : "",
    ].filter(Boolean).join("\n")).join("\n")
    : "暂无需要优先处理的 AI 建议。";
  return [
    base,
    "",
    "🤖 AI 经营总结",
    suggestions,
    "",
    `建议生成：${ai.source === "ai" ? "DeepSeek 实时分析" : "本地规则分析"} · ${ai.generatedAt.slice(0, 16).replace("T", " ")}`,
    "注：建议仅供经营决策参考，价格、采购和财务操作仍需人工确认。",
  ].join("\n");
}
