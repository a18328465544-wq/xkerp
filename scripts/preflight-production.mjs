import "dotenv/config";
import { stat } from "node:fs/promises";
import path from "node:path";
import { Pool } from "pg";

const projectRoot = process.cwd();
const requiredEnv = ["DATABASE_URL", "OPEN_API_TOKEN", "BOOTSTRAP_ADMIN_PASSWORD"];
const requiredMigrations = ["crm-foundation-v2"];
const requiredTables = [
  "gpu_inventory",
  "gpu_purchase_invoices",
  "gpu_sales_invoices",
  "gpu_finance_ledger",
  "gpu_system_users",
  "gpu_sessions",
];
const checks = [];

function pass(label, detail = "") {
  checks.push({ status: "PASS", label, detail });
}

function fail(label, detail) {
  checks.push({ status: "FAIL", label, detail });
}

for (const name of requiredEnv) {
  if (process.env[name]?.trim()) pass(`env ${name}`);
  else fail(`env ${name}`, "missing or empty");
}

const placeholderPattern = /change[_-]?me|replace-with|example|placeholder/i;
for (const name of ["OPEN_API_TOKEN", "BOOTSTRAP_ADMIN_PASSWORD"]) {
  const value = process.env[name]?.trim() || "";
  if (value && value.length >= 16 && !placeholderPattern.test(value)) pass(`secret ${name}`);
  else fail(`secret ${name}`, "must be at least 16 characters and must not be a placeholder");
}

if (process.env.POSTGRES_IMPORT_LEGACY_JSON === "false") pass("legacy JSON import disabled");
else fail("legacy JSON import disabled", "set POSTGRES_IMPORT_LEGACY_JSON=false after PostgreSQL cutover");

if (process.env.NODE_ENV === "production") pass("env NODE_ENV");
else fail("env NODE_ENV", "must be production; run with NODE_ENV=production");

let pool;
if (process.env.DATABASE_URL?.trim()) {
  pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    max: 1,
    connectionTimeoutMillis: 5000,
    idleTimeoutMillis: 5000,
  });
  try {
    await pool.query("SELECT 1");
    pass("database connection");
    const migrationTable = await pool.query(
      "SELECT to_regclass('public.gpu_schema_migrations') AS table_name",
    );
    if (migrationTable.rows[0]?.table_name) {
      const migrations = await pool.query("SELECT version FROM gpu_schema_migrations ORDER BY version");
      const applied = new Set(migrations.rows.map((row) => String(row.version)));
      const missing = requiredMigrations.filter((version) => !applied.has(version));
      if (missing.length === 0) pass("migration status", `required=${requiredMigrations.join(",")}`);
      else fail("migration status", `missing=${missing.join(",")}`);
    } else {
      fail("migration status", "gpu_schema_migrations table does not exist");
    }
    const tables = await pool.query(
      "SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' AND table_name = ANY($1::text[])",
      [requiredTables],
    );
    const existingTables = new Set(tables.rows.map((row) => String(row.table_name)));
    const missingTables = requiredTables.filter((table) => !existingTables.has(table));
    if (missingTables.length === 0) pass("core schema tables", `${requiredTables.length} present`);
    else fail("core schema tables", `missing=${missingTables.join(",")}`);
  } catch (error) {
    fail("database/migration checks", error instanceof Error ? error.message : "database query failed");
  } finally {
    await pool.end().catch(() => undefined);
  }
} else {
  fail("database connection", "DATABASE_URL is unavailable");
}

const buildFiles = ["dist/index.html", "server-dist/index.mjs", "server-dist/daily-report.mjs"];
for (const relativePath of buildFiles) {
  try {
    const file = await stat(path.join(projectRoot, relativePath));
    if (file.isFile() && file.size > 0) pass(`build file ${relativePath}`, `${file.size} bytes`);
    else fail(`build file ${relativePath}`, "file is empty or not a regular file");
  } catch {
    fail(`build file ${relativePath}`, "file is missing; run npm run build");
  }
}

console.log("Production readiness:");
for (const check of checks) {
  const suffix = check.detail ? ` — ${check.detail}` : "";
  console.log(`${check.status}: ${check.label}${suffix}`);
}

const failed = checks.filter((check) => check.status === "FAIL");
if (failed.length) {
  console.log(`FAIL: ${failed.length} production preflight check(s) failed.`);
  process.exitCode = 1;
} else {
  console.log("PASS: all production preflight checks passed.");
}
