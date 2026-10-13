export interface ProductBrandRecord {
  id: string;
  name: string;
  aliases: string[];
  origin: "standard" | "custom";
  createdAt?: string;
  createdBy?: string;
}
export interface ProductBrandInput {name: string; aliases: string[]}
export interface ProductBrandLegacyMatch {
  productId: string;
  productName: string;
  originalBrand: string;
  brandId?: string;
  suggestedBrandId?: string;
}
export interface ProductBrandCatalog {
  brands: ProductBrandRecord[];
  canManage: boolean;
  legacyMatches: ProductBrandLegacyMatch[];
}
export interface ProductBrandBindingInput {productId: string; brandId: string; expectedBrand: string}
