"""Local-only V9 sales voice-entry smoke test with mocked API responses.

The test blocks all business writes and never opens a microphone or calls an
ASR/AI provider. It records desktop and phone screenshots for phase evidence.
"""
import json
import os
from pathlib import Path
from urllib.parse import urlparse

from playwright.sync_api import expect, sync_playwright

BASE = os.environ.get("VOICE_SMOKE_BASE_URL", "http://127.0.0.1:3012").rstrip("/")
if urlparse(BASE).hostname not in {"127.0.0.1", "localhost"}:
    raise SystemExit("VOICE_SMOKE_BASE_URL must be a loopback URL")
OUT = Path("artifacts/snapshots/phase4-after")
OUT.mkdir(parents=True, exist_ok=True)

TRANSCRIPT = "卖给张三一张 4090 猛禽，一万九，微信收了，店保半年，闲鱼的，SN 尾号 3821"
CUSTOMER = {"id": "CRM-C1", "displayName": "张三", "roles": ["customer"], "primaryPhone": "13800000000", "legacyCustomer": {"id": "KH-1", "name": "张三", "phone": "13800000000", "contact": "13800000000", "source": "闲鱼"}}
ACCOUNT = {"id": "SA-LOCAL", "name": "本地测试微信账户", "type": "微信", "enabled": True, "balance": 100_000}
PRODUCT = {"id": "P-4090", "productId": "P-4090", "productName": "华硕 RTX 4090 猛禽 24G", "category": "显卡", "brand": "华硕", "model": "RTX 4090", "version": "猛禽", "vram": "24G", "inventoryQuantity": 1, "reservedQuantity": 0, "availableQuantity": 1, "costPrice": 17_000, "estimatedSellPrice": 19_200, "entryTime": "2026-10-01", "inventoryDays": 10, "saleable": True}
CARD = {"id": "KC-3821", "productId": "P-4090", "productName": PRODUCT["productName"], "category": "显卡", "brand": "华硕", "model": "RTX 4090", "version": "猛禽", "vram": "24G", "sn": "SN-RTX-3821", "status": "已入库", "condition": "99新", "warehouseLocation": "A区货架-01", "costPrice": 17_000, "estSellPrice": 19_200, "entryTime": "2026-10-01", "storageDays": 10}
PARSED = {"parseId": "LOCAL-VOICE-SALES", "scene": "sales", "transcript": TRANSCRIPT, "source": "rules", "sales": {"customer": {"query": "张三", "candidates": [{"id": "KH-1", "name": "张三"}], "matchedId": "KH-1", "phone": "13800000000"}, "lines": [{"productQuery": "4090 猛禽", "snTail": "3821", "sellPrice": 19_000, "quantity": 1}], "channel": "闲鱼", "paymentMethod": "微信", "isPaid": True, "aftersalesTerms": "店保半年"}, "issues": []}

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
                assert payload["scene"] == "sales" and payload["text"].strip()
                body = {"data": PARSED}
            elif path == "/api/sales/customers":
                body = {"data": {"items": [CUSTOMER], "meta": {"page": 1, "pageSize": 200, "total": 1}}}
            elif path == "/api/sales/product-candidates":
                body = {"data": [PRODUCT]}
            elif path == "/api/inventory/items":
                body = {"data": [CARD], "meta": {"page": 1, "pageSize": 100, "total": 1}}
            elif path.endswith("/settlement-accounts"):
                body = {"data": [ACCOUNT], "meta": {"total": 1}}
            elif path.startswith("/api/state"):
                body = {"data": {"revision": 1}}
            elif request.method not in {"GET", "HEAD"} and path != "/api/ops/client-events":
                writes.append(path)
                route.fulfill(status=409, content_type="application/json", body=json.dumps({"error": {"message": "This isolated test blocks business writes"}}))
                return
            else:
                body = {"data": [], "meta": {"total": 0}}
            route.fulfill(status=200, content_type="application/json", body=json.dumps(body, ensure_ascii=False))

        page.route(BASE + "/api/**", api)
        page.route(BASE + "/src/hooks/useWorkspaceTabRuntime.tsx*", runtime)
        page.goto(BASE + "/sales/new", wait_until="networkidle", timeout=90_000)
        expect(page.get_by_role("heading", name="销售开单")).to_be_visible()
        page.wait_for_timeout(350)
        page.screenshot(path=str(OUT / f"sales_new_{width}.png"), full_page=True)

        trigger_name = "改用文字" if phone else "文字录入"
        page.get_by_role("button", name=trigger_name, exact=True).click()
        transcript = page.locator('textarea[id="voice-draft-transcript"]')
        expect(transcript).to_be_visible()
        transcript.fill(TRANSCRIPT)
        page.get_by_role("button", name="重新解析", exact=True).click()
        expect(page.get_by_role("region", name="销售语音草稿预览")).to_be_visible()
        expect(page.get_by_text("已按 SN 尾号自动定位", exact=False)).to_be_visible()
        expect(page.get_by_role("button", name="应用到当前表单草稿", exact=True)).to_be_enabled()
        page.screenshot(path=str(OUT / f"sales_voice_preview_{width}.png"), full_page=True)
        page.get_by_role("button", name="应用到当前表单草稿", exact=True).click()
        if phone:
            expect(page.get_by_role("button", name="搜索销售客户")).to_contain_text("张三")
        else:
            expect(page.get_by_role("combobox", name="搜索销售客户")).to_have_value("张三 · 13800000000")
        if phone:
            page.get_by_role("button", name="备注/明细", exact=True).click()
        expect(page.locator('[aria-label="第 5 行备注"]').first).to_have_value("语音建议出库卡尾号：3821（录单未锁卡，出库时仍需扫码确认）")
        if phone:
            expect(page.get_by_role("article", name="第 5 行商品")).to_contain_text("华硕 RTX 4090 猛禽 24G")
        else:
            expect(page.get_by_role("combobox", name="选择销售商品").last).to_have_value("华硕 RTX 4090 猛禽 24G")
        if phone:
            page.get_by_role("button", name="下一步：结算", exact=True).click()
            expect(page.get_by_role("button", name="全额收款", exact=True)).to_have_attribute("aria-pressed", "true")
        else:
            expect(page.get_by_role("spinbutton", name="第 5 行数量")).to_have_value("1")
        page.screenshot(path=str(OUT / f"sales_voice_applied_{width}.png"), full_page=True)
        assert writes == [], writes
        assert not errors, errors
        assert not page.evaluate("document.documentElement.scrollWidth > innerWidth")
        print(json.dumps({"width": width, "customerMatched": True, "snTailLocated": True, "modelDraftApplied": True, "fullPaymentPreset": phone, "businessWrites": writes, "screenshot": str(OUT)}), flush=True)
        context.close()
    browser.close()
