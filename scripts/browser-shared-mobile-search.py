"""Acceptance for shared phone list searches against the isolated local preview.
Tests real frontend rendering/events, not production data or iPhone hardware.
"""
import json
import os
import re
from pathlib import Path
from urllib.parse import urlparse
from playwright.sync_api import expect, sync_playwright

BASE = os.environ.get("SHARED_SEARCH_QA_BASE_URL", "http://127.0.0.1:3020").rstrip("/")
if urlparse(BASE).hostname not in {"127.0.0.1", "localhost"}:
    raise SystemExit("Only the isolated loopback preview is allowed")
ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "artifacts/snapshots/shared-mobile-search"
OUT.mkdir(parents=True, exist_ok=True)
ROUTES = ["/inventory", "/products", "/assembly", "/quotes", "/order-pool", "/aftersales",
          "/sales", "/sales/outbound", "/sales/returns", "/purchase", "/purchase/returns",
          "/crm", "/crm/customers", "/crm/vendors", "/finance/ledger", "/finance/income",
          "/finance/expense", "/finance/transfers", "/finance/profit", "/finance/closing",
          "/finance/return-reconcile", "/finance/purchase-commission", "/finance/sales-commission",
          "/finance/customer-funds", "/settings/users", "/settings/logs"]


def check_geometry(page, route):
    dock = page.locator('[data-erp-component="mobile-action-dock"]')
    expect(dock).to_be_visible()
    expect(dock).to_have_attribute("data-erp-dock-layout", "search")
    search = dock.locator('[data-erp-component="search-input"]')
    box, dock_box = search.bounding_box(), dock.bounding_box()
    assert box["height"] == 48 and dock_box["height"] == 65, (route, box, dock_box)
    assert box["x"] == 16 and abs(box["width"] - page.viewport_size["width"] + 32) <= 1
    assert not dock.locator('[data-erp-region="mobile-action-primary"]').count(), route
    assert not page.evaluate("document.documentElement.scrollWidth > innerWidth"), route
    assert float(dock.get_by_role("searchbox").evaluate("e => parseFloat(getComputedStyle(e).fontSize)")) >= 16
    if route != "/inventory":
        assert not dock.get_by_role("button", name="扫码", exact=True).count(), route
    for button in page.locator('[data-erp-phone-action]:visible').all():
        assert button.get_attribute("aria-label") and button.get_attribute("title")
        assert button.locator('xpath=ancestor::*[@data-erp-component="page-header"]').count() == 1
    return {"height": box["height"], "dockHeight": dock_box["height"]}


with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    results = []
    for width in (375, 390, 430):
        context = browser.new_context(viewport={"width": width, "height": 844}, is_mobile=True, has_touch=True)
        context.add_init_script("""window.__sharedSearchHeight = 844;
          Object.defineProperty(window.visualViewport,'height',{get:()=>window.__sharedSearchHeight});""")
        page = context.new_page()
        writes, errors = [], []
        page.on("pageerror", lambda error: errors.append(str(error)))
        page.on("request", lambda r: writes.append(r.url) if r.method not in ("GET", "HEAD") and "/api/" in r.url and "/api/ops/client-events" not in r.url else None)
        for route in ROUTES:
            page.goto(BASE + route, wait_until="networkidle")
            dock = page.locator('[data-erp-component="mobile-action-dock"]')
            metrics = check_geometry(page, route)
            name = route.strip("/").replace("/", "_")
            page.screenshot(path=str(OUT / f"{name}-{width}.png"))
            search = dock.get_by_role("searchbox")
            long_query = "000-MOBILE-SEARCH-" * 8
            search.fill(long_query)
            # Funds already caps its URL keyword at 100 chars; preserve that
            # existing business/query boundary rather than widening it for UI.
            expected_query = long_query[:100] if route == "/finance/customer-funds" else long_query
            expect(search).to_have_value(expected_query)
            check_geometry(page, route)
            dock.get_by_role("button", name="清除搜索", exact=True).click()
            expect(search).to_have_value("")

            # Existing main scrolling reserve must expose the final list row.
            page.get_by_role("main").evaluate("e => e.scrollTop = e.scrollHeight")
            rows = page.locator("main article:visible")
            if rows.count():
                last = rows.last.bounding_box()
                dock_box = dock.bounding_box()
                assert last["y"] + last["height"] <= dock_box["y"] + 1, (route, last, dock_box)

            # The same viewport service must move both search variants above a keyboard.
            search.focus()
            page.evaluate("window.__sharedSearchHeight=500;visualViewport.dispatchEvent(new Event('resize'))")
            expect(page.locator('[data-erp-shell]')).to_have_attribute("data-phone-keyboard", "open")
            expect(page.get_by_role("navigation", name="手机主导航")).not_to_be_visible()
            dock_box = dock.bounding_box()
            assert dock_box["y"] + dock_box["height"] <= 500, route
            page.evaluate("window.__sharedSearchHeight=844;visualViewport.dispatchEvent(new Event('resize'))")
            expect(page.get_by_role("navigation", name="手机主导航")).to_be_visible()

            # Open existing dialogs from the relocated action; never submit them.
            if route in ("/crm/customers", "/crm/vendors", "/finance/income", "/finance/expense", "/finance/transfers", "/quotes", "/order-pool"):
                page.get_by_role("main").evaluate("e => e.scrollTop=0")
                action = page.locator('[data-erp-phone-action="primary"]:visible')
                expect(action).to_have_count(1)
                if action.is_enabled():
                    action.click()
                    dialog = page.get_by_role("dialog")
                    expect(dialog).to_be_visible()
                    expect(dock).not_to_be_visible()
                    dialog.get_by_role("button", name=re.compile(r"^关闭(详情)?$")).click()
                    expect(dialog).not_to_be_visible()
                    expect(dock).to_be_visible()
            if route == "/assembly":
                page.get_by_role("main").evaluate("e => e.scrollTop=0")
                page.get_by_role("button", name="新建组装 / 拆卸", exact=True).click()
                expect(page.locator("details.erp-document-workflow")).to_have_attribute("open", "")
                expect(dock).not_to_be_visible()
                assert page.locator("details.erp-document-workflow form").count() == 1
            assert not errors and not writes, (route, errors, writes)
            results.append({"route": route, "width": width, **metrics, "searchClear": "passed", "keyboardSimulation": "passed", "unexpectedWrites": 0})
            print(f"PASS {width}px {route}", flush=True)
        context.close()
    browser.close()
    (OUT / "result.json").write_text(json.dumps(results, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"Shared phone searches: {len(ROUTES)} pages x 3 widths passed")
