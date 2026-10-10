import express, {type Express, type Request, type RequestHandler, type Response} from "express";
import rateLimit, {ipKeyGenerator} from "express-rate-limit";
import type {AuthenticatedRequest} from "../httpAuth.ts";
import type {SystemUserAccount} from "../../src/types.ts";
import type {AppState} from "../store.ts";
import type {VoiceParseResult} from "../../src/types/voice.ts";
import type {VoiceScene} from "../../src/types/voice.ts";
import {resolveVoiceRuntimeConfig, type VoiceRuntimeConfig} from "../runtimeConfig.ts";
import {asrProviderForConfig, type AsrProvider} from "./asrProvider.ts";
import {voiceParseRequestSchema} from "./voiceSchema.ts";
import {parseVoiceText, type VoiceParseContext} from "./voiceParse.ts";
import {resolveVoiceScene} from "./voiceIntent.ts";

type VoiceRequest = AuthenticatedRequest<SystemUserAccount>;
export interface VoiceSafeEvent {userId: string; durationMs: number; provider: string; latencyMs: number; success: boolean}
interface VoiceRouteDependencies {
  requireAnyMenu: (menuIds: string[]) => RequestHandler;
  asyncRoute: (handler: RequestHandler) => RequestHandler;
  getState: () => AppState;
  getConfig?: () => VoiceRuntimeConfig;
  createProvider?: (config: VoiceRuntimeConfig) => AsrProvider | undefined;
  hasMenuPermission: (req: Request, menuId: string) => boolean;
  parseText?: (input: {text: string; scene: VoiceScene; state: VoiceParseContext}) => Promise<VoiceParseResult>;
  sendApiError: (req: Request, res: Response, status: number, code: string, message: string) => void;
  logSafeEvent?: (event: VoiceSafeEvent) => void;
}

export interface WavMetadata {dataBytes: number; durationMs: number}
export function inspectVoiceWav(input: Buffer): WavMetadata | undefined {
  if (input.length < 44 || input.toString("ascii", 0, 4) !== "RIFF" || input.toString("ascii", 8, 12) !== "WAVE") return undefined;
  let offset = 12;
  let channels: number | undefined;
  let sampleRate: number | undefined;
  let bitsPerSample: number | undefined;
  let audioFormat: number | undefined;
  let dataBytes: number | undefined;
  while (offset + 8 <= input.length) {
    const chunkName = input.toString("ascii", offset, offset + 4);
    const chunkSize = input.readUInt32LE(offset + 4);
    const start = offset + 8;
    const end = start + chunkSize;
    if (end > input.length) return undefined;
    if (chunkName === "fmt ") {
      if (chunkSize < 16) return undefined;
      audioFormat = input.readUInt16LE(start);
      channels = input.readUInt16LE(start + 2);
      sampleRate = input.readUInt32LE(start + 4);
      bitsPerSample = input.readUInt16LE(start + 14);
    } else if (chunkName === "data") {
      dataBytes = chunkSize;
    }
    offset = end + (chunkSize % 2);
  }
  if (audioFormat !== 1 || channels !== 1 || sampleRate !== 16_000 || bitsPerSample !== 16 || dataBytes === undefined) return undefined;
  if (dataBytes <= 0 || dataBytes % 2 !== 0) return undefined;
  return {dataBytes, durationMs: Math.ceil(dataBytes / (16_000 * 2) * 1_000)};
}

export function createVoiceAsrHints(state: Pick<AppState, "products">): string[] {
  const products = [...state.products].sort((left, right) =>
    String(right.lastDealTime || "").localeCompare(String(left.lastDealTime || "")) ||
    (right.currentStock || 0) - (left.currentStock || 0));
  const values = new Set<string>();
  for (const product of products) {
    [product.name, product.brand, product.model, product.version, product.vram].forEach((value) => {if (value?.trim()) values.add(value.trim());});
    if (values.size >= 200) break;
  }
  return [...values].slice(0, 200);
}

const VOICE_MENU_IDS = ["purchase_add", "sales_add", "crm"];
const voiceAsrFailureCooldownMs = Math.max(0, Number(process.env.AI_PROVIDER_FAILURE_COOLDOWN_MS || 5 * 60 * 1_000));
let voiceAsrFailureAt = 0;

export function resetVoiceAsrCooldownForTests() { voiceAsrFailureAt = 0; }

export function registerVoiceRoutes(app: Express, dependencies: VoiceRouteDependencies) {
  const getConfig = dependencies.getConfig || (() => resolveVoiceRuntimeConfig());
  const createProvider = dependencies.createProvider || asrProviderForConfig;
  const parseText = dependencies.parseText || parseVoiceText;
  const rateLimitMiddleware = rateLimit({
    windowMs: 60_000,
    limit: getConfig().rateLimitPerMinute,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => {
      const userId = (req as VoiceRequest).authUser?.id;
      return userId || ipKeyGenerator(req.ip || "");
    },
    handler: (req, res) => dependencies.sendApiError(req, res, 429, "VOICE_RATE_LIMITED", "语音识别请求过于频繁，请稍后再试"),
  });
  const parseWav = express.raw({type: "audio/wav", limit: "1.5mb"});

  app.get("/api/voice/status", dependencies.requireAnyMenu(VOICE_MENU_IDS), (_req, res) => {
    const config = getConfig();
    const providerReady = config.asrProvider === "dashscope" && Boolean(config.asrApiKey) && Boolean(createProvider(config));
    res.json({data: {asrEnabled: providerReady, aiEnabled: config.aiEnabled, maxSeconds: config.maxSeconds}});
  });

  app.post("/api/voice/parse", dependencies.requireAnyMenu(VOICE_MENU_IDS), dependencies.asyncRoute(async (req, res) => {
    const command = voiceParseRequestSchema.safeParse(req.body);
    if (!command.success) {
      dependencies.sendApiError(req, res, 400, "VOICE_PARSE_INVALID", "请输入不超过 2000 字的有效录入内容");
      return;
    }
    const resolvedScene = command.data.scene === "auto" ? resolveVoiceScene(command.data.text) : command.data.scene;
    if (resolvedScene) {
      const requiredMenu = resolvedScene === "purchase" ? "purchase_add" : resolvedScene === "sales" ? "sales_add" : "crm";
      if (!dependencies.hasMenuPermission(req, requiredMenu)) {
        dependencies.sendApiError(req, res, 403, "FORBIDDEN", "当前账号没有该录入场景的权限");
        return;
      }
    }
    const state = dependencies.getState();
    const context: VoiceParseContext = {products: state.products, customers: state.customers, vendors: state.vendors, inventory: state.inventory};
    const result = await parseText({text: command.data.text, scene: command.data.scene, state: context});
    res.json({data: result});
  }));

  app.post("/api/voice/transcribe", dependencies.requireAnyMenu(VOICE_MENU_IDS), rateLimitMiddleware, (req, res, next) => {
    parseWav(req, res, (error) => {
      if (!error) { next(); return; }
      const parseError = error as {type?: string};
      if (parseError.type === "entity.too.large") {
        dependencies.sendApiError(req, res, 413, "VOICE_AUDIO_TOO_LARGE", "录音文件不能超过 1.5 MB");
        return;
      }
      next(error);
    });
  }, async (req, res) => {
    const config = getConfig();
    const provider = createProvider(config);
    if (!req.is("audio/wav")) {
      dependencies.sendApiError(req, res, 400, "VOICE_AUDIO_TYPE_INVALID", "仅支持 16kHz 单声道 WAV 录音");
      return;
    }
    if (!provider) {
      dependencies.sendApiError(req, res, 503, "VOICE_ASR_NOT_CONFIGURED", "语音识别未配置，请改用文字输入");
      return;
    }
    if (!Buffer.isBuffer(req.body)) {
      dependencies.sendApiError(req, res, 400, "VOICE_AUDIO_INVALID", "录音内容无效，请重新录制或改用文字输入");
      return;
    }
    const wav = inspectVoiceWav(req.body);
    if (!wav) {
      dependencies.sendApiError(req, res, 400, "VOICE_AUDIO_INVALID", "录音格式无效，需为 16kHz、单声道、16-bit PCM WAV");
      return;
    }
    if (wav.durationMs > config.maxSeconds * 1_000) {
      dependencies.sendApiError(req, res, 400, "VOICE_AUDIO_TOO_LONG", `单次录音不能超过 ${config.maxSeconds} 秒`);
      return;
    }
    const now = Date.now();
    if (voiceAsrFailureCooldownMs > 0 && now - voiceAsrFailureAt < voiceAsrFailureCooldownMs) {
      dependencies.logSafeEvent?.({userId: (req as VoiceRequest).authUser?.id || "unknown", durationMs: wav.durationMs, provider: provider.name, latencyMs: 0, success: false});
      dependencies.sendApiError(req, res, 502, "VOICE_ASR_UNAVAILABLE", "语音识别暂不可用，请用文字输入");
      return;
    }
    const startedAt = Date.now();
    try {
      const result = await provider.transcribe({audio: req.body, mimeType: "audio/wav", sampleRate: 16_000, hints: createVoiceAsrHints(dependencies.getState())});
      const latencyMs = Math.max(0, Date.now() - startedAt);
      dependencies.logSafeEvent?.({userId: (req as VoiceRequest).authUser?.id || "unknown", durationMs: wav.durationMs, provider: provider.name, latencyMs, success: true});
      res.json({data: {text: result.text, durationMs: wav.durationMs, provider: provider.name}});
    } catch {
      voiceAsrFailureAt = now;
      const latencyMs = Math.max(0, Date.now() - startedAt);
      dependencies.logSafeEvent?.({userId: (req as VoiceRequest).authUser?.id || "unknown", durationMs: wav.durationMs, provider: provider.name, latencyMs, success: false});
      dependencies.sendApiError(req, res, 502, "VOICE_ASR_UNAVAILABLE", "语音识别暂不可用，请用文字输入");
    }
  });
}
