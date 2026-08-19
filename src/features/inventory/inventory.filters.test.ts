import assert from "node:assert/strict";
import test from "node:test";
import {defaultInventoryFilters, inventoryFiltersToSearch, parseInventoryFilters} from "./inventory.filters";
import {toInventoryQueryParams} from "@/src/services/api/endpoints/inventory";

test("inventory URL filters round-trip without losing supported state", () => {
  const next = {...defaultInventoryFilters, keyword: "SN4090", brand: "华硕", status: "待检测", page: 3, pageSize: 50, includeSold: true, sortKey: "days" as const, sortDirection: "asc" as const};
  const parsed = parseInventoryFilters(`?${inventoryFiltersToSearch(next).toString()}`);
  assert.equal(parsed.keyword, "SN4090");
  assert.equal(parsed.brand, "华硕");
  assert.equal(parsed.status, "待检测");
  assert.equal(parsed.page, 3);
  assert.equal(parsed.pageSize, 50);
  assert.equal(parsed.includeSold, true);
  assert.equal(parsed.sortKey, "days");
  assert.equal(parsed.sortDirection, "asc");
});

test("inventory API query only sends capabilities supported by FastAPI", () => {
  const params = toInventoryQueryParams({...defaultInventoryFilters, keyword: "RTX 4090", model: "RTX 4090", condition: "99新", entryStart: "2026-01-01", brand: "华硕", page: 2, pageSize: 50, sortKey: "entryTime", sortDirection: "desc"});
  assert.equal(params.get("keyword"), "RTX 4090");
  assert.equal(params.get("brand"), "华硕");
  assert.equal(params.get("page"), "2");
  assert.equal(params.get("pageSize"), "50");
  assert.equal(params.get("model"), null);
  assert.equal(params.get("condition"), null);
  assert.equal(params.get("entryStart"), null);
});
