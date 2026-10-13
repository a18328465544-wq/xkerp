"""Isolated IAB preview: loopback-only proxy to local Vite; no production API/DB.
Synthetic records reuse the regression fixtures. All business writes fail visibly.
"""
import ast
import base64
import json
import mimetypes
import os
import re
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse
from urllib.request import urlopen

root = Path(__file__).resolve().parent
source = (root / "browser-mobile-workbench.py").read_text()
tree = ast.parse(source.split("def attach(")[0])
tree.body = [node for node in tree.body if not (isinstance(node, ast.ImportFrom) and node.module == "playwright.sync_api")]
fixture = {}
exec(compile(tree, "mobile-fixtures", "exec"), fixture)
state = fixture["STATE"]
partner = {**fixture["PARTNER"], "type": "个人买家客户", "source": "微信", "level": "S级", "isCoreCustomer": True, "totalAmount": 128600, "totalProfit": 2800, "buyCount": 18, "lastDealTime": "2026-10-07", "owner": "手机测试员", "crmStatus": "已成交", "tags": ["核心客户"]}
state["customers"] = [partner]
state["vendors"] = [{"id": "V-MOBILE", "name": "本地测试供应商", "contact": "LOCAL-ONLY", "payableBalance": 200}]
state["systemUsers"] = [{"id": "local-mobile", "username": "local-mobile", "displayName": "手机测试员", "role": "老板", "enabled": True}]
state["paymentIns"] = [{"id": "IN-MOBILE", "customerName": partner["name"], "accountId": fixture["ACCOUNT"]["id"], "amount": 150, "handler": "手机测试员", "paymentMethod": "微信", "businessType": "销售收款", "time": "2026-10-07 14:30", "referenceNo": "XS-MOBILE-001", "images": []}]
state["paymentOuts"] = [{"id": "OUT-MOBILE", "supplierName": "本地测试供应商", "accountId": fixture["ACCOUNT"]["id"], "amount": 100, "handler": "手机测试员", "paymentMethod": "微信", "businessType": "采购付款", "time": "2026-10-07 14:30", "referenceNo": "JH-MOBILE-001", "images": []}]
state["settlementLedger"] = [{"id": "FLOW-MOBILE", "accountId": fixture["ACCOUNT"]["id"], "accountName": fixture["ACCOUNT"]["name"], "time": "2026-10-07 14:30", "businessType": "销售收款", "incomeAmount": 150, "expenseAmount": 0, "changeAmount": 150, "balanceAfter": 10000, "relatedDocNo": "XS-MOBILE-001", "handler": "手机测试员"}]
for invoice in state["salesInvoices"]:
    invoice.update(handleBy="手机测试员", totalProfit=50, totalCost=100, isPaid=True, paymentStatus="已收款", contact="LOCAL-ONLY", channel="到店", paymentMethod="微信")
meta = {"total": 1, "page": 1, "pageSize": 20, "totalPages": 1}
qa_mode = os.environ.get("ERP_MOBILE_QA_MODE", "owner")
qa_port = int(os.environ.get("ERP_MOBILE_QA_PORT", "3020"))
if qa_mode not in {"owner", "limited", "logged-out", "read-error"} or not 3020 <= qa_port <= 3029:
    raise ValueError("Invalid local QA scenario")

# Visual-only fixtures are opt-in: the user's existing 3020 preview keeps its
# original record. No business write or production API is ever enabled.
customer_scenario = os.environ.get("ERP_CUSTOMER_QA_SCENARIO", "baseline")
if customer_scenario not in {"baseline", "design", "stress", "many", "empty"}:
    raise ValueError("Invalid customer QA scenario")
sample_customers = [partner]
if customer_scenario in {"design", "stress", "many"}:
    sample_rows = [("星河硬件", "S级", 128600, "2026-10-07"), ("极客装机", "A级", 86400, "2026-10-06"), ("智联算力", "B级", 32500, "2026-10-06"), ("云杉科技", "A级", 256800, "2026-10-05"), ("北辰数码", "C级", 12600, "2026-10-04"), ("辰星贸易", "B级", 98200, "2026-10-03")]
    sample_customers = [{**partner, "id": f"C-DESIGN-{index}", "name": name, "level": level, "isCoreCustomer": level == "S级", "totalAmount": amount, "lastDealTime": date, "source": "微信", "tags": []} for index, (name, level, amount, date) in enumerate(sample_rows)]
    if customer_scenario == "stress":
        sample_customers[0].update(name="成都超长客户名称硬件回收与算力设备有限公司", totalAmount=1234567890)
    if customer_scenario == "many":
        sample_customers = [{**sample_customers[index % 6], "id": f"C-PAGE-{index}", "name": f"分页测试客户{index + 1:02d}"} for index in range(25)]
elif customer_scenario == "empty":
    sample_customers = []

# Inventory scenarios only prove rendering and parameter wiring, not production
# search/SQL or balances. All mutations remain blocked by this preview server.
inventory_scenario = os.environ.get("ERP_INVENTORY_QA_SCENARIO", "baseline")
if inventory_scenario not in {"baseline", "design", "stress", "many", "empty", "models"}:
    raise ValueError("Invalid inventory QA scenario")
sample_inventory = [fixture["STOCK"]]
if inventory_scenario in {"design", "stress", "many"}:
    inventory_samples = [
        ("技嘉 RTX4090 AERO OC 雪鹰 24G", "显卡", "技嘉", "RTX4090", "24G", "95新", "已入库", 23000),
        ("微星 RTX5090 SUPRIM 水超龙 32G", "显卡", "微星", "RTX5090", "32G", "全新", "待检测", 46500),
        ("华硕 RTX4090D TUF Gaming 24G", "显卡", "华硕", "RTX4090D", "24G", "95新", "已锁定", 19000),
        ("Intel Core i9-14900K 盒装 CPU", "CPU", "Intel", "i9-14900K", "", "全新", "已入库", 4280),
        ("宏碁 冰刃 DDR5 6000 C28 16G", "内存", "宏碁", "DDR5 6000 C28", "16G", "全新", "已入库", 0),
        ("索泰 RTX3090 天启 24G", "显卡", "索泰", "RTX3090", "24G", "95新", "已入库", None),
        ("七彩虹 RTX4090 Vulcan 火神 24G", "显卡", "七彩虹", "RTX4090", "24G", "95新", "已售出", 22500),
    ]
    sample_inventory = [{**fixture["STOCK"], "id": f"KC-QA-{index}", "productId": f"P-QA-{index}", "productName": name, "name": name, "category": category, "brand": brand, "model": model, "vram": vram, "condition": condition, "status": status, "inspectionStatus": "待检测" if status == "待检测" else "已入库", "sn": "" if status == "待检测" else f"QA-SN-{model}-{index}", "entryTime": f"2026-10-0{7-index}", "inventoryDays": index + 1, "estSellPrice": price, "salesPrice": price if status == "已售出" else None, "costPrice": 100} for index, (name, category, brand, model, vram, condition, status, price) in enumerate(inventory_samples)]
    if inventory_scenario == "stress":
        sample_inventory[0].update(productName="技嘉 RTX4090 AERO OC 雪鹰 官方盒装超长型号名称 24G", sn="SN-THIS-IS-A-VERY-LONG-UNBROKEN-SERIAL-4090-202610080001", warehouseLocation="成都仓库 A区超长货架名称 第01层", estSellPrice=1234567890)
    elif inventory_scenario == "many":
        sample_inventory = [{**sample_inventory[index % 6], "id": f"KC-PAGE-{index}", "sn": f"QA-PAGE-{index+1:02d}"} for index in range(25)]
elif inventory_scenario == "empty":
    sample_inventory = []

# Opt-in fixtures for the approved model-row layout; never used by the app/API.
model_layout_samples = [
    ("三星 990PRO 2T 盒装 PCIe 4.0 x4，NVMe 2.0", "硬盘", 1, 1, 0, 0, 0, ["配件待检测区"]),
    ("华硕 RTX5090 夜神OC 32G", "显卡", 126, 120, 4, 2, 0, ["A区货架-01", "待检测区"]),
    ("超长商品名称完整换行显卡规格与型号 官方盒装 24G", "显卡", 10000, 10000, 0, 0, 0, ["成都仓库 A区超长货架名称 第01层"]),
    ("已售出型号（包含历史库存）", "显卡", 124, 0, 0, 0, 124, []),
    ("零库存型号", "CPU", 0, 0, 0, 0, 0, []),
]
model_layout_rows = [{"key": f"MODEL-LAYOUT-{index}", "productName": name, "category": category, "brand": "本地测试", "model": name, "version": "", "vram": "", "totalCount": total, "availableCount": available, "pendingCount": pending, "lockedCount": locked, "soldCount": sold, "repairCount": 0, "warehouseLocation": locations[0] if locations else "", "warehouseLocations": locations, "lastEntryTime": "2026-10-11"} for index, (name, category, total, available, pending, locked, sold, locations) in enumerate(model_layout_samples)]
if inventory_scenario == "models":
    model_layout_rows[0].update(brand="三星", model="990PRO", vram="2T")
    model_layout_rows[1].update(brand="华硕", model="RTX5090", vram="32G")
ledger_scenario = os.environ.get("ERP_LEDGER_QA_SCENARIO", "baseline")
if ledger_scenario not in {"baseline", "design", "stress", "empty", "error", "restricted"}:
    raise ValueError("Invalid ledger QA scenario")
if ledger_scenario != "baseline":
    model_layout_rows[0].update({"productName": "华硕 RTX5090 夜神OC 32G", "category": "显卡", "brand": "华硕", "model": "RTX5090", "version": "夜神OC", "vram": "32G", "totalCount": 10})
ledger_samples = [
    ("采购入库", "JH-20261007-003", "增加", 1, 42500, "", "示例供应商 A", "店员 A", "2026-10-07 14:26"),
    ("销售出库", "XS-20261006-012", "减少", -1, 46800, "示例客户 A", "", "店员 B", "2026-10-06 17:10"),
    ("销售退货", "XT-20261005-002", "增加", 1, 45800, "示例客户 B", "", "店员 A", "2026-10-05 10:42"),
    ("采购入库", "JH-20261004-008", "增加", 2, 85000, "", "示例供应商 B", "店员 B", "2026-10-04 11:36"),
    ("采购退货", "CT-20261003-001", "减少", -1, 42500, "", "示例供应商 A", "店员 A", "2026-10-03 09:18"),
]
ledger_rows = [{"id": f"LEDGER-QA-{i}", "documentType": kind, "documentNo": no, "operationType": operation, "quantity": quantity, "amount": amount, "unitPrice": amount / abs(quantity), "customerName": customer, "supplierName": supplier, "createdBy": creator, "operatedAt": time, "storeName": "本地验收", "productRemarks": "仅本地合成数据", "documentRemarks": ""} for i, (kind, no, operation, quantity, amount, customer, supplier, creator, time) in enumerate(ledger_samples)]
if ledger_scenario == "stress":
    ledger_rows[0].update({"documentNo": "JH-20261007-000000000000000000003", "amount": 123456789.12, "supplierName": "用于窄屏验收的超长供应商完整名称", "createdBy": "超长制单人姓名"})
    ledger_rows[1].update({"quantity": 0, "amount": 0, "operationType": "锁定"})
if ledger_scenario == "restricted":
    for row in ledger_rows:
        row.pop("amount", None)
        row.pop("unitPrice", None)
if inventory_scenario == "models":
    sample_inventory = [{**fixture["STOCK"], "id": "KC-MODEL-LAYOUT", "productId": "P-MODEL-LAYOUT", "productName": model_layout_rows[0]["productName"], "name": model_layout_rows[0]["productName"], "category": "硬盘", "model": "990PRO", "warehouseLocation": "配件待检测区"}]

# Quote validation is a separate, opt-in visual fixture. This never enables
# persistence: real write/permission acceptance uses the isolated HTTP tests.
quote_scenario = os.environ.get("ERP_QUOTE_QA_SCENARIO", "baseline")
if quote_scenario not in {"baseline", "core"}:
    raise ValueError("Invalid quote QA scenario")
quote_inventory = state["inventory"]
quote_products = state["products"]
if quote_scenario == "core":
    quote_products = [
        {"id": "P-QUOTE-ASUS", "name": "华硕 RTX5090 夜神OC 32G", "category": "显卡", "brand": "华硕", "model": "RTX5090", "version": "夜神OC", "vram": "32G", "coreId": "GPU-NVIDIA-RTX5090", "coreModel": "RTX5090"},
        {"id": "P-QUOTE-MSI", "name": "微星 RTX5090 SUPRIM 32G", "category": "显卡", "brand": "微星", "model": "RTX5090", "vram": "32G", "coreId": "GPU-NVIDIA-RTX5090", "coreModel": "RTX5090"},
        {"id": "P-QUOTE-D", "name": "华硕 RTX5090D TUF 32G", "category": "显卡", "brand": "华硕", "model": "RTX5090D", "vram": "32G", "coreId": "GPU-NVIDIA-RTX5090D", "coreModel": "RTX5090D"},
        {"id": "P-QUOTE-CASE", "name": "微星 rtx4070ti 12G", "category": "显卡", "brand": "微星", "model": "rtx4070ti", "vram": "12G", "coreId": "GPU-NVIDIA-RTX4070TI", "coreModel": "RTX4070TI"},
    ]
    profile = {"condition": "used", "grade": "95新", "warranty": "any", "packaging": "any", "vram": "32G", "currency": "CNY"}
    core_profile = {"condition": "any", "grade": "any", "warranty": "any", "packaging": "any", "vram": "", "currency": "CNY"}
    today = time.strftime("%Y-%m-%d")

    def sample_quote(identity, scope, core, product_id, buy, sell, conditions=None, **extra):
        conditions = conditions or (core_profile if scope == "core" else profile)
        target = product_id if scope == "product" else f"GPU-NVIDIA-{core}"
        key = f"core|{target}|CNY" if scope == "core" and conditions["condition"] == "any" else f"{scope}|{target}|{conditions['condition']}|{conditions['grade']}|{conditions['warranty']}|{conditions['packaging']}|{conditions['vram']}|CNY"
        return {"id": identity, "date": today, "productId": product_id, "productName": quote_products[0]["name"] if product_id else core,
                "brand": "华硕" if product_id else "NVIDIA", "model": core, "version": "", "quoteScope": scope,
                "coreId": f"GPU-NVIDIA-{core}", "coreModel": core, "profile": conditions, "source": "本地验收示例（非市场报价）",
                "maintainedBy": "手机测试员", "refBuyPrice": buy, "refSellPrice": sell, "todayBuyPrice": buy or 0, "todaySellPrice": sell or 0,
                "yestBuyPrice": 0, "maxPrice": buy or 0, "minPrice": buy or 0, "changeAmount": 0, "changeRatio": 0,
                "trend": "stable", "updateTime": today + " 14:30", "history": [{"date": today + " 14:30", "buyPrice": buy, "sellPrice": sell, "quoteKey": key}], **extra}

    state["marketQuotes"] = [
        sample_quote("Q-CORE", "core", "RTX5090", "", 38000, 43000),
        sample_quote("Q-PRODUCT", "product", "RTX5090", "P-QUOTE-ASUS", None, 45000),
        sample_quote("Q-OLD-CONDITIONS", "core", "RTX5080", "", 42000, 47000, {**profile, "condition": "new", "grade": "全新"}),
        sample_quote("Q-EXPIRED", "core", "RTX5090D", "", 33000, 39000, validUntil="2026-01-01"),
        sample_quote("Q-CASE", "core", "RTX4070TI", "", 2000, 3000),
        {"id": "Q-LEGACY", "date": today, "productId": "OLD-REFERENCE", "productName": "RTX4090 旧参考价", "brand": "NVIDIA", "model": "RTX4090", "version": "", "todayBuyPrice": 17000, "todaySellPrice": 19000, "yestBuyPrice": 17000, "maxPrice": 17000, "minPrice": 17000, "changeAmount": 0, "changeRatio": 0, "trend": "stable", "history": [{"date": "10-07 14:30", "buyPrice": 17000, "sellPrice": 19000}]},
    ]
    quote_inventory = [{"id": f"KC-QUOTE-{index}", "productId": product["id"], "status": "已入库", "productName": product["name"],
                        "brand": product["brand"], "model": product["model"], "category": "显卡", "vram": "32G", "condition": "95新",
                        "coreId": product["coreId"], "coreModel": product["coreModel"], "profile": profile.copy(), "costPrice": 31000} for index, product in enumerate(quote_products)]

def inventory_rows(params):
    keyword = params.get("keyword", [""])[0].casefold()
    status = params.get("status", [""])[0]
    rows = [item for item in sample_inventory if (not keyword or keyword in " ".join(str(item.get(key, "")) for key in ["id", "productName", "brand", "model", "sn"]).casefold()) and (not status or item["status"] == status) and (status or params.get("includeSold", ["false"])[0] == "true" or item["status"] != "已售出")]
    for query_key, field in [("category", "category"), ("brand", "brand"), ("supplierName", "supplierName"), ("warehouseLocation", "warehouseLocation")]:
        value = params.get(query_key, [""])[0]
        if value:
            rows = [item for item in rows if value in str(item.get(field, ""))]
    sort_key = {"product": "productName", "days": "inventoryDays", "status": "status", "cost": "costPrice", "warehouseLocation": "warehouseLocation"}.get(params.get("sortKey", ["entryTime"])[0], "entryTime")
    rows.sort(key=lambda item: item.get(sort_key) or (0 if sort_key in {"inventoryDays", "costPrice"} else ""), reverse=params.get("sortDirection", ["desc"])[0] == "desc")
    return rows


# auto (default) prefers the local Vite on 127.0.0.1:3010 whenever it answers:
# only that path injects the draft fixtures, so screenshots stay comparable.
# Without Vite it serves dist/, but never a dist/ older than src/.
# ERP_PREVIEW_SOURCE=dist or =vite forces one side. ERP_PREVIEW_VITE_PORT picks
# the Vite port, so a worktree never previews another checkout's Vite on 3010.
vite_origin = f"http://127.0.0.1:{int(os.environ.get('ERP_PREVIEW_VITE_PORT', '3010'))}"
preview_source = os.environ.get("ERP_PREVIEW_SOURCE", "auto")
if preview_source not in {"auto", "dist", "vite"}:
    raise ValueError("Invalid ERP_PREVIEW_SOURCE")
_build_check = {"at": 0.0, "use": False, "reported": None}


def serve_build(build):
    index = build / "index.html"
    if preview_source == "vite" or not index.is_file():
        return False
    if preview_source == "dist":
        return True
    now = time.monotonic()
    if now - _build_check["at"] > 2:
        try:
            with urlopen(vite_origin + "/", timeout=1):
                vite_up = True
        except Exception:
            vite_up = False
        sources = [root.parent / "index.html", *(item for item in (root.parent / "src").rglob("*") if item.is_file())]
        newest = max((item.stat().st_mtime for item in sources if item.exists()), default=0)
        fresh = newest <= index.stat().st_mtime
        _build_check.update(at=now, use=fresh and not vite_up)
        if _build_check["reported"] != _build_check["use"]:
            print("预览使用 dist/ 构建产物" if _build_check["use"] else (f"预览使用本地 Vite（{vite_origin}）" if vite_up else "dist/ 比源码旧，且本地 Vite 未启动"), flush=True)
            _build_check["reported"] = _build_check["use"]
    return _build_check["use"]

class Handler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"
    def respond(self, data, status=200, kind="application/json"):
        body = data if isinstance(data, bytes) else json.dumps(data, ensure_ascii=False).encode()
        self.send_response(status)
        self.send_header("Content-Type", kind)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.end_headers()
        try:
            self.wfile.write(body)
        except (BrokenPipeError, ConnectionResetError):
            pass

    def do_GET(self):
        path = urlparse(self.path).path
        if path == "/__ledger-compare":
            html = '''<!doctype html><meta charset="utf-8"><title>Ledger design QA</title><style>body{margin:0;background:#eef0f4;font:14px system-ui}main{display:flex;gap:20px;padding:16px}section{width:390px}h1{font-size:14px}img{display:block;width:390px}.crop{position:relative;overflow:hidden;height:230px}.crop img{position:absolute;top:-170px}</style><main><section><h1>Selected design · 390 CSS px</h1><img src="/__qa/ledger-selected.png"><h1>Record detail</h1><div class="crop"><img src="/__qa/ledger-selected.png"></div></section><section><h1>Implementation · local synthetic records</h1><img src="/__qa/ledger-final-390.jpg"><h1>Record detail</h1><div class="crop"><img src="/__qa/ledger-final-390.jpg"></div></section></main>'''
            self.respond(html.encode(), kind="text/html; charset=utf-8")
            return
        if path == "/__model-quantity-compare":
            # Normalize the selected 930px mock to the real 390 CSS-px capture.
            html = '''<!doctype html><meta charset="utf-8"><title>Model quantity design QA</title><style>body{margin:0;background:#eef0f4;font:14px system-ui}main{display:flex;gap:20px;padding:16px}section{width:390px}h1{font-size:14px}img{display:block;width:390px}.crop{position:relative;overflow:hidden;height:170px;background:white}.crop img{position:absolute}.source{top:-219px}.implementation{top:-252px}</style><main><section><h1>Selected reference · normalized to 390px</h1><div class="crop"><img class="source" src="/__qa/model-quantity-selected.png"></div><h1>Full reference</h1><img src="/__qa/model-quantity-selected.png"></section><section><h1>Implementation · 390 × 844 · local fixtures</h1><div class="crop"><img class="implementation" src="/__qa/model-quantity-final-390.jpg"></div><h1>Full implementation</h1><img src="/__qa/model-quantity-final-390.jpg"></section></main>'''
            self.respond(html.encode(), kind="text/html; charset=utf-8")
            return
        if path == "/__inventory-compare":
            html = '''<!doctype html><meta charset="utf-8"><title>Inventory mobile QA comparison</title><style>body{margin:0;background:#e8edf3;font:14px system-ui}main{display:flex;gap:24px;padding:20px}section{width:390px}h1{font-size:14px}img{display:block;width:390px;height:auto}</style><main><section><h1>Selected Option 2 · shared visual language, not inventory mock</h1><img src="/__customer-reference.png"></section><section><h1>Inventory implementation · local synthetic data · 390×844</h1><img src="/__qa/inv-final-390.jpg"></section></main>'''
            self.respond(html.encode(), kind="text/html; charset=utf-8")
            return
        if path == "/__customer-reference.png":
            image = root.parent / "docs" / "mobile-v2-evidence" / "20261008" / "thumb" / "selected-reference.png"
            self.respond(image.read_bytes(), kind="image/png")
            return
        if path == "/__customer-compare":
            capture = parse_qs(urlparse(self.path).query).get("capture", ["thumb-customers-initial-390.jpg"])[0]
            if not re.fullmatch(r"[a-z0-9-]{1,80}\.(jpg|png)", capture):
                self.respond({"error": "Invalid comparison capture"}, 400)
                return
            html = f'''<!doctype html><meta charset="utf-8"><title>Thumb-first customer comparison</title><style>body{{margin:0;background:#e8edf3;font:14px system-ui}}main{{display:flex;gap:24px;padding:20px}}section{{width:390px}}h1{{font-size:14px}}img{{display:block;width:390px;height:auto}}</style><main><section><h1>Selected source · 390 CSS px</h1><img src="/__customer-reference.png"></section><section><h1>Current implementation · synthetic local data</h1><img src="/__qa/{capture}"></section></main>'''
            self.respond(html.encode(), kind="text/html; charset=utf-8")
            return
        if path.startswith("/__qa/"):
            filename = path.removeprefix("/__qa/")
            if not re.fullmatch(r"[a-z0-9-]{1,80}\.(jpg|png)", filename):
                self.respond({"error": "Invalid evidence name"}, 400)
                return
            target = Path("/private/tmp/erp-mobile-v2-evidence") / filename
            if not target.is_file():
                self.respond({"error": "Capture not available"}, 404)
                return
            self.respond(target.read_bytes(), kind=mimetypes.guess_type(target)[0] or "image/jpeg")
            return
        if path == "/__intake_compare":
            focus = parse_qs(urlparse(self.path).query).get("focus", ["full"])[0]
            nav = focus == "nav"
            x, y, height = (959, 504, 54) if nav else (356, 678, 279)
            scale = 390 / 253
            crop_height = 60 if nav else 844
            image_top = -784 if nav else 0
            html = f'''<!doctype html><meta charset="utf-8"><title>Mobile intake comparison</title><style>body{{margin:0;background:#e8edf3;font:13px system-ui}}main{{display:flex;gap:20px;padding:20px}}section{{width:390px}}h1{{font-size:13px}}.source{{position:relative;overflow:hidden;width:390px;height:{height*scale}px;background:white}}.source img{{position:absolute;width:{1536*scale}px;max-width:none;left:{-x*scale}px;top:{-y*scale}px}}.capture{{position:relative;overflow:hidden;width:390px;height:{crop_height}px}}.capture img{{position:absolute;width:390px;top:{image_top}px}}</style><main><section><h1>Reference · task hierarchy, not same business flow</h1><div class="source"><img src="/__reference.png"></div></section><section><h1>Before · 390 x 844, new intake</h1><div class="capture"><img src="/__qa/nav-inbound-before-new-390.jpg"></div></section><section><h1>After · 390 x 844, new intake</h1><div class="capture"><img src="/__qa/nav-inbound-after-new-390.jpg"></div></section></main>'''
            self.respond(html.encode(), kind="text/html; charset=utf-8")
            return
        if path == "/__capture":
            html = '''<!doctype html><meta charset="utf-8"><title>Save local QA capture</title><form method="post"><label>Capture name<input name="name" value="home-390"></label><label>Screenshot base64<textarea name="png"></textarea></label><button>Save local screenshot</button></form>'''
            self.respond(html.encode(), kind="text/html; charset=utf-8")
            return
        if path == "/__reference.png":
            reference = root.parent / "docs" / "mobile-v2-evidence" / "reference-board.png"
            self.respond(reference.read_bytes(), kind="image/png")
            return
        if path == "/__compare":
            screen = parse_qs(urlparse(self.path).query).get("screen", ["home"])[0]
            screens = {"home": (49, 49, "/"), "sales": (356, 49, "/sales/new"), "customer": (664, 49, "/sales/new"), "inventory": (959, 49, "/inventory"), "product": (1253, 49, "/inventory?detail=KC-MOBILE"), "scanner": (49, 678, "/inventory"), "purchase": (356, 678, "/purchase/new"), "order": (664, 678, "/sales/XS-MOBILE"), "customer-detail": (959, 678, "/crm/customers"), "profile": (1253, 678, "/")}
            x, y, route = screens.get(screen, screens["home"])
            height = 500 if y < 600 else 279
            scale = 390 / 253
            html = f'''<!doctype html><html><meta charset="utf-8"><title>ERP Mobile visual comparison</title><style>body{{margin:0;background:#e8edf3;font:14px system-ui}}main{{display:flex;gap:24px;padding:20px}}section{{width:390px}}h1{{font-size:14px}}.source{{position:relative;overflow:hidden;width:390px;height:{height*scale}px;background:white}}img{{position:absolute;width:{1536*scale}px;max-width:none;left:{-x*scale}px;top:{-y*scale}px}}iframe{{width:390px;height:{height*scale}px;border:0;background:white}}</style><main><section><h1>Source · app-owned crop</h1><div class="source"><img src="/__reference.png"></div></section><section><h1>Implementation · synthetic local data</h1><iframe title="ERP mobile implementation" src="{route}"></iframe></section></main></html>'''
            self.respond(html.encode(), kind="text/html; charset=utf-8")
            return
        if path.startswith("/api/"):
            if qa_mode == "logged-out":
                self.respond({"error": {"message": "本地模拟：请登录"}}, 401)
                return
            if qa_mode == "read-error" and path != "/api/auth/me" and not path.startswith("/api/state"):
                self.respond({"error": {"message": "本地模拟：读取失败，可重试"}}, 503)
                return
            data = {"data": [], "meta": {**meta, "total": 0}}
            if path == "/api/auth/me":
                data = {"data": {"id": "local-mobile", "username": "local-mobile", "displayName": "手机测试员", "role": "老板", "enabled": True, "csrfToken": "local-only"}}
                if qa_mode == "limited":
                    data["data"].update(role="店员", permissionOverrides={"allowedMenus": ["inventory"], "showCost": False, "showProfit": False, "canDelete": False, "canEditHistory": False})
            elif path == "/api/customers/page":
                params = parse_qs(urlparse(self.path).query)
                keyword = params.get("keyword", [""])[0].casefold()
                level = params.get("level", ["all"])[0]
                channel = params.get("channel", ["all"])[0]
                customer_type = params.get("type", ["all"])[0]
                rows = [item for item in sample_customers if (not keyword or keyword in " ".join(str(item.get(key, "")) for key in ["name", "contact", "id", "source"]).casefold()) and (level == "all" or item["level"] == level) and (channel == "all" or item["source"] == channel) and (customer_type == "all" or item["type"] == customer_type)]
                sort_by = params.get("sortKey", ["lastDealTime"])[0]
                descending = params.get("sortDirection", ["desc"])[0] == "desc"
                rows.sort(key=lambda item: item.get(sort_by) or "", reverse=descending)
                page_size = int(params.get("pageSize", ["20"])[0])
                page = int(params.get("page", ["1"])[0])
                data = {"data": {"items": rows[(page - 1) * page_size:page * page_size]}, "meta": {"page": page, "pageSize": page_size, "total": len(rows), "summary": {"coreCount": sum(item["level"] == "S级" for item in rows), "receivable": 0, "payable": 0}, "facets": {"types": [partner["type"]], "channels": ["微信"]}}}
            elif path == "/api/sales/customers":
                data = {"data": [{**partner, "displayName": partner["name"], "primaryPhone": "LOCAL-ONLY", "roles": ["customer"], "legacyCustomer": partner}]}
            elif path == "/api/sales/product-candidates":
                data = {"data": [{**fixture["PRODUCT"], "productId": fixture["PRODUCT"]["id"], "productName": fixture["PRODUCT"]["name"], "availableQuantity": 10, "availabilityKnown": True, "estimatedSellPrice": 150, "saleable": True}]}
            elif path == "/api/finance/profit-report":
                query = {key: values[0] for key, values in parse_qs(urlparse(self.path).query, keep_blank_values=True).items() if key != "exportAll"}
                query.update(page=int(query.get("page", 1)), pageSize=int(query.get("pageSize", 20)))
                row = {"id": "P-MOBILE", "label": fixture["PRODUCT"]["name"], "secondary": "95新", "orderCount": 2, "quantity": 3, "revenue": 450, "cost": 300, "profit": 150, "margin": 1 / 3}
                data = {"data": {"filters": query, "sourceItems": [], "rows": [row], "pageRows": [row], "insightRows": [row], "trend": [{"date": "2026-10-07", "label": "10-07", "revenue": 450, "profit": 150, "netProfit": 150}], "summary": {**row, "profitableGroups": 1, "lossGroups": 0, "otherIncome": 0, "otherExpense": 0, "netProfit": 150}, "meta": meta}}
            elif path == "/api/products":
                data = {"data": state, "meta": meta}
            elif path == "/api/vendors":
                data = {"data": state, "meta": meta}
            elif path == "/api/users":
                data = {"data": state}
            elif path == "/api/logs":
                data = {"data": {"auditLogs": [{"id": "LOG-MOBILE", "time": "2026-10-07 14:30", "user": "手机测试员", "module": "销售", "type": "创建", "target": "XS-MOBILE-001", "beforeVal": "", "afterVal": "仅本地合成记录"}]}, "meta": meta}
            elif path == "/api/market-quotes" and quote_scenario == "core":
                effective_cores = {quote["coreId"] for quote in state["marketQuotes"] if quote.get("quoteScope") == "core" and quote.get("profile", {}).get("condition") == "any" and (not quote.get("validUntil") or quote["validUntil"] >= today)}
                matched_stock_ids = {item["id"] for item in quote_inventory if item.get("status") == "已入库" and item.get("coreId") in effective_cores}
                data = {"data": {"marketQuotes": state["marketQuotes"], "products": quote_products, "inventory": quote_inventory, "stockCount": len(matched_stock_ids)}, "meta": {"total": len(state["marketQuotes"]), "source": "local-synthetic-quote-qa"}}
            elif path.startswith(("/api/finance/dashboard", "/api/aftersales/workspace", "/api/assembly-operations", "/api/market-quotes")):
                data = {"data": state, "meta": meta}
            elif path.startswith(("/api/gpu_erp/finance/payment-ins", "/api/gpu_erp/finance/payment-outs", "/api/gpu_erp/finance/account-transfers")):
                data = {"data": state, "meta": meta}
            elif path == "/api/gpu_erp/finance/settlement-ledger":
                data = {"data": state["settlementLedger"], "meta": meta}
            elif path == "/api/inventory/product-ledger" and ledger_scenario != "baseline":
                if ledger_scenario == "error":
                    self.respond({"error": "本地验收读取失败"}, 503)
                    return
                params = parse_qs(urlparse(self.path).query)
                rows = [] if ledger_scenario == "empty" else [row for row in ledger_rows if all(not params.get(key, [""])[0] or params[key][0] in row[key] for key in ("documentNo", "createdBy", "documentType")) and (not params.get("startDate", [""])[0] or row["operatedAt"][:10] >= params["startDate"][0]) and (not params.get("endDate", [""])[0] or row["operatedAt"][:10] <= params["endDate"][0])]
                page, size = int(params.get("page", ["1"])[0]), int(params.get("pageSize", ["20"])[0])
                total = 49 if len(rows) == len(ledger_rows) and rows else len(rows)
                # Distinct read-only identities let UI acceptance detect stale
                # page/model data without connecting to any business database.
                if params.get("productSkuId", [""])[0] != "MODEL-LAYOUT-0":
                    rows = [{**row, "id": row["id"] + "-ALT", "documentNo": "ALT-" + row["documentNo"]} for row in rows[:1]]
                    total = len(rows)
                elif page > 1:
                    rows = [{**row, "id": row["id"] + f"-PAGE-{page}", "documentNo": row["documentNo"] + f"-P{page}"} for row in rows]
                data = {"data": {"rows": rows, "total": total, "page": page, "pageSize": size, "totalPages": max(1, (total + size - 1) // size)}}
            elif path == "/api/inventory/items":
                if inventory_scenario == "baseline":
                    data = {"data": [fixture["STOCK"]], "meta": meta}
                else:
                    params = parse_qs(urlparse(self.path).query)
                    rows = inventory_rows(params)
                    page, page_size = int(params.get("page", ["1"])[0]), int(params.get("pageSize", ["20"])[0])
                    data = {"data": rows[(page-1)*page_size:page*page_size], "meta": {"total": len(rows), "page": page, "pageSize": page_size}}
            elif path == "/api/inventory/summary":
                if inventory_scenario == "models":
                    params = parse_qs(urlparse(self.path).query)
                    keyword, category = params.get("keyword", [""])[0].casefold(), params.get("category", [""])[0]
                    data = {"data": [row for row in model_layout_rows if (not keyword or keyword in row["productName"].casefold()) and (not category or category == row["category"]) and (params.get("includeSold", ["false"])[0] == "true" or not row["soldCount"])]}
                elif inventory_scenario == "baseline":
                    data = {"data": [{**fixture["PRODUCT"], "key": fixture["PRODUCT"]["id"], "productName": fixture["PRODUCT"]["name"], "warehouseLocation": "A区货架01", "warehouseLocations": ["A区货架01"], "totalCount": 3, "availableCount": 1, "pendingCount": 2, "lockedCount": 0, "soldCount": 0, "repairCount": 0, "totalCost": 300, "totalEstSell": 450, "avgCost": 100, "avgEstSell": 150, "estimatedProfit": 150}]}
                else:
                    rows = inventory_rows(parse_qs(urlparse(self.path).query))
                    data = {"data": [{**item, "key": item["productId"], "warehouseLocations": [item["warehouseLocation"]], "totalCount": 1, "availableCount": int(item["status"] == "已入库"), "pendingCount": int(item["status"] == "待检测"), "lockedCount": int(item["status"] == "已锁定"), "soldCount": int(item["status"] == "已售出"), "repairCount": 0, "totalCost": item["costPrice"], "totalEstSell": item["estSellPrice"], "avgCost": item["costPrice"], "avgEstSell": item["estSellPrice"]} for item in rows]}
            elif path.endswith("/journey"):
                stock = next((item for item in sample_inventory if item["id"] == path.split("/")[-2]), fixture["STOCK"])
                data = {"data": {"card": stock, "events": [], "purchases": [], "sales": [], "returns": [], "payments": [], "inspections": [], "aftersales": [], "assemblies": []}}
            elif path.endswith("/settlement-accounts"):
                data = {"data": [fixture["ACCOUNT"]]}
            elif path.startswith(("/api/state", "/api/returns/reference", "/api/purchase-invoices/reference", "/api/inspections/workspace")) or path in {"/api/purchase-invoices", "/api/purchase-invoices/detail", "/api/sales-invoices", "/api/sales-invoices/outbound"}:
                data = {"data": state, "meta": {**meta, "total": len(state["salesInvoices"]) if "sales" in path else 1}}
            self.respond(data)
            return
        try:
            build = root.parent / "dist"
            if serve_build(build):
                target = (build / path.lstrip("/")).resolve()
                if not target.is_relative_to(build.resolve()):
                    self.respond({"error": "Invalid preview path"}, 400)
                    return
                if not target.is_file():
                    target = build / "index.html"
                self.respond(target.read_bytes(), kind=mimetypes.guess_type(target)[0] or "application/octet-stream")
                return
            with urlopen(vite_origin + self.path, timeout=20) as response:
                body = response.read()
                kind = response.headers.get("Content-Type", "text/plain")
            if path == "/src/hooks/useWorkspaceTabRuntime.tsx":
                text = body.decode()
                marker = "const drafts = {};"
                if marker not in text:
                    self.respond({"error": "Draft fixture marker changed"}, 500)
                    return
                imports = 'import {createPurchaseDefaults} from "/src/features/purchase/purchase.defaults.ts"; import {createSalesDefaults} from "/src/features/sales/sales.defaults.ts";\n'
                body = (imports + text.replace(marker, fixture["SEED"])).encode()
            self.respond(body, kind=kind)
        except Exception:
            self.respond({"error": "Local Vite preview is unavailable"}, 502)

    def do_POST(self):
        length = int(self.headers.get("Content-Length", "0"))
        if length > 4_000_000:
            self.respond({"error": "Capture exceeds local limit"}, 413)
            self.close_connection = True
            return
        payload = self.rfile.read(length)
        if self.path == "/__capture":
            values = parse_qs(payload.decode())
            name = values.get("name", [""])[0]
            if not re.fullmatch(r"[a-z0-9-]{1,80}", name):
                self.respond({"error": "Invalid capture name"}, 400)
                return
            try:
                png = base64.b64decode(values.get("png", [""])[0], validate=True)
                extension = "png" if png.startswith(b"\x89PNG\r\n\x1a\n") else "jpg" if png.startswith(b"\xff\xd8\xff") else None
                if not extension:
                    raise ValueError("Unsupported screenshot")
                directory = Path("/private/tmp/erp-mobile-v2-evidence")
                directory.mkdir(exist_ok=True)
                target = directory / (name + "." + extension)
                target.write_bytes(png)
                self.respond(f"<!doctype html><meta charset='utf-8'><p>Saved {target}</p><a href='/__capture'>Next capture</a>".encode(), kind="text/html; charset=utf-8")
            except (ValueError, OSError):
                self.respond({"error": "Cannot save capture"}, 400)
            return
        if self.path == "/api/ops/client-events":
            self.respond({"data": {"accepted": True}})
            return
        self.respond({"error": {"message": "本地模拟冲突：输入已保留；此预览不会写入真实单据"}}, 409)

    do_PUT = do_POST
    do_PATCH = do_POST
    do_DELETE = do_POST

    def log_message(self, *_):
        pass

class PreviewServer(ThreadingHTTPServer):
    request_queue_size = 128

print(f"Isolated mobile preview http://127.0.0.1:{qa_port} ({qa_mode}; synthetic data; writes blocked)", flush=True)
PreviewServer(("127.0.0.1", qa_port), Handler).serve_forever()
