/** Legacy market quote record kept for state-compat reads. */
export interface MarketQuote {
  id: string;
  date: string;
  productId: string;
  productName: string;
  model: string;
  brand: string;
  version: string;
  yestBuyPrice: number;
  todayBuyPrice: number;
  todaySellPrice: number;
  maxPrice: number;
  minPrice: number;
  changeAmount: number;
  changeRatio: number;
  remarks?: string;
  trend?: "up" | "down" | "stable";
  fluctuation?: string;
  updateTime?: string;
  refBuyPrice?: number;
  refSellPrice?: number;
  history?: Array<{date: string; buyPrice: number; sellPrice: number}>;
}

export type QuoteTrend = "up" | "down" | "stable";

export interface QuoteHistoryPoint {
  date: string;
  buyPrice?: number;
  sellPrice?: number;
}

export interface MarketQuoteItem {
  id: string;
  productId?: string;
  productName: string;
  model: string;
  brand: string;
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
}

export interface MarketQuoteSnapshot {
  quotes: MarketQuoteItem[];
  brands: string[];
}

export interface MarketQuoteFilters {
  keyword: string;
  brand: string;
  trend: "all" | QuoteTrend;
  page: number;
  pageSize: number;
}

export interface MarketQuoteFormValues {
  model: string;
  brand: string;
  buyPrice: number;
  sellPrice: number;
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
