import type {ProductBrandRecord} from "../types/productBrand";

/** Product brands, shared across physical categories. GPU vendors are a separate field. */
const brandDefinitions: [string, string, ...string[]][] = [
  ["asus", "华硕", "ASUS"], ["msi", "微星", "MSI"], ["gigabyte", "技嘉", "GIGABYTE"],
  ["colorful", "七彩虹", "COLORFUL"], ["galax", "影驰", "GALAX", "GALAXY"],
  ["zotac", "索泰", "ZOTAC"], ["inno3d", "映众", "INNO3D"], ["palit", "同德", "PALIT"],
  ["gainward", "耕升", "GAINWARD"], ["manli", "万丽", "MANLI"], ["maxsun", "铭瑄", "MAXSUN"],
  ["yeston", "盈通", "YESTON"], ["leadtek", "丽台", "LEADTEK"], ["pny", "PNY"],
  ["nvidia", "NVIDIA", "英伟达"], ["amd", "AMD", "超威"], ["intel", "Intel", "英特尔"],
  ["sapphire", "蓝宝石", "SAPPHIRE"], ["powercolor", "撼讯", "POWERCOLOR"],
  ["xfx", "讯景", "XFX"], ["asrock", "华擎", "ASROCK"], ["lenovo", "联想", "LENOVO"],
  ["dell", "戴尔", "DELL"], ["hp", "惠普", "HP"], ["acer", "宏碁", "ACER"],
  ["samsung", "三星", "SAMSUNG"], ["kingston", "金士顿", "KINGSTON"],
  ["crucial", "英睿达", "CRUCIAL"], ["micron", "美光", "MICRON"],
  ["gskill", "芝奇", "G.SKILL", "GSKILL"], ["corsair", "海盗船", "CORSAIR", "美商海盗船"],
  ["adata", "威刚", "ADATA"], ["teamgroup", "十铨", "TEAMGROUP"],
  ["western-digital", "西部数据", "WESTERN DIGITAL", "WD", "西数"], ["seagate", "希捷", "SEAGATE"],
  ["kioxia", "铠侠", "KIOXIA"], ["toshiba", "东芝", "TOSHIBA"], ["solidigm", "SOLIDIGM"],
  ["skhynix", "SK hynix", "SKHYNIX", "海力士"], ["patriot", "博帝", "PATRIOT"],
  ["seasonic", "海韵", "SEASONIC"], ["superflower", "振华", "SUPER FLOWER"],
  ["fsp", "全汉", "FSP"], ["coolermaster", "酷冷至尊", "COOLER MASTER"],
  ["deepcool", "九州风神", "DEEPCOOL"], ["thermalright", "利民", "THERMALRIGHT"],
  ["noctua", "猫头鹰", "NOCTUA"], ["lianli", "联力", "LIAN LI"],
  ["aoc", "AOC", "冠捷"], ["benq", "明基", "BENQ"], ["lg", "LG"], ["viewsonic", "优派", "VIEWSONIC"],
];
export const standardProductBrands: ProductBrandRecord[] = brandDefinitions.map(([key, name, ...aliases]) => ({id: `brand:${key}`, name, aliases, origin: "standard"}));
