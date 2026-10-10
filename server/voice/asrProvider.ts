import type {VoiceRuntimeConfig} from "../runtimeConfig.ts";

export interface AsrProviderInput {
  audio: Buffer;
  mimeType: "audio/wav";
  sampleRate: 16_000;
  hints: string[];
}

export interface AsrProviderResult {text: string}

export interface AsrProvider {
  name: string;
  transcribe(input: AsrProviderInput): Promise<AsrProviderResult>;
}

/**
 * Qwen3-ASR official API reference (checked 2026-10-10):
 * https://help.aliyun.com/zh/model-studio/qwen-asr-api-reference
 * OpenAI-compatible request is POST {baseUrl}/chat/completions with model
 * `qwen3-asr-flash`, user content [{type:"input_audio",input_audio:{data:"data:audio/wav;base64,..."}}],
 * and top-level `asr_options.enable_itn`. The API documentation accepts a system
 * message as context for entity/terminology hints; there is no separate `hints`
 * request parameter, so we pass up to 200 product terms as system context.
 * The model reference documents up to 5 minutes / 10 MB; this ERP intentionally
 * enforces the stricter product limits (30 seconds / 1.5 MB) before this adapter.
 * Workspace-specific compatible endpoints are preferred by Alibaba; the documented
 * legacy DashScope endpoint remains supported and is the no-env default here.
 */
export function createDashScopeAsrProvider(config: VoiceRuntimeConfig, fetcher: typeof fetch = fetch): AsrProvider {
  return {
    name: "dashscope",
    async transcribe(input) {
      if (!config.asrApiKey) throw new Error("Voice ASR is not configured");
      const hints = [...new Set(input.hints.map((hint) => hint.trim()).filter(Boolean))].slice(0, 200);
      const messages: Array<Record<string, unknown>> = [];
      if (hints.length) {
        messages.push({role: "system", content: `显卡及硬件专有词参考（按语音原文识别，勿自行补充型号）：${hints.join("、")}`});
      }
      messages.push({
        role: "user",
        content: [{type: "input_audio", input_audio: {data: `data:audio/wav;base64,${input.audio.toString("base64")}`}}],
      });
      const response = await fetcher(`${config.asrBaseUrl.replace(/\/$/, "")}/chat/completions`, {
        method: "POST",
        headers: {Authorization: `Bearer ${config.asrApiKey}`, "Content-Type": "application/json"},
        signal: AbortSignal.timeout(40_000),
        body: JSON.stringify({model: config.asrModel, messages, asr_options: {enable_itn: false}}),
      });
      if (!response.ok) throw new Error(`DashScope ASR returned ${response.status}`);
      const payload: unknown = await response.json();
      if (!payload || typeof payload !== "object" || !("choices" in payload) || !Array.isArray(payload.choices)) throw new Error("DashScope ASR response was malformed");
      const choice = payload.choices[0];
      if (!choice || typeof choice !== "object" || !("message" in choice) || !choice.message || typeof choice.message !== "object" || !("content" in choice.message) || typeof choice.message.content !== "string") throw new Error("DashScope ASR transcript was missing");
      const text = choice.message.content.trim();
      if (!text || text.length > 10_000) throw new Error("DashScope ASR returned an empty or oversized transcript");
      return {text};
    },
  };
}

export function asrProviderForConfig(config: VoiceRuntimeConfig): AsrProvider | undefined {
  if (config.asrProvider !== "dashscope" || !config.asrApiKey) return undefined;
  return createDashScopeAsrProvider(config);
}
