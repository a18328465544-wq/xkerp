import assert from "node:assert/strict";
import test from "node:test";
import type {VoiceParseContext} from "./voiceParse.ts";
import {parseVoiceText, redactVoicePersonalData, resetVoiceAiCooldownForTests} from "./voiceParse.ts";

const context = {
  products: [{id: "P-4090", name: "华硕 RTX 4090 ROG STRIX 猛禽 24G", category: "显卡", model: "RTX 4090", brand: "华硕", version: "ROG STRIX 猛禽", vram: "24G", refBuyPrice: 17_700, refSellPrice: 19_200, currentStock: 1, lastDealTime: "2026-10-01"}],
  customers: [{id: "C-1", name: "张三", lastDealTime: "2026-10-01"}, {id: "C-2", name: "李四", lastDealTime: "2026-10-01"}],
  vendors: [{id: "V-1", name: "李四", lastDealTime: "2026-10-01"}],
  inventory: [{id: "KC-1", productId: "P-4090", productName: "华硕 RTX 4090 ROG STRIX 猛禽 24G", sn: "SN4090", status: "已入库", costPrice: 18_000, condition: "95新"}],
} as unknown as VoiceParseContext;

test("rules parse a purchase draft and preserve the user's confirmation boundary", async () => {
  const result = await parseVoiceText({text: "同行拿货李四两张 4090 猛禽，每张七千八，一张99新带盒，一张修过，现金付清", scene: "purchase", state: context});
  assert.equal(result.source, "rules");
  assert.equal(result.purchase?.sourceType, "同行拿货");
  assert.equal(result.purchase?.partner.query, "李四");
  assert.equal(result.purchase?.partner.matchedId, "V-1");
  assert.equal(result.purchase?.lines.length, 2);
  assert.equal(result.purchase?.lines[0]?.productId, "P-4090");
  assert.equal(result.purchase?.lines[0]?.quantity, 1);
  assert.equal(result.purchase?.lines[0]?.buyPrice, 7_800);
  assert.equal(result.purchase?.lines[0]?.condition, "99新");
  assert.equal(result.purchase?.lines[0]?.fullBox, true);
  assert.equal(result.purchase?.lines[0]?.repaired, undefined);
  assert.equal(result.purchase?.lines[1]?.quantity, 1);
  assert.equal(result.purchase?.lines[1]?.condition, undefined);
  assert.equal(result.purchase?.lines[1]?.fullBox, undefined);
  assert.equal(result.purchase?.lines[1]?.repaired, true);
  assert.equal(result.purchase?.payment?.method, "现金");
  assert.equal(result.purchase?.payment?.status, "已付款");
  assert.equal(result.purchase?.payment?.paidAmount, 15_600);
});

test("personal purchase sources match customer records instead of vendor records", async () => {
  const result = await parseVoiceText({text: "回收李四电话 138 1234 5678，一张 4090 猛禽，每张 19000", scene: "purchase", state: context});
  assert.equal(result.purchase?.sourceType, "个人回收");
  assert.equal(result.purchase?.partner.candidates[0]?.id, "C-2");
  assert.equal(result.purchase?.partner.matchedId, "C-2");
  assert.equal(result.purchase?.partner.phone, "13812345678");
});

test("model answers cannot change the partner kind implied by the spoken purchase source", async () => {
  resetVoiceAiCooldownForTests();
  const result = await parseVoiceText({text: "回收李四一张 4090 猛禽，每张 19000", scene: "purchase", state: context}, {
    modelParser: async () => ({sourceType: "批量采购", partnerName: "李四", lines: [{productQuery: "4090 猛禽", quantity: 1, unitPrice: 19_000}], paymentStatus: "未付款"}),
  });
  assert.equal(result.source, "ai");
  assert.equal(result.purchase?.sourceType, "个人回收");
  assert.equal(result.purchase?.partner.matchedId, "C-2");
  assert.equal(result.purchase?.partner.candidates[0]?.id, "C-2");
  assert.equal(result.purchase?.payment?.status, "未付款");
});

test("unmatched spoken product names never inherit an unrelated top-ranked product", async () => {
  const result = await parseVoiceText({text: "回收李四一张完全不存在的显卡型号", scene: "purchase", state: context});
  assert.equal(result.purchase?.lines[0]?.productId, undefined);
  assert.deepEqual(result.purchase?.lines[0]?.candidates, []);
});

test("auto scene resolves only explicit supported business language", async () => {
  const customer = await parseVoiceText({text: "加个客户王五，想买4090", scene: "auto", state: context});
  assert.equal(customer.scene, "customer");
  assert.equal(customer.customer?.rawTextForQuickCapture, "加个客户王五，想买4090");
  const unclear = await parseVoiceText({text: "RTX 4090 猛禽", scene: "auto", state: context});
  assert.equal(unclear.scene, null);
  assert.ok(unclear.issues.some((issue) => issue.field === "scene"));
});

test("model receives redacted contact data and only names matched by the rules", async () => {
  resetVoiceAiCooldownForTests();
  let request: Parameters<NonNullable<Parameters<typeof parseVoiceText>[1]>["modelParser"] & {}>[0] | undefined;
  const result = await parseVoiceText({text: "卖给张三，电话 138 1234 5678，微信号 zhangsan88 一张 RTX 4090 猛禽，一万九", scene: "sales", state: context}, {
    modelParser: async (received) => {
      request = received;
      return {partnerName: "张三 <PHONE_1>", lines: [{productQuery: "RTX 4090 猛禽", quantity: 1, unitPrice: 19_000, snTail: null}], channel: "闲鱼", isPaid: true, paymentMethod: "比特币"};
    },
  });
  assert.match(request?.text || "", /<PHONE_1>/);
  assert.match(request?.text || "", /<WECHAT_2>/);
  assert.doesNotMatch(JSON.stringify(request), /13812345678|zhangsan88/);
  assert.deepEqual(request?.partners, ["张三"], "unrelated customers (李四) are never sent to the model");
  assert.equal(result.source, "ai");
  assert.equal(result.parseId.length > 10, true);
  assert.equal(result.scene, "sales");
  assert.equal(result.sales?.customer.matchedId, "C-1");
  assert.equal(result.sales?.customer.phone, "13812345678");
  assert.equal(result.sales?.customer.wechat, "zhangsan88");
  assert.equal(result.sales?.lines[0]?.sellPrice, 19_000);
  assert.equal(result.sales?.channel, "闲鱼");
  assert.equal(result.sales?.paymentMethod, undefined, "values outside the enum are dropped");
  assert.equal("productId" in (result.sales?.lines[0] || {}), false);
});

test("a malformed model answer falls back without pausing AI for everyone", async () => {
  resetVoiceAiCooldownForTests();
  let calls = 0;
  const modelParser = async () => { calls += 1; return calls === 1 ? {lines: "not-an-array"} : {lines: [{productQuery: "4090 猛禽", quantity: 1, unitPrice: 19_000}]}; };
  const first = await parseVoiceText({text: "回收李四一张 4090 猛禽，每张 19000", scene: "purchase", state: context}, {modelParser});
  assert.equal(first.source, "rules");
  const second = await parseVoiceText({text: "回收李四一张 4090 猛禽，每张 19000", scene: "purchase", state: context}, {modelParser});
  assert.equal(second.source, "ai");
  assert.equal(calls, 2);
});

test("customer and unresolved scenes never call the model", async () => {
  resetVoiceAiCooldownForTests();
  let calls = 0;
  const modelParser = async () => { calls += 1; return {lines: [{productQuery: "4090", quantity: 1, unitPrice: 1}]}; };
  const customer = await parseVoiceText({text: "加个客户王五", scene: "auto", state: context}, {modelParser});
  const unclear = await parseVoiceText({text: "RTX 4090 猛禽 一万九", scene: "auto", state: context}, {modelParser});
  assert.equal(calls, 0);
  assert.equal(customer.purchase, undefined);
  assert.equal(unclear.purchase, undefined);
  assert.equal(unclear.sales, undefined);
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

test("only a unique full product match is auto-selected", async () => {
  const products = [
    ...context.products,
    {id: "P-4090-TUF", name: "华硕 RTX 4090 TUF 24G", category: "显卡", model: "RTX 4090", brand: "华硕", version: "TUF", vram: "24G", refBuyPrice: 16_000, refSellPrice: 17_500, currentStock: 2, lastDealTime: "2026-10-02"},
    {id: "P-4080S", name: "微星 RTX 4080 SUPER 魔龙 16G", category: "显卡", model: "RTX 4080 SUPER", brand: "微星", version: "GAMING X", vram: "16G", refBuyPrice: 7_500, refSellPrice: 8_300, currentStock: 1, lastDealTime: "2026-09-01"},
  ];
  const state = {...context, products} as VoiceParseContext;
  const strix = await parseVoiceText({text: "同行拿货李四一张 4090 猛禽，每张 18000", scene: "purchase", state});
  assert.equal(strix.purchase?.lines[0]?.productId, "P-4090");
  const generic = await parseVoiceText({text: "同行拿货李四一张 4090，每张 18000", scene: "purchase", state});
  assert.equal(generic.purchase?.lines[0]?.productId, undefined, "two 4090 cards need a manual choice");
  assert.equal(generic.purchase?.lines[0]?.candidates.length, 2);
  const onlyTuf = await parseVoiceText({text: "同行拿货李四一张 4090 猛禽，每张 18000", scene: "purchase", state: {...state, products: products.filter((item) => item.id !== "P-4090")} as VoiceParseContext});
  assert.equal(onlyTuf.purchase?.lines[0]?.productId, undefined, "a partial hit is offered, never auto-selected");
  assert.equal(onlyTuf.purchase?.lines[0]?.candidates[0]?.id, "P-4090-TUF");
  const superCard = await parseVoiceText({text: "同行拿货李四一张 4080S 魔龙，每张 7600", scene: "purchase", state});
  assert.equal(superCard.purchase?.lines[0]?.productId, "P-4080S");
  const spokenDigits = await parseVoiceText({text: "同行拿货李四一张四零九零猛禽，每张一万八", scene: "purchase", state});
  assert.equal(spokenDigits.purchase?.lines[0]?.productId, "P-4090");
});

test("partners are linked automatically only on an exact name", async () => {
  const state = {...context, customers: [...context.customers, {id: "C-3", name: "张三丰", lastDealTime: "2026-10-05"}]} as VoiceParseContext;
  const exact = await parseVoiceText({text: "卖给张三一张 4090 猛禽，一万九", scene: "sales", state});
  assert.equal(exact.sales?.customer.matchedId, "C-1");
  const partial = await parseVoiceText({text: "卖给张三丰的朋友一张 4090 猛禽，一万九", scene: "sales", state: {...state, customers: [{id: "C-3", name: "张三丰的朋友老刘", lastDealTime: "2026-10-05"}]} as VoiceParseContext});
  assert.equal(partial.sales?.customer.matchedId, undefined);
});

test("total prices are spread per card and paid amounts use the spoken total", async () => {
  const result = await parseVoiceText({text: "同行拿货李四两张 4090 猛禽，一共三万六，现金付清", scene: "purchase", state: context});
  assert.equal(result.purchase?.lines[0]?.quantity, 2);
  assert.equal(result.purchase?.lines[0]?.buyPrice, 18_000);
  assert.equal(result.purchase?.payment?.paidAmount, 36_000);
  assert.ok(result.issues.some((issue) => issue.field === "buyPrice" && /总价/.test(issue.message)));
  const partial = await parseVoiceText({text: "同行拿货李四一张 4090 猛禽，每张一万八，先付了五千", scene: "purchase", state: context});
  assert.equal(partial.purchase?.payment?.status, "部分付款");
  assert.equal(partial.purchase?.payment?.paidAmount, 5_000);
});

test("cost hints are only produced for users who may see cost", async () => {
  const text = "卖给张三一张 4090 猛禽，一万五";
  const hidden = await parseVoiceText({text, scene: "sales", state: context});
  assert.equal(hidden.issues.some((issue) => issue.field === "sellPrice"), false);
  const shown = await parseVoiceText({text, scene: "sales", state: context, canViewCost: true});
  assert.ok(shown.issues.some((issue) => issue.field === "sellPrice" && issue.level === "error"));
});

test("contact details are not treated as product words or prices", async () => {
  const result = await parseVoiceText({text: "回收李四电话 138 1234 5678 一张 4090 猛禽，每张 19000", scene: "purchase", state: context});
  assert.equal(result.purchase?.lines[0]?.productId, "P-4090");
  assert.equal(result.purchase?.lines[0]?.buyPrice, 19_000);
  assert.doesNotMatch(result.purchase?.lines[0]?.productQuery || "", /138|1234/);
});

test("reference prices follow the same showCost / showProfit projection as product reads", async () => {
  const text = "同行拿货李四一张 4090 猛禽，每张 9000";
  const hidden = await parseVoiceText({text, scene: "purchase", state: context});
  const candidate = hidden.purchase?.lines[0]?.candidates[0];
  assert.equal(candidate?.id, "P-4090");
  assert.equal("refBuyPrice" in (candidate || {}), false);
  assert.equal("refSellPrice" in (candidate || {}), false);
  assert.equal(hidden.issues.some((issue) => issue.field === "buyPrice"), false);
  const shown = await parseVoiceText({text, scene: "purchase", state: context, canViewCost: true, canViewProfit: true});
  assert.equal(shown.purchase?.lines[0]?.candidates[0]?.refBuyPrice, 17_700);
  assert.equal(shown.purchase?.lines[0]?.candidates[0]?.refSellPrice, 19_200);
  assert.ok(shown.issues.some((issue) => issue.field === "buyPrice"));
});

test("names spoken before the verb are found and filler words stay out of the product text", async () => {
  const state = {...context, vendors: [{id: "V-9", name: "老王", lastDealTime: "2026-10-01"}]} as VoiceParseContext;
  const result = await parseVoiceText({text: "跟老王拿货五张4090猛禽，一共九万，先付了两万", scene: "auto", state});
  assert.equal(result.scene, "purchase");
  assert.equal(result.purchase?.partner.query, "老王");
  assert.equal(result.purchase?.partner.matchedId, "V-9");
  assert.equal(result.purchase?.lines[0]?.productQuery, "4090猛禽");
  assert.equal(result.purchase?.lines[0]?.buyPrice, 18_000);
  assert.equal(result.purchase?.payment?.status, "部分付款");
  const sale = await parseVoiceText({text: "卖给张三一张4090猛禽，1万9，微信收了，店保半年，闲鱼的", scene: "auto", state: context});
  assert.equal(sale.sales?.lines[0]?.productQuery, "4090猛禽");
  assert.equal(sale.sales?.lines[0]?.sellPrice, 19_000);
});
