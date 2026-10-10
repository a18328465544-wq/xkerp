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

test("scene follows the first spoken business verb", () => {
  assert.equal(resolveVoiceScene("卖给老王，就是上次回收的那张4090"), "sales");
  assert.equal(resolveVoiceScene("回收老王一张4090，他说之前想卖给别人"), "purchase");
  assert.equal(resolveVoiceScene("新客户王五，想回收他的3080"), "customer");
});

test("payment method ignores contact mentions and prefers the keyword next to the money verb", () => {
  assert.equal(inferVoicePaymentMethod("现金付清，加了微信"), "现金");
  assert.equal(inferVoicePaymentMethod("微信号 abc123，支付宝转的"), "支付宝");
  assert.equal(inferVoicePaymentMethod("他微信是 abc123，现金给了"), "现金");
  assert.equal(inferVoicePaymentMethod("微信收了"), "微信");
  assert.equal(inferVoicePaymentMethod("先欠着，回头微信转"), "账期欠款");
  assert.equal(inferVoicePaymentMethod("加了微信"), undefined);
});

test("partial and unpaid wording beats generic paid wording", () => {
  assert.equal(inferVoicePaidStatus("付了部分"), "部分付款");
  assert.equal(inferVoicePaidStatus("先付了五千"), "部分付款");
  assert.equal(inferVoicePaidStatus("还没付清"), "未付款");
  assert.equal(inferVoicePaidStatus("现金付清"), "已付款");
  assert.equal(inferVoiceSalesPaid("钱还没收"), false);
  assert.equal(inferVoiceSalesPaid("微信收到了"), true);
});

test("aftersales terms tolerate spaces and short warranties", () => {
  assert.equal(inferVoiceAftersalesTerms("店保 三个月"), "店保三个月");
  assert.equal(inferVoiceAftersalesTerms("店保一个月"), "店保一个月");
});
