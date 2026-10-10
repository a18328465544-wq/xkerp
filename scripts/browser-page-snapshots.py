"""Before/after page screenshots for layout refactors (MOBILE_TEMPLATE_PLAN §5.2).

  # 1. start the isolated preview (synthetic data, writes blocked) on the old code
  ERP_MOBILE_QA_PORT=3020 ERP_CUSTOMER_QA_SCENARIO=design ERP_INVENTORY_QA_SCENARIO=design python3 scripts/mobile-preview-server.py
  npm run snapshots -- capture before
  # 2. switch to the new code (restart the preview), then
  npm run snapshots -- capture after
  npm run snapshots -- compare before after

compare fails when a desktop width (>= 1024) differs by more than --threshold
percent; phone widths are reported for review only. Side-by-side crops of every
changed page are written next to the screenshots.
"""
import argparse
import ast
import os
import sys
from pathlib import Path
from urllib.parse import urlparse

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "artifacts" / "snapshots"
BASE = os.environ.get("PAGE_SNAPSHOT_BASE_URL", "http://127.0.0.1:3020").rstrip("/")
if urlparse(BASE).hostname not in {"127.0.0.1", "localhost", "::1"}:
    raise SystemExit("PAGE_SNAPSHOT_BASE_URL must be a loopback preview, never a shared or production server")


def default_routes():
    # Same route list as the phone rules check, read without importing Playwright twice.
    tree = ast.parse((ROOT / "scripts" / "browser-mobile-rules.py").read_text())
    for node in tree.body:
        if isinstance(node, ast.Assign) and any(getattr(target, "id", "") == "ROUTES" for target in node.targets):
            return ast.literal_eval(node.value)
    raise SystemExit("ROUTES not found in scripts/browser-mobile-rules.py")


def slug(route, width):
    return f"{route.strip('/').replace('/', '_') or 'home'}_{width}.png"


def capture(label, routes, widths):
    from playwright.sync_api import sync_playwright

    target = OUT / label
    target.mkdir(parents=True, exist_ok=True)
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch()
        for width in widths:
            phone = width < 768
            for route in routes:
                # A fresh context per page keeps workspace tabs from earlier routes out of the shot.
                context = browser.new_context(viewport={"width": width, "height": 844 if phone else 900}, device_scale_factor=1, is_mobile=phone, has_touch=phone)
                page = context.new_page()
                page.goto(BASE + route, wait_until="networkidle", timeout=90000)
                for _ in range(40):
                    if not page.evaluate("() => /正在打开页面|请稍候|正在加载/.test(document.querySelector('main')?.innerText || '')"):
                        break
                    page.wait_for_timeout(250)
                page.wait_for_timeout(800)
                # The app shell scrolls inside <main>, so full_page alone stops at the
                # first screen. Grow the viewport until the whole page content fits.
                needed = page.evaluate("""() => {
                  const main = document.querySelector('main');
                  if (!main) return 0;
                  let scroller = main;
                  for (let node = main; node; node = node.parentElement) {
                    if (node.scrollHeight > node.clientHeight + 1 && /(auto|scroll)/.test(getComputedStyle(node).overflowY)) { scroller = node; break; }
                  }
                  return Math.ceil(scroller.scrollHeight + scroller.getBoundingClientRect().top + (innerHeight - scroller.getBoundingClientRect().bottom));
                }""")
                base_height = 844 if phone else 900
                if needed > base_height:
                    page.set_viewport_size({"width": width, "height": min(needed, 8000)})
                    page.wait_for_timeout(500)
                page.screenshot(path=str(target / slug(route, width)), full_page=True)
                context.close()
                print(f"{width}px {route}", flush=True)
        browser.close()
    print(f"\n已保存到 {target.relative_to(ROOT)}")


def compare(before, after, threshold):
    try:
        from PIL import Image, ImageChops
    except ImportError:
        raise SystemExit("compare 需要 Pillow：python3 -m pip install pillow")

    left, right = OUT / before, OUT / after
    crops = OUT / f"diff-{before}-{after}"
    crops.mkdir(parents=True, exist_ok=True)
    failures, changed = [], []
    for shot in sorted(left.glob("*.png")):
        other = right / shot.name
        if not other.exists():
            failures.append(f"{shot.name}：{after} 中缺少这张截图")
            continue
        a, b = Image.open(shot).convert("RGB"), Image.open(other).convert("RGB")
        width, height = min(a.width, b.width), min(a.height, b.height)
        mask = ImageChops.difference(a.crop((0, 0, width, height)), b.crop((0, 0, width, height))).convert("L").point(lambda value: 255 if value > 16 else 0)
        percent = sum(1 for value in mask.getdata() if value) / (width * height) * 100
        resized = a.size != b.size
        if not percent and not resized:
            continue
        box = mask.getbbox() or (0, 0, width, height)
        x0, y0, x1, y1 = max(0, box[0] - 16), max(0, box[1] - 16), min(width, box[2] + 16), min(height, box[3] + 16)
        pair = Image.new("RGB", (x1 - x0, (y1 - y0) * 2 + 12), "red")
        pair.paste(a.crop((x0, y0, x1, y1)), (0, 0))
        pair.paste(b.crop((x0, y0, x1, y1)), (0, y1 - y0 + 12))
        pair.save(crops / shot.name)
        page_width = int(shot.stem.rsplit("_", 1)[1])
        note = f"{shot.name}：{percent:.3f}%" + (f"（高度 {a.height} → {b.height}）" if resized else "")
        changed.append(note)
        if page_width >= 1024 and (percent > threshold or resized):
            failures.append(note)
    print("\n".join(changed) if changed else "所有截图一致。")
    print(f"\n差异对比图：{crops.relative_to(ROOT)}")
    if failures:
        print(f"\n电脑端差异超过 {threshold}% 的页面（需要在 PR 中逐条说明或修正）：")
        for failure in failures:
            print(f"- {failure}")
        sys.exit(1)


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = parser.add_subparsers(dest="command", required=True)
    shot = sub.add_parser("capture")
    shot.add_argument("label")
    shot.add_argument("--routes", help="逗号分隔，默认使用手机规则检查的全部路由")
    shot.add_argument("--widths", default="390,1024,1440")
    diff = sub.add_parser("compare")
    diff.add_argument("before")
    diff.add_argument("after")
    diff.add_argument("--threshold", type=float, default=0.5)
    args = parser.parse_args()
    if args.command == "capture":
        routes = args.routes.split(",") if args.routes else default_routes()
        capture(args.label, routes, [int(value) for value in args.widths.split(",")])
    else:
        compare(args.before, args.after, args.threshold)


if __name__ == "__main__":
    main()
