export const GPU_SN_BRANDS = [
  {id: "asus", name: "华硕 ASUS", officialUrl: "https://www.asus.com.cn/support/", rule: "partial", source: "ASUS Support: GPU serial number format", sourceUrl: "https://www.asus.com/us/support/article/706/"},
  {id: "msi", name: "微星 MSI", officialUrl: "https://www.msi.cn/support", rule: "sb-ym", source: "MSI Warranty: graphics card barcode example", sourceUrl: "https://de.msi.com/page/garantie"},
  {id: "gigabyte", name: "技嘉 GIGABYTE", officialUrl: "https://services.gigabyte.com/warranty/en/", rule: "sn-yw", source: "GIGABYTE Taiwan: serial number format", sourceUrl: "https://service.gigabyte.tw/Home/Content/74"},
  {id: "colorful", name: "七彩虹 Colorful", officialUrl: "https://www.colorful.com.cn/home/sn", rule: "pending", source: "官方 SN 查询入口（需验证码）", sourceUrl: "https://www.colorful.com.cn/home/sn"},
  {id: "galax", name: "影驰 GALAX", officialUrl: "https://www.szgalaxy.com/service/snSearch", rule: "pending", source: "官方 SN 查询入口", sourceUrl: "https://www.szgalaxy.com/service/snSearch"},
  {id: "zotac", name: "索泰 ZOTAC", officialUrl: "https://www.zotac.com/cn/support", rule: "pending", source: "官方支持入口", sourceUrl: "https://www.zotac.com/cn/support"},
  {id: "gainward", name: "耕升 Gainward", officialUrl: "https://www.szgainward.cn/service", rule: "pending", source: "官方服务入口", sourceUrl: "https://www.szgainward.cn/service"},
  {id: "maxsun", name: "铭瑄 MAXSUN", officialUrl: "https://www.maxsun.com.cn/xiaoshou/lianbao/", rule: "pending", source: "官方联保入口", sourceUrl: "https://www.maxsun.com.cn/xiaoshou/lianbao/"},
  {id: "sapphire", name: "蓝宝石 Sapphire", officialUrl: "https://www.sapphiretech.com/zh-cn/cs_consumer", rule: "pending", source: "官方客户服务入口", sourceUrl: "https://www.sapphiretech.com/zh-cn/cs_consumer"},
  {id: "powercolor", name: "撼讯 PowerColor", officialUrl: "https://www.powercolor.com/", rule: "pending", source: "官方产品支持入口", sourceUrl: "https://www.powercolor.com/"},
  {id: "xfx", name: "讯景 XFX", officialUrl: "https://www.xfx.com.cn/contactus/", rule: "pending", source: "官方联系入口", sourceUrl: "https://www.xfx.com.cn/contactus/"},
  {id: "nvidia", name: "NVIDIA 公版", officialUrl: "https://www.nvidia.cn/support/", rule: "pending", source: "官方支持入口；未发现可复核的公开日期编码", sourceUrl: "https://www.nvidia.cn/support/"},
] as const;

import type {GpuSnBrandId, GpuSnConfidence, GpuSnDateResult, GpuSnParseStatus, GpuSnSource} from "../src/types/gpuSn.ts";
export type {GpuSnBrandId, GpuSnConfidence, GpuSnDateResult, GpuSnParseStatus, GpuSnSource} from "../src/types/gpuSn.ts";

const COMMUNITY_5090 = "https://www.reddit.com/r/gigabyte/comments/1kzy67v/master_ice_5090_sn2515_thermal_paste_pics/";
const COMMUNITY_MSI_SD = "https://www.zhihu.com/tardis/bd/art/427166841";

function isoWeekDateRange(year: number, week: number) {
  if (week < 1 || week > 53) return null;
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const weekday = jan4.getUTCDay() || 7;
  const monday = new Date(jan4);
  monday.setUTCDate(jan4.getUTCDate() - weekday + 1 + (week - 1) * 7);
  const nextJan4 = new Date(Date.UTC(year + 1, 0, 4));
  const nextWeekday = nextJan4.getUTCDay() || 7;
  const nextMonday = new Date(nextJan4);
  nextMonday.setUTCDate(nextJan4.getUTCDate() - nextWeekday + 1);
  if (monday.getUTCFullYear() !== year || monday.getTime() >= nextMonday.getTime()) return null;
  const sunday = new Date(monday);
  sunday.setUTCDate(monday.getUTCDate() + 6);
  return {start: monday.toISOString().slice(0, 10), end: sunday.toISOString().slice(0, 10)};
}

function dateRange(year: number, month: number) {
  if (month < 1 || month > 12) return null;
  const end = new Date(Date.UTC(year, month, 0));
  return {start: `${year}-${String(month).padStart(2, "0")}-01`, end: end.toISOString().slice(0, 10)};
}

function resolveTwoDigitYear(value: number, now: Date) {
  const currentYear = now.getUTCFullYear();
  const currentShort = currentYear % 100;
  // The public GPU examples confirm modern years (2005+), but do not establish a century pivot.
  // Refuse values that could mean an old 19xx date or a future 20xx date instead of backdating.
  return value <= currentShort ? 2000 + value : null;
}

function resultBase(brandId: GpuSnBrandId, sn: string, productModel?: string) {
  const brand = GPU_SN_BRANDS.find((item) => item.id === brandId)!;
  return {
    status: "unsupported" as GpuSnParseStatus, brandId, brandName: brand.name, sn, productModel,
    year: null, month: null, week: null, dateRange: null, elapsedDays: null,
    confidence: "low" as GpuSnConfidence, confidenceScore: 0, ruleId: "pending",
    ruleSummary: "暂无经核实的公开 SN 日期编码规则。", explanation: "请使用品牌官方查询入口确认。",
    sources: [{title: brand.source, url: brand.sourceUrl, evidence: "official" as const}], officialUrl: brand.officialUrl, officialConfirmed: false as const,
  };
}

function withDateAge(result: GpuSnDateResult, range: {start: string; end: string}, now: Date) {
  const start = new Date(`${range.start}T00:00:00.000Z`);
  const end = new Date(`${range.end}T00:00:00.000Z`);
  if (start.getTime() > now.getTime()) return {...result, status: "invalid" as const, dateRange: null, elapsedDays: null, explanation: "编码推算出的日期在未来，已拒绝返回生产日期。"};
  return {...result, dateRange: range, elapsedDays: Math.max(0, Math.floor((now.getTime() - end.getTime()) / 86400000))};
}

/** Conservative decoder. Unknown/ambiguous brand formats never produce a guessed date. */
export function parseGpuSnDate(input: {brandId: string; sn: string; productModel?: string; now?: Date}): GpuSnDateResult {
  const brandId = input.brandId as GpuSnBrandId;
  const sn = input.sn.trim().toUpperCase().replace(/\s+/g, "");
  const now = input.now || new Date();
  if (!GPU_SN_BRANDS.some((item) => item.id === brandId)) throw new Error("不支持的显卡品牌");
  const result = resultBase(brandId, sn, input.productModel?.trim());
  if (!sn || sn.length < 6 || sn.length > 40 || !/^[A-Z0-9-]+$/.test(sn)) return {...result, status: "invalid", ruleId: "input-format", explanation: "SN 为空、长度异常或包含不支持的字符，请核对后重试。"};

  if (brandId === "gigabyte") {
    const match = /SN(\d{2})(\d{2})/.exec(sn);
    if (!match) return {...result, status: "invalid", ruleId: "gigabyte-sn-yyww", ruleSummary: "需在 SN 中找到 SN + 两位年份 + 两位生产周。", explanation: "未找到技嘉 SNYYWW 日期字段。"};
    const model = input.productModel?.replace(/\s+/g, "") || "";
    if (/4090D?/i.test(model)) return {...result, ruleId: "gigabyte-rtx40-pending", explanation: "技嘉 RTX 4090 / 4090D 未找到可复核的新产品线日期样本，不能把历史 SN 年周格式直接当作已验证规则。", sources: [{title: "GIGABYTE Taiwan: serial number format", url: "https://service.gigabyte.tw/Home/Content/74", evidence: "official"}]};
    if (/5090/i.test(model) && `${match[1]}${match[2]}` !== "2515") return {...result, ruleId: "gigabyte-rtx5090-pending", explanation: "目前可复核的技嘉 RTX 5090 社区样本只展示 SN2515；其他批次尚未验证，未推算日期。", sources: [{title: "GIGABYTE RTX 5090 community serial example (SN2515)", url: COMMUNITY_5090, evidence: "community"}]};
    const year = resolveTwoDigitYear(Number(match[1]), now);
    if (year === null) return {...result, ruleId: "gigabyte-year-century-ambiguous", explanation: "两位年份可能表示历史 19xx 或未来 20xx；公开样例不足以确定世纪，未返回日期。", sources: [{title: "GIGABYTE Taiwan: serial number format", url: "https://service.gigabyte.tw/Home/Content/74", evidence: "official"}]};
    const week = Number(match[2]);
    const range = isoWeekDateRange(year, week);
    if (!range) return {...result, status: "invalid", ruleId: "gigabyte-sn-yyww", year, week, ruleSummary: "SN 后四位为两位年份与 ISO 周数。", explanation: "生产周数超出该年份的有效范围。", confidence: "medium", confidenceScore: 0.68, sources: [{title: "GIGABYTE Taiwan: serial number format", url: "https://service.gigabyte.tw/Home/Content/74", evidence: "official"}]};
    if (new Date(`${range.start}T00:00:00.000Z`).getTime() > now.getTime()) return {...result, status: "invalid", ruleId: "gigabyte-future-week", year, week, explanation: "编码推算出的生产周在未来，已拒绝返回生产日期。"};
    const currentModel = /5090/i.test(model);
    if (year >= 2022 && !currentModel) return {...result, ruleId: "gigabyte-current-product-line-pending", explanation: "技嘉公开年周样例来自旧批次；2022 年以来的产品线需要型号与批次样本验证，当前仅有 RTX 5090 SN2515 的低可信社区样例。", sources: [{title: "GIGABYTE Taiwan: serial number format", url: "https://service.gigabyte.tw/Home/Content/74", evidence: "official"}, {title: "GIGABYTE RTX 5090 community serial example (SN2515)", url: COMMUNITY_5090, evidence: "community"}]};
    const sources: GpuSnSource[] = [{title: "GIGABYTE Taiwan: serial number format", url: "https://service.gigabyte.tw/Home/Content/74", evidence: "official"}];
    if (currentModel && year >= 2025) sources.push({title: "GIGABYTE RTX 5090 community serial example (SN2515)", url: COMMUNITY_5090, evidence: "community"});
    const parsed: GpuSnDateResult = {...result, status: "parsed", year, month: null, week, confidence: currentModel ? "low" : "medium", confidenceScore: currentModel ? 0.48 : 0.68, ruleId: "gigabyte-sn-yyww", ruleSummary: "SN 后四位解析为年份（20xx/19xx）和 ISO 生产周；周范围按周一至周日计算。", explanation: currentModel ? "SN2515 与技嘉 RTX 5090 的社区样本匹配，并使用技嘉官方历史年周算法推算；该规则证据有限，结果尚非官方单卡确认。" : "年周格式有技嘉官方历史样例；该结果是编码推算，尚非官方单卡确认。", sources};
    return withDateAge(parsed, range, now);
  }

  if (brandId === "msi") {
    const match = /(SB|SD)(\d{2})(\d{2})/.exec(sn);
    if (!match) return {...result, status: "invalid", ruleId: "msi-marker-yymm", ruleSummary: "需包含 SB/SD + 两位年份 + 两位月份。", explanation: "未找到微星已知的日期字段。"};
    const [, marker, yearDigits, monthDigits] = match;
    if (/(4090D?|5090)/i.test(input.productModel || "")) return {...result, ruleId: "msi-current-gpu-pending", explanation: "未找到微星 RTX 4090 / 4090D / 5090 产品线可复核的公开日期字段样本；历史 SB 格式和社区 SD 格式不能直接套用到该批次。", sources: [{title: "MSI Support", url: "https://www.msi.cn/support", evidence: "official"}]};
    const year = resolveTwoDigitYear(Number(yearDigits), now);
    if (year === null) return {...result, ruleId: `msi-${marker!.toLowerCase()}-year-century-ambiguous`, explanation: "两位年份可能表示历史 19xx 或未来 20xx；公开样例不足以确定世纪，未返回日期。", sources: [{title: marker === "SB" ? "MSI Warranty: graphics card barcode example" : "微星 SN 民间规则整理", url: marker === "SB" ? "https://de.msi.com/page/garantie" : COMMUNITY_MSI_SD, evidence: marker === "SB" ? "official" : "community"}]};
    const month = Number(monthDigits);
    const range = dateRange(year, month);
    if (!range) return {...result, status: "invalid", ruleId: `msi-${marker!.toLowerCase()}-yymm`, year, month, ruleSummary: "标记后四位解析为年份和月份。", explanation: "编码中的月份不存在。", confidence: marker === "SB" ? "high" : "low", confidenceScore: marker === "SB" ? 0.84 : 0.55, sources: [{title: marker === "SB" ? "MSI Warranty: graphics card barcode example" : "微星 SN 民间规则整理", url: marker === "SB" ? "https://de.msi.com/page/garantie" : COMMUNITY_MSI_SD, evidence: marker === "SB" ? "official" : "community"}]};
    if (new Date(`${range.start}T00:00:00.000Z`).getTime() > now.getTime()) return {...result, status: "invalid", ruleId: `msi-${marker!.toLowerCase()}-future-month`, year, month, explanation: "编码推算出的生产月份在未来，已拒绝返回生产日期。"};
    if (year >= 2022) return {...result, ruleId: `msi-${marker!.toLowerCase()}-current-product-line-pending`, explanation: "公开 SB/SD 日期样例来自旧批次；2022 年以来的显卡产品线缺少可复核样本，未套用历史规则。", sources: [{title: marker === "SB" ? "MSI Warranty: graphics card barcode example" : "微星 SN 民间规则整理", url: marker === "SB" ? "https://de.msi.com/page/garantie" : COMMUNITY_MSI_SD, evidence: marker === "SB" ? "official" : "community"}]};
    const evidence: GpuSnSource[] = marker === "SB"
      ? [{title: "MSI Warranty: graphics card barcode example", url: "https://de.msi.com/page/garantie", evidence: "official"}]
      : [{title: "微星 SN 民间规则整理（SD 前缀）", url: COMMUNITY_MSI_SD, evidence: "community"}];
    const parsed: GpuSnDateResult = {...result, status: "parsed", year, month, week: null, confidence: marker === "SB" ? "high" : "low", confidenceScore: marker === "SB" ? 0.84 : 0.55, ruleId: `msi-${marker!.toLowerCase()}-yymm`, ruleSummary: `${marker} 后四位解析为两位年份和月份。`, explanation: marker === "SB" ? "微星官方显卡条码样例支持 SB 后 YYMM 为生产年月；具体 SN 仍需官方售后确认。" : "SD 前缀仅有社区资料支持，结果可信度低，需官方售后确认。", sources: evidence};
    return withDateAge(parsed, range, now);
  }

  if (brandId === "asus") {
    if (!/^[A-Z0-9]{10,15}$/.test(sn)) return {...result, status: "invalid", ruleId: "asus-serial-shape", explanation: "华硕显卡 SN 通常为 10–15 位字母数字，请核对输入。"};
    const monthCode = sn[1]!;
    const month = /^[1-9]$/.test(monthCode) ? Number(monthCode) : ({A: 10, B: 11, C: 12} as Record<string, number>)[monthCode];
    if (!month) return {...result, status: "invalid", ruleId: "asus-year-month-digit", ruleSummary: "首位为年份末位数字，次位 1–9/A–C 为月份。", explanation: "SN 第二位不是有效月份编码。", sources: [{title: "ASUS Support: GPU serial number format", url: "https://www.asus.com/us/support/article/706/", evidence: "official"}]};
    const yearDigit = Number(sn[0]);
    const candidateYears = Array.from({length: 3}, (_, offset) => Math.floor((now.getUTCFullYear() - offset * 10) / 10) * 10 + yearDigit).filter((year) => year <= now.getUTCFullYear() && year >= 2000);
    return {...result, status: "partial", year: null, month, ruleId: "asus-year-month-digit", ruleSummary: "首位仅确定年份末位数字，次位 1–9/A–C 对应月份。", explanation: `年份十年位无法从公开格式唯一确定；候选年份：${candidateYears.join("、") || "未知"}。为避免猜测，不返回生产日期范围。`, confidence: "high", confidenceScore: 0.9, sources: [{title: "ASUS Support: GPU serial number format", url: "https://www.asus.com/us/support/article/706/", evidence: "official"}]};
  }
  return result;
}

export function listGpuSnRules() {
  return GPU_SN_BRANDS.map((brand) => ({
    ...brand,
    description: brand.rule === "pending" ? "编码规则待验证；仅提供官方查询入口。" : brand.id === "asus" ? "可解析月份，但年份只有末位，结果为部分信息。" : brand.id === "msi" ? "SB+YYMM 旧批次有官方样例；SD+YYMM 为低可信社区规则；2022 年以来的批次待验证。" : "SN+YYWW 有官方历史样例；2022 年以来的批次待验证，RTX 5090 仅 SN2515 有低可信社区样本。",
  }));
}

export function gpuSnBrandIdFromName(value: string): GpuSnBrandId | null {
  const name = value.toLowerCase().replace(/[\s_-]/g, "");
  const aliases: Record<string, GpuSnBrandId> = {
    "华硕": "asus", "asus": "asus", "msi": "msi", "微星": "msi",
    "技嘉": "gigabyte", "gigabyte": "gigabyte", "七彩虹": "colorful", "colorful": "colorful",
    "影驰": "galax", "galax": "galax", "索泰": "zotac", "zotac": "zotac",
    "耕升": "gainward", "gainward": "gainward", "铭瑄": "maxsun", "maxsun": "maxsun",
    "蓝宝石": "sapphire", "sapphire": "sapphire", "撼讯": "powercolor", "powercolor": "powercolor",
    "讯景": "xfx", "xfx": "xfx", "nvidia": "nvidia", "英伟达": "nvidia", "公版": "nvidia",
  };
  return aliases[name] || Object.entries(aliases).find(([alias]) => alias.length > 1 && name.includes(alias))?.[1] || null;
}
