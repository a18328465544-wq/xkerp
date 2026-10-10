import type {PoolClient} from "pg";

export const MARKET_QUOTE_CATEGORY_SCHEMA_VERSION = "market-quote-categories-v1";

export const MARKET_QUOTE_CATEGORY_SCHEMA_SQL = `
  CREATE TABLE IF NOT EXISTS gpu_market_quote_categories (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL,
    name TEXT NOT NULL,
    normalized_name TEXT NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_by TEXT,
    updated_by TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );

  CREATE UNIQUE INDEX IF NOT EXISTS gpu_market_quote_categories_name_uq
    ON gpu_market_quote_categories (tenant_id, normalized_name);
  CREATE INDEX IF NOT EXISTS gpu_market_quote_categories_active_idx
    ON gpu_market_quote_categories (tenant_id, is_active, sort_order, name);

  INSERT INTO gpu_schema_migrations (version)
  VALUES ('${MARKET_QUOTE_CATEGORY_SCHEMA_VERSION}')
  ON CONFLICT (version) DO NOTHING;
`;

export async function applyMarketQuoteCategorySchema(client: PoolClient) {
  await client.query(MARKET_QUOTE_CATEGORY_SCHEMA_SQL);
}
