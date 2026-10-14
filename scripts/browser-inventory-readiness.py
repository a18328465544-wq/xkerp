"""Local-only cross-page model sorting and long risk identity/detail acceptance."""
import json
import os
from pathlib import Path
from urllib.parse import parse_qs, urlparse
from playwright.sync_api import expect, sync_playwright

BASE = os.environ.get("INVENTORY_READINESS_QA_BASE_URL", "http://127.0.0.1:3034").rstrip("/")
if urlparse(BASE).hostname not in {"127.0.0.1", "localhost"}:
    raise SystemExit("Inventory acceptance must use loopback, never production")
ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "artifacts" / "snapshots" / "inventory-readiness"
OUT.mkdir(parents=True, exist_ok=True)
fixture = {"__file__": str(ROOT / "scripts" / "browser-mobile-workbench.py")}
exec((ROOT / "scripts" / "browser-mobile-workbench.py").read_text().split("with sync_playwright()")[0], fixture)
fixture["BASE"] = BASE
MODELS = [{"key": str(n), "productName": f"分页核对型号{n:02d}", "category": "CPU", "brand": "", "model": "", "vram": "",
           "totalCount": n, "availableCount": n, "pendingCount": 0, "lockedCount": 0,
           "warehouseLocations": ["A区货架-01"], "lastEntryTime": f"2026-10-{n:02d}"} for n in range(30, 0, -1)]
NAME = "完整显示超长商品型号 RTX4090 Advanced OC 官方盒装 24G 与售后规格测试"
SN = "000000-SERIAL-THIS-MUST-NOT-BE-ELLIPSIZED-20261014-4090"
STOCK = {**fixture["STOCK"], "productName": NAME, "sn": SN}
RISK = {"inventoryId": STOCK["id"], "productName": NAME, "serialNumber": SN, "warehouseLocation": "A区货架-01", "inventoryDays": 30,
        "entryTime": "2026-09-14", "costPrice": 24000, "marketPrice": 23000, "floatingLoss": 1000, "marketKnown": True}
SUMMARY = {"onHandCount": 1, "marketKnownCount": 1, "missingMarketCount": 0, "totalMarketValue": 23000, "floatingLoss": 1000, "invertedCount": 1}

def bind(page):
    _, writes, errors = fixture["attach"](page)
    page.route(BASE + "/api/inventory/summary?*", lambda route: route.fulfill(content_type="application/json", body=json.dumps({"data": MODELS})))
    page.route(BASE + "/api/inventory/market-risk?*", lambda route: route.fulfill(content_type="application/json", body=json.dumps({"data": {"data": [RISK], "summary": SUMMARY, "meta": {"total": 1, "page": 1, "pageSize": 20}}})))
    page.route(BASE + "/api/inventory/items?*", lambda route: route.fulfill(content_type="application/json", body=json.dumps({"data": [STOCK], "meta": {"total": 1, "page": 1, "pageSize": 20}})))
    return writes, errors

with sync_playwright() as playwright:
    browser = playwright.chromium.launch(headless=True)
    for width in (320, 390, 1440):
        context = browser.new_context(viewport={"width": width, "height": 844 if width < 768 else 960}, is_mobile=width < 768, has_touch=width < 768)
        page = context.new_page()
        writes, errors = bind(page)
        page.goto(BASE + "/inventory?view=models&page=2", wait_until="networkidle")
        titles = page.locator('.erp-inventory-model-phone-name') if width < 768 else page.locator('table[aria-label="型号库存汇总"] tbody tr td:first-child p')
        expect(titles).to_have_text([f"分页核对型号{n:02d}" for n in range(10, 0, -1)])
        if width < 768:
            expect(page.get_by_role("button", name="库存排序", exact=True)).to_have_text("总数量")
            page.get_by_role("button", name="库存排序", exact=True).click()
            page.get_by_role("dialog", name="排序", exact=True).get_by_role("button", name="总数量", exact=True).click()
        else:
            page.get_by_role("button", name="总数量", exact=True).click()
        expect(titles).to_have_text([f"分页核对型号{n:02d}" for n in range(1, 21)])
        assert parse_qs(urlparse(page.url).query).get("page", ["1"]) == ["1"]
        page.get_by_role("button", name="下一页", exact=True).click()
        expect(titles).to_have_text([f"分页核对型号{n:02d}" for n in range(21, 31)])
        page.screenshot(path=str(OUT / f"global-sort-{width}.png"))
        if width < 768:
            page.goto(BASE + "/inventory?view=market-risk&category=" + "%E6%98%BE%E5%8D%A1", wait_until="networkidle")
            risk = page.locator('[data-erp-region="inventory-market-risk"]')
            expect(risk.get_by_role("button", name=f"查看 {NAME} 库存详情", exact=True)).to_be_visible()
            expect(risk.get_by_text(SN, exact=True)).to_be_visible()
            for node in [risk.get_by_role("button", name=f"查看 {NAME} 库存详情", exact=True), risk.get_by_text(SN, exact=True)]:
                assert node.evaluate("e => { const s=getComputedStyle(e); return s.textOverflow !== 'ellipsis' && e.scrollWidth <= e.clientWidth + 1; }")
            assert not page.evaluate("document.documentElement.scrollWidth > innerWidth + 1")
            page.screenshot(path=str(OUT / f"risk-{width}.png"))
            risk.get_by_role("button", name=f"查看 {NAME} 库存详情", exact=True).click()
            expect(page.get_by_role("dialog").first).to_be_visible()
            assert parse_qs(urlparse(page.url).query).get("detail") == [STOCK["id"]]
            page.get_by_role("dialog").first.get_by_role("button", name="关闭详情", exact=True).click()
            expect(page.get_by_role("dialog")).to_have_count(0)
            params = parse_qs(urlparse(page.url).query)
            assert params.get("view") == ["market-risk"] and "detail" not in params
            assert params.get("category") == ["显卡"]
            expect(risk.get_by_text(SN, exact=True)).to_be_visible()
        assert not writes, writes
        assert not errors, errors
        print(f"PASS {width}px global sort / paging reset / complete risk identity / detail return", flush=True)
        context.close()
    browser.close()
