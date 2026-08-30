import assert from "node:assert/strict";
import test from "node:test";
import {
  createStateProxy,
  getCurrentTenantContext,
  replaceCurrentState,
  runTenantContext,
  setFallbackState,
} from "./requestTenantContext.ts";

test("replacing request state with the shared proxy preserves the concrete tenant snapshot", () => {
  setFallbackState({ value: "fallback" });
  const proxy = createStateProxy<{ value: string }>();

  runTenantContext({ tenantId: "tenant-a", storeId: "store-a", state: { value: "tenant" } }, () => {
    replaceCurrentState(proxy);

    assert.equal(proxy.value, "tenant");
    proxy.value = "updated";
    assert.equal(getCurrentTenantContext()?.state.value, "updated");
  });

  assert.equal(proxy.value, "fallback");
});
