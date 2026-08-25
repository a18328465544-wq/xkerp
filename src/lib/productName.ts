export function buildProductTemplateName(brand: string, model: string, version: string, vram: string) {
  return [brand, model, version, vram].map((value) => value.trim()).filter(Boolean).join(" ");
}

export function productDisplayName(product: {name?: string; brand?: string; model?: string; version?: string; vram?: string}) {
  const canonicalName = product.name?.trim();
  if (canonicalName) return canonicalName;
  return buildProductTemplateName(product.brand || "", product.model || "", product.version || "", product.vram || "") || "未命名商品";
}
