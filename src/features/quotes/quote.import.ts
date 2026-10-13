import type {MarketQuoteImportRow} from "@/src/types/quote";
import {coreQuoteProfile, gpuCoreIdentity} from "@/src/utils/quoteReference";
import {isDateKey} from "@/src/lib/dateRangePickerUtils";
import {marketQuoteSchema} from "./quote.schema";

export const MAX_QUOTE_PASTE_ROWS = 2000;
export const MAX_QUOTE_PASTE_LENGTH = 300_000;
export const CORE_QUOTE_PASTE_HEADER = "核心型号,回收价,销售价,有效期至,说明";

export interface QuotePasteResult {
  rows: MarketQuoteImportRow[];
  errors: string[];
}

const amount = (value: string) => {
  const normalized = value.trim().replace(/[¥￥,\s]/g, "");
  if (!normalized) return null;
  const parsed = Number(normalized);
  if (!Number.isFinite(parsed) || parsed < 0) throw new Error("价格无效，未报价请留空。");
  return parsed;
};

const splitCsvLine = (line: string) => {
  const cells: string[] = [];
  let value = "";
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (char === '"') {
      if (quoted && line[index + 1] === '"') {value += '"'; index += 1;} else quoted = !quoted;
    } else if (char === "," && !quoted) {cells.push(value.trim()); value = "";} else value += char;
  }
  if (quoted) throw new Error("引号未闭合。");
  cells.push(value.trim());
  return cells;
};

type PasteFormat = "auto" | "core" | "coreWithSource" | "scoped" | "old14" | "legacy";
const coreScopes = ["核心基础价", "核心行情", "core"];

function parseRow(cells: string[], format: PasteFormat, sourceLine: number): MarketQuoteImportRow {
  const first = cells[0] || "";
  if (["商品专属", "product"].includes(first)) throw new Error("商品专属报价已停用，请重新填写核心基础价格式。");
  let model = first;
  let source = "";
  let validUntil = "";
  let buyCell = "";
  let sellCell = "";
  let note = "";
  if (coreScopes.includes(first)) {
    const old14 = format === "old14" || cells.length > 7;
    if (old14 && cells[2]) throw new Error("核心基础价不能填写商品关联。");
    model = cells[1] || "";
    source = cells[old14 ? 8 : 2] || "";
    validUntil = cells[old14 ? 9 : 3] || "";
    buyCell = cells[old14 ? 10 : 4] || "";
    sellCell = cells[old14 ? 11 : 5] || "";
    note = cells.slice(old14 ? 13 : 6).join("，");
  } else if (format === "scoped" || format === "old14") {
    throw new Error("仅支持核心基础价，历史商品报价不能直接导入。");
  } else if (format === "core") {
    buyCell = cells[1] || "";
    sellCell = cells[2] || "";
    validUntil = cells[3] || "";
    note = cells.slice(4).join("，");
  } else if (format === "coreWithSource" || format === "auto" && cells.length >= 6 && (!cells[2] || isDateKey(cells[2])) && (!cells[1] || !/^[¥￥\d.,\s]+$/.test(cells[1]))) {
    source = cells[1] || "";
    validUntil = cells[2] || "";
    buyCell = cells[3] || "";
    sellCell = cells[4] || "";
    note = cells.slice(5).join("，");
  } else {
    // Legacy text is never persisted unbound; only a complete GPU identity may be converted.
    const concise = !cells[1] || /^[¥￥\d.,\s]+$/.test(cells[1]);
    buyCell = cells[concise ? 1 : 2] || "";
    sellCell = cells[concise ? 2 : 3] || "";
    if (concise && format === "auto" && /^\d{4}-\d{2}-\d{2}$/.test(cells[3] || "")) validUntil = cells[3] || "";
    note = cells.slice(concise ? 4 : 5).join("，");
  }
  const core = gpuCoreIdentity(model);
  if (!core) throw new Error("型号待确认：请输入带 RTX 等前缀的完整核心型号，不能省略前缀。");
  const parsed = marketQuoteSchema.safeParse({quoteScope: "core", ...core, model: core.coreModel, brand: core.vendor, productId: "", profile: coreQuoteProfile(), categoryId: "", source, validUntil, buyPrice: amount(buyCell), sellPrice: amount(sellCell), trend: "stable", note});
  if (!parsed.success) throw new Error(parsed.error.issues.map((issue) => issue.message).join("；"));
  return {...parsed.data, sourceLine};
}

export function parseMarketQuotePaste(input: string): QuotePasteResult {
  if (input.length > MAX_QUOTE_PASTE_LENGTH) return {rows: [], errors: ["粘贴内容超过 " + MAX_QUOTE_PASTE_LENGTH.toLocaleString() + " 字符限制。"]};
  const lines = input.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (lines.length > MAX_QUOTE_PASTE_ROWS) return {rows: [], errors: ["单次最多粘贴 " + MAX_QUOTE_PASTE_ROWS + " 行。"]};
  const rows: MarketQuoteImportRow[] = [];
  const errors: string[] = [];
  let format: PasteFormat = "auto";
  lines.forEach((line, index) => {
    try {
      const cells = line.includes("\t") ? line.split("\t").map((cell) => cell.trim()) : splitCsvLine(line);
      const first = (cells[0] || "").replace(/\s+/g, "");
      if (first === "核心型号") {format = cells[1]?.replace(/\s+/g, "") === "来源" ? "coreWithSource" : "core"; return;}
      if (first === "报价范围") {format = cells[2] === "来源" ? "scoped" : "old14"; return;}
      if (["商品型号", "型号", "商品名称", "产品型号"].includes(first)) {format = "legacy"; return;}
      rows.push(parseRow(cells, format, index + 1));
    } catch (error) {errors.push("第 " + (index + 1) + " 行：" + (error instanceof Error ? error.message : "核心报价无效。"));}
  });
  return {rows, errors};
}

export function quoteCsv(rows: Array<Array<string | number>>) {
  const escape = (value: string | number) => {const text = String(value); return /[",\n]/.test(text) ? '"' + text.replace(/"/g, '""') + '"' : text;};
  return "\uFEFF" + rows.map((row) => row.map(escape).join(",")).join("\n");
}
