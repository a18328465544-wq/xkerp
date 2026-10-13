"""Single-row desktop header regression. Loopback fixtures only, no business writes."""
import json
import os
from pathlib import Path
from urllib.parse import urlparse
from playwright.sync_api import expect, sync_playwright

BASE = os.environ.get("HEADER_QA_BASE_URL", "http://127.0.0.1:3020").rstrip("/")
if urlparse(BASE).hostname not in {"127.0.0.1", "localhost"}:
    raise SystemExit("Only the isolated local preview is allowed")
OUT = Path(__file__).resolve().parent.parent / "artifacts/snapshots/inline-header"
OUT.mkdir(parents=True, exist_ok=True)
ROUTES = ["/", "/inventory", "/sales", "/purchase", "/finance", "/finance/income", "/crm/customers", "/inspections", "/settings/users"]


def geometry(header):
    return header.evaluate("""e => {
      const r = n => {const b=n.getBoundingClientRect();return {x:b.x,y:b.y,right:b.right,bottom:b.bottom,width:b.width,height:b.height,center:b.y+b.height/2}};
      const visible=n=>n.getBoundingClientRect().width>0 && getComputedStyle(n).visibility!=='hidden';
      const regions=[...e.children].filter(visible).map(n=>({...r(n),name:n.getAttribute('data-erp-region')}));
      const group=e.querySelector('[data-fit-container="true"]');
      return {header:r(e),regions,overflow:document.documentElement.scrollWidth>innerWidth,
        items:group ? [...group.children].filter(n=>n.matches('[data-erp-component="quick-status-item"]')&&visible(n)).map(n=>({...r(n),text:n.textContent,clipped:n.scrollWidth>n.clientWidth+1})) : []};
    }""")


def check(header):
    expect(header).to_have_attribute("data-desktop-layout", "inline")
    group = header.locator('[data-fit-container="true"]')
    if group.count():
        expect(group).to_have_attribute("data-fit-ready", "true")
    result = geometry(header)
    assert not result["overflow"], result
    box = result["header"]
    for region in result["regions"]:
        assert region["x"] >= box["x"] - 1 and region["right"] <= box["right"] + 1, result
        assert abs(region["center"] - box["center"]) <= 1, result
    for left, right in zip(result["regions"], result["regions"][1:]):
        assert left["right"] <= right["x"] + 1, result
    for item in result["items"]:
        assert not item["clipped"] and item["height"] == 36, result
    return result


with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    results, errors = [], []
    for width in (1024, 1280, 1440, 1920):
        context = browser.new_context(viewport={"width": width, "height": 900})
        page = context.new_page()
        page.on("pageerror", lambda error: errors.append(str(error)))
        for route in ROUTES:
            page.goto(BASE + route, wait_until="networkidle")
            # KeepAlive retains inactive pages in the DOM; inspect the active header.
            header = page.get_by_role("main").locator('[data-erp-component="page-header"]:visible').first
            expect(header).to_be_visible()
            result = check(header)
            if route == "/":
                assert result["header"]["height"] == 36, result
                page.screenshot(path=str(OUT / f"home-{width}.png"))
                more = header.get_by_role("button", name="更多页面操作", exact=True)
                more.click()
                expect(page.get_by_role("button", name="刷新", exact=True)).to_be_visible()
                page.keyboard.press("Escape")
            results.append({"route": route, "width": width, "height": result["header"]["height"], "visibleStatuses": len(result["items"])})
            print(f"PASS {width}px {route}", flush=True)

        page.goto(BASE + "/__design-system", wait_until="networkidle")
        sample = page.get_by_test_id("header-fit-sample")
        header = sample.locator('[data-erp-component="page-header"]')
        check(header)
        sample.get_by_role("button", name="切换压力数据", exact=True).click()
        expect(header.get_by_role("heading")).to_have_text("成都超长门店名称硬件回收与算力设备经营管理看板")
        page.wait_for_timeout(200)
        check(header)
        overflow = header.get_by_role("button", name="更多状态", exact=False)
        expect(overflow).to_be_visible()
        overflow.click()
        status_action = page.get_by_role("button", name="123,456,789 项 今日待处理", exact=True)
        expect(status_action).to_be_visible()
        status_action.click()
        expect(page.get_by_role("searchbox", name="控件尺寸样例搜索")).to_have_value("页头状态已触发")
        page.keyboard.press("Escape")
        expect(header.get_by_role("button", name="导出", exact=True)).to_be_disabled()
        # Repeated shrink/grow and sidebar changes must remeasure the actual slot.
        for next_width in (1920, 1024, 1440, width):
            page.set_viewport_size({"width": next_width, "height": 900})
            page.wait_for_timeout(150)
            check(header)
        page.get_by_role("button", name="收起侧栏", exact=True).click()
        page.wait_for_timeout(150)
        check(header)
        context.close()

    for width in (375, 390, 430, 768):
        context = browser.new_context(viewport={"width": width, "height": 844}, is_mobile=width < 768, has_touch=width < 768)
        page = context.new_page()
        for route in ("/", "/inventory", "/finance", "/crm/customers"):
            page.goto(BASE + route, wait_until="networkidle")
            expect(page.get_by_role("main")).to_be_visible()
            assert not page.locator('[data-desktop-layout="inline"]:visible').count(), (width, route)
            assert not page.locator('[data-fit-container="true"]:visible').count(), (width, route)
            assert not page.evaluate("document.documentElement.scrollWidth > innerWidth"), (width, route)
        context.close()
        print(f"PASS {width}px existing phone/tablet projection", flush=True)

    assert not errors, errors
    (OUT / "result.json").write_text(json.dumps(results, ensure_ascii=False, indent=2))
    browser.close()
    print(f"PASS: {len(results)} desktop page/width cases; large values, long titles, overflow actions and resizing")
