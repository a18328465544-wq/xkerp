import assert from "node:assert/strict";
import test from "node:test";
import type {VoiceParseResult} from "@/src/types/voice";
import {consumeVoiceDraftHandoff, saveVoiceDraftHandoff, VOICE_HANDOFF_TTL_MS} from "./voiceHandoff";

function storageDouble() {
  const values = new Map<string, string>();
  return {
    values,
    getItem: (key: string) => values.get(key) || null,
    setItem: (key: string, value: string) => {values.set(key, value);},
    removeItem: (key: string) => {values.delete(key);},
  };
}

const purchase: VoiceParseResult = {parseId: "draft-1", scene: "purchase", transcript: "回收李四一张 4090", source: "rules", purchase: {partner: {query: "李四", candidates: []}, lines: [], payment: undefined}, issues: []};

test("voice handoff stores one scene draft for at most ten minutes and consumes it once", () => {
  const storage = storageDouble();
  const handoff = saveVoiceDraftHandoff(purchase, "回收李四一张 4090", 10_000, storage);
  assert.equal(handoff.expiresAt - handoff.createdAt, VOICE_HANDOFF_TTL_MS);
  assert.equal(storage.values.has("voice-draft:draft-1"), true);
  assert.equal(consumeVoiceDraftHandoff("draft-1", "purchase", 10_001, storage)?.parseId, "draft-1");
  assert.equal(consumeVoiceDraftHandoff("draft-1", "purchase", 10_002, storage), null);
});

test("voice handoff rejects expired, wrong-scene, malformed, and unresolved drafts", () => {
  const storage = storageDouble();
  saveVoiceDraftHandoff(purchase, "回收李四一张 4090", 10_000, storage);
  assert.equal(consumeVoiceDraftHandoff("draft-1", "sales", 10_001, storage), null);
  saveVoiceDraftHandoff(purchase, "回收李四一张 4090", 10_000, storage);
  assert.equal(consumeVoiceDraftHandoff("draft-1", "purchase", 10_000 + VOICE_HANDOFF_TTL_MS, storage), null);
  assert.throws(() => saveVoiceDraftHandoff({...purchase, scene: null, purchase: undefined}, "4090", 10_000, storage), /选择场景/);
});
