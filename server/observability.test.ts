import assert from "node:assert/strict";
import test from "node:test";
import { redactRequestPath, safeErrorMessage } from "./observability.ts";

test("request logs redact sensitive query values while keeping safe filters", () => {
  const redacted = redactRequestPath("/api/export/finance?token=private-token&page=2&keyword=RTX%204090");
  const query = new URLSearchParams(redacted.split("?", 2)[1]);
  assert.equal(query.get("token"), "[REDACTED]");
  assert.equal(query.get("page"), "2");
  assert.equal(query.get("keyword"), "RTX 4090");
  assert.doesNotMatch(redacted, /private-token/);
});

test("error logs redact bearer credentials and labeled secrets", () => {
  const message = safeErrorMessage(new Error("Authorization: Bearer private-token password=private-password"));
  assert.doesNotMatch(message, /private-token|private-password/);
  assert.match(message, /REDACTED/);
});
