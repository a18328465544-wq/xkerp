-- Add tenant/store query scope to the new inventory stocktake JSONB collection.
-- Existing IDs and stock facts remain unchanged; legacy rows receive the default scope.
BEGIN;
ALTER TABLE gpu_inventory_stocktakes ADD COLUMN IF NOT EXISTS tenant_id TEXT;
UPDATE gpu_inventory_stocktakes
   SET tenant_id = 'tenant_default'
 WHERE tenant_id IS NULL;
ALTER TABLE gpu_inventory_stocktakes ALTER COLUMN tenant_id SET NOT NULL;

ALTER TABLE gpu_inventory_stocktakes ADD COLUMN IF NOT EXISTS store_id TEXT;
UPDATE gpu_inventory_stocktakes
   SET store_id = COALESCE(NULLIF(BTRIM(data->>'storeId'), ''), 'store_default')
 WHERE store_id IS NULL OR BTRIM(store_id) = '';
ALTER TABLE gpu_inventory_stocktakes ALTER COLUMN store_id SET NOT NULL;

CREATE INDEX IF NOT EXISTS gpu_inventory_stocktakes_tenant_id_idx
  ON gpu_inventory_stocktakes (tenant_id);
CREATE INDEX IF NOT EXISTS gpu_inventory_stocktakes_tenant_store_idx
  ON gpu_inventory_stocktakes (tenant_id, store_id);

INSERT INTO gpu_schema_migrations (version)
VALUES ('inventory-stocktakes-scope-v1')
ON CONFLICT (version) DO NOTHING;
COMMIT;
