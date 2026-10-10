import type {InventoryCondition, SourceType} from "../../src/types/core.ts";
import type {VoiceResolvedScene} from "../../src/types/voice.ts";

export function resolveVoiceScene(text: string): VoiceResolvedScene {
  if (/新客户|加个客户|记一下客户|新增客户|客户资料/.test(text)) return "customer";
  if (/回收|收卡|收货|进货|拿货|采购|收购/.test(text)) return "purchase";
  if (/卖给|出给|发给|销售|卖卡|出卡/.test(text)) return "sales";
  return null;
}

export function inferVoicePaymentMethod(text: string) {
  if (/账期|欠着|挂账|月结/.test(text)) return "账期欠款";
  if (/微信|微支付/.test(text)) return "微信";
  if (/支付宝|支[付付]宝|alipay/i.test(text)) return "支付宝";
  if (/现金|现付/.test(text)) return "现金";
  if (/银行卡|刷卡|转账|银行转/.test(text)) return "银行卡";
  return undefined;
}

export function inferVoiceChannel(text: string) {
  if (/闲鱼/.test(text)) return "闲鱼";
  if (/抖音/.test(text)) return "抖音";
  if (/小红书/.test(text)) return "小红书";
  if (/B站|哔哩哔哩/i.test(text)) return "B站";
  if (/同行网店|同行网站/.test(text)) return "同行网店";
  if (/微信私域|微信客户/.test(text)) return "微信私域";
  if (/到店|门店/.test(text)) return "到店";
  return undefined;
}

export function inferVoiceCondition(text: string): InventoryCondition | undefined {
  if (/全新|未拆/.test(text)) return "全新";
  if (/99\s*新|充新/.test(text)) return "99新";
  if (/95\s*新|靓机/.test(text)) return "95新";
  if (/9\s*成新|九成新|90\s*新|良品/.test(text)) return "90新";
  if (/85\s*新|轻度使用/.test(text)) return "85新";
  if (/瑕疵|划痕|磕碰/.test(text)) return "轻微瑕疵";
  if (/坏了|损坏/.test(text)) return "损坏";
  return undefined;
}

export function inferVoicePurchaseSource(text: string): SourceType | undefined {
  if (/同行|同行拿货/.test(text)) return "同行拿货";
  if (/批量|整批|一批/.test(text)) return "批量采购";
  if (/客户置换|置换/.test(text)) return "客户置换";
  if (/回收|个人卖家|个人手里/.test(text)) return "个人回收";
  return undefined;
}

export function inferVoicePaidStatus(text: string): "已付款" | "未付款" | "部分付款" | undefined {
  if (/付清|已付清|全款|已付款|付了/.test(text)) return "已付款";
  if (/未付|没付|欠着|挂账|账期/.test(text)) return "未付款";
  if (/付了部分|先付|部分付款/.test(text)) return "部分付款";
  return undefined;
}

export function inferVoiceSalesPaid(text: string): boolean | undefined {
  if (/已收|收了|收清|已付款|付清/.test(text)) return true;
  if (/未收|没收|未付款|欠着|挂账|账期/.test(text)) return false;
  return undefined;
}

export function inferVoiceFullBox(text: string) {
  if (/带盒|有盒|原盒|全套|配件齐/.test(text)) return true;
  if (/无盒|裸卡|不带盒/.test(text)) return false;
  return undefined;
}

export function inferVoiceRepaired(text: string) {
  if (/没修过|未维修|从未修/.test(text)) return false;
  if (/修过|维修过|换过显存|换过芯片|返修/.test(text)) return true;
  return undefined;
}

export function inferVoiceAftersalesTerms(text: string) {
  const match = text.match(/店保s*(半年|六个月|三个月|三月|一年)|保到手好|到手包好/);
  if (!match) return undefined;
  if (/保到手好|到手包好/.test(match[0])) return "保到手好";
  return `店保${match[1] === "六个月" ? "半年" : match[1] === "三月" ? "三个月" : match[1]}`;
}
