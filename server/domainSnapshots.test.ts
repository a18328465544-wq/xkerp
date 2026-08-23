import assert from "node:assert/strict";
import test from "node:test";
import { domainSnapshotRouteContracts } from "./routes/domainSnapshots.ts";

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
