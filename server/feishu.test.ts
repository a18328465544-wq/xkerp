import assert from "node:assert/strict";
import test from "node:test";
import { buildFeishuSalesInvoiceMessage, notifyFeishuDailyReport, notifyFeishuSalesInvoiceCreated } from "./feishu.ts";
import type { SalesInvoice } from "../src/types.ts";

const invoice: SalesInvoice = {
  id: "XS-1",
  invoiceNo: "XS-20260726-001",
  date: "2026-07-26 10:30",
  customerName: "测试客户",
  contact: "",
  channel: "微信私域",
  paymentMethod: "微信",
  isPaid: false,
  paidAmount: 1200,
  unpaidAmount: 800,
  needInvoice: false,
  freeShipping: false,
  aftersalesTerms: "店保三个月",
  handleBy: "销售小王",
  items: [
    { inventoryId: "", productId: "P-1", productName: "RTX 4070", sn: "", condition: "出库核验", costPrice: 3000, sellPrice: 4000, profit: 1000, aftersalesTerms: "店保三个月" },
    { inventoryId: "", productId: "P-1", productName: "RTX 4070", sn: "", condition: "出库核验", costPrice: 3000, sellPrice: 4000, profit: 1000, aftersalesTerms: "店保三个月" },
  ],
  totalCount: 2,
  totalCost: 6000,
  totalAmount: 8000,
  totalProfit: 2000,
};

test("sales invoice message includes the operational sales fields", () => {
  const message = buildFeishuSalesInvoiceMessage(invoice);
  assert.match(message, /销售单：XS-20260726-001/);
  assert.match(message, /商品：RTX 4070 ×2/);
  assert.match(message, /待收 ¥800\.00/);
});

test("sales invoice notification posts Feishu text", async () => {
  let request: { url: string; init?: RequestInit } | null = null;
  const result = await notifyFeishuSalesInvoiceCreated(invoice, {
    webhookUrl: "https://example.test/feishu",
    fetchImpl: async (url, init) => {
      request = { url, init };
      return new Response("{}", { status: 200 });
    },
  });
  assert.deepEqual(result, { sent: true });
  assert.equal(request?.url, "https://example.test/feishu");
  assert.equal(JSON.parse(String(request?.init?.body)).msg_type, "text");
});

test("sales invoice notification is skipped cleanly without a configured webhook", async () => {
  const result = await notifyFeishuSalesInvoiceCreated(invoice, { webhookUrl: "" });
  assert.deepEqual(result, { sent: false, reason: "not_configured" });
});

test("sales invoice notification treats a Feishu business error as a delivery failure", async () => {
  const result = await notifyFeishuSalesInvoiceCreated(invoice, {
    webhookUrl: "https://example.test/feishu",
    fetchImpl: async () => new Response(JSON.stringify({ code: 19022, msg: "webhook unavailable" }), { status: 200 }),
  });
  assert.deepEqual(result, { sent: false, reason: "delivery_failed" });
});

test("daily report posts to its own webhook", async () => {
  let request: { url: string; init?: RequestInit } | null = null;
  const result = await notifyFeishuDailyReport("日报正文", {
    webhookUrl: "https://example.test/daily-report",
    fetchImpl: async (url, init) => {
      request = { url, init };
      return new Response("{}", { status: 200 });
    },
  });
  assert.deepEqual(result, { sent: true });
  assert.equal(request?.url, "https://example.test/daily-report");
  assert.equal(JSON.parse(String(request?.init?.body)).content.text, "日报正文");
});
