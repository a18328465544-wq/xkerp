import type {Pool, PoolClient} from "pg";
import type {ProductBrandRecord} from "../src/types/productBrand.ts";
import {mergeProductBrandCatalog, normalizeProductBrand, resolveProductBrand} from "../src/utils/productBrandCatalog.ts";
import {DEFAULT_STORE_ID, DEFAULT_TENANT_ID} from "./commercialConstants.ts";

export async function readProductBrandCatalog(client: Pick<PoolClient | Pool, "query">, scope: {tenantId?: string; storeId?: string}) {
  const rows = await client.query<{data: ProductBrandRecord}>("SELECT data FROM gpu_product_brands WHERE tenant_id = $1 AND store_id = $2 ORDER BY id", [scope.tenantId || DEFAULT_TENANT_ID, scope.storeId || DEFAULT_STORE_ID]);
  return mergeProductBrandCatalog(rows.rows.map(row => row.data));
}
export const normalizedBrandSql = (expression: string) => `REGEXP_REPLACE(UPPER(NORMALIZE(COALESCE(${expression}, ''), NFKC)), '[[:space:]_.-]+', '', 'g')`;
export function productBrandFilterSql(expression: string, value: string, bind: (value: unknown) => string, catalog: readonly ProductBrandRecord[], bindingExpression?: string) {
  const brand = resolveProductBrand(value, catalog);
  const aliases = brand ? [...new Set([brand.name, ...brand.aliases].map(normalizeProductBrand))] : [normalizeProductBrand(value)];
  return `(${normalizedBrandSql(expression)} = ANY(${bind(aliases)}::text[])${brand && bindingExpression ? ` OR ${bindingExpression} = ${bind(brand.id)}` : ""})`;
}
