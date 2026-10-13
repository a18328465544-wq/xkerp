/** Market quote record shared by the dashboard initial snapshot and quote domain adapter. */
export const quoteTrendValues = ["up", "down", "stable"] as const;
export type QuoteTrend = typeof quoteTrendValues[number];

export const quoteScopeValues = ["core"] as const;
/** Product scope is read-only historical compatibility, never a new pricing mode. */
export type QuoteScope = typeof quoteScopeValues[number] | "product";
export interface QuoteProfile {
  condition: "any" | "new" | "used";
  grade: string;
  warranty: "any" | "in" | "out";
  packaging: "any" | "boxed" | "unboxed";
  vram: string;
  currency: "CNY";
}
export interface QuoteBinding {
  quoteScope: QuoteScope;
  coreId: string;
  coreModel: string;
  profile: QuoteProfile;
  source: string;
  validUntil?: string;
}
export interface QuoteProductOption {
  id: string;
  name: string;
  category: string;
  brand: string;
  model: string;
  version?: string;
  vram?: string;
  coreId?: string;
  coreModel?: string;
}

export interface MarketQuoteCategory {
  id: string;
  name: string;
  isActive: boolean;
  sortOrder: number;
}

export interface MarketQuote extends Partial<QuoteBinding> {
  id: string;
  date: string;
  productId: string;
  productName: string;
  model: string;
  brand: string;
  categoryId?: string;
  version: string;
  yestBuyPrice: number;
  todayBuyPrice: number;
  todaySellPrice: number;
  maxPrice: number;
  minPrice: number;
  changeAmount: number;
  changeRatio: number;
  remarks?: string;
  trend?: QuoteTrend;
  fluctuation?: string;
  updateTime?: string;
  refBuyPrice?: number | null;
  refSellPrice?: number | null;
  maintainedBy?: string;
  history?: Array<{date: string; buyPrice: number | null; sellPrice: number | null; quoteKey?: string}>;
}

export interface QuoteHistoryPoint {
  date: string;
  buyPrice?: number;
  sellPrice?: number;
  quoteKey?: string;
}

export interface MarketQuoteItem extends Partial<QuoteBinding> {
  id: string;
  productId?: string;
  productName: string;
  model: string;
  brand: string;
  categoryId?: string;
  categoryName?: string;
  version?: string;
  buyPrice?: number;
  sellPrice?: number;
  previousBuyPrice?: number;
  changeAmount?: number;
  changeRatio?: number;
  trend: QuoteTrend;
  note?: string;
  updateTime?: string;
  history: QuoteHistoryPoint[];
  stockCount: number;
  averageStockCost?: number;
  maximumStockCost?: number;
  maintainedBy?: string;
  expired?: boolean;
}

export interface MarketQuoteSnapshot {
  quotes: MarketQuoteItem[];
  brands: string[];
  products?: QuoteProductOption[];
  stockCount?: number;
}

export interface MarketQuoteFilters {
  keyword: string;
  brand: string;
  categoryId: string;
  trend: "all" | QuoteTrend;
  quoteScope?: "all" | QuoteScope | "legacy";
  condition?: "all" | QuoteProfile["condition"];
  page: number;
  pageSize: number;
}

export interface MarketQuoteFormValues extends Partial<QuoteBinding> {
  model: string;
  brand: string;
  categoryId: string;
  productId?: string;
  buyPrice: number | null;
  sellPrice: number | null;
  trend: QuoteTrend;
  note: string;
}

export interface MarketQuoteImportRow extends MarketQuoteFormValues {
  sourceLine: number;
}

export interface MarketQuoteImportResult {
  created: number;
  updated: number;
  skipped: number;
}
