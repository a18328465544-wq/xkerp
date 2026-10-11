"""Loopback-only regression: primary tab scroll, safe areas and voice fallback.

Uses the existing synthetic workbench fixtures, blocks business writes and never
calls an ASR provider. Chromium swipes use real touch input, not scrollTop writes.
"""
import json
import os
import re
from pathlib import Path
from urllib.parse import urlparse

from playwright.sync_api import expect, sync_playwright

BASE = os.environ.get("ENTRY_SCROLL_BASE_URL", os.environ.get("MOBILE_RULES_BASE_URL", "http://127.0.0.1:3020")).rstrip("/")
if urlparse(BASE).hostname not in {"127.0.0.1", "localhost"}:
    raise SystemExit("ENTRY_SCROLL_BASE_URL must be loopback")
ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "artifacts" / "snapshots" / "mobile-entry-scroll"
OUT.mkdir(parents=True, exist_ok=True)

# Reuse the authenticated fixture/route contract without running its smoke suite.
fixtures = {"__file__": str(ROOT / "scripts" / "browser-mobile-workbench.py")}
exec((ROOT / "scripts" / "browser-mobile-workbench.py").read_text().split("with sync_playwright()")[0], fixtures)
fixtures["BASE"] = BASE


def swipe(page, context, start=650, end=230):
    session = context.new_cdp_session(page)
    session.send("Input.dispatchTouchEvent", {"type": "touchStart", "touchPoints": [{"x": 200, "y": start}]})
    step = -20 if end < start else 20
    for y in range(start + step, end, step):
        session.send("Input.dispatchTouchEvent", {"type": "touchMove", "touchPoints": [{"x": 200, "y": y}]})
        page.wait_for_timeout(20)
    session.send("Input.dispatchTouchEvent", {"type": "touchEnd", "touchPoints": []})
    page.wait_for_timeout(350)
    session.detach()


def phone_case(browser, enabled, width=390):
    context = browser.new_context(viewport={"width": width, "height": 844}, is_mobile=True, has_touch=True, permissions=["microphone"])
    page = context.new_page()
    _, writes, errors = fixtures["attach"](page)
    page.route(BASE + "/api/voice/status", lambda route: route.fulfill(content_type="application/json", body=json.dumps({"data": {"asrEnabled": enabled, "aiEnabled": False, "maxSeconds": 30}})))
    page.goto(BASE + "/inventory", wait_until="networkidle")
    # Emulate iPhone safe areas; these are geometry fixtures, not device proof.
    page.evaluate("document.documentElement.style.setProperty('--erp-safe-top', '59px'); document.documentElement.style.setProperty('--erp-safe-bottom', '34px')")
    nav = page.get_by_role("navigation", name="手机主导航")
    nav.get_by_role("button", name="开单", exact=True).click()
    panel = page.locator('[data-mobile-presentation="tab"]')
    body = panel.locator('[data-erp-region="dialog-body"]')
    expect(panel.get_by_role("heading", name="快捷录入", exact=True)).to_be_visible()
    page.screenshot(path=str(OUT / f"entry-{width}-{'voice' if enabled else 'text'}.png"))
    assert body.evaluate("e => e.scrollHeight > e.clientHeight"), "hidden rows must create scroll overflow"
    swipe(page, context)
    assert body.evaluate("e => e.scrollTop > 0"), "touch swipe must scroll the tab body"
    last = panel.get_by_role("link", name="退货单据", exact=True)
    expect(last).to_be_visible()
    assert last.bounding_box()["y"] + last.bounding_box()["height"] <= nav.bounding_box()["y"] + 1
    assert panel.bounding_box()["y"] >= 59
    assert abs(panel.bounding_box()["y"] + panel.bounding_box()["height"] - nav.bounding_box()["y"]) <= 1, "panel and navigation must meet without a background-content gap"
    page.screenshot(path=str(OUT / f"entry-{width}-scrolled.png"))
    # Return to the voice action with reverse touch scrolling.
    swipe(page, context, start=230, end=650)
    trigger = panel.locator('[data-voice-entry-trigger]')
    assert abs(trigger.bounding_box()["width"] - trigger.locator("..").bounding_box()["width"]) < 1
    if enabled:
        expect(trigger).to_have_accessible_name("按住说话")
        expect(panel.locator('[data-erp-component="voice-capture"]')).to_have_class(re.compile(r"\bw-full\b"))
        if width == 390:
            # Synthetic browser microphone + mocked provider: proves the
            # production envelope reaches the draft, not physical iOS ASR.
            calls = []
            def transcribe(route):
                assert route.request.headers["content-type"] == "audio/wav"
                assert len(route.request.post_data_buffer) > 44
                calls.append("transcribe")
                route.fulfill(content_type="application/json", body=json.dumps({"data": {"text": "采购一张4090", "durationMs": 1200, "provider": "mock"}}))
            def parse(route):
                assert route.request.post_data_json == {"text": "采购一张4090", "scene": "auto"}
                calls.append("parse")
                route.fulfill(content_type="application/json", body=json.dumps({"data": {"parseId": "LOCAL-SPEECH", "scene": None, "transcript": "采购一张4090", "source": "rules", "issues": []}}))
            page.route(BASE + "/api/voice/transcribe", transcribe)
            page.route(BASE + "/api/voice/parse", parse)
            box = trigger.bounding_box()
            session = context.new_cdp_session(page)
            session.send("Input.dispatchTouchEvent", {"type": "touchStart", "touchPoints": [{"x": box["x"] + box["width"] / 2, "y": box["y"] + box["height"] / 2}]})
            expect(page.get_by_role("status", name="正在录音，松开按钮结束，上滑取消")).to_be_visible()
            page.wait_for_timeout(1500)
            session.send("Input.dispatchTouchEvent", {"type": "touchEnd", "touchPoints": []})
            expect(page.locator('#voice-draft-transcript')).to_have_value("采购一张4090", timeout=15000)
            expect(page.get_by_role("region", name="语音快捷录入预览")).to_be_visible()
            assert calls == ["transcribe", "parse"]
            page.screenshot(path=str(OUT / "voice-transcription-390.png"))
            page.get_by_role("button", name="关闭", exact=True).click()
            session.detach()
    else:
        expect(trigger).to_have_text("输入文字生成草稿")
        trigger.click()
        expect(page.get_by_role("heading", name="文字录入草稿", exact=True)).to_be_visible()
        expect(page.locator('#voice-draft-transcript')).to_be_visible()
        expect(page.get_by_role("button", name="改用文字", exact=True)).to_have_count(0)
        page.screenshot(path=str(OUT / f"text-draft-{width}.png"))
        page.get_by_role("button", name="关闭", exact=True).click()
        expect(nav).to_be_visible()
        # Nested modal cleanup must not leave the primary tab scroll-locked.
        swipe(page, context)
        assert body.evaluate("e => e.scrollTop > 0")
    nav.get_by_role("button", name="我的", exact=True).click()
    expect(page.get_by_role("heading", name="我的", exact=True)).to_be_visible()
    body = page.locator('[data-mobile-presentation="tab"] [data-erp-region="dialog-body"]')
    swipe(page, context)
    assert body.evaluate("e => e.scrollTop > 0")
    nav.get_by_role("link", name="库存", exact=True).click()
    expect(page.locator('[data-mobile-presentation="tab"]')).to_have_count(0)
    assert not writes, writes
    assert not errors, errors
    print(f"PASS {width}px touch scrolling, safe areas, nested cleanup; ASR={enabled}", flush=True)
    context.close()


with sync_playwright() as playwright:
    browser = playwright.chromium.launch(args=["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream"])
    for width in (320, 390):
        for enabled in (False, True):
            phone_case(browser, enabled, width)
    context = browser.new_context(viewport={"width": 1440, "height": 960})
    page = context.new_page()
    fixtures["attach"](page)
    page.goto(BASE + "/inventory", wait_until="networkidle")
    expect(page.get_by_role("navigation", name="手机主导航")).not_to_be_visible()
    page.screenshot(path=str(OUT / "inventory-1440.png"))
    context.close()
    browser.close()
