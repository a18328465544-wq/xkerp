import "dotenv/config";
import { access } from "node:fs/promises";
import path from "node:path";
import { Pool } from "pg";

const projectRoot = process.cwd();
const requiredEnv = ["DATABASE_URL", "OPEN_API_TOKEN", "BOOTSTRAP_ADMIN_PASSWORD"];
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
      const migrations = await pool.query(
        "SELECT version, applied_at FROM gpu_schema_migrations ORDER BY applied_at DESC LIMIT 1",
      );
      if (migrations.rows[0]?.version) {
        pass("migration status", `latest=${String(migrations.rows[0].version)}`);
      } else {
        fail("migration status", "migration table exists but has no applied version");
      }
    } else {
      fail("migration status", "gpu_schema_migrations table does not exist");
    }
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
    await access(path.join(projectRoot, relativePath));
    pass(`build file ${relativePath}`);
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
