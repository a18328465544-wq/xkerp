/**
 * Runtime topology is deliberately explicit.  The API still keeps a small
 * in-process projection for fast reads, so production must run as one fork
 * until that projection is replaced by a shared read model.
 */
export type StateRuntimeMode = "single-instance";

export type VoiceAsrProviderName = "dashscope" | "tencent";
export interface VoiceRuntimeConfig {
  asrProvider: VoiceAsrProviderName;
  asrApiKey: string;
  asrSecretId: string;
  asrSecretKey: string;
  asrModel: string;
  asrBaseUrl: string;
  maxSeconds: number;
  rateLimitPerMinute: number;
  aiEnabled: boolean;
}

function valueFrom(env: NodeJS.ProcessEnv, key: string) {
  return env[key]?.trim() || "";
}

export function resolveStateRuntimeMode(env: NodeJS.ProcessEnv = process.env): StateRuntimeMode | undefined {
  const configured = valueFrom(env, "STATE_RUNTIME_MODE");
  if (!configured && env.NODE_ENV !== "production") return "single-instance";
  return configured === "single-instance" ? configured : undefined;
}

export function assertStateRuntimeMode(env: NodeJS.ProcessEnv = process.env): StateRuntimeMode {
  const mode = resolveStateRuntimeMode(env);
  if (!mode) {
    throw new Error(
      "生产运行必须显式设置 STATE_RUNTIME_MODE=single-instance；当前服务仍依赖进程内投影，禁止无声明扩容。",
    );
  }
  return mode;
}

function boundedInteger(value: string | undefined, fallback: number, min: number, max: number) {
  const parsed = Number(value);
  return Number.isInteger(parsed) ? Math.max(min, Math.min(max, parsed)) : fallback;
}

export function resolveVoiceRuntimeConfig(env: NodeJS.ProcessEnv = process.env): VoiceRuntimeConfig {
  const provider = valueFrom(env, "VOICE_ASR_PROVIDER");
  return {
    asrProvider: provider === "tencent" ? "tencent" : "dashscope",
    asrApiKey: valueFrom(env, "VOICE_ASR_API_KEY"),
    asrSecretId: valueFrom(env, "VOICE_ASR_SECRET_ID"),
    asrSecretKey: valueFrom(env, "VOICE_ASR_SECRET_KEY"),
    asrModel: valueFrom(env, "VOICE_ASR_MODEL") || "qwen3-asr-flash",
    asrBaseUrl: valueFrom(env, "VOICE_ASR_BASE_URL") || "https://dashscope.aliyuncs.com/compatible-mode/v1",
    maxSeconds: boundedInteger(env.VOICE_MAX_SECONDS, 30, 1, 60),
    rateLimitPerMinute: boundedInteger(env.VOICE_RATE_LIMIT_PER_MINUTE, 20, 1, 200),
    aiEnabled: Boolean(valueFrom(env, "AI_API_KEY")),
  };
}
