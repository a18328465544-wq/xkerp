"""Local keyboard geometry regression, using existing read-only ERP fixtures.

Chromium/WebKit do not expose a real iPhone software keyboard to automation.
The visualViewport fixtures reproduce iOS resize/pan, Android layout resize,
focus changes and stale dismissal offsets. This is not physical-device proof.
"""
import ast
import json
import os
from pathlib import Path
from urllib.parse import urlparse
from playwright.sync_api import expect, sync_playwright

ROOT = Path(__file__).resolve().parent.parent
BASE = os.environ.get("PHONE_KEYBOARD_BASE_URL", "http://127.0.0.1:3020").rstrip("/")
if urlparse(BASE).hostname not in {"127.0.0.1", "localhost", "::1"}:
    raise SystemExit("Keyboard tests require the isolated local preview")
OUT = ROOT / "artifacts/snapshots/mobile-keyboard"
OUT.mkdir(parents=True, exist_ok=True)
FIELDS = 'input:not([type="hidden"]):not([type="checkbox"]):not([type="radio"]):not([type="button"]):not([type="submit"]):not([type="file"]):not([type="range"]):not([type="color"]):not([readonly]):not([disabled]), textarea:not([readonly]):not([disabled]), [contenteditable="true"], [contenteditable="plaintext-only"]'
MOCK_VIEWPORT = """const vv = new EventTarget();
Object.assign(vv, {height: innerHeight, width: innerWidth, offsetTop:0, offsetLeft:0, scale:1});
Object.defineProperty(window, 'visualViewport', {value:vv});
window.keyboardGeometry = (height=innerHeight, offsetTop=0, scale=1) => {
  Object.assign(vv, {height, offsetTop, scale, width:innerWidth});
  vv.dispatchEvent(new Event('resize')); vv.dispatchEvent(new Event('scroll'));
};"""


def attach(context):
    context.add_init_script(MOCK_VIEWPORT)
    page = context.new_page()
    errors, writes = [], []
    page.on("pageerror", lambda error: errors.append(str(error)))
    def guard(route):
        if route.request.method not in {"GET", "HEAD", "OPTIONS"} and urlparse(route.request.url).path != "/api/ops/client-events":
            writes.append(route.request.url)
            route.fulfill(status=500, content_type="application/json", body=json.dumps({"error":{"message":"Business writes forbidden in keyboard tests"}}))
        else:
            route.continue_()
    page.route(BASE + "/api/**", guard)
    return page, errors, writes


def geometry(page, height=None, top=0, scale=1):
    page.evaluate("([height,top,scale]) => window.keyboardGeometry(height ?? innerHeight,top,scale)", [height, top, scale])
    page.wait_for_timeout(160)


def assert_visible_input(field, top, bottom):
    box = field.bounding_box()
    assert box and box["width"] > 0, "focused input must have a real box"
    assert box["y"] >= top - 1, (field.get_attribute("aria-label"), box, top, bottom)
    # A long textarea keeps its first line visible and scrolls text internally.
    required_height = 44 if box["height"] > bottom - top - 24 else box["height"]
    assert box["y"] + required_height <= bottom + 1, (field.get_attribute("aria-label"), box, top, bottom)
    assert field.evaluate("el => parseFloat(getComputedStyle(el).fontSize) >= 16"), "iOS input zoom prevention"


def scan_fields(page, name, height=380, top=80):
    fields = page.locator(FIELDS).filter(visible=True)
    count = 0
    for index in range(fields.count()):
        field = fields.nth(index)
        if field.evaluate('el => !!el.closest("[inert], [hidden], [aria-hidden=true]") || el.getBoundingClientRect().width < 2 || el.getBoundingClientRect().height < 2'):
            continue
        geometry(page)
        field.focus()
        geometry(page, height, top)
        assert_visible_input(field, top, top + height)
        count += 1
    page.evaluate("document.activeElement?.blur()")
    geometry(page)
    print(f"PASS {name}: {count} editable fields", flush=True)
    return count


def picker_case(browser, engine, width=390, height=844):
    context = browser.new_context(viewport={"width":width,"height":height}, is_mobile=True, has_touch=True)
    page, errors, writes = attach(context)
    page.goto(BASE + "/purchase/new", wait_until="networkidle")
    page.evaluate("document.documentElement.style.setProperty('--erp-safe-top','59px'); document.documentElement.style.setProperty('--erp-safe-bottom','34px')")
    page.get_by_role("button", name="搜索采购来源", exact=True).click()
    query = page.get_by_label("查询采购来源", exact=True)
    query.focus()
    for visible_height, offset in [(height - 44, 0), (380, 0), (380, 80), (240, 100)]:
        geometry(page, min(visible_height, height), min(offset, height - min(visible_height, height)))
        offset = min(offset, height - min(visible_height, height))
        assert_visible_input(query, offset, offset + min(visible_height, height))
        header = page.locator('[data-erp-region="dialog-header"]').bounding_box()
        assert header["y"] >= offset - 1, "header must not pan under the status bar"
        viewport = page.locator(".erp-dialog-viewport").last
        assert viewport.evaluate("el => parseFloat(getComputedStyle(el).minHeight) === 0"), "100dvh minimum must not override keyboard bounds"
    page.screenshot(path=str(OUT / f"purchase-selector-{engine}-{width}.png"))
    # Moving focus to a control does not mean the keyboard is already gone.
    page.get_by_role("button", name="关闭", exact=True).focus()
    page.wait_for_timeout(180)
    assert page.evaluate("document.documentElement.dataset.phoneKeyboard === 'open'")
    # iOS occasionally leaves an offset after closing: do not retain the gap.
    geometry(page, height, 80)
    assert page.evaluate("getComputedStyle(document.documentElement).getPropertyValue('--erp-phone-viewport-offset-top').trim() === '0px'")
    page.keyboard.press("Escape")
    page.get_by_role("button", name="搜索采购来源", exact=True).click()
    page.get_by_role("button", name="新建客户", exact=True).click()
    expect(page.get_by_role("heading", name="新增个人客户", exact=True)).to_be_visible()
    assert scan_fields(page, f"{engine} {width}px quick-create") > 0
    page.screenshot(path=str(OUT / f"customer-create-{engine}-{width}.png"))
    page.keyboard.press("Escape")
    page.goto(BASE + "/sales/new", wait_until="networkidle")
    page.get_by_role("button", name="添加商品", exact=True).first.click()
    stock = page.get_by_label("查询销售商品", exact=True)
    stock.focus(); geometry(page, min(300, height), 40)
    assert_visible_input(stock, 40, 40 + min(300, height))
    page.keyboard.press("Escape"); geometry(page)
    page.goto(BASE + "/__design-system", wait_until="networkidle")
    page.get_by_role("button", name="选择商品模板", exact=True).click()
    select_query = page.get_by_label("查询选择商品模板", exact=True)
    select_query.focus(); geometry(page, min(300, height), 40)
    assert_visible_input(select_query, 40, 40 + min(300, height))
    page.keyboard.press("Escape"); geometry(page)
    assert scan_fields(page, f"{engine} {width}px shared form controls") >= 9
    page.goto(BASE + "/finance/income", wait_until="networkidle")
    page.get_by_role("button", name="登记收入", exact=True).click()
    expect(page.get_by_role("heading", name="新增非经营收入", exact=True)).to_be_visible()
    assert scan_fields(page, f"{engine} {width}px finance dialog") >= 4
    page.keyboard.press("Escape"); geometry(page)
    page.goto(BASE + "/inventory", wait_until="networkidle")
    dock = page.locator('[data-erp-component="mobile-action-dock"] input')
    dock.focus(); geometry(page, min(300, height), 40)
    assert_visible_input(dock, 40, 40 + min(300, height))
    before_scroll = page.locator("main").evaluate("el => el.scrollTop")
    dock.fill("4090"); page.wait_for_timeout(200)
    assert page.locator("main").evaluate("el => el.scrollTop") == before_scroll, "typing in a fixed dock must not scroll the underlying list"
    geometry(page, min(300, height), 40, 1.5)
    assert page.evaluate("document.documentElement.dataset.phoneKeyboard !== 'open'")
    geometry(page)
    # Invoke the existing local UI action used by the global AI button. Never
    # submit the draft or call the AI provider; this tests the real drawer.
    page.evaluate("async () => {const {useUiStore}=await import('/src/stores/index.ts'); useUiStore.getState().setAiDrawerOpen(true);}")
    composer = page.get_by_label("发送给 AI 助手", exact=True)
    expect(composer).to_be_visible()
    composer.fill("键盘避让测试草稿")
    for visible_height, offset in [(380,80),(240,100)]:
        geometry(page, visible_height, offset)
        assert_visible_input(composer, offset, offset + visible_height)
        expect(composer).to_have_value("键盘避让测试草稿")
    page.screenshot(path=str(OUT / f"drawer-{engine}-{width}.png"))
    page.get_by_role("button", name="关闭 AI 助手", exact=True).click()
    geometry(page)
    assert not errors, errors
    assert not writes, writes
    print(f"PASS {engine} {width}px selectors, quick-create, dock, drawer, safe areas, focus changes, dismissal and zoom", flush=True)
    context.close()


def route_sweep(browser):
    tree = ast.parse((ROOT / "scripts/browser-mobile-rules.py").read_text())
    routes = next(ast.literal_eval(node.value) for node in tree.body if isinstance(node, ast.Assign) and any(getattr(t,"id",None)=="ROUTES" for t in node.targets))
    total = 0
    for route in routes:
        context = browser.new_context(viewport={"width":390,"height":844}, is_mobile=True, has_touch=True)
        page, errors, writes = attach(context)
        page.goto(BASE + route, wait_until="networkidle")
        total += scan_fields(page, route)
        assert not errors, (route, errors)
        assert not writes, (route, writes)
        context.close()
    assert total > 30, "sweep must exercise real fields, not only empty routes"
    print(f"PASS all {len(routes)} routes, {total} editable fields", flush=True)


def login_case(browser):
    context = browser.new_context(viewport={"width":390,"height":844}, is_mobile=True, has_touch=True)
    page, errors, writes = attach(context)
    page.route(BASE + "/api/auth/me", lambda route: route.fulfill(status=401, content_type="application/json", body=json.dumps({"error":{"message":"未登录"}})))
    page.goto(BASE + "/inventory", wait_until="networkidle")
    expect(page.get_by_role("heading", name="员工登录")).to_be_visible()
    assert scan_fields(page, "login outside AppShell") == 2
    assert not errors, errors
    assert not writes, writes
    context.close()


def layout_resize_case(browser, without_visual_viewport=False):
    context = browser.new_context(viewport={"width":390,"height":844}, is_mobile=True, has_touch=True)
    if without_visual_viewport:
        context.add_init_script("Object.defineProperty(window,'visualViewport',{value:undefined})")
    page = context.new_page()
    page.goto(BASE + "/__design-system", wait_until="networkidle")
    field = page.get_by_label("金额", exact=True)
    field.focus()
    page.set_viewport_size({"width":390,"height":380})
    page.wait_for_timeout(450)
    assert_visible_input(field, 0, 380)
    assert page.evaluate("getComputedStyle(document.documentElement).getPropertyValue('--erp-phone-keyboard-inset').trim() === '0px'"), "layout resize must not subtract the keyboard twice"
    assert page.evaluate("document.documentElement.dataset.phoneKeyboard === 'open'")
    page.set_viewport_size({"width":390,"height":844})
    field.blur(); page.wait_for_timeout(450)
    assert page.evaluate("document.documentElement.dataset.phoneKeyboard !== 'open'")
    print(f"PASS layout-resize keyboard; visualViewport fallback={without_visual_viewport}", flush=True)
    context.close()


def landscape_case(browser):
    context = browser.new_context(viewport={"width":844,"height":390}, is_mobile=True, has_touch=True)
    page, errors, writes = attach(context)
    page.goto(BASE + "/__design-system", wait_until="networkidle")
    customer = page.get_by_role("combobox", name="验收客户", exact=True)
    customer.click()
    geometry(page, 190, 70)
    assert_visible_input(customer, 70, 260)
    panel = page.get_by_role("listbox", name="客户候选", exact=True).bounding_box()
    assert panel["y"] >= 70 and panel["y"] + panel["height"] <= 261, panel
    page.screenshot(path=str(OUT / "landscape-844.png"))
    geometry(page, 390, 80)
    restored = page.get_by_role("listbox", name="客户候选", exact=True).bounding_box()
    assert restored["y"] + restored["height"] <= 391, "anchored picker must also clamp stale dismissal offsets"
    assert not errors, errors
    assert not writes, writes
    print("PASS touch landscape input and anchored picker keyboard bounds", flush=True)
    context.close()


with sync_playwright() as p:
    chromium = p.chromium.launch()
    for width in (320,390,430):
        picker_case(chromium, "chromium", width)
    route_sweep(chromium)
    login_case(chromium)
    layout_resize_case(chromium)
    layout_resize_case(chromium, True)
    landscape_case(chromium)
    chromium.close()
    webkit = p.webkit.launch()
    picker_case(webkit, "webkit")
    login_case(webkit)
    webkit.close()
