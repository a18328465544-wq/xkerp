/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo } from "react";
import {
  Package,
  Search,
  Filter,
  CheckCircle,
  AlertTriangle,
  History,
  TrendingDown,
  Clock,
  Printer,
  FileText,
  BookmarkCheck,
  Calendar,
  X,
  CreditCard,
  User,
  Shield,
  Layers,
  Wrench,
  BadgeAlert,
  ArrowRight,
  Info,
  ScanLine
} from "lucide-react";
import { useStoreStateReturn } from "../utils/state";
import { CardInventory, CardStatus, InventoryScanMode, InventoryScanResult, SourceType } from "../types";

interface InventoryManagerProps {
  storeState: useStoreStateReturn;
  preSelectedCard: CardInventory | null;
  clearPreSelectedCard: () => void;
}

const getCategoryColorBadge = (category: string) => {
  switch (category) {
    case "显卡":
      return "bg-purple-500/10 text-purple-400 border border-purple-800/30";
    case "CPU":
      return "bg-cyan-500/10 text-cyan-400 border border-cyan-800/25";
    case "主板":
      return "bg-indigo-500/10 text-indigo-400 border border-indigo-800/25";
    case "内存":
      return "bg-amber-500/10 text-amber-400 border border-amber-800/25";
    case "硬盘":
      return "bg-emerald-500/10 text-emerald-400 border border-emerald-800/25";
    case "电源":
      return "bg-red-500/10 text-red-400 border border-red-800/25";
    default:
      return "bg-slate-500/10 text-slate-400 border border-slate-800/25";
  }
};

export default function InventoryManager({
  storeState,
  preSelectedCard,
  clearPreSelectedCard
}: InventoryManagerProps) {
  const {
    inventory,
    inspections,
    aftersales,
    permissions,
    logs,
    addLog
  } = storeState;

  // Search filter hooks
  const [search, setSearch] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [selectedStatus, setSelectedStatus] = useState<string>("all");
  const [selectedBrand, setSelectedBrand] = useState<string>("all");
  const [selectedRisk, setSelectedRisk] = useState<string>("all");
  const [selectedAged, setSelectedAged] = useState<string>("all");

  // Selected row batch array
  const [selectedRowIds, setSelectedRowIds] = useState<string[]>([]);

  // Drawer detail panel hooks
  const [detailCard, setDetailCard] = useState<CardInventory | null>(null);

  // Quick batch controllers dialog
  const [isBatchOpen, setIsBatchOpen] = useState(false);
  const [batchStatusValue, setBatchStatusValue] = useState<CardStatus>("已上架");
  const [batchLocValue, setBatchLocValue] = useState("");
  const [isScanOpen, setIsScanOpen] = useState(false);
  const [scanMode, setScanMode] = useState<InventoryScanMode>("入库");
  const [scanCodesText, setScanCodesText] = useState("");
  const [scanWarehouseLocation, setScanWarehouseLocation] = useState("A区货架-01");
  const [scanHandler, setScanHandler] = useState("仓库经办人");
  const [scanTarget, setScanTarget] = useState("");
  const [scanRemarks, setScanRemarks] = useState("");
  const [scanResults, setScanResults] = useState<InventoryScanResult[]>([]);
  const [scanSummary, setScanSummary] = useState("");

  // Auto trigger drawer if redirected from Dashboard
  React.useEffect(() => {
    if (preSelectedCard) {
      const match = inventory.find(c => c.id === preSelectedCard.id);
      if (match) {
        setDetailCard(match);
      }
      clearPreSelectedCard(); // consume
    }
  }, [preSelectedCard, inventory, clearPreSelectedCard]);

  const statusOpts: CardStatus[] = [
    "待检测",
    "检测中",
    "已入库",
    "已上架",
    "已锁定",
    "已售出",
    "退货中",
    "售后中",
    "维修中",
    "已报废"
  ];

  const getStatusBadge = (status: CardStatus) => {
    switch (status) {
      case "待检测":
        return "bg-purple-950 text-purple-300 border border-purple-800/80 animate-pulse";
      case "检测中":
        return "bg-fuchsia-950 text-fuchsia-300 border border-fuchsia-800";
      case "已入库":
        return "bg-blue-950 text-blue-300 border border-blue-800";
      case "已上架":
        return "bg-cyan-950 text-cyan-300 border border-cyan-400/50 shadow-[0_0_8px_rgba(6,182,212,0.15)]";
      case "已锁定":
        return "bg-amber-950/80 text-amber-300 border border-amber-800/60";
      case "已售出":
        return "bg-emerald-950 text-emerald-300 border border-emerald-900";
      case "售后中":
        return "bg-rose-950 text-rose-300 border border-rose-800 animate-pulse";
      case "维修中":
        return "bg-orange-950 text-orange-400 border border-orange-850";
      case "退货中":
        return "bg-slate-800 text-slate-400 border border-slate-700";
      case "已报废":
        return "bg-red-950 text-red-400 border border-red-900";
    }
  };

  const getConditionColor = (cond: string) => {
    if (cond.includes("全新")) return "text-emerald-400 font-bold bg-emerald-500/10 px-1 rounded-sm";
    if (cond.includes("充新") || cond.includes("99")) return "text-cyan-400 font-medium";
    if (cond.includes("矿卡") || cond.includes("高阻值")) return "text-red-400 font-extrabold bg-red-500/10 px-1 rounded-sm";
    return "text-slate-300";
  };

  const dynamicBrands = useMemo(() => {
    const bSet = new Set<string>();
    inventory.forEach(c => { if (c.brand) bSet.add(c.brand); });
    ["华硕", "七彩虹", "微星", "影驰", "蓝宝石", "Intel", "AMD", "芝奇", "三星", "海韵"].forEach(b => bSet.add(b));
    return Array.from(bSet);
  }, [inventory]);

  const filteredInventory = useMemo(() => {
    return inventory.filter(c => {
      const matchesSearch =
        c.productName.toLowerCase().includes(search.toLowerCase()) ||
        c.sn.toLowerCase().includes(search.toLowerCase()) ||
        c.id.toLowerCase().includes(search.toLowerCase()) ||
        c.supplierName.toLowerCase().includes(search.toLowerCase());

      const matchesCategory = selectedCategory === "all" || (c.category || "显卡") === selectedCategory;
      const matchesStatus = selectedStatus === "all" || c.status === selectedStatus;
      const matchesBrand = selectedBrand === "all" || c.brand === selectedBrand;
      
      const matchesRisk = 
        selectedRisk === "all" ||
        (selectedRisk === "mined" && c.gpuRisk) ||
        (selectedRisk === "upturned" && c.marketPrice < c.costPrice);

      const matchesAged = 
        selectedAged === "all" ||
        (selectedAged === "aged30" && c.storageDays >= 30) ||
        (selectedAged === "aged45" && c.storageDays >= 45);

      return matchesSearch && matchesCategory && matchesStatus && matchesBrand && matchesRisk && matchesAged;
    });
  }, [inventory, search, selectedCategory, selectedStatus, selectedBrand, selectedRisk, selectedAged]);

  // Handle batch editing
  const executeBatchMod = () => {
    if (selectedRowIds.length === 0) {
      alert("请先在下方表格最左侧勾选要批量处理的显卡。");
      return;
    }

    storeState.batchUpdateInventory(selectedRowIds, {
      status: batchStatusValue,
      warehouseLocation: batchLocValue
    });

    setSelectedRowIds([]);
    setIsBatchOpen(false);
    alert(`批量修改已就绪！成功将选中的 ${selectedRowIds.length} 张显卡的在库状态及库位进行了转移。`);
  };

  const executeScanFlow = () => {
    const codes = scanCodesText.split(/[\s,，;；]+/).map(item => item.trim()).filter(Boolean);
    if (codes.length === 0) {
      alert("请先扫码或输入至少一个库存ID / SN。");
      return;
    }
    const result = storeState.scanInventoryFlow({
      codes,
      mode: scanMode,
      warehouseLocation: scanWarehouseLocation,
      handler: scanHandler,
      target: scanTarget,
      remarks: scanRemarks
    });
    setScanResults(result.results);
    setScanSummary(`扫码${scanMode}完成：成功 ${result.updatedCount} 条，未匹配 ${result.missingCount} 条。`);
    setSearch("");
  };

  // Toggle selection
  const handleToggleSelectRow = (id: string) => {
    setSelectedRowIds(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  };

  const handleSelectAllRows = () => {
    if (selectedRowIds.length === filteredInventory.length) {
      setSelectedRowIds([]);
    } else {
      setSelectedRowIds(filteredInventory.map(c => c.id));
    }
  };

  // Label Printing simulations
  const handlePrintLabel = (card: CardInventory) => {
    alert(`🏷️ 打印指令成功发送！\n[显卡防撕标签]\n型号: ${card.productName}\n物料编号: ${card.id}\nSN序列: ${card.sn}\n入库成本: ¥${card.costPrice}`);
  };

  const currentMatchedInspection = useMemo(() => {
    if (!detailCard) return null;
    return inspections.find(ins => ins.inventoryId === detailCard.id) || null;
  }, [detailCard, inspections]);

  const currentMatchedAftersales = useMemo(() => {
    if (!detailCard) return null;
    return aftersales.find(as => as.sn === detailCard.sn) || null;
  }, [detailCard, aftersales]);

  return (
    <div className="space-y-4">
      {/* Title Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-slate-900 p-5 rounded-2xl border border-slate-800">
        <div>
          <h2 className="text-base font-bold text-slate-100 flex items-center gap-2">
            <Package className="w-5 h-5 text-cyan-400" />
            <span>智能单品库存列表 (一张一卡一档)</span>
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            严禁合并二手货源库存。在此页面内不仅可以按型号、存放定位和囤货天数穿透检索，亦能进行标签贴纸打印和物理流向追踪。
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setIsScanOpen(true)}
            className="p-2 px-3 bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-black rounded-lg text-xs flex items-center gap-1.5 cursor-pointer shadow-[0_0_12px_rgba(6,182,212,0.25)]"
          >
            <ScanLine className="w-3.5 h-3.5" />
            扫码出入库
          </button>
          {selectedRowIds.length > 0 && (
            <button
              onClick={() => setIsBatchOpen(true)}
              className="p-2 px-3 bg-amber-500 hover:bg-amber-400 text-slate-950 font-black rounded-lg text-xs flex items-center gap-1.5 cursor-pointer shadow-[0_0_12px_rgba(245,158,11,0.2)]"
            >
              <Layers className="w-3.5 h-3.5" />
              批量配置 ({selectedRowIds.length}张)
            </button>
          )}
          <button
            onClick={() => {
              const csvHeaders = "库存ID,产品模型,独立SN,来源,入库价,在库天数,状态,成色,库区\n";
              const rows = inventory.map(c => 
                `"${c.id}","${c.productName}","${c.sn}","${c.sourceType}",${c.costPrice},${c.storageDays},"${c.status}","${c.condition}","${c.warehouseLocation}"`
              ).join("\n");
              const blob = new Blob([csvHeaders + rows], { type: "text/csv;charset=utf-8;" });
              const link = document.createElement("a");
              link.href = URL.createObjectURL(blob);
              link.setAttribute("download", `精诚显卡物理明细库存单.csv`);
              document.body.appendChild(link);
              link.click();
              document.body.removeChild(link);
            }}
            className="p-2 border border-slate-700 hover:bg-slate-800 text-slate-300 rounded-lg text-xs font-bold cursor-pointer"
          >
            导出 Excel 明细
          </button>
        </div>
      </div>

      {/* SEARCH AND FILTERS TOOLBAR */}
      <div className="bg-slate-900 p-4 rounded-xl border border-slate-800 grid grid-cols-1 md:grid-cols-6 gap-3.5">
        {/* Search Input */}
        <div className="relative">
          <Search className="w-3.5 h-3.5 absolute left-3 top-3 text-slate-500" />
          <input
            type="text"
            placeholder="搜索产品全名/SN/库存ID/供应商..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full bg-slate-950 border border-slate-800 text-xs text-slate-200 placeholder-slate-500 pl-8.5 pr-3 py-2.5 rounded-lg focus:outline-none focus:border-cyan-500 font-medium"
          />
        </div>

        {/* Category select */}
        <div>
          <select
            value={selectedCategory}
            onChange={e => setSelectedCategory(e.target.value)}
            className="w-full bg-slate-950 border border-slate-800 text-xs text-slate-300 p-2.5 rounded-lg focus:outline-none cursor-pointer"
          >
            <option value="all">所有零配件品类</option>
            {["显卡", "CPU", "主板", "内存", "硬盘", "电源", "散热", "机箱", "整机", "其他配件"].map(cat => (
              <option key={cat} value={cat}>{cat}</option>
            ))}
          </select>
        </div>

        {/* Status select */}
        <div>
          <select
            value={selectedStatus}
            onChange={e => setSelectedStatus(e.target.value)}
            className="w-full bg-slate-950 border border-slate-800 text-xs text-slate-300 p-2.5 rounded-lg focus:outline-none"
          >
            <option value="all">所有在库状态 (全部)</option>
            {statusOpts.map(s => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </div>

        {/* Brand choice */}
        <div>
          <select
            value={selectedBrand}
            onChange={e => setSelectedBrand(e.target.value)}
            className="w-full bg-slate-950 border border-slate-800 text-xs text-slate-300 p-2.5 rounded-lg focus:outline-none"
          >
            <option value="all">所有硬件品牌厂商</option>
            {dynamicBrands.map(b => (
              <option key={b} value={b}>{b}</option>
            ))}
          </select>
        </div>

        {/* Risk Alerts filter */}
        <div>
          <select
            value={selectedRisk}
            onChange={e => setSelectedRisk(e.target.value)}
            className="w-full bg-slate-950 border border-slate-800 text-xs text-slate-300 p-2.5 rounded-lg focus:outline-none"
          >
            <option value="all">风控预警筛选 (全部)</option>
            <option value="mined">疑似矿卡高风险</option>
            <option value="upturned">成本倒挂 (现价比成本低)</option>
          </select>
        </div>

        {/* Storage Aging filters */}
        <div>
          <select
            value={selectedAged}
            onChange={e => setSelectedAged(e.target.value)}
            className="w-full bg-slate-950 border border-slate-800 text-xs text-slate-300 p-2.5 rounded-lg focus:outline-none"
          >
            <option value="all">在库周期筛选</option>
            <option value="aged30">存活超过 30天 (警告)</option>
            <option value="aged45">存活超过 45天 (严重警告)</option>
          </select>
        </div>
      </div>

      {/* CORE STOCK MATRIX ROWS */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-x-auto shadow-md">
        <table className="w-full text-left border-collapse min-w-[1300px]">
          <thead>
            <tr className="border-b border-slate-800 bg-slate-950 text-[11px] text-slate-400 font-bold uppercase font-mono">
              <th className="p-3 w-10 text-center">
                <input
                  type="checkbox"
                  checked={filteredInventory.length > 0 && selectedRowIds.length === filteredInventory.length}
                  onChange={handleSelectAllRows}
                  className="rounded text-cyan-500 bg-slate-950 border-slate-800"
                />
              </th>
              <th className="p-3 w-[150px]">库存编号 / SN序列号</th>
              <th className="p-3 w-[260px]">配件与商品规格</th>
              <th className="p-3 text-right">入库成本价</th>
              <th className="p-3 text-right">市场预估价</th>
              <th className="p-3 text-center">状态</th>
              <th className="p-3">品相说明</th>
              <th className="p-3 text-center">风险/拆修</th>
              <th className="p-3 text-center">在库天数</th>
              <th className="p-3">库位定位</th>
              <th className="p-3 pr-4 text-right">档案去向</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/50 text-xs font-mono">
            {filteredInventory.length === 0 ? (
              <tr>
                <td colSpan={11} className="p-10 text-center text-slate-500 font-bold">
                  没有匹配的独立单卡库存档案记录。
                </td>
              </tr>
            ) : (
              filteredInventory.map(c => {
                const isPriceUpturned = c.marketPrice < c.costPrice;
                const isAgedBad = c.storageDays >= 30;

                return (
                  <tr
                    key={c.id}
                    className={`hover:bg-slate-850/30 transition-colors group ${
                      detailCard?.id === c.id ? "bg-cyan-950/20" : ""
                    }`}
                  >
                    {/* Checkbox columns */}
                    <td className="p-3 text-center">
                      <input
                        type="checkbox"
                        checked={selectedRowIds.includes(c.id)}
                        onChange={() => handleToggleSelectRow(c.id)}
                        className="rounded text-cyan-500 bg-slate-950 border-slate-800"
                      />
                    </td>

                    {/* Code & S/N */}
                    <td className="p-3">
                      <button
                        onClick={() => setDetailCard(c)}
                        className="font-bold text-cyan-400 hover:underline block text-left cursor-pointer"
                      >
                        {c.id}
                      </button>
                      <span className="text-[10px] text-slate-500 block truncate max-w-[140px] mt-0.5" title={c.sn}>
                        S/N: {c.sn}
                      </span>
                    </td>

                    {/* Standard Specs */}
                    <td className="p-3">
                      <div className="flex items-center gap-1.5 mb-1 flex-wrap">
                        <span className={`inline-block px-1.5 py-0.2 rounded text-[8px] font-extrabold ${getCategoryColorBadge(c.category || "显卡")}`}>
                          {c.category || "显卡"}
                        </span>
                        <div className="font-bold text-slate-200 truncate max-w-[190px]" title={c.productName}>
                          {c.productName}
                        </div>
                      </div>
                      <div className="text-[9px] text-slate-500 flex gap-2">
                        <span>品牌: {c.brand}</span>
                        <span>版本: {c.version}</span>
                        <span>容量: {c.vram}</span>
                      </div>
                    </td>

                    {/* Costs */}
                    <td className="p-3 text-right">
                      {permissions.showCost ? (
                        <div className="font-bold text-slate-200">¥{c.costPrice}</div>
                      ) : (
                        <div className="text-slate-600 block text-[10px]">无权查看</div>
                      )}
                      <div className="text-[9px] text-slate-500 mt-0.5">源: {c.sourceType}</div>
                    </td>

                    {/* Market guidance estimation and warnings */}
                    <td className={`p-3 text-right font-bold ${
                      isPriceUpturned ? "text-rose-400 font-extrabold" : "text-slate-400"
                    }`}>
                      <div>¥{c.marketPrice}</div>
                      {isPriceUpturned && (
                        <span className="inline-block text-[8px] bg-rose-950/80 border border-rose-500/40 text-rose-300 font-sans p-0.2 px-1 rounded transform scale-95 mt-1 leading-none font-normal">
                          价值倒挂 ¥{c.costPrice - c.marketPrice}
                        </span>
                      )}
                    </td>

                    {/* Status Badge */}
                    <td className="p-3 text-center">
                      <span className={`inline-block px-2.5 py-0.5 rounded font-bold text-[10px] ${getStatusBadge(c.status)}`}>
                        {c.status}
                      </span>
                    </td>

                    {/* Condition details */}
                    <td className="p-3">
                      <span className={`text-[11px] block ${getConditionColor(c.condition)}`}>
                        {c.condition}
                      </span>
                      <span className="text-[10px] text-slate-400 truncate max-w-[120px] block mt-0.5" title={c.remarks}>
                        {c.remarks || "无标签批注"}
                      </span>
                    </td>

                    {/* Mining/Dismantle hazard index */}
                    <td className="p-3 text-center">
                      {c.gpuRisk ? (
                        <span className="inline-block px-1.5 py-0.5 bg-rose-950/60 border border-rose-500/30 text-rose-400 text-[9px] font-bold rounded">
                          矿
                        </span>
                      ) : (
                        <span className="text-slate-600 text-[10px]">&mdash;</span>
                      )}
                      {c.repaired && (
                        <span className="inline-block px-1.5 py-0.5 bg-orange-950/60 border border-orange-500/30 text-orange-400 text-[9px] font-bold rounded ml-1">
                          修
                        </span>
                      )}
                    </td>

                    {/* Aged metrics */}
                    <td className="p-3 text-center font-bold">
                      <span className={isAgedBad ? "text-amber-400 bg-amber-400/10 px-1 rounded" : "text-slate-300"}>
                        {c.storageDays} 天
                      </span>
                      {isAgedBad && (
                        <div className="text-[8px] text-amber-500 font-normal leading-tight font-sans scale-95">超期积压</div>
                      )}
                    </td>

                    {/* Locations */}
                    <td className="p-3">
                      <div className="font-semibold text-slate-300 truncate max-w-[80px]" title={c.warehouseLocation}>
                        {c.warehouseLocation}
                      </div>
                      <div className="text-[9px] text-slate-500">{c.entryTime}</div>
                    </td>

                    {/* Triggers & View Drawer */}
                    <td className="p-3 text-right pr-4 whitespace-nowrap space-x-1">
                      <button
                        onClick={() => setDetailCard(c)}
                        className="p-1 px-2 border border-slate-700 hover:bg-slate-800 text-slate-300 rounded text-[10px] font-bold cursor-pointer transition-all"
                      >
                        电子档案
                      </button>
                      <button
                        onClick={() => handlePrintLabel(c)}
                        title="打印物理防伪不干胶标签"
                        className="p-1 border border-slate-700 hover:bg-slate-850 text-slate-300 rounded cursor-pointer transition-colors"
                      >
                        <Printer className="w-3 h-3 text-cyan-400" />
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* BLOCK: DETAILED DRAWER FOR A SINGLE CARD lifecylces ("一卡一档") */}
      {detailCard && (
        <div className="fixed inset-y-0 right-0 z-50 w-full max-w-lg bg-slate-900 border-l border-slate-800 shadow-2xl flex flex-col justify-between text-slate-200">
          <div className="p-5 border-b border-slate-800 flex items-center justify-between bg-slate-950/20">
            <div>
              <div className="font-extrabold text-xs text-cyan-400 tracking-wider flex items-center gap-1">
                <BookmarkCheck className="w-4 h-4" /> 一卡一档电子病房与全寿命追溯
              </div>
              <h3 className="font-bold text-slate-100 text-sm mt-1">{detailCard.id} (物料编码)</h3>
            </div>
            <button
              onClick={() => setDetailCard(null)}
              className="p-1 border border-slate-800 hover:bg-slate-800 rounded text-slate-400 hover:text-slate-200 duration-150 cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Drawer scroll content body */}
          <div className="flex-1 overflow-y-auto p-5 space-y-5 custom-scrollbar">
            {/* Visual Header specs card */}
            <div className="bg-slate-950 p-4 rounded-xl border border-slate-850 relative overflow-hidden">
              <div className="absolute top-0 right-0 w-24 h-24 bg-cyan-500/5 rounded-full blur-2xl"></div>
              <h4 className="text-base font-black text-slate-100">{detailCard.productName}</h4>
              <div className="mt-3.5 grid grid-cols-2 gap-4 text-xs">
                <div>
                  <span className="text-slate-500 font-bold block">SN 序列码</span>
                  <span className="text-slate-200 font-mono font-bold">{detailCard.sn}</span>
                </div>
                <div>
                  <span className="text-slate-500 font-bold block">外观成色级别</span>
                  <span className={`font-bold block ${getConditionColor(detailCard.condition)}`}>
                    {detailCard.condition}
                  </span>
                </div>
                <div>
                  <span className="text-slate-500 font-bold block">原包保修状态</span>
                  <span className="text-slate-200">
                    {detailCard.inWarranty ? `在保 (截止 ${detailCard.warrantyDate})` : "无保修保固"}
                  </span>
                </div>
                <div>
                  <span className="text-slate-500 font-bold block">防潮储位架号</span>
                  <span className="text-slate-200 font-mono font-semibold">{detailCard.warehouseLocation}</span>
                </div>
              </div>
            </div>

            {/* LIFECYCLE CHRONOLOGICAL TIMELINE */}
            <div className="space-y-3">
              <h5 className="text-[10px] text-slate-400 font-bold uppercase tracking-wider flex items-center gap-1.5 border-b border-slate-800 pb-1.5 font-mono">
                <History className="w-3.5 h-3.5 text-cyan-400" />
                GPU 门店流通完整寿命链 (Full Lifecycle Trace)
              </h5>

              <div className="relative border-l border-slate-800 pl-4 py-1 space-y-4 text-xs leading-normal">
                {/* Milestone 1: Acquisition Inward */}
                <div className="relative">
                  <div className="absolute -left-[21px] top-1.5 w-3 h-3 rounded-full bg-cyan-500 border-2 border-slate-900"></div>
                  <span className="text-[10px] text-slate-500 font-mono">2026年5月上旬 · 第一阶段</span>
                  <p className="font-bold text-slate-200 mt-0.5">采集与估损入账</p>
                  <p className="text-slate-400 text-[11px] mt-0.5">
                    从 <b>{detailCard.supplierName}</b> 处通过 <b>{detailCard.sourceType}</b> 收回。
                    {permissions.showCost ? `收购入账成本: ¥${detailCard.costPrice}` : ""}.
                  </p>
                </div>

                {/* Milestone 2: QC inspections report matching */}
                <div className="relative">
                  <div className={`absolute -left-[21px] top-1.5 w-3 h-3 rounded-full border-2 border-slate-900 ${
                    currentMatchedInspection ? "bg-emerald-500" : "bg-purple-500"
                  }`}></div>
                  <span className="text-[10px] text-slate-500 font-mono">质检阶段评估</span>
                  <p className="font-bold text-slate-200 mt-0.5">FurMark / VRAM 质检防伪结果</p>
                  {currentMatchedInspection ? (
                    <div className="bg-slate-950 p-2.5 rounded border border-slate-850 text-[11px] text-slate-400 mt-1 space-y-1">
                      <div>
                        质检人员: <span className="text-slate-200 font-bold">{currentMatchedInspection.inspector}</span> · 结论:{" "}
                        <span className="text-emerald-400 font-bold bg-emerald-500/10 px-1 rounded">{currentMatchedInspection.resultStatus}</span>
                      </div>
                      <div>
                        外观: <span className="text-slate-300">{currentMatchedInspection.exteriorCheck}</span> · 风扇:{" "}
                        <span className="text-slate-300">{currentMatchedInspection.fanCheck}</span>
                      </div>
                      <div className="font-mono text-[10px]">烤机表现: {currentMatchedInspection.furmarkResult}</div>
                      <div className="font-mono text-[10px]">温度上限: {currentMatchedInspection.temperature}℃ | 噪声: {currentMatchedInspection.noise}</div>
                    </div>
                  ) : (
                    <p className="text-slate-500 text-[11px] italic mt-0.5">
                      尚未进行深度物理烤性质检。当前状态: [<b>{detailCard.status}</b>]。检测员未填报告。
                    </p>
                  )}
                </div>

                {/* Milestone 3: Current stocking */}
                <div className="relative">
                  <div className="absolute -left-[21px] top-1.5 w-3 h-3 rounded-full bg-indigo-500 border-2 border-slate-900"></div>
                  <span className="text-[10px] text-slate-500 font-mono">陈列整配中</span>
                  <p className="font-bold text-slate-200 mt-0.5">备架上架详情</p>
                  <p className="text-slate-400 text-[11px] mt-0.5">
                    已置入 <b>{detailCard.warehouseLocation}</b> 并且已持存储积压达 <b>{detailCard.storageDays}</b> 天。
                    预计售价 ¥{detailCard.estSellPrice}。{detailCard.gpuRisk ? "☠️ 该卡带矿卡风险标签，须额外对小白解释。" : ""}
                  </p>
                </div>

                {/* Milestone 4: Sales Outward */}
                {detailCard.status === "已售出" && (
                  <div className="relative">
                    <div className="absolute -left-[21px] top-1.5 w-3 h-3 rounded-full bg-emerald-500 border-2 border-slate-900"></div>
                    <span className="text-[10px] text-slate-500 font-mono">{detailCard.salesTime} · 出货去向</span>
                    <p className="font-bold text-slate-200 mt-0.5">零售完结/流转完结</p>
                    <p className="text-slate-400 text-[11px] mt-0.5">
                      售给客户 <b>{detailCard.buyerName}</b>，实际出库单号为 <b>{detailCard.salesInvoiceId}</b>。
                      成交价: ¥{detailCard.salesPrice}。
                      {permissions.showProfit && detailCard.salesPrice && (
                        <span className="text-emerald-400 font-bold">
                          {" "}(实际毛纯利润: ¥{detailCard.salesPrice - detailCard.costPrice})
                        </span>
                      )}
                    </p>
                  </div>
                )}

                {/* Milestone 5: Disputed ticket */}
                {currentMatchedAftersales && (
                  <div className="relative">
                    <div className="absolute -left-[21px] top-1.5 w-3 h-3 rounded-full bg-rose-500 border-2 border-slate-900 animate-pulse"></div>
                    <span className="text-[10px] text-red-400 font-bold font-mono">2026年 · 售后事件挂钩</span>
                    <p className="font-bold text-rose-300 mt-0.5">发起售后保固流程 [{currentMatchedAftersales.type}]</p>
                    <p className="text-slate-300 text-[11px] bg-red-950/20 border border-red-500/20 p-2 rounded mt-1">
                      反馈问题: {currentMatchedAftersales.desc}
                      <br/>
                      处理状态: <span className="font-black text-rose-300">{currentMatchedAftersales.status}</span> · 处理意见: {currentMatchedAftersales.finalResult || "拉锯调试中"}
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Drawer actions details footer */}
          <div className="p-4 border-t border-slate-800 bg-slate-950/40 grid grid-cols-2 gap-3.5">
            <button
              onClick={() => handlePrintLabel(detailCard)}
              className="p-2 border border-slate-700 hover:bg-slate-800 text-slate-200 rounded text-xs font-bold transition-all cursor-pointer flex items-center justify-center gap-1.5"
            >
              <Printer className="w-4 h-4 text-cyan-400" />
              重新打印不干胶标签
            </button>
            <button
              onClick={() => {
                alert("一卡一档 PDF 档案已生成，可用于向买家展示。演示环境已触发打印预览。");
              }}
              className="p-2 bg-slate-800 hover:bg-slate-750 text-slate-200 text-xs font-bold rounded flex items-center justify-center gap-1 cursor-pointer"
            >
              展示给买家报告 &rarr;
            </button>
          </div>
        </div>
      )}

      {/* COMPONENT: SCAN IN/OUT WORKBENCH */}
      {isScanOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-3xl shadow-2xl overflow-hidden text-slate-100">
            <div className="p-5 border-b border-slate-800 flex items-center justify-between">
              <h3 className="font-bold text-slate-100 flex items-center gap-2">
                <ScanLine className="w-5 h-5 text-cyan-400" />
                <span>扫码出入库工作台</span>
              </h3>
              <button onClick={() => setIsScanOpen(false)} className="text-slate-400 hover:text-slate-200">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 space-y-4 max-h-[75vh] overflow-y-auto custom-scrollbar">
              <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                <select
                  value={scanMode}
                  onChange={e => setScanMode(e.target.value as InventoryScanMode)}
                  className="bg-slate-950 border border-slate-800 text-xs text-slate-200 p-2.5 rounded"
                >
                  <option value="入库">扫码入库</option>
                  <option value="出库">扫码出库</option>
                  <option value="移库">扫码移库</option>
                </select>
                <input
                  value={scanWarehouseLocation}
                  onChange={e => setScanWarehouseLocation(e.target.value)}
                  className="bg-slate-950 border border-slate-800 text-xs text-slate-200 p-2.5 rounded"
                  placeholder={scanMode === "出库" ? "出库后位置，如已出库" : "目标库位"}
                />
                <input
                  value={scanHandler}
                  onChange={e => setScanHandler(e.target.value)}
                  className="bg-slate-950 border border-slate-800 text-xs text-slate-200 p-2.5 rounded"
                  placeholder="经办人"
                />
                <input
                  value={scanTarget}
                  onChange={e => setScanTarget(e.target.value)}
                  className="bg-slate-950 border border-slate-800 text-xs text-slate-200 p-2.5 rounded"
                  placeholder={scanMode === "出库" ? "出库对象/客户" : "对象，可空"}
                />
              </div>

              <textarea
                autoFocus
                value={scanCodesText}
                onChange={e => setScanCodesText(e.target.value)}
                onKeyDown={e => {
                  if ((e.metaKey || e.ctrlKey) && e.key === "Enter") executeScanFlow();
                }}
                className="w-full min-h-40 bg-slate-950 border border-slate-800 text-sm text-slate-100 p-3 rounded font-mono focus:outline-none focus:border-cyan-500"
                placeholder="扫码枪扫入库存ID或SN。支持一行一个，也支持用空格、逗号分隔。按 Ctrl/⌘ + Enter 执行。"
              />

              <input
                value={scanRemarks}
                onChange={e => setScanRemarks(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 text-xs text-slate-200 p-2.5 rounded"
                placeholder="备注，如顺丰发货、盘点入库、库位调整原因"
              />

              <div className="bg-slate-950 border border-slate-850 p-3 text-[11px] text-slate-400 leading-relaxed">
                入库会把扫描到的库存卡标记为“已入库”；出库会标记为“已售出”并记录出库对象；移库只修改库位不改状态。已售出或已报废的卡不能重复出库。
              </div>

              {scanSummary && (
                <div className="bg-cyan-500/10 border border-cyan-500/30 text-cyan-200 text-xs font-bold px-3 py-2 rounded">
                  {scanSummary}
                </div>
              )}

              {scanResults.length > 0 && (
                <div className="bg-slate-950 border border-slate-800 rounded-lg overflow-hidden">
                  <table className="w-full text-xs">
                    <thead className="bg-slate-900 text-slate-400">
                      <tr>
                        <th className="p-2 text-left">扫码内容</th>
                        <th className="p-2 text-left">库存卡</th>
                        <th className="p-2 text-left">状态</th>
                        <th className="p-2 text-left">库位</th>
                        <th className="p-2 text-left">结果</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-800">
                      {scanResults.map((item, index) => (
                        <tr key={`${item.code}-${index}`}>
                          <td className="p-2 font-mono text-slate-300">{item.code}</td>
                          <td className="p-2 text-slate-200">{item.inventoryId || "-"} {item.sn ? `/ ${item.sn}` : ""}</td>
                          <td className="p-2 text-slate-400">{item.beforeStatus || "-"} {item.afterStatus ? `→ ${item.afterStatus}` : ""}</td>
                          <td className="p-2 text-slate-400">{item.beforeLocation || "-"} {item.afterLocation ? `→ ${item.afterLocation}` : ""}</td>
                          <td className={`p-2 font-bold ${item.matched && item.message.endsWith("成功") ? "text-emerald-400" : "text-amber-400"}`}>{item.message}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            <div className="p-4 border-t border-slate-800 bg-slate-950/40 flex justify-end gap-2 text-xs">
              <button onClick={() => setIsScanOpen(false)} className="px-4 py-2 border border-slate-705 rounded font-bold text-slate-400 hover:bg-slate-800">关闭</button>
              <button onClick={executeScanFlow} className="px-5 py-2 bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-black rounded shadow-[0_0_12px_rgba(6,182,212,0.3)]">
                执行扫码{scanMode}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* COMPONENT: BATCH MODIFIER DIALOG */}
      {isBatchOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-md shadow-2xl overflow-hidden text-slate-100 p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="font-bold text-slate-100 flex items-center gap-2">
                <Layers className="w-5 h-5 text-cyan-400" />
                <span>批量修改显卡属性 ({selectedRowIds.length}张)</span>
              </h3>
              <button onClick={() => setIsBatchOpen(false)} className="text-slate-400 hover:text-slate-200">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block mb-1">批量标记流程状态</label>
                <select
                  value={batchStatusValue}
                  onChange={e => setBatchStatusValue(e.target.value as CardStatus)}
                  className="w-full bg-slate-950 border border-slate-800 text-xs text-slate-200 p-2.5 rounded focus:outline-none"
                >
                  {statusOpts.map(s => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block mb-1">批量转移存放架位 (空代表不更新)</label>
                <input
                  type="text"
                  placeholder="e.g. A区防潮柜-03"
                  value={batchLocValue}
                  onChange={e => setBatchLocValue(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 text-xs text-slate-200 p-2.5 rounded focus:outline-none"
                />
              </div>

              <div className="bg-slate-950 border border-slate-850 p-2.5 text-[10px] text-slate-400 leading-normal font-mono">
                此调配修改直接影响这 {selectedRowIds.length} 块带独立SN序列号的显卡。更改会瞬间注册到操作审计安全日志中。
              </div>
            </div>

            <div className="border-t border-slate-800 pt-4 flex justify-end gap-2 text-xs">
              <button
                type="button"
                onClick={() => setIsBatchOpen(false)}
                className="px-4 py-2 border border-slate-705 rounded font-bold text-slate-400 hover:bg-slate-800"
              >
                取消
              </button>
              <button
                type="button"
                onClick={executeBatchMod}
                className="px-5 py-2 bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-black rounded shadow-[0_0_12px_rgba(6,182,212,0.3)]"
              >
                执行批量调配
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
