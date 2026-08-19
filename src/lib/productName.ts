export function buildProductTemplateName(brand: string, model: string, version: string, vram: string) {
  return [brand, model, version, vram].map((value) => value.trim()).filter(Boolean).join(" ");
}
