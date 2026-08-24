import assert from "node:assert/strict";
import test from "node:test";
import {apiRequest, clearBrowserAuthState, setCsrfToken} from "./client";

test("browser API requests use same-origin cookies and attach CSRF only to mutations", async () => {
  const previousFetch = globalThis.fetch;
  const requests: Array<{input: string; init?: RequestInit}> = [];
  globalThis.fetch = async (input, init) => {
    requests.push({input: String(input), init});
    return new Response(JSON.stringify({data: {ok: true}}), {status: 200, headers: {"Content-Type": "application/json"}});
  };
  try {
    setCsrfToken("csrf-token");
    await apiRequest("/api/write", {method: "POST", body: "{}"});
    await apiRequest("/api/read");
    assert.equal(requests[0]?.init?.credentials, "same-origin");
    assert.equal(new Headers(requests[0]?.init?.headers).get("X-CSRF-Token"), "csrf-token");
    assert.equal(new Headers(requests[0]?.init?.headers).has("Authorization"), false);
    assert.equal(new Headers(requests[1]?.init?.headers).has("X-CSRF-Token"), false);
  } finally {
    clearBrowserAuthState();
    globalThis.fetch = previousFetch;
  }
});
