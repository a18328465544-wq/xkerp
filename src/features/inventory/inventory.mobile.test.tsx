import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import test from "node:test";
import {renderToStaticMarkup} from "react-dom/server";
import {InventoryMobileRecord} from "./components/InventoryMobileRecord";
import {InventoryModelMobileRecord} from "./components/InventoryModelMobileRecord";
import type {InventoryListItem, InventoryModelSummary} from "@/src/types/inventory";

const item: InventoryListItem = {id: "KC-QA", productId: "P-QA", productName: "技嘉 RTX4090 AERO OC 雪鹰 24G", category: "显卡", serialNumber: "SN-LONG-4090-202610080001", brand: "技嘉", model: "RTX4090", version: "AERO OC", vram: "24G", sourceType: "采购", supplierName: "本地合成供应商", condition: "95新", warehouse: "A区货架01", inspectionStatus: "已入库", inventoryStatus: "已入库", entryTime: "2026-10-01", inventoryDays: 7, inWarranty: false, repaired: false, gpuRisk: false, fullBox: false, estimatedSellPrice: 23000, salesPrice: 21000};
const render = (patch: Partial<InventoryListItem>) => renderToStaticMarkup(<InventoryMobileRecord item={{...item, ...patch}} onOpen={() => undefined} />);
const source = readFileSync(new URL("./pages/InventoryListPage.tsx", import.meta.url), "utf8");

test("inventory phone price matches desktop status semantics and never falls back from zero", () => {
  const current = render({});
  assert.match(current, /预计售价/);
  assert.match(current, /23,000/);
  assert.doesNotMatch(current, /21,000/);
  const soldZero = render({inventoryStatus: "已售出", salesPrice: 0});
  assert.match(soldZero, /成交价/);
  assert.match(soldZero, /¥0/);
  assert.doesNotMatch(soldZero, /23,000/);
  assert.match(render({estimatedSellPrice: undefined}), /未设置/);
  assert.doesNotMatch(render({inventoryStatus: "已售出", salesPrice: undefined}), /23,000/);
});

test("inventory phone preserves full identity, SN, warehouse and existing adapted age", () => {
  const html = render({});
  for (const text of [item.productName, item.serialNumber, item.warehouse, "库龄 7 天"]) assert.ok(html.includes(text));
  assert.match(html, /暂无商品图片/);
  assert.match(html, /data-status-placement="title"/);
  assert.match(render({serialNumber: ""}), /erp-inventory-phone-fact-label">SN<[^]*erp-inventory-phone-sn-value">待录入/);
});

test("inventory dock uses original filter controller, scanner and permission-checked task routes", () => {
  assert.match(source, /search=\{\{value: filters\.keyword/);
  assert.match(source, /overlayOpen=\{Boolean\(statsOpen \|\| scanOpen \|\| actionsOpen \|\| detailId \|\| ledgerOpen\)\}/);
  assert.match(source, /isPathAllowed\(permissions.allowedMenus, item.path\)/);
  assert.match(source, /<ErpBarcodeScannerDialog[\s\S]+onDetected=\{\(keyword\) => updateFilter\(\{keyword\}\)\}/);
  assert.match(source, /manualSorting: true,[\s\S]+sorting,[\s\S]+onSortingChange,[\s\S]+onPageChange: pagination\.onPageChange,[\s\S]+onPageSizeChange: pagination\.onPageSizeChange/);
  assert.match(source, /onPageChange: \(page: number\) => commitFilters\(\{\.\.\.filters, page\}\)/);
  assert.doesNotMatch(source, /rows\.filter\(/);
});

test("mobile-only selection and compact presentation do not rewrite saved desktop visibility", () => {
  assert.match(source, /surface="card" density=\{density\} columnVisibility=\{columnVisibility\}/);
  assert.match(source, /surface="plain" density=\{density\} columnVisibility=\{\{\.\.\.columnVisibility, select: selectionMode\}\}/);
  assert.match(source, /phonePageSizeOptions=\{\[20, 50, 100\]\}/);
  assert.match(source, /pagination=\{pagination\}/);
  assert.match(source, /phone \? <><DetailField label="SN"[^\n]+label="库存编号" value=\{item.id\}/);
});

test("inventory grid resets the shared flex amount cap to prevent overlap with metadata", () => {
  const css = readFileSync(new URL("../../styles/globals.css", import.meta.url), "utf8");
  assert.match(css, /\.erp-inventory-directory \.erp-phone-record-end \{[^}]+grid-template-columns: max-content[^}]+width: max-content; max-width: none;/);
  assert.match(css, /\.erp-inventory-phone-sn-value \{[^}]*overflow-wrap: anywhere/);
  assert.match(css, /\.erp-inventory-phone-sn, \.erp-inventory-phone-location \{[^}]*grid-template-columns: var\(--erp-space-10\) minmax\(0, 1fr\) auto/);
  assert.match(css, /\.erp-inventory-phone-filters label > \.sr-only \{[^}]+clip-path: none;/);
  assert.match(css, /inventory"\] \[data-erp-component="detail-fact"\] \{ display: grid; grid-template-columns: minmax\(0, 2fr\) minmax\(0, 3fr\)/);
});

test("single-card facts have separate SN and location rows outside the detail button", () => {
  const html = render({serialNumber: "00002005013EPH0086", inventoryDays: 0});
  const facts = html.indexOf('class="erp-inventory-phone-facts"');
  assert.ok(html.indexOf("</button>") < facts);
  assert.match(html, /aria-label="复制 SN 00002005013EPH0086"/);
  assert.match(html, /erp-inventory-phone-fact-label">位置<[^]*erp-inventory-phone-age">库龄 0 天/);
  assert.doesNotMatch(html, /<button\b[^>]*>(?:(?!<\/button>)[\s\S])*<button\b/);
  for (const serialNumber of ["", " ", "未录入 SN", "待录入"]) {
    const missing = render({serialNumber});
    assert.match(missing, /erp-inventory-phone-sn-value">待录入/);
    assert.doesNotMatch(missing, /aria-label="复制 SN/);
  }
});

test("wide prices get their own line without changing amounts, warehouse or serial facts", () => {
  const html = render({estimatedSellPrice: 1234567890, warehouse: "成都仓库 A区超长货架名称 第01层", serialNumber: "000000-LONG-SERIAL-20261012"});
  assert.match(html, /data-price-layout="wide"/);
  assert.match(html, /1,234,567,890/);
  assert.match(html, /000000-LONG-SERIAL-20261012/);
  assert.match(html, /成都仓库 A区超长货架名称 第01层/);
  assert.match(render({estimatedSellPrice: 0}), /data-price-layout="inline"[^]*¥0/);
});

const model: InventoryModelSummary = {key: "MODEL-QA", productName: "华硕 RTX5090 夜神OC 32G", category: "显卡", brand: "华硕", model: "RTX5090", version: "夜神OC", vram: "32G", warehouseLocation: "A区货架-01", warehouseLocations: ["A区货架-01", "待检测区"], totalCount: 10, availableCount: 9, pendingCount: 1, lockedCount: 0, soldCount: 0, repairCount: 0};
const renderModel = (patch: Partial<InventoryModelSummary> = {}) => renderToStaticMarkup(<InventoryModelMobileRecord row={{...model, ...patch}} onOpenLedger={() => undefined} onOpenCards={() => undefined} />);
const modelText = (html: string) => html.replace(/<[^>]*>/g, "");

test("inventory model mobile row keeps ledger and single-card actions separate and compact", () => {
  const html = renderModel();
  for (const text of [model.productName, "显卡", "华硕", "RTX5090", "32G", "查看单卡", "出入明细", "总 10", "在库 9", "待检 1", "锁定 0", "A区货架-01、待检测区"]) assert.ok(modelText(html).includes(text), text);
  assert.match(html, /aria-label="查看 华硕 RTX5090 夜神OC 32G 单卡库存"/);
  assert.match(html, /aria-label="库存数量 10 件"/);
  assert.doesNotMatch(html, /待出|erp-inventory-model-phone-end|erp-inventory-model-phone-quantity-label/);
  assert.doesNotMatch(html, /<button\b[^>]*>(?:(?!<\/button>)[\s\S])*<button\b/);

  const source = readFileSync(new URL("../../styles/globals.css", import.meta.url), "utf8");
  assert.match(source, /\.erp-inventory-model-phone-row \{[^}]*grid-template-columns: var\(--erp-mobile-touch-size\) minmax\(0, 1fr\);/);
  assert.match(source, /\.erp-inventory-model-phone-quantity-value \{[^}]*font-size: var\(--erp-text-sm\)[^}]*font-weight: var\(--erp-font-medium\)[^}]*font-variant-numeric: tabular-nums/);
  assert.doesNotMatch(source, /\.erp-inventory-phone-model > button:last-child/);
});

test("model identity chips precede one quantity strip, location and full-width footer actions", () => {
  const html = renderModel();
  const quantity = html.indexOf("erp-inventory-model-phone-quantity");
  const categoryEnd = html.indexOf("</button>", html.indexOf('class="erp-inventory-model-phone-subtitle"'));
  const action = html.indexOf("erp-inventory-model-phone-cards-action");
  const stock = html.indexOf("erp-inventory-model-phone-meta");
  const ledger = html.indexOf("erp-inventory-model-phone-ledger-action");
  const counts = html.indexOf("erp-inventory-model-phone-counts");
  const location = html.indexOf("erp-inventory-model-phone-location");
  assert.ok(categoryEnd < stock && stock < counts && counts < quantity && quantity < location && location < action && action < ledger);
  assert.equal((modelText(html).match(/总 10/g) || []).length, 1);
  assert.match(html, /<div class="erp-inventory-model-phone-meta"/);
  assert.match(html, /erp-inventory-model-phone-actions[^]*查看单卡[^]*出入明细/);
  const css = readFileSync(new URL("../../styles/globals.css", import.meta.url), "utf8");
  assert.match(css, /\.erp-inventory-model-phone-actions \{[^}]*grid-column: 1 \/ -1[^}]*justify-content: space-between/);
  assert.match(css, /\.erp-inventory-model-phone-cards-action, \.erp-inventory-model-phone-ledger-action \{[^}]*min-height: var\(--erp-mobile-touch-size\)/);
});

test("model row preserves full long names, zero total, large totals and included sold stock", () => {
  const productName = "三星 990PRO 2T 盒装 PCIe 4.0 x4，NVMe 2.0 超长规格完整名称";
  const html = renderModel({productName, category: "硬盘", totalCount: 126, availableCount: 2, pendingCount: 0, lockedCount: 0, soldCount: 124});
  assert.ok(html.includes(productName));
  assert.match(html, /aria-label="库存数量 126 件"/);
  assert.match(modelText(html), /总 126在库 2待检 0锁定 0已售 124/);
  assert.doesNotMatch(html, /可售|待出/);
  assert.match(renderModel({totalCount: 0, availableCount: 0, pendingCount: 0}), /aria-label="库存数量 0 件"/);
  assert.match(renderModel({totalCount: 10000}), /aria-label="库存数量 10000 件"/);
});

test("nonzero pending and locked counts stay visible, including when available stock is zero", () => {
  const html = renderModel({availableCount: 0, pendingCount: 2, lockedCount: 3, warehouseLocations: []});
  for (const text of ["在库 0", "待检 2", "锁定 3", "未设置库位"]) assert.ok(modelText(html).includes(text));
});

test("model identity renders supplied facts only, without duplicate or invented specifications", () => {
  const html = renderModel({brand: "未标注品牌", model: model.productName, vram: "", repairCount: 2});
  assert.doesNotMatch(html, /erp-inventory-model-phone-spec|ASUS|AM5|待出/);
  assert.match(modelText(html), /售后 \/ 维修 2/);
  assert.match(html, /暂无商品图片 · 显卡/);
  const duplicate = renderModel({brand: "AMD", model: "AMD", vram: ""});
  assert.equal((duplicate.match(/class="erp-inventory-model-phone-spec"/g) || []).length, 1);
});
