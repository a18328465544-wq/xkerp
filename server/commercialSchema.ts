import type { PoolClient } from "pg";
import {
  COMMERCIAL_PLAN_DEFAULTS,
  DEFAULT_CURRENCY,
  DEFAULT_STORE_ID,
  DEFAULT_STORE_NAME,
  DEFAULT_STORE_TIMEZONE,
  DEFAULT_TENANT_ID,
  DEFAULT_TENANT_NAME,
  DEFAULT_TENANT_SLUG,
} from "./commercialConstants.ts";

export const COMMERCIAL_FOUNDATION_SCHEMA_VERSION = "commercial-foundation-v1";
export const COMMERCIAL_HARDENING_SCHEMA_VERSION = "commercial-hardening-v1";

// The legacy JSONB collections remain the business source of truth. The
// tenant_id/store_id columns are additive and backfilled before they are made
// mandatory. We intentionally keep the legacy id primary key: ids are
// generated globally today, so changing the key shape would break old
// ON CONFLICT statements and restore files. Scope columns and composite
// indexes make the legacy JSONB collections safe for multiple stores without
// changing the business document shape.
export const COMMERCIAL_COLLECTION_TABLES = [
  "gpu_products",
  "gpu_inventory",
  "gpu_inspections",
  "gpu_purchase_invoices",
  "gpu_sales_invoices",
  "gpu_purchase_commissions",
  "gpu_market_quotes",
  "gpu_aftersales",
  "gpu_customers",
  "gpu_crm_follow_ups",
  "gpu_crm_requirements",
  "gpu_crm_quote_records",
  "gpu_vendors",
  "gpu_logs",
  "gpu_finance_ledger",
  "gpu_settlement_accounts",
  "gpu_settlement_ledger",
  "gpu_payment_in_records",
  "gpu_payment_out_records",
  "gpu_account_transfers",
  "gpu_assembly_operations",
  "gpu_return_orders",
  "gpu_customer_orders",
  "gpu_system_users",
] as const;

const addTenantColumnSql = COMMERCIAL_COLLECTION_TABLES.map((table) => `
  ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS tenant_id TEXT;
  UPDATE ${table} SET tenant_id = '${DEFAULT_TENANT_ID}' WHERE tenant_id IS NULL;
  ALTER TABLE ${table} ALTER COLUMN tenant_id SET NOT NULL;
  ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS store_id TEXT;
  UPDATE ${table}
     SET store_id = COALESCE(NULLIF(BTRIM(data->>'storeId'), ''), '${DEFAULT_STORE_ID}')
   WHERE store_id IS NULL OR BTRIM(store_id) = '';
  ALTER TABLE ${table} ALTER COLUMN store_id SET NOT NULL;
  CREATE INDEX IF NOT EXISTS ${table}_tenant_id_idx ON ${table} (tenant_id);
  CREATE INDEX IF NOT EXISTS ${table}_tenant_store_idx ON ${table} (tenant_id, store_id);
`).join("\n");

// CRM's normalized tables are also tenant-owned. They are maintained by the
// dual-read migration path rather than the legacy JSONB collection writer, so
// keep their scope migration explicit here instead of relying on a wildcard.
const CRM_TENANT_TABLES = [
  "gpu_crm_accounts",
  "gpu_crm_account_roles",
  "gpu_crm_contacts",
  "gpu_crm_account_requirements",
  "gpu_crm_opportunities",
  "gpu_crm_quotes",
  "gpu_crm_quote_items",
  "gpu_crm_followups",
  "gpu_crm_leads",
  "gpu_crm_tasks",
  "gpu_crm_quick_capture_audits",
  "gpu_crm_entity_links",
  "gpu_crm_timeline_events",
  "gpu_crm_legacy_map",
] as const;

const addCrmTenantColumnSql = CRM_TENANT_TABLES.map((table) => `
  ALTER TABLE ${table} ADD COLUMN IF NOT EXISTS tenant_id TEXT;
  UPDATE ${table} SET tenant_id = '${DEFAULT_TENANT_ID}' WHERE tenant_id IS NULL;
  ALTER TABLE ${table} ALTER COLUMN tenant_id SET NOT NULL;
  CREATE INDEX IF NOT EXISTS ${table}_tenant_id_idx ON ${table} (tenant_id);
`).join("\n");

export const COMMERCIAL_FOUNDATION_SQL = `
  CREATE TABLE IF NOT EXISTS gpu_tenants (
    id TEXT PRIMARY KEY,
    slug TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'suspended', 'archived')),
    plan_code TEXT NOT NULL DEFAULT 'pilot' CHECK (plan_code IN ('pilot', 'standard', 'pro', 'enterprise')),
    trial_ends_at TIMESTAMPTZ,
    settings JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );

  CREATE TABLE IF NOT EXISTS gpu_stores (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL REFERENCES gpu_tenants(id) ON DELETE CASCADE,
    code TEXT NOT NULL,
    name TEXT NOT NULL,
    timezone TEXT NOT NULL DEFAULT '${DEFAULT_STORE_TIMEZONE}',
    currency TEXT NOT NULL DEFAULT '${DEFAULT_CURRENCY}',
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (tenant_id, code)
  );

  CREATE TABLE IF NOT EXISTS gpu_tenant_memberships (
    tenant_id TEXT NOT NULL REFERENCES gpu_tenants(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL,
    store_id TEXT NOT NULL REFERENCES gpu_stores(id) ON DELETE CASCADE,
    role TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'invited', 'deactivated')),
    permissions JSONB NOT NULL DEFAULT '{}'::jsonb,
    invited_by TEXT,
    invited_at TIMESTAMPTZ,
    joined_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (tenant_id, user_id, store_id)
  );

  CREATE INDEX IF NOT EXISTS gpu_tenant_memberships_user_idx ON gpu_tenant_memberships (user_id, status);
  CREATE INDEX IF NOT EXISTS gpu_tenant_memberships_store_idx ON gpu_tenant_memberships (tenant_id, store_id, status);

  CREATE TABLE IF NOT EXISTS gpu_subscriptions (
    tenant_id TEXT PRIMARY KEY REFERENCES gpu_tenants(id) ON DELETE CASCADE,
    plan_code TEXT NOT NULL DEFAULT 'pilot' CHECK (plan_code IN ('pilot', 'standard', 'pro', 'enterprise')),
    status TEXT NOT NULL DEFAULT 'trialing' CHECK (status IN ('trialing', 'active', 'past_due', 'canceled')),
    seat_limit INTEGER NOT NULL DEFAULT 3 CHECK (seat_limit > 0),
    media_bytes_limit BIGINT NOT NULL DEFAULT 1000000000 CHECK (media_bytes_limit >= 0),
    ai_tokens_limit BIGINT NOT NULL DEFAULT 100000 CHECK (ai_tokens_limit >= 0),
    current_period_start DATE,
    current_period_end DATE,
    external_customer_id TEXT,
    external_subscription_id TEXT,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );

  CREATE TABLE IF NOT EXISTS gpu_usage_counters (
    tenant_id TEXT NOT NULL REFERENCES gpu_tenants(id) ON DELETE CASCADE,
    metric TEXT NOT NULL,
    period_start DATE NOT NULL,
    quantity NUMERIC(20, 3) NOT NULL DEFAULT 0 CHECK (quantity >= 0),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (tenant_id, metric, period_start)
  );

  CREATE TABLE IF NOT EXISTS gpu_tenant_exports (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL REFERENCES gpu_tenants(id) ON DELETE CASCADE,
    requested_by TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued', 'running', 'completed', 'failed', 'expired')),
    format TEXT NOT NULL DEFAULT 'json' CHECK (format IN ('json', 'csv')),
    file_path TEXT,
    error_message TEXT,
    requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMPTZ,
    expires_at TIMESTAMPTZ,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb
  );

  CREATE INDEX IF NOT EXISTS gpu_tenant_exports_tenant_status_idx ON gpu_tenant_exports (tenant_id, status, requested_at DESC);

  CREATE TABLE IF NOT EXISTS gpu_tenant_settings (
    tenant_id TEXT PRIMARY KEY REFERENCES gpu_tenants(id) ON DELETE CASCADE,
    "current_role" TEXT,
    custom_permissions JSONB NOT NULL DEFAULT '[]'::jsonb,
    commission_rules JSONB NOT NULL DEFAULT '{}'::jsonb,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
  );

  -- Early commercial foundation builds used an object JSONB default for this
  -- array-valued setting.  Normalize only malformed values to role defaults;
  -- valid customized arrays are preserved.
  ALTER TABLE gpu_tenant_settings
    ALTER COLUMN custom_permissions SET DEFAULT '[]'::jsonb;
  UPDATE gpu_tenant_settings
     SET custom_permissions = '[]'::jsonb
   WHERE jsonb_typeof(custom_permissions) <> 'array';

  CREATE TABLE IF NOT EXISTS gpu_inspection_versions (
    tenant_id TEXT NOT NULL REFERENCES gpu_tenants(id) ON DELETE CASCADE,
    inspection_id TEXT NOT NULL,
    record_version INTEGER NOT NULL CHECK (record_version > 0),
    data JSONB NOT NULL,
    recorded_by TEXT,
    recorded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (tenant_id, inspection_id, record_version)
  );

  CREATE INDEX IF NOT EXISTS gpu_inspection_versions_lookup_idx
    ON gpu_inspection_versions (tenant_id, inspection_id, recorded_at DESC);

  INSERT INTO gpu_tenants (id, slug, name, status, plan_code)
  VALUES ('${DEFAULT_TENANT_ID}', '${DEFAULT_TENANT_SLUG}', '${DEFAULT_TENANT_NAME}', 'active', 'pilot')
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO gpu_stores (id, tenant_id, code, name, timezone, currency)
  VALUES ('${DEFAULT_STORE_ID}', '${DEFAULT_TENANT_ID}', 'MAIN', '${DEFAULT_STORE_NAME}', '${DEFAULT_STORE_TIMEZONE}', '${DEFAULT_CURRENCY}')
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO gpu_subscriptions (tenant_id, plan_code, status, seat_limit, media_bytes_limit, ai_tokens_limit)
  VALUES ('${DEFAULT_TENANT_ID}', 'pilot', 'trialing', ${COMMERCIAL_PLAN_DEFAULTS.pilot.seatLimit}, ${COMMERCIAL_PLAN_DEFAULTS.pilot.mediaBytesLimit}, ${COMMERCIAL_PLAN_DEFAULTS.pilot.aiTokensLimit})
  ON CONFLICT (tenant_id) DO NOTHING;

  INSERT INTO gpu_tenant_settings (tenant_id, "current_role", custom_permissions, commission_rules)
  VALUES ('${DEFAULT_TENANT_ID}', NULL, '[]'::jsonb, '{}'::jsonb)
  ON CONFLICT (tenant_id) DO NOTHING;

  ${addTenantColumnSql}

  ${addCrmTenantColumnSql}

  -- Backfill one immutable baseline for existing inspection records. Future
  -- create/update commands append revisions through the transaction hook.
  INSERT INTO gpu_inspection_versions (tenant_id, inspection_id, record_version, data, recorded_by, recorded_at)
  SELECT tenant_id, id,
         GREATEST(CASE WHEN COALESCE(data->>'recordVersion', '') ~ '^[0-9]+$' THEN (data->>'recordVersion')::integer ELSE 1 END, 1), data,
         COALESCE(data->>'inspector', data->>'handler'), created_at
    FROM gpu_inspections
   WHERE tenant_id IS NOT NULL
  ON CONFLICT (tenant_id, inspection_id, record_version) DO NOTHING;

  ALTER TABLE gpu_sessions ADD COLUMN IF NOT EXISTS tenant_id TEXT;
  UPDATE gpu_sessions SET tenant_id = '${DEFAULT_TENANT_ID}' WHERE tenant_id IS NULL;
  ALTER TABLE gpu_sessions ALTER COLUMN tenant_id SET NOT NULL;
  ALTER TABLE gpu_sessions ADD COLUMN IF NOT EXISTS store_id TEXT;
  UPDATE gpu_sessions SET store_id = '${DEFAULT_STORE_ID}' WHERE store_id IS NULL;
  ALTER TABLE gpu_sessions ALTER COLUMN store_id SET NOT NULL;
  CREATE INDEX IF NOT EXISTS gpu_sessions_tenant_idx ON gpu_sessions (tenant_id, expires_at);

  ALTER TABLE gpu_media_assets ADD COLUMN IF NOT EXISTS tenant_id TEXT;
  UPDATE gpu_media_assets SET tenant_id = '${DEFAULT_TENANT_ID}' WHERE tenant_id IS NULL;
  ALTER TABLE gpu_media_assets ALTER COLUMN tenant_id SET NOT NULL;
  CREATE INDEX IF NOT EXISTS gpu_media_assets_tenant_idx ON gpu_media_assets (tenant_id, created_at DESC);
  DROP INDEX IF EXISTS gpu_media_assets_sha256_idx;
  CREATE UNIQUE INDEX IF NOT EXISTS gpu_media_assets_tenant_sha256_idx ON gpu_media_assets (tenant_id, sha256);

  ALTER TABLE gpu_media_relations ADD COLUMN IF NOT EXISTS tenant_id TEXT;
  UPDATE gpu_media_relations SET tenant_id = '${DEFAULT_TENANT_ID}' WHERE tenant_id IS NULL;
  ALTER TABLE gpu_media_relations ALTER COLUMN tenant_id SET NOT NULL;
  CREATE INDEX IF NOT EXISTS gpu_media_relations_tenant_idx ON gpu_media_relations (tenant_id, entity_type, entity_id);

  INSERT INTO gpu_tenant_memberships (tenant_id, user_id, store_id, role, status, joined_at)
  SELECT '${DEFAULT_TENANT_ID}', id, '${DEFAULT_STORE_ID}', COALESCE(data->>'role', '店员'), 'active', NOW()
  FROM gpu_system_users
  ON CONFLICT (tenant_id, user_id, store_id) DO UPDATE SET role = EXCLUDED.role, status = 'active', updated_at = NOW();

  INSERT INTO gpu_schema_migrations (version)
  VALUES ('${COMMERCIAL_FOUNDATION_SCHEMA_VERSION}')
  ON CONFLICT (version) DO NOTHING;
`;

/**
 * P0/P1 consistency controls are additive to the foundation migration.  Keeping
 * them in a second idempotent migration allows existing installations to roll
 * forward without rewriting legacy JSONB identifiers or business rows.
 */
export const COMMERCIAL_HARDENING_SQL = `
  CREATE TABLE IF NOT EXISTS gpu_idempotency_keys (
    tenant_id TEXT NOT NULL REFERENCES gpu_tenants(id) ON DELETE CASCADE,
    idempotency_key TEXT NOT NULL,
    route TEXT NOT NULL,
    request_hash TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'processing' CHECK (status IN ('processing', 'completed')),
    response_status INTEGER,
    response JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    completed_at TIMESTAMPTZ,
    expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '24 hours'),
    PRIMARY KEY (tenant_id, idempotency_key, route)
  );

  CREATE INDEX IF NOT EXISTS gpu_idempotency_keys_expiry_idx
    ON gpu_idempotency_keys (tenant_id, expires_at);

  CREATE TABLE IF NOT EXISTS gpu_inventory_reservations (
    id TEXT PRIMARY KEY,
    tenant_id TEXT NOT NULL REFERENCES gpu_tenants(id) ON DELETE CASCADE,
    inventory_id TEXT NOT NULL,
    reservation_key TEXT NOT NULL,
    invoice_id TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('reserved', 'consumed', 'released')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ,
    released_at TIMESTAMPTZ
  );

  CREATE UNIQUE INDEX IF NOT EXISTS gpu_inventory_reservations_active_idx
    ON gpu_inventory_reservations (tenant_id, inventory_id)
    WHERE status IN ('reserved', 'consumed');
  CREATE INDEX IF NOT EXISTS gpu_inventory_reservations_invoice_idx
    ON gpu_inventory_reservations (tenant_id, invoice_id, status);

  -- The original scheduler table predated tenancy. Additive columns plus a
  -- composite key prevent one tenant's report claim from suppressing another's.
  ALTER TABLE gpu_daily_notifications ADD COLUMN IF NOT EXISTS tenant_id TEXT;
  UPDATE gpu_daily_notifications SET tenant_id = '${DEFAULT_TENANT_ID}' WHERE tenant_id IS NULL;
  ALTER TABLE gpu_daily_notifications ALTER COLUMN tenant_id SET NOT NULL;
  ALTER TABLE gpu_daily_notifications ADD COLUMN IF NOT EXISTS store_id TEXT;
  UPDATE gpu_daily_notifications SET store_id = '${DEFAULT_STORE_ID}' WHERE store_id IS NULL;
  ALTER TABLE gpu_daily_notifications ALTER COLUMN store_id SET NOT NULL;
  ALTER TABLE gpu_daily_notifications DROP CONSTRAINT IF EXISTS gpu_daily_notifications_pkey;
  DO $$
  BEGIN
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conrelid = 'gpu_daily_notifications'::regclass
        AND contype = 'p'
    ) THEN
      ALTER TABLE gpu_daily_notifications ADD PRIMARY KEY (tenant_id, store_id, report_date, notification_type);
    END IF;
  END $$;
  CREATE INDEX IF NOT EXISTS gpu_daily_notifications_tenant_idx
    ON gpu_daily_notifications (tenant_id, store_id, report_date DESC);

  -- Daily closing snapshots are store facts.  The table predates tenancy, so
  -- backfill the default scope before replacing its single-column key.
  ALTER TABLE gpu_daily_closings ADD COLUMN IF NOT EXISTS tenant_id TEXT;
  UPDATE gpu_daily_closings SET tenant_id = '${DEFAULT_TENANT_ID}' WHERE tenant_id IS NULL;
  ALTER TABLE gpu_daily_closings ALTER COLUMN tenant_id SET NOT NULL;
  ALTER TABLE gpu_daily_closings ADD COLUMN IF NOT EXISTS store_id TEXT;
  UPDATE gpu_daily_closings SET store_id = '${DEFAULT_STORE_ID}' WHERE store_id IS NULL;
  ALTER TABLE gpu_daily_closings ALTER COLUMN store_id SET NOT NULL;
  ALTER TABLE gpu_daily_closings DROP CONSTRAINT IF EXISTS gpu_daily_closings_pkey;
  DO $$
  BEGIN
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint
      WHERE conrelid = 'gpu_daily_closings'::regclass AND contype = 'p'
    ) THEN
      ALTER TABLE gpu_daily_closings ADD PRIMARY KEY (tenant_id, store_id, date);
    END IF;
  END $$;
  CREATE INDEX IF NOT EXISTS gpu_daily_closings_scope_idx
    ON gpu_daily_closings (tenant_id, store_id, date DESC);

  INSERT INTO gpu_inventory_reservations (id, tenant_id, inventory_id, reservation_key, invoice_id, status, created_at)
  SELECT DISTINCT ON (s.tenant_id, item.inventory_id)
         'legacy-reservation-' || md5(s.tenant_id || ':' || item.inventory_id),
         s.tenant_id, item.inventory_id, 'legacy:' || s.id, s.id, 'consumed', s.created_at
    FROM gpu_sales_invoices s
    CROSS JOIN LATERAL jsonb_to_recordset(COALESCE(s.data->'items', '[]'::jsonb)) AS item(inventory_id TEXT)
   WHERE s.tenant_id IS NOT NULL
     AND COALESCE(s.data->>'outboundStatus', '') = '已出库'
     AND NULLIF(item.inventory_id, '') IS NOT NULL
   ORDER BY s.tenant_id, item.inventory_id, s.created_at ASC, s.id ASC
  ON CONFLICT DO NOTHING;

  INSERT INTO gpu_schema_migrations (version)
  VALUES ('${COMMERCIAL_HARDENING_SCHEMA_VERSION}')
  ON CONFLICT (version) DO NOTHING;
`;

export async function applyCommercialFoundationSchema(client: PoolClient) {
  await client.query(COMMERCIAL_FOUNDATION_SQL);
}

export async function applyCommercialHardeningSchema(client: PoolClient) {
  await client.query(COMMERCIAL_HARDENING_SQL);
}
