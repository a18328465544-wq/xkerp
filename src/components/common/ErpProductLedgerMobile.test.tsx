import assert from "node:assert/strict";
import test from "node:test";
import {readFileSync} from "node:fs";
import {renderToStaticMarkup} from "react-dom/server";
import {ErpProductLedgerMobileRow, emptyLedgerCriteria, ledgerCriteria, ledgerQuantityLabel} from "./ErpProductLedgerMobile";
import type {ProductLedgerFilters, ProductLedgerRow} from "@/src/types/product-ledger";
import {formatCurrency} from "@/src/lib/format";

const row: ProductLedgerRow = {id: "test", storeName: "测试", documentType: "采购入库", documentNo: "JH-20261007-003", operationType: "增加", quantity: 1, amount: 42500, unitPrice: 42500, createdBy: "店员 A", supplierName: "示例供应商 A", customerName: "", operatedAt: "2026-10-07 14:26"};
const source = readFileSync(new URL("./ErpProductLedgerMobile.tsx", import.meta.url), "utf8");

test("ledger phone rows expose document identity, party, creator and operation time without expansion", () => {
  const markup = renderToStaticMarkup(<ErpProductLedgerMobileRow row={row} onOpen={() => undefined} />);
  for (const value of [row.documentNo, row.supplierName, row.createdBy, "2026-10-07 14:26", "增加 1 件", "¥42,500"]) assert.ok(markup.includes(value));
  assert.equal((markup.match(/<button/g) || []).length, 1);
  assert.doesNotMatch(markup, /查看其余|title-mono|可售库存|现金收入/);
});
test("missing financial permission never becomes a fake zero amount", () => {
  const markup = renderToStaticMarkup(<ErpProductLedgerMobileRow row={{...row, amount: undefined, unitPrice: undefined}} />);
  assert.doesNotMatch(markup, /¥|<button|查看 JH/);
  assert.match(markup, /JH-20261007-003/);
});
test("real zero amount and quantity remain visible", () => {
  const markup = renderToStaticMarkup(<ErpProductLedgerMobileRow row={{...row, amount: 0, quantity: 0}} />);
  assert.match(markup, /¥0/);
  assert.match(markup, /增加 0 件/);
});
test("outgoing quantities use the stored direction, while locks and adjustments retain their signed quantity", () => {
  assert.equal(ledgerQuantityLabel({operationType: "减少", quantity: -2}), "减少 2 件");
  assert.equal(ledgerQuantityLabel({operationType: "增加", quantity: -2}), "增加 -2 件");
  assert.equal(ledgerQuantityLabel({operationType: "锁定", quantity: -1}), "锁定 -1 件");
  assert.equal(ledgerQuantityLabel({operationType: "调整", quantity: -3}), "调整 -3 件");
});
test("complete long identifiers remain visible and negative amounts follow the existing currency formatter", () => {
  const markup = renderToStaticMarkup(<ErpProductLedgerMobileRow row={{...row, documentNo: "JH-20261007-000000000000000000003", amount: -123456789.12, createdBy: "超长制单人姓名"}} />);
  assert.match(markup, /JH-20261007-000000000000000000003/);
  assert.ok(markup.includes(formatCurrency(-123456789.12)));
  assert.match(markup, /超长制单人姓名/);
});
test("criteria apply/reset preserves the owning search and paging contract", () => {
  const filters: ProductLedgerFilters = {documentNo: "JH", createdBy: "A", documentType: "采购入库", startDate: "2026-10-01", endDate: "2026-10-07", page: 3, pageSize: 50};
  assert.deepEqual(ledgerCriteria(filters), {createdBy: "A", documentType: "采购入库", startDate: "2026-10-01", endDate: "2026-10-07"});
  assert.equal({...filters, ...emptyLedgerCriteria}.documentNo, "JH");
  assert.equal({...filters, ...emptyLedgerCriteria}.pageSize, 50);
  assert.equal(filters.createdBy, "A");
});
test("phone actions reuse shared panels, selector and footer without a second API path", () => {
  assert.match(source, /ErpDetailDrawer[\s\S]*footer=\{<ErpSearchInput/);
  assert.match(source, /hidePhoneTrigger phoneOpenRequest/);
  assert.match(source, /open=\{open && filterOpen\}/);
  assert.match(source, /setDraft\(ledgerCriteria\(filters\)\)/);
  assert.match(source, /onFiltersChange\(ledgerCriteria\(draft\)\)/);
  assert.match(source, /仅排序当前页/);
  assert.doesNotMatch(source, /fetch\(|apiRequest|fixed|sticky|localStorage|state\.inventory/);
});
test("desktop projection remains intact and phone-only styles do not escape their scope", () => {
  const drawer = readFileSync(new URL("./ErpProductLedgerDrawer.tsx", import.meta.url), "utf8");
  const styles = readFileSync(new URL("../../styles/globals.css", import.meta.url), "utf8");
  assert.match(drawer, /if \(phone\) return <ErpProductLedgerMobile key=\{subject\?\.key/);
  assert.match(drawer, /modal=\{false\}.*resizable allowFullWidth drawerKey="product-ledger"/);
  assert.match(styles, /\.erp-product-ledger-phone \.erp-phone-record-title[^}]*white-space: normal/);
  assert.match(styles, /\.erp-drawer-viewport:has\(> \[data-erp-component="detail-drawer"\] > \[data-erp-region="drawer-footer"\]\)[^}]*bottom: var\(--erp-phone-keyboard-inset\); min-height: 0/);
  const ledgerStyleIndex = styles.indexOf("/* Model ledger:");
  assert.ok(styles.lastIndexOf("@media (max-width: 767px)", ledgerStyleIndex) > styles.lastIndexOf("@media (min-width:", ledgerStyleIndex));
});
