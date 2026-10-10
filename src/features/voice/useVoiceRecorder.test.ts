import assert from "node:assert/strict";
import test from "node:test";
import {voiceRecorderUnavailableReason} from "./useVoiceRecorder";

test("voice recorder falls back to text on insecure or unsupported browsers", () => {
  assert.match(voiceRecorderUnavailableReason({secureContext: false, getUserMedia: true, audioContext: true, audioWorkletNode: true}) || "", /HTTPS/);
  assert.match(voiceRecorderUnavailableReason({secureContext: true, getUserMedia: false, audioContext: true, audioWorkletNode: true}) || "", /键盘语音输入/);
  assert.match(voiceRecorderUnavailableReason({secureContext: true, getUserMedia: true, audioContext: true, audioWorkletNode: false}) || "", /PCM 录音/);
  assert.equal(voiceRecorderUnavailableReason({secureContext: true, getUserMedia: true, audioContext: true, audioWorkletNode: true}), null);
});
