import type {PermissionModel} from "../endpoints/auth";
import type {MarketQuoteCategoryDto, MarketQuoteCreateRequestDto, MarketQuoteSnapshotResponseDto, MarketQuoteUpdateRequestDto} from "../dto/quote.dto";
import type {MarketQuoteCategory, MarketQuoteFormValues, MarketQuoteImportResult, MarketQuoteItem, MarketQuoteSnapshot, QuoteHistoryPoint, QuoteTrend, QuoteProductOption, QuoteProfile} from "@/src/types/quote";
import {inventoryQuoteStatusValues} from "@/src/types/inventory";
import {coreQuoteProfile, gpuCoreIdentity, isCoreBaseQuote, normalizeQuoteVram, productCoreIdentity, quoteIsExpired} from "@/src/utils/quoteReference";
import {storeDate} from "@/src/utils/storeTime";

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? value as Record<string, unknown> : {};
}

function text(value: unknown, fallback = "") {
  return typeof value === "string" ? value : value === undefined || value === null ? fallback : String(value);
}

function optionalNumber(value: unknown) {
  if (value === undefined || value === null || value === "") return undefined;
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function trend(value: unknown, change?: number): QuoteTrend {
  if (value === "up" || value === "down" || value === "stable") return value;
  return (change || 0) > 0 ? "up" : (change || 0) < 0 ? "down" : "stable";
}

function history(value: unknown, permissions: Pick<PermissionModel, "showCost" | "showProfit">): QuoteHistoryPoint[] {
  if (!Array.isArray(value)) return [];
  return value.map((entry) => {
    const point = record(entry);
    return {
      date: text(point.date),
      buyPrice: permissions.showCost ? optionalNumber(point.buyPrice) : undefined,
      sellPrice: permissions.showProfit ? optionalNumber(point.sellPrice) : undefined,
      quoteKey: text(point.quoteKey) || undefined,
    };
  }).filter((point) => Boolean(point.date));
}

type InventoryAggregate = {count: number; totalCost: number; maximumCost: number};

function profile(value: unknown): QuoteProfile | undefined {
  const dto = record(value);
  if (dto.condition === "any" && dto.grade === "any" && dto.warranty === "any" && dto.packaging === "any" && dto.vram === "" && dto.currency === "CNY") return coreQuoteProfile();
  if ((dto.condition !== "new" && dto.condition !== "used") || !text(dto.grade).trim()
    || !["any", "in", "out"].includes(text(dto.warranty)) || !["any", "boxed", "unboxed"].includes(text(dto.packaging))
    || !text(dto.vram).trim() || dto.currency !== "CNY") return undefined;
  return {condition: dto.condition, grade: text(dto.grade).trim(), warranty: dto.warranty as QuoteProfile["warranty"], packaging: dto.packaging as QuoteProfile["packaging"], vram: normalizeQuoteVram(text(dto.vram)), currency: "CNY"};
}

function stockMatches(quote: MarketQuoteItem, item: Record<string, unknown>, products: QuoteProductOption[]) {
  const productId = text(item.productId);
  if (!isCoreBaseQuote(quote) || !quote.coreId) return false;
  const product = products.find((candidate) => candidate.id === productId);
  const coreId = text(item.coreId) || (product && productCoreIdentity(product)?.coreId);
  return coreId === quote.coreId;
}

export function adaptMarketQuote(value: unknown, permissions: Pick<PermissionModel, "showCost" | "showProfit">, stock?: InventoryAggregate): MarketQuoteItem {
  const dto = record(value);
  const changeAmount = optionalNumber(dto.changeAmount);
  const quoteScope = dto.quoteScope === "core" || dto.quoteScope === "product" ? dto.quoteScope : undefined;
  // Modern null prices are missing, never the numeric legacy compatibility fields.
  const buyPrice = quoteScope ? optionalNumber(dto.refBuyPrice) : optionalNumber(dto.refBuyPrice) ?? optionalNumber(dto.todayBuyPrice) ?? optionalNumber(dto.yestBuyPrice);
  const sellPrice = quoteScope ? optionalNumber(dto.refSellPrice) : optionalNumber(dto.refSellPrice) ?? optionalNumber(dto.todaySellPrice) ?? optionalNumber(dto.maxPrice);
  return {
    id: text(dto.id),
    productId: text(dto.productId) || undefined,
    productName: text(dto.productName, text(dto.model, "未命名型号")),
    model: text(dto.model, text(dto.productName, "未命名型号")),
    brand: text(dto.brand, "未标注"),
    categoryId: text(dto.categoryId) || undefined,
    version: text(dto.version) || undefined,
    quoteScope,
    coreId: text(dto.coreId) || undefined,
    coreModel: text(dto.coreModel) || undefined,
    profile: profile(dto.profile),
    source: text(dto.source) || undefined,
    validUntil: text(dto.validUntil) || undefined,
    expired: quoteIsExpired({validUntil: text(dto.validUntil) || undefined}, storeDate()),
    maintainedBy: text(dto.maintainedBy) || undefined,
    buyPrice: permissions.showCost ? buyPrice : undefined,
    sellPrice: permissions.showProfit ? sellPrice : undefined,
    previousBuyPrice: permissions.showCost && !quoteScope ? optionalNumber(dto.yestBuyPrice) : undefined,
    changeAmount: permissions.showCost && (!quoteScope || buyPrice !== undefined) ? changeAmount : undefined,
    changeRatio: permissions.showCost && (!quoteScope || buyPrice !== undefined) ? optionalNumber(dto.changeRatio) : undefined,
    trend: trend(dto.trend, changeAmount),
    note: text(dto.fluctuation, text(dto.remarks)) || undefined,
    updateTime: text(dto.updateTime, text(dto.date)) || undefined,
    history: history(dto.history, permissions),
    stockCount: stock?.count || 0,
    averageStockCost: permissions.showCost && stock?.count ? Math.round(stock.totalCost / stock.count) : undefined,
    maximumStockCost: permissions.showCost && stock?.count ? stock.maximumCost : undefined,
  };
}

export function adaptMarketQuoteSnapshot(response: MarketQuoteSnapshotResponseDto, permissions: Pick<PermissionModel, "showCost" | "showProfit">): MarketQuoteSnapshot {
  const payload = record(response.data);
  const products: QuoteProductOption[] = (Array.isArray(payload.products) ? payload.products : []).flatMap((raw) => {
    const product = record(raw);
    if (!text(product.id) || !text(product.name)) return [];
    return [{id: text(product.id), name: text(product.name), category: text(product.category), brand: text(product.brand), model: text(product.model), version: text(product.version) || undefined, vram: text(product.vram) || undefined, coreId: text(product.coreId) || undefined, coreModel: text(product.coreModel) || undefined}];
  });
  const active = new Set<string>(inventoryQuoteStatusValues);
  const seenInventory = new Set<string>();
  const inventory = (Array.isArray(payload.inventory) ? payload.inventory : []).map(record).filter((item) => {
    if (!active.has(text(item.status))) return false;
    const id = text(item.id);
    if (id && seenInventory.has(id)) return false;
    if (id) seenInventory.add(id);
    return true;
  });
  const linkedInventory = new Set<Record<string, unknown>>();
  const rawQuotes = Array.isArray(payload.marketQuotes) ? payload.marketQuotes : [];
  const quotes = rawQuotes.map((value) => {
    const quote = adaptMarketQuote(value, permissions);
    const stock: InventoryAggregate = {count: 0, totalCost: 0, maximumCost: 0};
    inventory.filter((item) => stockMatches(quote, item, products)).forEach((item) => {
      if (!quote.expired) linkedInventory.add(item);
      stock.count += 1;
      const cost = permissions.showCost ? optionalNumber(item.costPrice) || 0 : 0;
      stock.totalCost += cost;
      stock.maximumCost = Math.max(stock.maximumCost, cost);
    });
    return adaptMarketQuote(value, permissions, stock);
  }).filter((item) => Boolean(item.id));
  const stockCount = optionalNumber(payload.stockCount) ?? linkedInventory.size;
  return {quotes, products, stockCount, brands: Array.from(new Set(quotes.map((item) => item.brand).filter(Boolean))).sort((a, b) => a.localeCompare(b, "zh-CN"))};
}

export function adaptMarketQuoteCategories(value: unknown): MarketQuoteCategory[] {
  const data = record(value);
  const rows = Array.isArray(data.data) ? data.data : Array.isArray(value) ? value : [];
  return rows.flatMap((raw) => {
    const dto = record(raw) as unknown as MarketQuoteCategoryDto;
    if (typeof dto.id !== "string" || typeof dto.name !== "string") return [];
    return [{id: dto.id, name: dto.name, isActive: dto.isActive !== false, sortOrder: optionalNumber(dto.sortOrder) || 0}];
  });
}

export function toMarketQuoteCreateRequest(values: MarketQuoteFormValues, date: string): MarketQuoteCreateRequestDto {
  const binding = bindingRequest(values);
  return {model: binding.coreModel, brand: gpuCoreIdentity(binding.coreModel)!.vendor, ...binding, ...(values.categoryId.trim() ? {categoryId: values.categoryId.trim()} : {}), refBuyPrice: values.buyPrice, refSellPrice: values.sellPrice, trend: values.trend, ...(values.note.trim() ? {fluctuation: values.note.trim()} : {}), updateTime: date};
}

export function toMarketQuoteUpdateRequest(values: MarketQuoteFormValues): MarketQuoteUpdateRequestDto {
  return {todayBuyPrice: values.buyPrice, todaySellPrice: values.sellPrice, ...bindingRequest(values), validUntil: values.validUntil || "", categoryId: values.categoryId.trim() || null, remarks: values.note.trim()};
}

function bindingRequest(values: MarketQuoteFormValues) {
  if (values.quoteScope !== "core") throw new Error("仅支持核心基础价；旧报价请明确转换");
  const core = gpuCoreIdentity(values.coreModel || values.model);
  if (!core || values.coreId && values.coreId !== core.coreId) throw new Error("请输入带 RTX 等前缀的完整核心型号");
  return {quoteScope: "core" as const, coreId: core.coreId, coreModel: core.coreModel, productId: "" as const,
    profile: coreQuoteProfile(), ...(values.source?.trim() ? {source: values.source.trim()} : {}), ...(values.validUntil ? {validUntil: values.validUntil} : {})};
}

export function adaptMarketQuoteMutation(response: MarketQuoteSnapshotResponseDto, permissions: Pick<PermissionModel, "showCost" | "showProfit">) {
  const quote = adaptMarketQuote(response.data, permissions);
  if (!quote.id) throw new Error("暂时无法读取行情，请稍后重试");
  return quote;
}

export function adaptMarketQuoteImportResult(response: MarketQuoteSnapshotResponseDto): MarketQuoteImportResult {
  const data = record(response.data);
  return {created: optionalNumber(data.created) || 0, updated: optionalNumber(data.updated) || 0, skipped: optionalNumber(data.skipped) || 0};
}
