export const GPU_CORE_SCHEMA_VERSION = "gpu-core-catalog-v1";
export const GPU_CORE_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS gpu_core_catalog (
    tenant_id TEXT NOT NULL, store_id TEXT NOT NULL, id TEXT NOT NULL,
    data JSONB NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), PRIMARY KEY (tenant_id, store_id, id)
  );
`;
export const GPU_CORE_SCHEMA_SQL = `${GPU_CORE_TABLE_SQL}
  CREATE INDEX IF NOT EXISTS gpu_core_catalog_tenant_store_idx ON gpu_core_catalog (tenant_id, store_id);
  INSERT INTO gpu_schema_migrations (version) VALUES ('${GPU_CORE_SCHEMA_VERSION}') ON CONFLICT (version) DO NOTHING;
`;
