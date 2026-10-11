import assert from "node:assert/strict";
import test from "node:test";
import {isVoiceCaptureDisabled, resolveHoldReleaseIntent} from "./voiceCaptureState";

test("hold-to-talk stays enabled while starting so the first permission prompt can be released", () => {
  assert.equal(isVoiceCaptureDisabled("hold", "starting", false, false), false);
  assert.equal(isVoiceCaptureDisabled("toggle", "starting", false, false), true);
  assert.equal(isVoiceCaptureDisabled("hold", "starting", false, true), true);
  assert.equal(isVoiceCaptureDisabled("hold", "stopping", false, false), true);
});

test("hold release only resolves for the active pointer and preserves cancel intent", () => {
  assert.equal(resolveHoldReleaseIntent(12, 11, false), null);
  assert.equal(resolveHoldReleaseIntent(null, 12, false), null);
  assert.equal(resolveHoldReleaseIntent(12, 12, false), "stop");
  assert.equal(resolveHoldReleaseIntent(12, 12, true), "cancel");
});
