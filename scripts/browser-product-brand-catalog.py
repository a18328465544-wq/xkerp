"""Real UI regression against an isolated local API/database; never production.

BRAND_QA_BASE_URL=http://127.0.0.1:3408 BRAND_QA_PASSWORD=... python3 scripts/browser-product-brand-catalog.py
"""
import os
import re
import time
from pathlib import Path
from urllib.parse import urlparse
from playwright.sync_api import sync_playwright, expect

BASE = os.environ.get("BRAND_QA_BASE_URL", "http://127.0.0.1:3408").rstrip("/")
PASSWORD = os.environ.get("BRAND_QA_PASSWORD", "")
if urlparse(BASE).hostname not in {"127.0.0.1", "localhost", "::1"} or not PASSWORD:
    raise SystemExit("Use a loopback, disposable database and BRAND_QA_PASSWORD.")
OUT = Path(os.environ.get("BRAND_QA_OUTPUT", "/tmp/gpu-brand-ui-20261014"))
OUT.mkdir(parents=True, exist_ok=True)
PREFIX = f"UI品牌{int(time.time())}"

def login(context):
    response = context.request.post(BASE + "/api/auth/login", data={"username": "admin", "password": PASSWORD})
    assert response.ok, response.text()

def brand_control(page, width):
    return page.get_by_role("button" if width < 768 else "combobox", name="商品品牌", exact=True)

def search_brand(page, width, query):
    control = brand_control(page, width)
    control.click()
    if width < 768:
        page.get_by_role("searchbox", name="查询选择商品品牌").fill(query)
    else:
        control.fill(query)

def assert_layout(page, width):
    assert page.evaluate("document.documentElement.scrollWidth <= innerWidth + 1"), f"overflow {width}"
    if width < 768:
        sizes = page.locator('[role=dialog] input:not([type=hidden]), [role=dialog] textarea').evaluate_all("els => els.filter(e => e.getBoundingClientRect().width && !e.closest('[aria-hidden=true]')).map(e => parseFloat(getComputedStyle(e).fontSize))")
        assert all(size >= 16 for size in sizes), sizes

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    for width in [375, 390, 430, 1440]:
        context = browser.new_context(viewport={"width": width, "height": 844 if width < 768 else 1000}, is_mobile=width < 768, has_touch=width < 768)
        login(context)
        page = context.new_page()
        errors = []
        page.on("pageerror", lambda error: errors.append(str(error)))
        page.goto(BASE + "/products", wait_until="networkidle")
        page.get_by_role("button", name="新建模板", exact=True).click()
        draft = page.get_by_placeholder("如：ROG 猛禽、官方盒装")
        draft.fill(f"草稿{width}")
        search_brand(page, width, "aSuS")
        expect(page.get_by_role("option", name=re.compile(r"^华硕"))).to_be_visible()
        page.screenshot(path=str(OUT / f"brand-picker-{width}.png"))
        page.get_by_role("option", name=re.compile(r"^华硕")).click()
        control = brand_control(page, width)
        if width < 768: expect(control).to_contain_text("华硕")
        else: expect(control).to_have_value("华硕")
        expect(draft).to_have_value(f"草稿{width}")
        page.get_by_role("button", name="新建其他品牌", exact=True).click()
        expect(page.get_by_role("heading", name="新建商品品牌", exact=True)).to_be_visible()
        page.get_by_role("textbox", name="统一品牌名称", exact=True).fill("ASUS")
        page.get_by_role("button", name="保存并选中", exact=True).click()
        expect(page.get_by_role("alert")).to_contain_text("已属于品牌")
        custom = f"{PREFIX}-{width}"
        page.get_by_role("textbox", name="统一品牌名称", exact=True).fill(custom)
        page.get_by_role("textbox", name="品牌别名", exact=True).fill(f"{PREFIX}alias{width}")
        page.get_by_role("button", name="保存并选中", exact=True).click()
        expect(page.get_by_role("heading", name="新建商品规格模板", exact=True)).to_be_visible()
        expect(draft).to_have_value(f"草稿{width}")
        if width < 768: expect(brand_control(page, width)).to_contain_text(custom)
        else: expect(brand_control(page, width)).to_have_value(custom)
        assert_layout(page, width)
        page.screenshot(path=str(OUT / f"brand-product-form-{width}.png"))
        page.get_by_role("button", name="取消", exact=True).click()
        page.reload(wait_until="networkidle")
        if width < 768:
            page.get_by_role("button", name="商品库更多操作", exact=True).click()
        elif not page.get_by_role("button", name="品牌管理", exact=True).is_visible():
            page.get_by_role("button", name="更多页面操作", exact=True).click()
        page.get_by_text("品牌管理", exact=True).click()
        expect(page.get_by_role("heading", name="品牌管理", exact=True)).to_be_visible()
        page.get_by_role("searchbox", name="搜索品牌管理").fill(custom)
        expect(page.get_by_role("button", name="补充别名", exact=True)).to_be_visible()
        page.get_by_role("button", name="补充别名", exact=True).click()
        page.get_by_role("textbox", name="品牌别名", exact=True).fill(f"{PREFIX}extra{width}")
        page.get_by_role("button", name="保存品牌", exact=True).click()
        expect(page.get_by_role("heading", name="品牌管理", exact=True)).to_be_visible()
        page.get_by_role("group", name="品牌管理内容", exact=True).get_by_text("历史匹配", exact=True).click()
        expect(page.get_by_text("精确匹配已有别名；未匹配项需要选择品牌后确认。确认只补品牌归属，保留原商品名和历史记录。", exact=True)).to_be_visible()
        before_matches = context.request.get(BASE + "/api/product-brands/legacy-matches").json()["data"]
        if before_matches:
            first_group = page.locator("section").filter(has=page.get_by_role("button", name="确认绑定", exact=True)).first
            original = first_group.locator("p").first.inner_text().split("原品牌：", 1)[1].split(" · ", 1)[0]
            first_group.get_by_role("button", name="确认绑定", exact=True).click()
            expect(first_group.get_by_role("button", name="确认绑定", exact=True)).to_be_enabled()
            expect(page.get_by_text(f"原品牌：{original}", exact=False)).to_have_count(0)
            after_matches = context.request.get(BASE + "/api/product-brands/legacy-matches").json()["data"]
            assert len(after_matches) < len(before_matches)
        assert_layout(page, width)
        page.screenshot(path=str(OUT / f"brand-legacy-{width}.png"))
        assert not errors, errors
        context.close()
        print(f"PASS {width}px: aliases, collision, create, draft, alias edit, historical review, layout", flush=True)
    browser.close()
print(OUT)
