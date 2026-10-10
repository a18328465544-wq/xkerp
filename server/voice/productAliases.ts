export const PRODUCT_ALIASES = [
  {alias: "猛禽", canonical: "ROG STRIX"},
  {alias: "ROG", canonical: "ROG"},
  {alias: "玩家国度", canonical: "ROG"},
  {alias: "TUF", canonical: "TUF"},
  {alias: "电竞特工", canonical: "TUF"},
  {alias: "魔龙", canonical: "GAMING X"},
  {alias: "超龙", canonical: "SUPRIM"},
  {alias: "万图师", canonical: "VENTUS"},
  {alias: "星曜", canonical: "AORUS"},
  {alias: "火神", canonical: "VULCAN"},
  {alias: "水神", canonical: "SUPRIM LIQUID"},
  {alias: "金属大师", canonical: "METAL MASTER"},
  {alias: "影驰", canonical: "GALAX"},
  {alias: "雪豹", canonical: "WHITE"},
] as const;

export function expandProductAliases(text: string) {
  return PRODUCT_ALIASES.reduce((result, item) => result.replaceAll(item.alias.toLowerCase(), item.canonical.toLowerCase()), text.toLowerCase());
}

export function findProductAliasMatches(text: string) {
  const normalized = text.toLowerCase();
  return PRODUCT_ALIASES.filter(({alias}) => normalized.includes(alias.toLowerCase()));
}
