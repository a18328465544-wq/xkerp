import assert from "node:assert/strict";
import test from "node:test";
import {createVoiceVad} from "./voiceVad";

test("voice VAD waits for speech before treating silence as a stop", () => {
  const vad = createVoiceVad({silenceMs: 1_500});
  assert.equal(vad.update(0, 1_400), false);
  assert.equal(vad.update(0, 3_000), false);
  assert.equal(vad.update(0.2, 3_100), false);
  assert.equal(vad.update(0, 3_500), false);
  assert.equal(vad.update(0, 4_999), false);
  assert.equal(vad.update(0, 5_000), true);
});

test("voice VAD resets its quiet window when speech resumes", () => {
  const vad = createVoiceVad({threshold: 0.03, silenceMs: 1_500});
  vad.update(0.1, 100);
  vad.update(0, 200);
  assert.equal(vad.update(0, 1_600), false);
  assert.equal(vad.update(0.04, 1_650), false);
  assert.equal(vad.update(0, 1_700), false);
  assert.equal(vad.update(0, 3_199), false);
  assert.equal(vad.update(0, 3_200), true);
});
