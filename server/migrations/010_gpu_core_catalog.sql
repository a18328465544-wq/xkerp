-- Additive only. Run after the existing foundation migrations; never rewrites products or stock.
BEGIN;
CREATE TABLE IF NOT EXISTS gpu_core_catalog (
  tenant_id TEXT NOT NULL, store_id TEXT NOT NULL, id TEXT NOT NULL,
  data JSONB NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), PRIMARY KEY (tenant_id, store_id, id)
);
CREATE INDEX IF NOT EXISTS gpu_core_catalog_tenant_store_idx ON gpu_core_catalog (tenant_id, store_id);
INSERT INTO gpu_schema_migrations (version) VALUES ('gpu-core-catalog-v1') ON CONFLICT (version) DO NOTHING;
COMMIT;
-- Application rollback: leave this additive table intact and retain its data. Do not DROP it.
