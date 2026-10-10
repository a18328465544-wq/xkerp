const CHINESE_DIGITS: Record<string, number> = {
  零: 0, 〇: 0, 洞: 0, 一: 1, 幺: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5,
  六: 6, 七: 7, 八: 8, 九: 9,
};

export interface VoiceNumberResult {
  value?: number;
  ambiguous?: boolean;
}

function cleanNumericText(value: unknown) {
  return String(value ?? "").trim().replace(/[￥¥元块圆人民币,，\s]/g, "");
}

function parseArabic(text: string): number | undefined {
  const match = text.match(/^(-?\d+(?:\.\d+)?)(万|千)?$/);
  if (!match?.[1]) return undefined;
  const base = Number(match[1]);
  if (!Number.isFinite(base) || base < 0) return undefined;
  const multiplier = match[2] === "万" ? 10_000 : match[2] === "千" ? 1_000 : 1;
  return Math.round(base * multiplier * 100) / 100;
}

function parseChineseSection(section: string, afterLargeUnit: boolean) {
  if (!section) return 0;
  let total = 0;
  let pendingDigit: number | undefined;
  let lastSmallUnit = 0;
  let hasSmallUnit = false;
  let containsExplicitZero = false;

  for (let index = 0; index < section.length; index += 1) {
    const char = section[index];
    if (!char) continue;
    // ASR inverse text normalisation emits mixed forms such as "1万9" or "2千5":
    // an Arabic digit run acts exactly like a single spoken digit before a unit.
    if (/\d/.test(char)) {
      let end = index;
      while (end < section.length && /\d/.test(section[end] || "")) end += 1;
      const digits = section.slice(index, end);
      pendingDigit = Number(digits);
      if (/^0+$/.test(digits)) containsExplicitZero = true;
      index = end - 1;
      continue;
    }
    const digit = CHINESE_DIGITS[char];
    if (digit !== undefined) {
      pendingDigit = digit;
      if (digit === 0) containsExplicitZero = true;
      continue;
    }
    const unit = char === "十" ? 10 : char === "百" ? 100 : char === "千" ? 1_000 : 0;
    if (!unit) return undefined;
    hasSmallUnit = true;
    lastSmallUnit = unit;
    const multiplier = pendingDigit ?? (unit === 10 ? 1 : 0);
    total += multiplier * unit;
    pendingDigit = undefined;
  }

  if (pendingDigit !== undefined) {
    // The trailing-digit shorthand ("八千二", "一万九") only applies to a single spoken digit;
    // "2千50" is read literally as 2,050.
    const singleDigit = pendingDigit < 10;
    if (singleDigit && hasSmallUnit && !containsExplicitZero && lastSmallUnit > 1) {
      total += pendingDigit * (lastSmallUnit / 10);
    } else if (singleDigit && afterLargeUnit && !hasSmallUnit && !containsExplicitZero) {
      // In spoken prices, "一万九" conventionally means 19,000, not 10,009.
      total += pendingDigit * 1_000;
    } else {
      total += pendingDigit;
    }
  }
  return total;
}

function parseChinese(text: string): number | undefined {
  if (!text || !/^[零〇洞一幺二两三四五六七八九十百千万亿点\d.]+$/.test(text)) return undefined;
  const decimalParts = text.split(/[点.]/);
  if (decimalParts.length > 2) return undefined;
  const integerPart = decimalParts[0] || "零";
  const billionParts = integerPart.split("亿");
  if (billionParts.length > 2) return undefined;
  let total = 0;
  let remaining = integerPart;
  const billionIndex = remaining.indexOf("亿");
  if (billionIndex >= 0) {
    const head = remaining.slice(0, billionIndex);
    const headValue = parseChineseSection(head, false);
    if (headValue === undefined || !head) return undefined;
    total += headValue * 100_000_000;
    remaining = remaining.slice(billionIndex + 1);
  }
  const wanParts = remaining.split("万");
  if (wanParts.length > 2) return undefined;
  if (wanParts.length === 2) {
    const head = wanParts[0] || "";
    const tail = wanParts[1] || "";
    const headValue = parseChineseSection(head, false);
    const tailValue = parseChineseSection(tail, Boolean(head));
    if (headValue === undefined || tailValue === undefined || !head) return undefined;
    total += headValue * 10_000 + tailValue;
  } else {
    const sectionValue = parseChineseSection(remaining, false);
    if (sectionValue === undefined) return undefined;
    total += sectionValue;
  }
  if (decimalParts[1] !== undefined) {
    const fractional = decimalParts[1];
    if (!fractional || ![...fractional].every((char) => CHINESE_DIGITS[char] !== undefined || /\d/.test(char))) return undefined;
    const digits = [...fractional].map((char) => CHINESE_DIGITS[char] ?? Number(char)).join("");
    total += Number(`0.${digits}`);
  }
  return Number.isFinite(total) ? Math.round(total * 100) / 100 : undefined;
}

export function parseVoiceNumber(value: unknown): VoiceNumberResult {
  const text = cleanNumericText(value).replace(/(张|片|台|个|件|块|元|圆|人民币)$/g, "");
  if (!text) return {};
  if (/(十来|十几|十多|几十|几张|几件|若干)/.test(text)) return {ambiguous: true};
  const arabic = parseArabic(text);
  if (arabic !== undefined) return {value: arabic};
  const chinese = parseChinese(text);
  return chinese === undefined ? {} : {value: chinese};
}

export function parseVoiceAmount(value: unknown): number | undefined {
  return parseVoiceNumber(value).value;
}

export function parseVoiceQuantity(value: unknown): VoiceNumberResult {
  const text = String(value ?? "").trim();
  if (/(十来|十几|十多|几十|几张|几件|若干)/.test(text)) return {ambiguous: true};
  return parseVoiceNumber(text);
}
