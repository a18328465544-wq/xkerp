import assert from "node:assert/strict";
import test from "node:test";
import {voiceDraftIdFromSearch} from "./useVoiceDraftHandoff";

test("voice handoff query is scoped to an explicit parse id", () => {
  assert.equal(voiceDraftIdFromSearch("?keyword=4090&voiceDraftId=parse-123"), "parse-123");
  assert.equal(voiceDraftIdFromSearch("?keyword=4090"), "");
  assert.equal(voiceDraftIdFromSearch("?voiceDraftId="), "");
});
