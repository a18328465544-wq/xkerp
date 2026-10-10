import assert from "node:assert/strict";
import test from "node:test";
import {appendVoiceTranscript} from "./voiceTranscript";

test("voice transcript appends to existing text on a separate line", () => {
  assert.equal(appendVoiceTranscript("已有聊天记录  \n", " 王五电话 13812345678 "), "已有聊天记录\n王五电话 13812345678");
});

test("empty voice text does not erase an existing draft", () => {
  assert.equal(appendVoiceTranscript("已有线索", "  "), "已有线索");
  assert.equal(appendVoiceTranscript("  ", "新客户线索"), "新客户线索");
});
