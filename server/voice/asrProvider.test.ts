import assert from "node:assert/strict";
import test from "node:test";
import {resolveVoiceRuntimeConfig} from "../runtimeConfig.ts";
import {createDashScopeAsrProvider} from "./asrProvider.ts";

test("DashScope adapter uses the documented Qwen audio payload and terminology context", async () => {
  const config = resolveVoiceRuntimeConfig({VOICE_ASR_API_KEY: "mock-secret", VOICE_ASR_MODEL: "qwen3-asr-flash", VOICE_ASR_BASE_URL: "https://asr.example/v1/"});
  let url = "";
  let headers = new Headers();
  let body: Record<string, unknown> = {};
  const provider = createDashScopeAsrProvider(config, async (input, init) => {
    url = String(input);
    headers = new Headers(init?.headers);
    body = JSON.parse(String(init?.body)) as Record<string, unknown>;
    return new Response(JSON.stringify({choices: [{message: {content: "识别文本"}}]}), {status: 200});
  });
  const result = await provider.transcribe({audio: Buffer.from("fake wav"), mimeType: "audio/wav", sampleRate: 16_000, hints: ["RTX 4090", ...Array.from({length: 205}, (_, index) => `型号${index}`)]});
  assert.equal(result.text, "识别文本");
  assert.equal(url, "https://asr.example/v1/chat/completions");
  assert.equal(headers.get("authorization"), "Bearer mock-secret");
  assert.equal(body.model, "qwen3-asr-flash");
  assert.deepEqual(body.asr_options, {enable_itn: false});
  const messages = body.messages as Array<{role: string; content: unknown}>;
  assert.equal(messages[0]?.role, "system");
  assert.equal((messages[0]?.content as string).split("、").length, 200);
  const audio = (messages[1]?.content as Array<{input_audio: {data: string}}>)[0]?.input_audio.data;
  assert.equal(audio, `data:audio/wav;base64,${Buffer.from("fake wav").toString("base64")}`);
});
