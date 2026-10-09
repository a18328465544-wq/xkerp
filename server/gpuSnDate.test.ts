import assert from "node:assert/strict";
import test from "node:test";
import {GPU_SN_BRANDS, parseGpuSnDate} from "./gpuSnDate.ts";

const now = new Date("2026-10-09T00:00:00.000Z");

test("MSI official SB + YYMM sample produces a month range and marks it as an estimate", () => {
  const result = parseGpuSnDate({brandId: "msi", sn: "602-V308-02SB1401012951", productModel: "R9 290 GAMING 4G", now});
  assert.equal(result.status, "parsed");
  assert.equal(result.year, 2014);
  assert.equal(result.month, 1);
  assert.deepEqual(result.dateRange, {start: "2014-01-01", end: "2014-01-31"});
  assert.equal(result.officialConfirmed, false);
  assert.equal(result.sources[0]?.evidence, "official");
});

test("MSI SD is community-only and impossible months are rejected", () => {
  const community = parseGpuSnDate({brandId: "msi", sn: "602-V317-03SD1409XXXX", now});
  assert.equal(community.status, "parsed");
  assert.equal(community.confidence, "low");
  assert.equal(community.sources[0]?.evidence, "community");
  assert.equal(parseGpuSnDate({brandId: "msi", sn: "602-V317-03SB2513XXXX", now}).status, "invalid");
  const futureMonth = parseGpuSnDate({brandId: "msi", sn: "602-V317-03SB2611XXXX", now});
  assert.equal(futureMonth.status, "invalid");
  assert.equal(futureMonth.dateRange, null);
  for (const productModel of ["RTX 4090", "RTX 4090D", "RTX 5090"]) {
    assert.equal(parseGpuSnDate({brandId: "msi", sn: "602-V317-03SB2509XXXX", productModel, now}).status, "unsupported", productModel);
  }
  assert.equal(parseGpuSnDate({brandId: "msi", sn: "602-V317-03SB2509XXXX", now}).status, "unsupported");
  const ambiguousYear = parseGpuSnDate({brandId: "msi", sn: "602-V317-03SB2701XXXX", now});
  assert.equal(ambiguousYear.status, "unsupported");
  assert.equal(ambiguousYear.dateRange, null);
});

test("Gigabyte SN + YYWW produces an ISO production week for legacy and current GPU models", () => {
  const historic = parseGpuSnDate({brandId: "gigabyte", sn: "GV-N2080-SN080500084640", now});
  assert.equal(historic.status, "parsed");
  assert.equal(historic.year, 2008);
  assert.equal(historic.week, 5);
  assert.deepEqual(historic.dateRange, {start: "2008-01-28", end: "2008-02-03"});

  for (const productModel of ["RTX 4090", "RTX 4090D"]) {
    const pending = parseGpuSnDate({brandId: "gigabyte", sn: "GV-RTX-SN251500084640", productModel, now});
    assert.equal(pending.status, "unsupported", productModel);
    assert.equal(pending.dateRange, null, productModel);
  }
  const current = parseGpuSnDate({brandId: "gigabyte", sn: "GV-RTX-SN251500084640", productModel: "RTX 5090", now});
  assert.equal(current.status, "parsed");
  assert.equal(current.year, 2025);
  assert.equal(current.week, 15);
  assert.equal(current.confidence, "low");
  assert.equal(current.sources.at(-1)?.evidence, "community");
  for (const productModel of [undefined, "RTX 4080", "RTX 5070"]) {
    const pending = parseGpuSnDate({brandId: "gigabyte", sn: "GV-SN250500084640", productModel, now});
    assert.equal(pending.status, "unsupported", productModel || "missing model");
    assert.equal(pending.dateRange, null, productModel || "missing model");
  }
  assert.equal(parseGpuSnDate({brandId: "gigabyte", sn: "GV-RTX-SN251600084640", productModel: "RTX 5090", now}).status, "unsupported");
  const ambiguousYear = parseGpuSnDate({brandId: "gigabyte", sn: "GV-SN2705-000", now});
  assert.equal(ambiguousYear.status, "unsupported");
  assert.equal(ambiguousYear.dateRange, null);
});

test("invalid or future Gigabyte week encodings never return a parsed date", () => {
  assert.equal(parseGpuSnDate({brandId: "gigabyte", sn: "GV-SN2153-000", now}).status, "invalid");
  assert.equal(parseGpuSnDate({brandId: "gigabyte", sn: "GV-SN2654-000", now}).status, "invalid");
  assert.equal(parseGpuSnDate({brandId: "gigabyte", sn: "GV-SN2652-000", now: new Date("2026-01-01T00:00:00Z")}).status, "invalid");
  assert.equal(parseGpuSnDate({brandId: "gigabyte", sn: "GV-SN2652-000", now: new Date("2026-01-01T00:00:00Z")}).dateRange, null);
});

test("ASUS exposes its month but does not guess the missing decade", () => {
  const result = parseGpuSnDate({brandId: "asus", sn: "6112345678", now});
  assert.equal(result.status, "partial");
  assert.equal(result.year, null);
  assert.equal(result.month, 1);
  assert.equal(result.dateRange, null);
  assert.match(result.explanation, /无法.*唯一确定/);
  assert.equal(parseGpuSnDate({brandId: "asus", sn: "6D12345678", now}).status, "invalid");
});

test("brands without a verified public serial rule stay unsupported", () => {
  const pendingBrands = GPU_SN_BRANDS.filter((brand) => !["asus", "msi", "gigabyte"].includes(brand.id));
  assert.equal(pendingBrands.length, 9);
  for (const brand of pendingBrands) {
    for (const productModel of ["RTX 4090", "RTX 4090D", "RTX 5090"]) {
      const result = parseGpuSnDate({brandId: brand.id, sn: "ABCDEF123456", productModel, now});
      assert.equal(result.status, "unsupported", `${brand.name} ${productModel}`);
      assert.equal(result.dateRange, null, `${brand.name} ${productModel}`);
      assert.ok(result.officialUrl, brand.name);
    }
  }
});

test("unknown brands and malformed serials are rejected", () => {
  assert.throws(() => parseGpuSnDate({brandId: "unknown", sn: "SN123456", now}), /不支持/);
  assert.equal(parseGpuSnDate({brandId: "msi", sn: "!", now}).status, "invalid");
  assert.equal(parseGpuSnDate({brandId: "gigabyte", sn: "NO-CODE-000", now}).status, "invalid");
});
