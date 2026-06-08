/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo, useEffect, useRef } from "react";
import {
  Wrench,
  Activity,
  CheckCircle,
  ChevronRight,
  SlidersHorizontal,
  Flame,
  Camera,
  CameraOff,
  X
} from "lucide-react";
import { useStoreStateReturn } from "../utils/state";
import { getLockedHandlerFieldState } from "../utils/sessionUser";
import { CardInventory } from "../types";

interface InspectionManagerProps {
  storeState: useStoreStateReturn;
}

export default function InspectionManager({ storeState }: InspectionManagerProps) {
  const {
    inventory,
    inspections,
    submitInspection,
    currentRole,
    currentUser
  } = storeState;
  const lockedHandlerState = getLockedHandlerFieldState(currentUser, currentRole);
  const defaultHandlerName = lockedHandlerState.value;

  // Selected card to inspect
  const [selectedCardId, setSelectedCardId] = useState<string | null>(null);

  // Bench checklist form states
  const [exteriorCheck, setExteriorCheck] = useState<"完美无瑕" | "轻微刮花" | "氧化发黄" | "挡板生锈" | "严重磕碰">("完美无瑕");
  const [fanCheck, setFanCheck] = useState<"静音顺畅" | "轻微异响" | "抖动偏摆" | "风扇停转">("静音顺畅");
  const [portsCheck, setPortsCheck] = useState<"全部正常" | "部分接口无信号" | "物理变形">("全部正常");
  const [gpuzCheck, setGpuzCheck] = useState<"核对一致" | "规格异常 / 假卡山寨">("核对一致");
  
  const [furmarkResult, setFurmarkResult] = useState("");
  const [threedMarkResult, setThreedMarkResult] = useState("");
  const [vramResult, setVramResult] = useState<"全显存测试通过" | "某显卡测试通道错误" | "黄屏/花屏">("全显存测试通过");
  
  const [temperature, setTemperature] = useState<number>(72);
  const [wattage, setWattage] = useState<number>(350);
  const [noise, setNoise] = useState<"静音" | "适中" | "噪音明显">("适中");
  
  const [repaired, setRepaired] = useState(false);
  const [hiddenDefects, setHiddenDefects] = useState(false);
  const [remarks, setRemarks] = useState("");
  const [techInspector, setTechInspector] = useState(defaultHandlerName);
  const [physicalSn, setPhysicalSn] = useState("");
  const conditionOptions: CardInventory["condition"][] = [
    "全新官换",
    "充新99新",
    "靓机95新",
    "良品90新",
    "微划伤85新",
    "瑕疵实用",
    "矿卡高阻值"
  ];
  const [finalCondition, setFinalCondition] = useState<CardInventory["condition"]>("充新99新");
  const [inWarranty, setInWarranty] = useState(true);
  const [warrantyDate, setWarrantyDate] = useState("");
  const [fullBox, setFullBox] = useState(true);
  const [warehouseLocation, setWarehouseLocation] = useState("A区货架-01");
  const scannerVideoRef = useRef<HTMLVideoElement>(null);
  const scannerStreamRef = useRef<MediaStream | null>(null);
  const [isSnScannerOpen, setIsSnScannerOpen] = useState(false);
  const [scannerManualSn, setScannerManualSn] = useState("");
  const [scannerDetectedSn, setScannerDetectedSn] = useState("");
  const [scannerError, setScannerError] = useState("");
  const [scannerCameraReady, setScannerCameraReady] = useState(false);

  const [resultStatus, setResultStatus] = useState<"通过" | "轻微问题" | "需要维修" | "拒收入库" | "降价入库">("通过");

  // Filter list of inventory items in "待检测" or "检测中" state
  const pendingGpus = useMemo(() => {
    return inventory.filter(c => (c.category || "显卡") === "显卡" && (c.status === "待检测" || c.status === "检测中"));
  }, [inventory]);

  const inspectedInventoryIds = useMemo(() => new Set(inspections.map(item => item.inventoryId)), [inspections]);

  const pendingAccessories = useMemo(() => {
    return inventory.filter(c => {
      const category = c.category || "显卡";
      return category !== "显卡" &&
        !inspectedInventoryIds.has(c.id) &&
        !["已售出", "已报废", "已退货"].includes(c.status);
    });
  }, [inspectedInventoryIds, inventory]);

  // Combined previously tested records
  const passedGpus = useMemo(() => {
    return inspections;
  }, [inspections]);

  // Get active item details
  const activeCard = useMemo(() => {
    return inventory.find(c => c.id === selectedCardId) || null;
  }, [selectedCardId, inventory]);

  useEffect(() => {
    setTechInspector(defaultHandlerName);
  }, [defaultHandlerName]);

  const activeIsGpu = (activeCard?.category || "显卡") === "显卡";

  useEffect(() => {
    if (!isSnScannerOpen) return;

    let cancelled = false;
    let frameId = 0;
    let detector: { detect: (source: HTMLVideoElement) => Promise<Array<{ rawValue?: string }>> } | null = null;

    const startCamera = async () => {
      setScannerError("");
      setScannerDetectedSn("");
      setScannerCameraReady(false);

      if (!navigator.mediaDevices?.getUserMedia) {
        setScannerError("当前浏览器不支持摄像头调用，请手动输入 SN。");
        return;
      }

      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: {
            facingMode: { ideal: "environment" },
            width: { ideal: 1280 },
            height: { ideal: 720 }
          },
          audio: false
        });

        if (cancelled) {
          stream.getTracks().forEach(track => track.stop());
          return;
        }

        scannerStreamRef.current = stream;
        setScannerCameraReady(true);
        if (scannerVideoRef.current) {
          scannerVideoRef.current.srcObject = stream;
          await scannerVideoRef.current.play().catch(() => undefined);
        }

        const BarcodeDetectorCtor = (window as unknown as {
          BarcodeDetector?: new (options?: { formats?: string[] }) => {
            detect: (source: HTMLVideoElement) => Promise<Array<{ rawValue?: string }>>;
          };
        }).BarcodeDetector;

        if (!BarcodeDetectorCtor) {
          setScannerError("摄像头已打开，但当前浏览器不支持自动识别条码；可对照画面手动输入 SN。");
          return;
        }

        try {
          detector = new BarcodeDetectorCtor({
            formats: ["code_128", "code_39", "code_93", "ean_13", "ean_8", "qr_code", "data_matrix"]
          });
        } catch {
          detector = new BarcodeDetectorCtor();
        }

        const scanFrame = async () => {
          if (cancelled || !scannerVideoRef.current || !detector) return;
          const video = scannerVideoRef.current;

          if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) {
            try {
              const results = await detector.detect(video);
              const value = results[0]?.rawValue?.trim();
              if (value) {
                setScannerDetectedSn(value);
                setScannerManualSn(value);
              }
            } catch {
              // Keep camera preview alive even if a single frame cannot be decoded.
            }
          }

          frameId = window.requestAnimationFrame(scanFrame);
        };

        frameId = window.requestAnimationFrame(scanFrame);
      } catch (error) {
        const message = error instanceof Error ? error.message : "未知错误";
        setScannerError(`摄像头调用失败：${message}。请检查浏览器权限，或手动输入 SN。`);
      }
    };

    startCamera();

    return () => {
      cancelled = true;
      if (frameId) window.cancelAnimationFrame(frameId);
      scannerStreamRef.current?.getTracks().forEach(track => track.stop());
      scannerStreamRef.current = null;
    };
  }, [isSnScannerOpen]);

  // Seed form values once row is clicked
  const handleSelectCard = (card: CardInventory) => {
    setSelectedCardId(card.id);
    setPhysicalSn(card.sn || "");
    setFinalCondition(card.condition);
    setInWarranty(card.inWarranty);
    setWarrantyDate(card.warrantyDate || "");
    setRepaired(card.repaired);
    setFullBox(card.fullBox);
    setWarehouseLocation(card.warehouseLocation && card.warehouseLocation !== "待检测区" ? card.warehouseLocation : "A区货架-01");
    
    // Auto preset reasonable defaults based on the model power requirements
    if (card.model.includes("4090")) {
      setTemperature(72);
      setWattage(450);
      setFurmarkResult("烤机20分钟，核心维持在72℃，稳频，无掉电无啸叫");
    } else if (card.model.includes("5080")) {
      setTemperature(69);
      setWattage(400);
      setFurmarkResult("烤机15分钟，散热装甲表现极佳，核心维持在69℃");
    } else if (card.model.includes("3080")) {
      setTemperature(78);
      setWattage(320);
      setFurmarkResult("烤机15分钟，涡轮转速呼啸明显，核心维持在78℃，散热一般");
    } else {
      setTemperature(74);
      setWattage(250);
    }
  };

  const openSnScanner = () => {
    setScannerManualSn(physicalSn);
    setScannerDetectedSn("");
    setScannerError("");
    setIsSnScannerOpen(true);
  };

  const closeSnScanner = () => {
    setIsSnScannerOpen(false);
    setScannerManualSn("");
    setScannerDetectedSn("");
    setScannerError("");
    setScannerCameraReady(false);
  };

  const confirmScannedSn = () => {
    const value = (scannerManualSn || scannerDetectedSn).trim();
    if (!value) {
      alert("请先扫码识别或手动输入 SN。");
      return;
    }
    setPhysicalSn(value);
    closeSnScanner();
  };

  const handlePostReport = (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeCard) return;
    const sn = physicalSn.trim();
    if (!sn) {
      alert("检测入库必须录入 SN。请先核对实物 SN 或自定义贴标后再提交。");
      return;
    }
    const finalWarehouseLocation = warehouseLocation.trim();
    if (!finalWarehouseLocation) {
      alert("检测入库必须录入最终存放位置。");
      return;
    }

    try {
      submitInspection({
        inventoryId: activeCard.id,
        sn,
        condition: finalCondition,
        inWarranty,
        warrantyDate: inWarranty ? warrantyDate : undefined,
        fullBox,
        warehouseLocation: finalWarehouseLocation,
        inspector: techInspector,
        exteriorCheck: activeIsGpu ? exteriorCheck : "完美无瑕",
        fanCheck: activeIsGpu ? fanCheck : "静音顺畅",
        portsCheck: activeIsGpu ? portsCheck : "全部正常",
        gpuzCheck: activeIsGpu ? gpuzCheck : "核对一致",
        furmarkResult: activeIsGpu ? furmarkResult : "其他配件简易检测，不做显卡烤机",
        threedMarkResult: activeIsGpu ? threedMarkResult : "其他配件简易检测，不做显卡跑分",
        vramResult: activeIsGpu ? vramResult : "全显存测试通过",
        temperature: activeIsGpu ? Number(temperature) : 0,
        wattage: activeIsGpu ? Number(wattage) : 0,
        noise: activeIsGpu ? noise : "静音",
        repaired: activeIsGpu ? repaired : false,
        hiddenDefects: activeIsGpu ? hiddenDefects : false,
        resultStatus: activeIsGpu ? resultStatus : "通过",
        remarks: activeIsGpu ? remarks : `其他配件简易检测：SN、成色、带盒、保修期已确认。${remarks}`.trim()
      });
    } catch (error) {
      alert(error instanceof Error ? error.message : "检测报告提交失败，请检查 SN 是否重复。");
      return;
    }

    alert(`${activeCard.id} 检测记录已提交。\nSN、成色、带盒、保修期和最终库位已写入库存档案。`);
    setSelectedCardId(null);
    setPhysicalSn("");
    setFinalCondition("充新99新");
    setInWarranty(true);
    setWarrantyDate("2028-12-10");
    setRepaired(false);
    setFullBox(true);
    setWarehouseLocation("A区货架-01");
  };

  return (
    <div className="space-y-4">
      {/* Title */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-slate-900 p-5 rounded-2xl border border-slate-800">
        <div>
          <h2 className="text-base font-bold text-slate-100 flex items-center gap-2">
            <Wrench className="w-5 h-5 text-purple-400 animate-pulse" />
            <span>检测录入</span>
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            显卡走完整检测流程，其他配件走简易检测流程，分别进入独立检测池。
          </p>
        </div>
        <div className="text-right">
          <span className="text-[11px] font-mono text-slate-500 font-bold block">当前待检数量</span>
          <span className="text-purple-400 text-lg font-black font-mono">{pendingGpus.length + pendingAccessories.length} 件剩余</span>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* LEFT COLUMN: PIPELINE OF PENDING GPUS */}
        <div className="lg:col-span-1 space-y-4.5">
          {/* Waiting Bench list */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 space-y-3 shadow-md">
            <h3 className="text-xs font-bold text-slate-100 uppercase tracking-wider flex items-center justify-between border-b border-slate-800 pb-2">
              <span className="flex items-center gap-1.5"><Activity className="w-4 h-4 text-purple-400" /> 显卡检测池 ({pendingGpus.length})</span>
              <span className="text-[9px] bg-purple-500/10 text-purple-400 px-1 rounded animate-pulse">待质检</span>
            </h3>

            <div className="space-y-2.5 max-h-[300px] overflow-y-auto pr-1">
              {pendingGpus.length === 0 ? (
                <div className="p-8 text-center text-slate-500 font-medium text-xs">
                  👏 太棒了！所有进货回收卡牌已全部质检核查完毕！库库存已达最佳上架率。
                </div>
              ) : (
                pendingGpus.map(card => (
                  <button
                    key={card.id}
                    onClick={() => handleSelectCard(card)}
                    className={`w-full text-left p-3 rounded-lg border transition-all flex items-center justify-between group cursor-pointer ${
                      selectedCardId === card.id
                        ? "bg-purple-950/30 border-purple-500/80 shadow-[inset_0_1px_1px_rgba(255,255,255,0.05)]"
                        : "bg-slate-950 border-slate-850 hover:border-slate-700"
                    }`}
                  >
                    <div className="space-y-1 truncate max-w-[200px]">
                      <span className="text-xs font-extrabold text-slate-200 block group-hover:text-cyan-400 truncate">{card.productName}</span>
                      <span className="text-[10px] text-slate-500 font-mono block">
                        档案ID: {card.id} | SN: {card.sn || "待检测录入"}
                      </span>
                      <span className="text-[9px] text-slate-400 block bg-slate-900 px-1 py-0.5 rounded-sm inline-block font-mono">
                        收购源: {card.supplierName}
                      </span>
                    </div>

                    <div className="text-right whitespace-nowrap shrink-0 ml-1">
                      <span className="text-[10px] font-mono text-amber-500 block">待测状态</span>
                      <span className="text-[8px] text-slate-600 block mt-1 font-mono">入库天数: {card.storageDays}天</span>
                      <ChevronRight className="w-4 h-4 text-slate-550 inline-block group-hover:translate-x-0.5 duration-150 mt-1" />
                    </div>
                  </button>
                ))
              )}
            </div>
          </div>

          <div className="bg-white border border-slate-200 rounded-xl p-4 space-y-3 shadow-md">
            <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center justify-between border-b border-slate-200 pb-2">
              <span className="flex items-center gap-1.5"><SlidersHorizontal className="w-4 h-4 text-blue-600" /> 其他配件检测池子 ({pendingAccessories.length})</span>
              <span className="text-[9px] bg-blue-50 text-blue-600 px-1 rounded">简易检测</span>
            </h3>

            <div className="space-y-2.5 max-h-[260px] overflow-y-auto pr-1">
              {pendingAccessories.length === 0 ? (
                <div className="p-6 text-center text-slate-500 font-medium text-xs">
                  暂无待检测配件。CPU、主板、内存、硬盘、电源等会在这里做 SN、成色、带盒和保修确认。
                </div>
              ) : (
                pendingAccessories.map(card => (
                  <button
                    key={card.id}
                    onClick={() => handleSelectCard(card)}
                    className={`w-full text-left p-3 rounded-lg border transition-all flex items-center justify-between group cursor-pointer ${
                      selectedCardId === card.id
                        ? "bg-blue-50 border-blue-500 shadow-sm"
                        : "bg-slate-50 border-slate-200 hover:border-blue-300"
                    }`}
                  >
                    <div className="space-y-1 truncate max-w-[200px]">
                      <span className="text-xs font-extrabold text-slate-900 block group-hover:text-blue-600 truncate">{card.productName}</span>
                      <span className="text-[10px] text-slate-500 font-mono block">
                        {card.category || "其他配件"} | {card.id}
                      </span>
                      <span className="text-[9px] text-slate-500 block bg-white px-1 py-0.5 rounded-sm inline-block font-mono">
                        SN: {card.sn || "待录入"}
                      </span>
                    </div>

                    <div className="text-right whitespace-nowrap shrink-0 ml-1">
                      <span className="text-[10px] font-mono text-blue-600 block">{card.status}</span>
                      <span className="text-[8px] text-slate-500 block mt-1 font-mono">{card.warehouseLocation}</span>
                      <ChevronRight className="w-4 h-4 text-slate-400 inline-block group-hover:translate-x-0.5 duration-150 mt-1" />
                    </div>
                  </button>
                ))
              )}
            </div>
          </div>

          {/* Logged finished tests */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 space-y-3.5 shadow-md">
            <div className="flex items-center justify-between border-b border-slate-800 pb-2">
              <h3 className="text-xs font-bold text-slate-100 uppercase tracking-wider flex items-center gap-1.5 font-mono">
                <CheckCircle className="w-4 h-4 text-emerald-400" /> 已质检归档记录
              </h3>
              <span className="text-[10px] text-slate-500">{passedGpus.length} 次归档</span>
            </div>

            <div className="space-y-3 max-h-[250px] overflow-y-auto pr-1">
              {passedGpus.map(item => (
                <div key={item.id} className="p-2.5 bg-slate-950 rounded-lg border border-slate-850 text-xs">
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="font-extrabold text-slate-300">SN: {item.sn}</span>
                    <span className={`px-1 rounded font-bold text-[9px] ${
                      item.resultStatus === "通过" ? "bg-emerald-500/10 text-emerald-400" :
                      item.resultStatus === "轻微问题" ? "bg-blue-500/15 text-blue-300" : "bg-rose-500/20 text-rose-300"
                    }`}>
                      {item.resultStatus}
                    </span>
                  </div>
                  <div className="text-[10px] text-slate-500 mt-1">
                    烤机: <span className="font-mono text-slate-400">{item.furmarkResult}</span>
                  </div>
                  <div className="text-[9px] text-slate-500 flex justify-between mt-1">
                    <span>测试员: {item.inspector}</span>
                    <span className="font-mono">{item.inspectTime}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* RIGHT COLUMN: BENCH FORM WORKPLACE */}
        <div className="lg:col-span-2">
          {activeCard ? (
            <form onSubmit={handlePostReport} className="bg-slate-900 border border-slate-805 rounded-xl p-5 space-y-5 shadow-xl relative overflow-hidden">
              {/* Glow accent */}
              <div className="absolute top-0 right-0 w-32 h-32 bg-purple-500/5 rounded-full blur-2xl"></div>

              {/* Card specs top panel */}
              <div className="bg-slate-950 p-4 rounded-xl border border-slate-855 relative">
                <div className={`absolute top-3 right-3 text-[10px] font-bold border px-2 py-0.5 rounded font-mono ${
                  activeIsGpu
                    ? "text-purple-400 bg-purple-500/10 border-purple-500/30 animate-pulse"
                    : "text-blue-400 bg-blue-500/10 border-blue-500/30"
                }`}>
                  {activeIsGpu ? "显卡完整检测" : "其他配件简易检测"}
                </div>
                <h4 className="text-sm font-black text-slate-100">{activeCard.productName}</h4>
                <div className="mt-2.5 grid grid-cols-3 gap-4 text-xs font-mono">
                  <div>
                    <span className="text-slate-500 block">独立库存编号</span>
                    <span className="text-slate-300 font-bold">{activeCard.id}</span>
                  </div>
                  <div>
                    <span className="text-slate-500 block">PCB物理序列号</span>
                    <span className="text-slate-300 font-bold text-cyan-300">{activeCard.sn || "待检测录入"}</span>
                  </div>
                  <div>
                    <span className="text-slate-500 block">检测类型</span>
                    <span className="text-slate-300">{activeIsGpu ? "显卡检测入库" : "其他配件检测"}</span>
                  </div>
                </div>
              </div>

              {/* Ticking checks */}
              <div className="p-4 bg-blue-50 border border-blue-100 rounded-xl grid grid-cols-1 md:grid-cols-[1fr_1.2fr] gap-4 items-end">
                <div>
                  <label className="text-[10px] text-blue-600 font-black tracking-wider uppercase block mb-1">入库 SN 录入</label>
                  <div className="flex gap-2">
                    <input
                      value={physicalSn}
                      onChange={e => setPhysicalSn(e.target.value)}
                      required
                      placeholder={activeCard.expressNo ? `快递 ${activeCard.expressNo} 到货后录入实物SN` : "扫描或输入实物 SN"}
                      className="min-w-0 flex-1 bg-white border border-blue-200 text-sm text-slate-900 p-3 rounded-lg font-mono focus:outline-none focus:border-blue-500"
                    />
                    <button
                      type="button"
                      onClick={openSnScanner}
                      title="调用摄像头扫码录入 SN"
                      className="h-12 w-12 shrink-0 bg-blue-600 hover:bg-blue-500 text-white rounded-lg flex items-center justify-center transition-colors"
                    >
                      <Camera className="w-4 h-4" />
                    </button>
                  </div>
                </div>
                <div className="text-[11px] text-slate-500 leading-relaxed">
                  {activeIsGpu
                    ? "显卡检测录入会写入 SN，并按检测结论更新为已入库、维修中或已退货。"
                    : "其他配件只做简易检测：SN、成色、是否带盒、保修期，提交后写入库存档案。"}
                  {activeCard.expressNo && <span className="block mt-1 font-mono text-blue-600">关联快递单号：{activeCard.expressNo}</span>}
                </div>
              </div>

              <div className="p-4 bg-white border border-slate-200 rounded-xl space-y-3">
                <div>
                  <h4 className="text-xs font-black text-slate-900">入库属性确认</h4>
                  <p className="text-[11px] text-slate-500 mt-1">
                    {activeIsGpu
                      ? "成色、保修、拆修、带盒和最终存放位置以检测录入为准，提交后写入库存档案。"
                      : "其他配件只确认 SN、成色、带盒、保修期和最终存放位置。"}
                  </p>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-[10px] text-slate-500 font-bold tracking-wider block">最终存放位置</label>
                    <input
                      value={warehouseLocation}
                      onChange={e => setWarehouseLocation(e.target.value)}
                      required
                      placeholder="A区货架-01"
                      className="w-full h-11 bg-white border border-slate-200 text-sm text-slate-900 px-3 rounded-lg focus:outline-none focus:border-blue-500"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[10px] text-slate-500 font-bold tracking-wider block">成色级别</label>
                    <select
                      value={finalCondition}
                      onChange={e => setFinalCondition(e.target.value as CardInventory["condition"])}
                      className="w-full h-11 bg-white border border-slate-200 text-sm text-slate-900 px-3 rounded-lg focus:outline-none focus:border-blue-500"
                    >
                      {conditionOptions.map(option => (
                        <option key={option} value={option}>{option}</option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-1.5 md:col-span-2 xl:col-span-2">
                    <label className="text-[10px] text-slate-500 font-bold tracking-wider block">保修期</label>
                    <div className="flex flex-col sm:flex-row gap-2 items-stretch sm:items-center">
                      <label className="h-11 w-full sm:w-24 shrink-0 px-3 rounded-lg border border-slate-200 bg-slate-50 flex items-center justify-center gap-2 text-sm font-bold text-slate-700">
                        <input
                          type="checkbox"
                          checked={inWarranty}
                          onChange={e => setInWarranty(e.target.checked)}
                          className="rounded text-blue-600 border-slate-300"
                        />
                        <span>在保</span>
                      </label>
                      <input
                        type="date"
                        value={warrantyDate}
                        disabled={!inWarranty}
                        onChange={e => setWarrantyDate(e.target.value)}
                        className="min-w-0 flex-1 h-11 bg-white border border-slate-200 text-sm text-slate-900 px-3 rounded-lg font-mono focus:outline-none focus:border-blue-500 disabled:text-slate-400 disabled:bg-slate-50"
                      />
                    </div>
                  </div>

                  {activeIsGpu && (
                    <div className="space-y-1.5 md:col-span-2 xl:col-span-1">
                    <label className="text-[10px] text-slate-500 font-bold tracking-wider block">拆修 / 带盒</label>
                    <div className="min-h-11 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 flex flex-wrap items-center gap-x-5 gap-y-2">
                      <label className="flex items-center gap-2 text-sm font-bold text-slate-700 cursor-pointer whitespace-nowrap">
                        <input
                          type="checkbox"
                          checked={repaired}
                          onChange={e => setRepaired(e.target.checked)}
                          className="rounded text-blue-600 border-slate-300"
                        />
                        <span>曾拆修</span>
                      </label>
                      <label className="flex items-center gap-2 text-sm font-bold text-slate-700 cursor-pointer whitespace-nowrap">
                        <input
                          type="checkbox"
                          checked={fullBox}
                          onChange={e => setFullBox(e.target.checked)}
                          className="rounded text-blue-600 border-slate-300"
                        />
                        <span>带盒</span>
                      </label>
                    </div>
                    </div>
                  )}
                  {!activeIsGpu && (
                    <div className="space-y-1.5 md:col-span-2 xl:col-span-1">
                      <label className="text-[10px] text-slate-500 font-bold tracking-wider block">是否带盒</label>
                      <label className="h-11 rounded-lg border border-slate-200 bg-slate-50 px-3 flex items-center gap-2 text-sm font-bold text-slate-700 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={fullBox}
                          onChange={e => setFullBox(e.target.checked)}
                          className="rounded text-blue-600 border-slate-300"
                        />
                        <span>{fullBox ? "带盒" : "无盒"}</span>
                      </label>
                    </div>
                  )}
                </div>
              </div>

              {!activeIsGpu && (
                <div className="p-4 bg-blue-50 border border-blue-100 rounded-xl">
                  <h4 className="text-xs font-black text-blue-700">其他配件检测池子</h4>
                  <p className="text-[11px] text-slate-500 mt-1 leading-relaxed">
                    当前为配件简易检测，不需要录入烤机、跑分、显存和功耗。确认 SN、成色、带盒、保修期后即可完成检测归档。
                  </p>
                </div>
              )}

              {activeIsGpu && (
                <>
              {/* Ticking checks */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Exterior checklist */}
                <div className="space-y-1.5">
                  <label className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">1. 物理外观与挡板腐蚀筛选</label>
                  <select
                    value={exteriorCheck}
                    onChange={e => setExteriorCheck(e.target.value as any)}
                    className="w-full bg-slate-950 border border-slate-800 text-xs text-slate-200 p-2.5 rounded focus:outline-none"
                  >
                    <option value="完美无瑕">完美无瑕 (PCB板无焦无垢、散热鳍片笔直)</option>
                    <option value="轻微刮花">轻微刮花 (外壳正常插拔轻微划伤)</option>
                    <option value="氧化发黄">氧化发黄 (PCB略微渗油、核心背部发黄)</option>
                    <option value="挡板生锈">挡板生锈 (空气潮温、接口氧化)</option>
                    <option value="严重磕碰">严重磕碰 (鳍片损角、变形凹陷)</option>
                  </select>
                </div>

                {/* Fan bearings checking */}
                <div className="space-y-1.5">
                  <label className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">2. 风扇轴承 & 侧LCD屏</label>
                  <select
                    value={fanCheck}
                    onChange={e => setFanCheck(e.target.value as any)}
                    className="w-full bg-slate-950 border border-slate-800 text-xs text-slate-200 p-2.5 rounded focus:outline-none"
                  >
                    <option value="静音顺畅">静音顺畅 (满负载静音平稳、阻值正常)</option>
                    <option value="轻微异响">轻微异响 (叶片略带灰尘、轻微轴噪声)</option>
                    <option value="抖动偏摆">抖动偏摆 (塑料框架轻微断裂、叶片晃动)</option>
                    <option value="风扇停转">风扇停转 (轴承烧毁、无PWM控制信号)</option>
                  </select>
                </div>

                {/* Physical ports signal */}
                <div className="space-y-1.5">
                  <label className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">3. 信号接口检查 (DP/HDMI)</label>
                  <select
                    value={portsCheck}
                    onChange={e => setPortsCheck(e.target.value as any)}
                    className="w-full bg-slate-950 border border-slate-800 text-xs text-slate-200 p-2.5 rounded focus:outline-none"
                  >
                    <option value="全部正常">全部正常 (全部DP与HDMI满帧握手)</option>
                    <option value="部分接口无信号">部分接口无信号 (某一DP断路失联、插槽松脱)</option>
                    <option value="物理变形">物理变形 (插头撞击下沉、金属片脱裂)</option>
                  </select>
                </div>

                {/* Bios core chip GPu-Z */}
                <div className="space-y-1.5">
                  <label className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">4. GPU-Z 官方数据库一致性</label>
                  <select
                    value={gpuzCheck}
                    onChange={e => setGpuzCheck(e.target.value as any)}
                    className="w-full bg-slate-950 border border-slate-800 text-xs text-slate-200 p-2.5 rounded focus:outline-none"
                  >
                    <option value="核对一致">核对一致 (核心、BIOS厂商、频率通道均通过验证)</option>
                    <option value="规格异常 / 假卡山寨">规格异常 / 假卡山寨 (核心降规格、刷假BIOS假显存)</option>
                  </select>
                </div>
              </div>

              {/* Bench pressure and Furmark */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 border-t border-slate-800/80 pt-3">
                <div className="space-y-1.5">
                  <label className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block flex items-center justify-between">
                    <span>5. FurMark (甜甜圈烘烤表现评价)</span>
                    <span className="text-[9px] text-rose-450 uppercase animate-pulse flex items-center gap-0.5"><Flame className="w-2.5 h-2.5 text-rose-500" /> STRESS ACTIVE</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={furmarkResult}
                    onChange={e => setFurmarkResult(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 text-xs text-slate-200 p-2.5 rounded font-mono"
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">6. 3DMark 压力测试(TimeSpy跑分)</label>
                  <input
                    type="text"
                    required
                    value={threedMarkResult}
                    onChange={e => setThreedMarkResult(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 text-xs text-slate-200 p-2.5 rounded"
                  />
                </div>
              </div>

              {/* VRAM Channel mapping */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 border-t border-slate-800/80 pt-3">
                <div className="space-y-1.5">
                  <label className="text-[10px] text-slate-400 font-bold block">显存单元 bit-error 测试</label>
                  <select
                    value={vramResult}
                    onChange={e => setVramResult(e.target.value as any)}
                    className="w-full bg-slate-950 border border-slate-800 text-xs text-slate-300 p-2.5 rounded"
                  >
                    <option value="全显存测试通过">全显存通道校验[PASS] (无坏点块)</option>
                    <option value="某显卡测试通道错误">某通道损坏 / 高阻值 (显卡有坏存、易花屏)</option>
                    <option value="黄屏/花屏">严重显存黄屏/花屏 (芯片虚焊过热劣化)</option>
                  </select>
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] text-slate-400 font-bold block">最大核心温度 (°C)</label>
                  <input
                    type="number"
                    value={temperature}
                    onChange={e => setTemperature(Number(e.target.value))}
                    className={`w-full bg-slate-950 border text-xs p-2.5 rounded font-mono font-bold ${
                      temperature > 83 ? "border-rose-450 text-rose-400 focus:border-rose-500 animate-pulse" : "border-slate-800 text-cyan-400"
                    }`}
                  />
                </div>

                <div className="space-y-1.5">
                  <label className="text-[10px] text-slate-400 font-bold block">最大烤机功耗瓦数 (W)</label>
                  <input
                    type="number"
                    value={wattage}
                    onChange={e => setWattage(Number(e.target.value))}
                    className="w-full bg-slate-950 border border-slate-800 text-xs text-slate-300 p-2.5 rounded font-mono font-bold"
                  />
                </div>
              </div>

              {/* Hidden Defects and Repairs history */}
              <div className="bg-slate-950 p-3.5 rounded-xl border border-slate-850 flex flex-wrap items-center gap-6 text-xs text-slate-300">
                <label className="flex items-center gap-2 cursor-pointer font-semibold">
                  <input
                    type="checkbox"
                    checked={repaired}
                    onChange={e => setRepaired(e.target.checked)}
                    className="rounded text-purple-500 bg-slate-900 border-slate-800 focus:ring-0"
                  />
                  <span>探针发现 PCB 板曾有第三方吹焊维修金手修复痕迹</span>
                </label>

                <label className="flex items-center gap-2 cursor-pointer font-semibold">
                  <input
                    type="checkbox"
                    checked={hiddenDefects}
                    onChange={e => setHiddenDefects(e.target.checked)}
                    className="rounded text-purple-500 bg-slate-900 border-slate-800 focus:ring-0"
                  />
                  <span>存在偶发隐匿故障 (例如：接双流开多屏时可能偶发掉驱动)</span>
                </label>
              </div>

              {/* QC EVALUATION CONCLUSION (核心结论) */}
              <div className="p-4 bg-slate-950 rounded-xl border border-slate-850 grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="text-[10px] text-purple-400 font-black tracking-wider uppercase block mb-1">物理评定检测结论去向</label>
                  <select
                    value={resultStatus}
                    onChange={e => setResultStatus(e.target.value as any)}
                    className="w-full bg-slate-900 border border-slate-800 text-xs text-slate-100 p-2.5 rounded font-bold"
                  >
                    <option value="通过">💯 烤机高跑分通过 &rarr; 上架为[可售商品]</option>
                    <option value="轻微问题">⚠️ 轻微瑕疵 &rarr; 降级标记为[瑕疵可售]</option>
                    <option value="需要维修">🔧 核对出现暗病 &rarr; 转移给修理店[维修中]</option>
                    <option value="拒收入库">❌ 检测不符假货退货 &rarr; 回退供应商[已退货]</option>
                    <option value="降价入库">📉 品相受损申请打折 &rarr; 最终成本扣减10%</option>
                  </select>
                </div>

                <div>
                  <label className="text-[10px] text-slate-400 font-bold block mb-1">物理质检人员签名</label>
                  <input
                    type="text"
                    required
                    value={techInspector}
                    readOnly={lockedHandlerState.readOnly}
                    disabled={lockedHandlerState.disabled}
                    className="w-full bg-slate-900 border border-slate-800 text-xs text-slate-200 p-2.5 rounded cursor-not-allowed opacity-80"
                  />
                </div>
              </div>
                </>
              )}

              {/* Remarks */}
              <div className="space-y-1.5">
                <label className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">
                  {activeIsGpu ? "物理测试总体批注 (最终出张随存)" : "配件检测备注"}
                </label>
                <textarea
                  value={remarks}
                  onChange={e => setRemarks(e.target.value)}
                  placeholder={activeIsGpu ? "请输入该卡的风扇物理清灰建议、挡板翻新指导或者后续保修的核销条码说明..." : "可记录外观、附件、保修来源或包装情况..."}
                  className="w-full bg-slate-950 border border-slate-800 text-xs text-slate-200 p-2.5 rounded-lg h-16 resize-none focus:outline-none"
                ></textarea>
              </div>

              {/* Form submit footer */}
              <div className="flex justify-end gap-3.5 border-t border-slate-850 pt-4 text-xs">
                <button
                  type="button"
                  onClick={() => setSelectedCardId(null)}
                  className="px-4 py-2 border border-slate-705 rounded font-bold text-slate-300 hover:bg-slate-800"
                >
                  取消
                </button>
                <button
                  type="submit"
                  className={`px-5 py-2.5 font-black rounded-lg duration-200 ${
                    activeIsGpu
                      ? "bg-purple-500 hover:bg-purple-400 text-slate-950 shadow-[0_0_15px_rgba(168,85,247,0.3)]"
                      : "bg-blue-600 hover:bg-blue-500 text-white shadow-[0_0_15px_rgba(37,99,235,0.22)]"
                  }`}
                >
                  {activeIsGpu ? "提交测试报告 · 录 SN 入库" : "提交配件检测 · 录 SN 入库"}
                </button>
              </div>
            </form>
          ) : (
            <div className="bg-slate-900 border border-dashed border-slate-800 rounded-xl p-16 text-center space-y-4">
              <div className="w-16 h-16 bg-purple-950/40 text-purple-400 rounded-full border border-purple-800/40 flex items-center justify-center mx-auto text-xl font-bold font-mono">
                GPU-Z
              </div>
              <div>
                <p className="text-sm font-bold text-slate-200">请从左侧选择显卡或其他配件进行检测录入</p>
                <p className="text-xs text-slate-400 mt-1 max-w-[320px] mx-auto leading-relaxed">
                  显卡会加载完整检测项目；其他配件只需录入 SN、成色、带盒和保修期。
                </p>
              </div>
            </div>
          )}
        </div>
      </div>

      {isSnScannerOpen && (
        <div className="fixed inset-0 z-60 bg-slate-950/60 backdrop-blur-xs flex items-end sm:items-center justify-center p-3 sm:p-4">
          <div className="bg-white border border-slate-200 rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden text-slate-900">
            <div className="p-4 border-b border-slate-200 flex items-center justify-between">
              <h3 className="font-bold text-slate-950 flex items-center gap-2">
                <Camera className="w-5 h-5 text-blue-600" />
                <span>扫码录入 SN</span>
              </h3>
              <button type="button" onClick={closeSnScanner} className="text-slate-400 hover:text-slate-700">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-4 space-y-4">
              <div className="relative aspect-video overflow-hidden rounded-xl border border-slate-200 bg-slate-950 flex items-center justify-center">
                <video
                  ref={scannerVideoRef}
                  className="h-full w-full object-cover"
                  playsInline
                  muted
                />
                {!scannerCameraReady && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-slate-500 bg-slate-950">
                    <CameraOff className="w-8 h-8" />
                    <span className="text-xs font-bold">等待摄像头权限</span>
                  </div>
                )}
                <div className="absolute left-8 right-8 top-1/2 h-0.5 bg-blue-500/80 shadow-[0_0_12px_rgba(0,113,227,0.45)]"></div>
              </div>

              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 space-y-2">
                <div className="flex items-center justify-between gap-3 text-xs">
                  <span className="text-slate-500 font-bold">识别结果</span>
                  <span className={scannerDetectedSn ? "text-emerald-600 font-mono font-black" : "text-slate-500 font-mono"}>
                    {scannerDetectedSn || "尚未识别到条码"}
                  </span>
                </div>
                {scannerError && (
                  <div className="text-[11px] text-amber-600 leading-relaxed">
                    {scannerError}
                  </div>
                )}
              </div>

              <div>
                <label className="text-[10px] text-slate-500 font-bold tracking-wider block mb-1">手动 SN / 识别后确认</label>
                <input
                  value={scannerManualSn}
                  onChange={e => setScannerManualSn(e.target.value)}
                  placeholder="可扫码识别，也可手动输入 SN"
                  className="w-full h-12 bg-white border border-slate-200 text-sm text-slate-900 px-3 rounded-lg font-mono focus:outline-none focus:border-blue-500"
                />
              </div>

              <div className="flex flex-col sm:flex-row justify-end gap-2 text-xs">
                <button
                  type="button"
                  onClick={closeSnScanner}
                  className="w-full sm:w-auto px-4 py-2 border border-slate-200 rounded-lg font-semibold text-slate-500 hover:bg-slate-50"
                >
                  取消
                </button>
                <button
                  type="button"
                  onClick={confirmScannedSn}
                  className="w-full sm:w-auto px-5 py-2 bg-blue-600 hover:bg-blue-500 text-white font-black rounded-lg"
                >
                  填入 SN
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
