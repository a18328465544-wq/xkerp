import assert from "node:assert/strict";
import test from "node:test";
import {createVoiceVad, estimateVoiceVadThreshold} from "./voiceVad";

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

test("voice VAD calibrates from ambient noise before detecting speech", () => {
  const vad = createVoiceVad({silenceMs: 1_000});
  vad.update(0, 0); // Ignore the recorder's initial, not-yet-sampled zero level.
  vad.update(0.035, 100);
  vad.update(0.045, 200);
  vad.update(0.04, 300);
  vad.update(0.055, 400);

  assert.equal(vad.update(0.08, 600), false); // Louder fan/test-device noise stays below the learned threshold.
  assert.equal(vad.update(0.07, 1_700), false);
  assert.equal(vad.update(0.14, 1_800), false); // Actual speech crosses the learned threshold.
  assert.equal(vad.update(0.07, 1_900), false);
  assert.equal(vad.update(0.07, 2_899), false);
  assert.equal(vad.update(0.07, 2_900), true);
});

test("voice VAD recalibrates the noise floor for each new recording", () => {
  const vad = createVoiceVad({silenceMs: 1_000});
  vad.update(0.03, 100);
  vad.update(0.03, 200);
  vad.update(0.04, 300);
  vad.update(0.03, 400);
  assert.equal(vad.update(0.12, 500), false);
  assert.equal(vad.update(0.03, 600), false);

  vad.reset();
  vad.update(0.08, 100);
  vad.update(0.09, 200);
  vad.update(0.08, 300);
  vad.update(0.09, 400);
  assert.equal(vad.update(0.14, 500), false);
  assert.equal(vad.update(0.14, 1_700), false);
  assert.equal(vad.update(0.2, 1_800), false);
  assert.equal(vad.update(0.14, 1_900), false);
  assert.equal(vad.update(0.14, 2_900), true);
});

test("voice VAD threshold uses the stable lower noise range with safe bounds", () => {
  assert.ok(Math.abs(estimateVoiceVadThreshold([0.035, 0.045, 0.04, 0.055]) - 0.090875) < 1e-9);
  assert.equal(estimateVoiceVadThreshold([]), 0.045);
  assert.equal(estimateVoiceVadThreshold([0.7, 0.8, 0.9]), 0.16);
});
