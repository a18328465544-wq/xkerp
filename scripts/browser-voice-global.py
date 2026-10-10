"""V10 local smoke: global auto-scene voice draft handoff, with mocked APIs only."""
import json
import os
from pathlib import Path
from urllib.parse import urlparse

from playwright.sync_api import expect, sync_playwright

BASE = os.environ.get("VOICE_SMOKE_BASE_URL", "http://127.0.0.1:3012").rstrip("/")
if urlparse(BASE).hostname not in {"127.0.0.1", "localhost"}:
    raise SystemExit("VOICE_SMOKE_BASE_URL must be a loopback URL")
OUT = Path("artifacts/snapshots/phase5-after")
OUT.mkdir(parents=True, exist_ok=True)

ACCOUNT = {"id": "SA-LOCAL", "name": "本地测试账户", "type": "现金", "enabled": True, "balance": 100_000}
CUSTOMER = {"id": "CRM-C1", "displayName": "张三", "roles": ["customer"], "primaryPhone": "13800000000", "legacyCustomer": {"id": "KH-1", "name": "张三", "phone": "13800000000", "contact": "13800000000", "source": "闲鱼"}}
VENDOR = {"id": "V-LI", "name": "李四", "contact": "13812345678", "phone": "13812345678"}
PRODUCT = {"id": "P-4090", "productId": "P-4090", "name": "华硕 RTX 4090 猛禽 24G", "productName": "华硕 RTX 4090 猛禽 24G", "category": "显卡", "brand": "华硕", "model": "RTX 4090", "version": "猛禽", "vram": "24G", "refBuyPrice": 17_000, "refSellPrice": 19_200, "inventoryQuantity": 1, "availableQuantity": 1, "reservedQuantity": 0, "costPrice": 17_000, "estimatedSellPrice": 19_200, "saleable": True, "entryTime": "2026-10-01", "inventoryDays": 10}
CARD = {"id": "KC-3821", "productId": "P-4090", "productName": PRODUCT["productName"], "category": "显卡", "brand": "华硕", "model": "RTX 4090", "version": "猛禽", "vram": "24G", "sn": "SN-RTX-3821", "status": "已入库", "condition": "99新", "warehouseLocation": "A区货架-01", "costPrice": 17_000, "estSellPrice": 19_200, "entryTime": "2026-10-01", "storageDays": 10}
TRANSCRIPTS = {
    "purchase": "同行拿货李四一张 4090 猛禽，采购价一万七",
    "sales": "卖给张三一张 4090 猛禽，一万九，闲鱼，SN 尾号 3821",
    "customer": "王总微信要一张 4090，预算 15000，电话 13800000000",
}
PARSED = {
    "purchase": {"parseId": "GLOBAL-PURCHASE-1", "scene": "purchase", "transcript": TRANSCRIPTS["purchase"], "source": "rules", "purchase": {"sourceType": "同行拿货", "partner": {"query": "李四", "candidates": [{"id": "V-LI", "name": "李四"}], "matchedId": "V-LI", "phone": "13812345678"}, "lines": [{"productQuery": "4090 猛禽", "candidates": [{"id": "P-4090", "name": PRODUCT["name"]}], "productId": "P-4090", "quantity": 1, "buyPrice": 17_000}], "payment": {"method": "现金", "status": "未付款", "paidAmount": 0}}, "issues": []},
    "sales": {"parseId": "GLOBAL-SALES-1", "scene": "sales", "transcript": TRANSCRIPTS["sales"], "source": "rules", "sales": {"customer": {"query": "张三", "candidates": [{"id": "KH-1", "name": "张三"}], "matchedId": "KH-1", "phone": "13800000000"}, "lines": [{"productQuery": "4090 猛禽", "snTail": "3821", "sellPrice": 19_000, "quantity": 1}], "channel": "闲鱼", "paymentMethod": "微信", "isPaid": False, "aftersalesTerms": "店保半年"}, "issues": []},
    "customer": {"parseId": "GLOBAL-CUSTOMER-1", "scene": "customer", "transcript": TRANSCRIPTS["customer"], "source": "rules", "customer": {"rawTextForQuickCapture": TRANSCRIPTS["customer"]}, "issues": []},
}
QUICK_CAPTURE = {"parseId": "GLOBAL-QUICK-CAPTURE-1", "rawText": TRANSCRIPTS["customer"], "sourceType": "voice", "fields": {"customerName": "王总", "phone": "13800000000", "productModel": "4090", "quantity": 1, "expectedPrice": 15_000, "tags": []}, "confidence": 0.95, "missingFields": [], "conflicts": [], "customerCandidates": [], "productCandidates": [], "source": "rules", "parsedAt": "2026-10-11T00:00:00.000Z"}


def run_case(browser, width, scene):
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
            assert payload["scene"] == "auto" and payload["text"].strip()
            body = {"data": {**PARSED[scene], "transcript": payload["text"]}}
        elif path == "/api/purchase-invoices/reference":
            body = {"data": {"products": [PRODUCT], "customers": [CUSTOMER["legacyCustomer"]], "vendors": [VENDOR], "settlementAccounts": [ACCOUNT], "purchaseInvoices": [], "inventory": []}, "meta": {"nextInvoiceNo": "JH-LOCAL-VOICE-001"}}
        elif path == "/api/sales/customers":
            body = {"data": {"items": [CUSTOMER], "meta": {"page": 1, "pageSize": 200, "total": 1}}}
        elif path == "/api/sales/product-candidates":
            body = {"data": [PRODUCT]}
        elif path == "/api/inventory/items":
            body = {"data": [CARD], "meta": {"page": 1, "pageSize": 100, "total": 1}}
        elif path.endswith("/settlement-accounts"):
            body = {"data": [ACCOUNT], "meta": {"total": 1}}
        elif path == "/api/gpu_erp/crm/quick-capture/parse" and request.method == "POST":
            assert request.post_data_json["sourceType"] == "voice"
            body = {"data": QUICK_CAPTURE}
        elif path.startswith("/api/state"):
            body = {"data": {"products": [PRODUCT], "inventory": [CARD], "customers": [CUSTOMER["legacyCustomer"]], "vendors": [VENDOR], "settlementAccounts": [ACCOUNT], "purchaseInvoices": [], "salesInvoices": [], "inspections": [], "systemUsers": [], "customPermissions": []}, "meta": {"revision": 1}}
        elif request.method not in {"GET", "HEAD"} and path != "/api/ops/client-events":
            writes.append(path)
            route.fulfill(status=409, content_type="application/json", body=json.dumps({"error": {"message": "Isolated smoke test blocks business writes"}}))
            return
        else:
            body = {"data": [], "meta": {"page": 1, "pageSize": 100, "total": 0}}
        route.fulfill(status=200, content_type="application/json", body=json.dumps(body, ensure_ascii=False))

    page.route(BASE + "/api/**", api)
    page.route(BASE + "/src/hooks/useWorkspaceTabRuntime.tsx*", runtime)
    page.goto(BASE + "/inventory", wait_until="networkidle", timeout=90_000)
    if phone:
        page.get_by_role("button", name="开单", exact=True).click()
        entry = page.locator('[data-erp-component="voice-entry-control"]').last
        entry.get_by_role("button", name="改用文字", exact=True).click()
    else:
        page.get_by_role("button", name="打开语音快捷录入（当前使用文字输入）", exact=True).click()

    transcript = page.locator('textarea[id="voice-draft-transcript"]')
    expect(transcript).to_be_visible()
    transcript.fill(TRANSCRIPTS[scene])
    page.get_by_role("button", name="重新解析", exact=True).click()
    expect(page.get_by_role("region", name="语音快捷录入预览")).to_be_visible()
    expect(page.get_by_role("button", name="确认并打开对应页面", exact=True)).to_be_enabled()
    page.screenshot(path=str(OUT / f"global_voice_{scene}_{width}.png"), full_page=True)
    page.get_by_role("button", name="确认并打开对应页面", exact=True).click()

    target = {"purchase": "/purchase/new", "sales": "/sales/new", "customer": "/crm/customers/new"}[scene]
    page.wait_for_url(f"**{target}*", timeout=20_000)
    page.wait_for_timeout(1_000)
    if scene == "purchase":
        expect(page.get_by_role("heading", name="批量粘贴采购明细")).to_be_visible(timeout=20_000)
    elif scene == "sales":
        expect(page.get_by_role("region", name="销售语音草稿预览")).to_be_visible(timeout=20_000)
    else:
        expect(page.get_by_role("heading", name="解析预览")).to_be_visible(timeout=20_000)
        expect(page.get_by_text("王总", exact=True)).to_be_visible()
    page.screenshot(path=str(OUT / f"global_handoff_{scene}_{width}.png"), full_page=True)
    assert "voiceDraftId=" not in page.url, page.url
    assert page.evaluate("Object.keys(sessionStorage).some(key => key.startsWith('voice-draft:'))") is False
    assert writes == [], writes
    assert not errors, errors
    assert not page.evaluate("document.documentElement.scrollWidth > innerWidth")
    print(json.dumps({"width": width, "scene": scene, "routed": target, "handoffConsumed": True, "businessWrites": writes, "screenshots": str(OUT)}), flush=True)
    context.close()


with sync_playwright() as playwright:
    browser = playwright.chromium.launch(headless=True)
    for width in (1440, 390):
        for scene in ("purchase", "sales", "customer"):
            run_case(browser, width, scene)
    browser.close()
