import type {CardInventory, MarketQuote, ProductTemplate} from "../src/types.ts";
import type {QuoteBinding} from "../src/types/quote.ts";
import {gpuCoreIdentity, quoteIdentityKey, quoteProfileKey, coreQuoteProfile, isCoreBaseQuote} from "../src/utils/quoteReference.ts";
import {ConflictError, NotFoundError, ValidationError} from "./errors.ts";
import {storeDate as formatStoreDate} from "../src/utils/storeTime.ts";

export type MarketQuoteState = {products: ProductTemplate[]; inventory: CardInventory[]; marketQuotes: MarketQuote[]; logs?: unknown[]};
export type MarketQuoteInput = Partial<MarketQuote> & {model: string};
export type MarketQuoteMetadata = Partial<QuoteBinding> & {productId?: string};
export type MarketQuoteDependencies = {
  state: MarketQuoteState;
  nowStamp: () => string;
  storeDate: () => string;
  genId: (prefix: string) => string;
  systemActor: () => string;
  isStockExcludedStatus: (status: CardInventory["status"]) => boolean;
  addLog: (user: string, module: string, type: string, target: string, beforeVal?: string, afterVal?: string) => unknown;
};

function validatePrices(buy: number | null, sell: number | null, modern: boolean) {
  if (buy === null && sell === null) throw new ValidationError("至少填写一个参考价格");
  for (const price of [buy, sell]) {
    if (price === null && modern) continue;
    if (typeof price !== "number" || !Number.isFinite(price) || price < 0 || price > 1_000_000_000) throw new ValidationError("参考价格无效");
  }
}
function currentBuy(quote: MarketQuote) {
  return quote.quoteScope ? quote.refBuyPrice ?? null : quote.refBuyPrice ?? quote.todayBuyPrice ?? quote.yestBuyPrice ?? 0;
}
function currentSell(quote: MarketQuote) {
  return quote.quoteScope ? quote.refSellPrice ?? null : quote.refSellPrice ?? quote.todaySellPrice ?? quote.maxPrice ?? 0;
}
/** Missing modern prices omit legacy numeric mirrors; they are never fabricated as zero. */
function priceFields(buy: number | null, sell: number | null, previousBuy: number | null) {
  const delta = buy !== null && previousBuy !== null ? buy - previousBuy : 0;
  return {
    refBuyPrice: buy, refSellPrice: sell, todayBuyPrice: buy ?? undefined, todaySellPrice: sell ?? undefined,
    yestBuyPrice: previousBuy ?? undefined, changeAmount: delta,
    changeRatio: previousBuy !== null && previousBuy > 0 && buy !== null ? Number((delta / previousBuy * 100).toFixed(2)) : undefined,
    trend: delta > 0 ? "up" as const : delta < 0 ? "down" as const : "stable" as const,
  };
}

/** Commands execute under the existing tenant-wide mutation lock; no parallel state collection. */
export function createMarketQuoteHelpers(dependencies: MarketQuoteDependencies) {
  const {state, nowStamp, storeDate, genId, systemActor, isStockExcludedStatus, addLog} = dependencies;
  const editableMetadata = (input: MarketQuoteMetadata) => {
    const fields: Pick<MarketQuoteMetadata, "source" | "validUntil"> = {};
    if (Object.hasOwn(input, "source")) {
      if (input.source !== undefined && (typeof input.source !== "string" || input.source.length > 300)) throw new ValidationError("来源格式无效");
      fields.source = input.source?.trim() || undefined;
    }
    if (Object.hasOwn(input, "validUntil")) {
      const date = input.validUntil;
      if (date !== undefined && date !== "" && (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(date)) || formatStoreDate(new Date(`${date}T00:00:00Z`)) !== date)) throw new ValidationError("有效截止日期无效");
      fields.validUntil = date || undefined;
    }
    return fields;
  };
  const binding = (input: MarketQuoteMetadata): MarketQuoteMetadata => {
    if (!input.quoteScope) {
      if ([input.coreId, input.coreModel, input.profile, input.source, input.validUntil].some(value => value !== undefined)) throw new ValidationError("旧报价转换必须明确报价范围和完整关联");
      return input.productId !== undefined ? {productId: input.productId} : {};
    }
    if (input.quoteScope !== "core") throw new ValidationError("商品专属报价已停用，仅支持核心基础价");
    const core = typeof input.coreModel === "string" ? gpuCoreIdentity(input.coreModel) : null;
    if (!core || input.coreId !== undefined && input.coreId !== core.coreId) throw new ValidationError("核心型号无效或核心 ID 不匹配");
    if (input.productId) throw new ValidationError("核心报价不能关联商品");
    return {quoteScope: "core", coreId: core.coreId, coreModel: core.coreModel, profile: coreQuoteProfile(), ...editableMetadata(input), productId: ""};
  };
  const assertUnique = (input: MarketQuoteMetadata, excludedId?: string) => {
    const key = quoteIdentityKey(input);
    if (key && state.marketQuotes.some(quote => quote.id !== excludedId && quoteIdentityKey(quote) === key)) throw new ConflictError(input.quoteScope === "core" ? "同一核心报价已存在（含旧条件记录），请明确确认并处理冲突，不可自动覆盖" : "相同商品与条件的报价已存在");
  };

  const updateMarketPrice = (quoteId: string, todayBuyPrice: number | null, todaySellPrice: number | null, remarks?: string, categoryId?: string | null, metadata: MarketQuoteMetadata = {}) => {
    const quote = state.marketQuotes.find(item => item.id === quoteId);
    if (!quote) return null;
    let nextBinding: MarketQuoteMetadata = {};
    if (metadata.quoteScope === "product") throw new ValidationError("商品专属报价已停用，仅支持核心基础价");
    const convertingProduct = quote.quoteScope === "product";
    const converting = !quote.quoteScope && metadata.quoteScope !== undefined;
    const normalizingCore = quote.quoteScope === "core" && !isCoreBaseQuote(quote);
    if (!isCoreBaseQuote(quote) && !isCoreBaseQuote(metadata)) throw new ValidationError("请明确确认转换为核心基础价");
    if (quote.productId && !isCoreBaseQuote(quote) && metadata.productId !== "") throw new ValidationError("转换核心基础价必须明确清空商品关联");
    const resettingComparison = converting || normalizingCore || convertingProduct;
    if (convertingProduct) {
      if (metadata.productId !== "") throw new ValidationError("转换核心基础价必须明确清空商品关联");
      nextBinding = binding({...quote, ...metadata, coreId: metadata.coreId, coreModel: metadata.coreModel ?? quote.coreModel});
    } else if (quote.quoteScope) {
      for (const key of ["quoteScope", "coreId", "coreModel", "productId"] as const) {
        if (metadata[key] !== undefined && metadata[key] !== quote[key]) {
          if (key === "coreModel" && gpuCoreIdentity(metadata.coreModel || "")?.coreId === quote.coreId) continue;
          throw new ValidationError("核心报价关联信息不可修改，请新建不同核心报价");
        }
      }
      nextBinding = editableMetadata(metadata);
      if (quote.quoteScope === "core") {
        if (!quote.coreId || !quote.coreModel) throw new ValidationError("请明确确认核心型号及关联后再更新旧核心报价");
        const core = gpuCoreIdentity(quote.coreModel);
        if (!core || core.coreId !== quote.coreId) throw new ValidationError("核心型号无效或核心 ID 不匹配");
        nextBinding = {...nextBinding, coreModel: core.coreModel, profile: coreQuoteProfile(), productId: ""};
      }
    } else {
      nextBinding = binding(metadata);
      if (!converting && metadata.productId !== undefined && metadata.productId !== quote.productId) throw new ValidationError("旧报价重新关联必须明确完整条件");
    }
    validatePrices(todayBuyPrice, todaySellPrice, Boolean(quote.quoteScope || converting));
    assertUnique({...quote, ...nextBinding}, quote.id);
    const previousBuyPrice = resettingComparison ? null : currentBuy(quote);
    const previousSellPrice = currentSell(quote);
    const categoryChanged = categoryId !== undefined && (categoryId || undefined) !== (quote.categoryId || undefined);
    const metadataChanged = Object.keys(nextBinding).some(key => key === "profile" ? !quote.profile || quoteProfileKey(nextBinding.profile!) !== quoteProfileKey(quote.profile) : nextBinding[key as keyof MarketQuoteMetadata] !== quote[key as keyof MarketQuoteMetadata]);
    const categoryOnly = !resettingComparison && !metadataChanged && categoryChanged && todayBuyPrice === previousBuyPrice && todaySellPrice === previousSellPrice;
    const time = categoryOnly ? undefined : nowStamp();
    const quoteKey = quoteIdentityKey({...quote, ...nextBinding});
    const coreModel = nextBinding.coreModel || quote.coreModel;
    const updated = {
      ...quote, ...nextBinding,
      ...(coreModel && (quote.quoteScope || converting) ? {model: coreModel, productName: coreModel, version: ""} : {}),
      ...(quote.quoteScope || converting ? {maintainedBy: systemActor()} : {}),
      ...(categoryOnly ? {} : {
        ...priceFields(todayBuyPrice, todaySellPrice, previousBuyPrice),
        maxPrice: todaySellPrice === null ? undefined : resettingComparison ? todaySellPrice : Math.max(quote.maxPrice ?? todaySellPrice, todaySellPrice),
        minPrice: todayBuyPrice === null ? undefined : resettingComparison ? todayBuyPrice : Math.min(quote.minPrice ?? todayBuyPrice, todayBuyPrice),
        updateTime: time,
        history: [...(quote.history || []).map(point => {
          if (!resettingComparison || point.quoteKey !== quoteKey) return point;
          return {...point, quoteKey: `${convertingProduct ? "historical-product" : normalizingCore ? "conditioned-core" : "historical-unconfirmed"}|${quote.coreId || nextBinding.coreId}|${quote.profile ? quoteProfileKey(quote.profile) : "unconfirmed"}`};
        }), {date: time!, buyPrice: todayBuyPrice, sellPrice: todaySellPrice, ...(quoteKey ? {quoteKey} : {})}],
      }),
      fluctuation: remarks ?? quote.fluctuation ?? quote.remarks, remarks: remarks ?? quote.remarks,
      ...(categoryId !== undefined ? {categoryId: categoryId || undefined} : {}),
    } as MarketQuote;
    state.marketQuotes = state.marketQuotes.map(item => item.id === quoteId ? updated : item);
    addLog(systemActor(), "价格参考", categoryOnly ? "更新行情分类" : "更新当日参考价", updated.productName,
      categoryOnly ? undefined : `最新回收: ${todayBuyPrice ?? "未报价"}`, categoryOnly ? updated.categoryId || "未分类" : `最新销售: ${todaySellPrice ?? "未报价"}`);
    return updated;
  };

  // Explicit stock-pricing action remains independent; no modern benchmark is overwritten.
  const syncEstimatedSellPrice = (input: {productId: string; estSellPrice: number; priceSource?: string; remarks?: string}) => {
    const productId = input.productId?.trim();
    if (!productId) throw new ValidationError("缺少商品 ID productId");
    const estSellPrice = Number(input.estSellPrice);
    if (!Number.isFinite(estSellPrice) || estSellPrice < 0) throw new ValidationError("预估出货价必须是大于等于 0 的数字");
    const product = state.products.find(item => item.id === productId);
    if (!product) throw new NotFoundError(`商品模板不存在: ${productId}`);
    const priceSource = input.priceSource?.trim() || "外部价格API";
    const priceUpdatedAt = nowStamp();
    state.products = state.products.map(item => item.id === productId ? {...item, refSellPrice: estSellPrice, priceSource, priceUpdatedAt} : item);
    let updatedInventoryCount = 0;
    state.inventory = state.inventory.map(card => {
      if (card.productId !== productId || isStockExcludedStatus(card.status)) return card;
      updatedInventoryCount += 1;
      return {...card, estSellPrice, priceSource, priceUpdatedAt};
    });
    let updatedQuoteCount = 0;
    state.marketQuotes = state.marketQuotes.map(quote => {
      if (quote.productId !== productId || quote.quoteScope) return quote;
      updatedQuoteCount += 1;
      return {...quote, todaySellPrice: estSellPrice, refSellPrice: estSellPrice, maxPrice: Math.max(quote.maxPrice || 0, estSellPrice), remarks: input.remarks?.trim() || quote.remarks, updateTime: priceUpdatedAt};
    });
    addLog(systemActor(), "价格参考", "同步预估出货价", product.name, `${estSellPrice}元`, `来源: ${priceSource}，同步未售出库存 ${updatedInventoryCount} 条`);
    return {productId, productName: product.name, estSellPrice, priceSource, priceUpdatedAt, updatedInventoryCount, updatedQuoteCount};
  };

  const normalizeInput = (quote: MarketQuoteInput) => {
    if (!quote.model?.trim()) throw new ValidationError("型号不能为空");
    const normalizedBinding = binding({...quote, quoteScope: quote.quoteScope ?? "core", coreModel: quote.coreModel ?? quote.model});
    const buy = quote.refBuyPrice !== undefined ? quote.refBuyPrice : quote.todayBuyPrice ?? null;
    const sell = quote.refSellPrice !== undefined ? quote.refSellPrice : quote.todaySellPrice ?? null;
    validatePrices(buy, sell, true);
    return {...quote, ...normalizedBinding, model: normalizedBinding.coreModel!, productName: normalizedBinding.coreModel!, refBuyPrice: buy, refSellPrice: sell};
  };
  const createMarketQuote = (input: MarketQuoteInput) => {
    const quote = normalizeInput(input);
    assertUnique(quote);
    const time = nowStamp();
    const quoteKey = quoteIdentityKey(quote);
    const newQuote = {
      ...quote, id: genId("MQ"), date: storeDate(),
      productId: "", productName: quote.model,
      model: quote.model, brand: quote.brand ?? "", version: "",
      ...priceFields(quote.refBuyPrice, quote.refSellPrice, null),
      maintainedBy: systemActor(),
      maxPrice: quote.refSellPrice ?? undefined, minPrice: quote.refBuyPrice ?? undefined,
      updateTime: time,
      history: [{date: time, buyPrice: quote.refBuyPrice, sellPrice: quote.refSellPrice, quoteKey: quoteKey!}],
    } as MarketQuote;
    state.marketQuotes = [newQuote, ...state.marketQuotes];
    addLog(systemActor(), "价格参考", "创建行情参考", quote.model, undefined, `新建议进价: ${quote.refBuyPrice ?? "未报价"}元`);
    return newQuote;
  };

  const importMarketQuotes = (quotes: MarketQuoteInput[]) => {
    const latest = new Map<string, ReturnType<typeof normalizeInput>>();
    let skipped = 0;
    // Every input is a core command; no new legacy rows or partial invalid imports.
    for (const input of quotes) {
      const quote = normalizeInput(input);
      const key = quoteIdentityKey(quote)!;
      if (latest.has(key)) {
        const previous = latest.get(key)!;
        if (quote.quoteScope === "core") {
          if (["refBuyPrice", "refSellPrice", "source", "validUntil"].some(field => previous[field as keyof typeof previous] !== quote[field as keyof typeof quote])) throw new ConflictError("同一核心包含不同价格、来源或有效期，请明确选择一套核心基础价后再导入");
          skipped += 1;
          continue;
        }
        skipped += 1;
      }
      latest.set(key, quote);
    }
    const planned = [...latest.entries()].map(([key, quote]) => {
      const matches = state.marketQuotes.filter(item => item.quoteScope === "core" && quoteIdentityKey(item) === key);
      if (quote.quoteScope && matches.length > 1) throw new ConflictError(quote.quoteScope === "core" ? "同一核心存在多条旧报价，请明确确认并解决冲突，不可自动覆盖" : "相同条件存在多条报价，请先解决重复记录");
      if (matches[0] && !isCoreBaseQuote(matches[0])) throw new ValidationError("历史核心报价待确认，请先单独确认转换后再导入，不能批量自动转换");
      return {quote, existing: matches[0]};
    });
    const previous = {quotes: state.marketQuotes, logs: state.logs, hadLogs: Object.hasOwn(state, "logs")};
    const importedQuotes: MarketQuote[] = [];
    let created = 0;
    let updated = 0;
    try {
      for (const {quote, existing} of planned) {
        if (!existing) {importedQuotes.push(createMarketQuote(quote)); created += 1; continue;}
        const result = updateMarketPrice(existing.id, quote.refBuyPrice, quote.refSellPrice, quote.fluctuation || quote.remarks, quote.categoryId, quote)!;
        state.marketQuotes = state.marketQuotes.map(item => item.id === result.id ? result : item);
        importedQuotes.push(result);
        updated += 1;
      }
      if (importedQuotes.length) addLog(systemActor(), "价格参考", "批量导入行情参考", `${importedQuotes.length} 条行情`, undefined, `新增 ${created} 条，更新 ${updated} 条，跳过 ${skipped} 条`);
      return {created, updated, skipped, quotes: importedQuotes};
    } catch (error) {
      state.marketQuotes = previous.quotes;
      if (previous.hadLogs) state.logs = previous.logs;
      else delete state.logs;
      throw error;
    }
  };
  const deleteMarketQuote = (quoteId: string) => {
    const quote = state.marketQuotes.find(item => item.id === quoteId);
    if (!quote) return null;
    state.marketQuotes = state.marketQuotes.filter(item => item.id !== quoteId);
    addLog(systemActor(), "价格参考", "删除行情参考", quote.model || quote.productName || quoteId, undefined, "已删除");
    return quote;
  };
  return {updateMarketPrice, syncEstimatedSellPrice, createMarketQuote, importMarketQuotes, deleteMarketQuote};
}
