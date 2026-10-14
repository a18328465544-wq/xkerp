import "dotenv/config";
import {Pool} from "pg";
import {installDatabasePoolSafety} from "./dbPoolSafety.ts";
import {inventoryCategoryDifferences} from "./inventoryCategoryRead.ts";

// Do not import db.ts/store.ts: their initialization can create schema/accounts.
async function main() {
  if (process.argv.length !== 3 || process.argv[2] !== "--read-only") throw new Error("Only --read-only is supported");
  const connectionString = process.env.NODE_ENV === "test" ? process.env.TEST_DATABASE_URL : process.env.DATABASE_URL;
  if (!connectionString || process.env.NODE_ENV === "test" && connectionString === process.env.DATABASE_URL) throw new Error("An explicit audit database is required");
  const pool = new Pool({connectionString, max: 1, connectionTimeoutMillis: 8000,
    ssl: (process.env.NODE_ENV === "test" ? process.env.TEST_DATABASE_SSL : process.env.DATABASE_SSL) === "true" ? {} : undefined,
    options: "-c default_transaction_read_only=on -c statement_timeout=15000 -c lock_timeout=2000",
    application_name: "erp-inventory-category-readonly-audit"});
  installDatabasePoolSafety(pool);
  try {
    const client = await pool.connect();
    try {
      await client.query("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY");
      const check = await client.query<{read_only: string}>("SELECT current_setting('transaction_read_only') AS read_only");
      if (check.rows[0]?.read_only !== "on") throw new Error("Read-only enforcement failed");
      for (const table of ["gpu_inventory", "gpu_products"]) {
        const count = await client.query<{count: string}>(`SELECT COUNT(*)::text AS count FROM ${table}`);
        if (Number(count.rows[0]?.count) > 100_000) throw new Error("Audit row budget exceeded");
      }
      type InventoryRow = {id: string; tenant_id: string; store_id: string; productId: string; productName: string; category: string | null};
      type ProductRow = {id: string; tenant_id: string; store_id: string; category: string | null};
      const inventory = await client.query<InventoryRow>(`SELECT id, tenant_id, store_id, data->>'productId' AS "productId", data->>'productName' AS "productName", data->>'category' AS category FROM gpu_inventory ORDER BY tenant_id, store_id, id`);
      const products = await client.query<ProductRow>("SELECT id, tenant_id, store_id, data->>'category' AS category FROM gpu_products ORDER BY tenant_id, store_id, id");
      const scopeKey = (row: {tenant_id: string; store_id: string}) => JSON.stringify([row.tenant_id, row.store_id]);
      const scopedProducts = new Map<string, ProductRow[]>();
      for (const product of products.rows) {
        const key = scopeKey(product);
        const values = scopedProducts.get(key) || [];
        values.push(product);
        scopedProducts.set(key, values);
      }
      const scopedInventory = new Map<string, InventoryRow[]>();
      for (const card of inventory.rows) {
        const key = scopeKey(card);
        const values = scopedInventory.get(key) || [];
        values.push(card);
        scopedInventory.set(key, values);
      }
      const reports = [...scopedInventory.entries()].map(([scope, cards]) => ({scope: JSON.parse(scope) as [string, string],
        differences: inventoryCategoryDifferences(cards, scopedProducts.get(scope) || [])}));
      await client.query("ROLLBACK");
      console.log(JSON.stringify({readOnly: true, inventoryCount: inventory.rows.length, reports,
        limitations: ["相同错误分类不会通过名称猜测修正；缺少档案的记录须人工核对。", "未改写库存、商品、历史单据、SN 或金额。"]}));
    } finally { client.release(true); }
  } finally { await pool.end(); }
}
main().catch(() => {console.error("分类只读核查失败；请检查数据库配置、连接及记录数量。未执行分类修正。"); process.exitCode = 1;});
