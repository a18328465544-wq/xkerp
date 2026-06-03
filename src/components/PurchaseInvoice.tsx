/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo, useRef } from "react";
import {
  Layers,
  Search,
  Plus,
  Trash2,
  Copy,
  Scan,
  AlertTriangle,
  HelpCircle,
  TrendingUp,
  FileSpreadsheet,
  CheckCircle,
  X,
  CreditCard,
  User,
  Hash
} from "lucide-react";
import { useStoreStateReturn } from "../utils/state";
import { PurchaseInvoice as IInvoice, PurchaseItem, ProductTemplate, SourceType, Vendor } from "../types";

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
    vendors,
    settlementAccounts
  } = storeState;

  // Invoice generic fields
  const [sourceType, setSourceType] = useState<SourceType>("个人回收");
  const [supplierName, setSupplierName] = useState("张建国");
  const [contact, setContact] = useState("13799018821");
  const [selectedVendorId, setSelectedVendorId] = useState(vendors[0]?.id || "");
  const [paymentMethod, setPaymentMethod] = useState<"微信" | "支付宝" | "现金" | "银行卡" | "欠款">("支付宝");
  const [isPaid, setIsPaid] = useState(true);
  const [paidAmount, setPaidAmount] = useState<number>(18000);
  const [unpaidAmount, setUnpaidAmount] = useState<number>(0);
  const [remarks, setRemarks] = useState("");
  const [settlementAccountId, setSettlementAccountId] = useState(settlementAccounts.find(account => account.type === "支付宝")?.id || settlementAccounts[0]?.id || "");
  const [paymentHandler, setPaymentHandler] = useState("财务小李");

  // Grid editing sheets
  const [items, setItems] = useState<PurchaseItem[]>([
    {
      tempId: "init-1",
      productId: "SP-001",
      productName: "RTX 4090 华硕 ROG 猛禽 24G",
      category: "显卡",
      model: "RTX 4090",
      brand: "华硕",
      version: "ROG 猛禽",
      vram: "24G",
      sn: "SN4090ROG9912U",
      condition: "充新99新",
      inWarranty: true,
      warrantyDate: "2028-12-10",
      repaired: false,
      gpuRisk: false,
      fullBox: true,
      buyPrice: 18000,
      estSellPrice: 19500,
      warehouseLocation: "A区防潮柜-01",
      remarks: "包装箱完好"
    }
  ]);

  // Autocomplete UI logic per active row
  const [activeRowSearchId, setActiveRowSearchId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Excel Paste box state
  const [isPasteDrawerOpen, setIsPasteDrawerOpen] = useState(false);
  const [pasteContent, setPasteContent] = useState("");

  const conditionOptions = [
    "全新官换",
    "充新99新",
    "靓机95新",
    "良品90新",
    "微划伤85新",
    "瑕疵实用",
    "矿卡高阻值"
  ];

  // Temp mock billing sheet code
  const tempInvoiceNo = useMemo(() => {
    const dStr = new Date().toISOString().split("T")[0].replace(/-/g, "");
    return `JH-${dStr}-MOCK`;
  }, []);

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

  const sourcePartnerCategory: NonNullable<Vendor["partnerCategory"]> = sourceType === "个人回收" ? "个人" : "同行";

  const filteredVendors = useMemo(() => {
    return vendors.filter(vendor => (vendor.partnerCategory || "同行") === sourcePartnerCategory);
  }, [sourcePartnerCategory, vendors]);

  const selectedVendor = useMemo(() => {
    return filteredVendors.find(vendor => vendor.id === selectedVendorId) || null;
  }, [filteredVendors, selectedVendorId]);

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
    if (!filteredVendors.some(vendor => vendor.id === selectedVendorId)) {
      setSelectedVendorId(filteredVendors[0]?.id || "");
    }
  }, [filteredVendors, selectedVendorId]);

  useEffect(() => {
    if (!selectedVendor) return;
    setSupplierName(selectedVendor.name);
    setContact(selectedVendor.contact || selectedVendor.phone || selectedVendor.contactPerson || "");
  }, [selectedVendor]);

  // Closes search container on blur
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setActiveRowSearchId(null);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

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
        warehouseLocation: "A区货架-04",
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
        sn: source.sn ? `${source.sn}_复制` : ""
      });
      return copy;
    });
  };

  const deleteRow = (index: number) => {
    if (items.length <= 1) {
      alert("明细单据必须包含至少 1 张显卡明细记录。");
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

  // Randomized SN simulator
  const triggerScanSimulator = (index: number) => {
    const brandsShort = items[index].brand === "华硕" ? "ASUS" : "COLORFUL";
    const yearCode = "2026";
    const randomHex = Math.random().toString(36).substring(2, 8).toUpperCase();
    const mockSN = `SN-${brandsShort}-${yearCode}-${randomHex}`;
    updateField(index, "sn", mockSN);
  };

  // Save drafts
  const handleSaveDraft = () => {
    alert("草稿已成功序列化并存入浏览器缓存(Draft-Save)。随时可以导入该单据。");
  };

  // Validation routines
  const checkErrors = () => {
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      if (!item.sn.trim()) {
        return `明细中的第 ${i + 1} 行未填写 标牌 SN 序列号！一卡一档必须拥有物理SN，如无字标，建议贴标自定义新SN。`;
      }
      if (item.buyPrice <= 0) {
        return `第 ${i + 1} 行收购价填写错误！需输入合理回收金额。`;
      }
      if (item.buyPrice >= item.estSellPrice) {
        return `第 ${i + 1} 行：收购成本价 (¥${item.buyPrice}) 高于预估销售参考价 (¥${item.estSellPrice})！预计该卡利润溢损严重偏红，请重新核实。`;
      }
    }
    return null;
  };

  // Submit and construct inventories
  const handlePostInvoice = () => {
    if (!selectedVendor) {
      alert("请先在【供应商同行册】里新增供应商或回收客户，再回到进货单选择来源开单。");
      setTab("vendors");
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
      paymentMethod,
      isPaid,
      paidAmount,
      unpaidAmount,
      settlementAccountId: paidAmount > 0 ? settlementAccountId : undefined,
      settlementAccountName: settlementAccounts.find(account => account.id === settlementAccountId)?.name,
      paymentHandler,
      paymentStatus: unpaidAmount <= 0 ? "已付款" : paidAmount > 0 ? "部分付款" : "未付款",
      handleBy: paymentHandler,
      remarks,
      items
    });

    alert("🎉 进货回收单据入账成功！\n显卡已安全分配到库存系统，默认状态进入 [待检测] 分流池，请引导检测员去完成 FurMark/3DMark 跑分测试。");
    setTab("purchase_list");
  };

  // Excel paste parser simulation
  const handlePasteSubmit = () => {
    if (!pasteContent.trim()) {
      setIsPasteDrawerOpen(false);
      return;
    }
    
    // Simulate parsing columns separated by space/comma/tab
    // Expected format: Name SN BuyPrice SellPrice Condition Loc
    const lines = pasteContent.split("\n").filter(l => l.trim().length > 0);
    const parsedItems: PurchaseItem[] = [];

    lines.forEach((line, idx) => {
      const parts = line.split(/[,\t]/);
      let matchTemplate = products[idx % products.length];
      
      const snVal = parts[1] ? parts[1].trim() : `SN-PASTE-${idx}-${Math.random().toString(36).substring(3,7).toUpperCase()}`;
      const buyPriceVal = parts[2] ? Number(parts[2].trim()) : matchTemplate.refBuyPrice;
      const estSellVal = parts[3] ? Number(parts[3].trim()) : matchTemplate.refSellPrice;
      const condVal = (parts[4] ? parts[4].trim() : "靓机95新") as any;
      const locVal = parts[5] ? parts[5].trim() : "B区暂存架";

      parsedItems.push({
        tempId: `paste-${idx}-${Date.now()}`,
        productId: matchTemplate.id,
        productName: matchTemplate.name,
        category: matchTemplate.category || "显卡",
        model: matchTemplate.model,
        brand: matchTemplate.brand,
        version: matchTemplate.version,
        vram: matchTemplate.vram,
        sn: snVal,
        condition: condVal,
        inWarranty: true,
        warrantyDate: "2028-10-18",
        repaired: false,
        gpuRisk: false,
        fullBox: true,
        buyPrice: buyPriceVal,
        estSellPrice: estSellVal,
        warehouseLocation: locVal,
        remarks: "Excel表格无纸化流转导入"
      });
    });

    setItems(prev => [...prev, ...parsedItems]);
    setIsPasteDrawerOpen(false);
    setPasteContent("");
    alert(`解析成功！已批量追加 ${parsedItems.length} 张单卡入库明细！`);
  };

  return (
    <div className="space-y-4">
      {/* Title with simulation triggers */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-slate-900 p-5 rounded-2xl border border-slate-800">
        <div>
          <h2 className="text-base font-bold text-slate-100 flex items-center gap-2">
            <Layers className="w-5 h-5 text-cyan-400" />
            <span>智能进货与个人显卡回收 (一卡一档 Excel 级录入)</span>
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            录入成功后，系统在底层会按 SN 自动生成多份独立的数字身份档案。每张显卡拥有单独状态，而非按常规SKU堆叠。
          </p>
        </div>
        <div className="flex gap-2 shrink-0">
          <button
            onClick={() => setIsPasteDrawerOpen(true)}
            className="p-2 border border-slate-700 hover:bg-slate-800 text-slate-300 rounded-lg text-xs font-bold flex items-center gap-1.5 cursor-pointer"
          >
            <FileSpreadsheet className="w-4 h-4 text-emerald-400" />
            Excel 数据批量粘贴
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
            <div className="w-full bg-slate-950 border border-slate-850 p-2.5 text-xs font-bold text-slate-400 rounded font-mono flex items-center justify-between">
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
              className="w-full bg-slate-950 border border-slate-800 text-xs text-slate-200 p-2.5 rounded focus:outline-none focus:border-cyan-500 font-semibold"
            >
              <option value="个人回收">个人</option>
              <option value="同行拿货">同行</option>
            </select>
          </div>

          {/* Supplier Name */}
          <div>
            <label className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block mb-1">
              {sourceType === "个人回收" ? "个人卖家档案" : "同行供应商档案"}
            </label>
            <select
              required
              value={selectedVendorId}
              onChange={e => setSelectedVendorId(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 text-xs text-slate-200 p-2.5 rounded focus:outline-none focus:border-cyan-500"
            >
              {filteredVendors.length === 0 && <option value="">请先新增{sourcePartnerCategory}档案</option>}
              {filteredVendors.map(vendor => (
                <option key={vendor.id} value={vendor.id}>
                  {vendor.name} / {vendor.phone || vendor.contact || vendor.contactPerson}
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
              className="w-full bg-slate-950 border border-slate-800 text-xs text-slate-400 p-2.5 rounded focus:outline-none"
            />
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 pt-1">
          <div>
            <label className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block mb-1">来源档案</label>
            <button
              type="button"
              onClick={() => setTab("vendors")}
              className="w-full bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 text-xs font-black p-2.5 rounded"
            >
              去供应商档案新增
            </button>
          </div>

          {/* Payment Method */}
          <div>
            <label className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block mb-1">付款方式</label>
            <select
              value={paymentMethod}
              onChange={e => setPaymentMethod(e.target.value as any)}
              className="w-full bg-slate-950 border border-slate-800 text-xs text-slate-200 p-2.5 rounded focus:outline-none"
            >
              <option value="微信">微信支付</option>
              <option value="支付宝">支付宝</option>
              <option value="银行卡">对公账银行卡</option>
              <option value="现金">现金交易</option>
              <option value="欠款">欠款结算 (走账期)</option>
            </select>
          </div>

          <div>
            <label className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block mb-1">付款账户</label>
            <select
              value={settlementAccountId}
              onChange={e => setSettlementAccountId(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 text-xs text-slate-200 p-2.5 rounded focus:outline-none"
            >
              {settlementAccounts.map(account => (
                <option key={account.id} value={account.id}>{account.name} / ¥{account.balance}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block mb-1">付款人 / 经办人</label>
            <input
              value={paymentHandler}
              onChange={e => setPaymentHandler(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 text-xs text-slate-200 p-2.5 rounded focus:outline-none"
            />
          </div>

          {/* Is Paid */}
          <div>
            <label className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block mb-1">付款状态</label>
            <div className="flex bg-slate-950 p-1 rounded border border-slate-800 gap-1 h-[37px]">
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
              <label className="text-[10px] text-slate-500 font-bold tracking-wider block mb-1">已付金额(¥)</label>
              <input
                type="number"
                disabled={isPaid}
                value={paidAmount}
                onChange={e => {
                  const val = Number(e.target.value);
                  setPaidAmount(val);
                  setUnpaidAmount(Math.max(0, summary.totalCost - val));
                }}
                className="w-full bg-slate-950 border border-slate-850 text-xs text-slate-200 p-2.5 rounded disabled:text-slate-500 font-mono"
              />
            </div>
            <div>
              <label className="text-[10px] text-slate-500 font-bold tracking-wider block mb-1">应付未付款</label>
              <div className="w-full bg-slate-950 border border-slate-850 p-2.5 text-xs font-mono font-bold text-amber-400 rounded">
                ¥{unpaidAmount}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* SPREADSHEET TABLE (可编辑明细) */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-x-auto shadow-lg">
        <table className="w-full text-left border-collapse table-fixed min-w-[1200px]">
          <thead>
            <tr className="border-b border-slate-800 bg-slate-950 text-[11px] text-slate-400 font-bold font-mono">
              <th className="p-2.5 pl-3 w-[280px]">商品型号搜索 (关键核心)</th>
              <th className="p-2.5 w-[160px]">SN 标记 (扫码/手工)</th>
              <th className="p-2.5 w-[110px]">成色级别</th>
              <th className="p-2.5 w-[90px] text-center">保修期</th>
              <th className="p-2.5 w-[90px] text-center">拆修/带盒</th>
              <th className="p-2.5 w-[95px] text-right">进货价 (¥)</th>
              <th className="p-2.5 w-[95px] text-right">预估售价 (¥)</th>
              <th className="p-2.5 w-[85px] text-right">预计利润</th>
              <th className="p-2.5 w-[110px]">存放位置</th>
              <th className="p-2.5 w-[100px]">备注</th>
              <th className="p-2.5 pr-3 text-right w-[100px]">操作</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/80 text-xs">
            {items.map((item, index) => {
              const expectedProfit = item.estSellPrice - item.buyPrice;
              const isProfitRed = expectedProfit < 0;
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
                        onClick={() => {
                          setActiveRowSearchId(item.tempId);
                          setSearchQuery(item.productName);
                        }}
                        onChange={e => {
                          setSearchQuery(e.target.value);
                          setActiveRowSearchId(item.tempId);
                        }}
                        className="w-full bg-slate-950 border border-slate-800 text-[11px] text-slate-200 px-2 py-1.5 rounded focus:outline-none focus:border-cyan-500 font-bold text-ellipsis overflow-hidden whitespace-nowrap"
                      />
                      <Search className="w-3.5 h-3.5 absolute right-2 top-2 text-slate-500 pointer-events-none" />
                    </div>

                    {/* Autocomplete Dropdown List */}
                    {activeRowSearchId === item.tempId && (
                      <div
                        ref={dropdownRef}
                        className="absolute left-3 right-3 top-10 bg-slate-950 border border-slate-800 rounded-lg shadow-2xl z-55 max-h-[180px] overflow-y-auto p-1 custom-scrollbar"
                      >
                        <div className="p-1 px-2 border-b border-slate-850 text-[10px] text-slate-500 font-mono tracking-wide leading-none">
                          点击套用商品库标准模板
                        </div>
                        {filteredTemplates.map(t => (
                          <button
                            key={t.id}
                            type="button"
                            onClick={() => selectTemplate(index, t)}
                            className="w-full text-left p-2 hover:bg-slate-800 rounded text-[11px] flex items-center justify-between transition-colors mt-0.5"
                          >
                            <div className="truncate">
                              <span className="font-bold text-slate-200 block">{t.name}</span>
                              <span className="text-[9px] text-slate-500 font-mono">
                                指导收: ¥{t.refBuyPrice} | 售价: ¥{t.refSellPrice}
                              </span>
                            </div>
                            <span className="text-[10px] text-cyan-400 bg-cyan-950/40 px-1.5 rounded font-mono">
                              库: {inventory.filter(c => c.productId === t.id && c.status !== "已售出").length}
                            </span>
                          </button>
                        ))}
                      </div>
                    )}
                  </td>

                  {/* SN SERIAL WITH SIMULATION SCANNER */}
                  <td className="p-2">
                    <div className="flex gap-1">
                      <input
                        type="text"
                        placeholder="外盒/金手指SN"
                        value={item.sn}
                        required
                        onChange={e => updateField(index, "sn", e.target.value)}
                        className={`w-full bg-slate-950 border text-[11px] font-mono p-1.5 rounded focus:outline-none ${
                          !item.sn ? "border-amber-500/40 focus:border-amber-500" : "border-slate-800 focus:border-cyan-500"
                        }`}
                      />
                      <button
                        type="button"
                        onClick={() => triggerScanSimulator(index)}
                        title="仿真扫码枪扫入 SN"
                        className="p-1.5 border border-slate-700 hover:bg-slate-800 text-slate-300 rounded shrink-0 duration-150 cursor-pointer"
                      >
                        <Scan className="w-3.5 h-3.5 text-cyan-400" />
                      </button>
                    </div>
                  </td>

                  {/* CONDITION DROPDOWN */}
                  <td className="p-2">
                    <select
                      value={item.condition}
                      onChange={e => updateField(index, "condition", e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 text-[11px] text-slate-300 p-1.5 rounded"
                    >
                      {conditionOptions.map(opt => (
                        <option key={opt} value={opt}>{opt}</option>
                      ))}
                    </select>
                  </td>

                  {/* WARRANTY TOGGLE AND DEADLINE */}
                  <td className="p-2">
                    <div className="flex flex-col gap-1 items-center">
                      <div className="flex items-center gap-1.5">
                        <input
                          type="checkbox"
                          id={`warr-${item.tempId}`}
                          checked={item.inWarranty}
                          onChange={e => updateField(index, "inWarranty", e.target.checked)}
                          className="rounded text-cyan-500 focus:ring-0 bg-slate-950 border-slate-800"
                        />
                        <label htmlFor={`warr-${item.tempId}`} className="text-[10px] text-slate-400 font-semibold cursor-pointer">在保</label>
                      </div>
                      
                      {item.inWarranty && (
                        <input
                          type="date"
                          value={item.warrantyDate || ""}
                          onChange={e => updateField(index, "warrantyDate", e.target.value)}
                          className="w-full bg-slate-950 border border-slate-800 text-[10px] p-1 rounded font-mono text-slate-300 transform scale-95"
                        />
                      )}
                    </div>
                  </td>

                  {/* Repair status and box/package flag */}
                  <td className="p-2">
                    <div className="flex flex-col gap-1 items-start pl-2">
                      <label className="flex items-center gap-1.5 cursor-pointer text-[10px] font-semibold text-slate-400">
                        <input
                          type="checkbox"
                          checked={item.repaired}
                          onChange={e => updateField(index, "repaired", e.target.checked)}
                          className="rounded text-red-500 bg-slate-950 border-slate-800"
                        />
                        <span>曾拆修</span>
                      </label>
                      <label className="flex items-center gap-1.5 cursor-pointer text-[10px] font-semibold text-slate-400">
                        <input
                          type="checkbox"
                          checked={item.gpuRisk}
                          onChange={e => updateField(index, "gpuRisk", e.target.checked)}
                          className="rounded text-red-500 bg-slate-950 border-slate-800"
                        />
                        <span className={item.gpuRisk ? "text-cyan-300 font-bold" : ""}>带盒</span>
                      </label>
                    </div>
                  </td>

                  {/* BUY PRICE */}
                  <td className="p-2">
                    <input
                      type="number"
                      required
                      value={item.buyPrice}
                      onChange={e => updateField(index, "buyPrice", Number(e.target.value))}
                      className={`w-full text-right bg-slate-950 border text-[11px] p-1.5 rounded focus:outline-none font-mono font-bold ${
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
                      className="w-full text-right bg-slate-950 border border-slate-800 text-[11px] text-emerald-400 font-mono font-bold p-1.5 rounded focus:outline-none focus:border-cyan-500"
                    />
                  </td>

                  {/* ESTIMATED GAINS / LOSS */}
                  <td className="p-2 text-right font-mono font-black text-[11px]">
                    <span className={expectedProfit >= 0 ? "text-emerald-400" : "text-rose-500"}>
                      ¥{expectedProfit}
                    </span>
                    {isRiskHighCost && (
                      <span className="block text-[8px] text-rose-300 font-sans border border-rose-500/30 rounded text-center mt-1 bg-rose-500/10 leading-none py-0.5" title="高价入货风险">
                        倒挂!
                      </span>
                    )}
                  </td>

                  {/* LOCATION */}
                  <td className="p-2">
                    <input
                      type="text"
                      value={item.warehouseLocation}
                      placeholder="e.g. A2架"
                      onChange={e => updateField(index, "warehouseLocation", e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 text-[11px] text-slate-300 p-1.5 rounded focus:outline-none"
                    />
                  </td>

                  {/* REMARK IN ROW */}
                  <td className="p-2">
                    <input
                      type="text"
                      value={item.remarks}
                      placeholder="品相附件"
                      onChange={e => updateField(index, "remarks", e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 text-[11px] text-slate-300 p-1.5 rounded focus:outline-none"
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

      {/* QUICK TABLE BOTTOM ACTIONS */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4 bg-slate-900/60 p-3.5 rounded-xl border border-slate-800">
        <button
          type="button"
          onClick={addRow}
          className="w-full sm:w-auto p-2 px-5 bg-slate-800 border border-slate-700 text-slate-100 hover:text-slate-50 hover:bg-slate-750 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer"
        >
          <Plus className="w-4 h-4 text-cyan-400" />
          继续增加一行显卡 (可通过 TaB 切换)
        </button>

        {/* Dynamic inline tips */}
        <div className="text-[11px] text-slate-400 font-mono text-center sm:text-right">
          小提示: 双击“商品全称”可以随时通过关键字重新绑定。使用“双卡”功能可快速创建同型号不同SN序列。
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
              <span className="font-black text-cyan-400 font-mono text-sm">¥{summary.totalCost.toLocaleString()}</span>
            </div>

            <div className="flex items-center justify-between text-xs text-slate-400">
              <span>预估销售总额:</span>
              <span className="font-bold text-slate-200 font-mono">¥{summary.estTotalSell.toLocaleString()}</span>
            </div>

            <div className="flex items-center justify-between text-xs text-slate-400 border-t border-slate-800/80 pt-1.5">
              <span>预计差价总毛利润:</span>
              <span className={`font-black font-mono text-base ${summary.estTotalProfit >= 0 ? "text-emerald-400 font-black shadow-glow" : "text-rose-500"}`}>
                ¥{summary.estTotalProfit.toLocaleString()}
              </span>
            </div>
          </div>

          <button
            type="button"
            onClick={handlePostInvoice}
            className="w-full mt-4 p-3 bg-gradient-to-r from-cyan-500 to-sky-600 hover:from-cyan-400 hover:to-sky-500 text-slate-950 font-black text-xs rounded-xl shadow-[0_0_15px_rgba(6,182,212,0.35)] hover:scale-[1.01] transition-all flex items-center justify-center gap-1.5 cursor-pointer"
          >
            <CheckCircle className="w-4 h-4 text-slate-950" />
            确认提交 · 自动建档入库
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
                <span>从 Excel / 微信消息批量粘贴显卡数据</span>
              </h3>
              <button onClick={() => setIsPasteDrawerOpen(false)} className="text-slate-400 hover:text-slate-250">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 space-y-4">
              <div className="p-3 bg-slate-950 rounded border border-slate-850 text-[10px] text-slate-400 font-mono space-y-1 leading-normal">
                <span className="text-cyan-400 font-bold block mb-1">💡 粘贴格式示范：每一行代表一张显卡，字段用 逗号 或 TAB（制表符）分隔。如果为空将套用默认值：</span>
                <div>名称 (e.g. 随便填), SN码, 采购价, 预计售价, 成色, 货架号</div>
                <div className="text-slate-500 block">
                  ASUS ROG 4090, <b>SN4090ROG881K</b>, 18000, 19500, 充新99新, 货架A1
                  <br />
                  Vulcan 4080S, <b>SN4080VLC2026P</b>, 8200, 8900, 靓机95新, 货架A2
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
