export const PRODUCT_BRAND_SCHEMA_VERSION = "product-brand-catalog-v1";
export const PRODUCT_BRAND_TABLE_SQL = `
  CREATE TABLE IF NOT EXISTS gpu_product_brands (
    tenant_id TEXT NOT NULL, store_id TEXT NOT NULL, id TEXT NOT NULL,
    data JSONB NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), PRIMARY KEY (tenant_id, store_id, id)
  );
`;
export const PRODUCT_BRAND_SCHEMA_SQL = `${PRODUCT_BRAND_TABLE_SQL}
  CREATE INDEX IF NOT EXISTS gpu_product_brands_tenant_store_idx ON gpu_product_brands (tenant_id, store_id);
  INSERT INTO gpu_schema_migrations (version) VALUES ('${PRODUCT_BRAND_SCHEMA_VERSION}') ON CONFLICT (version) DO NOTHING;
`;
