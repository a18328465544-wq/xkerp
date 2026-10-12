"""Local-only SN row layout, exact-price and isolated clipboard regression.
Uses existing synthetic API fixtures; never accesses production or OS clipboard.
"""
import json
import os
from pathlib import Path
from urllib.parse import parse_qs, urlparse

from playwright.sync_api import expect, sync_playwright

BASE = os.environ.get("INVENTORY_SN_QA_BASE_URL", "http://127.0.0.1:3034").rstrip("/")
if urlparse(BASE).hostname not in {"127.0.0.1", "localhost"}:
    raise SystemExit("SN layout QA must use loopback Vite, never production")
ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "artifacts" / "snapshots" / "inventory-sn-layout"
OUT.mkdir(parents=True, exist_ok=True)
fixture = {"__file__": str(ROOT / "scripts" / "browser-mobile-workbench.py")}
exec((ROOT / "scripts" / "browser-mobile-workbench.py").read_text().split("with sync_playwright()")[0], fixture)
fixture["BASE"] = BASE
rows = [{**fixture["STOCK"], "id": f"KC-SN-{index}", "productId": f"P-SN-{index}", "productName": name,
         "sn": sn, "estSellPrice": price, "status": status, "condition": condition, "vram": capacity,
         "entryTime": "", "storageDays": index, "warehouseLocation": "待检测区" if index == 0 else "A区货架-01"}
        for index, (name, sn, price, status, condition, capacity) in enumerate([
            ("七彩虹 RTX4070 水神 12G", "", 3700, "待检测", "95新", "12G"),
            ("七彩虹 RTX3090Ti 战斧 24G", "02005013EPH0086", 8200, "已入库", "全新", "24G"),
            ("七彩虹 RTX5090D Advanced OC 32G", "2A3E5F0B1C8D", 23800, "已入库", "95新", "32G"),
            ("超长商品名称 RTX4090 完整规格与型号 24G", "0000-LONG-UNBROKEN-SERIAL-20261012-4090", 1234567890, "已入库", "95新", "24G"),
            ("已售零金额商品", "000000001", 150, "已售出", "95新", "24G"),
            ("未设置价格商品", "000000002", None, "已入库", "95新", "24G"),
        ])]
rows[3]["warehouseLocation"] = "成都仓库 A区超长货架名称 第01层完整位置"
rows[4]["salesPrice"] = 0


def list_response(route):
    params = parse_qs(urlparse(route.request.url).query)
    keyword = params.get("keyword", [""])[0]
    matches = [row for row in rows if not keyword or keyword == row["id"]]
    route.fulfill(content_type="application/json", body=json.dumps({"data": matches, "meta": {"total": len(matches), "page": 1, "pageSize": 20}}))


with sync_playwright() as playwright:
    browser = playwright.chromium.launch()
    for width in (320, 390, 430, 768, 1024, 1440):
        context = browser.new_context(viewport={"width": width, "height": 844 if width < 768 else 960}, is_mobile=width < 768, has_touch=width < 768)
        context.add_init_script("""window.__copiedSN = []; window.__copyFails = false;
          Object.defineProperty(navigator, 'clipboard', {configurable: true, value: {
            writeText: async text => { if (window.__copyFails) throw new Error('local clipboard denied'); window.__copiedSN.push(text); }
          }});""")
        page = context.new_page()
        _, writes, errors = fixture["attach"](page)
        page.route(BASE + "/api/inventory/items?*", list_response)
        page.goto(BASE + "/inventory?includeSold=true", wait_until="networkidle")
        records = page.locator('[data-erp-component="inventory-phone-record"]')
        if width < 768:
            expect(records).to_have_count(len(rows))
            for index, row in enumerate(rows):
                record = records.nth(index)
                header = record.locator('[data-erp-component="mobile-record"]')
                facts = record.locator('.erp-inventory-phone-facts')
                assert facts.evaluate("e => { const s = getComputedStyle(e); return s.backgroundColor === 'rgba(0, 0, 0, 0)' && s.borderRadius === '0px' && s.boxShadow === 'none' && s.borderTopWidth === '1px'; }")
                sn = record.locator('.erp-inventory-phone-sn')
                location = record.locator('.erp-inventory-phone-location')
                expect(record.locator('.erp-phone-record-title')).to_have_text(row["productName"])
                assert header.bounding_box()["y"] + header.bounding_box()["height"] <= facts.bounding_box()["y"] + 1
                assert sn.bounding_box()["y"] + sn.bounding_box()["height"] <= location.bounding_box()["y"] + 1
                assert sn.bounding_box()["height"] >= 44
                expect(record.locator('.erp-inventory-phone-age')).to_have_text(f"库龄 {index} 天")
                expect(record.locator('.erp-inventory-phone-sn-value')).to_have_text(row["sn"] or "待录入")
                assert not record.locator('button button').count()
            expect(records.nth(3).locator('.erp-data-number')).to_have_text("¥1,234,567,890")
            expect(records.nth(4).locator('.erp-data-number')).to_have_text("¥0")
            expect(records.nth(4).locator('.erp-phone-record-amount-label')).to_have_text("成交价")
            expect(records.nth(5).locator('.erp-data-number')).to_have_text("未设置")
            assert not page.evaluate("document.documentElement.scrollWidth > innerWidth")
            page.screenshot(path=str(OUT / f"sn-{width}.png"))
            records.nth(1).screenshot(path=str(OUT / f"sn-card-{width}.png"))
            copy = records.nth(1).get_by_role("button", name="复制 SN 02005013EPH0086", exact=True)
            assert copy.bounding_box()["height"] >= 44 and copy.bounding_box()["width"] >= 44
            copy.click()
            expect(page.get_by_text("SN 已复制", exact=True)).to_be_visible()
            assert page.evaluate("window.__copiedSN") == ["02005013EPH0086"]
            expect(page.get_by_role("dialog")).to_have_count(0)
            expect(records.first.get_by_role("button", name="复制 SN", exact=False)).to_have_count(0)
            page.evaluate("window.__copyFails = true")
            copy.click()
            expect(page.get_by_text("复制失败，请长按 SN 手动复制。", exact=True)).to_be_visible()
            expect(page.get_by_role("dialog")).to_have_count(0)
            records.first.get_by_role("button", name=f"查看 {rows[0]['productName']}", exact=True).click()
            expect(page.get_by_role("dialog").first).to_be_visible()
        else:
            expect(records.first).not_to_be_visible()
            page.screenshot(path=str(OUT / f"sn-{width}.png"))
        assert not writes, writes
        assert not errors, errors
        print(f"PASS {width}px SN / price / location / copy / detail", flush=True)
        context.close()
    browser.close()
