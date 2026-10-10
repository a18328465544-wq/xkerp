import assert from "node:assert/strict";
import test from "node:test";
import {assertStateRuntimeMode, resolveStateRuntimeMode, resolveVoiceRuntimeConfig} from "./runtimeConfig.ts";

test("development and test runtimes default to the documented single-instance mode", () => {
  assert.equal(resolveStateRuntimeMode({NODE_ENV: "test"}), "single-instance");
  assert.equal(resolveStateRuntimeMode({NODE_ENV: "development"}), "single-instance");
  assert.equal(assertStateRuntimeMode({NODE_ENV: "test"}), "single-instance");
});

test("production requires an explicit single-instance declaration", () => {
  assert.equal(resolveStateRuntimeMode({NODE_ENV: "production"}), undefined);
  assert.throws(
    () => assertStateRuntimeMode({NODE_ENV: "production"}),
    /STATE_RUNTIME_MODE=single-instance/,
  );
  assert.equal(assertStateRuntimeMode({NODE_ENV: "production", STATE_RUNTIME_MODE: "single-instance"}), "single-instance");
  assert.throws(
    () => assertStateRuntimeMode({NODE_ENV: "production", STATE_RUNTIME_MODE: "cluster"}),
    /STATE_RUNTIME_MODE=single-instance/,
  );
});

test("voice runtime defaults to text mode without a key and bounds configurable limits", () => {
  const defaults = resolveVoiceRuntimeConfig({AI_API_KEY: ""});
  assert.equal(defaults.asrProvider, "dashscope");
  assert.equal(defaults.asrApiKey, "");
  assert.equal(defaults.asrModel, "qwen3-asr-flash");
  assert.equal(defaults.maxSeconds, 30);
  assert.equal(defaults.rateLimitPerMinute, 20);
  assert.equal(defaults.aiEnabled, false);

  const configured = resolveVoiceRuntimeConfig({
    VOICE_ASR_PROVIDER: "tencent", VOICE_ASR_API_KEY: "asr-key", VOICE_ASR_SECRET_ID: "id", VOICE_ASR_SECRET_KEY: "secret",
    VOICE_ASR_MODEL: "custom-model", VOICE_ASR_BASE_URL: "https://asr.example/v1", VOICE_MAX_SECONDS: "90",
    VOICE_RATE_LIMIT_PER_MINUTE: "0", AI_API_KEY: "ai-key",
  });
  assert.equal(configured.asrProvider, "tencent");
  assert.equal(configured.asrSecretId, "id");
  assert.equal(configured.asrModel, "custom-model");
  assert.equal(configured.asrBaseUrl, "https://asr.example/v1");
  assert.equal(configured.maxSeconds, 60);
  assert.equal(configured.rateLimitPerMinute, 1);
  assert.equal(configured.aiEnabled, true);
});
