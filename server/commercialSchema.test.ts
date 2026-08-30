import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { COMMERCIAL_COLLECTION_TABLES, COMMERCIAL_FOUNDATION_SCHEMA_VERSION, COMMERCIAL_FOUNDATION_SQL, COMMERCIAL_HARDENING_SCHEMA_VERSION, COMMERCIAL_HARDENING_SQL } from "./commercialSchema.ts";

test("commercial foundation creates tenant, store, membership, subscription and usage controls", () => {
  for (const table of ["gpu_tenants", "gpu_stores", "gpu_tenant_memberships", "gpu_subscriptions", "gpu_usage_counters", "gpu_tenant_exports"]) {
    assert.match(COMMERCIAL_FOUNDATION_SQL, new RegExp(`CREATE TABLE IF NOT EXISTS ${table}`));
  }
  assert.match(COMMERCIAL_FOUNDATION_SQL, /tenant_id TEXT/);
  assert.match(COMMERCIAL_FOUNDATION_SQL, /custom_permissions JSONB NOT NULL DEFAULT '\[\]'::jsonb/);
  assert.match(COMMERCIAL_FOUNDATION_SQL, /jsonb_typeof\(custom_permissions\) <> 'array'/);
  assert.match(COMMERCIAL_FOUNDATION_SQL, /ALTER TABLE gpu_sessions ADD COLUMN IF NOT EXISTS tenant_id/);
  assert.match(COMMERCIAL_FOUNDATION_SQL, /ALTER TABLE gpu_sessions ADD COLUMN IF NOT EXISTS store_id/);
  assert.match(COMMERCIAL_FOUNDATION_SQL, new RegExp(COMMERCIAL_FOUNDATION_SCHEMA_VERSION));
  assert.doesNotMatch(COMMERCIAL_FOUNDATION_SQL, /DROP CONSTRAINT|DROP TABLE|DROP COLUMN/i);
});

test("operator commercial migration mirrors all legacy collection scopes", () => {
  const operatorSql = readFileSync(new URL("./migrations/004_commercial_foundation.sql", import.meta.url), "utf8");
  for (const table of COMMERCIAL_COLLECTION_TABLES) {
    assert.match(operatorSql, new RegExp(table), `operator SQL is missing ${table}`);
  }
  assert.match(operatorSql, new RegExp(COMMERCIAL_FOUNDATION_SCHEMA_VERSION));
  assert.match(operatorSql, /gpu_tenant_memberships/);
  assert.match(operatorSql, /custom_permissions JSONB NOT NULL DEFAULT '\[\]'::jsonb/);
  assert.match(operatorSql, /jsonb_typeof\(custom_permissions\) <> 'array'/);
});

test("commercial hardening provides tenant-scoped replay and inventory occupancy", () => {
  assert.match(COMMERCIAL_HARDENING_SQL, /gpu_idempotency_keys/);
  assert.match(COMMERCIAL_HARDENING_SQL, /PRIMARY KEY \(tenant_id, idempotency_key, route\)/);
  assert.match(COMMERCIAL_HARDENING_SQL, /gpu_inventory_reservations_active_idx/);
  assert.match(COMMERCIAL_HARDENING_SQL, /status IN \('reserved', 'consumed'\)/);
  assert.match(COMMERCIAL_HARDENING_SQL, /gpu_daily_notifications.*tenant_id/s);
  assert.match(COMMERCIAL_HARDENING_SQL, /PRIMARY KEY \(tenant_id, store_id, report_date, notification_type\)/);
  assert.match(COMMERCIAL_HARDENING_SQL, /gpu_daily_closings.*store_id/s);
  assert.match(COMMERCIAL_HARDENING_SQL, new RegExp(COMMERCIAL_HARDENING_SCHEMA_VERSION));
  const operatorSql = readFileSync(new URL("./migrations/005_commercial_hardening.sql", import.meta.url), "utf8");
  assert.match(operatorSql, new RegExp(COMMERCIAL_HARDENING_SCHEMA_VERSION));
  assert.match(operatorSql, /gpu_inventory_reservations/);
  assert.match(operatorSql, /gpu_daily_closings.*store_id/s);
});
