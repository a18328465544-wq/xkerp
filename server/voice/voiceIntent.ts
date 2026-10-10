import type {InventoryCondition, SourceType} from "../../src/types/core.ts";
import type {VoiceResolvedScene} from "../../src/types/voice.ts";

const SCENE_PATTERNS: Array<[Exclude<VoiceResolvedScene, null>, RegExp]> = [
  ["customer", /新客户|加个客户|记一下客户|新增客户|客户资料/],
  ["purchase", /回收|收卡|收货|进货|拿货|采购|收购/],
  ["sales", /卖给|出给|发给|销售|卖卡|出卡/],
];

/**
 * The scene is decided by whichever business verb is spoken first, so
 * "卖给老王，就是上次回收的那张 4090" stays a sale even though "回收" appears later.
 */
export function resolveVoiceScene(text: string): VoiceResolvedScene {
  let best: {scene: Exclude<VoiceResolvedScene, null>; index: number} | null = null;
  for (const [scene, pattern] of SCENE_PATTERNS) {
    const index = text.search(pattern);
    if (index >= 0 && (!best || index < best.index)) best = {scene, index};
  }
  return best?.scene ?? null;
}

const PAYMENT_METHOD_PATTERNS: Array<[string, RegExp]> = [
  ["账期欠款", /账期|欠着|挂账|月结/g],
  ["微信", /微信|微支付/g],
  ["支付宝", /支付宝|alipay/gi],
  ["现金", /现金|现付/g],
  ["银行卡", /银行卡|刷卡|转账|银行转/g],
];

function isContactMention(text: string, index: number, length: number) {
  const before = text.slice(Math.max(0, index - 2), index);
  const after = text.slice(index + length, index + length + 2);
  // "加了微信" / "微信号 xxx" / "微信是 xxx" describe a contact, not how money moved.
  return /加了?$|加个$|有$/.test(before) || /^(?:号|是|[:：])/.test(after);
}

/**
 * Picks the payment keyword closest to a money verb (付/收/转/给/结). Contact mentions
 * such as "加了微信" never count, so "现金付清，加了微信" resolves to 现金.
 */
export function inferVoicePaymentMethod(text: string) {
  const mentions: Array<{method: string; index: number; distance: number}> = [];
  const moneyVerbs = [...text.matchAll(/付|收|转|给|结/g)].map((match) => match.index ?? 0);
  for (const [method, pattern] of PAYMENT_METHOD_PATTERNS) {
    for (const match of text.matchAll(pattern)) {
      const index = match.index ?? 0;
      if (method === "微信" && isContactMention(text, index, match[0].length)) continue;
      const distance = moneyVerbs.length ? Math.min(...moneyVerbs.map((verb) => Math.abs(verb - index))) : Number.POSITIVE_INFINITY;
      mentions.push({method, index, distance});
    }
  }
  if (!mentions.length) return undefined;
  // 账期 wording is itself the payment decision and wins over any channel keyword.
  const credit = mentions.find((item) => item.method === "账期欠款");
  if (credit) return credit.method;
  mentions.sort((left, right) => left.distance - right.distance || left.index - right.index);
  return mentions[0]?.method;
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

/** Partial wording is checked first: "付了部分" / "先付了五千" must not read as fully paid. */
export function inferVoicePaidStatus(text: string): "已付款" | "未付款" | "部分付款" | undefined {
  if (/付了部分|付了一部分|部分付款|先付|定金|首付|还差|尾款/.test(text)) return "部分付款";
  if (/未付|没付|还没给|欠着|挂账|账期/.test(text)) return "未付款";
  if (/付清|已付清|全款|已付款|付了|给了钱|结清/.test(text)) return "已付款";
  return undefined;
}

/** Unpaid wording wins so "没收钱" / "钱还没收" never become a paid sale. */
export function inferVoiceSalesPaid(text: string): boolean | undefined {
  if (/未收|没收|还没收|未付款|没付|欠着|挂账|账期|尾款/.test(text)) return false;
  if (/已收|收了|收清|收到|已付款|付清|付了|结清/.test(text)) return true;
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
  const match = text.match(/店保\s*(半年|六个月|三个月|三月|两个月|一个月|一年)|保到手好|到手包好/);
  if (!match) return undefined;
  if (/保到手好|到手包好/.test(match[0])) return "保到手好";
  return `店保${match[1] === "六个月" ? "半年" : match[1] === "三月" ? "三个月" : match[1]}`;
}
