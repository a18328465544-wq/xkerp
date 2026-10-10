export interface MarketQuoteSnapshotResponseDto {
  data?: unknown;
  state?: unknown;
  stateMerge?: unknown;
  stateDelete?: unknown;
}

export interface MarketQuoteCreateRequestDto {
  model: string;
  brand: string;
  categoryId?: string;
  refBuyPrice: number;
  refSellPrice: number;
  trend: "up" | "down" | "stable";
  fluctuation?: string;
  updateTime: string;
}

export interface MarketQuoteUpdateRequestDto {
  todayBuyPrice: number;
  todaySellPrice: number;
  categoryId?: string | null;
  remarks?: string;
}

export interface MarketQuoteCategoryDto {
  id: string;
  name: string;
  isActive: boolean;
  sortOrder: number;
}

export interface MarketQuoteImportRequestDto {
  quotes: MarketQuoteCreateRequestDto[];
}
