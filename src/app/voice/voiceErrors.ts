import {ApiError} from "@/src/services/api/errors";

export function voiceParseFailureMessage(error: unknown) {
  if (error instanceof ApiError && error.code === "VOICE_RATE_LIMITED") {
    return `${error.message}；稍后可点击“重新解析”继续。`;
  }
  return error instanceof Error ? error.message : "解析失败，请改用文字输入后重试。";
}
