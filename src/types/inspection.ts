import type {CardInventory, ProductCategory} from "./core";

export type InspectionResultStatus = "通过" | "轻微问题" | "需要维修" | "拒收入库" | "降价入库";
export type InspectionExteriorCheck = "完美无瑕" | "轻微刮花" | "氧化发黄" | "挡板生锈" | "严重磕碰";
export type InspectionFanCheck = "静音顺畅" | "轻微异响" | "抖动偏摆" | "风扇停转";
export type InspectionPortsCheck = "全部正常" | "部分接口无信号" | "物理变形";
export type InspectionGpuZCheck = "核对一致" | "规格异常 / 假卡山寨";
export type InspectionVramResult = "全显存测试通过" | "某显卡测试通道错误" | "黄屏/花屏";
export type InspectionNoise = "静音" | "适中" | "噪音明显";

export interface InspectionCandidate {
  id: string;
  productId: string;
  productName: string;
  category: ProductCategory;
  model: string;
  brand: string;
  version: string;
  vram: string;
  serialNumber: string;
  expressNo: string;
  supplierName: string;
  purchaseInvoiceNo: string;
  status: string;
  condition: CardInventory["condition"];
  inWarranty: boolean;
  warrantyDate: string;
  repaired: boolean;
  fullBox: boolean;
  warehouseLocation: string;
  entryTime: string;
  inventoryDays: number;
  isGpu: boolean;
  searchText: string;
}

export interface InspectionHistoryItem {
  id: string;
  inventoryId: string;
  productName: string;
  category: ProductCategory;
  serialNumber: string;
  resultStatus: InspectionResultStatus;
  condition: CardInventory["condition"];
  warehouseLocation: string;
  inspector: string;
  inspectTime: string;
  temperature?: number;
  wattage?: number;
  repaired: boolean;
  hiddenDefects: boolean;
  remarks: string;
  images: string[];
  exteriorCheck: InspectionExteriorCheck;
  fanCheck: InspectionFanCheck;
  portsCheck: InspectionPortsCheck;
  gpuzCheck: InspectionGpuZCheck;
  furmarkResult: string;
  threedMarkResult: string;
  vramResult: InspectionVramResult;
  noise: InspectionNoise;
  inWarranty: boolean;
  warrantyDate: string;
  fullBox: boolean;
  candidate: InspectionCandidate;
}

export interface InspectionWorkspace {
  candidates: InspectionCandidate[];
  history: InspectionHistoryItem[];
  source: "state-snapshot";
}

export interface InspectionFormValues {
  inventoryId: string;
  isGpu: boolean;
  serialNumber: string;
  condition: CardInventory["condition"];
  inWarranty: boolean;
  warrantyDate: string;
  fullBox: boolean;
  warehouseLocation: string;
  inspector: string;
  exteriorCheck: InspectionExteriorCheck;
  fanCheck: InspectionFanCheck;
  portsCheck: InspectionPortsCheck;
  gpuzCheck: InspectionGpuZCheck;
  furmarkResult: string;
  threedMarkResult: string;
  vramResult: InspectionVramResult;
  temperature: number;
  wattage: number;
  noise: InspectionNoise;
  repaired: boolean;
  hiddenDefects: boolean;
  resultStatus: InspectionResultStatus;
  remarks: string;
  images: string[];
}

export interface InspectionCreateResult {
  id: string;
  inventoryId: string;
  serialNumber: string;
  resultStatus: InspectionResultStatus;
  inspectTime: string;
}
