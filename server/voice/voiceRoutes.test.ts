import assert from "node:assert/strict";
import test from "node:test";
import express, {type RequestHandler} from "express";
import type {AddressInfo} from "node:net";
import type {AsrProvider} from "./asrProvider.ts";
import {resolveVoiceRuntimeConfig} from "../runtimeConfig.ts";
import type {AppState} from "../store.ts";
import {createVoiceAsrHints, registerVoiceRoutes, resetVoiceAsrCooldownForTests, type VoiceSafeEvent} from "./voiceRoutes.ts";

type JsonResponse<T = unknown> = {data?: T; error?: {code?: string}};

async function readJson<T = unknown>(response: Response): Promise<JsonResponse<T>> {
  return await response.json() as JsonResponse<T>;
}

function wav(dataBytes = 32_000) {
  const buffer = Buffer.alloc(44 + dataBytes);
  buffer.write("RIFF", 0, "ascii");
  buffer.writeUInt32LE(36 + dataBytes, 4);
  buffer.write("WAVE", 8, "ascii");
  buffer.write("fmt ", 12, "ascii");
  buffer.writeUInt32LE(16, 16);
  buffer.writeUInt16LE(1, 20);
  buffer.writeUInt16LE(1, 22);
  buffer.writeUInt32LE(16_000, 24);
  buffer.writeUInt32LE(32_000, 28);
  buffer.writeUInt16LE(2, 32);
  buffer.writeUInt16LE(16, 34);
  buffer.write("data", 36, "ascii");
  buffer.writeUInt32LE(dataBytes, 40);
  return buffer;
}

async function withVoiceServer(options: {
  apiKey?: string;
  limit?: number;
  provider?: AsrProvider;
  events?: VoiceSafeEvent[];
}, run: (baseUrl: string) => Promise<void>) {
  const app = express();
  app.use(express.json());
  const requireAnyMenu = (): RequestHandler => (req, res, next) => {
    if (!req.headers.authorization) {res.status(401).json({error: {code: "UNAUTHORIZED"}}); return;}
    if (req.headers["x-menu-denied"] === "1") {res.status(403).json({error: {code: "FORBIDDEN"}}); return;}
    (req as typeof req & {authUser?: {id: string}}).authUser = {id: String(req.headers["x-user-id"] || "voice-test-user")};
    next();
  };
  const config = resolveVoiceRuntimeConfig({VOICE_ASR_API_KEY: options.apiKey ?? "mock-key", VOICE_RATE_LIMIT_PER_MINUTE: String(options.limit ?? 20)});
  registerVoiceRoutes(app, {
    requireAnyMenu,
    asyncRoute: (handler) => (req, res, next) => {void Promise.resolve(handler(req, res, next)).catch(next);},
    getState: () => ({products: []}) as unknown as AppState,
    hasMenuPermission: (req, menuId) => String(req.headers["x-allowed-menus"] || "purchase_add,sales_add,crm").split(",").includes(menuId),
    getConfig: () => config,
    createProvider: () => options.provider || {name: "mock", transcribe: async () => ({text: "模拟识别"})},
    sendApiError: (_req, res, status, code, message) => res.status(status).json({error: {code, message}}),
    logSafeEvent: (event) => options.events?.push(event),
  });
  const server = await new Promise<ReturnType<typeof app.listen>>((resolve) => {
    const listener = app.listen(0, "127.0.0.1", () => resolve(listener));
  });
  const address = server.address() as AddressInfo;
  try { await run(`http://127.0.0.1:${address.port}`); }
  finally { await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve())); }
}

const authHeaders = {authorization: "Bearer mock-session", "content-type": "audio/wav"};

test("voice status is authenticated, permission scoped, and advertises text fallback", async () => {
  await withVoiceServer({apiKey: ""}, async (baseUrl) => {
    const anonymous = await fetch(`${baseUrl}/api/voice/status`);
    assert.equal(anonymous.status, 401);
    const forbidden = await fetch(`${baseUrl}/api/voice/status`, {headers: {authorization: "Bearer x", "x-menu-denied": "1"}});
    assert.equal(forbidden.status, 403);
    const response = await fetch(`${baseUrl}/api/voice/status`, {headers: {authorization: "Bearer x"}});
    assert.equal(response.status, 200);
    assert.deepEqual((await readJson<{asrEnabled: boolean; aiEnabled: boolean; maxSeconds: number}>(response)).data, {asrEnabled: false, aiEnabled: false, maxSeconds: 30});
  });
});

test("voice parse validates input, checks the concrete scene permission, and returns a draft", async () => {
  let observedScene = "";
  await withVoiceServer({apiKey: ""}, async (baseUrl) => {
    const headers = {authorization: "Bearer mock-session", "content-type": "application/json", "x-allowed-menus": "crm"};
    const forbidden = await fetch(`${baseUrl}/api/voice/parse`, {method: "POST", headers, body: JSON.stringify({text: "回收李四一张 RTX4090", scene: "purchase"})});
    assert.equal(forbidden.status, 403);

    const invalid = await fetch(`${baseUrl}/api/voice/parse`, {method: "POST", headers, body: JSON.stringify({text: "x".repeat(2_001), scene: "customer"})});
    assert.equal(invalid.status, 400);
    assert.equal((await readJson(invalid)).error?.code, "VOICE_PARSE_INVALID");
  });

  const app = express();
  app.use(express.json());
  const requireAnyMenu = (): RequestHandler => (req, res, next) => {
    if (!req.headers.authorization) {res.status(401).json({error: {code: "UNAUTHORIZED"}}); return;}
    (req as typeof req & {authUser?: {id: string}}).authUser = {id: "voice-test-user"};
    next();
  };
  const config = resolveVoiceRuntimeConfig({VOICE_ASR_API_KEY: ""});
  registerVoiceRoutes(app, {
    requireAnyMenu,
    asyncRoute: (handler) => (req, res, next) => {void Promise.resolve(handler(req, res, next)).catch(next);},
    getState: () => ({products: [], customers: [], vendors: [], inventory: []}) as unknown as AppState,
    getConfig: () => config,
    hasMenuPermission: (_req, menuId) => menuId === "crm",
    parseText: async (input) => {
      observedScene = input.scene;
      return {parseId: "parse-test", scene: "customer", transcript: input.text, source: "rules", customer: {rawTextForQuickCapture: input.text}, issues: []};
    },
    sendApiError: (_req, res, status, code, message) => res.status(status).json({error: {code, message}}),
  });
  const server = await new Promise<ReturnType<typeof app.listen>>((resolve) => {
    const listener = app.listen(0, "127.0.0.1", () => resolve(listener));
  });
  const address = server.address() as AddressInfo;
  try {
    const response = await fetch(`http://127.0.0.1:${address.port}/api/voice/parse`, {method: "POST", headers: {authorization: "Bearer mock-session", "content-type": "application/json"}, body: JSON.stringify({text: "加个客户王五", scene: "customer"})});
    assert.equal(response.status, 200);
    assert.equal(observedScene, "customer");
    assert.equal((await readJson<{customer?: {rawTextForQuickCapture?: string}}>(response)).data?.customer?.rawTextForQuickCapture, "加个客户王五");
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});

test("transcribe validates WAV headers and enforces the configured maximum duration", async () => {
  await withVoiceServer({}, async (baseUrl) => {
    const invalidType = await fetch(`${baseUrl}/api/voice/transcribe`, {method: "POST", headers: {...authHeaders, "content-type": "application/octet-stream"}, body: wav()});
    assert.equal(invalidType.status, 400);
    assert.equal((await readJson(invalidType)).error?.code, "VOICE_AUDIO_TYPE_INVALID");

    const invalidWav = await fetch(`${baseUrl}/api/voice/transcribe`, {method: "POST", headers: authHeaders, body: Buffer.from("not a wav")});
    assert.equal(invalidWav.status, 400);
    assert.equal((await readJson(invalidWav)).error?.code, "VOICE_AUDIO_INVALID");

    const tooLong = await fetch(`${baseUrl}/api/voice/transcribe`, {method: "POST", headers: authHeaders, body: wav(960_032)});
    assert.equal(tooLong.status, 400);
    assert.equal((await readJson(tooLong)).error?.code, "VOICE_AUDIO_TOO_LONG");
  });
});

test("transcribe returns mocked text and records no transcript in safe events", async () => {
  resetVoiceAsrCooldownForTests();
  const events: VoiceSafeEvent[] = [];
  let audioBytes = 0;
  await withVoiceServer({events, provider: {name: "mock-provider", transcribe: async (input) => {audioBytes = input.audio.length; return {text: "仅供返回，不记日志"};}}}, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/voice/transcribe`, {method: "POST", headers: authHeaders, body: wav()});
    assert.equal(response.status, 200);
    assert.deepEqual((await readJson<{text: string; durationMs: number; provider: string}>(response)).data, {text: "仅供返回，不记日志", durationMs: 1_000, provider: "mock-provider"});
  });
  assert.equal(audioBytes, wav().length);
  assert.equal(events.length, 1);
  assert.deepEqual(events[0], {userId: "voice-test-user", durationMs: 1_000, provider: "mock-provider", latencyMs: events[0]?.latencyMs, success: true});
  assert.equal(JSON.stringify(events).includes("仅供返回"), false);
});

test("provider errors return a safe 502 and per-user requests are rate limited", async () => {
  resetVoiceAsrCooldownForTests();
  const events: VoiceSafeEvent[] = [];
  await withVoiceServer({events, provider: {name: "mock-failure", transcribe: async () => {throw new Error("mock provider failure");}}}, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/voice/transcribe`, {method: "POST", headers: authHeaders, body: wav()});
    assert.equal(response.status, 502);
    assert.equal((await readJson(response)).error?.code, "VOICE_ASR_UNAVAILABLE");
  });
  assert.equal(events[0]?.success, false);
  assert.equal(JSON.stringify(events).includes("mock provider failure"), false);

  resetVoiceAsrCooldownForTests();
  await withVoiceServer({limit: 1}, async (baseUrl) => {
    const first = await fetch(`${baseUrl}/api/voice/transcribe`, {method: "POST", headers: authHeaders, body: wav()});
    assert.equal(first.status, 200);
    const second = await fetch(`${baseUrl}/api/voice/transcribe`, {method: "POST", headers: authHeaders, body: wav()});
    assert.equal(second.status, 429);
    assert.equal((await readJson(second)).error?.code, "VOICE_RATE_LIMITED");
  });
});

test("audio body size is capped at 1.5 MB on the route", async () => {
  await withVoiceServer({}, async (baseUrl) => {
    const response = await fetch(`${baseUrl}/api/voice/transcribe`, {method: "POST", headers: authHeaders, body: Buffer.alloc(1_600_000)});
    assert.equal(response.status, 413);
    assert.equal((await readJson(response)).error?.code, "VOICE_AUDIO_TOO_LARGE");
  });
});

test("voice parse forwards the caller's price permissions and is rate limited per user", async () => {
  const app = express();
  app.use(express.json());
  const requireAnyMenu = (): RequestHandler => (req, _res, next) => {
    (req as typeof req & {authUser?: {id: string}}).authUser = {id: "voice-parse-limit-user"};
    next();
  };
  const observed: Array<{canViewCost?: boolean; canViewProfit?: boolean}> = [];
  registerVoiceRoutes(app, {
    requireAnyMenu,
    asyncRoute: (handler) => (req, res, next) => {void Promise.resolve(handler(req, res, next)).catch(next);},
    getState: () => ({products: [], customers: [], vendors: [], inventory: []}) as unknown as AppState,
    hasMenuPermission: () => true,
    canViewCost: () => true,
    canViewProfit: () => false,
    getConfig: () => resolveVoiceRuntimeConfig({VOICE_ASR_API_KEY: "", VOICE_RATE_LIMIT_PER_MINUTE: "1"}),
    parseText: async (input) => {
      observed.push({canViewCost: input.canViewCost, canViewProfit: input.canViewProfit});
      return {parseId: "parse-limit", scene: "customer", transcript: input.text, source: "rules", customer: {rawTextForQuickCapture: input.text}, issues: []};
    },
    sendApiError: (_req, res, status, code, message) => res.status(status).json({error: {code, message}}),
  });
  const server = await new Promise<ReturnType<typeof app.listen>>((resolve) => {
    const listener = app.listen(0, "127.0.0.1", () => resolve(listener));
  });
  const address = server.address() as AddressInfo;
  try {
    const request = () => fetch(`http://127.0.0.1:${address.port}/api/voice/parse`, {method: "POST", headers: {"content-type": "application/json"}, body: JSON.stringify({text: "加个客户王五", scene: "customer"})});
    assert.equal((await request()).status, 200);
    const limited = await request();
    assert.equal(limited.status, 429);
    assert.equal((await readJson(limited)).error?.code, "VOICE_RATE_LIMITED");
    assert.deepEqual(observed, [{canViewCost: true, canViewProfit: false}]);
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});

test("speech hints put shop slang before catalogue words", () => {
  const hints = createVoiceAsrHints({products: [{id: "P-1", name: "华硕 RTX 4090 ROG STRIX 24G", brand: "华硕", model: "RTX 4090", version: "ROG STRIX", vram: "24G"}]} as unknown as Pick<AppState, "products">);
  assert.equal(hints[0], "猛禽");
  assert.ok(hints.includes("RTX 4090"));
  assert.ok(hints.length <= 200);
});
