import assert from "node:assert/strict";
import test from "node:test";
import {renderToStaticMarkup} from "react-dom/server";
import {VoiceDraftTranscriptEditor} from "./VoiceDraftPanel";

test("voice draft panel keeps the transcript editable and explains the save boundary", () => {
  const html = renderToStaticMarkup(<VoiceDraftTranscriptEditor sceneLabel="采购" transcript="回收一张 RTX 4090" onTranscriptChange={() => undefined}><p>草稿预览</p></VoiceDraftTranscriptEditor>);
  assert.match(html, /识别文字/);
  assert.match(html, /textarea[^>]*id="voice-draft-transcript"/);
  assert.match(html, /录音仅用于识别，不保存/);
  assert.match(html, /只有点击原表单的确认提交后/);
  assert.match(html, /草稿预览/);
});
