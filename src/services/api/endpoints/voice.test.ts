import assert from "node:assert/strict";
import test from "node:test";
import {ApiError} from "../client";
import {voiceApi} from "./voice";

test("voice status unwraps the backend data envelope for both available and unavailable ASR", async () => {
  const original = globalThis.fetch;
  try {
    for (const asrEnabled of [true, false]) {
      const data = {asrEnabled, aiEnabled: true, maxSeconds: 30};
      globalThis.fetch = async () => Response.json({data});
      assert.deepEqual(await voiceApi.status(), data);
    }
  } finally { globalThis.fetch = original; }
});

test("voice transcription unwraps text and preserves WAV transport and cancellation", async () => {
  const original = globalThis.fetch;
  const controller = new AbortController();
  const audio = new Blob(["mock audio"], {type: "audio/wav"});
  const data = {text: "采购一张 4090", durationMs: 1000, provider: "mock"};
  try {
    globalThis.fetch = async (input, init) => {
      assert.equal(input, "/api/voice/transcribe");
      assert.equal(init?.body, audio);
      assert.equal(init?.signal, controller.signal);
      assert.equal(new Headers(init?.headers).get("Content-Type"), "audio/wav");
      return Response.json({data});
    };
    assert.deepEqual(await voiceApi.transcribe(audio, controller.signal), data);
  } finally { globalThis.fetch = original; }
});

test("voice endpoints reject malformed envelopes and empty transcriptions instead of silently losing drafts", async () => {
  const original = globalThis.fetch;
  try {
    globalThis.fetch = async () => Response.json({});
    await assert.rejects(voiceApi.status(), /使用文字录入/);
    await assert.rejects(voiceApi.transcribe(new Blob([], {type: "audio/wav"})), /未识别到有效文字/);
    globalThis.fetch = async () => Response.json({data: {text: "  "}});
    await assert.rejects(voiceApi.transcribe(new Blob([], {type: "audio/wav"})), /未识别到有效文字/);
  } finally { globalThis.fetch = original; }
});

test("voice parse keeps rate-limit details for the existing reparse feedback", async () => {
  const original = globalThis.fetch;
  try {
    globalThis.fetch = async () => Response.json({error: {code: "VOICE_RATE_LIMITED", message: "请稍后再试"}}, {status: 429});
    await assert.rejects(voiceApi.parse({scene: "auto", text: "采购一张4090"}), (error: unknown) => error instanceof ApiError && error.status === 429 && error.code === "VOICE_RATE_LIMITED");
  } finally { globalThis.fetch = original; }
});
