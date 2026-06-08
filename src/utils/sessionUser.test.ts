/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import test from "node:test";
import assert from "node:assert/strict";
import { getDefaultHandlerName, getLockedHandlerFieldState } from "./sessionUser";

test("default handler prefers logged-in user display name", () => {
  assert.equal(
    getDefaultHandlerName({ displayName: "财务小李" }, "老板"),
    "财务小李"
  );
});

test("default handler falls back to current role when no user is logged in", () => {
  assert.equal(getDefaultHandlerName(null, "店员"), "店员");
});

test("locked handler field state is read-only and tied to logged-in user", () => {
  assert.deepEqual(getLockedHandlerFieldState({ displayName: "仓库小李" }, "店员"), {
    value: "仓库小李",
    readOnly: true,
    disabled: true
  });
});
