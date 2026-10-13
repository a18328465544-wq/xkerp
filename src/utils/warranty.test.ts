import assert from "node:assert/strict";
import test from "node:test";
import {parseStoreWarrantyDays, summarizeWarranty} from "./warranty";

test("shop warranty parser requires explicit store warranty wording and supports common Chinese durations", () => {
  assert.equal(parseStoreWarrantyDays("店保30天，保到手好"), 30);
  assert.equal(parseStoreWarrantyDays("店保三个月"), 90);
  assert.equal(parseStoreWarrantyDays("店保半年"), 180);
  assert.equal(parseStoreWarrantyDays("保到手好"), undefined);
});

test("warranty summary combines factory warranty and store warranty without losing sold duration", () => {
  const summary = summarizeWarranty({saleDate: "2026-10-01", factoryWarrantyDate: "2027-01-01", storeWarrantyDays: 30}, "2026-10-14");
  assert.equal(summary.soldDays, 13);
  assert.equal(summary.status, "在保");
  assert.equal(summary.endDate, "2027-01-01");
  assert.deepEqual(summary.sources, ["出厂保", "店保"]);
  assert.deepEqual(summary.periods.map((period) => [period.source, period.endDate, period.active]), [["出厂保", "2027-01-01", true], ["店保", "2026-10-31", true]]);
  assert.equal(summary.remainingDays, 79);
});

test("expired or absent warranties stay explicit rather than guessing", () => {
  assert.equal(summarizeWarranty({saleDate: "2026-09-01", storeWarrantyDays: 30}, "2026-10-14").status, "过保");
  assert.equal(summarizeWarranty({saleDate: "2026-09-01", aftersalesTerms: "保到手好"}, "2026-10-14").status, "未记录保修期");
});
