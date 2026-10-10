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
    return apiRequest<VoiceStatus>("/api/voice/status", {signal});
  },
  transcribe(audio: Blob, signal?: AbortSignal) {
    if (audio.type !== "audio/wav") throw new TypeError("语音录音格式无效");
    return apiRequest<{text: string; durationMs: number; provider: string}>("/api/voice/transcribe", {
      method: "POST",
      headers: {"Content-Type": "audio/wav"},
      body: audio,
      signal,
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
