import assert from "node:assert/strict";
import test from "node:test";
import type {VoiceParseContext} from "./voiceParse.ts";
import {parseVoiceText, redactVoicePersonalData, resetVoiceAiCooldownForTests} from "./voiceParse.ts";

const context = {
  products: [{id: "P-4090", name: "华硕 RTX 4090 ROG STRIX 猛禽 24G", category: "显卡", model: "RTX 4090", brand: "华硕", version: "ROG STRIX 猛禽", vram: "24G", refBuyPrice: 17_700, refSellPrice: 19_200, currentStock: 1, lastDealTime: "2026-10-01"}],
  customers: [{id: "C-1", name: "张三", lastDealTime: "2026-10-01"}],
  vendors: [{id: "V-1", name: "李四", lastDealTime: "2026-10-01"}],
  inventory: [{id: "KC-1", productId: "P-4090", productName: "华硕 RTX 4090 ROG STRIX 猛禽 24G", sn: "SN4090", status: "已入库", costPrice: 18_000, condition: "95新"}],
} as unknown as VoiceParseContext;

test("rules parse a purchase draft and preserve the user's confirmation boundary", async () => {
  const result = await parseVoiceText({text: "回收李四两张 4090 猛禽，每张七千八，一张99新带盒，一张修过，现金付清", scene: "purchase", state: context});
  assert.equal(result.source, "rules");
  assert.equal(result.purchase?.partner.query, "李四");
  assert.equal(result.purchase?.partner.matchedId, "V-1");
  assert.equal(result.purchase?.lines[0]?.productId, "P-4090");
  assert.equal(result.purchase?.lines[0]?.quantity, 2);
  assert.equal(result.purchase?.lines[0]?.buyPrice, 7_800);
  assert.equal(result.purchase?.lines[0]?.condition, "99新");
  assert.equal(result.purchase?.lines[0]?.fullBox, true);
  assert.equal(result.purchase?.lines[0]?.repaired, true);
  assert.equal(result.purchase?.payment?.method, "现金");
  assert.equal(result.purchase?.payment?.status, "已付款");
});

test("auto scene resolves only explicit supported business language", async () => {
  const customer = await parseVoiceText({text: "加个客户王五，想买4090", scene: "auto", state: context});
  assert.equal(customer.scene, "customer");
  assert.equal(customer.customer?.rawTextForQuickCapture, "加个客户王五，想买4090");
  const unclear = await parseVoiceText({text: "RTX 4090 猛禽", scene: "auto", state: context});
  assert.equal(unclear.scene, null);
  assert.ok(unclear.issues.some((issue) => issue.field === "scene"));
});

test("model receives redacted contact data and cannot inject IDs outside candidate lists", async () => {
  resetVoiceAiCooldownForTests();
  let received = "";
  const result = await parseVoiceText({text: "卖给张三，电话 138 1234 5678，微信号 zhangsan88 一张 RTX 4090 猛禽，一万九", scene: "sales", state: context}, {
    modelParser: async (request) => {
      received = request.text;
      return {
        parseId: "attacker-id", scene: "purchase", transcript: "changed", source: "rules",
        sales: {customer: {query: "张三", candidates: [{id: "C-1", name: "张三"}], matchedId: "CUSTOMER-FORGED", phone: "<PHONE_1>", wechat: "<WECHAT_2>"}, lines: [{productQuery: "RTX 4090 猛禽", candidates: [], productId: "FORGED", sellPrice: 19_000, quantity: 1}], channel: "闲鱼", isPaid: true},
        issues: [],
      };
    },
  });
  assert.match(received, /<PHONE_1>/);
  assert.match(received, /<WECHAT_2>/);
  assert.doesNotMatch(received, /13812345678|zhangsan88/);
  assert.equal(result.source, "ai");
  assert.equal(result.parseId.length > 10, true);
  assert.equal(result.scene, "sales");
  assert.equal(result.sales?.customer.matchedId, undefined);
  assert.equal(result.sales?.customer.phone, "13812345678");
  assert.equal(result.sales?.customer.wechat, "zhangsan88");
  assert.equal(result.sales?.lines[0]?.productId, undefined);
  assert.equal("candidates" in (result.sales?.lines[0] || {}), false);
});

test("model failures fall back to deterministic draft results", async () => {
  resetVoiceAiCooldownForTests();
  const result = await parseVoiceText({text: "回收李四一张 RTX 4090 猛禽，每张 1.95万", scene: "purchase", state: context}, {
    now: () => Date.now() + 10 * 60_000,
    modelParser: async () => { throw new Error("mock provider timeout"); },
  });
  assert.equal(result.source, "rules");
  assert.equal(result.purchase?.lines[0]?.buyPrice, 19_500);
});

test("redaction preserves mapping for phone, WeChat and QQ values", () => {
  const result = redactVoicePersonalData("电话 138 1234 5678，微信号 zhangsan88，QQ 123456789");
  assert.equal(result.replacements.get("<PHONE_1>"), "13812345678");
  assert.equal(result.replacements.get("<WECHAT_2>"), "zhangsan88");
  assert.equal(result.replacements.get("<QQ_3>"), "123456789");
});
