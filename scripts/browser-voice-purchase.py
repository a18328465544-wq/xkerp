"""Local-only purchase voice-entry regression with mocked voice/API providers.

Runs against the caller-supplied loopback Vite URL. No microphone, provider,
database, or business write is used; screenshots are retained as phase evidence.
"""
import json
import os
from pathlib import Path
from urllib.parse import urlparse

from playwright.sync_api import expect, sync_playwright

BASE = os.environ.get("VOICE_SMOKE_BASE_URL", "http://127.0.0.1:3012").rstrip("/")
if urlparse(BASE).hostname not in {"127.0.0.1", "localhost"}:
    raise SystemExit("VOICE_SMOKE_BASE_URL must be a loopback URL")
OUT = Path("artifacts/snapshots/phase3-after")
OUT.mkdir(parents=True, exist_ok=True)

PRODUCT = {"id": "P-4090", "name": "华硕 RTX 4090 ROG STRIX 猛禽 24G", "category": "显卡", "model": "RTX 4090", "brand": "华硕", "version": "ROG STRIX 猛禽", "vram": "24G", "refBuyPrice": 17_700, "refSellPrice": 19_200}
VENDOR = {"id": "V-LI", "name": "李四", "contact": "13812345678", "phone": "13812345678"}
ACCOUNT = {"id": "SA-LOCAL", "name": "本地测试现金账户", "type": "现金", "enabled": True, "balance": 100_000}
STATE = {"products": [PRODUCT], "customers": [], "vendors": [VENDOR], "settlementAccounts": [ACCOUNT], "inventory": [], "purchaseInvoices": [], "salesInvoices": [], "inspections": [], "systemUsers": [], "customPermissions": []}
TRANSCRIPT = "同行拿货李四两张 4090 猛禽，每张七千八，一张99新带盒，一张修过，现金付清"
PRODUCT_CANDIDATE = {"id": "P-4090", "name": PRODUCT["name"], "category": "显卡", "brand": "华硕", "model": "RTX 4090", "version": "ROG STRIX 猛禽", "vram": "24G", "refBuyPrice": 17_700}
PARSED = {"parseId": "LOCAL-VOICE-PURCHASE", "scene": "purchase", "transcript": TRANSCRIPT, "source": "rules", "purchase": {"sourceType": "同行拿货", "partner": {"query": "李四", "candidates": [{"id": "V-LI", "name": "李四"}], "matchedId": "V-LI", "phone": "13812345678"}, "lines": [{"productQuery": "4090 猛禽", "candidates": [PRODUCT_CANDIDATE], "productId": "P-4090", "quantity": 1, "buyPrice": 7_800, "condition": "99新", "fullBox": True}, {"productQuery": "4090 猛禽", "candidates": [PRODUCT_CANDIDATE], "productId": "P-4090", "quantity": 1, "buyPrice": 7_800, "repaired": True}], "payment": {"method": "现金", "status": "已付款", "paidAmount": 15_600}}, "issues": []}

with sync_playwright() as playwright:
    browser = playwright.chromium.launch(headless=True)
    for width in (1440, 390):
        phone = width < 768
        context = browser.new_context(viewport={"width": width, "height": 960 if not phone else 844}, device_scale_factor=1, is_mobile=phone, has_touch=phone)
        page = context.new_page()
        writes, errors = [], []
        page.on("pageerror", lambda error: errors.append(str(error)))

        def runtime(route):
            response = route.fetch()
            body = response.text()
            if "const drafts = {};" not in body:
                raise AssertionError("workspace draft store marker changed")
            route.fulfill(response=response, body=body)

        def api(route):
            request = route.request
            path = urlparse(request.url).path
            if path == "/api/auth/me":
                body = {"data": {"id": "local-voice", "username": "local-voice", "displayName": "本地语音测试员", "role": "老板", "enabled": True, "csrfToken": "local-csrf"}}
            elif path == "/api/voice/status":
                body = {"data": {"asrEnabled": False, "aiEnabled": True, "maxSeconds": 30}}
            elif path == "/api/voice/parse" and request.method == "POST":
                payload = request.post_data_json
                assert payload["scene"] == "purchase" and payload["text"].strip()
                body = {"data": PARSED}
            elif path.startswith("/api/purchase-invoices/reference") or path.startswith("/api/state"):
                body = {"data": STATE, "meta": {"nextInvoiceNo": "JH-LOCAL-VOICE-001"}}
            elif path.endswith("/settlement-accounts"):
                body = {"data": [ACCOUNT], "meta": {"total": 1}}
            elif request.method not in {"GET", "HEAD"} and path != "/api/ops/client-events":
                writes.append(path)
                route.fulfill(status=409, content_type="application/json", body=json.dumps({"error": {"message": "This isolated test blocks business writes"}}))
                return
            else:
                body = {"data": [], "meta": {"total": 0}}
            route.fulfill(status=200, content_type="application/json", body=json.dumps(body, ensure_ascii=False))

        page.route(BASE + "/api/**", api)
        page.route(BASE + "/src/hooks/useWorkspaceTabRuntime.tsx*", runtime)
        page.goto(BASE + "/purchase/new", wait_until="networkidle", timeout=90000)
        expect(page.get_by_role("heading", name="采购开单" if phone else "进货与回收")).to_be_visible()
        page.wait_for_timeout(300)
        page.screenshot(path=str(OUT / f"purchase_new_{width}.png"), full_page=True)

        trigger_name = "改用文字" if phone else "文字录入"
        page.get_by_role("button", name=trigger_name, exact=True).click()
        transcript = page.locator('textarea[id="voice-draft-transcript"]')
        expect(transcript).to_be_visible()
        transcript.fill(TRANSCRIPT)
        page.get_by_role("button", name="重新解析", exact=True).click()
        expect(page.get_by_role("button", name="应用到当前表单草稿", exact=True)).to_be_enabled()
        page.screenshot(path=str(OUT / f"purchase_voice_parse_{width}.png"), full_page=True)
        page.get_by_role("button", name="应用到当前表单草稿", exact=True).click()

        expect(page.get_by_role("heading", name="批量粘贴采购明细")).to_be_visible()
        expect(page.locator('textarea[aria-label="采购明细粘贴文本"]')).to_have_value(TRANSCRIPT)
        expect(page.get_by_role("spinbutton", name="第 1 行数量")).to_have_value("1")
        expect(page.get_by_role("spinbutton", name="第 2 行数量")).to_have_value("1")
        expect(page.get_by_role("button", name="确认加入（2 行）", exact=True)).to_be_enabled()
        expect(page.get_by_text("识别建议：成色 99新 · 带盒，检测质检时复核", exact=True)).to_be_visible()
        expect(page.get_by_text("识别建议：有维修，检测质检时复核", exact=True)).to_be_visible()
        page.screenshot(path=str(OUT / f"purchase_voice_preview_{width}.png"), full_page=True)
        page.get_by_role("button", name="确认加入（2 行）", exact=True).click()
        expect(page.locator('textarea[name="remarks"]')).to_have_value(f"【语音】{TRANSCRIPT}")
        expect(page.get_by_role("spinbutton", name="第 5 行数量", exact=True)).to_have_value("1")
        expect(page.get_by_role("spinbutton", name="第 6 行数量", exact=True)).to_have_value("1")
        if phone:
            expect(page.get_by_role("button", name="搜索采购来源")).to_contain_text("李四")
        else:
            expect(page.get_by_role("combobox", name="搜索采购来源")).to_have_value("李四 · 13812345678")
        if phone:
            page.get_by_role("button", name="下一步：结算", exact=True).click()
        expect(page.get_by_role("button", name="全额付款", exact=True)).to_have_attribute("aria-pressed", "true")
        assert writes == [], writes
        assert not errors, errors
        assert not page.evaluate("document.documentElement.scrollWidth > innerWidth")
        print(json.dumps({"width": width, "twoLinePreviewAndApply": True, "conditionBoxRepairSuggestions": True, "remarksPreserved": True, "sourceMatched": True, "paymentPreset": True, "businessWrites": writes, "screenshot": str(OUT)}), flush=True)
        context.close()
    browser.close()
