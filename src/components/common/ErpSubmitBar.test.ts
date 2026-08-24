import assert from "node:assert/strict";
import test from "node:test";
import {resolveErpSubmitState} from "./ErpSubmitBar";

test("submit state is invalid until the form is actually valid", () => {
  assert.equal(resolveErpSubmitState({canSubmit: false, submitting: false}), "invalid");
  assert.equal(resolveErpSubmitState({canSubmit: true, submitting: false}), "ready");
});

test("submitting takes precedence over readiness", () => {
  assert.equal(resolveErpSubmitState({canSubmit: true, submitting: true}), "submitting");
  assert.equal(resolveErpSubmitState({canSubmit: false, submitting: true}), "submitting");
});
