/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useMemo, useRef } from "react";
import {
  Layers,
  Search,
  Plus,
  Trash2,
  Copy,
  FileSpreadsheet,
  CheckCircle,
  X,
  Hash
} from "lucide-react";
import { useStoreStateReturn } from "../utils/state";
import { getLockedHandlerFieldState } from "../utils/sessionUser";
import { CustomerCard, PurchaseItem, ProductTemplate, SourceType, Vendor } from "../types";

interface PurchaseInvoiceProps {
  storeState: useStoreStateReturn;
  setTab: (tab: string) => void;
}

export default function PurchaseInvoice({ storeState, setTab }: PurchaseInvoiceProps) {
  const {
    products,
    createPurchaseInvoice,
    currentRole,
    inventory,
    customers,
    vendors,
    settlementAccounts,
    currentUser
  } = storeState;
  const lockedHandlerState = getLockedHandlerFieldState(currentUser, currentRole);
  const defaultHandlerName = lockedHandlerState.value;

  // Invoice generic fields
  const [sourceType, setSourceType] = useState<SourceType>("个人回收");
  const [supplierName, setSupplierName] = useState("张建国");
  const [contact, setContact] = useState("13799018821");
  const [selectedSourceId, setSelectedSourceId] = useState(customers.find(customer => customer.type === "个人卖家客户" || customer.type === "回收客户")?.id || vendors[0]?.id || "");
  const [isPaid, setIsPaid] = useState(true);
  const [paidAmount, setPaidAmount] = useState<number>(18000);
  const [unpaidAmount, setUnpaidAmount] = useState<number>(0);
  const [expressNo, setExpressNo] = useState("SF13800138000");
  const [remarks, setRemarks] = useState("");
  const [settlementAccountId, setSettlementAccountId] = useState(settlementAccounts.find(account => account.type === "支付宝")?.id || settlementAccounts[0]?.id || "");
  const [paymentHandler, setPaymentHandler] = useState(defaultHandlerName);

  // Grid editing sheets
  const [items, setItems] = useState<PurchaseItem[]>([
    {
      tempId: "init-1",
      productId: "",
      productName: "",
      category: "显卡",
      model: "",
      brand: "",
      version: "",
      vram: "",
      sn: "",
      condition: "充新99新",
      inWarranty: true,
      warrantyDate: "",
      repaired: false,
      gpuRisk: false,
      fullBox: true,
      buyPrice: 0,
      estSellPrice: 0,
      warehouseLocation: "待检测区",
      remarks: ""
    }
  ]);

  // Autocomplete UI logic per active row
  const [activeRowSearchId, setActiveRowSearchId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchDropdownRect, setSearchDropdownRect] = useState<{ left: number; top: number; width: number } | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const activeSearchInputRef = useRef<HTMLInputElement | null>(null);

  // Excel Paste box state
  const [isPasteDrawerOpen, setIsPasteDrawerOpen] = useState(false);
  const [pasteContent, setPasteContent] = useState("");

  const topControlClass = "w-full h-12 bg-white border border-slate-800 text-sm text-slate-200 px-3 rounded-lg focus:outline-none focus:border-cyan-500";
  const rowControlClass = "w-full h-9 bg-white border border-slate-800 text-[11px] text-slate-300 px-2 rounded-md focus:outline-none focus:border-cyan-500";

  // Temp mock billing sheet code
  const tempInvoiceNo = useMemo(() => {
    const dStr = new Date().toISOString().split("T")[0].replace(/-/g, "");
    return `JH-${dStr}-MOCK`;
  }, []);

  useEffect(() => {
    setPaymentHandler(defaultHandlerName);
  }, [defaultHandlerName]);

  // Filter templates list
  const filteredTemplates = useMemo(() => {
    if (!searchQuery) return products;
    return products.filter(p =>
      p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.model.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.brand.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.version.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [products, searchQuery]);

  const isPersonalSource = sourceType === "个人回收" || sourceType === "客户置换";
  const normalizeCustomerType = (type?: CustomerCard["type"]) => {
    if (type === "个人卖家客户" || type === "回收客户") return "个人卖家客户";
    return "个人买家客户";
  };
  const normalizePeerType = (type?: Vendor["type"]) => {
    if (type === "卖货同行" || type === "大黄牛" || type === "数码渠道大厂" || type === "批发客户") return "卖货同行";
    return "收货同行";
  };

  const sourceOptions = useMemo(() => {
    if (isPersonalSource) {
      return customers
        .filter(customer => normalizeCustomerType(customer.type) === "个人卖家客户")
        .map(customer => ({
          id: customer.id,
          name: customer.name,
          contact: customer.contact || customer.phone || customer.wechat || "",
          kind: "customer" as const
        }));
    }

    return vendors
      .filter(vendor => (vendor.partnerCategory || "同行") === "同行" && normalizePeerType(vendor.type) === "收货同行")
      .map(vendor => ({
        id: vendor.id,
        name: vendor.name,
        contact: vendor.contact || vendor.phone || vendor.contactPerson || "",
        kind: "vendor" as const
      }));
  }, [customers, isPersonalSource, vendors]);

  const selectedSource = useMemo(() => {
    return sourceOptions.find(source => source.id === selectedSourceId) || null;
  }, [selectedSourceId, sourceOptions]);

  const selectedSettlementAccount = useMemo(() => {
    return settlementAccounts.find(account => account.id === settlementAccountId) || null;
  }, [settlementAccountId, settlementAccounts]);

  // Sum calculations
  const summary = useMemo(() => {
    const totalCount = items.length;
    let totalCost = 0;
    let estTotalSell = 0;
    items.forEach(it => {
      totalCost += it.buyPrice;
      estTotalSell += it.estSellPrice;
    });
    const estTotalProfit = estTotalSell - totalCost;

    return { totalCount, totalCost, estTotalSell, estTotalProfit };
  }, [items]);

  // Sync paidAmount automatically when isPaid toggles
  useEffect(() => {
    if (isPaid) {
      setPaidAmount(summary.totalCost);
      setUnpaidAmount(0);
    } else {
      setPaidAmount(Math.round(summary.totalCost * 0.4));
      setUnpaidAmount(summary.totalCost - Math.round(summary.totalCost * 0.4));
    }
  }, [isPaid, summary.totalCost]);

  useEffect(() => {
    if (!sourceOptions.some(source => source.id === selectedSourceId)) {
      setSelectedSourceId(sourceOptions[0]?.id || "");
    }
  }, [selectedSourceId, sourceOptions]);

  useEffect(() => {
    if (!selectedSource) return;
    setSupplierName(selectedSource.name);
    setContact(selectedSource.contact);
  }, [selectedSource]);

  const positionSearchDropdown = (input: HTMLInputElement) => {
    const rect = input.getBoundingClientRect();
    setSearchDropdownRect({
      left: rect.left,
      top: rect.bottom + 6,
      width: Math.max(rect.width, 360),
    });
  };

  const openRowSearch = (rowId: string, productName: string, input: HTMLInputElement) => {
    activeSearchInputRef.current = input;
    setActiveRowSearchId(rowId);
    setSearchQuery(productName);
    positionSearchDropdown(input);
  };

  // Closes search container on outside click
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      const target = event.target as Node;
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(target) &&
        activeSearchInputRef.current &&
        !activeSearchInputRef.current.contains(target)
      ) {
        setActiveRowSearchId(null);
        setSearchDropdownRect(null);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    if (!activeRowSearchId) return;
    const syncPosition = () => {
      if (activeSearchInputRef.current) {
        positionSearchDropdown(activeSearchInputRef.current);
      }
    };
    window.addEventListener("resize", syncPosition);
    window.addEventListener("scroll", syncPosition, true);
    return () => {
      window.removeEventListener("resize", syncPosition);
      window.removeEventListener("scroll", syncPosition, true);
    };
  }, [activeRowSearchId]);

  // Spreading spreadsheet commands
  const addRow = () => {
    const nextRowId = `row-${Date.now()}`;
    const defaultTemplate = products[0] || {
      id: "SP-001",
      name: "RTX 4090 华硕 ROG 猛禽 24G",
      category: "显卡",
      model: "RTX 4090",
      brand: "华硕",
      version: "ROG 猛禽",
      vram: "24G",
      refBuyPrice: 18000,
      refSellPrice: 19500
    };

    setItems(prev => [
      ...prev,
      {
        tempId: nextRowId,
        productId: defaultTemplate.id,
        productName: defaultTemplate.name,
        category: defaultTemplate.category || "显卡",
        model: defaultTemplate.model,
        brand: defaultTemplate.brand,
        version: defaultTemplate.version,
        vram: defaultTemplate.vram,
        sn: "",
        condition: "靓机95新",
        inWarranty: true,
        warrantyDate: new Date(Date.now() + 365 * 2 * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
        repaired: false,
        gpuRisk: false,
        fullBox: true,
        buyPrice: defaultTemplate.refBuyPrice,
        estSellPrice: defaultTemplate.refSellPrice,
        warehouseLocation: "待检测区",
        remarks: ""
      }
    ]);
  };

  const copyRow = (index: number) => {
    const source = items[index];
    const nextRowId = `row-copy-${Date.now()}`;
    setItems(prev => {
      const copy = [...prev];
      copy.splice(index + 1, 0, {
        ...source,
        tempId: nextRowId,
        sn: ""
      });
      return copy;
    });
  };

  const deleteRow = (index: number) => {
    if (items.length <= 1) {
      alert("明细单据必须包含至少 1 条商品明细记录。");
      return;
    }
    setItems(prev => prev.filter((_, i) => i !== index));
  };

  const updateField = (index: number, key: keyof PurchaseItem, value: any) => {
    setItems(prev => {
      return prev.map((item, i) => {
        if (i === index) {
          return {
            ...item,
            [key]: value
          };
        }
        return item;
      });
    });
  };

  // Autocomplete selecting product template
  const selectTemplate = (index: number, t: ProductTemplate) => {
    updateField(index, "productId", t.id);
    updateField(index, "productName", t.name);
    updateField(index, "category", t.category || "显卡");
    updateField(index, "model", t.model);
    updateField(index, "brand", t.brand);
    updateField(index, "version", t.version);
    updateField(index, "vram", t.vram);
    updateField(index, "buyPrice", t.refBuyPrice);
    updateField(index, "estSellPrice", t.refSellPrice);
    setActiveRowSearchId(null);
  };

  // Save drafts
  const handleSaveDraft = () => {
    alert("草稿已成功序列化并存入浏览器缓存(Draft-Save)。随时可以导入该单据。");
  };

  // Validation routines
  const checkErrors = () => {
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (item.buyPrice <= 0) {
        return `第 ${i + 1} 行收购价填写错误！需输入合理回收金额。`;
      }
      if (item.buyPrice >= item.estSellPrice) {
        return `第 ${i + 1} 行：收购成本价 (${item.buyPrice}元) 高于预估销售参考价 (${item.estSellPrice}元)，该卡可能出现成本倒挂，请重新核实。`;
      }
    }
    return null;
  };

  // Submit and construct inventories
  const handlePostInvoice = () => {
    if (!selectedSource) {
      alert(isPersonalSource ? "请先在【个人客户】里新增个人卖家客户，再回到进货单选择来源开单。" : "请先在【同行列表】里新增收货同行，再回到进货单选择来源开单。");
      setTab(isPersonalSource ? "customers" : "vendors");
      return;
    }

    const errorMsg = checkErrors();
    if (errorMsg) {
      alert(`无法提交：\n${errorMsg}`);
      return;
    }

    createPurchaseInvoice({
      date: new Date().toISOString().split("T")[0],
      sourceType,
      supplierName,
      contact,
      paymentMethod: selectedSettlementAccount?.name || "付款账户",
      isPaid,
      paidAmount,
      unpaidAmount,
      settlementAccountId: paidAmount > 0 ? settlementAccountId : undefined,
      settlementAccountName: selectedSettlementAccount?.name,
      paymentHandler,
      paymentStatus: unpaidAmount <= 0 ? "已付款" : paidAmount > 0 ? "部分付款" : "未付款",
      handleBy: paymentHandler,
      expressNo: expressNo.trim() || undefined,
      remarks,
      items
    });

    alert("🎉 进货回收单据入账成功！\n显卡会进入【检测录入】绑定 SN 和最终库位；其他配件会直接进入配件库存，可在【单卡库存】扫码确认库位。");
    setTab("purchase_list");
  };

  // Excel paste parser simulation
  const handlePasteSubmit = () => {
    if (!pasteContent.trim()) {
      setIsPasteDrawerOpen(false);
      return;
    }
    
    // Simulate parsing columns separated by space/comma/tab
    // Expected format: Name BuyPrice SellPrice Remarks
    const lines = pasteContent.split("\n").filter(l => l.trim().length > 0);
    const parsedItems: PurchaseItem[] = [];

    lines.forEach((line, idx) => {
      const parts = line.split(/[,\t]/);
      let matchTemplate = products[idx % products.length];
      
      const buyPriceVal = parts[1] ? Number(parts[1].trim()) : matchTemplate.refBuyPrice;
      const estSellVal = parts[2] ? Number(parts[2].trim()) : matchTemplate.refSellPrice;
      const remarksVal = parts[3] ? parts[3].trim() : "批量粘贴导入，按品类分流入库";

      parsedItems.push({
        tempId: `paste-${idx}-${Date.now()}`,
        productId: matchTemplate.id,
        productName: matchTemplate.name,
        category: matchTemplate.category || "显卡",
        model: matchTemplate.model,
        brand: matchTemplate.brand,
        version: matchTemplate.version,
        vram: matchTemplate.vram,
        sn: "",
        condition: "靓机95新",
        inWarranty: true,
        warrantyDate: "2028-10-18",
        repaired: false,
        gpuRisk: false,
        fullBox: true,
        buyPrice: buyPriceVal,
        estSellPrice: estSellVal,
        warehouseLocation: "待检测区",
        remarks: remarksVal
      });
    });

    setItems(prev => [...prev, ...parsedItems]);
    setIsPasteDrawerOpen(false);
    setPasteContent("");
    alert(`解析成功！已批量追加 ${parsedItems.length} 条商品入库明细！`);
  };

  return (
    <div className="space-y-4">
      {/* Title with simulation triggers */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-slate-900 p-5 rounded-2xl border border-slate-800">
        <div>
          <h2 className="text-base font-bold text-slate-100 flex items-center gap-2">
            <Layers className="w-5 h-5 text-cyan-400" />
            <span>进货与回收</span>
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            进货先记录来源、成本、付款账户和快递单号。显卡走检测入库，其他配件直接进入配件库存。
          </p>
        </div>
        <div className="flex gap-2 shrink-0">
          <button
            onClick={() => setIsPasteDrawerOpen(true)}
            className="p-2 border border-slate-700 hover:bg-slate-800 text-slate-300 rounded-lg text-xs font-bold flex items-center gap-1.5 cursor-pointer"
          >
            <FileSpreadsheet className="w-4 h-4 text-emerald-400" />
            批量粘贴
          </button>
          <button
            onClick={handleSaveDraft}
            className="p-2 border border-slate-700 hover:bg-slate-800 text-slate-300 rounded-lg text-xs font-bold cursor-pointer"
          >
            保存为草稿
          </button>
        </div>
      </div>

      {/* BLOCK 1: TOP GENERAL INFOS (单据明细) */}
      <div className="bg-slate-900 border border-slate-850 p-5 rounded-xl space-y-4 shadow-sm relative">
        <div className="absolute top-0 right-0 w-16 h-16 bg-cyan-500/[0.02] rounded-full blur-xl"></div>
        
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {/* Bill ID */}
          <div>
            <label className="text-[10px] text-slate-500 font-bold uppercase tracking-wider block mb-1">单据编号 (系统自动生成)</label>
            <div className="w-full h-12 bg-white border border-slate-850 px-3 text-xs font-bold text-slate-400 rounded-lg font-mono flex items-center justify-between">
              <span>{tempInvoiceNo}</span>
              <span className="text-[9px] text-amber-400 font-semibold bg-amber-400/10 px-1.5 rounded">未入库草卷</span>
            </div>
          </div>

          {/* Source Path */}
          <div>
            <label className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block mb-1">来源类型</label>
            <select
              value={sourceType}
              onChange={e => setSourceType(e.target.value as SourceType)}
              className={`${topControlClass} font-semibold`}
            >
              <option value="个人回收">个人</option>
              <option value="同行拿货">同行</option>
            </select>
          </div>

          {/* Supplier Name */}
          <div>
            <label className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block mb-1">
              {isPersonalSource ? "个人卖家客户" : "收货同行"}
            </label>
            <select
              required
              value={selectedSourceId}
              onChange={e => setSelectedSourceId(e.target.value)}
              className={topControlClass}
            >
              {sourceOptions.length === 0 && <option value="">请先新增{isPersonalSource ? "个人卖家客户" : "收货同行"}</option>}
              {sourceOptions.map(source => (
                <option key={source.id} value={source.id}>
                  {source.name} / {source.contact || "未记录联系方式"}
                </option>
              ))}
            </select>
          </div>

          {/* Contact */}
          <div>
            <label className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block mb-1">联系电话 / 微信</label>
            <input
              type="text"
              required
              value={contact}
              readOnly
              className={`${topControlClass} text-slate-400`}
            />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 pt-1">
          <div>
            <label className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block mb-1">来源档案</label>
            <button
              type="button"
              onClick={() => setTab(isPersonalSource ? "customers" : "vendors")}
              className="w-full h-12 bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 text-xs font-black px-3 rounded-lg"
            >
              {isPersonalSource ? "去个人客户新增" : "去同行列表新增"}
            </button>
          </div>

          <div>
            <label className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block mb-1">快递单号</label>
            <div className="relative">
              <input
                value={expressNo}
                onChange={e => setExpressNo(e.target.value)}
                className={`${topControlClass} pl-9 font-mono`}
                placeholder="如 SF123 / YT123 / JD123"
              />
              <Hash className="w-4 h-4 absolute left-3 top-3.5 text-slate-400" />
            </div>
          </div>

          <div>
            <label className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block mb-1">付款账户</label>
            <select
              value={settlementAccountId}
              onChange={e => setSettlementAccountId(e.target.value)}
              className={topControlClass}
            >
              {settlementAccounts.map(account => (
                <option key={account.id} value={account.id}>{account.name} / {account.balance}元</option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block mb-1">经办人</label>
            <input
              value={paymentHandler}
              readOnly={lockedHandlerState.readOnly}
              disabled={lockedHandlerState.disabled}
              className={`${topControlClass} cursor-not-allowed opacity-80`}
            />
          </div>

          {/* Is Paid */}
          <div>
            <label className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block mb-1">付款状态</label>
            <div className="flex bg-white p-1 rounded-lg border border-slate-800 gap-1 h-12">
              <button
                type="button"
                onClick={() => setIsPaid(true)}
                className={`flex-1 text-[11px] font-bold rounded ${
                  isPaid ? "bg-cyan-500 text-slate-950" : "text-slate-400 hover:text-slate-200"
                }`}
              >
                已结清
              </button>
              <button
                type="button"
                onClick={() => setIsPaid(false)}
                className={`flex-1 text-[11px] font-bold rounded ${
                  !isPaid ? "bg-amber-500 text-slate-950" : "text-slate-400 hover:text-slate-200"
                }`}
              >
                记账欠款
              </button>
            </div>
          </div>

          {/* Paid amounts dynamic */}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[10px] text-slate-500 font-bold tracking-wider block mb-1">已付金额(元)</label>
              <input
                type="number"
                disabled={isPaid}
                value={paidAmount}
                onChange={e => {
                  const val = Number(e.target.value);
                  setPaidAmount(val);
                  setUnpaidAmount(Math.max(0, summary.totalCost - val));
                }}
                className="w-full h-12 bg-white border border-slate-850 text-sm text-slate-200 px-3 rounded-lg disabled:text-slate-500 font-mono"
              />
            </div>
            <div>
              <label className="text-[10px] text-slate-500 font-bold tracking-wider block mb-1">应付未付款</label>
              <div className="w-full h-12 bg-white border border-slate-850 px-3 text-sm font-mono font-bold text-amber-400 rounded-lg flex items-center">
                {unpaidAmount}元
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* SPREADSHEET TABLE (可编辑明细) */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-x-auto shadow-lg">
        <table className="w-full text-left border-collapse table-fixed min-w-[680px]">
          <thead>
            <tr className="border-b border-slate-800 bg-slate-950 text-[11px] text-slate-400 font-bold font-mono">
              <th className="p-2.5 pl-3 w-[280px]">商品型号搜索 (关键核心)</th>
              <th className="p-2.5 w-[95px] text-right">进货价 (元)</th>
              <th className="p-2.5 w-[95px] text-right">预估售价 (元)</th>
              <th className="p-2.5 w-[85px] text-right">预计利润</th>
              <th className="p-2.5 w-[100px]">备注</th>
              <th className="p-2.5 pr-3 text-right w-[100px]">操作</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/80 text-xs">
            {items.map((item, index) => {
              const expectedProfit = item.estSellPrice - item.buyPrice;
              const isRiskHighCost = pPriceBelow(index);

              function pPriceBelow(idx: number) {
                const target = products.find(p => p.id === items[idx].productId);
                if (!target) return false;
                // Cost exceeds guidance reference sell price has warning
                return items[idx].buyPrice > target.refSellPrice;
              }

              return (
                <tr key={item.tempId} className="hover:bg-slate-850/20 transition-colors">
                  {/* SEARCH COLUMN */}
                  <td className="p-2 pl-3 relative">
                    <div className="relative">
                      <input
                        type="text"
                        value={activeRowSearchId === item.tempId ? searchQuery : item.productName}
                        placeholder="输入 4090/猛禽/七彩虹 查找..."
                        onClick={e => {
                          openRowSearch(item.tempId, item.productName, e.currentTarget);
                        }}
                        onFocus={e => {
                          openRowSearch(item.tempId, item.productName, e.currentTarget);
                        }}
                        onChange={e => {
                          activeSearchInputRef.current = e.currentTarget;
                          setSearchQuery(e.target.value);
                          setActiveRowSearchId(item.tempId);
                          positionSearchDropdown(e.currentTarget);
                        }}
                        className="w-full h-9 bg-white border border-slate-800 text-[11px] text-slate-200 px-2 pr-7 rounded-md focus:outline-none focus:border-cyan-500 font-bold text-ellipsis overflow-hidden whitespace-nowrap"
                      />
                      <Search className="w-3.5 h-3.5 absolute right-2 top-2.5 text-slate-500 pointer-events-none" />
                    </div>
                  </td>

                  {/* BUY PRICE */}
                  <td className="p-2">
                    <input
                      type="number"
                      required
                      value={item.buyPrice}
                      onChange={e => updateField(index, "buyPrice", Number(e.target.value))}
                      className={`w-full h-9 text-right bg-white border text-[11px] px-2 rounded-md focus:outline-none font-mono font-bold ${
                        isRiskHighCost ? "border-rose-400 text-rose-400 focus:border-rose-500 bg-rose-500/5 animate-pulse" : "border-slate-800 text-cyan-400 focus:border-cyan-500"
                      }`}
                    />
                  </td>

                  {/* EXPECTED SELL PRICE */}
                  <td className="p-2">
                    <input
                      type="number"
                      required
                      value={item.estSellPrice}
                      onChange={e => updateField(index, "estSellPrice", Number(e.target.value))}
                      className="w-full h-9 text-right bg-white border border-slate-800 text-[11px] text-emerald-400 font-mono font-bold px-2 rounded-md focus:outline-none focus:border-cyan-500"
                    />
                  </td>

                  {/* ESTIMATED GAINS / LOSS */}
                  <td className="p-2 text-right font-mono font-black text-[11px]">
                    <span className={expectedProfit >= 0 ? "text-emerald-400" : "text-rose-500"}>
                      {expectedProfit}元
                    </span>
                    {isRiskHighCost && (
                      <span className="block text-[8px] text-rose-300 font-sans border border-rose-500/30 rounded text-center mt-1 bg-rose-500/10 leading-none py-0.5" title="高价入货风险">
                        倒挂!
                      </span>
                    )}
                  </td>

                  {/* REMARK IN ROW */}
                  <td className="p-2">
                    <input
                      type="text"
                      value={item.remarks}
                      placeholder="品相附件"
                      onChange={e => updateField(index, "remarks", e.target.value)}
                      className={rowControlClass}
                    />
                  </td>

                  {/* ACTION LINE (COPY / TRASH) */}
                  <td className="p-2 text-right pr-3 whitespace-nowrap">
                    <div className="flex justify-end gap-1.5">
                      <button
                        type="button"
                        onClick={() => copyRow(index)}
                        title="复制追加一行"
                        className="p-1 px-2 border border-slate-700 hover:bg-slate-800 text-slate-200 rounded text-[10px] flex items-center gap-0.5 cursor-pointer"
                      >
                        <Copy className="w-3 h-3 text-slate-400" />
                        双卡
                      </button>
                      <button
                        type="button"
                        onClick={() => deleteRow(index)}
                        className="p-1 px-2 border border-rose-950 text-rose-400 bg-rose-950/10 hover:bg-rose-950/30 rounded cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {activeRowSearchId && searchDropdownRect && (
        <div
          ref={dropdownRef}
          className="fixed bg-white border border-slate-800 rounded-xl shadow-[0_24px_60px_rgba(15,23,42,0.24)] z-[9999] max-h-[280px] overflow-y-auto p-1 custom-scrollbar"
          style={{
            left: `${searchDropdownRect.left}px`,
            top: `${searchDropdownRect.top}px`,
            width: `${searchDropdownRect.width}px`,
          }}
        >
          <div className="p-2 px-3 border-b border-slate-800 text-[11px] text-slate-500 font-bold tracking-wide leading-none bg-slate-950/5 rounded-t-lg">
            点击套用商品库标准模板
          </div>
          {filteredTemplates.length === 0 ? (
            <div className="px-3 py-4 text-xs text-slate-500">没有匹配的商品模板</div>
          ) : (
            filteredTemplates.map(t => {
              const activeRowIndex = items.findIndex(row => row.tempId === activeRowSearchId);
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => {
                    if (activeRowIndex >= 0) {
                      selectTemplate(activeRowIndex, t);
                    }
                    setSearchDropdownRect(null);
                  }}
                  className="w-full text-left p-2.5 hover:bg-blue-50 rounded-lg text-xs flex items-center justify-between gap-3 transition-colors mt-0.5"
                >
                  <div className="min-w-0">
                    <span className="font-bold text-slate-200 block truncate">{t.name}</span>
                    <span className="text-[10px] text-slate-500 font-mono">
                      指导收: {t.refBuyPrice}元 | 售价: {t.refSellPrice}元
                    </span>
                  </div>
                  <span className="shrink-0 text-[10px] text-blue-600 bg-blue-50 border border-blue-100 px-1.5 py-0.5 rounded font-mono">
                    库: {inventory.filter(c => c.productId === t.id && c.status !== "已售出").length}
                  </span>
                </button>
              );
            })
          )}
        </div>
      )}

      {/* QUICK TABLE BOTTOM ACTIONS */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4 bg-slate-900/60 p-3.5 rounded-xl border border-slate-800">
        <button
          type="button"
          onClick={addRow}
          className="w-full sm:w-auto p-2 px-5 bg-slate-800 border border-slate-700 text-slate-100 hover:text-slate-50 hover:bg-slate-750 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer"
        >
          <Plus className="w-4 h-4 text-cyan-400" />
          继续增加一行商品 (可通过 TaB 切换)
        </button>

        {/* Dynamic inline tips */}
        <div className="text-[11px] text-slate-400 font-mono text-center sm:text-right">
          小提示: 显卡进货后进入“检测录入”绑定 SN 和最终库位；CPU、主板、内存、硬盘、电源等配件会直接进入配件库。
        </div>
      </div>

      {/* BLOCK 3: BOTTOM GRAND SUMMARY (金额汇总) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 bg-slate-950 rounded-xl border border-slate-800 p-5 shadow-2xl relative overflow-hidden">
        {/* Glow behind summary */}
        <div className="absolute top-0 left-0 w-32 h-32 bg-cyan-400/[0.03] rounded-full blur-2xl"></div>

        {/* Text Area Remarks */}
        <div className="lg:col-span-2 space-y-3">
          <label className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">采购进货备注 (可选)</label>
          <textarea
            value={remarks}
            onChange={e => setRemarks(e.target.value)}
            placeholder="此处可以记录批量回收的价格谈判要点。例如：由于该批卡是从网咖打包收来的，其中3张挡板有细微生锈，后期质检员需要花时间除锈清洗..."
            className="w-full bg-slate-900 border border-slate-800 text-xs text-slate-200 p-2.5 rounded-lg h-24 resize-none focus:outline-none focus:border-cyan-500"
          ></textarea>
        </div>

        {/* MATH SUMMARY */}
        <div className="bg-slate-900/40 border border-slate-850 p-4 rounded-lg flex flex-col justify-between">
          <div className="space-y-2">
            <h4 className="text-xs font-extrabold text-slate-300 tracking-wider uppercase border-b border-slate-800 pb-1.5 flex items-center justify-between">
              <span>进货单据财务汇总</span>
              <span className="font-mono text-[10px] text-slate-500">{items.length} 张单卡</span>
            </h4>
            
            <div className="flex items-center justify-between text-xs text-slate-400">
              <span>总数量:</span>
              <span className="font-bold text-slate-200 font-mono">{summary.totalCount} 张</span>
            </div>
            
            <div className="flex items-center justify-between text-xs text-slate-400">
              <span>采购总投入 (成本):</span>
              <span className="font-black text-cyan-400 font-mono text-sm">{summary.totalCost.toLocaleString()}元</span>
            </div>

            <div className="flex items-center justify-between text-xs text-slate-400">
              <span>预估销售总额:</span>
              <span className="font-bold text-slate-200 font-mono">{summary.estTotalSell.toLocaleString()}元</span>
            </div>

            <div className="flex items-center justify-between text-xs text-slate-400 border-t border-slate-800/80 pt-1.5">
              <span>预计差价总毛利润:</span>
              <span className={`font-black font-mono text-base ${summary.estTotalProfit >= 0 ? "text-emerald-400 font-black shadow-glow" : "text-rose-500"}`}>
                {summary.estTotalProfit.toLocaleString()}元
              </span>
            </div>
          </div>

          <button
            type="button"
            onClick={handlePostInvoice}
            className="w-full mt-4 p-3 bg-gradient-to-r from-cyan-500 to-sky-600 hover:from-cyan-400 hover:to-sky-500 text-slate-950 font-black text-xs rounded-xl shadow-[0_0_15px_rgba(6,182,212,0.35)] hover:scale-[1.01] transition-all flex items-center justify-center gap-1.5 cursor-pointer"
          >
            <CheckCircle className="w-4 h-4 text-slate-950" />
            确认提交 · 等待检测入库
          </button>
        </div>
      </div>

      {/* EXCEL TEXT PASTE DRAWER */}
      {isPasteDrawerOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-xl shadow-2xl relative overflow-hidden text-slate-100">
            <div className="absolute top-0 right-0 w-32 h-32 bg-cyan-400/[0.02] rounded-full blur-2xl"></div>

            <div className="p-5 border-b border-slate-800 flex items-center justify-between">
              <h3 className="font-bold text-slate-100 flex items-center gap-2">
                <FileSpreadsheet className="w-5 h-5 text-emerald-400" />
                <span>从 Excel / 微信消息批量粘贴商品数据</span>
              </h3>
              <button onClick={() => setIsPasteDrawerOpen(false)} className="text-slate-400 hover:text-slate-250">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 space-y-4">
              <div className="p-3 bg-slate-950 rounded border border-slate-850 text-[10px] text-slate-400 font-mono space-y-1 leading-normal">
                <span className="text-cyan-400 font-bold block mb-1">💡 粘贴格式示范：每一行代表一件商品，字段用 逗号 或 TAB（制表符）分隔。进货阶段不录 SN：</span>
                <div>商品名称, 采购价, 预计售价, 备注</div>
                <div className="text-slate-500 block">
                  ASUS ROG 4090, 18000, 19500, 包装箱完好
                  <br />
                  Vulcan 4080S, 8200, 8900, 到货后检测定库位
                </div>
              </div>

              <textarea
                value={pasteContent}
                onChange={e => setPasteContent(e.target.value)}
                placeholder="在此处进行多行粘贴..."
                className="w-full bg-slate-950 border border-slate-850 rounded p-3 h-40 text-xs font-mono text-slate-200 placeholder-slate-600 focus:outline-none focus:border-cyan-500"
              ></textarea>

              <div className="flex justify-end gap-2 text-xs">
                <button
                  type="button"
                  onClick={() => setIsPasteDrawerOpen(false)}
                  className="px-4 py-2 border border-slate-700 rounded font-semibold hover:bg-slate-850"
                >
                  取消
                </button>
                <button
                  type="button"
                  onClick={handlePasteSubmit}
                  className="px-5 py-2 bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-black rounded shadow-[0_0_12px_rgba(6,182,212,0.3)]"
                >
                  批量组装并追加
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
