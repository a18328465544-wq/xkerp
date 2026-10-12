"""Local startup timing/geometry QA. Synthetic cameras are not iPhone proof."""
import ast
import os
from pathlib import Path
from urllib.parse import urlparse
from playwright.sync_api import sync_playwright, expect

BASE = os.environ.get("BARCODE_SMOKE_BASE_URL", "http://127.0.0.1:3035").rstrip("/")
if urlparse(BASE).hostname not in {"localhost", "127.0.0.1", "::1"}:
    raise RuntimeError("Scanner startup QA is local only")
OUT = Path(os.environ.get("BARCODE_SMOKE_OUTPUT", "/private/tmp/erp-barcode-startup"))
OUT.mkdir(parents=True, exist_ok=True)
# Reuse the controls suite's camera/worker fixture, not a second business app.
tree = ast.parse(Path(__file__).with_name("browser-barcode-camera-controls.py").read_text())
SETUP = next(ast.literal_eval(node.value) for node in tree.body if isinstance(node, ast.Assign) and any(getattr(target, "id", "") == "SETUP" for target in node.targets))

TIMING = """mode => {
  const qa = window.__startup = {camera:[], frames:new Map(), enumeration:[], callbacks:0, detects:0};
  const getUserMedia = navigator.mediaDevices.getUserMedia;
  navigator.mediaDevices.getUserMedia = async constraints => {
    await new Promise(resolve => qa.camera.push(resolve));
    return getUserMedia(constraints);
  };
  const enumerate = navigator.mediaDevices.enumerateDevices;
  navigator.mediaDevices.enumerateDevices = async () => {
    await new Promise(resolve => qa.enumeration.push(resolve));
    return enumerate();
  };
  const detect = window.BarcodeDetector.prototype.detect;
  window.BarcodeDetector.prototype.detect = function(source) {qa.detects++; return detect.call(this, source);};
  let id = 0;
  if (mode === 'legacy') {
    HTMLVideoElement.prototype.requestVideoFrameCallback = undefined;
    HTMLVideoElement.prototype.cancelVideoFrameCallback = undefined;
  } else {
    HTMLVideoElement.prototype.requestVideoFrameCallback = function(callback) {qa.frames.set(++id, callback); return id;};
    HTMLVideoElement.prototype.cancelVideoFrameCallback = value => qa.frames.delete(value);
  }
  window.__firePreviewFrame = (width=1920, height=1080) => {
    const pending = [...qa.frames.values()]; qa.frames.clear();
    pending.forEach(callback => {qa.callbacks++; callback(performance.now(), {width,height});});
  };
  if (mode === 'slow-decoder') {
    window.BarcodeDetector.getSupportedFormats = async () => [];
    const post = window.Worker.prototype.postMessage;
    window.Worker.prototype.postMessage = function(message) {
      if (message.type === 'init') qa.decoder = () => post.call(this,message);
      else post.call(this,message);
    };
  }
}"""

GEOMETRY = """() => {
  const selectors = ['[role=dialog]', '.erp-barcode-camera', '[data-erp-region=barcode-camera-controls]', '[aria-label="选择条码图片"] + div'];
  return selectors.map(selector => {
    const r = document.querySelector(selector).getBoundingClientRect();
    return {x:r.x,y:r.y,width:r.width,height:r.height};
  });
}"""


def unchanged(page, initial):
    current = page.evaluate(GEOMETRY)
    for before, after in zip(initial, current):
        for key in before:
            assert abs(before[key] - after[key]) <= 1, (before, after)
    assert page.evaluate("document.documentElement.scrollWidth <= innerWidth + 1")


with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    try:
        for width in [320, 390, 1440]:
            for mode in ['native', 'slow-decoder', 'legacy', 'close-permission', 'close-frame']:
                context = browser.new_context(viewport={"width": width, "height": 844})
                page = context.new_page()
                errors = []
                page.on('pageerror', lambda error: errors.append(str(error)))
                try:
                    page.goto(BASE + '/scripts/fixtures/barcode-scanner.html', wait_until='networkidle')
                    page.evaluate(SETUP, 'unsupported')
                    page.evaluate(TIMING, mode)
                    page.get_by_role('button', name='打开扫码', exact=True).click()
                    one = page.get_by_role('button', name='1×', exact=True)
                    expect(one).to_be_visible()
                    expect(one).to_be_disabled()
                    expect(page.get_by_role('status', name='', exact=True)).to_contain_text('正在准备扫码')
                    # Wait only for the shared dialog entrance to finish; readiness
                    # below is explicitly gated, never driven by this delay.
                    page.wait_for_timeout(250)
                    initial = page.evaluate(GEOMETRY)
                    if mode == 'slow-decoder':
                        page.wait_for_function('Boolean(window.__startup.decoder)')
                        expect(one).to_be_disabled()
                        unchanged(page, initial)
                        page.evaluate('window.__startup.decoder()')
                    page.wait_for_function('window.__startup.camera.length === 1')
                    if mode == 'close-permission':
                        page.get_by_role('button', name='关闭', exact=True).click()
                        page.evaluate('window.__startup.camera.shift()()')
                        page.wait_for_function('window.__cameraQA.stops === 1')
                        assert page.evaluate('window.__startup.frames.size') == 0
                        assert page.evaluate('window.__startup.detects') == 0
                    else:
                        if width in [390, 1440] and mode == 'native':
                            page.screenshot(path=str(OUT / f'scanner-{width}-preparing.png'))
                        page.evaluate('window.__startup.camera.shift()()')
                        page.wait_for_function("document.querySelector('.erp-barcode-video').videoWidth > 0")
                        if mode != 'legacy':
                            expect(one).to_be_disabled()
                            assert page.evaluate('window.__startup.detects') == 0
                            unchanged(page, initial)
                        if mode == 'close-frame':
                            page.get_by_role('button', name='关闭', exact=True).click()
                            assert page.evaluate('window.__startup.frames.size') == 0
                            page.evaluate('window.__firePreviewFrame()')
                            assert page.evaluate('window.__startup.detects') == 0
                        else:
                            if mode != 'legacy':
                                page.evaluate('window.__firePreviewFrame(0,0)')
                                expect(one).to_be_disabled()
                                page.evaluate('window.__firePreviewFrame()')
                            expect(one).to_be_enabled()
                            unchanged(page, initial)
                            page.wait_for_function('window.__startup.enumeration.length === 1')
                            page.evaluate('window.__startup.enumeration.shift()()')
                            expect(page.get_by_role('button', name='切换镜头', exact=True)).to_be_visible()
                            unchanged(page, initial)
                            if width in [390, 1440] and mode == 'native':
                                page.screenshot(path=str(OUT / f'scanner-{width}-ready.png'))
                            if mode == 'slow-decoder':
                                page.evaluate('window.__startup.decoder = undefined')
                            page.get_by_role('button', name='切换镜头', exact=True).click()
                            expect(one).to_be_disabled()
                            unchanged(page, initial)
                            if mode == 'slow-decoder':
                                page.wait_for_function('Boolean(window.__startup.decoder)')
                                page.evaluate('window.__startup.decoder()')
                            page.wait_for_function('window.__startup.camera.length === 1')
                            page.evaluate('window.__startup.camera.shift()()')
                            page.wait_for_function('window.__cameraQA.media.length === 2')
                            if mode != 'legacy':
                                page.wait_for_function('window.__startup.frames.size === 1')
                                page.evaluate('window.__firePreviewFrame()')
                            expect(one).to_be_enabled()
                            unchanged(page, initial)
                            page.get_by_role('button', name='关闭', exact=True).click()
                    expect(page.get_by_role('dialog')).to_have_count(0)
                    assert page.evaluate('window.__startup.frames.size') == 0
                    assert page.evaluate('window.__cameraQA.workers === window.__cameraQA.terminated')
                    assert not errors, errors
                    print(f'PASS {width}px {mode}: stable geometry, first-frame gate, cleanup', flush=True)
                except Exception:
                    page.screenshot(path=str(OUT / f'failed-{width}-{mode}.png'))
                    raise
                finally:
                    context.close()
    finally:
        browser.close()
