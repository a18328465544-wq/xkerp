import "dotenv/config";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { Pool, type PoolClient } from "pg";
import { createInitialState, normalizeStateConditions, type AppState } from "./store.ts";
import { hashPassword, isPasswordHash, type PersistedSession, type SessionStore } from "./security.ts";
import type { CommissionMode, DailyClosing, InspectionRecord, SystemUserAccount } from "../src/types.ts";
import { storeDateAfterDays } from "../src/utils/storeTime.ts";
import { applyCrmFoundationSchema } from "./crmSchema.ts";
import { applyOperationalProjectionSchema } from "./operationalSchema.ts";
import { applyCommercialFoundationSchema, applyCommercialHardeningSchema } from "./commercialSchema.ts";
import { DEFAULT_STORE_ID, DEFAULT_TENANT_ID } from "./commercialConstants.ts";
import { getCurrentTenantContext } from "./requestTenantContext.ts";
import { createResilientQueue } from "./resilientQueue.ts";
import { ConflictError } from "./errors.ts";

const DATA_DIR = path.resolve(process.cwd(), "data");
const LEGACY_DATA_FILE = path.join(DATA_DIR, "app-state.json");
const BACKUP_DIR = path.join(DATA_DIR, "backups");

const LEGACY_IMPORT_ENABLED = process.env.POSTGRES_IMPORT_LEGACY_JSON !== "false";

let pool: Pool | null = null;
let initialized = false;
const enqueueStateSave = createResilientQueue();
let processWriteLockDepth = 0;

const STATE_WRITE_LOCK_KEY = "gpu_erp_state_write";
const AUTH_WRITE_LOCK_KEY = "gpu_erp_auth_write";

type CollectionKey = Exclude<keyof AppState, "currentRole" | "customPermissions" | "currentUserId">;
export type StateCollectionKey = CollectionKey;
export type StateRecordSave = { key: CollectionKey; items: unknown[]; deleteMissing?: boolean; deleteIds?: string[] };
export type StateRecordTransactionHook = (client: PoolClient) => void | Promise<unknown>;
export type InventoryPageFilters = {
  tenantId?: string;
  storeId?: string;
  page?: number;
  pageSize?: number;
  keyword?: string;
  status?: string;
  category?: string;
  brand?: string;
  risk?: "mined" | "upturned" | "high";
  minStorageDays?: number;
  maxStorageDays?: number;
  minProfitMargin?: number;
  activeOnly?: boolean;
  warehouseLocation?: string;
  includeSold?: boolean;
  sortKey?: string;
  sortDirection?: "asc" | "desc";
};
export type CollectionPage<T> = { data: T[]; meta: { page: number; pageSize: number; total: number } };
export type LogPageFilters = { tenantId?: string; storeId?: string; page?: number; pageSize?: number; keyword?: string };
export type FinanceRecordPageFilters = {
  tenantId?: string;
  storeId?: string;
  page?: number;
  pageSize?: number;
  keyword?: string;
  accountId?: string;
  handler?: string;
  businessType?: string;
  direction?: string;
  relatedDocNo?: string;
  customerName?: string;
  supplierName?: string;
  dateStart?: string;
  dateEnd?: string;
};
export type FinanceRecordPage<T> = CollectionPage<T> & { meta: CollectionPage<T>["meta"] & { totalAmount?: number } };
export type FinanceProfitFlowFilters = {tenantId?: string; storeId?: string; dateStart?: string; dateEnd?: string};
export type FinanceProfitFlowRow = {date: string; income: number; expense: number; net: number};
export type InvoicePageKind = "purchase" | "sales";
export type InvoicePageFilters = {
  tenantId?: string;
  storeId?: string;
  page?: number;
  pageSize?: number;
  keyword?: string;
  sourceType?: string;
  channel?: string;
  paymentStatus?: string;
  outboundStatus?: string;
  dateStart?: string;
  dateEnd?: string;
  sortKey?: string;
  sortDirection?: "asc" | "desc";
};
export type InvoicePage<T> = CollectionPage<T> & {meta: CollectionPage<T>["meta"] & {summary: Record<string, number>}};
export type CommissionPageFilters = {
  tenantId?: string;
  storeId?: string;
  mode: CommissionMode;
  page?: number;
  pageSize?: number;
  keyword?: string;
  status?: string;
  handler?: string;
  dateStart?: string;
  dateEnd?: string;
  sortKey?: string;
  sortDirection?: "asc" | "desc";
};
export type CommissionPage<T> = CollectionPage<T> & {meta: CollectionPage<T>["meta"] & {summary: Record<string, number>}};
export type AiInsightsCacheRecord = {
  scope: string;
  sourceHash: string;
  payload: unknown;
  generatedAt: string;
  expiresAt: string;
  provider: string;
  model: string;
};
export type AiInsightActionStatus = "done" | "ignored";
export type AiInsightActionRecord = {
  insightId: string;
  status: AiInsightActionStatus;
  updatedBy: string;
  updatedAt: string;
};

function scopedTenantId(tenantId?: string) {
  return tenantId?.trim() || getCurrentTenantContext()?.tenantId || DEFAULT_TENANT_ID;
}

function scopedStoreId(storeId?: string) {
  return storeId?.trim() || getCurrentTenantContext()?.storeId || DEFAULT_STORE_ID;
}

// Auxiliary tables created before tenancy (AI caches/actions and daily-closing
// snapshots) keep their original primary keys for backwards compatibility.
// Prefixing non-default keys gives each tenant an isolated namespace without
// rewriting those tables or changing legacy identifiers returned to clients.
function scopedAuxiliaryKey(value: string, tenantId?: string) {
  const scope = scopedTenantId(tenantId);
  // A caller-controlled auxiliary identifier must not be able to smuggle the
  // namespace delimiter and address another tenant's prefixed row.
  const safeValue = value.replaceAll("::", "%3A%3A");
  return scope === DEFAULT_TENANT_ID ? safeValue : `${scope}::${safeValue}`;
}

const collectionTables: Array<{
  key: CollectionKey;
  table: string;
  tableComment: string;
  dataComment: string;
}> = [
  {
    key: "products",
    table: "gpu_products",
    tableComment: "商品库模板表，保存显卡和其他配件的标准型号、品牌、参考进销价和库存汇总。",
    dataComment: "商品模板 JSON，结构对应 ProductTemplate，包含品类、品牌、型号、版本、显存/规格、参考价格和备注。",
  },
  {
    key: "inventory",
    table: "gpu_inventory",
    tableComment: "单卡与配件库存档案表，保存每一件库存商品的来源、SN、状态、库位和销售关联。",
    dataComment: "库存档案 JSON，结构对应 CardInventory，包含商品信息、SN/快递单号、来源、成本、状态、成色、保修、库位和销售信息。",
  },
  {
    key: "inspections",
    table: "gpu_inspections",
    tableComment: "检测录入记录表，保存显卡和其他配件入库检测结果。",
    dataComment: "检测记录 JSON，结构对应 InspectionRecord，包含库存档案、SN、成色、保修、带盒、最终库位、检测人、检测项和结论。",
  },
  {
    key: "purchaseInvoices",
    table: "gpu_purchase_invoices",
    tableComment: "进货/回收单据表，保存采购、同行拿货和个人回收业务单据。",
    dataComment: "进货单 JSON，结构对应 PurchaseInvoice，包含来源、供应商/个人卖家、快递单号、付款账户、经办人、明细和付款状态。",
  },
  {
    key: "salesInvoices",
    table: "gpu_sales_invoices",
    tableComment: "销售开单与销售出库单据表，保存客户销售、收款和仓库出库联动信息。",
    dataComment: "销售单 JSON，结构对应 SalesInvoice，包含客户、销售商品、收款账户、经办人、物流、锁定库存和出库状态。",
  },
  {
    key: "purchaseCommissions",
    table: "gpu_purchase_commissions",
    tableComment: "进货提成记录表，保存显卡售出后按进货经办人自动计算的毛利提成。",
    dataComment: "进货提成 JSON，结构对应 PurchaseCommissionRecord，包含库存卡、采购单、销售单、进货员工、成交价、成本、毛利、比例和提成金额。",
  },
  {
    key: "marketQuotes",
    table: "gpu_market_quotes",
    tableComment: "行情参考表，保存显卡和配件的市场报价、参考收购价和销售建议价。",
    dataComment: "行情参考 JSON，包含商品型号、平台行情、建议进价、建议售价、更新时间和备注。",
  },
  {
    key: "aftersales",
    table: "gpu_aftersales",
    tableComment: "售后维护记录表，保存售后、维修、退货和风险处理过程。",
    dataComment: "售后记录 JSON，包含关联库存/销售单、问题描述、处理状态、费用、责任人和处理结果。",
  },
  {
    key: "customers",
    table: "gpu_customers",
    tableComment: "个人客户档案表，保存个人买家客户和个人卖家客户资料及交易统计。",
    dataComment: "个人客户 JSON，包含姓名、联系方式、客户类型、来源、跟进人、交易数量、交易金额和常交易型号。",
  },
  {
    key: "crmFollowUps",
    table: "gpu_crm_follow_ups",
    tableComment: "CRM 跟进记录表，保存客户沟通、回访和成交推进记录。",
    dataComment: "CRM 跟进 JSON，包含客户、跟进人、跟进时间、沟通内容、下次跟进时间和结果。",
  },
  {
    key: "crmRequirements",
    table: "gpu_crm_requirements",
    tableComment: "CRM 客户需求表，保存客户求购、预算、偏好型号和成交阶段。",
    dataComment: "CRM 需求 JSON，包含客户、商品需求、预算、平台来源、阶段、负责人和备注。",
  },
  {
    key: "crmQuotes",
    table: "gpu_crm_quote_records",
    tableComment: "CRM 报价单记录表，保存报价单版本、明细、金额、有效期和客户确认状态。",
    dataComment: "CRM 报价单 JSON，包含客户、报价单号、商品明细、合计金额、有效期、状态和备注。",
  },
  {
    key: "vendors",
    table: "gpu_vendors",
    tableComment: "同行档案表，保存上游供应商、下游采购方和核心采购方资料及交易统计。",
    dataComment: "同行档案 JSON，包含商号、联系人、联系方式、同行类型、交易数量、交易金额、常交易型号和备注。",
  },
  {
    key: "logs",
    table: "gpu_logs",
    tableComment: "操作日志表，保存账号在系统中的新增、编辑、删除、扫码、结算等审计记录。",
    dataComment: "操作日志 JSON，包含操作账号、模块、动作、目标单号/SN、变更前后内容和操作时间。",
  },
  {
    key: "financeLedger",
    table: "gpu_finance_ledger",
    tableComment: "财务流水表，保存收款、付款、退款、费用、调拨等财务口径流水。",
    dataComment: "财务流水 JSON，包含业务类型、金额、方向、账户、经办人、关联单据、客户/供应商和复核状态。",
  },
  {
    key: "settlementAccounts",
    table: "gpu_settlement_accounts",
    tableComment: "结算账户表，保存微信、支付宝、银行卡、现金、备用金等账户余额和账户属性。",
    dataComment: "结算账户 JSON，包含账户名称、账户类型、归属人、平台、余额、冻结金额、是否启用和是否允许负数。",
  },
  {
    key: "settlementLedger",
    table: "gpu_settlement_ledger",
    tableComment: "账户流水表，保存每个结算账户的收入、支出、转入、转出和冲销记录。",
    dataComment: "账户流水 JSON，包含流水号、账户、方向、收入/支出金额、变动前后余额、业务类型、关联单据和经办人。",
  },
  {
    key: "paymentInRecords",
    table: "gpu_payment_in_records",
    tableComment: "收款单表，保存客户收款、非经营收入、关联销售单和结算账户入账信息。",
    dataComment: "收款单 JSON，包含客户/来源、收入分类、收款账户、金额、经办人、关联单据或参考号、凭证图片、时间和备注。",
  },
  {
    key: "paymentOutRecords",
    table: "gpu_payment_out_records",
    tableComment: "付款单表，保存供应商/客户付款、非经营支出、关联采购单和结算账户出账信息。",
    dataComment: "付款单 JSON，包含供应商/对象、支出分类、付款账户、金额、经办人、关联单据或参考号、凭证图片、时间和备注。",
  },
  {
    key: "accountTransfers",
    table: "gpu_account_transfers",
    tableComment: "资金调拨单表，保存结算账户之间的转账、手续费和实际到账信息。",
    dataComment: "资金调拨 JSON，包含调拨单号、转出账户、转入账户、金额、手续费、实际到账、经办人和备注。",
  },
  {
    key: "assemblyOperations",
    table: "gpu_assembly_operations",
    tableComment: "组装拆卸单据表，保存拆卸前 SN、拆后配件 SN、组装来源和成品 SN。",
    dataComment: "组装拆卸 JSON，包含操作类型、拆前/拆后 SN、组装来源配件、成品 SN、经办人和操作时间。",
  },
  {
    key: "returnOrders",
    table: "gpu_return_orders",
    tableComment: "退货单据表，保存销售退货、进货退货、退款、抵扣账款和退回库存状态。",
    dataComment: "退货单 JSON，结构对应 ReturnOrder，包含退货类型、关联单据、库存 SN、客户/供应商、退货金额、结算方式、抵扣金额和处理状态。",
  },
  {
    key: "customerOrders",
    table: "gpu_customer_orders",
    tableComment: "客户订单协同主线表，保存客户意向到销售、回收或置换执行过程中的协作上下文。",
    dataComment: "客户订单协同 JSON，结构对应 CustomerOrder，包含统一主状态、当前阻塞任务、负责人、协作者、关联单据引用和跟进事件；金额与库存以关联业务单据为准。",
  },
  {
    key: "systemUsers",
    table: "gpu_system_users",
    tableComment: "系统账号表，保存登录账号、人员名称、账号身份、启用状态、密码哈希和账号权限覆盖。",
    dataComment: "系统账号 JSON，包含用户名、显示姓名、角色身份、启用状态、密码哈希、登录时间和权限覆盖；接口返回时会移除密码哈希。",
  },
];

export function getCollectionTablesForKeys(keys: CollectionKey[]) {
  const requested = new Set(keys);
  return collectionTables
    .filter(({ key }) => requested.has(key))
    .map(({ key, table }) => ({ key, table }));
}

function quoteIdentifier(identifier: string) {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(identifier)) {
    throw new Error(`Invalid SQL identifier: ${identifier}`);
  }
  return `"${identifier}"`;
}

export function buildDeleteMissingRowsQuery(table: string, ids: string[], tenantId?: string, storeId?: string) {
  const storeScope = tenantId ? scopedStoreId(storeId) : undefined;
  const tenantClause = tenantId
    ? ` WHERE tenant_id = $1${storeScope ? " AND store_id = $2" : ""}`
    : "";
  if (ids.length === 0) {
    return {
      sql: `DELETE FROM ${quoteIdentifier(table)}${tenantClause}`,
      values: tenantId ? (storeScope ? [tenantId, storeScope] : [tenantId]) : [] as unknown[],
    };
  }
  const idParam = tenantId ? (storeScope ? "$3" : "$2") : "$1";
  return {
    sql: `DELETE FROM ${quoteIdentifier(table)}${tenantId ? ` WHERE tenant_id = $1${storeScope ? " AND store_id = $2" : ""} AND` : " WHERE"} NOT (id = ANY(${idParam}::text[]))`,
    values: tenantId ? (storeScope ? [tenantId, storeScope, ids] : [tenantId, ids]) : [ids],
  };
}

// Upsert many rows per table in batched multi-row INSERTs instead of one round-trip per row.
// The previous row-by-row loop meant every submit fired N sequential queries (N = table size),
// which made writes — especially the unbounded logs table — slower the more data accumulated.
export const BULK_UPSERT_CHUNK_SIZE = 500;

export async function bulkUpsertRows(client: PoolClient, table: string, rows: { id: string; json: string }[], tenantId?: string, storeId?: string) {
  // Dedupe by id (last write wins) so a multi-row VALUES list never hits the same conflict target
  // twice — Postgres rejects that — and to match the original "last assignment wins" semantics.
  const deduped = new Map<string, string>();
  for (const row of rows) deduped.set(row.id, row.json);
  const list = Array.from(deduped, ([id, json]) => ({ id, json }));

  const quotedTable = quoteIdentifier(table);
  const storeScope = tenantId ? scopedStoreId(storeId) : undefined;
  for (let start = 0; start < list.length; start += BULK_UPSERT_CHUNK_SIZE) {
    const chunk = list.slice(start, start + BULK_UPSERT_CHUNK_SIZE);
    if (tenantId && chunk.length) {
      // Legacy ids are globally primary-keyed.  Never silently turn a
      // cross-tenant collision into a no-op: callers must rotate the id or
      // explicitly migrate the record under the owning tenant.
      const collisions = await client.query<{id: string; tenant_id: string}>(
        `SELECT id, tenant_id FROM ${quotedTable}
          WHERE id = ANY($1::text[]) AND (tenant_id <> $2 OR store_id <> $3)
          LIMIT 1`,
        [chunk.map((row) => row.id), tenantId, storeScope],
      );
      if (collisions.rows[0]) {
        throw new ConflictError(`记录 ${collisions.rows[0].id} 已属于其他企业，禁止跨企业覆盖`);
      }
    }
    const placeholders: string[] = [];
    const params: unknown[] = [];
    chunk.forEach((row, offset) => {
      const base = offset * 2;
      placeholders.push(tenantId
        ? `($${base + 1}, $${base + 2}::jsonb, NOW(), $${chunk.length * 2 + 1}, $${chunk.length * 2 + 2})`
        : `($${base + 1}, $${base + 2}::jsonb, NOW())`);
      params.push(row.id, row.json);
    });
    if (tenantId) params.push(tenantId, storeScope);
    await client.query(
      `INSERT INTO ${quotedTable}${tenantId ? " AS target" : ""} (id, data, updated_at${tenantId ? ", tenant_id, store_id" : ""}) VALUES ${placeholders.join(", ")}
       ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data, updated_at = NOW()${tenantId ? " WHERE target.tenant_id = EXCLUDED.tenant_id AND target.store_id = EXCLUDED.store_id" : ""}`,
      params,
    );
  }
}

// Append-only persistence for immutable collections (audit logs). Rather than rewriting every
// row on each submit, fetch the existing ids (a cheap text-only transfer) and INSERT only the
// new entries, then trim rows that fell out of the capped in-memory buffer. Safe only because
// these records are never edited after creation — existing rows can be skipped entirely.
export async function appendOnlyCollection(
  client: PoolClient,
  table: string,
  items: unknown[],
  tenantId?: string,
  storeId?: string,
) {
  const desired = new Map<string, string>();
  items.forEach((item, index) => desired.set(rowId(item, index), JSON.stringify(item)));

  const storeScope = tenantId ? scopedStoreId(storeId) : undefined;
  const existing = await client.query<{ id: string }>(
    `SELECT id FROM ${quoteIdentifier(table)}${tenantId ? ` WHERE tenant_id = $1${storeScope ? " AND store_id = $2" : ""}` : ""}`,
    tenantId ? (storeScope ? [tenantId, storeScope] : [tenantId]) : [],
  );
  const existingIds = new Set(existing.rows.map((row) => row.id));

  const newRows = Array.from(desired)
    .filter(([id]) => !existingIds.has(id))
    .map(([id, json]) => ({ id, json }));
  await bulkUpsertRows(client, table, newRows, tenantId, storeScope);

  const deleteMissing = buildDeleteMissingRowsQuery(table, Array.from(desired.keys()), tenantId, storeScope);
  await client.query(deleteMissing.sql, deleteMissing.values);
}

function sqlLiteral(value: string) {
  return `'${value.replace(/'/g, "''")}'`;
}

async function commentOnTable(client: PoolClient, table: string, comment: string) {
  await client.query(`COMMENT ON TABLE ${quoteIdentifier(table)} IS ${sqlLiteral(comment)}`);
}

async function commentOnColumn(client: PoolClient, table: string, column: string, comment: string) {
  await client.query(`COMMENT ON COLUMN ${quoteIdentifier(table)}.${quoteIdentifier(column)} IS ${sqlLiteral(comment)}`);
}

async function applySchemaComments(client: PoolClient) {
  await commentOnTable(client, "gpu_app_meta", "系统元数据表，保存当前全局兼容状态和角色权限模板等少量系统级配置。");
  await commentOnColumn(client, "gpu_app_meta", "key", "元数据键名，例如 currentRole 或 customPermissions。");
  await commentOnColumn(client, "gpu_app_meta", "value", "元数据 JSON 内容。");
  await commentOnColumn(client, "gpu_app_meta", "updated_at", "元数据最后更新时间。");

  await commentOnTable(client, "gpu_db_backups", "数据库快照备份表，保存手动备份生成的整包业务状态 JSON。");
  await commentOnColumn(client, "gpu_db_backups", "id", "备份编号，格式通常为 postgres-backup-时间戳。");
  await commentOnColumn(client, "gpu_db_backups", "snapshot", "整包业务数据快照 JSON，用于导出、迁移或恢复核对。");
  await commentOnColumn(client, "gpu_db_backups", "created_at", "备份创建时间。");

  for (const { table, tableComment, dataComment } of collectionTables) {
    await commentOnTable(client, table, tableComment);
    await commentOnColumn(client, table, "id", "业务对象主键，来源于业务 JSON 的 id 字段；缺失时由系统生成 ROW-000001 类编号。");
    await commentOnColumn(client, table, "data", dataComment);
    await commentOnColumn(client, table, "created_at", "该业务对象写入 PostgreSQL 的时间。");
    await commentOnColumn(client, table, "updated_at", "该业务对象最后一次同步到 PostgreSQL 的时间。");
  }
}

export function resolveDatabaseUrl(env: NodeJS.ProcessEnv = process.env) {
  const isTest = env.NODE_ENV === "test";
  const databaseUrl = (isTest ? env.TEST_DATABASE_URL : env.DATABASE_URL)?.trim();
  if (isTest && databaseUrl && env.DATABASE_URL?.trim() === databaseUrl) {
    throw new Error("测试环境的 TEST_DATABASE_URL 不能与 DATABASE_URL 相同，已拒绝连接可能的生产数据库。");
  }
  return databaseUrl || "";
}

export function assertTestDatabaseConfigured(env: NodeJS.ProcessEnv = process.env) {
  if (env.NODE_ENV !== "test") {
    throw new Error("后端集成测试必须使用 NODE_ENV=test。");
  }
  if (!resolveDatabaseUrl(env)) {
    throw new Error("后端集成测试必须配置独立的 TEST_DATABASE_URL。");
  }
}

function requireDatabaseUrl() {
  const isTest = process.env.NODE_ENV === "test";
  const databaseUrl = resolveDatabaseUrl();
  if (!databaseUrl) {
    throw new Error(isTest
      ? "测试数据库未配置，请使用独立的 TEST_DATABASE_URL。"
      : "缺少 DATABASE_URL，系统已切换为 PostgreSQL 存储，请先配置 PostgreSQL 连接字符串。");
  }
  return databaseUrl;
}

export function assertProductionBootstrapPasswordConfigured(env: NodeJS.ProcessEnv = process.env) {
  if (env.NODE_ENV === "production" && !env.BOOTSTRAP_ADMIN_PASSWORD?.trim()) {
    throw new Error("首次初始化生产数据库必须配置 BOOTSTRAP_ADMIN_PASSWORD");
  }
}

function getPool() {
  if (!pool) {
    pool = new Pool({
      connectionString: requireDatabaseUrl(),
      ssl: (process.env.NODE_ENV === "test" ? process.env.TEST_DATABASE_SSL : process.env.DATABASE_SSL) === "true"
        ? { rejectUnauthorized: false }
        : undefined,
    });
  }
  return pool;
}

/**
 * Run an application-owned PostgreSQL transaction. Domain migrations and
 * normalized repositories use this helper so they share the same pool,
 * connection options, and schema initialization as the legacy state layer.
 */
async function rollbackQuietly(client: PoolClient) {
  try {
    await client.query("ROLLBACK");
  } catch {
    // Preserve the original database error. The connection is released below;
    // a rollback failure must not hide the operation that actually failed.
  }
}

export async function withDatabaseTransaction<T>(callback: (client: PoolClient) => Promise<T>): Promise<T> {
  await initializePostgres();
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    const result = await callback(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await rollbackQuietly(client);
    throw error;
  } finally {
    client.release();
  }
}

function cloneWithoutRuntimeSession(state: AppState): AppState {
  return {
    ...state,
    currentUserId: undefined,
  };
}

function rowId(item: unknown, index: number) {
  if (item && typeof item === "object" && "id" in item) {
    const id = (item as { id?: unknown }).id;
    if (typeof id === "string" && id.trim()) return id;
  }
  return `ROW-${String(index + 1).padStart(6, "0")}`;
}

export type PersistedPasswordUpgradeRow = {
  id: string;
  data: SystemUserAccount;
  tenantId?: string | null;
  storeId?: string | null;
};

export type PasswordUpgradeBatch = {
  tenantId: string;
  storeId: string;
  rows: { id: string; json: string }[];
};

/**
 * Prepare password upgrades without losing the row's commercial scope.  The
 * password migration runs during startup and must never write a non-default
 * tenant row through the default scope: ids are globally unique, while the
 * scope columns are mandatory after the commercial foundation migration.
 */
export function buildPasswordUpgradeBatches(rows: PersistedPasswordUpgradeRow[]): PasswordUpgradeBatch[] {
  const batches = new Map<string, PasswordUpgradeBatch>();
  for (const row of rows) {
    const password = row.data?.password;
    if (!password || isPasswordHash(password)) continue;
    const tenantId = row.tenantId?.trim() || DEFAULT_TENANT_ID;
    const storeId = row.storeId?.trim() || DEFAULT_STORE_ID;
    const key = `${tenantId}\u0000${storeId}`;
    const batch = batches.get(key) || { tenantId, storeId, rows: [] };
    batch.rows.push({
      id: row.id,
      json: JSON.stringify({ ...row.data, password: hashPassword(password) }),
    });
    batches.set(key, batch);
  }
  return Array.from(batches.values());
}

async function upgradePersistedUserPasswords(client: PoolClient) {
  const result = await client.query<{
    id: string;
    data: SystemUserAccount;
    tenant_id: string | null;
    store_id: string | null;
  }>("SELECT id, data, tenant_id, store_id FROM gpu_system_users");
  const batches = buildPasswordUpgradeBatches(result.rows.map((row) => ({
    id: row.id,
    data: row.data,
    tenantId: row.tenant_id,
    storeId: row.store_id,
  })));
  for (const batch of batches) {
    await bulkUpsertRows(client, "gpu_system_users", batch.rows, batch.tenantId, batch.storeId);
  }
}

async function initializePostgres() {
  if (initialized) return;
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    await client.query(`
      CREATE TABLE IF NOT EXISTS gpu_app_meta (
        key TEXT PRIMARY KEY,
        value JSONB NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await client.query(`
      CREATE TABLE IF NOT EXISTS gpu_db_backups (
        id TEXT PRIMARY KEY,
        snapshot JSONB NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await client.query(`
      CREATE TABLE IF NOT EXISTS gpu_sessions (
        token_hash TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        tenant_id TEXT,
        store_id TEXT,
        expires_at TIMESTAMPTZ NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await client.query(`
      CREATE TABLE IF NOT EXISTS gpu_daily_notifications (
        report_date TEXT NOT NULL,
        notification_type TEXT NOT NULL,
        tenant_id TEXT,
        store_id TEXT,
        status TEXT NOT NULL,
        attempted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        sent_at TIMESTAMPTZ,
        payload JSONB,
        error_message TEXT,
        PRIMARY KEY (report_date, notification_type)
      )
    `);
    await client.query(`
      CREATE TABLE IF NOT EXISTS gpu_daily_closings (
        date TEXT PRIMARY KEY,
        data JSONB NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await client.query(`
      CREATE TABLE IF NOT EXISTS gpu_ai_insights (
        scope TEXT PRIMARY KEY,
        source_hash TEXT NOT NULL,
        payload JSONB NOT NULL,
        provider TEXT NOT NULL,
        model TEXT NOT NULL,
        generated_at TIMESTAMPTZ NOT NULL,
        expires_at TIMESTAMPTZ NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await client.query(`
      CREATE TABLE IF NOT EXISTS gpu_ai_insight_actions (
        insight_id TEXT PRIMARY KEY,
        status TEXT NOT NULL CHECK (status IN ('done', 'ignored')),
        updated_by TEXT NOT NULL,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    for (const { table } of collectionTables) {
      await client.query(`
        CREATE TABLE IF NOT EXISTS ${table} (
          id TEXT PRIMARY KEY,
          data JSONB NOT NULL,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `);
    }
    // Additive normalized CRM foundation. Legacy JSONB CRM collections remain intact
    // and are migrated later through an explicit mapping/backfill process.
    await applyCrmFoundationSchema(client);
    await applyOperationalProjectionSchema(client);
    // Commercial foundation is additive: legacy rows are assigned to the
    // default tenant while request-scoped repositories are rolled out.
    await applyCommercialFoundationSchema(client);
    await applyCommercialHardeningSchema(client);
    // The commercial migration adds the scope columns used by the password
    // upgrade writer; run the upgrade only after those columns exist.
    await upgradePersistedUserPasswords(client);
    // JSONB remains the canonical document format, while these expression indexes make the
    // high-frequency operational lookups use PostgreSQL instead of loading whole collections.
    await client.query(`CREATE INDEX IF NOT EXISTS gpu_inventory_sn_idx ON gpu_inventory (LOWER(data->>'sn')) WHERE COALESCE(BTRIM(data->>'sn'), '') <> ''`);
    await client.query(`CREATE INDEX IF NOT EXISTS gpu_inventory_product_status_idx ON gpu_inventory ((data->>'productId'), (data->>'status'))`);
    await client.query(`CREATE INDEX IF NOT EXISTS gpu_inventory_entry_time_idx ON gpu_inventory ((data->>'entryTime') DESC)`);
    await client.query(`CREATE INDEX IF NOT EXISTS gpu_inventory_category_status_entry_time_idx ON gpu_inventory ((COALESCE(data->>'category', '显卡')), (data->>'status'), (data->>'entryTime') DESC)`);
    await client.query(`CREATE INDEX IF NOT EXISTS gpu_inventory_brand_entry_time_idx ON gpu_inventory ((data->>'brand'), (data->>'entryTime') DESC)`);
    await client.query(`CREATE INDEX IF NOT EXISTS gpu_inventory_warehouse_entry_time_idx ON gpu_inventory ((data->>'warehouseLocation'), (data->>'entryTime') DESC)`);
    await client.query(`CREATE INDEX IF NOT EXISTS gpu_purchase_invoice_no_idx ON gpu_purchase_invoices ((data->>'invoiceNo'))`);
    await client.query(`CREATE INDEX IF NOT EXISTS gpu_purchase_date_id_idx ON gpu_purchase_invoices ((data->>'date') DESC, id DESC)`);
    await client.query(`CREATE INDEX IF NOT EXISTS gpu_purchase_source_payment_idx ON gpu_purchase_invoices ((data->>'sourceType'), (data->>'paymentStatus'))`);
    await client.query(`CREATE INDEX IF NOT EXISTS gpu_sales_invoice_no_idx ON gpu_sales_invoices ((data->>'invoiceNo'))`);
    await client.query(`CREATE INDEX IF NOT EXISTS gpu_sales_status_idx ON gpu_sales_invoices ((data->>'status'))`);
    await client.query(`CREATE INDEX IF NOT EXISTS gpu_sales_date_id_idx ON gpu_sales_invoices ((data->>'date') DESC, id DESC)`);
    await client.query(`CREATE INDEX IF NOT EXISTS gpu_sales_channel_payment_outbound_idx ON gpu_sales_invoices ((data->>'channel'), (data->>'paymentStatus'), (data->>'outboundStatus'))`);
    // Pair the deterministic id tie-breaker with time so a log page can stop after LIMIT rows
    // instead of sorting the entire audit history.
    await client.query(`CREATE INDEX IF NOT EXISTS gpu_logs_time_id_idx ON gpu_logs ((data->>'time') DESC, id DESC)`);
    await client.query(`CREATE INDEX IF NOT EXISTS gpu_finance_ledger_time_idx ON gpu_finance_ledger ((data->>'time') DESC)`);
    await client.query(`CREATE INDEX IF NOT EXISTS gpu_settlement_ledger_account_time_idx ON gpu_settlement_ledger ((data->>'accountId'), (data->>'time') DESC)`);
    await client.query(`CREATE INDEX IF NOT EXISTS gpu_settlement_ledger_time_id_idx ON gpu_settlement_ledger ((data->>'time') DESC, id DESC)`);
    await client.query(`CREATE INDEX IF NOT EXISTS gpu_payment_in_records_time_id_idx ON gpu_payment_in_records ((data->>'time') DESC, id DESC)`);
    await client.query(`CREATE INDEX IF NOT EXISTS gpu_payment_in_records_account_time_idx ON gpu_payment_in_records ((data->>'accountId'), (data->>'time') DESC)`);
    await client.query(`CREATE INDEX IF NOT EXISTS gpu_payment_out_records_time_id_idx ON gpu_payment_out_records ((data->>'time') DESC, id DESC)`);
    await client.query(`CREATE INDEX IF NOT EXISTS gpu_payment_out_records_account_time_idx ON gpu_payment_out_records ((data->>'accountId'), (data->>'time') DESC)`);
    await client.query(`CREATE INDEX IF NOT EXISTS gpu_sessions_expires_at_idx ON gpu_sessions (expires_at)`);
    await client.query(`CREATE INDEX IF NOT EXISTS gpu_ai_insights_expires_at_idx ON gpu_ai_insights (expires_at)`);
    await client.query(`CREATE INDEX IF NOT EXISTS gpu_ai_insight_actions_status_updated_at_idx ON gpu_ai_insight_actions (status, updated_at DESC)`);
    await applySchemaComments(client);
    await client.query("COMMIT");
  } catch (error) {
    await rollbackQuietly(client);
    throw error;
  } finally {
    client.release();
  }
  initialized = true;
}

function mutationAbortError() {
  const error = new Error("Mutation request aborted");
  error.name = "AbortError";
  return error;
}

function waitForAdvisoryLockRetry(signal?: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    if (signal?.aborted) {
      reject(mutationAbortError());
      return;
    }
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, 25);
    const onAbort = () => {
      clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
      reject(mutationAbortError());
    };
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

async function acquireAdvisoryLock(client: PoolClient, signal: AbortSignal | undefined, lockKey: string) {
  // pg_advisory_lock blocks inside the driver and cannot observe a disconnected HTTP
  // request. Try-lock polling lets the mutation runner cancel queued work safely.
  while (true) {
    if (signal?.aborted) throw mutationAbortError();
    const result = await client.query<{ acquired: boolean }>(
      "SELECT pg_try_advisory_lock(hashtext($1)) AS acquired",
      [lockKey],
    );
    if (result.rows[0]?.acquired) {
      if (signal?.aborted) {
        await client.query("SELECT pg_advisory_unlock(hashtext($1))", [lockKey]);
        throw mutationAbortError();
      }
      return;
    }
    await waitForAdvisoryLockRetry(signal);
  }
}

// A session-level advisory lock is acquired before a request reloads its state and remains held
// for the complete mutation command. This covers the full read -> mutate -> persist lifecycle
// across PM2/Node instances; transaction-level locks in save helpers alone were too late.
export async function acquireStateWriteLock(signal?: AbortSignal): Promise<() => Promise<void>> {
  if (signal?.aborted) throw mutationAbortError();
  await initializePostgres();
  const client = await getPool().connect();
  try {
    await acquireAdvisoryLock(client, signal, STATE_WRITE_LOCK_KEY);
    processWriteLockDepth += 1;
  } catch (error) {
    client.release();
    throw error;
  }

  let released = false;
  return async () => {
    if (released) return;
    released = true;
    try {
      await client.query("SELECT pg_advisory_unlock(hashtext($1))", [STATE_WRITE_LOCK_KEY]);
    } finally {
      processWriteLockDepth = Math.max(0, processWriteLockDepth - 1);
      client.release();
    }
  };
}

/**
 * Auth persistence has a separate lock from business mutations. Login/logout update
 * account and audit rows, but must not join the business mutation queue: an auth burst
 * should serialize against itself without making unrelated inventory/finance writes wait.
 */
export async function acquireAuthWriteLock(signal?: AbortSignal): Promise<() => Promise<void>> {
  if (signal?.aborted) throw mutationAbortError();
  await initializePostgres();
  const client = await getPool().connect();
  try {
    await acquireAdvisoryLock(client, signal, AUTH_WRITE_LOCK_KEY);
  } catch (error) {
    client.release();
    throw error;
  }

  let released = false;
  return async () => {
    if (released) return;
    released = true;
    try {
      await client.query("SELECT pg_advisory_unlock(hashtext($1))", [AUTH_WRITE_LOCK_KEY]);
    } finally {
      client.release();
    }
  };
}

export async function getAiInsightsCache(scope: string, tenantId?: string): Promise<AiInsightsCacheRecord | null> {
  await initializePostgres();
  const cacheScope = scopedAuxiliaryKey(scope, tenantId);
  const result = await getPool().query<{
    scope: string;
    source_hash: string;
    payload: unknown;
    generated_at: Date;
    expires_at: Date;
    provider: string;
    model: string;
  }>(
    `SELECT scope, source_hash, payload, generated_at, expires_at, provider, model
     FROM gpu_ai_insights
     WHERE scope = $1`,
    [cacheScope],
  );
  const row = result.rows[0];
  return row ? {
    scope: row.scope,
    sourceHash: row.source_hash,
    payload: row.payload,
    generatedAt: row.generated_at.toISOString(),
    expiresAt: row.expires_at.toISOString(),
    provider: row.provider,
    model: row.model,
  } : null;
}

export async function saveAiInsightsCache(record: AiInsightsCacheRecord, tenantId?: string) {
  await initializePostgres();
  const cacheScope = scopedAuxiliaryKey(record.scope, tenantId);
  await getPool().query(
    `INSERT INTO gpu_ai_insights (scope, source_hash, payload, provider, model, generated_at, expires_at)
     VALUES ($1, $2, $3::jsonb, $4, $5, $6::timestamptz, $7::timestamptz)
     ON CONFLICT (scope) DO UPDATE SET
       source_hash = EXCLUDED.source_hash,
       payload = EXCLUDED.payload,
       provider = EXCLUDED.provider,
       model = EXCLUDED.model,
       generated_at = EXCLUDED.generated_at,
       expires_at = EXCLUDED.expires_at,
       updated_at = NOW()`,
    [cacheScope, record.sourceHash, JSON.stringify(record.payload), record.provider, record.model, record.generatedAt, record.expiresAt],
  );
}

export async function listAiInsightActions(tenantId?: string): Promise<AiInsightActionRecord[]> {
  await initializePostgres();
  const scope = scopedTenantId(tenantId);
  const prefix = scope === DEFAULT_TENANT_ID ? "" : `${scope}::`;
  const result = await getPool().query<{
    insight_id: string;
    status: AiInsightActionStatus;
    updated_by: string;
    updated_at: Date;
  }>(
    `SELECT insight_id, status, updated_by, updated_at
       FROM gpu_ai_insight_actions
      WHERE ${scope === DEFAULT_TENANT_ID ? "insight_id NOT LIKE $1" : "insight_id LIKE $1"}
      ORDER BY updated_at DESC LIMIT 500`,
    [`${scope === DEFAULT_TENANT_ID ? "%::%" : `${prefix}%`}`],
  );
  return result.rows.map(row => ({
    insightId: scope === DEFAULT_TENANT_ID ? row.insight_id : row.insight_id.slice(prefix.length).replaceAll("%3A%3A", "::"),
    status: row.status,
    updatedBy: row.updated_by,
    updatedAt: row.updated_at.toISOString(),
  }));
}

export async function saveAiInsightAction(record: Omit<AiInsightActionRecord, "updatedAt">, tenantId?: string): Promise<AiInsightActionRecord> {
  await initializePostgres();
  const scope = scopedTenantId(tenantId);
  const insightId = scopedAuxiliaryKey(record.insightId, scope);
  const result = await getPool().query<{
    insight_id: string;
    status: AiInsightActionStatus;
    updated_by: string;
    updated_at: Date;
  }>(
    `INSERT INTO gpu_ai_insight_actions (insight_id, status, updated_by)
     VALUES ($1, $2, $3)
     ON CONFLICT (insight_id) DO UPDATE SET status = EXCLUDED.status, updated_by = EXCLUDED.updated_by, updated_at = NOW()
     RETURNING insight_id, status, updated_by, updated_at`,
    [insightId, record.status, record.updatedBy],
  );
  const row = result.rows[0];
  if (!row) throw new Error("AI insight action insert returned no row");
  return { insightId: record.insightId, status: row.status, updatedBy: row.updated_by, updatedAt: row.updated_at.toISOString() };
}

export async function deleteAiInsightAction(insightId: string, tenantId?: string) {
  await initializePostgres();
  await getPool().query(`DELETE FROM gpu_ai_insight_actions WHERE insight_id = $1`, [scopedAuxiliaryKey(insightId, tenantId)]);
}

async function lockTransactionForStateWrite(client: PoolClient) {
  if (processWriteLockDepth === 0) {
    await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [STATE_WRITE_LOCK_KEY]);
  }
}

export function createDatabaseSessionStore(): SessionStore {
  return {
    async create(tokenHash: string, session: PersistedSession) {
      await initializePostgres();
      await getPool().query(
        `INSERT INTO gpu_sessions (token_hash, user_id, tenant_id, store_id, expires_at)
         VALUES ($1, $2, $3, $4, to_timestamp($5 / 1000.0))
         ON CONFLICT (token_hash) DO UPDATE SET user_id = EXCLUDED.user_id, tenant_id = EXCLUDED.tenant_id, store_id = EXCLUDED.store_id, expires_at = EXCLUDED.expires_at, created_at = NOW()`,
        [tokenHash, session.userId, session.tenantId || DEFAULT_TENANT_ID, session.storeId || null, session.expiresAt],
      );
    },
    async resolve(tokenHash: string) {
      await initializePostgres();
      const result = await getPool().query<{ user_id: string; tenant_id: string | null; store_id: string | null; expires_at: Date }>(
        `DELETE FROM gpu_sessions WHERE token_hash = $1 AND expires_at <= NOW() RETURNING user_id, tenant_id, store_id, expires_at`,
        [tokenHash],
      );
      if (result.rowCount) return null;
      const active = await getPool().query<{ user_id: string; tenant_id: string | null; store_id: string | null; expires_at: Date }>(
        "SELECT user_id, tenant_id, store_id, expires_at FROM gpu_sessions WHERE token_hash = $1 AND expires_at > NOW()",
        [tokenHash],
      );
      const row = active.rows[0];
      return row ? { userId: row.user_id, tenantId: row.tenant_id || DEFAULT_TENANT_ID, storeId: row.store_id || undefined, expiresAt: row.expires_at.getTime() } : null;
    },
    async revoke(tokenHash: string) {
      await initializePostgres();
      await getPool().query("DELETE FROM gpu_sessions WHERE token_hash = $1", [tokenHash]);
    },
    async revokeUserSessions(userId: string, tenantId?: string) {
      await initializePostgres();
      const scope = tenantId?.trim();
      const result = await getPool().query(
        `DELETE FROM gpu_sessions WHERE user_id = $1${scope ? " AND tenant_id = $2" : ""}`,
        scope ? [userId, scope] : [userId],
      );
      return result.rowCount || 0;
    },
    async cleanupExpired(expiresBefore: number) {
      await initializePostgres();
      const result = await getPool().query(
        "DELETE FROM gpu_sessions WHERE expires_at <= to_timestamp($1 / 1000.0)",
        [expiresBefore],
      );
      return result.rowCount || 0;
    },
  };
}

function normalizedPage(value: number | undefined, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(1, Math.floor(parsed || fallback)) : fallback;
}

// 库龄是入库日期相对于门店当前营业日的派生值，不能依赖库存 JSON
// 中历史写入的 storageDays 快照。所有 PostgreSQL 库存列表查询都使用这条表达式，
// 这样排序、筛选和返回给前端的数值保持同一口径。
const inventoryStorageDaysExpression = `GREATEST(CASE WHEN LEFT(COALESCE(data->>'entryTime', ''), 10) ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' THEN (CURRENT_TIMESTAMP AT TIME ZONE 'Asia/Shanghai')::date - LEFT(data->>'entryTime', 10)::date ELSE 0 END, 0)`;

export function buildInventoryPageQuery(filters: InventoryPageFilters = {}) {
  const page = normalizedPage(filters.page, 1);
  const pageSize = Math.min(200, normalizedPage(filters.pageSize, 20));
  const values: unknown[] = [];
  const clauses: string[] = [];
  const bind = (value: unknown) => {
    values.push(value);
    return `$${values.length}`;
  };
  if (filters.tenantId?.trim()) clauses.push(`tenant_id = ${bind(filters.tenantId.trim())}`);
  if (filters.storeId?.trim()) clauses.push(`store_id = ${bind(filters.storeId.trim())}`);
  const keyword = filters.keyword?.trim();
  const selectedStatus = filters.status?.trim();
  const selectedSoldStatus = selectedStatus === "已售出";
  if (!selectedStatus && filters.activeOnly) {
    if (filters.includeSold) {
      clauses.push(`COALESCE(op_status, '') NOT IN ('已退货', '已报废', '已拆卸', '已组装')`);
    } else {
      clauses.push(`COALESCE(op_status, '') NOT IN ('已售出', '已退货', '已报废', '已拆卸', '已组装')`);
    }
  } else if (!selectedSoldStatus && !filters.includeSold) {
    clauses.push(`COALESCE(op_status, '') <> '已售出'`);
  }
  if (filters.status) clauses.push(`op_status = ${bind(filters.status)}`);
  if (filters.category && filters.category !== "all") clauses.push(`op_category = ${bind(filters.category)}`);
  if (filters.brand && filters.brand !== "all") clauses.push(`op_brand = ${bind(filters.brand)}`);
  if (filters.warehouseLocation) clauses.push(`op_warehouse = ${bind(filters.warehouseLocation)}`);
  if (filters.risk === "mined") clauses.push(`COALESCE((data->>'gpuRisk')::boolean, false)`);
  if (filters.risk === "upturned") {
    clauses.push(`COALESCE(NULLIF(data->>'marketPrice', '')::numeric, 0) > 0 AND COALESCE(NULLIF(data->>'marketPrice', '')::numeric, 0) < COALESCE(NULLIF(data->>'costPrice', '')::numeric, 0)`);
  }
  if (filters.risk === "high") {
    clauses.push(`(COALESCE(NULLIF(data->>'gpuRisk', '')::boolean, false) OR (COALESCE(NULLIF(data->>'marketPrice', '')::numeric, 0) > 0 AND COALESCE(NULLIF(data->>'marketPrice', '')::numeric, 0) < COALESCE(NULLIF(data->>'costPrice', '')::numeric, 0)))`);
  }
  if (filters.minStorageDays && filters.minStorageDays > 0) {
    const cutoff = storeDateAfterDays(-Math.floor(filters.minStorageDays));
    clauses.push(`LEFT(COALESCE(op_entry_time, ''), 10) <= ${bind(cutoff)}`);
  }
  if (Number.isFinite(filters.maxStorageDays) && Number(filters.maxStorageDays) >= 0) {
    const cutoff = storeDateAfterDays(-Math.floor(Number(filters.maxStorageDays)));
    clauses.push(`LEFT(COALESCE(op_entry_time, ''), 10) >= ${bind(cutoff)}`);
  }
  if (filters.minProfitMargin && filters.minProfitMargin > 0) {
    clauses.push(`COALESCE(NULLIF(data->>'costPrice', '')::numeric, 0) > 0 AND COALESCE(NULLIF(data->>'estSellPrice', '')::numeric, 0) >= COALESCE(NULLIF(data->>'costPrice', '')::numeric, 0) * ${bind(1 + filters.minProfitMargin)}`);
  }
  if (keyword) {
    const placeholder = bind(`%${keyword}%`);
    clauses.push(`CONCAT_WS(' ', id, op_product_id, data->>'productName', data->>'model', op_brand, data->>'version', data->>'vram', op_sn, data->>'expressNo', data->>'supplierName', op_warehouse, data->>'remarks') ILIKE ${placeholder}`);
  }
  const sortExpressions: Record<string, string> = {
    id: "id",
    code: "id",
    product: "data->>'productName'",
    productName: "data->>'productName'",
    cost: "COALESCE(NULLIF(data->>'costPrice', '')::numeric, 0)",
    costPrice: "COALESCE(NULLIF(data->>'costPrice', '')::numeric, 0)",
    profit: "COALESCE(NULLIF(data->>'estSellPrice', '')::numeric, 0) - COALESCE(NULLIF(data->>'costPrice', '')::numeric, 0)",
    days: inventoryStorageDaysExpression,
    status: "op_status",
    warehouseLocation: "op_warehouse",
    entryTime: "op_entry_time",
  };
  const sortExpression = filters.sortKey ? sortExpressions[filters.sortKey] : undefined;
  const sortDirection = filters.sortDirection === "asc" ? "ASC" : "DESC";
  const orderBy = sortExpression
    ? `ORDER BY ${sortExpression} ${sortDirection} NULLS LAST, id ASC`
    : "ORDER BY op_entry_time DESC NULLS LAST, id ASC";
  return {
    page,
    pageSize,
    offset: (page - 1) * pageSize,
    values,
    where: clauses.length ? `WHERE ${clauses.join(" AND ")}` : "",
    orderBy,
    select: `data || jsonb_build_object('storageDays', ${inventoryStorageDaysExpression}) AS data`,
  };
}

// Indexed inventory list query for API consumers. The command handlers still load the aggregate
// for cross-record validation, but routine list/search requests no longer deserialize every stock
// row just to return one page.
export async function queryInventoryPage<T = unknown>(filters: InventoryPageFilters = {}): Promise<CollectionPage<T>> {
  await initializePostgres();
  const { page, pageSize, offset, where, orderBy, values, select } = buildInventoryPageQuery(filters);
  const [rows, count] = await Promise.all([
    getPool().query<{ data: T }>(
      `SELECT ${select} FROM gpu_inventory ${where} ${orderBy} LIMIT $${values.length + 1} OFFSET $${values.length + 2}`,
      [...values, pageSize, offset],
    ),
    getPool().query<{ total: string }>(`SELECT COUNT(*)::text AS total FROM gpu_inventory ${where}`, values),
  ]);
  return {
    data: rows.rows.map((row) => row.data),
    meta: { page, pageSize, total: Number(count.rows[0]?.total || 0) },
  };
}

export function buildLogPageQuery(filters: LogPageFilters = {}) {
  const page = normalizedPage(filters.page, 1);
  const pageSize = Math.min(200, normalizedPage(filters.pageSize, 100));
  const keyword = filters.keyword?.trim();
  const values: unknown[] = [];
  const clauses: string[] = [];
  if (filters.tenantId?.trim()) {
    values.push(filters.tenantId.trim());
    clauses.push("tenant_id = $1");
  }
  if (filters.storeId?.trim()) {
    values.push(filters.storeId.trim());
    clauses.push(`store_id = $${values.length}`);
  }
  if (keyword) {
    values.push(`%${keyword}%`);
    clauses.push(`CONCAT_WS(' ', id, data->>'user', data->>'module', data->>'type', data->>'target', data->>'beforeVal', data->>'afterVal', data->>'time') ILIKE $${values.length}`);
  }
  const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
  return { page, pageSize, offset: (page - 1) * pageSize, values, where };
}

// Audit logs grow forever in normal use. Query only the visible page instead of deserializing
// thousands of JSON rows and mounting them in the browser whenever the log screen is opened.
export async function queryLogsPage<T = unknown>(filters: LogPageFilters = {}): Promise<CollectionPage<T>> {
  await initializePostgres();
  const { page, pageSize, offset, where, values } = buildLogPageQuery(filters);
  const [rows, count] = await Promise.all([
    getPool().query<{ data: T }>(
      `SELECT data FROM gpu_logs ${where} ORDER BY data->>'time' DESC NULLS LAST, id DESC LIMIT $${values.length + 1} OFFSET $${values.length + 2}`,
      [...values, pageSize, offset],
    ),
    getPool().query<{ total: string }>(`SELECT COUNT(*)::text AS total FROM gpu_logs ${where}`, values),
  ]);
  return {
    data: rows.rows.map((row) => row.data),
    meta: { page, pageSize, total: Number(count.rows[0]?.total || 0) },
  };
}

function commissionExpressions(mode: CommissionMode) {
  const purchase = mode === "purchase";
  const role = purchase ? "purchase" : "sales";
  const handler = purchase ? "COALESCE(data->>'purchaseHandler', '')" : "COALESCE(data->>'salesHandler', '')";
  const documentNo = purchase
    ? "COALESCE(NULLIF(data->>'purchaseInvoiceNo', ''), id)"
    : "COALESCE(NULLIF(data->>'salesInvoiceNo', ''), id)";
  const originalAmount = purchase
    ? "COALESCE(NULLIF(data->>'purchaseCommissionAmount', '')::numeric, NULLIF(data->>'commissionAmount', '')::numeric, 0)"
    : "COALESCE(NULLIF(data->>'salesCommissionAmount', '')::numeric, NULLIF(data->>'commissionAmount', '')::numeric, 0)";
  const adjustmentAmount = `(SELECT COALESCE(SUM(COALESCE(NULLIF(adjustment->>'amount', '')::numeric, 0)), 0) FROM jsonb_array_elements(COALESCE(data->'commissionAdjustments', '[]'::jsonb)) AS adjustment WHERE adjustment->>'mode' = '${role}')`;
  return {
    handler,
    documentNo,
    status: `COALESCE(NULLIF(data->>'${role}Status', ''), NULLIF(data->>'status', ''), '待结算')`,
    originalAmount,
    adjustmentAmount,
    amount: `GREATEST(${originalAmount} + ${adjustmentAmount}, 0)`,
    baseAmount: purchase
      ? "COALESCE(NULLIF(data->>'costPrice', '')::numeric, 0)"
      : "COALESCE(NULLIF(data->>'salesPrice', '')::numeric, 0)",
  };
}

export function buildCommissionPageQuery(filters: CommissionPageFilters) {
  const page = normalizedPage(filters.page, 1);
  const pageSize = Math.min(200, normalizedPage(filters.pageSize, 20));
  const values: unknown[] = [];
  const clauses: string[] = [];
  const bind = (value: unknown) => {
    values.push(value);
    return `$${values.length}`;
  };
  const expressions = commissionExpressions(filters.mode);
  if (filters.tenantId?.trim()) clauses.push(`tenant_id = ${bind(filters.tenantId.trim())}`);
  if (filters.storeId?.trim()) clauses.push(`store_id = ${bind(filters.storeId.trim())}`);
  const keyword = filters.keyword?.trim();
  if (keyword) {
    clauses.push(`CONCAT_WS(' ', id, data->>'sn', data->>'productName', ${expressions.handler}, ${expressions.documentNo}, data->>'purchaseInvoiceNo', data->>'salesInvoiceNo') ILIKE ${bind(`%${keyword}%`)}`);
  }
  if (filters.status) clauses.push(`${expressions.status} = ${bind(filters.status)}`);
  if (filters.handler) clauses.push(`${expressions.handler} = ${bind(filters.handler)}`);
  if (filters.dateStart) clauses.push(`LEFT(COALESCE(data->>'createdAt', ''), 10) >= ${bind(filters.dateStart)}`);
  if (filters.dateEnd) clauses.push(`LEFT(COALESCE(data->>'createdAt', ''), 10) <= ${bind(filters.dateEnd)}`);
  const sortExpressions: Record<string, string> = {
    id: "id",
    sn: "data->>'sn'",
    productName: "data->>'productName'",
    handler: expressions.handler,
    documentNo: expressions.documentNo,
    baseAmount: expressions.baseAmount,
    grossProfit: "COALESCE(NULLIF(data->>'grossProfit', '')::numeric, 0)",
    commissionAmount: expressions.amount,
    status: expressions.status,
    createdAt: "data->>'createdAt'",
  };
  const sortExpression = sortExpressions[filters.sortKey || "createdAt"] || sortExpressions.createdAt;
  const sortDirection = filters.sortDirection === "asc" ? "ASC" : "DESC";
  return {
    table: "gpu_purchase_commissions",
    page,
    pageSize,
    offset: (page - 1) * pageSize,
    values,
    where: clauses.length ? `WHERE ${clauses.join(" AND ")}` : "",
    orderBy: `ORDER BY ${sortExpression} ${sortDirection} NULLS LAST, id DESC`,
    expressions,
  };
}

export async function queryCommissionPage<T = unknown>(filters: CommissionPageFilters): Promise<CommissionPage<T>> {
  await initializePostgres();
  const {table, page, pageSize, offset, values, where, orderBy, expressions} = buildCommissionPageQuery(filters);
  const [rows, aggregate] = await Promise.all([
    getPool().query<{data: T}>(
      `SELECT data FROM ${table} ${where} ${orderBy} LIMIT $${values.length + 1} OFFSET $${values.length + 2}`,
      [...values, pageSize, offset],
    ),
    getPool().query<Record<string, string>>(
      `SELECT
        COUNT(*)::text AS total,
        COUNT(*) FILTER (WHERE ${expressions.status} = '待结算')::text AS pending_count,
        COUNT(*) FILTER (WHERE ${expressions.status} = '已结算')::text AS settled_count,
        COUNT(*) FILTER (WHERE ${expressions.status} = '已冲销')::text AS voided_count,
        COUNT(DISTINCT NULLIF(${expressions.handler}, ''))::text AS handler_count,
        COALESCE(SUM(${expressions.originalAmount}), 0)::text AS original_commission,
        COALESCE(SUM(${expressions.adjustmentAmount}), 0)::text AS adjustment_amount,
        COALESCE(SUM(${expressions.amount}), 0)::text AS total_commission
       FROM ${table} ${where}`,
      values,
    ),
  ]);
  const summary = aggregate.rows[0] || {};
  return {
    data: rows.rows.map((row) => row.data),
    meta: {
      page,
      pageSize,
      total: Number(summary.total || 0),
      summary: {
        pendingCount: Number(summary.pending_count || 0),
        settledCount: Number(summary.settled_count || 0),
        voidedCount: Number(summary.voided_count || 0),
        handlerCount: Number(summary.handler_count || 0),
        originalCommission: Number(summary.original_commission || 0),
        adjustmentAmount: Number(summary.adjustment_amount || 0),
        totalCommission: Number(summary.total_commission || 0),
      },
    },
  };
}

type FinanceRecordKind = "settlement" | "income" | "expense";

const financeRecordTables: Record<FinanceRecordKind, string> = {
  settlement: "gpu_settlement_ledger",
  income: "gpu_payment_in_records",
  expense: "gpu_payment_out_records",
};

const PROFIT_OTHER_INCOME_TYPES = ["赔偿收入", "返点收入", "配件销售", "利息收入", "其他收入"] as const;
const PROFIT_OTHER_EXPENSE_TYPES = ["员工费用", "运费支出", "办公费用", "罚款支出", "差旅招待", "其他支出", "员工提成", "运费", "维修费", "平台手续费"] as const;
const PROFIT_EXPLICIT_EXPENSE_TYPES = ["员工费用", "运费支出", "办公费用", "罚款支出", "差旅招待", "其他支出"] as const;

export type FinanceProfitFlowKind = "income" | "expense";

/**
 * Builds the indexed query used by the profit report's non-operating aggregate.
 * Business settlement records are intentionally excluded here; only standalone
 * other income and actual operating expenses can affect net profit.
 */
export function buildFinanceProfitFlowQuery(kind: FinanceProfitFlowKind, filters: FinanceProfitFlowFilters = {}) {
  const table = kind === "income" ? "gpu_payment_in_records" : "gpu_payment_out_records";
  const values: unknown[] = [];
  const clauses = ["LEFT(COALESCE(data->>'time', ''), 10) ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'"];
  const bind = (value: unknown) => {
    values.push(value);
    return `$${values.length}`;
  };
  if (filters.tenantId?.trim()) clauses.unshift(`tenant_id = ${bind(filters.tenantId.trim())}`);
  if (filters.storeId?.trim()) clauses.unshift(`store_id = ${bind(filters.storeId.trim())}`);
  const types = kind === "income" ? PROFIT_OTHER_INCOME_TYPES : PROFIT_OTHER_EXPENSE_TYPES;
  clauses.push(`COALESCE(data->>'businessType', '') = ANY(${bind([...types])}::text[])`);
  if (filters.dateStart) clauses.push(`LEFT(data->>'time', 10) >= ${bind(filters.dateStart)}`);
  if (filters.dateEnd) clauses.push(`LEFT(data->>'time', 10) <= ${bind(filters.dateEnd)}`);

  if (kind === "income") {
    clauses.push("COALESCE(data->>'relatedDocType', '') <> '销售单'");
    clauses.push("COALESCE(data->>'relatedDocNo', '') NOT LIKE 'XS%'");
    clauses.push("COALESCE(data->>'businessType', '') <> '销售收款'");
  } else {
    clauses.push("COALESCE(data->>'businessType', '') NOT IN ('采购付款', '回收付款', '客户退款', '采购退款', '账户调拨')");
    // Explicit expense registrations are standalone by contract. If old data has
    // a business document attached, exclude it to avoid charging the same event twice.
    clauses.push(`NOT (COALESCE(data->>'businessType', '') = ANY(${bind([...PROFIT_EXPLICIT_EXPENSE_TYPES])}::text[]) AND COALESCE(data->>'relatedDocNo', '') <> '')`);
  }
  return {table, values, where: `WHERE ${clauses.join(" AND ")}`};
}

async function queryFinanceProfitFlowRows(kind: FinanceProfitFlowKind, filters: FinanceProfitFlowFilters) {
  const query = buildFinanceProfitFlowQuery(kind, filters);
  const result = await getPool().query<{date: string; amount: string}>(
    `SELECT LEFT(data->>'time', 10) AS date,
            COALESCE(SUM(COALESCE(NULLIF(data->>'amount', '')::numeric, 0)), 0)::text AS amount
       FROM ${query.table}
      ${query.where}
      GROUP BY LEFT(data->>'time', 10)
      ORDER BY LEFT(data->>'time', 10) ASC`,
    query.values,
  );
  return result.rows.map((row) => ({date: row.date, amount: Number(row.amount || 0)}));
}

/** Returns date-level other income/expense only; sales gross profit remains a separate measure. */
export async function queryFinanceProfitOtherFlows(filters: FinanceProfitFlowFilters = {}) {
  await initializePostgres();
  const [incomeRows, expenseRows] = await Promise.all([
    queryFinanceProfitFlowRows("income", filters),
    queryFinanceProfitFlowRows("expense", filters),
  ]);
  const byDate = new Map<string, {income: number; expense: number}>();
  for (const row of incomeRows) byDate.set(row.date, {...(byDate.get(row.date) || {income: 0, expense: 0}), income: row.amount});
  for (const row of expenseRows) byDate.set(row.date, {...(byDate.get(row.date) || {income: 0, expense: 0}), expense: row.amount});
  const flows: FinanceProfitFlowRow[] = Array.from(byDate.entries()).sort(([left], [right]) => left.localeCompare(right)).map(([date, row]) => ({date, income: row.income, expense: row.expense, net: row.income - row.expense}));
  return {data: {flows}};
}

export function buildFinanceRecordPageQuery(kind: FinanceRecordKind, filters: FinanceRecordPageFilters = {}) {
  const page = normalizedPage(filters.page, 1);
  const pageSize = Math.min(200, normalizedPage(filters.pageSize, 20));
  const values: unknown[] = [];
  const clauses: string[] = [];
  const bind = (value: unknown) => {
    values.push(value);
    return `$${values.length}`;
  };
  if (filters.tenantId?.trim()) clauses.push(`tenant_id = ${bind(filters.tenantId.trim())}`);
  if (filters.storeId?.trim()) clauses.push(`store_id = ${bind(filters.storeId.trim())}`);
  const exactFilters: Array<[keyof FinanceRecordPageFilters, string]> = [
    ["accountId", "accountId"], ["handler", "handler"], ["businessType", "businessType"],
    ["direction", "direction"], ["relatedDocNo", "relatedDocNo"], ["customerName", "customerName"], ["supplierName", "supplierName"],
  ];
  for (const [filterKey, jsonKey] of exactFilters) {
    const value = filters[filterKey];
    if (typeof value === "string" && value.trim() && value !== "all") clauses.push(`data->>'${jsonKey}' = ${bind(value.trim())}`);
  }
  if (filters.dateStart) clauses.push(`LEFT(COALESCE(data->>'time', ''), 10) >= ${bind(filters.dateStart)}`);
  if (filters.dateEnd) clauses.push(`LEFT(COALESCE(data->>'time', ''), 10) <= ${bind(filters.dateEnd)}`);
  const keyword = filters.keyword?.trim();
  if (keyword) {
    clauses.push(`CONCAT_WS(' ', id, data->>'remarks', data->>'customerName', data->>'supplierName', data->>'relatedDocNo', data->>'referenceNo', data->>'accountName', data->>'businessType', data->>'handler') ILIKE ${bind(`%${keyword}%`)}`);
  }
  if (kind === "income") {
    clauses.push(`COALESCE(data->>'relatedDocType', '') <> '销售单'`);
    clauses.push(`COALESCE(data->>'relatedDocNo', '') NOT LIKE 'XS%'`);
    clauses.push(`COALESCE(data->>'businessType', '') <> '销售收款'`);
    clauses.push(`COALESCE(data->>'relatedDocType', '') NOT IN ('采购单', '退货单')`);
    clauses.push(`COALESCE(data->>'relatedDocNo', '') NOT LIKE 'JH%'`);
    clauses.push(`COALESCE(data->>'relatedDocNo', '') NOT LIKE 'TH%'`);
    clauses.push(`COALESCE(data->>'businessType', '') <> '采购退款'`);
  }
  if (kind === "expense") {
    clauses.push(`COALESCE(data->>'relatedDocType', '') <> '采购单'`);
    clauses.push(`COALESCE(data->>'relatedDocNo', '') NOT LIKE 'JH%'`);
    clauses.push(`COALESCE(data->>'businessType', '') NOT IN ('采购付款', '回收付款')`);
  }
  return {
    table: financeRecordTables[kind],
    page,
    pageSize,
    offset: (page - 1) * pageSize,
    values,
    where: clauses.length ? `WHERE ${clauses.join(" AND ")}` : "",
  };
}

async function queryFinanceRecordPage<T>(kind: FinanceRecordKind, filters: FinanceRecordPageFilters): Promise<FinanceRecordPage<T>> {
  await initializePostgres();
  const {table, page, pageSize, offset, values, where} = buildFinanceRecordPageQuery(kind, filters);
  const [rows, aggregate] = await Promise.all([
    getPool().query<{data: T}>(
      `SELECT data FROM ${table} ${where} ORDER BY data->>'time' DESC NULLS LAST, id DESC LIMIT $${values.length + 1} OFFSET $${values.length + 2}`,
      [...values, pageSize, offset],
    ),
    getPool().query<{total: string; total_amount: string}>(
      `SELECT COUNT(*)::text AS total, COALESCE(SUM(COALESCE(NULLIF(data->>'amount', '')::numeric, 0)), 0)::text AS total_amount FROM ${table} ${where}`,
      values,
    ),
  ]);
  const summary = aggregate.rows[0];
  return {
    data: rows.rows.map((row) => row.data),
    meta: {page, pageSize, total: Number(summary?.total || 0), ...(kind === "settlement" ? {} : {totalAmount: Number(summary?.total_amount || 0)})},
  };
}

export function querySettlementLedgerPage<T = unknown>(filters: FinanceRecordPageFilters = {}) {
  return queryFinanceRecordPage<T>("settlement", filters);
}

export function queryPaymentInPage<T = unknown>(filters: FinanceRecordPageFilters = {}) {
  return queryFinanceRecordPage<T>("income", filters);
}

export function queryPaymentOutPage<T = unknown>(filters: FinanceRecordPageFilters = {}) {
  return queryFinanceRecordPage<T>("expense", filters);
}

const purchasePaymentStatusExpression = `COALESCE(NULLIF(data->>'paymentStatus', ''), CASE WHEN COALESCE((data->>'isPaid')::boolean, false) THEN '已付款' WHEN COALESCE(NULLIF(data->>'paidAmount', '')::numeric, 0) > 0 THEN '部分付款' ELSE '未付款' END)`;
const salesPaymentStatusExpression = `COALESCE(NULLIF(data->>'paymentStatus', ''), CASE WHEN COALESCE(NULLIF(data->>'unpaidAmount', '')::numeric, 0) <= 0 AND COALESCE(NULLIF(data->>'paidAmount', '')::numeric, 0) > 0 THEN '已收款' WHEN COALESCE(NULLIF(data->>'paidAmount', '')::numeric, 0) > 0 THEN '部分收款' ELSE '未收款' END)`;

export function buildInvoicePageQuery(kind: InvoicePageKind, filters: InvoicePageFilters = {}) {
  const page = normalizedPage(filters.page, 1);
  const pageSize = Math.min(200, normalizedPage(filters.pageSize, 20));
  const values: unknown[] = [];
  const clauses: string[] = [];
  const bind = (value: unknown) => { values.push(value); return `$${values.length}`; };
  if (filters.tenantId?.trim()) clauses.push(`tenant_id = ${bind(filters.tenantId.trim())}`);
  if (filters.storeId?.trim()) clauses.push(`store_id = ${bind(filters.storeId.trim())}`);
  if (filters.dateStart) clauses.push(`COALESCE(data->>'date', '') >= ${bind(filters.dateStart)}`);
  if (filters.dateEnd) clauses.push(`COALESCE(data->>'date', '') <= ${bind(filters.dateEnd)}`);
  if (kind === "purchase" && filters.sourceType) clauses.push(`data->>'sourceType' = ${bind(filters.sourceType)}`);
  if (kind === "sales" && filters.channel) clauses.push(`data->>'channel' = ${bind(filters.channel)}`);
  if (filters.paymentStatus) clauses.push(`${kind === "purchase" ? purchasePaymentStatusExpression : salesPaymentStatusExpression} = ${bind(filters.paymentStatus)}`);
  if (kind === "sales" && filters.outboundStatus) clauses.push(`COALESCE(NULLIF(data->>'outboundStatus', ''), '待出库') = ${bind(filters.outboundStatus)}`);
  const keyword = filters.keyword?.trim();
  if (keyword) {
    const party = kind === "purchase" ? "supplierName" : "customerName";
    clauses.push(`CONCAT_WS(' ', id, data->>'invoiceNo', data->>'${party}', data->>'sourceType', data->>'channel', data->>'handleBy', data->'items') ILIKE ${bind(`%${keyword}%`)}`);
  }
  const commonSort: Record<string, string> = {
    date: "data->>'date'", invoiceNo: "data->>'invoiceNo'", totalCount: "COALESCE(NULLIF(data->>'totalCount', '')::numeric, 0)",
    paymentStatus: kind === "purchase" ? purchasePaymentStatusExpression : salesPaymentStatusExpression, handleBy: "data->>'handleBy'",
  };
  const sortExpressions: Record<string, string> = kind === "purchase" ? {
    ...commonSort, supplierName: "data->>'supplierName'", totalCost: "COALESCE(NULLIF(data->>'totalCost', '')::numeric, 0)",
  } : {
    ...commonSort, customerName: "data->>'customerName'", totalAmount: "COALESCE(NULLIF(data->>'totalAmount', '')::numeric, 0)",
    totalProfit: "COALESCE(NULLIF(data->>'totalProfit', '')::numeric, 0)", outboundStatus: "COALESCE(NULLIF(data->>'outboundStatus', ''), '待出库')",
  };
  const sortExpression = sortExpressions[filters.sortKey || "date"] || sortExpressions.date;
  const sortDirection = filters.sortDirection === "asc" ? "ASC" : "DESC";
  return {table: kind === "purchase" ? "gpu_purchase_invoices" : "gpu_sales_invoices", page, pageSize, offset: (page - 1) * pageSize, values, where: clauses.length ? `WHERE ${clauses.join(" AND ")}` : "", orderBy: `ORDER BY ${sortExpression} ${sortDirection} NULLS LAST, id DESC`};
}

async function queryInvoicePage<T>(kind: InvoicePageKind, filters: InvoicePageFilters): Promise<InvoicePage<T>> {
  await initializePostgres();
  const {table, page, pageSize, offset, values, where, orderBy} = buildInvoicePageQuery(kind, filters);
  const invoiceNo = `COALESCE(NULLIF(document.data->>'invoiceNo', ''), document.id)`;
  const legacyLabel = kind === "purchase" ? "进货单" : "销售单";
  const structuredField = kind === "purchase" ? "purchaseInvoiceNo" : "salesInvoiceId";
  const countKey = kind === "purchase" ? "__inventoryCount" : "__linkedInventoryCount";
  const inventoryScopeClauses: string[] = [];
  if (filters.tenantId?.trim()) inventoryScopeClauses.push("inventory.tenant_id = $1");
  if (filters.storeId?.trim()) inventoryScopeClauses.push(`inventory.store_id = $${filters.tenantId?.trim() ? 2 : 1}`);
  const inventoryScope = inventoryScopeClauses.length ? `${inventoryScopeClauses.join(" AND ")} AND ` : "";
  const inventoryCount = `(SELECT COUNT(*) FROM gpu_inventory inventory WHERE ${inventoryScope}(inventory.data->>'${structuredField}' IN (document.id, ${invoiceNo}) OR SUBSTRING(COALESCE(inventory.data->>'remarks', '') FROM '${legacyLabel}\\s*[:：]\\s*([^；;\\s]+)') IN (document.id, ${invoiceNo})))`;
  const pendingPayment = kind === "purchase" ? `${purchasePaymentStatusExpression.replaceAll("data", "document.data")} IN ('未付款', '部分付款')` : `${salesPaymentStatusExpression.replaceAll("data", "document.data")} IN ('未收款', '部分收款')`;
  const summarySql = kind === "purchase"
    ? `COUNT(*)::text AS total, COALESCE(SUM(COALESCE(NULLIF(data->>'totalCount', '')::numeric, 0)), 0)::text AS unit_count, COUNT(*) FILTER (WHERE ${pendingPayment.replaceAll("document.data", "data")})::text AS pending_payment_count, COALESCE(SUM(COALESCE(NULLIF(data->>'totalCost', '')::numeric, 0)), 0)::text AS total_cost, COALESCE(SUM(COALESCE(NULLIF(data->>'estTotalProfit', '')::numeric, 0)), 0)::text AS estimated_profit`
    : `COUNT(*)::text AS total, COALESCE(SUM(COALESCE(NULLIF(data->>'totalCount', '')::numeric, 0)), 0)::text AS unit_count, COUNT(*) FILTER (WHERE ${pendingPayment.replaceAll("document.data", "data")})::text AS pending_payment_count, COUNT(*) FILTER (WHERE COALESCE(NULLIF(data->>'outboundStatus', ''), '待出库') = '待出库')::text AS pending_outbound_count, COALESCE(SUM(COALESCE(NULLIF(data->>'totalAmount', '')::numeric, 0)), 0)::text AS total_amount, COALESCE(SUM(COALESCE(NULLIF(data->>'totalProfit', '')::numeric, 0)), 0)::text AS total_profit`;
  const [rows, aggregate] = await Promise.all([
    getPool().query<{data: T}>(`SELECT document.data || jsonb_build_object('${countKey}', ${inventoryCount}) AS data FROM ${table} document ${where.replaceAll("data", "document.data")} ${orderBy.replaceAll("data", "document.data")} LIMIT $${values.length + 1} OFFSET $${values.length + 2}`, [...values, pageSize, offset]),
    getPool().query<Record<string, string>>(`SELECT ${summarySql} FROM ${table} ${where}`, values),
  ]);
  const totals = aggregate.rows[0] || {};
  const total = Number(totals.total || 0);
  const summary: Record<string, number> = kind === "purchase" ? {
    orderCount: total, unitCount: Number(totals.unit_count || 0), pendingPaymentCount: Number(totals.pending_payment_count || 0), totalCost: Number(totals.total_cost || 0), estimatedProfit: Number(totals.estimated_profit || 0),
  } : {
    orderCount: total, unitCount: Number(totals.unit_count || 0), pendingPaymentCount: Number(totals.pending_payment_count || 0), pendingOutboundCount: Number(totals.pending_outbound_count || 0), totalAmount: Number(totals.total_amount || 0), totalProfit: Number(totals.total_profit || 0),
  };
  return {data: rows.rows.map((row) => row.data), meta: {page, pageSize, total, summary}};
}

export function queryPurchaseInvoicePage<T = unknown>(filters: InvoicePageFilters = {}) { return queryInvoicePage<T>("purchase", filters); }
export function querySalesInvoicePage<T = unknown>(filters: InvoicePageFilters = {}) { return queryInvoicePage<T>("sales", filters); }

export async function findInventoryRecord<T = unknown>(id: string, tenantId?: string, storeId?: string): Promise<T | null> {
  await initializePostgres();
  const scope = tenantId?.trim();
  const storeScope = scope ? scopedStoreId(storeId) : undefined;
  const result = await getPool().query<{ data: T }>(
    `SELECT data FROM gpu_inventory WHERE id = $1${scope ? ` AND tenant_id = $2${storeScope ? " AND store_id = $3" : ""}` : ""}`,
    scope ? (storeScope ? [id, scope, storeScope] : [id, scope]) : [id],
  );
  return result.rows[0]?.data || null;
}

export async function findInventoryRecordBySn<T = unknown>(sn: string, tenantId?: string, storeId?: string): Promise<T | null> {
  await initializePostgres();
  const scope = tenantId?.trim();
  const storeScope = scope ? scopedStoreId(storeId) : undefined;
  const result = await getPool().query<{ data: T }>(
    `SELECT data FROM gpu_inventory WHERE op_sn = LOWER($1)${scope ? ` AND tenant_id = $2${storeScope ? " AND store_id = $3" : ""}` : ""} LIMIT 1`,
    scope ? (storeScope ? [sn, scope, storeScope] : [sn, scope]) : [sn],
  );
  return result.rows[0]?.data || null;
}

/** Resolve the global login identity; tenant authorization is enforced by membership. */
export async function findSystemUserById(userId: string, tenantId?: string): Promise<SystemUserAccount | null> {
  await initializePostgres();
  const scope = scopedTenantId(tenantId);
  const result = await getPool().query<{ data: SystemUserAccount; tenant_id: string }>(
    "SELECT data, tenant_id FROM gpu_system_users WHERE id = $1 ORDER BY CASE WHEN tenant_id = $2 THEN 0 ELSE 1 END, id ASC LIMIT 1",
    [userId, scope],
  );
  const user = result.rows[0]?.data;
  return user ? { ...user, tenantId: user.tenantId || result.rows[0]?.tenant_id || scope, storeId: user.storeId || DEFAULT_STORE_ID } : null;
}

export async function findSystemUserByUsername(username: string, tenantId?: string): Promise<SystemUserAccount | null> {
  await initializePostgres();
  const scope = tenantId?.trim();
  const result = await getPool().query<{ data: SystemUserAccount; tenant_id: string }>(
    scope
      ? "SELECT data, tenant_id FROM gpu_system_users WHERE LOWER(data->>'username') = LOWER($1) AND tenant_id = $2 ORDER BY id ASC LIMIT 1"
      : "SELECT data, tenant_id FROM gpu_system_users WHERE LOWER(data->>'username') = LOWER($1) ORDER BY CASE WHEN tenant_id = $2 THEN 0 ELSE 1 END, id ASC LIMIT 1",
    scope ? [username.trim(), scope] : [username.trim(), DEFAULT_TENANT_ID],
  );
  const user = result.rows[0]?.data;
  return user ? { ...user, tenantId: user.tenantId || result.rows[0]?.tenant_id || scope || DEFAULT_TENANT_ID, storeId: user.storeId || DEFAULT_STORE_ID } : null;
}

export async function findActiveTenantMembership(userId: string, tenantId: string, storeId?: string) {
  await initializePostgres();
  const result = await getPool().query<{ tenant_id: string; store_id: string; role: string; status: string; permissions: unknown }>(
    `SELECT tenant_id, store_id, role, status, permissions
       FROM gpu_tenant_memberships
      WHERE tenant_id = $1 AND user_id = $2 AND status = 'active'
        ${storeId ? "AND store_id = $3" : ""}
      ORDER BY created_at ASC LIMIT 1`,
    storeId ? [tenantId, userId, storeId] : [tenantId, userId],
  );
  const row = result.rows[0];
  return row ? { tenantId: row.tenant_id, storeId: row.store_id, role: row.role, status: row.status, permissions: row.permissions && typeof row.permissions === "object" ? row.permissions as Record<string, unknown> : {} } : null;
}

async function hasPersistedState(client: PoolClient, tenantId?: string, storeId?: string) {
  const scope = scopedTenantId(tenantId);
  const storeScope = scopedStoreId(storeId);
  if (scope === DEFAULT_TENANT_ID) {
    const result = await client.query<{ count: string }>(
      "SELECT COUNT(*)::text AS count FROM gpu_app_meta WHERE key IN ('currentRole', 'customPermissions')",
    );
    if (Number(result.rows[0]?.count || 0) > 0) return true;
  } else {
    const settings = await client.query<{ count: string }>(
      "SELECT COUNT(*)::text AS count FROM gpu_tenant_settings WHERE tenant_id = $1",
      [scope],
    );
    if (Number(settings.rows[0]?.count || 0) > 0) return true;
  }

  const inventory = await client.query<{ count: string }>("SELECT COUNT(*)::text AS count FROM gpu_inventory WHERE tenant_id = $1 AND store_id = $2", [scope, storeScope]);
  const users = await client.query<{ count: string }>("SELECT COUNT(*)::text AS count FROM gpu_system_users WHERE tenant_id = $1 AND store_id = $2", [scope, storeScope]);
  return Number(inventory.rows[0]?.count || 0) > 0 || Number(users.rows[0]?.count || 0) > 0;
}

/**
 * The commercial schema is applied before a clean database receives the
 * initial JSONB state.  Keep the membership projection in sync after that
 * bootstrap (and repair legacy tenants that predate the projection) without
 * reactivating a membership that an operator deliberately deactivated.
 */
async function ensureTenantMemberships(client: PoolClient, tenantId?: string, storeId?: string) {
  const scope = scopedTenantId(tenantId);
  const storeScope = scopedStoreId(storeId);
  await client.query(
    `INSERT INTO gpu_tenant_memberships
       (tenant_id, user_id, store_id, role, status, joined_at)
     SELECT tenant_id, id, store_id,
            COALESCE(NULLIF(data->>'role', ''), '店员'),
            CASE WHEN data->>'enabled' = 'false' THEN 'deactivated' ELSE 'active' END,
            NOW()
       FROM gpu_system_users
      WHERE tenant_id = $1 AND store_id = $2
     ON CONFLICT (tenant_id, user_id, store_id) DO NOTHING`,
    [scope, storeScope],
  );
}

async function touchStateRevision(client: PoolClient) {
  await client.query(`
    INSERT INTO gpu_app_meta (key, value, updated_at) VALUES ('stateRevision', '1'::jsonb, NOW())
    ON CONFLICT (key) DO UPDATE SET
      value = to_jsonb(COALESCE((gpu_app_meta.value #>> '{}')::bigint, 0) + 1),
      updated_at = NOW()
  `);
}

export async function getStateRevision() {
  await initializePostgres();
  const result = await getPool().query<{ value: unknown }>("SELECT value FROM gpu_app_meta WHERE key = 'stateRevision'");
  const value = result.rows[0]?.value;
  return typeof value === "number" ? value : Number(value || 0);
}

async function loadLegacyJsonState() {
  if (!LEGACY_IMPORT_ENABLED) return null;
  try {
    const raw = await readFile(LEGACY_DATA_FILE, "utf8");
    return {
      ...createInitialState({ includeCrmDemoData: false }),
      ...(JSON.parse(raw) as Partial<AppState>),
      currentUserId: undefined,
    };
  } catch {
    return null;
  }
}

async function readStateFromPostgres(client: PoolClient, tenantId?: string, storeId?: string): Promise<AppState> {
  const scope = scopedTenantId(tenantId);
  const storeScope = scopedStoreId(storeId);
  const state = createInitialState({ includeCrmDemoData: false });

  for (const { key, table } of collectionTables) {
    const result = await client.query<{ data: unknown }>(`SELECT data FROM ${table} WHERE tenant_id = $1 AND store_id = $2 ORDER BY id ASC`, [scope, storeScope]);
    (state[key] as unknown[]) = result.rows.map((row) => row.data);
  }
  state.systemUsers = state.systemUsers.map((user) => ({
    ...user,
    tenantId: user.tenantId || scope,
    storeId: user.storeId || storeScope,
  }));

  const settings = await client.query<{ current_role: string | null; custom_permissions: unknown; commission_rules: unknown }>(
    "SELECT \"current_role\", custom_permissions, commission_rules FROM gpu_tenant_settings WHERE tenant_id = $1",
    [scope],
  );
  const setting = settings.rows[0];
  if (setting?.current_role) state.currentRole = setting.current_role as AppState["currentRole"];
  // Commercial foundation rows created before the permission setting contract
  // was finalized used `{}` as the JSONB default.  Only the array form is a
  // valid PermissionSettings value; keep the in-memory defaults for malformed
  // legacy rows instead of allowing an object to reach `.find()`/`.map()`.
  if (Array.isArray(setting?.custom_permissions)) {
    state.customPermissions = setting.custom_permissions as AppState["customPermissions"];
  }
  if (setting?.commission_rules && typeof setting.commission_rules === "object") {
    state.commissionRules = setting.commission_rules as AppState["commissionRules"];
  }
  // Keep the legacy app_meta values readable for the default tenant during the
  // migration window. They are intentionally never used as another tenant's
  // authorization or commission source.
  if (scope === DEFAULT_TENANT_ID && !setting) {
    const meta = await client.query<{ key: string; value: unknown }>("SELECT key, value FROM gpu_app_meta");
    for (const row of meta.rows) {
      if (row.key === "currentRole") state.currentRole = row.value as AppState["currentRole"];
      if (row.key === "customPermissions" && Array.isArray(row.value)) {
        state.customPermissions = row.value as AppState["customPermissions"];
      }
      if (row.key === "commissionRules") state.commissionRules = row.value as AppState["commissionRules"];
    }
  }

  state.currentUserId = undefined;
  return normalizeStateConditions(state);
}

async function readStateCollectionsFromPostgres(
  client: PoolClient,
  currentState: AppState,
  keys: CollectionKey[],
  tenantId?: string,
  storeId?: string,
): Promise<AppState> {
  const scope = scopedTenantId(tenantId);
  const storeScope = scopedStoreId(storeId);
  const state = {
    ...currentState,
    currentUserId: undefined,
  };

  for (const { key, table } of getCollectionTablesForKeys(keys)) {
    const result = await client.query<{ data: unknown }>(`SELECT data FROM ${table} WHERE tenant_id = $1 AND store_id = $2 ORDER BY id ASC`, [scope, storeScope]);
    (state[key] as unknown[]) = result.rows.map((row) => row.data);
  }
  state.systemUsers = state.systemUsers.map((user) => ({
    ...user,
    tenantId: user.tenantId || scope,
    storeId: user.storeId || storeScope,
  }));

  const settings = await client.query<{ current_role: string | null; custom_permissions: unknown; commission_rules: unknown }>(
    "SELECT \"current_role\", custom_permissions, commission_rules FROM gpu_tenant_settings WHERE tenant_id = $1",
    [scope],
  );
  const setting = settings.rows[0];
  if (setting?.current_role) state.currentRole = setting.current_role as AppState["currentRole"];
  if (Array.isArray(setting?.custom_permissions)) {
    state.customPermissions = setting.custom_permissions as AppState["customPermissions"];
  }
  if (setting?.commission_rules && typeof setting.commission_rules === "object") {
    state.commissionRules = setting.commission_rules as AppState["commissionRules"];
  } else if (scope === DEFAULT_TENANT_ID && !setting) {
    const meta = await client.query<{ value: unknown }>("SELECT value FROM gpu_app_meta WHERE key = 'commissionRules'");
    if (meta.rows[0]) state.commissionRules = meta.rows[0].value as AppState["commissionRules"];
  }

  return normalizeStateConditions(state);
}

async function writeStateToPostgres(client: PoolClient, nextState: AppState, tenantId?: string, storeId?: string) {
  const scope = scopedTenantId(tenantId);
  const storeScope = scopedStoreId(storeId);
  const state = cloneWithoutRuntimeSession(nextState);

  await writeCollectionsToPostgres(client, state, collectionTables.map(({ key }) => key), scope, storeScope);

  await client.query(
    `INSERT INTO gpu_tenant_settings (tenant_id, "current_role", custom_permissions, commission_rules, updated_at)
     VALUES ($1, $2, $3::jsonb, $4::jsonb, NOW())
     ON CONFLICT (tenant_id) DO UPDATE SET
       "current_role" = EXCLUDED."current_role",
       custom_permissions = EXCLUDED.custom_permissions,
       commission_rules = EXCLUDED.commission_rules,
       updated_at = NOW()`,
    [scope, state.currentRole || null, JSON.stringify(state.customPermissions || []), JSON.stringify(state.commissionRules || {})],
  );
  // Keep app_meta in sync for legacy tooling, but only the default tenant is
  // allowed to write these compatibility keys.
  if (scope === DEFAULT_TENANT_ID) {
    await client.query(
      `INSERT INTO gpu_app_meta (key, value, updated_at) VALUES
        ('currentRole', $1::jsonb, NOW()),
        ('customPermissions', $2::jsonb, NOW()),
        ('commissionRules', $3::jsonb, NOW())
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()`,
      [JSON.stringify(state.currentRole), JSON.stringify(state.customPermissions), JSON.stringify(state.commissionRules)],
    );
  }
}

async function writeCollectionsToPostgres(client: PoolClient, nextState: AppState, keys: CollectionKey[], tenantId?: string, storeId?: string) {
  const scope = scopedTenantId(tenantId);
  const storeScope = scopedStoreId(storeId);
  const state = cloneWithoutRuntimeSession(nextState);

  for (const { key, table } of getCollectionTablesForKeys(keys)) {
    const items = state[key] as unknown[];
    // Logs are immutable + append-only: persist incrementally so a submit never rewrites the
    // whole (capped) log table — it only inserts the few new entries and trims the tail.
    if (key === "logs") {
      await appendOnlyCollection(client, table, items, scope, storeScope);
      continue;
    }
    const rows = items.map((item, index) => ({ id: rowId(item, index), json: JSON.stringify(item) }));
    await bulkUpsertRows(client, table, rows, scope, storeScope);
    const deleteMissing = buildDeleteMissingRowsQuery(table, rows.map((row) => row.id), scope, storeScope);
    await client.query(deleteMissing.sql, deleteMissing.values);
  }
}

async function upsertCollectionRecords(
  client: PoolClient,
  records: StateRecordSave[],
  tenantId?: string,
  storeId?: string,
) {
  const scope = scopedTenantId(tenantId);
  const storeScope = scopedStoreId(storeId);
  for (const record of records) {
    const target = getCollectionTablesForKeys([record.key])[0];
    if (!target) continue;

    const rows = record.items.map((item, index) => ({ id: rowId(item, index), json: JSON.stringify(item) }));
    await bulkUpsertRows(client, target.table, rows, scope, storeScope);
    if (record.deleteIds?.length) {
      await client.query(
        `DELETE FROM ${quoteIdentifier(target.table)} WHERE tenant_id = $1 AND store_id = $2 AND id = ANY($3::text[])`,
        [scope, storeScope, Array.from(new Set(record.deleteIds))],
      );
    }
    if (record.deleteMissing) {
      const deleteMissing = buildDeleteMissingRowsQuery(target.table, rows.map((row) => row.id), scope, storeScope);
      await client.query(deleteMissing.sql, deleteMissing.values);
    }
  }
}

async function snapshotState(client: PoolClient, tenantId?: string, storeId?: string) {
  const state = await readStateFromPostgres(client, tenantId, storeId);
  return cloneWithoutRuntimeSession(state);
}

/**
 * Keep every inspection revision as an append-only record.  The JSONB
 * collection remains the current read model, while this table is the durable
 * evidence needed for re-checks, approvals and later rollback tooling.
 */
export async function appendInspectionVersionInTransaction(
  client: PoolClient,
  record: InspectionRecord,
  tenantId?: string,
  recordedBy?: string,
) {
  const scope = scopedTenantId(tenantId);
  await client.query(
    `INSERT INTO gpu_inspection_versions (tenant_id, inspection_id, record_version, data, recorded_by)
     VALUES ($1, $2, $3, $4::jsonb, $5)
     ON CONFLICT (tenant_id, inspection_id, record_version) DO NOTHING`,
    [scope, record.id, Math.max(1, Number(record.recordVersion || 1)), JSON.stringify(record), recordedBy?.trim() || null],
  );
}

export async function listInspectionVersions<T = InspectionRecord>(inspectionId: string, tenantId?: string): Promise<T[]> {
  await initializePostgres();
  const scope = scopedTenantId(tenantId);
  const result = await getPool().query<{ data: T }>(
    `SELECT data
       FROM gpu_inspection_versions
      WHERE tenant_id = $1 AND inspection_id = $2
      ORDER BY record_version ASC`,
    [scope, inspectionId.trim()],
  );
  return result.rows.map((row) => row.data);
}

export async function loadState(tenantId?: string, storeId?: string): Promise<AppState> {
  const scope = scopedTenantId(tenantId);
  const storeScope = scopedStoreId(storeId);
  await initializePostgres();
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    if (!(await hasPersistedState(client, scope, storeScope))) {
      const legacy = scope === DEFAULT_TENANT_ID ? await loadLegacyJsonState() : null;
      if (!legacy) assertProductionBootstrapPasswordConfigured();
      const initial = legacy || createInitialState({ includeCrmDemoData: false });
      if (scope !== DEFAULT_TENANT_ID && !legacy) initial.systemUsers = [];
      await writeStateToPostgres(client, initial, scope, storeScope);
      await touchStateRevision(client);
    }
    await ensureTenantMemberships(client, scope, storeScope);
    const state = await readStateFromPostgres(client, scope, storeScope);
    await client.query("COMMIT");
    return state;
  } catch (error) {
    await rollbackQuietly(client);
    throw error;
  } finally {
    client.release();
  }
}

export async function loadStateCollections(state: AppState, keys: CollectionKey[], tenantId?: string, storeId?: string): Promise<AppState> {
  const scope = scopedTenantId(tenantId);
  const storeScope = scopedStoreId(storeId);
  if (!keys.length) return state;
  await initializePostgres();
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    if (!(await hasPersistedState(client, scope, storeScope))) {
      const legacy = scope === DEFAULT_TENANT_ID ? await loadLegacyJsonState() : null;
      if (!legacy) assertProductionBootstrapPasswordConfigured();
      const initial = legacy || createInitialState({ includeCrmDemoData: false });
      if (scope !== DEFAULT_TENANT_ID && !legacy) initial.systemUsers = [];
      await writeStateToPostgres(client, initial, scope, storeScope);
      await touchStateRevision(client);
    }
    await ensureTenantMemberships(client, scope, storeScope);
    const nextState = await readStateCollectionsFromPostgres(client, state, keys, scope, storeScope);
    await client.query("COMMIT");
    return nextState;
  } catch (error) {
    await rollbackQuietly(client);
    throw error;
  } finally {
    client.release();
  }
}

export async function saveState(state: AppState, tenantId?: string, storeId?: string) {
  const scope = scopedTenantId(tenantId);
  const storeScope = scopedStoreId(storeId);
  return enqueueStateSave(async () => {
    await initializePostgres();
    const client = await getPool().connect();
    try {
      await client.query("BEGIN");
      await lockTransactionForStateWrite(client);
      await writeStateToPostgres(client, state, scope, storeScope);
      await touchStateRevision(client);
      await client.query("COMMIT");
    } catch (error) {
      await rollbackQuietly(client);
      throw error;
    } finally {
      client.release();
    }
  });
}

export async function saveStateCollections(state: AppState, keys: CollectionKey[], tenantId?: string, storeId?: string) {
  const scope = scopedTenantId(tenantId);
  const storeScope = scopedStoreId(storeId);
  return enqueueStateSave(async () => {
    await initializePostgres();
    const client = await getPool().connect();
    try {
      await client.query("BEGIN");
      await lockTransactionForStateWrite(client);
      await writeCollectionsToPostgres(client, state, keys, scope, storeScope);
      await touchStateRevision(client);
      await client.query("COMMIT");
    } catch (error) {
      await rollbackQuietly(client);
      throw error;
    } finally {
      client.release();
    }
  });
}

export async function saveStateRecords(records: StateRecordSave[], transactionHook?: StateRecordTransactionHook, tenantId?: string, storeId?: string) {
  const scope = scopedTenantId(tenantId);
  const storeScope = scopedStoreId(storeId);
  return enqueueStateSave(async () => {
    await initializePostgres();
    const client = await getPool().connect();
    try {
      await client.query("BEGIN");
      await lockTransactionForStateWrite(client);
      await upsertCollectionRecords(client, records, scope, storeScope);
      await transactionHook?.(client);
      await touchStateRevision(client);
      await client.query("COMMIT");
    } catch (error) {
      await rollbackQuietly(client);
      throw error;
    } finally {
      client.release();
    }
  });
}

function scopedBackupId(baseId: string, tenantId?: string) {
  const scope = scopedTenantId(tenantId);
  return scope === DEFAULT_TENANT_ID ? baseId : `${encodeURIComponent(scope)}::${baseId}`;
}

function backupScopeSql(tenantId?: string) {
  const scope = scopedTenantId(tenantId);
  return scope === DEFAULT_TENANT_ID
    ? { sql: "id NOT LIKE $1", values: ["%::%"] }
    : { sql: "id LIKE $1", values: [`${encodeURIComponent(scope)}::%`] };
}

export async function createManualBackup(tenantId?: string): Promise<{ file: string }> {
  await initializePostgres();
  const client = await getPool().connect();
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const backupId = scopedBackupId(`postgres-backup-${stamp}`, tenantId);
  try {
    await client.query("BEGIN");
    const snapshot = await snapshotState(client, tenantId);
    await client.query(
      "INSERT INTO gpu_db_backups (id, snapshot) VALUES ($1, $2::jsonb)",
      [backupId, JSON.stringify(snapshot)],
    );
    await client.query("COMMIT");
    return { file: `postgres:${backupId}` };
  } catch (error) {
    await rollbackQuietly(client);
    throw error;
  } finally {
    client.release();
  }
}

export async function listBackups(tenantId?: string): Promise<Array<{ name: string; size: number; createdAt: string }>> {
  await initializePostgres();
  const scope = backupScopeSql(tenantId);
  const result = await getPool().query<{ id: string; size: string; created_at: Date }>(`
    SELECT id, pg_column_size(snapshot)::text AS size, created_at
    FROM gpu_db_backups
    WHERE ${scope.sql}
    ORDER BY created_at DESC
    LIMIT 100
  `, scope.values);
  return result.rows.map((row) => ({
    name: row.id,
    size: Number(row.size || 0),
    createdAt: row.created_at.toISOString(),
  }));
}

export async function writeDownloadedBackup(state: AppState): Promise<string> {
  await mkdir(BACKUP_DIR, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const backupFile = path.join(BACKUP_DIR, `postgres-export-${stamp}.json`);
  await writeFile(backupFile, `${JSON.stringify(cloneWithoutRuntimeSession(state), null, 2)}\n`, "utf8");
  return backupFile;
}

/** Claim a daily notification before delivery. A successful report is never sent twice; a failed
 * delivery may be retried, and a stale in-progress delivery becomes retryable after 30 minutes. */
export async function claimDailyNotification(reportDate: string, notificationType: string, tenantId?: string, storeId?: string) {
  await initializePostgres();
  const scope = scopedTenantId(tenantId);
  const storeScope = scopedStoreId(storeId);
  const result = await getPool().query<{ report_date: string }>(`
    INSERT INTO gpu_daily_notifications (tenant_id, store_id, report_date, notification_type, status, attempted_at)
    VALUES ($1, $2, $3, $4, 'sending', NOW())
    ON CONFLICT (tenant_id, store_id, report_date, notification_type) DO UPDATE SET
      status = 'sending', attempted_at = NOW(), error_message = NULL
    WHERE gpu_daily_notifications.status = 'failed'
       OR (gpu_daily_notifications.status = 'sending' AND gpu_daily_notifications.attempted_at < NOW() - INTERVAL '30 minutes')
    RETURNING report_date
  `, [scope, storeScope, reportDate, notificationType]);
  return result.rowCount === 1;
}

export async function markDailyNotificationSent(reportDate: string, notificationType: string, payload: unknown, tenantId?: string, storeId?: string) {
  await initializePostgres();
  const scope = scopedTenantId(tenantId);
  const storeScope = scopedStoreId(storeId);
  await getPool().query(`
    UPDATE gpu_daily_notifications
    SET status = 'sent', sent_at = NOW(), payload = $5::jsonb, error_message = NULL
    WHERE tenant_id = $1 AND store_id = $2 AND report_date = $3 AND notification_type = $4
  `, [scope, storeScope, reportDate, notificationType, JSON.stringify(payload)]);
}

export async function markDailyNotificationFailed(reportDate: string, notificationType: string, errorMessage: string, tenantId?: string, storeId?: string) {
  await initializePostgres();
  const scope = scopedTenantId(tenantId);
  const storeScope = scopedStoreId(storeId);
  await getPool().query(`
    UPDATE gpu_daily_notifications
    SET status = 'failed', error_message = $5
    WHERE tenant_id = $1 AND store_id = $2 AND report_date = $3 AND notification_type = $4
  `, [scope, storeScope, reportDate, notificationType, errorMessage.slice(0, 2000)]);
}

function normalizeDailyClosingDate(value: string) {
  const date = String(value || "").trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : null;
}

export async function getDailyClosing(date: string, tenantId?: string, storeId?: string): Promise<DailyClosing | null> {
  await initializePostgres();
  const normalizedDate = normalizeDailyClosingDate(date);
  if (!normalizedDate) return null;
  const result = await getPool().query<{ data: DailyClosing }>("SELECT data FROM gpu_daily_closings WHERE tenant_id = $1 AND store_id = $2 AND date = $3", [scopedTenantId(tenantId), scopedStoreId(storeId), normalizedDate]);
  return result.rows[0]?.data || null;
}

export async function listDailyClosings(limit = 14, tenantId?: string, storeId?: string): Promise<DailyClosing[]> {
  await initializePostgres();
  const safeLimit = Math.max(1, Math.min(90, Math.floor(Number(limit) || 14)));
  const result = await getPool().query<{ data: DailyClosing }>(
    `SELECT data FROM gpu_daily_closings
      WHERE tenant_id = $1 AND store_id = $2
      ORDER BY date DESC LIMIT $3`,
    [scopedTenantId(tenantId), scopedStoreId(storeId), safeLimit],
  );
  return result.rows.map((row) => row.data);
}

export async function saveDailyClosing(closing: DailyClosing, tenantId?: string, storeId?: string): Promise<DailyClosing> {
  await initializePostgres();
  const normalizedDate = normalizeDailyClosingDate(closing.date);
  if (!normalizedDate) throw new Error("日结日期必须是 YYYY-MM-DD");
  const scope = scopedTenantId(tenantId);
  const storeScope = scopedStoreId(storeId);
  const result = await getPool().query<{ data: DailyClosing }>(`
    INSERT INTO gpu_daily_closings (tenant_id, store_id, date, data, updated_at) VALUES ($1, $2, $3, $4::jsonb, NOW())
    ON CONFLICT (tenant_id, store_id, date) DO NOTHING
    RETURNING data
  `, [scope, storeScope, normalizedDate, JSON.stringify(closing)]);
  if (result.rows[0]?.data) return result.rows[0].data;
  return (await getDailyClosing(closing.date, tenantId, storeId)) || closing;
}

export const dataFilePath = "postgresql:DATABASE_URL";
