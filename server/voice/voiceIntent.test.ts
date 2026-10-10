import assert from "node:assert/strict";
import test from "node:test";
import {
  inferVoiceAftersalesTerms, inferVoiceChannel, inferVoiceCondition, inferVoiceFullBox,
  inferVoicePaidStatus, inferVoicePaymentMethod, inferVoicePurchaseSource, inferVoiceRepaired,
  inferVoiceSalesPaid, resolveVoiceScene,
} from "./voiceIntent.ts";
import {expandProductAliases, findProductAliasMatches} from "./productAliases.ts";

test("voice scene and enums map to existing ERP values", () => {
  assert.equal(resolveVoiceScene("回收李四两张显卡"), "purchase");
  assert.equal(resolveVoiceScene("卖给张三一张4090"), "sales");
  assert.equal(resolveVoiceScene("加个客户王五"), "customer");
  assert.equal(resolveVoiceScene("RTX 4090 猛禽"), null);
  assert.equal(inferVoicePaymentMethod("微信付清"), "微信");
  assert.equal(inferVoicePaymentMethod("现金结账"), "现金");
  assert.equal(inferVoicePaymentMethod("挂账，后面付"), "账期欠款");
  assert.equal(inferVoiceChannel("闲鱼的"), "闲鱼");
  assert.equal(inferVoiceChannel("小红书来的"), "小红书");
  assert.equal(inferVoiceCondition("一张99新"), "99新");
  assert.equal(inferVoiceCondition("靓机"), "95新");
  assert.equal(inferVoiceCondition("良品"), "90新");
  assert.equal(inferVoicePurchaseSource("同行拿货"), "同行拿货");
  assert.equal(inferVoiceFullBox("带盒全套"), true);
  assert.equal(inferVoiceFullBox("裸卡"), false);
  assert.equal(inferVoiceRepaired("换过显存"), true);
  assert.equal(inferVoiceRepaired("没修过"), false);
  assert.equal(inferVoicePaidStatus("付清了"), "已付款");
  assert.equal(inferVoiceSalesPaid("微信收了"), true);
  assert.equal(inferVoiceAftersalesTerms("店保六个月"), "店保半年");
  assert.equal(inferVoiceAftersalesTerms("保到手好"), "保到手好");
});

test("GPU aliases expand and are discoverable as speech hints", () => {
  assert.match(expandProductAliases("RTX 4080S 猛禽"), /rog strix/);
  assert.match(expandProductAliases("万图师"), /ventus/);
  assert.equal(findProductAliasMatches("微星 RTX 4080 魔龙")[0]?.canonical, "GAMING X");
});
