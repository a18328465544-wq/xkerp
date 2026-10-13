import type {ProductBrandBindingInput, ProductBrandInput, ProductBrandRecord} from "../src/types/productBrand.ts";
import {mergeProductBrandCatalog, normalizeProductBrand, resolveProductBrand} from "../src/utils/productBrandCatalog.ts";
import {storeDateTime} from "../src/utils/storeTime.ts";
import type {ProductTemplate} from "../src/types.ts";
import {ConflictError, NotFoundError, ValidationError} from "./errors.ts";
import {buildProductTemplateName} from "../src/lib/productName.ts";

type BrandState = {productBrands?: ProductBrandRecord[]; products?: ProductTemplate[]};
export const currentProductBrandCatalog = (state: BrandState) => mergeProductBrandCatalog(state.productBrands);

function checkAliases(state: BrandState, name: string, aliases: string[], ownId?: string) {
  for (const text of [name, ...aliases]) {
    if (!normalizeProductBrand(text)) throw new ValidationError("请输入有效的品牌名称或别名");
    const duplicate = currentProductBrandCatalog(state).find(brand => brand.id !== ownId && [brand.name, ...brand.aliases].some(alias => normalizeProductBrand(alias) === normalizeProductBrand(text)));
    if (duplicate) throw new ConflictError(`“${text}”已属于品牌“${duplicate.name}”，请直接选择该品牌`);
  }
}
export function createProductBrand(state: BrandState, input: ProductBrandInput, actor: string): ProductBrandRecord {
  const name = input.name.normalize("NFKC").trim();
  if (!normalizeProductBrand(name)) throw new ValidationError("请输入有效品牌名称");
  const aliases = [...new Set(input.aliases.map(alias => alias.normalize("NFKC").trim()).filter(Boolean))];
  checkAliases(state, name, aliases);
  const created: ProductBrandRecord = {id: `brand:custom:${normalizeProductBrand(name)}`, name, aliases, origin: "custom", createdAt: storeDateTime(), createdBy: actor};
  state.productBrands = [...(state.productBrands || []), created];
  return created;
}
export function addProductBrandAliases(state: BrandState, brandId: string, aliases: string[], actor: string): ProductBrandRecord {
  const brand = currentProductBrandCatalog(state).find(record => record.id === brandId);
  if (!brand) throw new NotFoundError("品牌不存在，请刷新后重新选择");
  checkAliases(state, brand.name, aliases, brand.id);
  const updated = {...brand, aliases: [...new Set([...brand.aliases, ...aliases.map(alias => alias.normalize("NFKC").trim()).filter(Boolean)])], createdAt: brand.createdAt || storeDateTime(), createdBy: brand.createdBy || actor};
  state.productBrands = [...(state.productBrands || []).filter(record => record.id !== brand.id), updated];
  return updated;
}
export function validateProductBrand<T extends {brand: string; brandId?: string; name?: string; model?: string; version?: string; vram?: string}>(state: BrandState, product: T, requireBinding = false): T {
  const catalog = currentProductBrandCatalog(state);
  const brand = product.brandId ? catalog.find(record => record.id === product.brandId) : resolveProductBrand(product.brand, catalog);
  if (!brand) {
    if (product.brandId || requireBinding) throw new ValidationError("请选择已有品牌；找不到时请先新建品牌");
    return product;
  }
  if (product.brandId && !resolveProductBrand(product.brand, [brand])) throw new ValidationError("品牌名称与所选品牌不一致，请重新选择");
  return {...product, brandId: brand.id, brand: brand.name, ...(product.brand !== brand.name && product.name && product.model ? {name: buildProductTemplateName(brand.name, product.model, product.version || "", product.vram || "")} : {})};
}
/** Metadata-only confirmation: preserve names, inventory, historical invoices and prices. */
export function bindLegacyProductBrands(state: BrandState, bindings: ProductBrandBindingInput[]) {
  if (new Set(bindings.map(binding => binding.productId)).size !== bindings.length) throw new ValidationError("商品重复，请刷新后重试");
  const catalog = currentProductBrandCatalog(state);
  const updates = bindings.map(binding => {
    const product = state.products?.find(record => record.id === binding.productId);
    if (!product) throw new NotFoundError("商品不存在，请刷新后重试");
    if (product.brand !== binding.expectedBrand || product.brandId && product.brandId !== binding.brandId) throw new ConflictError("商品品牌已发生变化，请刷新后重新确认");
    const brand = catalog.find(record => record.id === binding.brandId);
    if (!brand) throw new NotFoundError("品牌不存在，请重新选择");
    const known = resolveProductBrand(product.brand, catalog);
    if (known && known.id !== brand.id) throw new ConflictError(`原品牌已匹配“${known.name}”，不能绑定其他品牌`);
    return {...product, brandId: brand.id};
  });
  const byId = new Map(updates.map(product => [product.id, product]));
  state.products = (state.products || []).map(product => byId.get(product.id) || product);
  return updates;
}
