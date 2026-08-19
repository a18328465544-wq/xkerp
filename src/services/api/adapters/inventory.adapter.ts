import type {InventoryItemDto, InventoryPageResponseDto, InventorySummaryResponseDto, InventorySummaryRowDto} from "../dto/inventory.dto";
import type {InventoryListItem, InventoryListResult, InventoryModelSummary, InventoryPageMeta, InventorySummary, InventoryStatusValue} from "@/src/types/inventory";

const inventoryStatuses: readonly InventoryStatusValue[] = [
  "待检测", "检测中", "已入库", "已上架", "已锁定", "已售出", "已拆卸", "已组装", "退货中", "已退货", "售后中", "维修中", "已报废",
];

function text(value: unknown, fallback = "") {
  return typeof value === "string" ? value : value === null || value === undefined ? fallback : String(value);
}

function numberValue(value: unknown, fallback = 0) {
  const result = typeof value === "number" ? value : Number(value);
  return Number.isFinite(result) ? result : fallback;
}

function optionalNumber(value: unknown) {
  if (value === null || value === undefined || value === "") return undefined;
  const result = Number(value);
  return Number.isFinite(result) ? result : undefined;
}

function booleanValue(value: unknown) {
  return value === true || value === "true" || value === 1;
}

function stringArray(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string" && item.trim().length > 0) : [];
}

function statusValue(value: unknown): InventoryStatusValue {
  const status = text(value, "待检测");
  return inventoryStatuses.includes(status as InventoryStatusValue) ? status as InventoryStatusValue : "待检测";
}

export function adaptInventoryItem(dto: InventoryItemDto, permissions: {showCost: boolean; showProfit: boolean}): InventoryListItem {
  const cost = optionalNumber(dto.costPrice);
  const sell = optionalNumber(dto.estSellPrice);
  const market = optionalNumber(dto.marketPrice);
  const canShowCost = permissions.showCost;
  const canShowProfit = permissions.showProfit && canShowCost;
  const inventoryStatus = statusValue(dto.status);
  const imageUrls = Array.isArray(dto.imageUrls) ? dto.imageUrls : [];
  const imageUrl = typeof imageUrls[0] === "string" ? imageUrls[0] : undefined;
  return {
    id: text(dto.id),
    productId: text(dto.productId),
    productName: text(dto.productName, "未命名商品"),
    category: text(dto.category, "其他配件"),
    serialNumber: text(dto.sn, "未录入 SN"),
    brand: text(dto.brand, "未标注品牌"),
    model: text(dto.model, "未标注型号"),
    version: text(dto.version),
    vram: text(dto.vram),
    condition: text(dto.condition, "未标注"),
    warehouse: text(dto.warehouseLocation, "未分配库位"),
    inspectionStatus: inventoryStatus === "待检测" || inventoryStatus === "检测中" ? inventoryStatus : "已完成",
    inventoryStatus,
    sourceType: text(dto.sourceType),
    supplierName: text(dto.supplierName),
    costPrice: canShowCost ? cost : undefined,
    estimatedSellPrice: sell,
    marketPrice: market,
    estimatedProfit: canShowProfit && cost !== undefined && sell !== undefined ? sell - cost : undefined,
    entryTime: text(dto.entryTime),
    inventoryDays: numberValue(dto.storageDays),
    inWarranty: booleanValue(dto.inWarranty),
    warrantyDate: text(dto.warrantyDate) || undefined,
    repaired: booleanValue(dto.repaired),
    gpuRisk: booleanValue(dto.gpuRisk),
    fullBox: booleanValue(dto.fullBox),
    remarks: text(dto.remarks) || undefined,
    salesPrice: optionalNumber(dto.salesPrice),
    salesTime: text(dto.salesTime) || undefined,
    salesInvoiceId: text(dto.salesInvoiceId) || undefined,
    buyerName: text(dto.buyerName) || undefined,
    imageUrl,
  };
}

function readRows(value: unknown): InventoryItemDto[] {
  return Array.isArray(value) ? value.filter((item): item is InventoryItemDto => Boolean(item && typeof item === "object")) : [];
}

function readMeta(value: unknown): InventoryPageMeta {
  const meta = value && typeof value === "object" ? value as Record<string, unknown> : {};
  return {page: Math.max(1, numberValue(meta.page, 1)), pageSize: Math.max(1, numberValue(meta.pageSize, 20)), total: Math.max(0, numberValue(meta.total))};
}

export function adaptInventoryPage(response: InventoryPageResponseDto, permissions: {showCost: boolean; showProfit: boolean}): InventoryListResult {
  return {data: readRows(response.data).map((item) => adaptInventoryItem(item, permissions)), meta: readMeta(response.meta)};
}

function readSummaryRows(value: unknown): InventorySummaryRowDto[] {
  return Array.isArray(value) ? value.filter((item): item is InventorySummaryRowDto => Boolean(item && typeof item === "object")) : [];
}

export function adaptInventorySummary(response: InventorySummaryResponseDto, permissions: {showCost: boolean; showProfit: boolean}): InventorySummary {
  const summary = readSummaryRows(response.data).reduce<InventorySummary>((accumulator, row) => {
    accumulator.totalCount += numberValue(row.totalCount);
    accumulator.availableCount += numberValue(row.availableCount);
    accumulator.pendingCount += numberValue(row.pendingCount);
    accumulator.lockedCount += numberValue(row.lockedCount);
    accumulator.soldCount += numberValue(row.soldCount);
    if (permissions.showCost) {
      accumulator.totalCost = (accumulator.totalCost || 0) + numberValue(row.totalCost);
      accumulator.totalEstSell = (accumulator.totalEstSell || 0) + numberValue(row.totalEstSell);
    }
    return accumulator;
  }, {totalCount: 0, availableCount: 0, pendingCount: 0, lockedCount: 0, soldCount: 0});
  return summary;
}

/**
 * Preserve the server's model-level grouping for the aggregate inventory
 * view. Cost and profit fields are redacted at the adapter boundary so UI
 * components cannot accidentally expose data outside the current session.
 */
export function adaptInventoryModelSummaries(response: InventorySummaryResponseDto, permissions: {showCost: boolean; showProfit: boolean}): InventoryModelSummary[] {
  return readSummaryRows(response.data).map((row, index) => {
    const totalCount = numberValue(row.totalCount);
    const totalCost = optionalNumber(row.totalCost);
    const totalEstSell = optionalNumber(row.totalEstSell);
    const canShowProfit = permissions.showCost && permissions.showProfit;
    const locations = stringArray(row.warehouseLocations);
    const warehouseLocation = text(row.warehouseLocation) || locations.join("、") || "未分配库位";
    return {
      key: text(row.key) || `${text(row.productName, "未命名商品")}-${index}`,
      productName: text(row.productName, "未命名商品"),
      category: text(row.category, "其他配件"),
      brand: text(row.brand, "未标注品牌"),
      model: text(row.model, "未标注型号"),
      version: text(row.version),
      vram: text(row.vram),
      warehouseLocation,
      warehouseLocations: locations.length ? locations : [warehouseLocation],
      totalCount,
      availableCount: numberValue(row.availableCount),
      pendingCount: numberValue(row.pendingCount),
      lockedCount: numberValue(row.lockedCount),
      soldCount: numberValue(row.soldCount),
      repairCount: numberValue(row.repairCount),
      totalCost: permissions.showCost ? totalCost : undefined,
      totalEstSell,
      avgCost: permissions.showCost ? optionalNumber(row.avgCost) : undefined,
      avgEstSell: optionalNumber(row.avgEstSell),
      estimatedProfit: canShowProfit && totalCost !== undefined && totalEstSell !== undefined ? totalEstSell - totalCost : undefined,
      lastEntryTime: text(row.lastEntryTime) || undefined,
    };
  });
}
