import type {QuoteBinding} from "@/src/types/quote";

export interface MarketQuoteSnapshotResponseDto {
  data?: unknown;
  state?: unknown;
  stateMerge?: unknown;
  stateDelete?: unknown;
}

export interface MarketQuoteCreateRequestDto extends Partial<QuoteBinding> {
  quoteScope: "core";
  model: string;
  brand: string;
  categoryId?: string;
  productId: "";
  refBuyPrice: number | null;
  refSellPrice: number | null;
  trend: "up" | "down" | "stable";
  fluctuation?: string;
  updateTime: string;
}

export interface MarketQuoteUpdateRequestDto extends Partial<QuoteBinding> {
  quoteScope: "core";
  productId: "";
  todayBuyPrice: number | null;
  todaySellPrice: number | null;
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
