import {standardProductBrands} from "../data/productBrandCatalog";
import type {ProductBrandRecord} from "../types/productBrand";

/** Exact normalized aliases only; never infer a product brand from a GPU core/vendor. */
export function normalizeProductBrand(value: string) {
  return value.normalize("NFKC").trim().toUpperCase().replace(/[\s._-]+/g, "");
}
export function mergeProductBrandCatalog(custom: readonly ProductBrandRecord[] = []) {
  const records = new Map(standardProductBrands.map(brand => [brand.id, brand]));
  for (const brand of custom) {
    const standard = records.get(brand.id);
    records.set(brand.id, standard ? {...standard, aliases: [...new Set([...standard.aliases, ...brand.aliases])]} : brand);
  }
  return [...records.values()].sort((a, b) => a.name.localeCompare(b.name, "zh-CN"));
}
export function resolveProductBrand(value: string, catalog: readonly ProductBrandRecord[] = standardProductBrands) {
  const normalized = normalizeProductBrand(value);
  if (!normalized) return undefined;
  const matches = catalog.filter(brand => brand.id === value || [brand.name, ...brand.aliases].some(alias => normalizeProductBrand(alias) === normalized));
  return matches.length === 1 ? matches[0] : undefined;
}
export function productBrandsEqual(left: string, right: string, catalog: readonly ProductBrandRecord[] = standardProductBrands) {
  const first = resolveProductBrand(left, catalog), second = resolveProductBrand(right, catalog);
  return first && second ? first.id === second.id : normalizeProductBrand(left) === normalizeProductBrand(right);
}
export function productBrandSearchText(value: string, catalog: readonly ProductBrandRecord[] = standardProductBrands) {
  const brand = resolveProductBrand(value, catalog);
  return brand ? [value === brand.id ? "" : value, brand.name, ...brand.aliases].filter(Boolean).join(" ") : value;
}
