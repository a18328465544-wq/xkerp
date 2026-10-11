"""Local-only model row: inline quantities, readonly metadata and footer actions."""
import json
import os
from pathlib import Path
from urllib.parse import parse_qs, urlparse

from playwright.sync_api import expect, sync_playwright

BASE = os.environ.get("INVENTORY_MODEL_QA_BASE_URL", "http://127.0.0.1:3014").rstrip("/")
if urlparse(BASE).hostname not in {"127.0.0.1", "localhost"}:
    raise SystemExit("Inventory model QA must use loopback, never production")
ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "artifacts" / "snapshots" / "inventory-model-layout"
OUT.mkdir(parents=True, exist_ok=True)
fixture = {"__file__": str(ROOT / "scripts" / "browser-mobile-workbench.py")}
exec((ROOT / "scripts" / "browser-mobile-workbench.py").read_text().split("with sync_playwright()")[0], fixture)
fixture["BASE"] = BASE
MODELS = [{"key": str(index), "productName": name, "category": category, "brand": "本地测试", "model": name,
           "totalCount": count, "availableCount": count, "pendingCount": 0, "lockedCount": 0,
           "warehouseLocations": ["A区货架-01"], "lastEntryTime": "2026-10-11"}
          for index, (name, category, count) in enumerate([
              ("华硕 RTX5090 夜神OC 32G", "显卡", 10),
              ("AMD Ryzen 5 7600X3D 盒装 CPU", "CPU", 6),
              ("超长商品名称完整换行显卡规格与型号 24G", "显卡", 126),
              ("大数量库存型号", "显卡", 10000)])]

with sync_playwright() as playwright:
    browser = playwright.chromium.launch()
    for width in (320, 390, 430, 768, 1024, 1440):
        context = browser.new_context(viewport={"width": width, "height": 844 if width < 768 else 960}, is_mobile=width < 768, has_touch=width < 768)
        page = context.new_page()
        _, writes, errors = fixture["attach"](page)
        page.route(BASE + "/api/inventory/summary?*", lambda route: route.fulfill(content_type="application/json", body=json.dumps({"data": MODELS})))
        page.goto(BASE + "/inventory?view=models", wait_until="networkidle")
        page.get_by_role("button", name="型号汇总", exact=True).click()
        rows = page.locator('[data-erp-component="inventory-model-phone-row"]')
        if width < 768:
            expect(rows).to_have_count(len(MODELS))
            for index in range(len(MODELS)):
                row = rows.nth(index)
                category = row.locator('.erp-inventory-model-phone-subtitle')
                action = row.locator('.erp-inventory-model-phone-cards-action')
                counts = row.locator('.erp-inventory-model-phone-counts')
                ledger = row.locator('.erp-inventory-model-phone-ledger-action')
                assert category.bounding_box()["y"] + category.bounding_box()["height"] <= counts.bounding_box()["y"]
                assert counts.bounding_box()["y"] + counts.bounding_box()["height"] <= action.bounding_box()["y"]
                assert action.bounding_box()["height"] >= 44
                assert ledger.bounding_box()["height"] >= 44
                assert abs(action.bounding_box()["y"] - ledger.bounding_box()["y"]) <= 1
                assert abs(action.bounding_box()["x"] - category.bounding_box()["x"]) <= 1
                value = category.locator('.erp-inventory-model-phone-quantity-value')
                assert value.evaluate("e => getComputedStyle(e).fontSize") == "16px"
                assert value.evaluate("e => getComputedStyle(e).fontWeight") == "600"
                expect(value).to_have_text(str(MODELS[index]["totalCount"]))
                expect(row.get_by_text("待检 0", exact=True)).to_have_count(0)
                expect(row.get_by_text("锁定 0", exact=True)).to_have_count(0)
                expect(row.locator('.erp-inventory-model-phone-end')).to_have_count(0)
            assert not page.evaluate("document.documentElement.scrollWidth > innerWidth")
            page.screenshot(path=str(OUT / f"models-{width}.png"))
            rows.first.screenshot(path=str(OUT / f"model-card-{width}.png"))
            rows.first.locator('.erp-inventory-model-phone-cards-action').click()
            page.wait_for_timeout(400)
            params = parse_qs(urlparse(page.url).query)
            assert params.get("view") != ["models"]
            assert params.get("keyword") == [MODELS[0]["productName"]]
            expect(page.get_by_role("dialog")).to_have_count(0)
        elif width < 1024:
            # Tablets retain the shared column projection, not the phone row.
            expect(rows.first).not_to_be_visible()
            expect(page.get_by_role("group", name="型号库存汇总排序")).to_be_visible()
            expect(page.get_by_role("button", name="出入明细", exact=True).first).to_be_visible()
            expect(page.get_by_role("button", name="查看单卡", exact=True).first).to_be_visible()
            assert not page.evaluate("document.documentElement.scrollWidth > innerWidth")
            page.screenshot(path=str(OUT / f"models-{width}.png"))
        else:
            expect(rows.first).not_to_be_visible()
            expect(page.get_by_role("table", name="型号库存汇总")).to_be_visible()
            page.screenshot(path=str(OUT / f"models-{width}.png"))
        assert not writes, writes
        assert not errors, errors
        print(f"PASS {width}px model typography / action position / navigation", flush=True)
        context.close()
    browser.close()
