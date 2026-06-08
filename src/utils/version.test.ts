import assert from "node:assert/strict";
import test from "node:test";

import { APP_VERSION, getVersionNoticeState } from "./version";

test("version notice appears only when stored version is different", () => {
  assert.equal(APP_VERSION, "1.3.19");
  assert.equal(getVersionNoticeState(null).shouldShow, true);
  assert.equal(getVersionNoticeState("1.0.0").shouldShow, true);
  assert.equal(getVersionNoticeState(APP_VERSION).shouldShow, false);
});
