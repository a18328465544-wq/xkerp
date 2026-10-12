"""Real local frontend acceptance with isolated preview records; no production.
Keyboard occlusion/safe-area offsets are simulated, not iPhone hardware proof.
"""
import json
import os
from pathlib import Path
from urllib.parse import parse_qs, urlparse
from playwright.sync_api import expect, sync_playwright

BASE = os.environ.get("MOBILE_SEARCH_DOCK_BASE_URL", "http://127.0.0.1:3020").rstrip("/")
if urlparse(BASE).hostname not in {"127.0.0.1", "localhost"}:
    raise SystemExit("Use the isolated loopback preview only")
OUT = Path(__file__).resolve().parent.parent / "artifacts/snapshots/mobile-search-dock"
OUT.mkdir(parents=True, exist_ok=True)


def geometry(page):
    dock = page.locator('[data-erp-component="mobile-action-dock"]')
    search = dock.locator('[data-erp-component="search-input"]')
    scan = dock.get_by_role("button", name="扫码", exact=True)
    field = search.locator('[data-erp-region="search-field"]')
    d, s, b, f = [node.bounding_box() for node in (dock, search, scan, field)]
    assert s["height"] == 48 and b["height"] == 44 and b["width"] == 44, (s, b)
    assert s["x"] == 16 and abs(s["width"] - (page.viewport_size["width"] - 32)) <= 1
    assert f["x"] + f["width"] <= b["x"] + 1
    assert abs(s["y"] + s["height"] / 2 - b["y"] - b["height"] / 2) < 1
    assert search.evaluate("e => getComputedStyle(e).borderRadius") == "12px"
    assert scan.get_attribute("data-erp-button-variant") == "ghost"
    assert scan.locator("svg").bounding_box()["width"] == 20
    assert not dock.locator('[data-erp-region="mobile-action-primary"]').count()
    assert not page.evaluate("document.documentElement.scrollWidth > innerWidth")
    return {"searchHeight": s["height"], "dockHeight": d["height"], "scanWidth": b["width"]}


with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    results = []
    for width in (375, 390, 430):
        context = browser.new_context(viewport={"width": width, "height": 844}, is_mobile=True, has_touch=True)
        context.add_init_script("""window.__dockVisualHeight = 844;
          Object.defineProperty(window.visualViewport, 'height', {get:()=>window.__dockVisualHeight});
          navigator.mediaDevices.getUserMedia = async () => {throw new DOMException('QA denied camera', 'NotAllowedError');};""")
        page = context.new_page()
        errors, writes, queries = [], [], []
        page.on("pageerror", lambda error: errors.append(str(error)))
        page.on("request", lambda r: writes.append(r.url) if r.method not in ("GET", "HEAD") and "/api/" in r.url and "/api/ops/client-events" not in r.url else None)
        page.on("request", lambda r: queries.append(r.url) if "/api/inventory/items?" in r.url else None)
        page.goto(BASE + "/inventory", wait_until="networkidle")
        expect(page.locator('[data-erp-component="inventory-phone-record"]')).to_have_count(6)
        metrics = geometry(page)
        page.screenshot(path=str(OUT / f"inventory-{width}.png"))
        search = page.get_by_role("searchbox", name="搜索库存", exact=True)
        for query, count in (("RTX4090", 2), ("QA-SN-RTX4090-0", 1), ("KC-QA-0", 1)):
            search.fill(query)
            expect(page.locator('[data-erp-component="inventory-phone-record"]')).to_have_count(count)
            assert any(parse_qs(urlparse(url).query).get("keyword") == [query] for url in queries)
            geometry(page)
        search.fill("VERY-LONG-SN-0000123456789-" * 5)
        expect(page.get_by_role("button", name="清除搜索", exact=True)).to_be_visible()
        geometry(page)
        clear = page.get_by_role("button", name="清除搜索", exact=True).bounding_box()
        scan = page.get_by_role("button", name="扫码", exact=True).bounding_box()
        assert clear["x"] + clear["width"] <= scan["x"] + 1
        page.get_by_role("button", name="清除搜索", exact=True).click()
        expect(page.locator('[data-erp-component="inventory-phone-record"]')).to_have_count(6)

        # Scroll to the true end: last row and pagination must clear the fixed dock.
        page.get_by_role("main").evaluate("e => e.scrollTop = e.scrollHeight")
        last = page.locator('[data-erp-component="inventory-phone-record"]').last.bounding_box()
        dock = page.locator('[data-erp-component="mobile-action-dock"]').bounding_box()
        assert last["y"] + last["height"] <= dock["y"] + 1
        page.screenshot(path=str(OUT / f"last-row-{width}.png"))

        search.focus()
        page.evaluate("window.__dockVisualHeight = 500; visualViewport.dispatchEvent(new Event('resize'))")
        expect(page.locator('[data-erp-shell]')).to_have_attribute("data-phone-keyboard", "open")
        dock = page.locator('[data-erp-component="mobile-action-dock"]').bounding_box()
        assert dock["y"] + dock["height"] <= 500
        expect(page.get_by_role("navigation", name="手机主导航")).not_to_be_visible()
        geometry(page)
        page.screenshot(path=str(OUT / f"keyboard-{width}.png"))
        page.evaluate("window.__dockVisualHeight = 844; visualViewport.dispatchEvent(new Event('resize'))")
        expect(page.locator('[data-erp-shell]')).not_to_have_attribute("data-phone-keyboard", "open")
        expect(page.get_by_role("navigation", name="手机主导航")).to_be_visible()

        # Also cover browsers that resize the layout viewport with the keyboard.
        search.focus()
        page.evaluate("window.__dockVisualHeight = 500")
        page.set_viewport_size({"width": width, "height": 500})
        expect(page.locator('[data-erp-shell]')).to_have_attribute("data-phone-keyboard", "open")
        dock = page.locator('[data-erp-component="mobile-action-dock"]').bounding_box()
        assert dock["y"] + dock["height"] <= 500
        page.evaluate("window.__dockVisualHeight = 844")
        page.set_viewport_size({"width": width, "height": 844})
        expect(page.get_by_role("navigation", name="手机主导航")).to_be_visible()

        # Inject 34px at the existing safe-area token boundary (not actual env()).
        page.evaluate("""document.documentElement.style.setProperty('--erp-safe-bottom','34px');
          document.querySelector('[data-erp-shell]').style.setProperty('--erp-mobile-bottom-offset','calc(var(--erp-mobile-nav-height) + var(--erp-safe-bottom))')""")
        dock = page.locator('[data-erp-component="mobile-action-dock"]').bounding_box()
        nav = page.get_by_role("navigation", name="手机主导航").bounding_box()
        assert abs(dock["y"] + dock["height"] - nav["y"]) <= 1
        geometry(page)
        page.screenshot(path=str(OUT / f"safe-area-{width}.png"))
        page.evaluate("""document.documentElement.style.removeProperty('--erp-safe-bottom');
          document.querySelector('[data-erp-shell]').style.removeProperty('--erp-mobile-bottom-offset')""")

        # Independent scan trigger cannot dispatch another focus to the search box.
        page.evaluate("window.__dockSearchFocus = 0; document.querySelector('[aria-label=\"搜索库存\"]').addEventListener('focus',()=>window.__dockSearchFocus++)")
        page.get_by_role("button", name="扫码", exact=True).click()
        dialog = page.get_by_role("dialog", name="扫码搜索库存", exact=True)
        expect(dialog).to_be_visible()
        assert page.evaluate("window.__dockSearchFocus") == 0
        expect(page.locator('[data-erp-component="mobile-action-dock"]')).not_to_be_visible()
        dialog.get_by_role("searchbox", name="扫码备用输入").fill("QA-SN-RTX4090-0")
        dialog.get_by_role("button", name="使用", exact=True).click()
        expect(dialog).not_to_be_visible()
        expect(search).to_have_value("QA-SN-RTX4090-0")
        expect(page.locator('[data-erp-component="inventory-phone-record"]')).to_have_count(1)
        page.get_by_role("button", name="清除搜索", exact=True).click()
        page.get_by_role("group", name="库存视图").get_by_role("button", name="型号汇总", exact=True).click()
        expect(page.locator('[data-erp-component="inventory-model-phone-row"]').first).to_be_visible()
        geometry(page)
        page.screenshot(path=str(OUT / f"models-{width}.png"))
        assert not errors and not writes, (errors, writes)
        results.append({"width": width, **metrics, "search": "passed", "scanFallback": "passed", "keyboardSimulation": "passed", "safeAreaOffsetSimulation": "passed", "lastRow": "passed"})
        context.close()
    browser.close()
    (OUT / "result.json").write_text(json.dumps(results, indent=2), encoding="utf-8")
    print(json.dumps(results, ensure_ascii=False, indent=2))
