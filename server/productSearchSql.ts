import {productModelCode, productSearchTerms} from "../src/utils/productSearch.ts";
import {compactSearchText, tokenizeSearchText} from "../src/utils/search.ts";
import {standardProductBrands} from "../src/data/productBrandCatalog.ts";
import type {ProductBrandRecord} from "../src/types/productBrand.ts";
import {normalizedBrandSql} from "./productBrandRead.ts";
import {normalizeProductBrand} from "../src/utils/productBrandCatalog.ts";

type Binder = (value: string) => string;

export type ProductSearchSqlFields = {
  id: string;
  name: string;
  category: string;
  brand: string;
  brandId?: string;
  model: string;
  version: string;
  vram: string;
};

/** Parameterized counterpart of productSearchMatches, shared by products and stock cards. */
export function productIdentitySearchSql(fields: ProductSearchSqlFields, keyword: string, bind: Binder, catalog: readonly ProductBrandRecord[] = standardProductBrands) {
  const terms = productSearchTerms(keyword);
  if (!terms.length) return keyword.trim() ? ["FALSE"] : [];
  const compactQuery = normalizeProductBrand(keyword);
  const relevantBrands = catalog.filter(brand => [brand.name, ...brand.aliases].some(alias => {const aliasTerms = productSearchTerms(alias), token = normalizeProductBrand(alias); return aliasTerms.length && aliasTerms.every(term => terms.includes(term)) || compactQuery.startsWith(token) && /^(RTX|GTX|RX|ARC|[0-9])/.test(compactQuery.slice(token.length));}));
  // Expand only brands mentioned in the query, keeping model terms and exact GPU suffix checks intact.
  const brandText = relevantBrands.reduce((expression, brand) => `CASE WHEN ${[brand.name, ...brand.aliases].map(alias => `${normalizedBrandSql(fields.brand)} = ${bind(normalizeProductBrand(alias))}`).join(" OR ")}${fields.brandId ? ` OR ${fields.brandId} = ${bind(brand.id)}` : ""} THEN ${bind([brand.name, ...brand.aliases].join(" "))} ELSE ${expression} END`, fields.brand);
  const identity = `LOWER(NORMALIZE(CONCAT_WS(' ', ${fields.id}, ${fields.name}, ${fields.category}, ${brandText}, ${fields.model}, ${fields.version}, ${fields.vram}), NFKC))`;
  const compact = `REGEXP_REPLACE(${identity}, '[[:space:][:punct:]，。、·・：；（）【】《》“”‘’—]+', '', 'g')`;
  const clauses = terms.map((term) => {
    const raw = bind(term);
    const compactTerm = bind(term.replace(/[\s·/_|,.-]+/g, ""));
    return `(POSITION(${raw} IN ${identity}) > 0 OR POSITION(${compactTerm} IN ${compact}) > 0)`;
  });
  const modelCode = productModelCode(keyword);
  if (modelCode) {
    // Match the explicit model when it contains a GPU code; a kit/PC may
    // instead mention the installed GPU only in its display name.
    const model = `LOWER(CASE WHEN COALESCE(${fields.model}, '') ~ '[1-9][0-9](00|50|60|70|80|90)(?![0-9])' THEN ${fields.model} ELSE COALESCE(${fields.name}, '') END)`;
    // The suffix is part of the model identity, even when separated by a space.
    const suffix = modelCode.slice(4).split("").join("[[:space:]_-]*");
    const pattern = `(^|[^0-9])(?:rtx|gtx|rx)?[[:space:]_-]*${modelCode.slice(0, 4)}[[:space:]_-]*${suffix}(?![[:space:]_-]*(?:ti|super|xtx|xt|d|s|v2))($|[^a-z0-9])`;
    clauses.push(`${model} ~ ${bind(pattern)}`);
  }
  return clauses;
}

export function productSearchSql(alias: string, keyword: string, bind: Binder, catalog?: readonly ProductBrandRecord[]) {
  return productIdentitySearchSql({
    id: `${alias}.id`,
    name: `${alias}.data->>'name'`,
    category: `${alias}.data->>'category'`,
    brand: `${alias}.data->>'brand'`,
    brandId: `${alias}.data->>'brandId'`,
    model: `${alias}.data->>'model'`,
    version: `${alias}.data->>'version'`,
    vram: `${alias}.data->>'vram'`,
  }, keyword, bind, catalog);
}

/** Stock-card search uses product identity plus identifiers, never supplier/location/remarks. */
export function inventoryKeywordSearchSql(keyword: string, bind: Binder, catalog?: readonly ProductBrandRecord[], brandIdExpression?: string) {
  const identity = productIdentitySearchSql({
    id: "op_product_id", name: "data->>'productName'", category: "op_category",
    brand: "op_brand", brandId: brandIdExpression, model: "data->>'model'", version: "data->>'version'", vram: "data->>'vram'",
  }, keyword, bind, catalog).join(" AND ") || "FALSE";
  const normalize = (field: string) => `REGEXP_REPLACE(LOWER(NORMALIZE(COALESCE(${field}, ''), NFKC)), '[[:space:][:punct:]，。、·・：；（）【】《》“”‘’—]+', '', 'g')`;
  const exact = `(${["id", "op_product_id", "op_sn", "data->>'expressNo'"].map((field) => `${normalize(field)} = ${bind(compactSearchText(keyword))}`).join(" OR ")})`;
  const identifier = productModelCode(keyword)
    ? exact
    : `(${exact} OR ${tokenizeSearchText(keyword).map((token) => `STRPOS(${normalize("CONCAT_WS(' ', id, op_product_id, op_sn, data->>'expressNo')")}, ${bind(token)}) > 0`).join(" AND ") || "FALSE"})`;
  return `((${identity}) OR ${identifier})`;
}
