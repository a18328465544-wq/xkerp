import assert from "node:assert/strict";
import test from "node:test";
import {renderToStaticMarkup} from "react-dom/server";
import {VoiceCaptureButton} from "./VoiceCaptureButton";

test("desktop voice capture exposes a labeled toggle without changing page layout", () => {
  const html = renderToStaticMarkup(<VoiceCaptureButton mode="toggle" maxSeconds={30} onAudio={() => undefined} />);
  assert.match(html, /data-erp-component="voice-capture"/);
  assert.match(html, /aria-label="语音录入"/);
  assert.match(html, /Alt\+V/);
});

test("phone voice capture uses an accessible press-and-hold affordance", () => {
  const html = renderToStaticMarkup(<VoiceCaptureButton mode="hold" maxSeconds={30} onAudio={() => undefined} />);
  assert.match(html, /aria-label="按住说话"/);
  assert.match(html, /title="按住说话，向上滑动取消"/);
  assert.match(html, /touch-none select-none/);
});

test("compact global voice capture does not add visible text beside the mic", () => {
  const html = renderToStaticMarkup(<VoiceCaptureButton mode="toggle" maxSeconds={30} compactTrigger triggerLabel="语音快捷录入" onAudio={() => undefined} />);
  assert.match(html, /aria-label="语音快捷录入"/);
  assert.match(html, /<span class="sr-only">语音快捷录入<\/span>/);
  assert.match(html, /h-9 w-9/);
});
