import {isProductCategory, productCategoryValues, type ProductCategory} from "../src/types/core.ts";

type CategoryCard = {id: string; productId?: string; productName?: string; category?: unknown};
type CategoryProduct = {id: string; category?: unknown};

/** Read projection only: exact product IDs, never name/model guesses. Stored
 * stock, inspection status, money and historic documents remain untouched. */
export function resolveInventoryCategory(card: Pick<CategoryCard, "category">, product?: CategoryProduct): ProductCategory {
  if (isProductCategory(product?.category)) return product.category;
  return isProductCategory(card.category) ? card.category : "其他配件";
}

export function projectInventoryCategories<T extends CategoryCard>(inventory: readonly T[], products: readonly CategoryProduct[]): (T & {category: ProductCategory})[] {
  const byId = new Map(products.map(product => [product.id, product]));
  return inventory.map(card => ({...card, category: resolveInventoryCategory(card, byId.get(card.productId || ""))}));
}

export function inventoryCategoryDifferences(inventory: readonly CategoryCard[], products: readonly CategoryProduct[]) {
  const byId = new Map(products.map(product => [product.id, product]));
  return inventory.flatMap(card => {
    const product = byId.get(card.productId || "");
    const reasons: string[] = [];
    if (!product) reasons.push("缺少关联商品档案");
    else if (!isProductCategory(product.category)) reasons.push("商品分类缺失或无效");
    if (!isProductCategory(card.category)) reasons.push("库存分类缺失或无效");
    if (isProductCategory(product?.category) && isProductCategory(card.category) && card.category !== product.category) reasons.push("库存与商品分类不一致");
    return reasons.length ? [{inventoryId: card.id, productId: card.productId || "", productName: card.productName || "",
      storedCategory: typeof card.category === "string" ? card.category : null,
      productCategory: typeof product?.category === "string" ? product.category : null,
      displayedCategory: resolveInventoryCategory(card, product), reasons,
      needsManualReview: !isProductCategory(product?.category)}] : [];
  });
}

const categorySqlValues = productCategoryValues.map(value => `'${value}'`).join(", ");
/** Both the page and its COUNT use exactly the same scoped classification.
 * The linked lookup cannot bind another tenant/store's product with the same ID. */
export const inventoryReadCategorySql = `COALESCE((SELECT CASE WHEN p.data->>'category' IN (${categorySqlValues}) THEN p.data->>'category' END FROM gpu_products p WHERE p.id = gpu_inventory.op_product_id AND p.tenant_id = gpu_inventory.tenant_id AND p.store_id = gpu_inventory.store_id), CASE WHEN gpu_inventory.data->>'category' IN (${categorySqlValues}) THEN gpu_inventory.data->>'category' END, '其他配件')`;
