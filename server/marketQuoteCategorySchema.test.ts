import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import test from "node:test";
import {MARKET_QUOTE_CATEGORY_SCHEMA_SQL, MARKET_QUOTE_CATEGORY_SCHEMA_VERSION} from "./marketQuoteCategorySchema.ts";

test("market quote category operator migration matches the application schema", () => {
  const migration = readFileSync(new URL("./migrations/009_market_quote_categories.sql", import.meta.url), "utf8");
  for (const objectName of ["gpu_market_quote_categories", "gpu_market_quote_categories_name_uq", "gpu_market_quote_categories_active_idx"]) {
    assert.match(MARKET_QUOTE_CATEGORY_SCHEMA_SQL, new RegExp(objectName));
    assert.match(migration, new RegExp(objectName));
  }
  assert.match(MARKET_QUOTE_CATEGORY_SCHEMA_SQL, new RegExp(MARKET_QUOTE_CATEGORY_SCHEMA_VERSION));
  assert.match(migration, new RegExp(MARKET_QUOTE_CATEGORY_SCHEMA_VERSION));
});
