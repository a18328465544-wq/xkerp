import assert from "node:assert/strict";
import test from "node:test";
import {ApiError} from "@/src/services/api/errors";
import {voiceParseFailureMessage} from "./voiceErrors";

test("voice parse rate limits explain that the user can retry from the existing button", () => {
  const message = voiceParseFailureMessage(new ApiError(429, "语音解析请求过于频繁，请稍后再试", {code: "VOICE_RATE_LIMITED"}));
  assert.match(message, /请求过于频繁/);
  assert.match(message, /点击“重新解析”继续/);
});

test("voice parse failures keep their original message and safe fallback", () => {
  assert.equal(voiceParseFailureMessage(new Error("候选读取失败")), "候选读取失败");
  assert.equal(voiceParseFailureMessage(null), "解析失败，请改用文字输入后重试。");
});
