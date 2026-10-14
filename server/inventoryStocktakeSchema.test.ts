import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import test from "node:test";
import {INVENTORY_STOCKTAKE_SCOPE_SCHEMA_SQL, INVENTORY_STOCKTAKE_SCOPE_SCHEMA_VERSION} from "./inventoryStocktakeSchema.ts";

test("inventory stocktake scope migration matches the application-owned initializer", () => {
  const operatorSql = readFileSync(new URL("./migrations/012_inventory_stocktakes_scope.sql", import.meta.url), "utf8");
  assert.equal(INVENTORY_STOCKTAKE_SCOPE_SCHEMA_VERSION, "inventory-stocktakes-scope-v1");
  for (const sql of [operatorSql, INVENTORY_STOCKTAKE_SCOPE_SCHEMA_SQL]) {
    assert.match(sql, /ALTER TABLE gpu_inventory_stocktakes ADD COLUMN IF NOT EXISTS tenant_id TEXT/);
    assert.match(sql, /ALTER TABLE gpu_inventory_stocktakes ADD COLUMN IF NOT EXISTS store_id TEXT/);
    assert.match(sql, /SET tenant_id = 'tenant_default'/);
    assert.match(sql, /store_default/);
    assert.match(sql, /gpu_inventory_stocktakes_tenant_store_idx/);
    assert.match(sql, /inventory-stocktakes-scope-v1/);
    assert.doesNotMatch(sql, /DROP TABLE|DELETE FROM gpu_inventory_stocktakes/i);
  }
});
