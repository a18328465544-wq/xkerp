import assert from "node:assert/strict";
import { createServer } from "node:http";
import express from "express";
import test from "node:test";
import { createRequireAuth, createRequireMenu, createRequireOpenApiToken } from "./httpAuth.ts";

type TestUser = { id: string; allowedMenus: string[] };

async function start(app: express.Express) {
  const server = createServer(app);
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("test server did not start");
  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    close: () => new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve())),
  };
}

test("HTTP auth boundary distinguishes anonymous, unauthorized, and permitted users", async () => {
  const users: Record<string, TestUser> = {
    worker: { id: "worker", allowedMenus: ["dashboard"] },
    boss: { id: "boss", allowedMenus: ["all"] },
  };
  const sessions = {
    async resolve(token: string | null) {
      return token && users[token] ? { userId: token } : null;
    },
    async revoke() {},
  };
  const app = express();
  const denials: Array<{ status: number; code: string }> = [];
  let handlerCalls = 0;
  app.get(
    "/api/finance/daily-closings",
    createRequireAuth(sessions, (userId) => users[userId] || null, { onDenied: (_req, details) => denials.push(details) }),
    createRequireMenu("finance", (user) => user, { onDenied: (_req, details) => denials.push(details) }),
    (_req, res) => {
      handlerCalls += 1;
      res.json({ data: "ok" });
    },
  );
  const server = await start(app);
  try {
    const anonymous = await fetch(`${server.baseUrl}/api/finance/daily-closings`);
    assert.equal(anonymous.status, 401);

    const unauthorized = await fetch(`${server.baseUrl}/api/finance/daily-closings`, {
      headers: { Authorization: "Bearer worker" },
    });
    assert.equal(unauthorized.status, 403);

    const permitted = await fetch(`${server.baseUrl}/api/finance/daily-closings`, {
      headers: { Authorization: "Bearer boss" },
    });
    assert.equal(permitted.status, 200);
    assert.equal(handlerCalls, 1);
    assert.deepEqual(denials.map(({ status, code }) => ({ status, code })), [
      { status: 401, code: "UNAUTHORIZED" },
      { status: 403, code: "FORBIDDEN" },
    ]);
  } finally {
    await server.close();
  }
});

test("open API token boundary accepts only the configured token", async () => {
  const app = express();
  const denials: Array<{ status: number; code: string }> = [];
  app.get("/open", createRequireOpenApiToken("open-secret", { onDenied: (_req, details) => denials.push(details) }), (_req, res) => res.json({ ok: true }));
  const server = await start(app);
  try {
    const missing = await fetch(`${server.baseUrl}/open`);
    assert.equal(missing.status, 401);

    const wrong = await fetch(`${server.baseUrl}/open`, {
      headers: { Authorization: "Bearer wrong-token" },
    });
    assert.equal(wrong.status, 401);

    const correct = await fetch(`${server.baseUrl}/open`, {
      headers: { Authorization: "Bearer open-secret" },
    });
    assert.equal(correct.status, 200);
    assert.deepEqual(denials.map(({ status, code }) => ({ status, code })), [
      { status: 401, code: "OPEN_API_UNAUTHORIZED" },
      { status: 401, code: "OPEN_API_UNAUTHORIZED" },
    ]);
  } finally {
    await server.close();
  }
});
