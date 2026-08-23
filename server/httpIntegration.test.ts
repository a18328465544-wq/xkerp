import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import test from "node:test";
import { assertTestDatabaseConfigured, acquireStateWriteLock, withDatabaseTransaction } from "./db.ts";
import { OPERATIONAL_PROJECTION_SCHEMA_VERSION } from "./operationalSchema.ts";

const integrationEnabled = Boolean(
  process.env.NODE_ENV === "test"
  && process.env.TEST_DATABASE_URL
  && process.env.RUN_BACKEND_HTTP_TESTS === "1",
);

if (process.env.RUN_BACKEND_HTTP_TESTS === "1") assertTestDatabaseConfigured();

async function listenEphemeral(server: Server) {
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("HTTP test server did not receive a port");
  return `http://127.0.0.1:${address.port}`;
}

async function closeServer(server: Server) {
  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
}

test("private finance routes reject anonymous HTTP requests with 401 and a request id", {
  skip: !integrationEnabled,
}, async () => {
  const { createApp } = await import("./app.ts");
  const server = createServer(createApp());
  const baseUrl = await listenEphemeral(server);
  try {
    const response = await fetch(`${baseUrl}/api/finance/daily-closings`);
    const payload = await response.json() as { error?: { code?: string; requestId?: string } };
    assert.equal(response.status, 401);
    assert.equal(payload.error?.code, "UNAUTHORIZED");
    assert.ok(payload.error?.requestId);
    assert.equal(response.headers.get("x-request-id"), payload.error?.requestId);
  } finally {
    await closeServer(server);
  }
});

test("liveness stays public while readiness verifies the PostgreSQL-backed app state", {
  skip: !integrationEnabled,
}, async () => {
  const { createApp } = await import("./app.ts");
  const server = createServer(createApp());
  const baseUrl = await listenEphemeral(server);
  try {
    const health = await fetch(`${baseUrl}/api/health`);
    assert.equal(health.status, 200);
    const ready = await fetch(`${baseUrl}/api/ready`);
    assert.equal(ready.status, 200);
    const payload = await ready.json() as { data?: { ok?: boolean; stateRevision?: number } };
    assert.equal(payload.data?.ok, true);
    assert.equal(typeof payload.data?.stateRevision, "number");
  } finally {
    await closeServer(server);
  }
});

test("open inventory endpoints keep token authentication separate from session auth", {
  skip: !integrationEnabled,
}, async () => {
  const { createApp } = await import("./app.ts");
  const server = createServer(createApp());
  const baseUrl = await listenEphemeral(server);
  try {
    const response = await fetch(`${baseUrl}/api/open/inventory/items`, {
      headers: { Authorization: "Bearer deliberately-wrong-open-api-token" },
    });
    assert.ok([401, 503].includes(response.status));
    const payload = await response.json() as { error?: { code?: string } };
    assert.ok(["OPEN_API_UNAUTHORIZED", "OPEN_API_NOT_CONFIGURED"].includes(payload.error?.code || ""));
  } finally {
    await closeServer(server);
  }
});

test("a configured login can reach finance only by its effective menu permission", {
  skip: !integrationEnabled || !process.env.BACKEND_TEST_USERNAME || !process.env.BACKEND_TEST_PASSWORD,
}, async () => {
  const { createApp } = await import("./app.ts");
  const server = createServer(createApp());
  const baseUrl = await listenEphemeral(server);
  try {
    const login = await fetch(`${baseUrl}/api/auth/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        username: process.env.BACKEND_TEST_USERNAME,
        password: process.env.BACKEND_TEST_PASSWORD,
      }),
    });
    assert.equal(login.status, 200);
    const loginPayload = await login.json() as { data?: { token?: string; user?: { role?: string } } };
    const token = loginPayload.data?.token;
    assert.ok(token);

    const finance = await fetch(`${baseUrl}/api/finance/commission-rules`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const expectedStatus = loginPayload.data?.user?.role === "老板" ? 200 : 403;
    assert.equal(finance.status, expectedStatus);
  } finally {
    await closeServer(server);
  }
});

test("PostgreSQL advisory writes serialize independent database connections", {
  skip: !integrationEnabled,
}, async () => {
  const firstRelease = await acquireStateWriteLock();
  let secondAcquired = false;
  const secondReleasePromise = (async () => {
    const release = await acquireStateWriteLock();
    secondAcquired = true;
    return release;
  })();

  try {
    await new Promise((resolve) => setTimeout(resolve, 40));
    assert.equal(secondAcquired, false);
  } finally {
    await firstRelease();
  }

  const secondRelease = await secondReleasePromise;
  assert.equal(secondAcquired, true);
  await secondRelease();
});

test("operational projection migration is applied with generated inventory columns", {
  skip: !integrationEnabled,
}, async () => {
  await withDatabaseTransaction(async (client) => {
    const migration = await client.query<{ version: string }>(
      "SELECT version FROM gpu_schema_migrations WHERE version = $1",
      [OPERATIONAL_PROJECTION_SCHEMA_VERSION],
    );
    assert.equal(migration.rows[0]?.version, OPERATIONAL_PROJECTION_SCHEMA_VERSION);
    const columns = await client.query<{ column_name: string; is_generated: string }>(`
      SELECT column_name, is_generated
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'gpu_inventory'
        AND column_name IN ('op_sn', 'op_status', 'op_entry_time')
      ORDER BY column_name
    `);
    assert.deepEqual(columns.rows, [
      { column_name: "op_entry_time", is_generated: "ALWAYS" },
      { column_name: "op_sn", is_generated: "ALWAYS" },
      { column_name: "op_status", is_generated: "ALWAYS" },
    ]);
  });
});
