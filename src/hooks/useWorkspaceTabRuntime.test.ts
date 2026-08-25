import assert from "node:assert/strict";
import test from "node:test";
import {keepAliveKeysForTab, resolveWorkspaceKeepAliveKey, shouldBlockWorkspaceNavigation} from "./useWorkspaceTabRuntime";

test("workspace keep-alive routes use stable entry keys", () => {
  assert.equal(resolveWorkspaceKeepAliveKey("/sales/new"), "sales-create");
  assert.equal(resolveWorkspaceKeepAliveKey("/purchase/new"), "purchase-create");
  assert.equal(resolveWorkspaceKeepAliveKey("/finance"), null);
});

test("closing a workspace tab releases every live entry owned by that tab", () => {
  assert.deepEqual(keepAliveKeysForTab("sales_add"), ["sales-create"]);
  assert.deepEqual(keepAliveKeysForTab("assembly"), ["assembly"]);
  assert.deepEqual(keepAliveKeysForTab("finance"), []);
});

test("tab switching preserves dirty forms while ordinary navigation remains guarded", () => {
  assert.equal(shouldBlockWorkspaceNavigation(true, "switch"), false);
  assert.equal(shouldBlockWorkspaceNavigation(true, "close"), true);
  assert.equal(shouldBlockWorkspaceNavigation(true, null), true);
  assert.equal(shouldBlockWorkspaceNavigation(false, "close"), false);
});
