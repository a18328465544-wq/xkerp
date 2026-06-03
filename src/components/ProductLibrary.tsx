/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo } from "react";
import {
  Cpu,
  Search,
  Plus,
  Download,
  Upload,
  BookmarkCheck,
  Hash,
  X,
  Layers,
  Sparkles,
  Database
} from "lucide-react";
import { useStoreStateReturn } from "../utils/state";
import { ProductTemplate, ProductCategory } from "../types";

interface ProductLibraryProps {
  storeState: useStoreStateReturn;
}

const CATEGORIES: ProductCategory[] = [
  "显卡",
  "CPU",
  "主板",
  "内存",
  "硬盘",
  "电源",
  "散热",
  "机箱",
  "整机",
  "其他配件"
];

const getCategoryBadgeClass = (category: string) => {
  switch (category) {
    case "显卡":
      return "bg-purple-500/10 text-purple-400 border border-purple-800/30";
    case "CPU":
      return "bg-cyan-500/10 text-cyan-400 border border-cyan-800/30";
    case "主板":
      return "bg-indigo-500/10 text-indigo-400 border border-indigo-800/30";
    case "内存":
      return "bg-amber-500/10 text-amber-400 border border-amber-800/30";
    case "硬盘":
      return "bg-emerald-500/10 text-emerald-400 border border-emerald-800/30";
    case "电源":
      return "bg-red-500/10 text-red-400 border border-red-800/30";
    case "散热":
      return "bg-pink-500/10 text-pink-400 border border-pink-800/30";
    case "机箱":
      return "bg-sky-500/10 text-sky-400 border border-sky-850/30";
    case "整机":
      return "bg-yellow-500/10 text-yellow-400 border border-yellow-800/30";
    default:
      return "bg-slate-500/10 text-slate-400 border border-slate-800/30";
  }
};

export default function ProductLibrary({ storeState }: ProductLibraryProps) {
  const {
    products,
    inventory,
    addProductTemplate,
    updateProductTemplate,
    deleteProductTemplate,
    permissions
  } = storeState;

  const [search, setSearch] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [selectedBrand, setSelectedBrand] = useState<string>("all");
  const [selectedVram, setSelectedVram] = useState<string>("all");
  
  // Dialog States
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<ProductTemplate | null>(null);

  // Form Fields
  const [formCategory, setFormCategory] = useState<ProductCategory>("显卡");
  const [formName, setFormName] = useState("");
  const [formModel, setFormModel] = useState("RTX 4090");
  const [formBrand, setFormBrand] = useState("华硕");
  const [formVersion, setFormVersion] = useState("ROG 猛禽");
  const [formVram, setFormVram] = useState("24G");
  const [formBuy, setFormBuy] = useState(18000);
  const [formSell, setFormSell] = useState(19500);
  const [formRemarks, setFormRemarks] = useState("");

  // Dynamically compute brands found in products to avoid hardcoding dropdown options
  const brandList = useMemo(() => {
    const brandsSet = new Set<string>();
    products.forEach(p => {
      if (p.brand) brandsSet.add(p.brand);
    });
    // Fallback standard brands for faster typing
    ["华硕", "七彩虹", "微星", "影驰", "蓝宝石", "Intel", "AMD", "芝奇", "三星", "海韵", "微星", "技嘉", "致态", "美商海盗船"].forEach(b => brandsSet.add(b));
    return ["all", ...Array.from(brandsSet)];
  }, [products]);

  const vramList = ["all", "32G", "24G", "16G", "12G", "10G", "8G", "6G", "8核16线程", "24核32线程", "2TB M.2", "1TB M.2", "1000W", "850W"];

  // Match inventory stock count and history on the fly
  const dynamicProducts = useMemo(() => {
    return products.map(p => {
      // Find actual physical in-stock count
      const inStockCount = inventory.filter(
        c => c.productId === p.id && c.status !== "已售出" && c.status !== "已退货" && c.status !== "已报废"
      ).length;

      // Find real last buy/sell history of this match
      const relatedCards = inventory.filter(c => c.productId === p.id);
      const buyHistory = relatedCards.filter(c => c.costPrice > 0);
      const sellHistory = relatedCards.filter(c => c.salesPrice && c.salesPrice > 0);

      const lastBuyPrice = buyHistory.length > 0 ? buyHistory[buyHistory.length - 1].costPrice : p.lastBuyPrice;
      const lastSellPrice = sellHistory.length > 0 ? sellHistory[sellHistory.length - 1].salesPrice : p.lastSellPrice;
      const lastDealTime = relatedCards.length > 0 ? relatedCards[relatedCards.length - 1].entryTime : p.lastDealTime;

      return {
        ...p,
        currentStock: inStockCount,
        lastBuyPrice,
        lastSellPrice,
        lastDealTime
      };
    });
  }, [products, inventory]);

  // Filters
  const filteredProducts = useMemo(() => {
    return dynamicProducts.filter(p => {
      const itemCategory = p.category || "显卡";
      const matchesSearch =
        p.name.toLowerCase().includes(search.toLowerCase()) ||
        p.model.toLowerCase().includes(search.toLowerCase()) ||
        p.brand.toLowerCase().includes(search.toLowerCase()) ||
        p.version.toLowerCase().includes(search.toLowerCase());

      const matchesCategory = selectedCategory === "all" || itemCategory === selectedCategory;
      const matchesBrand = selectedBrand === "all" || p.brand === selectedBrand;
      const matchesVram = selectedVram === "all" || p.vram === selectedVram;

      return matchesSearch && matchesCategory && matchesBrand && matchesVram;
    });
  }, [dynamicProducts, search, selectedCategory, selectedBrand, selectedVram]);

  const openAddModal = () => {
    setEditingProduct(null);
    setFormCategory("显卡");
    setFormName("");
    setFormModel("RTX 4095");
    setFormBrand("华硕");
    setFormVersion("ROG 猛禽");
    setFormVram("24G");
    setFormBuy(18000);
    setFormSell(19500);
    setFormRemarks("");
    setIsFormOpen(true);
  };

  const openEditModal = (p: ProductTemplate) => {
    setEditingProduct(p);
    setFormCategory(p.category || "显卡");
    setFormName(p.name);
    setFormModel(p.model);
    setFormBrand(p.brand);
    setFormVersion(p.version);
    setFormVram(p.vram);
    setFormBuy(p.refBuyPrice);
    setFormSell(p.refSellPrice);
    setFormRemarks(p.remarks || "");
    setIsFormOpen(true);
  };

  const handleCategoryChangeInForm = (category: ProductCategory) => {
    setFormCategory(category);
    // Suggest templates parameters to speed up user typing
    if (category === "CPU") {
      setFormBrand("Intel");
      setFormModel("Core i7-14700K");
      setFormVersion("盒装");
      setFormVram("20核28线程");
      setFormBuy(2400);
      setFormSell(2750);
    } else if (category === "主板") {
      setFormBrand("华硕");
      setFormModel("B760M-PLUS 重炮手");
      setFormVersion("WIFI D5版");
      setFormVram("LGA1700 ATX");
      setFormBuy(800);
      setFormSell(980);
    } else if (category === "内存") {
      setFormBrand("芝奇");
      setFormModel("DDR5 6000 32G");
      setFormVersion("幻锋戟套条");
      setFormVram("32G (16Gx2)");
      setFormBuy(650);
      setFormSell(760);
    } else if (category === "硬盘") {
      setFormBrand("三星");
      setFormModel("990 PRO");
      setFormVersion("M.2高速NVMe");
      setFormVram("2TB");
      setFormBuy(920);
      setFormSell(1150);
    } else if (category === "电源") {
      setFormBrand("海韵");
      setFormModel("FOCUS GX-850");
      setFormVersion("ATX3.0全模金牌");
      setFormVram("850W");
      setFormBuy(650);
      setFormSell(780);
    } else if (category === "显卡") {
      setFormBrand("华硕");
      setFormModel("RTX 4070 SUPER");
      setFormVersion("ROG 猛禽");
      setFormVram("12G");
      setFormBuy(4800);
      setFormSell(5350);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const finalName = formName.trim() || `${formBrand} ${formModel} ${formVersion} ${formVram}`;
    
    if (editingProduct) {
      updateProductTemplate({
        ...editingProduct,
        name: finalName,
        category: formCategory,
        model: formModel,
        brand: formBrand,
        version: formVersion,
        vram: formVram,
        refBuyPrice: Number(formBuy),
        refSellPrice: Number(formSell),
        remarks: formRemarks
      });
    } else {
      addProductTemplate({
        name: finalName,
        category: formCategory,
        model: formModel,
        brand: formBrand,
        version: formVersion,
        vram: formVram,
        refBuyPrice: Number(formBuy),
        refSellPrice: Number(formSell),
        remarks: formRemarks
      });
    }
    setIsFormOpen(false);
  };

  const handleExImportSimulation = () => {
    const fileInput = document.createElement("input");
    fileInput.type = "file";
    fileInput.accept = ".xlsx, .xls, .csv";
    fileInput.onchange = () => {
      addProductTemplate({
        name: "Intel Core i5-14600KF 盒装 CPU",
        category: "CPU",
        model: "i5-14600KF",
        brand: "Intel",
        version: "盒装",
        vram: "14核20线程",
        refBuyPrice: 1650,
        refSellPrice: 1850,
        remarks: "Excel批量导入测试配件，高周转CPU型号"
      });
      alert("批量导入成功！已成功从 Excel 解析并追加 1 款 Intel Core i5 处理器配件模板。");
    };
    fileInput.click();
  };

  const handleExportCSV = () => {
    const headers = "商品ID,分类,商品名称,核心型号,品牌,版本/系列,规格参数(显存/容量/功率),参考回收价,参考销售价,在库数\n";
    const rows = products.map(p => 
      `"${p.id}","${p.category || "显卡"}","${p.name}","${p.model}","${p.brand}","${p.version}","${p.vram}",${p.refBuyPrice},${p.refSellPrice},${p.currentStock}`
    ).join("\n");
    const blob = new Blob([new Uint8Array([0xEF, 0xBB, 0xBF]), headers + rows], { type: "text/csv;charset=utf-8;" }); // Support Excel Chinese characters
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.setAttribute("download", `精诚配件与显卡商品库_${new Date().toISOString().split('T')[0]}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Helper label based on active category
  const getVramInputLabel = (category: string) => {
    switch (category) {
      case "显卡":
        return "显存容量 (如 16G, 24G)";
      case "CPU":
        return "核心规格 (如 24核32线程)";
      case "内存":
        return "容量频率 (如 32G 6000MHz)";
      case "硬盘":
        return "容量类型 (如 2TB NVMe M.2)";
      case "电源":
        return "额定功率 (如 1000W / 850W)";
      case "散热":
        return "散热规格 (如 360水冷 / 双排风)";
      default:
        return "关键参数 (如 规格/容量/功率)";
    }
  };

  return (
    <div className="space-y-4">
      {/* Title block */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-slate-900 p-5 rounded-2xl border border-slate-800">
        <div>
          <h2 className="text-base font-bold text-slate-100 flex items-center gap-2">
            <Database className="w-5 h-5 text-cyan-400" />
            <span>全品类通用商品配件库</span>
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            包含显卡、CPU、主板、硬盘、内存、电源等关键装机配件的标准模板库。创建进货回收采购单时，可智能查找及套用，规范账目并防止拼写错误。
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={handleExImportSimulation}
            className="p-2 border border-slate-700 hover:bg-slate-800 text-slate-300 rounded-lg text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
          >
            <Upload className="w-3.5 h-3.5 text-slate-400" />
            Excel 导入
          </button>
          <button
            onClick={handleExportCSV}
            className="p-2 border border-slate-700 hover:bg-slate-800 text-slate-300 rounded-lg text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
          >
            <Download className="w-3.5 h-3.5 text-slate-400" />
            导出商品表
          </button>
          <button
            onClick={openAddModal}
            className="p-2 bg-auto bg-cyan-500 hover:bg-cyan-400 text-slate-950 rounded-lg text-xs font-extrabold flex items-center gap-1.5 shadow-[0_0_12px_rgba(6,182,212,0.3)] cursor-pointer"
          >
            <Plus className="w-4 h-4 text-slate-950" />
            新建商品模板
          </button>
        </div>
      </div>

      {/* FILTER PANEL */}
      <div className="bg-slate-900 p-4 rounded-xl border border-slate-800 grid grid-cols-1 md:grid-cols-5 gap-4">
        {/* Search */}
        <div className="relative md:col-span-2">
          <Search className="w-4 h-4 absolute left-3 top-3 text-slate-500" />
          <input
            type="text"
            placeholder="搜索商品全称/芯片核心型号/品牌/系列版本..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full bg-slate-950 border border-slate-800 text-xs text-slate-200 placeholder-slate-500 pl-9 pr-3 py-2.5 rounded-lg focus:outline-none focus:border-cyan-500 transition-colors"
          />
        </div>

        {/* Category selection */}
        <div>
          <select
            value={selectedCategory}
            onChange={e => setSelectedCategory(e.target.value)}
            className="w-full bg-slate-950 border border-slate-800 text-xs text-slate-300 px-3 py-2.5 rounded-lg focus:outline-none focus:border-cyan-500 cursor-pointer text-slate-200"
          >
            <option value="all">所有零配件品类（全部）</option>
            {CATEGORIES.map(category => (
              <option key={category} value={category}>{category}</option>
            ))}
          </select>
        </div>

        {/* Brand selection */}
        <div>
          <select
            value={selectedBrand}
            onChange={e => setSelectedBrand(e.target.value)}
            className="w-full bg-slate-950 border border-slate-800 text-xs text-slate-300 px-3 py-2.5 rounded-lg focus:outline-none focus:border-cyan-500 cursor-pointer text-slate-200"
          >
            <option value="all">所有生产品牌 (全部)</option>
            {brandList.slice(1).map(brand => (
              <option key={brand} value={brand}>{brand}</option>
            ))}
          </select>
        </div>

        {/* Statistical feedback label */}
        <div className="flex items-center justify-center font-mono text-[11px] text-slate-300 font-bold bg-slate-950 px-3 rounded-lg border border-slate-850">
          已筛出 {filteredProducts.length} 款零配件规格
        </div>
      </div>

      {/* LIST TABLE SHEET */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-x-auto shadow-md">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="border-b border-slate-800 bg-slate-950 text-[11px] text-slate-400 font-bold uppercase tracking-wider font-mono">
              <th className="p-3.5 pl-5">配件ID & 类别</th>
              <th className="p-3.5">商品名称 & 规格说明</th>
              <th className="p-3.5">品牌款式/核心型号</th>
              <th className="p-3.5 text-right">参考回收官价</th>
              <th className="p-3.5 text-right">参考出货定价</th>
              <th className="p-3.5 text-center">当期在库</th>
              <th className="p-3.5 text-right">近期收/售价</th>
              <th className="p-3.5">最后交易日</th>
              <th className="p-3.5 text-right pr-5">操作</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/60 text-xs">
            {filteredProducts.length === 0 ? (
              <tr>
                <td colSpan={9} className="p-10 text-center text-slate-500 font-medium">
                  没有匹配的硬核配件模板。您可以点击“新建商品模板”快速开始配置。
                </td>
              </tr>
            ) : (
              filteredProducts.map(p => (
                <tr key={p.id} className="hover:bg-slate-850/40 transition-colors">
                  {/* Category & ID */}
                  <td className="p-3.5 pl-5 font-mono">
                    <div className="text-[10px] text-slate-500 font-bold flex items-center gap-1">
                      <Hash className="w-3 h-3 text-cyan-500" />
                      <span>{p.id}</span>
                    </div>
                    <div className="mt-1">
                      <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-extrabold font-sans leading-none ${getCategoryBadgeClass(p.category || "显卡")}`}>
                        {p.category || "显卡"}
                      </span>
                    </div>
                  </td>

                  {/* Product full name & Spec */}
                  <td className="p-3.5">
                    <div className="font-bold text-slate-200">{p.name}</div>
                    {p.remarks && (
                      <div className="text-[10px] text-slate-500 italic mt-0.5 truncate max-w-[280px]" title={p.remarks}>
                        {p.remarks}
                      </div>
                    )}
                  </td>

                  {/* Brand & Model SPEC */}
                  <td className="p-3.5 font-mono space-y-0.5">
                    <div className="text-slate-200 font-bold">{p.brand} · {p.model}</div>
                    <div className="text-[10px] text-slate-400">
                      系列: {p.version} | 规格: <span className="text-cyan-400 font-bold">{p.vram}</span>
                    </div>
                  </td>

                  {/* Prices */}
                  <td className="p-3.5 text-right text-cyan-400 font-bold font-mono">
                    ¥{p.refBuyPrice.toLocaleString()}
                  </td>
                  <td className="p-3.5 text-right text-emerald-400 font-bold font-mono">
                    ¥{p.refSellPrice.toLocaleString()}
                  </td>

                  {/* Stock count */}
                  <td className="p-3.5 text-center">
                    <span className={`inline-block px-2.5 py-0.5 rounded-full font-mono font-bold text-[10px] ${
                      p.currentStock > 0 ? "bg-cyan-950 text-cyan-400 border border-cyan-800/60" : "bg-slate-800 text-slate-500"
                    }`}>
                      {p.currentStock} 件
                    </span>
                  </td>

                  {/* Dynamic Last Transactions */}
                  <td className="p-3.5 text-right font-mono text-[11px] space-y-0.5">
                    {permissions.showCost ? (
                      <div className="text-slate-300">收: ¥{(p.lastBuyPrice || p.refBuyPrice).toLocaleString()}</div>
                    ) : (
                      <div className="text-slate-600">收: 隐藏</div>
                    )}
                    <div className="text-emerald-400 font-semibold">售: ¥{(p.lastSellPrice || p.refSellPrice).toLocaleString()}</div>
                  </td>

                  {/* Last Deal Date */}
                  <td className="p-3.5 text-slate-400 font-mono text-[10px]">
                    {p.lastDealTime || "暂无最新交易"}
                  </td>

                  {/* Actions */}
                  <td className="p-3.5 text-right pr-5 whitespace-nowrap">
                    <button
                      onClick={() => openEditModal(p)}
                      className="p-1 px-2.5 text-[11px] font-bold border border-slate-700 text-slate-300 rounded hover:bg-slate-800 hover:text-slate-100 mr-1.5 transition-colors cursor-pointer"
                    >
                      编辑
                    </button>
                    {permissions.canDelete && (
                      <button
                        onClick={() => {
                          if (confirm(`确认要从标样库中永久删除商品模板 [${p.name}] 吗？`)) {
                            deleteProductTemplate(p.id);
                          }
                        }}
                        className="p-1 px-2.5 text-[11px] font-bold border border-rose-950 text-rose-400 rounded hover:bg-rose-500/10 hover:text-rose-300 transition-colors cursor-pointer"
                      >
                        删除
                      </button>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* ADD/EDIT TEMPLATE MODAL */}
      {isFormOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-lg shadow-2xl relative overflow-hidden text-slate-100">
            <div className="absolute top-0 right-0 w-32 h-32 bg-cyan-500/5 rounded-full blur-2xl pointer-events-none"></div>
            
            {/* Modal Header */}
            <div className="p-5 border-b border-slate-800 flex items-center justify-between">
              <h3 className="font-bold text-slate-100 flex items-center gap-2">
                <BookmarkCheck className="w-5 h-5 text-cyan-400" />
                <span>{editingProduct ? `编辑 [${formCategory}] 商品模板` : "新建零配件规格模板"}</span>
              </h3>
              <button onClick={() => setIsFormOpen(false)} className="text-slate-400 hover:text-slate-200">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Form */}
            <form onSubmit={handleSubmit} className="p-5 space-y-4">
              {/* Product Category dropdown */}
              <div>
                <label className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block mb-1">零配件类别 / 品类</label>
                <div className="grid grid-cols-5 gap-2">
                  {CATEGORIES.map(category => (
                    <button
                      key={category}
                      type="button"
                      onClick={() => handleCategoryChangeInForm(category)}
                      className={`text-[11px] py-1.5 rounded-lg border font-bold transition-all cursor-pointer ${
                        formCategory === category
                          ? "bg-cyan-500 text-slate-950 border-cyan-500 shadow-[0_0_8px_rgba(6,182,212,0.2)]"
                          : "bg-slate-950 border-slate-850 hover:bg-slate-800 text-slate-300"
                      }`}
                    >
                      {category}
                    </button>
                  ))}
                </div>
              </div>

              {/* Brand and Model line */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block mb-1">生产厂商 / 品牌</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. 华硕, Intel, AMD, 芝奇"
                    value={formBrand}
                    onChange={e => setFormBrand(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 text-xs text-slate-200 p-2.5 rounded focus:outline-none focus:border-cyan-500 font-bold"
                  />
                </div>
                <div>
                  <label className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block mb-1">芯片 / 核心型号</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Core i9-14900K, RTX 4070 SUPER"
                    value={formModel}
                    onChange={e => setFormModel(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 text-xs text-slate-200 p-2.5 rounded focus:outline-none focus:border-cyan-500 font-mono"
                  />
                </div>
              </div>

              {/* Version and Vram line */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block mb-1">具体款型/版本系列 (e.g. 猛禽, 盒装)</label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. STRIX 吹雪 / 官方盒装"
                    value={formVersion}
                    onChange={e => setFormVersion(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 text-xs text-slate-200 p-2.5 rounded focus:outline-none focus:border-cyan-500"
                  />
                </div>
                <div>
                  <label className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block mb-1">
                    {getVramInputLabel(formCategory)}
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. 16G, 32G (16Gx2), 1000W"
                    value={formVram}
                    onChange={e => setFormVram(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 text-xs text-slate-200 p-2.5 rounded focus:outline-none focus:border-cyan-500 font-mono font-bold text-cyan-400"
                  />
                </div>
              </div>

              {/* Autogenerated full name block */}
              <div>
                <label className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block mb-1">生成的标准商品全称</label>
                <div className="w-full bg-slate-950 border border-slate-850 p-2.5 text-xs font-black text-cyan-300 rounded font-mono">
                  {formBrand} {formModel} {formVersion} {formVram}
                </div>
              </div>

              {/* Guides buy and sell */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block mb-1">参考建议回收买入价 (¥)</label>
                  <input
                    type="number"
                    required
                    value={formBuy}
                    onChange={e => setFormBuy(Number(e.target.value))}
                    className="w-full bg-slate-950 border border-slate-800 text-xs text-slate-200 p-2.5 rounded focus:outline-none focus:border-cyan-500 font-mono font-bold"
                  />
                </div>
                <div>
                  <label className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block mb-1">参考建议销售卖出价 (¥)</label>
                  <input
                    type="number"
                    required
                    value={formSell}
                    onChange={e => setFormSell(Number(e.target.value))}
                    className="w-full bg-slate-950 border border-slate-800 text-xs text-slate-200 p-2.5 rounded focus:outline-none focus:border-cyan-500 font-mono font-bold"
                  />
                </div>
              </div>

              {/* Remarks */}
              <div>
                <label className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block mb-1">回收/质检核心备注说明</label>
                <textarea
                  value={formRemarks}
                  onChange={e => setFormRemarks(e.target.value)}
                  placeholder="请输入该类硬核零配件的回收注意事项、防调包暗记指引，或通电性能测试合格标准..."
                  className="w-full bg-slate-950 border border-slate-800 text-xs text-slate-200 p-2.5 rounded h-16 resize-none focus:outline-none focus:border-cyan-500"
                ></textarea>
              </div>

              {/* Footer */}
              <div className="border-t border-slate-800 pt-4 flex justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => setIsFormOpen(false)}
                  className="px-4 py-2 border border-slate-700 rounded text-xs font-semibold text-slate-300 hover:bg-slate-800"
                >
                  取消
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-cyan-500 text-slate-950 rounded text-xs font-black hover:bg-cyan-400 shadow-[0_0_12px_rgba(6,182,212,0.3)]"
                >
                  保存商品模板
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}