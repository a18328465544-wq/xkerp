"""Local synthetic-camera QA; never a claim about physical autofocus quality."""
import json
import os
from pathlib import Path
from urllib.parse import urlparse
from playwright.sync_api import sync_playwright, expect

BASE = os.environ.get("BARCODE_SMOKE_BASE_URL", "http://127.0.0.1:3034").rstrip("/")
if urlparse(BASE).hostname not in {"localhost", "127.0.0.1", "::1"}:
    raise RuntimeError("Camera controls QA is local only")
OUT = Path(os.environ.get("BARCODE_SMOKE_OUTPUT", "/private/tmp/erp-barcode-focus"))
OUT.mkdir(parents=True, exist_ok=True)

SETUP = """mode => {
  const stats = window.__cameraQA = {media: [], stops: 0, constraints: [], crops: [], workers:0, terminated:0, fullFrames:0};
  // This suite tests camera controls, not decoding. Stub the optional worker
  // deterministically; browser-barcode-scanner.py separately runs real WASM.
  window.Worker = class {
    constructor() {stats.workers++;}
    postMessage(message) {
      if (message.image?.width === 1280 && message.image?.height === 720) stats.fullFrames++;
      else if (message.image) stats.crops.push({width:message.image.width,height:message.image.height});
      queueMicrotask(() => this.onmessage?.({data:message.type === 'init' ? {type:'ready'} : {type:'result',id:message.id,results:[]}}));
    }
    terminate() {stats.terminated++;}
  };
  window.BarcodeDetector = class {
    static async getSupportedFormats() {return ['qr_code','code_128','code_39','code_93','ean_13','ean_8','data_matrix'];}
    async detect(source) {if (source instanceof ImageData) stats.crops.push({width:source.width,height:source.height}); else stats.fullFrames++; return [];}
  };
  navigator.mediaDevices.enumerateDevices = async () => [
    {kind:'videoinput',deviceId:'back1',label:'Back camera'},
    {kind:'videoinput',deviceId:'back2',label:'后置超广角'},
    {kind:'videoinput',deviceId:'front',label:'Front camera'}
  ];
  navigator.mediaDevices.getUserMedia = async request => {
    stats.media.push(request);
    const id = request.video.deviceId?.exact || 'back1';
    if (id === 'front') throw Error('Must never switch to front camera');
    const canvas = document.createElement('canvas');
    canvas.width = 1920; canvas.height = 1080;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#dae7e9'; ctx.fillRect(0,0,canvas.width,canvas.height);
    ctx.fillStyle = '#243c44'; ctx.font = '60px sans-serif'; ctx.fillText('Local camera fixture', 600, 540);
    const stream = canvas.captureStream(8);
    // A real camera keeps producing frames. Repeated browser paints of a single
    // static canvas frame are no longer enough to pass startup readiness.
    const repaint = setInterval(() => ctx.drawImage(canvas,0,0), 125);
    for (const track of stream.getTracks()) {
      let zoom = 1;
      const stop = track.stop.bind(track);
      track.stop = () => {clearInterval(repaint); stats.stops++; stop();};
      track.getCapabilities = () => mode === 'unsupported' ? {} : {zoom:{min:1,max:4,step:.1},focusMode:['continuous']};
      track.getSettings = () => ({deviceId:id,zoom});
      track.applyConstraints = async constraints => {
        stats.constraints.push(constraints);
        if (mode === 'rejected') throw new DOMException('unsupported', 'OverconstrainedError');
        const requested = constraints.advanced[0].zoom;
        if (mode === 'hardware' && requested !== undefined) zoom = requested;
      };
    }
    return stream;
  };
}"""

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    try:
        for width in [320, 390, 768, 1024, 1440]:
            for mode in ['hardware', 'unsupported', 'ignored', 'rejected']:
                context = browser.new_context(viewport={"width": width, "height": 844})
                page = context.new_page()
                errors = []
                page.on('pageerror', lambda error: errors.append(str(error)))
                try:
                    page.goto(BASE + '/scripts/fixtures/barcode-scanner.html')
                    page.wait_for_load_state('networkidle')
                    page.evaluate(SETUP, mode)
                    page.get_by_role('button', name='打开扫码', exact=True).click()
                    group = page.get_by_role('group', name='扫码放大倍数')
                    expect(group).to_be_visible()
                    one = group.get_by_role('button', name='1×', exact=True)
                    onehalf = group.get_by_role('button', name='1.5×', exact=True)
                    two = group.get_by_role('button', name='2×', exact=True)
                    expect(one).to_have_attribute('aria-pressed', 'true')
                    onehalf.click()
                    expect(onehalf).to_have_attribute('aria-pressed', 'true')
                    expect(onehalf).to_be_enabled()
                    onehalf.focus()
                    page.keyboard.press('ArrowRight')
                    expect(two).to_have_attribute('aria-pressed', 'true')
                    expect(two).to_be_enabled()
                    scale = '1' if mode == 'hardware' else '2'
                    page.wait_for_function("scale => document.querySelector('.erp-barcode-video').style.transform === (scale === '1' ? '' : `scale(${scale})`)", arg=scale)
                    page.evaluate('window.__cameraQA.fullFrames = 0')
                    page.wait_for_function('window.__cameraQA.fullFrames > 0')
                    if mode != 'hardware':
                        page.wait_for_function('window.__cameraQA.crops.some(crop => crop.width === 960 && crop.height === 540)')
                    else:
                        assert page.evaluate('window.__cameraQA.constraints.some(c => c.advanced[0].zoom === 2)')
                    if mode != 'unsupported':
                        assert page.evaluate("window.__cameraQA.constraints.some(c => c.advanced[0].focusMode === 'continuous')")
                    expect(page.get_by_role('alert')).to_have_count(0)
                    expect(page.get_by_role('button', name='从图片识别', exact=True)).to_be_enabled()
                    assert page.evaluate('document.documentElement.scrollWidth <= innerWidth + 1')
                    for button in group.get_by_role('button').all():
                        box = button.bounding_box()
                        if width < 768:
                            assert box['height'] >= 44 and box['width'] >= 44, box
                    if width in [390, 1440] and mode in ['hardware', 'unsupported']:
                        page.screenshot(path=str(OUT / f'scanner-{width}-{mode}.png'))
                    one.click()
                    expect(one).to_have_attribute('aria-pressed', 'true')
                    expect(one).to_be_enabled()
                    page.get_by_role('button', name='切换镜头', exact=True).click()
                    expect(one).to_be_enabled()
                    page.wait_for_function('window.__cameraQA.media.length === 2')
                    assert page.evaluate("window.__cameraQA.media[1].video.deviceId.exact") == 'back2'
                    assert page.evaluate('window.__cameraQA.stops') == 1
                    expect(one).to_have_attribute('aria-pressed', 'true')
                    page.get_by_role('dialog').get_by_role('button', name='关闭', exact=True).last.click()
                    expect(page.get_by_role('dialog')).to_have_count(0)
                    assert page.evaluate('window.__cameraQA.stops') == 2
                    page.get_by_role('button', name='打开扫码', exact=True).click()
                    expect(group).to_be_visible()
                    expect(one).to_be_enabled()
                    assert page.evaluate("window.__cameraQA.media[2].video.deviceId.exact") == 'back2'
                    expect(one).to_have_attribute('aria-pressed', 'true')
                    page.get_by_role('dialog').get_by_role('button', name='关闭', exact=True).last.click()
                    expect(page.get_by_role('dialog')).to_have_count(0)
                    assert page.evaluate('window.__cameraQA.stops') == 3
                    assert page.evaluate('window.__cameraQA.workers === window.__cameraQA.terminated')
                    assert not errors, errors
                    print(f'PASS {width}px {mode}: zoom/crop, keyboard, lens switch, cleanup', flush=True)
                except Exception:
                    print(page.evaluate('JSON.stringify(window.__cameraQA)'), flush=True)
                    page.screenshot(path=str(OUT / f'failed-{width}-{mode}.png'))
                    raise
                finally:
                    context.close()
    finally:
        browser.close()
