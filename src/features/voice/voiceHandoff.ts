import type {VoiceParseResult, VoiceResolvedScene} from "@/src/types/voice";

export const VOICE_HANDOFF_QUERY_KEY = "voiceDraftId";
export const VOICE_HANDOFF_TTL_MS = 10 * 60 * 1_000;

export interface VoiceDraftHandoff {
  parseId: string;
  scene: Exclude<VoiceResolvedScene, null>;
  transcript: string;
  result: VoiceParseResult;
  createdAt: number;
  expiresAt: number;
}

type HandoffStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

function browserSessionStorage() {
  if (typeof window === "undefined") throw new Error("当前环境无法暂存语音草稿，请返回原页面重试。");
  return window.sessionStorage;
}

function isScenePayload(value: VoiceParseResult): value is VoiceParseResult & {scene: Exclude<VoiceResolvedScene, null>} {
  if (value.scene === "purchase") return Boolean(value.purchase);
  if (value.scene === "sales") return Boolean(value.sales);
  if (value.scene === "customer") return Boolean(value.customer);
  return false;
}

export function saveVoiceDraftHandoff(result: VoiceParseResult, transcript: string, now = Date.now(), storage: HandoffStorage = browserSessionStorage()): VoiceDraftHandoff {
  if (!isScenePayload(result)) throw new Error("暂时无法判断录入场景，请选择场景并重新解析。");
  const handoff: VoiceDraftHandoff = {parseId: result.parseId, scene: result.scene, transcript: transcript.trim(), result, createdAt: now, expiresAt: now + VOICE_HANDOFF_TTL_MS};
  try {
    storage.setItem(`voice-draft:${handoff.parseId}`, JSON.stringify(handoff));
  } catch {
    throw new Error("暂存语音草稿失败，请检查浏览器存储空间后重试。");
  }
  return handoff;
}

export function consumeVoiceDraftHandoff(parseId: string, expectedScene: Exclude<VoiceResolvedScene, null>, now = Date.now(), storage: HandoffStorage = browserSessionStorage()): VoiceDraftHandoff | null {
  if (!parseId) return null;
  const key = `voice-draft:${parseId}`;
  let serialized: string | null;
  try {
    serialized = storage.getItem(key);
    storage.removeItem(key);
  } catch {
    return null;
  }
  if (!serialized) return null;
  try {
    const value = JSON.parse(serialized) as Partial<VoiceDraftHandoff>;
    if (value.parseId !== parseId || value.scene !== expectedScene || typeof value.transcript !== "string" || typeof value.expiresAt !== "number" || value.expiresAt <= now || !value.result || !isScenePayload(value.result)) return null;
    return value as VoiceDraftHandoff;
  } catch {
    return null;
  }
}
