import {adaptInventoryItem} from "./inventory.adapter";
import type {InventoryItemDto} from "../dto/inventory.dto";
import type {SalesCreateRequestDto, SalesCustomerDto, SalesOutboundRequestDto, SalesProductCandidateDto, SalesSettlementAccountDto} from "../dto/sales.dto";
import type {SalesChannel, SalesCustomerOption, SalesFormValues, SalesInventoryCandidate, SalesInvoiceResult, SalesListDataset, SalesListItem, SalesListLine, SalesOutboundDataset, SalesOutboundInventoryItem, SalesOutboundRequest, SalesOutboundResult, SalesOutboundStatus, SalesPartnerType, SalesPaymentStatus, SalesProductCandidate, SalesSettlementAccountOption} from "@/src/types/sales";
import {isInventoryLinkedToSales} from "@/src/utils/inventoryRelations";
import {createProductIdentityIndex, resolveProductIdentityKey} from "@/src/utils/productIdentity";
import {filledSalesLines} from "@/src/features/sales/sales.calculations";

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? value as Record<string, unknown> : {};
}

function text(value: unknown, fallback = "") {
  return typeof value === "string" ? value : value === null || value === undefined ? fallback : String(value);
}

function numberValue(value: unknown, fallback = 0) {
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function optionalNumber(value: unknown) {
  if (value === undefined || value === null || value === "") return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function booleanValue(value: unknown, fallback = false) {
  if (value === undefined || value === null) return fallback;
  return value === true || value === "true" || value === 1;
}

function collection(state: Record<string, unknown>, key: string): Record<string, unknown>[] {
  const value = state[key];
  return Array.isArray(value) ? value.filter((item): item is Record<string, unknown> => Boolean(item && typeof item === "object")) : [];
}

const salesChannels: readonly SalesChannel[] = ["到店", "闲鱼", "抖音", "小红书", "B站", "微信私域", "同行网店"];
const salesPaymentStatuses: readonly SalesPaymentStatus[] = ["未收款", "部分收款", "已收款", "已退款"];
const salesOutboundStatuses: readonly SalesOutboundStatus[] = ["待出库", "已出库"];

function channelValue(value: unknown): SalesChannel {
  return salesChannels.includes(value as SalesChannel) ? value as SalesChannel : "到店";
}

function paymentStatusValue(value: unknown, paidAmount: number, unpaidAmount: number): SalesPaymentStatus {
  if (salesPaymentStatuses.includes(value as SalesPaymentStatus)) return value as SalesPaymentStatus;
  return unpaidAmount <= 0 ? "已收款" : paidAmount > 0 ? "部分收款" : "未收款";
}

function outboundStatusValue(value: unknown): SalesOutboundStatus {
  return salesOutboundStatuses.includes(value as SalesOutboundStatus) ? value as SalesOutboundStatus : "待出库";
}

function adaptSalesListLine(value: unknown, index: number, permissions: SalesApiPermissions): SalesListLine {
  const dto = record(value);
  return {
    id: text(dto.inventoryId || dto.tempId, `line-${index + 1}`),
    productName: text(dto.productName, "未命名商品"),
    sn: text(dto.sn),
    condition: text(dto.condition),
    quantity: Math.max(1, Math.floor(numberValue(dto.quantity, 1))),
    sellPrice: numberValue(dto.sellPrice),
    costPrice: permissions.showCost ? optionalNumber(dto.costPrice) : undefined,
    profit: permissions.showCost && permissions.showProfit ? optionalNumber(dto.profit) : undefined,
    aftersalesTerms: text(dto.aftersalesTerms),
    remarks: text(dto.remarks),
  };
}

export interface SalesApiPermissions {
  showCost: boolean;
  showProfit: boolean;
}

export function adaptSalesListState(response: {data?: unknown; meta?: unknown}, permissions: SalesApiPermissions): SalesListDataset {
  const state = record(response.data);
  const inventory = collection(state, "inventory");
  const items: SalesListItem[] = collection(state, "salesInvoices")
    .map((dto) => {
      const id = text(dto.id || dto.invoiceNo);
      const invoiceNo = text(dto.invoiceNo || dto.id);
      const paidAmount = numberValue(dto.paidAmount);
      const unpaidAmount = numberValue(dto.unpaidAmount);
      const lines = (Array.isArray(dto.items) ? dto.items : []).map((line, index) => adaptSalesListLine(line, index, permissions));
      const productSummary = Array.from(new Set(lines.map((line) => line.productName).filter(Boolean))).slice(0, 3).join("、");
      const document = {id, invoiceNo};
      const annotatedCount = optionalNumber(dto.__linkedInventoryCount);
      const linkedInventoryCount = annotatedCount ?? inventory.filter((item) => isInventoryLinkedToSales({
        purchaseInvoiceNo: undefined,
        salesInvoiceId: text(item.salesInvoiceId) || undefined,
        remarks: text(item.remarks) || undefined,
      }, document)).length;
      const customerName = text(dto.customerName);
      const channel = channelValue(dto.channel);
      const handleBy = text(dto.handleBy);
      return {
        id,
        invoiceNo,
        date: text(dto.date),
        customerName,
        contact: text(dto.contact),
        channel,
        paymentMethod: text(dto.paymentMethod),
        paymentStatus: paymentStatusValue(dto.paymentStatus, paidAmount, unpaidAmount),
        outboundStatus: outboundStatusValue(dto.outboundStatus),
        outboundTime: text(dto.outboundTime),
        outboundHandler: text(dto.outboundHandler),
        totalCount: numberValue(dto.totalCount, lines.reduce((sum, line) => sum + line.quantity, 0)),
        totalAmount: numberValue(dto.totalAmount, lines.reduce((sum, line) => sum + line.sellPrice * line.quantity, 0)),
        totalCost: permissions.showCost ? optionalNumber(dto.totalCost) : undefined,
        totalProfit: permissions.showCost && permissions.showProfit ? optionalNumber(dto.totalProfit) : undefined,
        paidAmount,
        unpaidAmount,
        linkedInventoryCount,
        needInvoice: booleanValue(dto.needInvoice),
        freeShipping: booleanValue(dto.freeShipping),
        expressCompany: text(dto.expressCompany),
        expressNo: text(dto.expressNo),
        aftersalesTerms: text(dto.aftersalesTerms),
        handleBy,
        remarks: text(dto.remarks),
        productSummary,
        searchText: [invoiceNo, id, customerName, channel, handleBy, productSummary, ...lines.map((line) => line.sn)]
          .filter(Boolean)
          .join(" ")
          .toLocaleLowerCase("zh-CN"),
        lines,
      };
    })
    .filter((item) => Boolean(item.id || item.invoiceNo));
  const meta = record(response.meta); const summary = record(meta.summary); const total = optionalNumber(meta.total);
  if (total !== undefined) {
    const page = Math.max(1, numberValue(meta.page, 1)); const pageSize = Math.max(1, numberValue(meta.pageSize, 20));
    return {items, source: "database-page", selection: {data: items, filteredItems: items, meta: {total, page, pageSize, totalPages: Math.max(1, Math.ceil(total / pageSize))}, summary: {orderCount: numberValue(summary.orderCount, total), unitCount: numberValue(summary.unitCount), pendingPaymentCount: numberValue(summary.pendingPaymentCount), pendingOutboundCount: numberValue(summary.pendingOutboundCount), totalAmount: numberValue(summary.totalAmount), totalProfit: permissions.showCost && permissions.showProfit ? optionalNumber(summary.totalProfit) : undefined}}};
  }
  return {items, source: "state-snapshot"};
}

export function adaptSalesOutboundState(response: {data?: unknown}): SalesOutboundDataset {
  const state = record(response.data);
  const products = collection(state, "products");
  const productIdentityIndex = createProductIdentityIndex(products);
  const allInventory = collection(state, "inventory");
  const inventory: SalesOutboundInventoryItem[] = allInventory
    .filter((dto) => ["已入库", "已上架"].includes(text(dto.status)))
    .map((dto) => ({
      id: text(dto.id),
      serialNumber: text(dto.sn || dto.serialNumber),
      productId: text(dto.productId),
      productName: text(dto.productName || dto.name, "未命名商品"),
      productIdentityKey: resolveProductIdentityKey(dto, productIdentityIndex),
      status: text(dto.status),
      condition: text(dto.condition),
      warehouse: text(dto.warehouse || dto.location),
    }))
    .filter((item) => Boolean(item.id));
  const invoices = collection(state, "salesInvoices")
    .filter((dto) => {
      if (outboundStatusValue(dto.outboundStatus) === "已出库") return false;
      if (dto.outboundStatus) return true;
      const lines = Array.isArray(dto.items) ? dto.items.map(record) : [];
      const legacyAlreadySold = lines.length > 0 && lines.every((line) => {
        const inventoryId = text(line.inventoryId);
        return inventoryId && allInventory.some((item) => text(item.id) === inventoryId && text(item.status) === "已售出");
      });
      return !legacyAlreadySold;
    })
    .map((dto) => {
      const id = text(dto.id || dto.invoiceNo);
      const invoiceNo = text(dto.invoiceNo || dto.id);
      const lines = (Array.isArray(dto.items) ? dto.items : []).map((value, index) => {
        const line = record(value);
        return {
          id: text(line.inventoryId || line.tempId, `${id}-line-${index + 1}`),
          productId: text(line.productId),
          productName: text(line.productName, "未命名商品"),
          productIdentityKey: resolveProductIdentityKey(line, productIdentityIndex),
          inventoryId: text(line.inventoryId),
          serialNumber: text(line.sn),
          sellPrice: numberValue(line.sellPrice),
        };
      });
      const customerName = text(dto.customerName);
      return {
        id,
        invoiceNo,
        date: text(dto.date),
        customerName,
        contact: text(dto.contact),
        totalCount: numberValue(dto.totalCount, lines.length),
        totalAmount: numberValue(dto.totalAmount),
        freeShipping: booleanValue(dto.freeShipping),
        expressCompany: text(dto.expressCompany),
        expressNo: text(dto.expressNo),
        remarks: text(dto.remarks),
        lines,
        searchText: [id, invoiceNo, customerName, dto.contact, dto.remarks, ...lines.flatMap((line) => [line.productName, line.serialNumber, line.inventoryId])]
          .filter(Boolean)
          .join(" ")
          .toLocaleLowerCase("zh-CN"),
      };
    })
    .filter((item) => Boolean(item.id))
    .sort((left, right) => right.date.localeCompare(left.date) || right.invoiceNo.localeCompare(left.invoiceNo));
  return {invoices, inventory, source: "state-snapshot"};
}

export function adaptSalesOutboundResult(value: unknown): SalesOutboundResult {
  const dto = record(value);
  return {
    id: text(dto.id),
    invoiceNo: text(dto.invoiceNo || dto.id),
    outboundStatus: text(dto.outboundStatus),
    outboundTime: text(dto.outboundTime),
    outboundHandler: text(dto.outboundHandler),
  };
}

export function toSalesOutboundRequestDto(values: SalesOutboundRequest): SalesOutboundRequestDto {
  return {
    handler: values.handler.trim(),
    codes: Array.from(new Set(values.codes.map((code) => code.trim()).filter(Boolean))),
    manual: values.manual,
    remarks: values.remarks.trim() || undefined,
  };
}

function legacyRecord(dto: SalesCustomerDto, key: "legacyCustomer" | "legacyVendor") {
  const value = record(dto[key]);
  return Object.keys(value).length ? value : undefined;
}

export function adaptSalesCustomer(dto: SalesCustomerDto): SalesCustomerOption {
  const legacyCustomer = legacyRecord(dto, "legacyCustomer");
  const legacyVendor = legacyRecord(dto, "legacyVendor");
  const roles = Array.isArray(dto.roles) ? dto.roles.filter((item): item is string => typeof item === "string") : [];
  const hasCustomerRole = roles.includes("customer") || Boolean(legacyCustomer);
  const hasVendorRole = roles.includes("vendor") || roles.includes("supplier") || Boolean(legacyVendor);
  const partnerType: SalesPartnerType = hasCustomerRole ? "customer" : hasVendorRole ? "vendor" : "customer";
  const legacy = partnerType === "vendor" ? legacyVendor : legacyCustomer;
  const id = text(legacy?.id || dto.id);
  const phone = text(dto.primaryPhone || legacy?.phone || legacy?.contact);
  const wechat = text(dto.primaryWechat || legacy?.wechat);
  const qq = text(dto.primaryQq || legacy?.qq);
  const name = text(dto.displayName || legacy?.name, "未命名客户");
  const selectable = Boolean(id && legacy && text(legacy.id));
  return {
    id,
    partnerType,
    name,
    contact: phone || wechat || qq,
    phone: phone || undefined,
    wechat: wechat || undefined,
    qq: qq || undefined,
    level: text(dto.level || legacy?.level) || undefined,
    source: text(dto.source || legacy?.source || legacy?.firstChannel) || undefined,
    type: text(legacy?.type || (partnerType === "vendor" ? "同行" : "客户")) || undefined,
    status: text(dto.status) || undefined,
    selectable,
    unavailableReason: selectable ? undefined : "CRM 主体尚未映射到销售客户档案",
  };
}

export function adaptSalesCustomers(response: {data?: unknown}): SalesCustomerOption[] {
  const payload = record(response.data);
  const rows = Array.isArray(response.data) ? response.data : Array.isArray(payload.items) ? payload.items : [];
  return rows.filter((item): item is SalesCustomerDto => Boolean(item && typeof item === "object")).map(adaptSalesCustomer);
}

export function adaptSalesInventoryCandidate(dto: InventoryItemDto, permissions: {showCost: boolean; showProfit: boolean}): SalesInventoryCandidate {
  const item = adaptInventoryItem(dto, permissions);
  const status = item.inventoryStatus;
  const saleable = status === "已入库" || status === "已上架";
  return {
    id: item.id,
    productId: item.productId,
    productName: item.productName,
    category: item.category,
    brand: item.brand,
    model: item.model,
    version: item.version,
    vram: item.vram,
    serialNumber: item.serialNumber,
    condition: item.condition,
    warehouse: item.warehouse,
    inventoryStatus: status,
    costPrice: item.costPrice,
    estimatedSellPrice: item.estimatedSellPrice,
    entryTime: item.entryTime,
    inventoryDays: item.inventoryDays,
    imageUrl: item.imageUrl,
    saleable,
    unavailableReason: saleable ? undefined : `当前状态为“${status}”，只能选择已入库或已上架库存`,
  };
}

export function adaptSalesInventoryCandidates(response: {data?: unknown}, permissions: {showCost: boolean; showProfit: boolean}): SalesInventoryCandidate[] {
  const rows = Array.isArray(response.data) ? response.data : [];
  return rows.filter((item): item is InventoryItemDto => Boolean(item && typeof item === "object")).map((item) => adaptSalesInventoryCandidate(item, permissions));
}

export function adaptSalesProductCandidate(dto: SalesProductCandidateDto, permissions: {showCost: boolean}): SalesProductCandidate {
  const availableQuantity = Math.max(0, Math.floor(numberValue(dto.availableQuantity)));
  const inventoryQuantity = Math.max(0, Math.floor(numberValue(dto.inventoryQuantity, availableQuantity)));
  const reservedQuantity = Math.max(0, Math.floor(numberValue(dto.reservedQuantity)));
  const productId = text(dto.productId || dto.id);
  const productName = text(dto.productName, "未命名商品");
  const saleable = booleanValue(dto.saleable, availableQuantity > 0);
  return {
    id: text(dto.id || productId || productName),
    productId,
    productName,
    category: text(dto.category, "其他配件"),
    brand: text(dto.brand, "未标注品牌"),
    model: text(dto.model, "未标注型号"),
    version: text(dto.version),
    vram: text(dto.vram),
    condition: text(dto.condition, "出库核验"),
    warehouse: text(dto.warehouse, "未分配库位"),
    inventoryStatus: text(dto.inventoryStatus, "可售库存"),
    inventoryQuantity,
    reservedQuantity,
    availableQuantity,
    costPrice: permissions.showCost ? optionalNumber(dto.costPrice) : undefined,
    estimatedSellPrice: optionalNumber(dto.estimatedSellPrice),
    entryTime: text(dto.entryTime),
    inventoryDays: Math.max(0, Math.floor(numberValue(dto.inventoryDays))),
    imageUrl: text(dto.imageUrl) || undefined,
    saleable,
    unavailableReason: saleable ? undefined : text(dto.unavailableReason, "可售库存已被待出库订单占用"),
  };
}

export function adaptSalesProductCandidates(response: {data?: unknown}, permissions: {showCost: boolean}): SalesProductCandidate[] {
  const rows = Array.isArray(response.data) ? response.data : [];
  return rows
    .filter((item): item is SalesProductCandidateDto => Boolean(item && typeof item === "object"))
    .map((item) => adaptSalesProductCandidate(item, permissions));
}

export function adaptSalesSettlementAccount(dto: SalesSettlementAccountDto): SalesSettlementAccountOption {
  return {
    id: text(dto.id),
    name: text(dto.name, "未命名账户"),
    type: text(dto.type),
    balance: optionalNumber(dto.balance),
    availableBalance: optionalNumber(dto.availableBalance),
    enabled: dto.enabled !== false,
  };
}

export function adaptSalesSettlementAccounts(response: {data?: unknown}): SalesSettlementAccountOption[] {
  const rows = Array.isArray(response.data) ? response.data : [];
  return rows.filter((item): item is SalesSettlementAccountDto => Boolean(item && typeof item === "object")).map(adaptSalesSettlementAccount);
}

export function adaptSalesInvoice(value: unknown): SalesInvoiceResult {
  const dto = record(value);
  return {
    id: text(dto.id),
    invoiceNo: text(dto.invoiceNo),
    date: text(dto.date),
    customerName: text(dto.customerName),
    totalCount: numberValue(dto.totalCount),
    totalAmount: numberValue(dto.totalAmount),
    totalCost: optionalNumber(dto.totalCost),
    totalProfit: optionalNumber(dto.totalProfit),
    paidAmount: numberValue(dto.paidAmount),
    unpaidAmount: numberValue(dto.unpaidAmount),
    paymentStatus: text(dto.paymentStatus),
    outboundStatus: text(dto.outboundStatus),
  };
}

function expandLines(values: SalesFormValues) {
  return filledSalesLines(values.items).flatMap((item) => Array.from({length: Math.max(1, Math.floor(item.quantity || 1))}, () => item));
}

export function toCreateSalesRequest(values: SalesFormValues, account?: SalesSettlementAccountOption): SalesCreateRequestDto {
  const items = expandLines(values).map((item) => ({
    // The current backend creates a model-level reservation and binds physical SNs at outbound.
    // Keep this explicit instead of pretending the selected search result is persisted.
    inventoryId: "",
    productId: item.productId,
    productName: item.productName,
    sn: "",
    condition: item.condition || "出库核验",
    costPrice: item.costPrice || 0,
    sellPrice: Math.round(item.sellPrice),
    profit: Math.round(item.sellPrice - (item.costPrice || 0)),
    aftersalesTerms: item.aftersalesTerms || values.aftersalesTerms,
    remarks: item.remarks || undefined,
  }));
  const subtotal = items.reduce((sum, item) => sum + item.sellPrice, 0);
  const paidAmount = Math.max(0, Math.min(Math.round(values.paidAmount || 0), subtotal));
  const unpaidAmount = Math.max(0, subtotal - paidAmount);
  return {
    date: values.date,
    customerId: values.customerId || undefined,
    customerPartnerType: values.customerPartnerType,
    customerName: values.customerName.trim(),
    contact: values.contact.trim(),
    channel: values.channel,
    paymentMethod: values.paymentMethod,
    isPaid: unpaidAmount <= 0,
    paidAmount,
    unpaidAmount,
    settlementAccountId: paidAmount > 0 ? values.settlementAccountId || undefined : undefined,
    settlementAccountName: account?.name,
    paymentHandler: values.handleBy.trim(),
    paymentStatus: unpaidAmount <= 0 ? "已收款" : paidAmount > 0 ? "部分收款" : "未收款",
    needInvoice: values.needInvoice,
    freeShipping: values.freeShipping,
    expressCompany: values.expressCompany.trim() || undefined,
    expressNo: values.expressNo.trim() || (values.freeShipping ? "无需物流(自提)" : undefined),
    aftersalesTerms: values.aftersalesTerms.trim(),
    handleBy: values.handleBy.trim(),
    remarks: values.remarks.trim() || undefined,
    items,
  };
}
