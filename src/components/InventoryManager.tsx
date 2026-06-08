/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo } from "react";
import {
  Package,
  Search,
  Filter,
  History,
  Printer,
  BookmarkCheck,
  X,
  Layers,
  ScanLine,
  Download,
  Upload
} from "lucide-react";
import { useStoreStateReturn } from "../utils/state";
import { getLockedHandlerFieldState } from "../utils/sessionUser";
import { CardInventory, CardStatus, InventoryImportRow, InventoryScanMode, InventoryScanResult, InventorySummaryRow, ProductCategory } from "../types";

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

const csvEscape = (value: unknown) => `"${String(value ?? "").replace(/"/g, '""')}"`;

const downloadCsv = (filename: string, headers: string[], rows: unknown[][]) => {
  const csv = [headers.map(csvEscape).join(","), ...rows.map(row => row.map(csvEscape).join(","))].join("\n");
  const blob = new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8;" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.setAttribute("download", filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(link.href);
};

const parseCsvLine = (line: string) => {
  const cells: string[] = [];
  let current = "";
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (char === '"' && line[index + 1] === '"') {
      current += '"';
      index += 1;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === "," && !quoted) {
      cells.push(current.trim());
      current = "";
    } else {
      current += char;
    }
  }
  cells.push(current.trim());
  return cells;
};

const parseInventoryImportCsv = (text: string): InventoryImportRow[] => {
  const lines = text.split(/\r?\n/).map(line => line.trim()).filter(Boolean);
  if (lines.length < 2) return [];
  const headers = parseCsvLine(lines[0]);
  const findValue = (cells: string[], names: string[]) => {
    const index = headers.findIndex(header => names.includes(header));
    return index >= 0 ? cells[index]?.trim() : "";
  };
  return lines.slice(1).map((line): InventoryImportRow => {
    const cells = parseCsvLine(line);
    return {
      productName: findValue(cells, ["商品名称", "产品名称", "名称", "productName"]),
      category: (findValue(cells, ["类目", "品类", "category"]) || "其他配件") as ProductCategory,
      brand: findValue(cells, ["品牌", "brand"]),
      model: findValue(cells, ["型号", "model"]),
      version: findValue(cells, ["版本", "version"]),
      vram: findValue(cells, ["容量", "显存", "规格", "vram"]),
      quantity: Number(findValue(cells, ["数量", "库存数量", "quantity"]) || 1),
      warehouseLocation: findValue(cells, ["库位", "存放位置", "warehouseLocation"]),
      costPrice: Number(findValue(cells, ["成本价", "入库成本", "costPrice"]) || 0),
      estSellPrice: Number(findValue(cells, ["预估售价", "销售价", "estSellPrice"]) || 0),
      status: (findValue(cells, ["状态", "库存状态", "status"]) || "已入库") as CardStatus,
      supplierName: findValue(cells, ["供应商", "来源", "supplierName"]),
      remarks: findValue(cells, ["备注", "remarks"]),
    };
  }).filter(row => row.productName);
};

const summaryColumnOptions = [
  { key: "productName", label: "商品名称" },
  { key: "category", label: "类目" },
  { key: "brand", label: "品牌" },
  { key: "model", label: "型号" },
  { key: "version", label: "版本" },
  { key: "vram", label: "容量" },
  { key: "warehouseLocation", label: "库位" },
  { key: "totalCount", label: "总数" },
  { key: "availableCount", label: "可售" },
  { key: "pendingCount", label: "待检" },
  { key: "lockedCount", label: "锁定" },
  { key: "totalCost", label: "总成本" },
  { key: "totalEstSell", label: "预估售价" },
  { key: "avgPrice", label: "均价" },
] as const;

const singleColumnOptions = [
  { key: "select", label: "选择" },
  { key: "code", label: "库存编号/SN" },
  { key: "product", label: "商品规格" },
  { key: "cost", label: "入库成本" },
  { key: "market", label: "市场预估" },
  { key: "status", label: "状态" },
  { key: "condition", label: "品相" },
  { key: "risk", label: "风险/拆修" },
  { key: "days", label: "在库天数" },
  { key: "location", label: "库位" },
  { key: "action", label: "操作" },
] as const;

type SummaryColumnKey = typeof summaryColumnOptions[number]["key"];
type SingleColumnKey = typeof singleColumnOptions[number]["key"];

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
    currentRole,
    currentUser
  } = storeState;
  const lockedHandlerState = getLockedHandlerFieldState(currentUser, currentRole);
  const defaultHandlerName = lockedHandlerState.value;

  // Search filter hooks
  const [search, setSearch] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string>("all");
  const [selectedStatus, setSelectedStatus] = useState<string>("all");
  const [selectedBrand, setSelectedBrand] = useState<string>("all");
  const [selectedRisk, setSelectedRisk] = useState<string>("all");
  const [selectedAged, setSelectedAged] = useState<string>("all");
  const [inventoryView, setInventoryView] = useState<"single" | "summary">("single");
  const [showColumnSettings, setShowColumnSettings] = useState(false);
  const [hiddenSummaryColumns, setHiddenSummaryColumns] = useState<SummaryColumnKey[]>([]);
  const [hiddenSingleColumns, setHiddenSingleColumns] = useState<SingleColumnKey[]>([]);
  const importInputRef = React.useRef<HTMLInputElement | null>(null);

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
  const [scanTrackingSnText, setScanTrackingSnText] = useState("");
  const [scanAccessoryCodesText, setScanAccessoryCodesText] = useState("");
  const [scanWarehouseLocation, setScanWarehouseLocation] = useState("A区货架-01");
  const [scanHandler, setScanHandler] = useState(defaultHandlerName);
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

  React.useEffect(() => {
    setScanHandler(defaultHandlerName);
  }, [defaultHandlerName]);

  const statusOpts: CardStatus[] = [
    "待检测",
    "检测中",
    "已入库",
    "已上架",
    "已锁定",
    "已售出",
    "已拆卸",
    "已组装",
    "退货中",
    "售后中",
    "维修中",
    "已报废"
  ];

  const isSummaryColumnVisible = (key: SummaryColumnKey) => !hiddenSummaryColumns.includes(key);
  const isSingleColumnVisible = (key: SingleColumnKey) => !hiddenSingleColumns.includes(key);
  const summaryVisibleColumnCount = summaryColumnOptions.filter(column => isSummaryColumnVisible(column.key)).length || 1;
  const singleVisibleColumnCount = singleColumnOptions.filter(column => isSingleColumnVisible(column.key)).length || 1;
  const toggleSummaryColumn = (key: SummaryColumnKey) => {
    setHiddenSummaryColumns(current => current.includes(key) ? current.filter(item => item !== key) : [...current, key]);
  };
  const toggleSingleColumn = (key: SingleColumnKey) => {
    setHiddenSingleColumns(current => current.includes(key) ? current.filter(item => item !== key) : [...current, key]);
  };

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
      case "已拆卸":
        return "bg-orange-50 text-orange-700 border border-orange-200";
      case "已组装":
        return "bg-blue-50 text-blue-700 border border-blue-200";
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

  const summaryRows = useMemo(() => {
    return storeState.getInventorySummary({
      category: selectedCategory,
      status: selectedStatus,
      keyword: search,
      includeSold: true
    }).filter(row => selectedBrand === "all" || row.brand === selectedBrand);
  }, [storeState, inventory, search, selectedCategory, selectedStatus, selectedBrand]);

  const exportDetailInventory = () => {
    downloadCsv(
      "单卡库存明细.csv",
      ["库存ID", "商品名称", "类目", "品牌", "型号", "版本", "容量", "SN", "来源", "入库价", "预估售价", "在库天数", "状态", "成色", "库位", "供应商"],
      inventory.map(c => [
        c.id,
        c.productName,
        c.category || "显卡",
        c.brand,
        c.model,
        c.version,
        c.vram,
        c.sn,
        c.sourceType,
        c.costPrice,
        c.estSellPrice,
        c.storageDays,
        c.status,
        c.condition,
        c.warehouseLocation,
        c.supplierName
      ])
    );
  };

  const exportSummaryInventory = () => {
    downloadCsv(
      "整体库存汇总.csv",
      ["商品名称", "类目", "品牌", "型号", "版本", "容量", "库位", "总数", "可售", "待检", "锁定", "已售", "维修售后", "总成本", "预估总售价", "平均成本", "平均售价", "最后入库"],
      summaryRows.map(row => [
        row.productName,
        row.category,
        row.brand,
        row.model,
        row.version,
        row.vram,
        row.warehouseLocation,
        row.totalCount,
        row.availableCount,
        row.pendingCount,
        row.lockedCount,
        row.soldCount,
        row.repairCount,
        row.totalCost,
        row.totalEstSell,
        row.avgCost,
        row.avgEstSell,
        row.lastEntryTime || ""
      ])
    );
  };

  const exportImportTemplate = () => {
    downloadCsv(
      "整体库存导入模板.csv",
      ["商品名称", "类目", "品牌", "型号", "版本", "容量", "数量", "库位", "成本价", "预估售价", "状态", "供应商", "备注"],
      [["RTX 4090 华硕 ROG 猛禽 24G", "显卡", "华硕", "RTX 4090", "ROG 猛禽", "24G", 1, "A区货架-01", 18000, 19500, "已入库", "导入供应商", "示例行，可删除"]]
    );
  };

  const handleImportFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    try {
      const text = await file.text();
      const rows = parseInventoryImportCsv(text);
      if (!rows.length) {
        alert("没有识别到可导入的库存行，请确认表头包含“商品名称”和“数量”。");
        return;
      }
      const created = storeState.importInventoryRows(rows, defaultHandlerName);
      setInventoryView("summary");
      alert(`导入完成：已生成 ${created.length} 条单卡库存档案。`);
    } catch (error) {
      alert(error instanceof Error ? error.message : "导入失败，请检查 CSV 格式。");
    }
  };

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
    const trackingSnPairs = scanTrackingSnText
      .split("\n")
      .map(line => line.trim())
      .filter(Boolean)
      .map(line => {
        const [trackingNo = "", sn = ""] = line.split(/[\s,，;；]+/).map(item => item.trim()).filter(Boolean);
        return { trackingNo, sn };
      });
    const accessoryCodes = scanAccessoryCodesText.split(/[\s,，;；]+/).map(item => item.trim()).filter(Boolean);

    if (codes.length === 0 && trackingSnPairs.length === 0 && accessoryCodes.length === 0) {
      alert(scanMode === "入库" ? "请先扫码或输入库存ID / SN，或填写快递单号 + SN。" : "请先扫码或输入至少一个库存ID / SN。");
      return;
    }
    const result = storeState.scanInventoryFlow({
      codes,
      mode: scanMode,
      warehouseLocation: scanWarehouseLocation,
      handler: scanHandler,
      target: scanTarget,
      remarks: scanRemarks,
      trackingSnPairs: scanMode === "入库" ? trackingSnPairs : undefined,
      accessoryCodes: scanMode === "入库" ? accessoryCodes : undefined
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
    alert(`🏷️ 打印指令成功发送！\n[显卡防撕标签]\n型号: ${card.productName}\n物料编号: ${card.id}\nSN序列: ${card.sn}\n入库成本: ${card.costPrice}元`);
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
            <span>{inventoryView === "single" ? "单卡库存" : "整体库存"}</span>
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            {inventoryView === "single"
              ? "按 SN 查看每张卡和每个配件，并支持标签打印与扫码流转。"
              : "按同一商品汇总数量、成本与预估售价，库位合并展示，快速看清什么货有几件。"}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <div className="inline-flex rounded-lg border border-slate-700 bg-slate-950 p-1">
            <button
              onClick={() => setInventoryView("single")}
              className={`px-3 py-1.5 rounded-md text-xs font-black ${inventoryView === "single" ? "bg-cyan-500 text-white" : "text-slate-400 hover:text-slate-100"}`}
            >
              单卡库存
            </button>
            <button
              onClick={() => setInventoryView("summary")}
              className={`px-3 py-1.5 rounded-md text-xs font-black ${inventoryView === "summary" ? "bg-cyan-500 text-white" : "text-slate-400 hover:text-slate-100"}`}
            >
              整体库存
            </button>
          </div>
          <button
            onClick={() => setIsScanOpen(true)}
            className="p-2 px-3 bg-cyan-500 hover:bg-cyan-400 text-white font-black rounded-lg text-xs flex items-center gap-1.5 cursor-pointer"
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
          <input
            ref={importInputRef}
            type="file"
            accept=".csv,text/csv"
            onChange={handleImportFile}
            className="hidden"
          />
          <button
            onClick={() => importInputRef.current?.click()}
            className="p-2 px-3 border border-cyan-700 hover:bg-cyan-950/40 text-cyan-200 rounded-lg text-xs font-bold cursor-pointer flex items-center gap-1.5"
          >
            <Upload className="w-3.5 h-3.5" />
            导入库存
          </button>
          <button
            onClick={exportImportTemplate}
            className="p-2 px-3 border border-slate-700 hover:bg-slate-800 text-slate-300 rounded-lg text-xs font-bold cursor-pointer"
          >
            下载模板
          </button>
          <button
            onClick={inventoryView === "single" ? exportDetailInventory : exportSummaryInventory}
            className="p-2 px-3 border border-slate-700 hover:bg-slate-800 text-slate-300 rounded-lg text-xs font-bold cursor-pointer flex items-center gap-1.5"
          >
            <Download className="w-3.5 h-3.5" />
            {inventoryView === "single" ? "导出明细" : "导出汇总"}
          </button>
          <button
            onClick={() => setShowColumnSettings(value => !value)}
            className="p-2 px-3 border border-slate-700 hover:bg-slate-800 text-slate-300 rounded-lg text-xs font-bold cursor-pointer flex items-center gap-1.5"
          >
            <Filter className="w-3.5 h-3.5" />
            显示字段
          </button>
        </div>
      </div>

      {showColumnSettings && (
        <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-sm">
          <div className="flex items-center justify-between gap-3 mb-3">
            <div>
              <div className="text-sm font-black text-slate-900">表格字段</div>
              <p className="text-xs text-slate-500 mt-0.5">
                勾选需要显示的字段；表头右侧可以拖动调整列宽。
              </p>
            </div>
            <button
              onClick={() => inventoryView === "summary" ? setHiddenSummaryColumns([]) : setHiddenSingleColumns([])}
              className="text-xs font-bold text-cyan-500 hover:text-cyan-400"
            >
              恢复默认
            </button>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-7 gap-2">
            {(inventoryView === "summary" ? summaryColumnOptions : singleColumnOptions).map(column => {
              const checked = inventoryView === "summary"
                ? isSummaryColumnVisible(column.key as SummaryColumnKey)
                : isSingleColumnVisible(column.key as SingleColumnKey);
              return (
                <label key={column.key} className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-bold text-slate-700">
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => inventoryView === "summary"
                      ? toggleSummaryColumn(column.key as SummaryColumnKey)
                      : toggleSingleColumn(column.key as SingleColumnKey)}
                    className="rounded text-cyan-500 border-slate-300"
                  />
                  {column.label}
                </label>
              );
            })}
          </div>
        </div>
      )}

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

      {inventoryView === "summary" && (
        <div className="bg-white border border-slate-200 rounded-xl overflow-x-auto shadow-sm">
          <table className="erp-resizable-table w-full text-left border-collapse min-w-[1320px]">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-[12px] text-slate-500 font-bold">
                {isSummaryColumnVisible("productName") && <th className="p-3 w-[280px]">商品名称</th>}
                {isSummaryColumnVisible("category") && <th className="p-3 w-[90px]">类目</th>}
                {isSummaryColumnVisible("brand") && <th className="p-3 w-[100px]">品牌</th>}
                {isSummaryColumnVisible("model") && <th className="p-3 w-[140px]">型号</th>}
                {isSummaryColumnVisible("version") && <th className="p-3 w-[120px]">版本</th>}
                {isSummaryColumnVisible("vram") && <th className="p-3 w-[90px]">容量</th>}
                {isSummaryColumnVisible("warehouseLocation") && <th className="p-3 w-[180px]">库位</th>}
                {isSummaryColumnVisible("totalCount") && <th className="p-3 text-right">总数</th>}
                {isSummaryColumnVisible("availableCount") && <th className="p-3 text-right">可售</th>}
                {isSummaryColumnVisible("pendingCount") && <th className="p-3 text-right">待检</th>}
                {isSummaryColumnVisible("lockedCount") && <th className="p-3 text-right">锁定</th>}
                {isSummaryColumnVisible("totalCost") && <th className="p-3 text-right">总成本</th>}
                {isSummaryColumnVisible("totalEstSell") && <th className="p-3 text-right">预估售价</th>}
                {isSummaryColumnVisible("avgPrice") && <th className="p-3 text-right">均价</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-sm">
              {summaryRows.length === 0 ? (
                <tr>
                  <td colSpan={summaryVisibleColumnCount} className="p-10 text-center text-slate-400 font-bold">
                    没有匹配的整体库存汇总。
                  </td>
                </tr>
              ) : (
                summaryRows.map((row: InventorySummaryRow) => (
                  <tr key={row.key} className="hover:bg-blue-50/50">
                    {isSummaryColumnVisible("productName") && <td className="p-3 font-bold text-slate-900">{row.productName}</td>}
                    {isSummaryColumnVisible("category") && <td className="p-3">
                      <span className="inline-flex rounded-md bg-blue-50 px-2 py-1 text-xs font-black text-blue-700">{row.category}</span>
                    </td>}
                    {isSummaryColumnVisible("brand") && <td className="p-3 text-slate-600">{row.brand}</td>}
                    {isSummaryColumnVisible("model") && <td className="p-3 text-slate-700 font-mono">{row.model}</td>}
                    {isSummaryColumnVisible("version") && <td className="p-3 text-slate-600">{row.version}</td>}
                    {isSummaryColumnVisible("vram") && <td className="p-3 text-slate-600">{row.vram}</td>}
                    {isSummaryColumnVisible("warehouseLocation") && <td className="p-3 text-slate-700" title={row.warehouseLocation}>{row.warehouseLocation}</td>}
                    {isSummaryColumnVisible("totalCount") && <td className="p-3 text-right text-lg font-black text-slate-900">{row.totalCount}</td>}
                    {isSummaryColumnVisible("availableCount") && <td className="p-3 text-right font-bold text-emerald-600">{row.availableCount}</td>}
                    {isSummaryColumnVisible("pendingCount") && <td className="p-3 text-right font-bold text-amber-600">{row.pendingCount}</td>}
                    {isSummaryColumnVisible("lockedCount") && <td className="p-3 text-right font-bold text-blue-600">{row.lockedCount}</td>}
                    {isSummaryColumnVisible("totalCost") && <td className="p-3 text-right font-mono font-bold text-slate-800">{row.totalCost.toLocaleString()}元</td>}
                    {isSummaryColumnVisible("totalEstSell") && <td className="p-3 text-right font-mono font-bold text-slate-800">{row.totalEstSell.toLocaleString()}元</td>}
                    {isSummaryColumnVisible("avgPrice") && <td className="p-3 text-right font-mono text-slate-500">{row.avgCost.toLocaleString()} / {row.avgEstSell.toLocaleString()}</td>}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* CORE STOCK MATRIX ROWS */}
      <div className={`${inventoryView === "summary" ? "hidden" : ""} bg-slate-900 border border-slate-800 rounded-xl overflow-x-auto shadow-md`}>
        <table className="erp-resizable-table w-full text-left border-collapse min-w-[1300px]">
          <thead>
            <tr className="border-b border-slate-800 bg-slate-950 text-[11px] text-slate-400 font-bold uppercase font-mono">
              {isSingleColumnVisible("select") && <th className="p-3 w-10 text-center">
                <input
                  type="checkbox"
                  checked={filteredInventory.length > 0 && selectedRowIds.length === filteredInventory.length}
                  onChange={handleSelectAllRows}
                  className="rounded text-cyan-500 bg-slate-950 border-slate-800"
                />
              </th>}
              {isSingleColumnVisible("code") && <th className="p-3 w-[150px]">库存编号 / SN序列号</th>}
              {isSingleColumnVisible("product") && <th className="p-3 w-[260px]">配件与商品规格</th>}
              {isSingleColumnVisible("cost") && <th className="p-3 text-right">入库成本价</th>}
              {isSingleColumnVisible("market") && <th className="p-3 text-right">市场预估价</th>}
              {isSingleColumnVisible("status") && <th className="p-3 text-center">状态</th>}
              {isSingleColumnVisible("condition") && <th className="p-3">品相说明</th>}
              {isSingleColumnVisible("risk") && <th className="p-3 text-center">风险/拆修</th>}
              {isSingleColumnVisible("days") && <th className="p-3 text-center">在库天数</th>}
              {isSingleColumnVisible("location") && <th className="p-3">库位定位</th>}
              {isSingleColumnVisible("action") && <th className="p-3 pr-4 text-right">档案去向</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/50 text-xs font-mono">
            {filteredInventory.length === 0 ? (
              <tr>
                <td colSpan={singleVisibleColumnCount} className="p-10 text-center text-slate-500 font-bold">
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
                    {isSingleColumnVisible("select") && <td className="p-3 text-center">
                      <input
                        type="checkbox"
                        checked={selectedRowIds.includes(c.id)}
                        onChange={() => handleToggleSelectRow(c.id)}
                        className="rounded text-cyan-500 bg-slate-950 border-slate-800"
                      />
                    </td>}

                    {/* Code & S/N */}
                    {isSingleColumnVisible("code") && <td className="p-3">
                      <button
                        onClick={() => setDetailCard(c)}
                        className="font-bold text-cyan-400 hover:underline block text-left cursor-pointer"
                      >
                        {c.id}
                      </button>
                      <span className="text-[10px] text-slate-500 block truncate max-w-[140px] mt-0.5" title={c.sn}>
                        S/N: {c.sn}
                      </span>
                    </td>}

                    {/* Standard Specs */}
                    {isSingleColumnVisible("product") && <td className="p-3">
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
                    </td>}

                    {/* Costs */}
                    {isSingleColumnVisible("cost") && <td className="p-3 text-right">
                      {permissions.showCost ? (
                        <div className="font-bold text-slate-200">{c.costPrice}元</div>
                      ) : (
                        <div className="text-slate-600 block text-[10px]">无权查看</div>
                      )}
                      <div className="text-[9px] text-slate-500 mt-0.5">源: {c.sourceType}</div>
                    </td>}

                    {/* Market guidance estimation and warnings */}
                    {isSingleColumnVisible("market") && <td className={`p-3 text-right font-bold ${
                      isPriceUpturned ? "text-rose-400 font-extrabold" : "text-slate-400"
                    }`}>
                      <div>{c.marketPrice}元</div>
                      {isPriceUpturned && (
                        <span className="inline-block text-[8px] bg-rose-950/80 border border-rose-500/40 text-rose-300 font-sans p-0.2 px-1 rounded transform scale-95 mt-1 leading-none font-normal">
                          价值倒挂 {c.costPrice - c.marketPrice}元
                        </span>
                      )}
                    </td>}

                    {/* Status Badge */}
                    {isSingleColumnVisible("status") && <td className="p-3 text-center">
                      <span className={`inline-block px-2.5 py-0.5 rounded font-bold text-[10px] ${getStatusBadge(c.status)}`}>
                        {c.status}
                      </span>
                    </td>}

                    {/* Condition details */}
                    {isSingleColumnVisible("condition") && <td className="p-3">
                      <span className={`text-[11px] block ${getConditionColor(c.condition)}`}>
                        {c.condition}
                      </span>
                      <span className="text-[10px] text-slate-400 truncate max-w-[120px] block mt-0.5" title={c.remarks}>
                        {c.remarks || "无标签批注"}
                      </span>
                    </td>}

                    {/* Mining/Dismantle hazard index */}
                    {isSingleColumnVisible("risk") && <td className="p-3 text-center">
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
                    </td>}

                    {/* Aged metrics */}
                    {isSingleColumnVisible("days") && <td className="p-3 text-center font-bold">
                      <span className={isAgedBad ? "text-amber-400 bg-amber-400/10 px-1 rounded" : "text-slate-300"}>
                        {c.storageDays} 天
                      </span>
                      {isAgedBad && (
                        <div className="text-[8px] text-amber-500 font-normal leading-tight font-sans scale-95">超期积压</div>
                      )}
                    </td>}

                    {/* Locations */}
                    {isSingleColumnVisible("location") && <td className="p-3">
                      <div className="font-semibold text-slate-300 truncate max-w-[80px]" title={c.warehouseLocation}>
                        {c.warehouseLocation}
                      </div>
                      <div className="text-[9px] text-slate-500">{c.entryTime}</div>
                    </td>}

                    {/* Triggers & View Drawer */}
                    {isSingleColumnVisible("action") && <td className="p-3 text-right pr-4 whitespace-nowrap space-x-1">
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
                    </td>}
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
                    {permissions.showCost ? `收购入账成本: ${detailCard.costPrice}元` : ""}.
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
                    预计售价 {detailCard.estSellPrice}元。{detailCard.gpuRisk ? "☠️ 该卡带矿卡风险标签，须额外对小白解释。" : ""}
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
                      成交价: {detailCard.salesPrice}元。
                      {permissions.showProfit && detailCard.salesPrice && (
                        <span className="text-emerald-400 font-bold">
                          {" "}(实际毛纯利润: {detailCard.salesPrice - detailCard.costPrice}元)
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
                <span>扫码出入库</span>
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
                  readOnly={lockedHandlerState.readOnly}
                  disabled={lockedHandlerState.disabled}
                  className="bg-slate-950 border border-slate-800 text-xs text-slate-200 p-2.5 rounded cursor-not-allowed opacity-80"
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
                placeholder="普通扫码：扫入库存ID或已有SN。支持一行一个，也支持用空格、逗号分隔。按 Ctrl/⌘ + Enter 执行。"
              />

              {scanMode === "入库" && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div className="space-y-2 rounded-xl border border-blue-200 bg-blue-50 p-3">
                    <div className="flex items-center justify-between gap-3">
                      <label className="text-[10px] text-blue-600 font-bold uppercase tracking-wider">
                        显卡入库
                      </label>
                      <span className="text-[10px] text-slate-500">每行：快递单号 空格 SN</span>
                    </div>
                    <p className="text-[11px] text-slate-500 leading-relaxed">
                      只匹配显卡待检测档案，绑定实物 SN 后入库。其他配件不会进入此流程。
                    </p>
                    <textarea
                      value={scanTrackingSnText}
                      onChange={e => setScanTrackingSnText(e.target.value)}
                      onKeyDown={e => {
                        if ((e.metaKey || e.ctrlKey) && e.key === "Enter") executeScanFlow();
                      }}
                      className="w-full min-h-28 bg-slate-950 border border-slate-800 text-sm text-slate-100 p-3 rounded font-mono focus:outline-none focus:border-cyan-500"
                      placeholder={"SF13800138000 SN4090ABC001\nYT88888888888 SN5080XYZ002"}
                    />
                  </div>

                  <div className="space-y-2 rounded-xl border border-emerald-200 bg-emerald-50 p-3">
                    <div className="flex items-center justify-between gap-3">
                      <label className="text-[10px] text-emerald-700 font-bold uppercase tracking-wider">
                        其他配件入库
                      </label>
                      <span className="text-[10px] text-slate-500">扫码库存ID / 条码</span>
                    </div>
                    <p className="text-[11px] text-slate-500 leading-relaxed">
                      CPU、主板、内存、硬盘、电源等配件进货后默认直接入库。这里用于确认实物到库和最终库位，不录显卡 SN。
                    </p>
                    <textarea
                      value={scanAccessoryCodesText}
                      onChange={e => setScanAccessoryCodesText(e.target.value)}
                      onKeyDown={e => {
                        if ((e.metaKey || e.ctrlKey) && e.key === "Enter") executeScanFlow();
                      }}
                      className="w-full min-h-28 bg-white border border-emerald-200 text-sm text-slate-900 p-3 rounded font-mono focus:outline-none focus:border-emerald-500"
                      placeholder={"KC-20260605-CPU001\nKC-20260605-MB002"}
                    />
                    <div className="rounded-lg border border-emerald-100 bg-white px-3 py-2 text-[11px] text-slate-500">
                      只处理非显卡库存。扫到显卡会提示改走“显卡入库 / 检测录入”。
                    </div>
                  </div>
                </div>
              )}

              <input
                value={scanRemarks}
                onChange={e => setScanRemarks(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 text-xs text-slate-200 p-2.5 rounded"
                placeholder="备注，如顺丰发货、盘点入库、库位调整原因"
              />

              <div className="bg-slate-950 border border-slate-850 p-3 text-[11px] text-slate-400 leading-relaxed">
                显卡入库走“快递单号 + SN”并只匹配显卡待检档案；其他配件入库扫库存ID确认库位即可。出库会标记为“已售出”并记录出库对象；移库只修改库位不改状态。
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
