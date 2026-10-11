import assert from "node:assert/strict";
import test from "node:test";
import {QueryClient, QueryClientProvider} from "@tanstack/react-query";
import {createElement} from "react";
import {renderToStaticMarkup} from "react-dom/server";
import {VoiceEntryControl} from "./VoiceEntryControl";

function renderWithStatus(asrEnabled: boolean) {
  const client = new QueryClient({defaultOptions: {queries: {retry: false}}});
  client.setQueryData(["voice", "status"], {asrEnabled, aiEnabled: false, maxSeconds: 30});
  return renderToStaticMarkup(createElement(QueryClientProvider, {client}, createElement(VoiceEntryControl, {scene: "purchase"})));
}

test("voice entry falls back to text when ASR is not configured", () => {
  const html = renderWithStatus(false);
  assert.match(html, /文字录入/);
  assert.match(html, /语音识别未启用/);
});

test("voice entry exposes the desktop toggle and Alt+V when ASR is enabled", () => {
  const html = renderWithStatus(true);
  assert.match(html, /aria-label="语音录入"/);
  assert.match(html, /aria-keyshortcuts="Alt\+V"/);
});

test("global voice entry keeps a compact, accessible text fallback when ASR is unavailable", () => {
  const client = new QueryClient({defaultOptions: {queries: {retry: false}}});
  client.setQueryData(["voice", "status"], {asrEnabled: false, aiEnabled: false, maxSeconds: 30});
  const html = renderToStaticMarkup(createElement(QueryClientProvider, {client}, createElement(VoiceEntryControl, {scene: "auto", compactTrigger: true, allowedScenes: ["purchase", "sales"]})));
  assert.match(html, /aria-label="打开语音快捷录入（当前使用文字输入）"/);
  assert.match(html, /语音快捷录入（未配置识别服务，点击后可输入文字）/);
});

test("phone global text fallback is an explicit full-width draft action", () => {
  const client = new QueryClient({defaultOptions: {queries: {retry: false}}});
  client.setQueryData(["voice", "status"], {asrEnabled: false, aiEnabled: false, maxSeconds: 30});
  const html = renderToStaticMarkup(createElement(QueryClientProvider, {client}, createElement(VoiceEntryControl, {scene: "auto", mode: "hold", label: "按住说话"})));
  assert.match(html, /输入文字生成草稿/);
  assert.match(html, /min-h-12 w-full/);
  assert.doesNotMatch(html, /改用文字/);
  assert.doesNotMatch(html, /按住说话/);
});
