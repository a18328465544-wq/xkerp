import {storeDate, storeDateDiffDays} from "./storeTime";

export interface WarrantySummary {
  saleDate?: string;
  soldDays?: number;
  status: "在保" | "过保" | "未记录保修期";
  remainingDays?: number;
  endDate?: string;
  sources: string[];
  periods: Array<{source: string; endDate: string; remainingDays: number; active: boolean}>;
}

const chineseDigits: Record<string, number> = {零: 0, 〇: 0, 一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9};

function parseChineseInteger(value: string): number | undefined {
  if (!value) return undefined;
  if (/^\d+$/.test(value)) return Number(value);
  let total = 0;
  let current = 0;
  for (const character of value) {
    if (character === "十") {
      total += (current || 1) * 10;
      current = 0;
    } else if (character === "百") {
      total += (current || 1) * 100;
      current = 0;
    } else if (character in chineseDigits) current = chineseDigits[character] || 0;
    else return undefined;
  }
  return total + current || undefined;
}

/** Only extract explicit store-warranty durations; generic promises like "保到手好" are not durations. */
export function parseStoreWarrantyDays(terms?: string): number | undefined {
  const normalized = terms?.replace(/\s+/g, "") || "";
  if (!normalized) return undefined;
  if (/店保半年/.test(normalized)) return 180;
  if (/店保一年/.test(normalized)) return 365;
  const match = normalized.match(/店保(\d{1,4}|[零〇一二两三四五六七八九十百]+)(天|个月|月|年)/u);
  if (!match) return undefined;
  const count = parseChineseInteger(match[1] || "");
  if (!count || count < 1 || count > 120) return undefined;
  const unit = match[2];
  return unit === "天" ? count : unit === "年" ? count * 365 : count * 30;
}

function addDays(date: string, days: number): string | undefined {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return undefined;
  const timestamp = Date.parse(`${date}T00:00:00.000Z`);
  if (!Number.isFinite(timestamp)) return undefined;
  return new Date(timestamp + days * 86_400_000).toISOString().slice(0, 10);
}

export function summarizeWarranty(input: {
  saleDate?: string;
  factoryWarrantyDate?: string;
  storeWarrantyDays?: number;
  aftersalesTerms?: string;
}, today = storeDate()): WarrantySummary {
  const saleDate = input.saleDate?.slice(0, 10);
  const soldDays = saleDate ? storeDateDiffDays(saleDate, today) : undefined;
  const storeDays = Number.isFinite(input.storeWarrantyDays) && (input.storeWarrantyDays || 0) > 0
    ? Math.min(3650, Math.floor(input.storeWarrantyDays || 0))
    : parseStoreWarrantyDays(input.aftersalesTerms);
  const expirations: Array<{date: string; source: string}> = [];
  const factoryEnd = input.factoryWarrantyDate?.slice(0, 10);
  if (factoryEnd && /^\d{4}-\d{2}-\d{2}$/.test(factoryEnd)) expirations.push({date: factoryEnd, source: "出厂保"});
  if (saleDate && storeDays) {
    const storeEnd = addDays(saleDate, storeDays);
    if (storeEnd) expirations.push({date: storeEnd, source: "店保"});
  }
  if (!expirations.length) return {saleDate, soldDays, status: "未记录保修期", sources: [], periods: []};
  const active = expirations.filter((entry) => entry.date >= today);
  const best = (active.length ? active : expirations).reduce((latest, item) => item.date > latest.date ? item : latest);
  return {
    saleDate,
    soldDays,
    status: active.length ? "在保" : "过保",
    remainingDays: active.length ? storeDateDiffDays(today, best.date) : 0,
    endDate: best.date,
    sources: active.map((entry) => entry.source),
    periods: expirations.map((entry) => ({source: entry.source, endDate: entry.date, remainingDays: entry.date >= today ? storeDateDiffDays(today, entry.date) : 0, active: entry.date >= today})),
  };
}
