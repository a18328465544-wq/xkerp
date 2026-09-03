import assert from "node:assert/strict";
import test from "node:test";
import {invalidateErpDomains} from "./invalidation";

test("invalidateErpDomains maps each domain once and keeps the caller order", async () => {
  const keys: unknown[][] = [];
  const queryClient = {
    invalidateQueries: async ({queryKey}: {queryKey: readonly unknown[]}) => {
      keys.push([...queryKey]);
    },
  };

  await invalidateErpDomains(queryClient as never, ["finance", "inventory", "finance", "state"]);

  assert.deepEqual(keys, [["finance"], ["inventory"], ["state"]]);
});
