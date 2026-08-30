import assert from "node:assert/strict";
import test from "node:test";
import type {RequestHandler} from "express";
import {domainSnapshotRouteContracts, registerDomainSnapshotRoutes} from "./routes/domainSnapshots.ts";
import {createDomainSnapshotRefresh} from "./routes/domainSnapshotRefresh.ts";

test("domain snapshot routes are unique and never expose unrelated audit or user collections", () => {
  const paths = domainSnapshotRouteContracts.map((route) => route.path);
  assert.equal(new Set(paths).size, paths.length);
  for (const route of domainSnapshotRouteContracts) {
    assert.ok(route.menus.length > 0, `${route.path} must declare a permission boundary`);
    assert.ok(route.keys.length > 0, `${route.path} must declare a bounded read model`);
    assert.equal(route.keys.includes("logs"), false, `${route.path} must not leak audit logs`);
    assert.equal(route.keys.includes("systemUsers"), false, `${route.path} must not leak user accounts`);
  }
});

test("high-risk finance and return snapshots expose only their declared business dependencies", () => {
  const finance = domainSnapshotRouteContracts.find((route) => route.path === "/api/finance/dashboard");
  assert.deepEqual(finance?.menus, ["finance"]);
  assert.deepEqual(finance?.keys, [
    "settlementAccounts",
    "settlementLedger",
    "financeLedger",
    "salesInvoices",
    "purchaseInvoices",
    "returnOrders",
    "inventory",
  ]);
  const returns = domainSnapshotRouteContracts.find((route) => route.path === "/api/returns/reference");
  assert.ok(returns?.menus.includes("return_orders"));
  assert.equal(returns?.keys.includes("financeLedger"), false);
});

test("domain snapshots refresh cached state before permission and projection", () => {
  const registrations: Array<{path: string; handlers: RequestHandler[]}> = [];
  const app = {
    get(path: string, ...handlers: RequestHandler[]) {
      registrations.push({path, handlers});
      return app;
    },
  } as unknown as Parameters<typeof registerDomainSnapshotRoutes>[0];
  const calls: string[] = [];
  const refreshState: RequestHandler = (_req, _res, next) => {
    calls.push("refresh");
    next();
  };
  const requireMenu = (menuId: string): RequestHandler => (_req, _res, next) => {
    calls.push(`permission:${menuId}`);
    next();
  };
  const requireAnyMenu = (menuIds: string[]): RequestHandler => (_req, _res, next) => {
    calls.push(`permission:${menuIds.join(",")}`);
    next();
  };
  const detailResponse = {json: () => calls.push("projection")} as unknown as Parameters<RequestHandler>[1];
  registerDomainSnapshotRoutes(app, {
    requireMenu,
    requireAnyMenu,
    refreshState,
    publicStatePatch: () => ({}),
  });

  const detail = registrations.find((registration) => registration.path === "/api/purchase-invoices/detail");
  assert.ok(detail);
  const request = {} as Parameters<RequestHandler>[0];
  let nextIndex = 0;
  const next = () => {
    const handler = detail.handlers[nextIndex++];
    if (handler) handler(request, detailResponse, next);
  };
  next();
  assert.deepEqual(calls, ["refresh", "permission:purchase_list", "projection"]);
});

test("domain snapshot refresh reloads only when the database revision advances", async () => {
  let databaseRevision = 2;
  let stateRevision = 1;
  let reloadCount = 0;
  const middleware = createDomainSnapshotRefresh({
    getDatabaseRevision: async () => databaseRevision,
    getStateRevision: () => stateRevision,
    reloadState: async () => {
      reloadCount += 1;
      stateRevision = databaseRevision;
    },
  });
  const run = () => new Promise<void>((resolve, reject) => {
    middleware({} as Parameters<RequestHandler>[0], {} as Parameters<RequestHandler>[1], (error?: unknown) => error ? reject(error) : resolve());
  });

  await run();
  assert.equal(reloadCount, 1);
  databaseRevision = stateRevision;
  await run();
  assert.equal(reloadCount, 1);
});
