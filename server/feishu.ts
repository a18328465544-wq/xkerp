import type { SalesInvoice } from "../src/types.ts";

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export type FeishuSalesNotificationResult =
  | { sent: true }
  | { sent: false; reason: "not_configured" | "delivery_failed" };

export type FeishuNotificationResult = FeishuSalesNotificationResult;

function money(value: number) {
  return `¥${Number(value || 0).toLocaleString("zh-CN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function itemSummary(invoice: SalesInvoice) {
  const grouped = new Map<string, number>();
  invoice.items.forEach((item) => {
    const name = item.productName?.trim() || "未命名商品";
    grouped.set(name, (grouped.get(name) || 0) + Math.max(1, Number(item.quantity || 1)));
  });
  const rows = Array.from(grouped, ([name, quantity]) => `${name} ×${quantity}`);
  return rows.length > 6 ? `${rows.slice(0, 6).join("；")}；等 ${rows.length} 种` : rows.join("；");
}

export function buildFeishuSalesInvoiceMessage(invoice: SalesInvoice) {
  const payment = invoice.unpaidAmount > 0
    ? `已收 ${money(invoice.paidAmount)}，待收 ${money(invoice.unpaidAmount)}`
    : `已收款 ${money(invoice.paidAmount || invoice.totalAmount)}`;
  return [
    "📦 销售开单提醒",
    `销售单：${invoice.invoiceNo}`,
    `客户：${invoice.customerName || "未填写"}`,
    `商品：${itemSummary(invoice) || "未填写"}`,
    `数量：${invoice.totalCount} 件`,
    `订单金额：${money(invoice.totalAmount)}`,
    `收款情况：${payment}`,
    `经办人：${invoice.handleBy || "未填写"}`,
    `开单时间：${invoice.date || "未填写"}`,
  ].join("\n");
}

export async function notifyFeishuSalesInvoiceCreated(
  invoice: SalesInvoice,
  options: {
    webhookUrl?: string;
    fetchImpl?: FetchLike;
    timeoutMs?: number;
  } = {},
): Promise<FeishuSalesNotificationResult> {
  const webhookUrl = (options.webhookUrl ?? process.env.FEISHU_SALES_WEBHOOK_URL ?? "").trim();
  if (!webhookUrl) return { sent: false, reason: "not_configured" };

  const timeoutMs = Math.max(1_000, Number(options.timeoutMs ?? process.env.FEISHU_NOTIFICATION_TIMEOUT_MS ?? 5_000));
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  try {
    const response = await fetchImpl(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        msg_type: "text",
        content: { text: buildFeishuSalesInvoiceMessage(invoice) },
      }),
      signal: AbortSignal.timeout(timeoutMs),
    });
    const payload = await response.json().catch(() => null) as { code?: unknown; StatusCode?: unknown; msg?: unknown; StatusMessage?: unknown } | null;
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const platformCode = typeof payload?.code === "number"
      ? payload.code
      : typeof payload?.StatusCode === "number"
        ? payload.StatusCode
        : 0;
    if (platformCode !== 0) {
      throw new Error(String(payload?.msg || payload?.StatusMessage || `Feishu code ${platformCode}`));
    }
    return { sent: true };
  } catch (error) {
    // A third-party chat notification must never roll back a successful sales order.
    console.error("[feishu] 销售开单提醒发送失败", {
      invoiceNo: invoice.invoiceNo,
      error: error instanceof Error ? error.message : String(error),
    });
    return { sent: false, reason: "delivery_failed" };
  }
}

export async function notifyFeishuDailyReport(
  text: string,
  options: {
    webhookUrl?: string;
    fetchImpl?: FetchLike;
    timeoutMs?: number;
  } = {},
): Promise<FeishuNotificationResult> {
  // The daily owner report intentionally falls back to the sales/outbound robot. Small stores
  // usually operate one group robot, while a dedicated daily-report robot can still override it.
  const webhookUrl = (options.webhookUrl ?? process.env.FEISHU_DAILY_REPORT_WEBHOOK_URL ?? process.env.FEISHU_SALES_WEBHOOK_URL ?? "").trim();
  if (!webhookUrl) return { sent: false, reason: "not_configured" };

  const timeoutMs = Math.max(1_000, Number(options.timeoutMs ?? process.env.FEISHU_NOTIFICATION_TIMEOUT_MS ?? 5_000));
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;
  try {
    const response = await fetchImpl(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ msg_type: "text", content: { text } }),
      signal: AbortSignal.timeout(timeoutMs),
    });
    const payload = await response.json().catch(() => null) as { code?: unknown; StatusCode?: unknown; msg?: unknown; StatusMessage?: unknown } | null;
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const platformCode = typeof payload?.code === "number" ? payload.code : typeof payload?.StatusCode === "number" ? payload.StatusCode : 0;
    if (platformCode !== 0) throw new Error(String(payload?.msg || payload?.StatusMessage || `Feishu code ${platformCode}`));
    return { sent: true };
  } catch (error) {
    console.error("[feishu] 经营日报推送失败", { error: error instanceof Error ? error.message : String(error) });
    return { sent: false, reason: "delivery_failed" };
  }
}
