import assert from "node:assert/strict";
import test from "node:test";
import {voiceApi} from "./voiceApi";

const originalFetch = globalThis.fetch;

test("voice status reads the authenticated feature fallback contract", async () => {
  const calls: Array<{url: string; init?: RequestInit}> = [];
  globalThis.fetch = async (input, init) => {
    calls.push({url: String(input), init});
    return new Response(JSON.stringify({asrEnabled: false, aiEnabled: false, maxSeconds: 30}), {status: 200, headers: {"content-type": "application/json"}});
  };
  try {
    assert.deepEqual(await voiceApi.status(), {asrEnabled: false, aiEnabled: false, maxSeconds: 30});
    assert.equal(calls[0]?.url, "/api/voice/status");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("voice transcribe posts only a WAV blob to the read-only route", async () => {
  const calls: Array<{url: string; init?: RequestInit}> = [];
  globalThis.fetch = async (input, init) => {
    calls.push({url: String(input), init});
    return new Response(JSON.stringify({text: "回收一张 4090", durationMs: 2300, provider: "mock"}), {status: 200, headers: {"content-type": "application/json"}});
  };
  try {
    const audio = new Blob([new Uint8Array([1, 2, 3])], {type: "audio/wav"});
    assert.equal((await voiceApi.transcribe(audio)).text, "回收一张 4090");
    assert.equal(calls[0]?.url, "/api/voice/transcribe");
    assert.equal(new Headers(calls[0]?.init?.headers).get("Content-Type"), "audio/wav");
    assert.equal(calls[0]?.init?.body, audio);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("voice transcribe refuses a non-WAV payload before sending", async () => {
  let called = false;
  globalThis.fetch = async () => {
    called = true;
    return new Response("{}", {status: 200});
  };
  try {
    assert.throws(() => voiceApi.transcribe(new Blob(["webm"], {type: "audio/webm"})), /格式无效/);
    assert.equal(called, false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("voice parse sends scene and transcript only to the read-only draft route", async () => {
  const calls: Array<{url: string; init?: RequestInit}> = [];
  globalThis.fetch = async (input, init) => {
    calls.push({url: String(input), init});
    return new Response(JSON.stringify({data: {parseId: "draft-1", scene: "purchase", transcript: "回收一张 4090", source: "rules", purchase: {partner: {query: "", candidates: []}, lines: [], payment: undefined}, issues: []}}), {status: 200, headers: {"content-type": "application/json"}});
  };
  try {
    const result = await voiceApi.parse({text: "回收一张 4090", scene: "purchase"});
    assert.equal(result.parseId, "draft-1");
    assert.equal(calls[0]?.url, "/api/voice/parse");
    assert.equal(calls[0]?.init?.method, "POST");
    assert.deepEqual(JSON.parse(String(calls[0]?.init?.body)), {text: "回收一张 4090", scene: "purchase"});
  } finally {
    globalThis.fetch = originalFetch;
  }
});
