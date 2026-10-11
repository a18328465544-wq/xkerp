import {apiRequest} from "../client";
import type {VoiceParseResult, VoiceScene} from "@/src/types/voice";

export interface VoiceStatus {
  asrEnabled: boolean;
  aiEnabled: boolean;
  maxSeconds: number;
}

export interface VoiceParseInput {
  text: string;
  scene: VoiceScene;
}

export const voiceApi = {
  status(signal?: AbortSignal) {
    return apiRequest<{data: VoiceStatus}>("/api/voice/status", {signal}).then((response) => {
      if (!response.data || typeof response.data.asrEnabled !== "boolean") throw new Error("暂时无法检查语音输入能力，请使用文字录入");
      return response.data;
    });
  },
  transcribe(audio: Blob, signal?: AbortSignal) {
    if (audio.type !== "audio/wav") throw new TypeError("语音录音格式无效");
    return apiRequest<{data: {text: string; durationMs: number; provider: string}}>("/api/voice/transcribe", {
      method: "POST",
      headers: {"Content-Type": "audio/wav"},
      body: audio,
      signal,
    }).then((response) => {
      if (!response.data || typeof response.data.text !== "string" || !response.data.text.trim()) throw new Error("未识别到有效文字，请重新录制或使用文字录入");
      return response.data;
    });
  },
  parse(input: VoiceParseInput, signal?: AbortSignal) {
    return apiRequest<{data: VoiceParseResult}>("/api/voice/parse", {
      method: "POST",
      body: JSON.stringify(input),
      signal,
    }).then((response) => {
      if (!response.data) throw new Error("暂时无法解析语音草稿，请直接编辑文字");
      return response.data;
    });
  },
};
