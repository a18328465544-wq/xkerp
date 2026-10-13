"""Local inventory header acceptance: compact layout and original query/overlay actions.
Runs the real frontend with isolated API responses; no production or business writes.
"""
import json
import os
from pathlib import Path
from urllib.parse import parse_qs, urlparse

from playwright.sync_api import expect, sync_playwright

BASE = os.environ.get("INVENTORY_TOP_QA_BASE_URL", "http://127.0.0.1:3034").rstrip("/")
if urlparse(BASE).hostname not in {"127.0.0.1", "localhost"}:
    raise SystemExit("Header QA must use loopback Vite, never production")
ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "artifacts" / "snapshots" / "inventory-top-layout"
OUT.mkdir(parents=True, exist_ok=True)
fixture = {"__file__": str(ROOT / "scripts" / "browser-mobile-workbench.py")}
exec((ROOT / "scripts" / "browser-mobile-workbench.py").read_text().split("with sync_playwright()")[0], fixture)
fixture["BASE"] = BASE
MODELS = [{"key": str(index), "productName": name, "category": category, "brand": brand, "model": model,
           "vram": capacity, "totalCount": count, "availableCount": count, "pendingCount": 0,
           "lockedCount": 0, "warehouseLocations": ["A区货架-01"], "lastEntryTime": f"2026-10-0{index + 1}"}
          for index, (name, category, count, brand, model, capacity) in enumerate([
              ("华硕 RTX5090 夜神OC 32G", "显卡", 10, "华硕", "RTX5090", "32G"),
              ("AMD Ryzen 5 7600X3D 盒装 CPU", "CPU", 6, "AMD", "Ryzen 5 7600X3D", ""),
              ("丽台 RTX A4000 专业卡 16G", "显卡", 8, "丽台", "RTX A4000", "16G")])]
STOCK = [{**fixture["STOCK"], "id": f"KC-TOP-{index}", "productName": row["productName"],
          "category": row["category"], "brand": row["brand"], "model": row["model"], "vram": row["vram"],
          "entryTime": row["lastEntryTime"], "sn": f"0000-TOP-{index}"} for index, row in enumerate(MODELS)]


def response(route):
    url = urlparse(route.request.url)
    params = parse_qs(url.query)
    category = params.get("category", [""])[0]
    values = MODELS if url.path.endswith("summary") else STOCK
    values = [row for row in values if not category or row["category"] == category]
    if url.path.endswith("items"):
        values = sorted(values, key=lambda row: row["entryTime"], reverse=params.get("sortDirection") == ["desc"])
    route.fulfill(content_type="application/json", body=json.dumps({"data": values, "meta": {"total": len(values), "page": 1, "pageSize": 20}}, ensure_ascii=False))


def geometry(page):
    header = page.locator('[data-erp-component="page-header"]')
    categories = page.get_by_role("navigation", name="库存分类", exact=True)
    switch = page.get_by_role("group", name="库存视图", exact=True)
    sort = page.get_by_role("button", name="库存排序", exact=True)
    toolbar = page.locator('.erp-inventory-phone-toolbar')
    h, c, v, s, t = [node.bounding_box() for node in (header, categories, switch, sort, toolbar)]
    assert h["y"] + h["height"] <= c["y"] + 1
    assert c["y"] + c["height"] <= t["y"] + 1
    assert 32 <= v["height"] <= 36.5, v
    assert abs(v["width"] / (t["width"] - 32) - 0.55) < 0.02
    assert abs(v["y"] + v["height"] / 2 - s["y"] - s["height"] / 2) <= 1
    assert v["x"] + v["width"] < s["x"] and s["x"] + s["width"] <= page.viewport_size["width"] - 15
    for node in switch.get_by_role("button").all():
        assert node.evaluate("e => e.scrollWidth <= e.clientWidth + 1")
    assert sort.locator("span").evaluate("e => e.scrollWidth <= e.clientWidth + 1")
    # Category chips scroll horizontally; the first four stay fully visible at 320px.
    for label in ("全部", "显卡", "CPU", "主板"):
        box = categories.get_by_role("radio", name=label, exact=True).bounding_box()
        assert box["x"] >= c["x"] - 1 and box["x"] + box["width"] <= c["x"] + c["width"] + 1, (label, box, c)
    assert not page.evaluate("document.documentElement.scrollWidth > innerWidth + 1")
    return {"viewHeight": v["height"], "viewWidth": v["width"], "toolbarHeight": t["height"], "listTop": t["y"] + t["height"]}


with sync_playwright() as playwright:
    browser = playwright.chromium.launch(headless=True)
    for width in (320, 375, 390, 430):
        context = browser.new_context(viewport={"width": width, "height": 844}, is_mobile=True, has_touch=True)
        page = context.new_page()
        _, writes, errors = fixture["attach"](page)
        queries = []
        page.on("request", lambda request: queries.append(request.url) if "/api/inventory/" in request.url else None)
        page.route(BASE + "/api/inventory/items?*", response)
        page.route(BASE + "/api/inventory/summary?*", response)
        page.goto(BASE + "/inventory?view=models", wait_until="networkidle")
        expect(page.locator('[data-erp-component="inventory-model-phone-row"]')).to_have_count(3)
        metrics = geometry(page)
        page.screenshot(path=str(OUT / f"models-{width}.png"))
        page.get_by_role("group", name="库存视图").get_by_role("button", name="单卡 / SN", exact=True).click()
        expect(page.locator('[data-erp-component="inventory-phone-record"]')).to_have_count(3)
        geometry(page)
        page.screenshot(path=str(OUT / f"cards-{width}.png"))
        categories = page.get_by_role("navigation", name="库存分类")
        categories.get_by_role("radio", name="CPU", exact=True).click()
        expect(page.locator('[data-erp-component="inventory-phone-record"]')).to_have_count(1)
        expect(page.locator('.erp-phone-record-title')).to_have_text(MODELS[1]["productName"])
        assert parse_qs(urlparse(page.url).query).get("category") == ["CPU"]
        assert any(parse_qs(urlparse(url).query).get("category") == ["CPU"] for url in queries if "/items?" in url)
        page.get_by_role("group", name="库存视图").get_by_role("button", name="型号汇总", exact=True).click()
        expect(page.locator('[data-erp-component="inventory-model-phone-row"]')).to_have_count(1)
        assert parse_qs(urlparse(page.url).query).get("category") == ["CPU"]
        categories.get_by_role("radio", name="全部", exact=True).click()
        expect(page.locator('[data-erp-component="inventory-model-phone-row"]')).to_have_count(3)
        page.get_by_role("button", name="库存排序", exact=True).click()
        dialog = page.get_by_role("dialog", name="排序", exact=True)
        expect(dialog).to_be_visible()
        dialog.get_by_role("button", name="最近入库", exact=True).click()
        expect(dialog).not_to_be_visible()
        expect(page.get_by_role("button", name="库存排序")).to_have_text("最近入库")
        geometry(page)
        # SN sorting still commits the original server-side sort and direction.
        page.get_by_role("group", name="库存视图").get_by_role("button", name="单卡 / SN", exact=True).click()
        page.get_by_role("button", name="库存排序", exact=True).click()
        page.get_by_role("dialog", name="排序", exact=True).get_by_role("button", name="入库时间", exact=True).click()
        expect(page.get_by_role("dialog")).to_have_count(0)
        page.wait_for_load_state("networkidle")
        params = parse_qs(urlparse(page.url).query)
        assert params.get("sortKey", ["entryTime"]) == ["entryTime"] and params.get("sortDirection") == ["asc"], params
        expect(page.locator('.erp-phone-record-title')).to_have_text([row["productName"] for row in STOCK])
        page.get_by_role("button", name="库存排序", exact=True).click()
        page.get_by_role("dialog", name="排序", exact=True).get_by_role("button", name="入库时间", exact=True).click()
        page.wait_for_load_state("networkidle")
        assert parse_qs(urlparse(page.url).query).get("sortDirection", ["desc"]) == ["desc"]
        expect(page.locator('.erp-phone-record-title')).to_have_text([row["productName"] for row in reversed(STOCK)])
        assert any(parse_qs(urlparse(url).query).get("sortDirection") == ["asc"] for url in queries if "/items?" in url)
        # The widest sorting labels must also stay on one line.
        page.get_by_role("button", name="库存排序", exact=True).click()
        page.get_by_role("dialog", name="排序", exact=True).get_by_role("button", name="仓库 / 库位", exact=True).click()
        geometry(page)
        page.get_by_role("button", name="更多页面操作", exact=True).click()
        expect(page.get_by_role("dialog", name="库存作业", exact=True)).to_be_visible()
        page.get_by_role("button", name="库存统计", exact=True).click()
        stats = page.get_by_role("dialog", name="库存视图与统计", exact=True)
        expect(stats).to_be_visible()
        expect(stats.get_by_text("库存总数", exact=True)).to_be_visible()
        expect(stats.get_by_text("在库数量", exact=True)).to_be_visible()
        expect(stats.get_by_role("group", name="库存视图")).to_be_visible()
        for control in stats.get_by_role("group", name="库存视图").get_by_role("button").all():
            assert control.evaluate("""e => {
              const r = e.getBoundingClientRect(), s = getComputedStyle(e, '::after');
              const grow = side => s.content !== 'none' && s.position === 'absolute' ? Math.max(0, -parseFloat(s[side]) || 0) : 0;
              return r.height + grow('top') + grow('bottom') >= 44;
            }""")
        page.screenshot(path=str(OUT / f"stats-{width}.png"))
        stats.get_by_role("button", name="关闭", exact=True).click()
        expect(page.get_by_role("dialog")).to_have_count(0)
        geometry(page)
        assert not writes, writes
        assert not errors, errors
        print(f"PASS {width}px header / view / category / original sort / More statistics: {json.dumps(metrics)}", flush=True)
        context.close()
    browser.close()
