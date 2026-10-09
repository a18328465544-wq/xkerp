"""Browser guard for docs/MOBILE_UI_RULES.md rules marked [浏览器].

M4 touch targets, M5 16px inputs, M6 >=12px text, M7 no page overflow,
M13 no desktop table chrome / generic cards on phones, plus console errors.

Run against the isolated preview (synthetic data, writes blocked):
  ERP_MOBILE_QA_PORT=3020 python3 scripts/mobile-preview-server.py
  npm run test:mobile-rules
Exceptions live in scripts/mobile-rules-allowlist.json ("browser") with a reason.
"""
import json
import os
import sys
from pathlib import Path
from urllib.parse import urlparse

from playwright.sync_api import sync_playwright

BASE = os.environ.get("MOBILE_RULES_BASE_URL", "http://127.0.0.1:3020").rstrip("/")
if urlparse(BASE).hostname not in {"127.0.0.1", "localhost", "::1"}:
    raise SystemExit("MOBILE_RULES_BASE_URL must be a loopback preview, never a shared or production server")

ROOT = Path(__file__).resolve().parent.parent
ALLOW = json.loads((ROOT / "scripts" / "mobile-rules-allowlist.json").read_text()).get("browser", [])
WIDTHS = [int(value) for value in os.environ.get("MOBILE_RULES_WIDTHS", "320,390").split(",")]
ROUTES = [
    "/", "/inventory", "/products", "/assembly", "/inspections", "/quotes", "/ai-insights", "/order-pool", "/aftersales",
    "/sales", "/sales/new", "/sales/outbound", "/sales/returns", "/sales/returns/new",
    "/purchase", "/purchase/new", "/purchase/returns", "/purchase/returns/new",
    "/crm", "/crm/customers", "/crm/customers/new", "/crm/vendors",
    "/finance", "/finance/accounts", "/finance/ledger", "/finance/income", "/finance/expense", "/finance/transfers",
    "/finance/profit", "/finance/closing", "/finance/return-reconcile", "/finance/purchase-commission",
    "/finance/sales-commission", "/finance/customer-funds",
    "/settings", "/settings/users", "/settings/logs", "/settings/backup",
]

AUDIT = r"""() => {
  const W = innerWidth;
  const visible = (el) => { const r = el.getBoundingClientRect(); const s = getComputedStyle(el); return r.width > 0 && r.height > 0 && r.right > 0 && r.left < W && s.visibility !== "hidden" && Number(s.opacity) > 0.05; };
  const label = (el) => ((el.innerText || el.getAttribute("aria-label") || el.getAttribute("placeholder") || el.value || "").trim().replace(/\s+/g, " ").slice(0, 24));
  const exempt = (el) => el.closest('[role="grid"], [data-erp-component*="calendar"], thead, .erp-skip-link, [data-erp-touch-exempt], .erp-table-desktop-view, [role="separator"]');
  const out = {overflow: document.documentElement.scrollWidth > W + 1, targets: [], inputs: [], tiny: [], chrome: [], generic: 0};
  for (const el of document.querySelectorAll('button, a[href], [role="button"], [role="combobox"], [role="tab"], input:not([type="hidden"]), select, textarea')) {
    if (!visible(el) || exempt(el)) continue;
    let box = el;
    if (el.matches('input[type="checkbox"], input[type="radio"]')) box = el.closest("label") || el;
    const r = box.getBoundingClientRect();
    const iconOnly = !(el.innerText || "").trim() && el.tagName === "BUTTON";
    if (r.height < 43.5 || (iconOnly && r.width < 43.5)) out.targets.push(`${label(el) || el.tagName}（${Math.round(r.width)}×${Math.round(r.height)}）`);
    if (el.matches('input:not([type="checkbox"]):not([type="radio"]):not([type="range"]):not([type="file"]), textarea') && !el.readOnly && parseFloat(getComputedStyle(el).fontSize) < 16) out.inputs.push(`${label(el) || "输入框"}（${getComputedStyle(el).fontSize}）`);
    if (el.tagName === "BUTTON" && /^(刷新|列设置|列显示|舒适|紧凑|查看其余)/.test((el.innerText || "").trim())) out.chrome.push(label(el));
  }
  const main = document.querySelector("main") || document.body;
  for (const el of main.querySelectorAll("*")) {
    if (!visible(el) || exempt(el)) continue;
    if ([...el.childNodes].some((node) => node.nodeType === 3 && node.textContent.trim()) && parseFloat(getComputedStyle(el).fontSize) < 12) out.tiny.push(`${el.textContent.trim().slice(0, 16)}（${getComputedStyle(el).fontSize}）`);
  }
  out.generic = [...document.querySelectorAll('[data-erp-region="mobile-card-header"]')].filter(visible).length;
  return out;
}"""


def allowed(route, rule, detail):
    return any(item.get("route") in (route, "*") and item.get("rule") == rule and item.get("match", "") in detail for item in ALLOW)


def main():
    failures = []
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch()
        for width in WIDTHS:
            context = browser.new_context(viewport={"width": width, "height": 844}, device_scale_factor=2, is_mobile=True, has_touch=True)
            page = context.new_page()
            errors = []
            page.on("console", lambda message: errors.append(message.text[:120]) if message.type == "error" and "WebSocket" not in message.text and "[vite]" not in message.text else None)
            for route in ROUTES:
                errors.clear()
                page.goto(BASE + route, wait_until="networkidle", timeout=90000)
                for _ in range(40):
                    if not page.evaluate("() => /正在打开页面|请稍候/.test(document.querySelector('main')?.innerText || '')"):
                        break
                    page.wait_for_timeout(250)
                page.wait_for_timeout(600)
                result = page.evaluate(AUDIT)
                findings = []
                if result["overflow"]:
                    findings.append(("M7", "页面横向溢出"))
                findings += [("M4", f"点击区域过小：{item}") for item in result["targets"]]
                findings += [("M5", f"输入框字号不足 16px：{item}") for item in result["inputs"]]
                findings += [("M6", f"文字小于 12px：{item}") for item in result["tiny"][:5]]
                findings += [("M13", f"手机上出现桌面控件：{item}") for item in result["chrome"]]
                if result["generic"]:
                    findings.append(("M13", f"出现 {result['generic']} 张通用卡片，需提供 mobileRow"))
                findings += [("console", f"控制台报错：{item}") for item in sorted(set(errors))[:3]]
                for rule, detail in findings:
                    if not allowed(route, rule, detail):
                        failures.append(f"{width}px {route} [{rule}] {detail}")
                print(f"{'FAIL' if any(f.startswith(f'{width}px {route} ') for f in failures) else 'PASS'} {width}px {route}", flush=True)
            context.close()
        browser.close()
    if failures:
        print(f"\n手机端浏览器规则失败 {len(failures)} 项（规则见 docs/MOBILE_UI_RULES.md）：")
        for failure in failures:
            print(f"- {failure}")
        sys.exit(1)
    print(f"\n手机端浏览器规则通过：{len(ROUTES)} 个页面 × {len(WIDTHS)} 个宽度。")


if __name__ == "__main__":
    main()
