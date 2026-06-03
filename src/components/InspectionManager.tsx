/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo } from "react";
import {
  Wrench,
  Activity,
  AlertOctagon,
  CheckCircle,
  Clock,
  Play,
  RotateCcw,
  Sparkles,
  Sliders,
  ChevronRight,
  Info,
  ShieldAlert,
  SlidersHorizontal,
  Flame,
  Search,
  Hash
} from "lucide-react";
import { useStoreStateReturn } from "../utils/state";
import { CardInventory, InspectionRecord } from "../types";

interface InspectionManagerProps {
  storeState: useStoreStateReturn;
}

export default function InspectionManager({ storeState }: InspectionManagerProps) {
  const {
    inventory,
    inspections,
    submitInspection,
    logs,
    addLog,
    currentRole
  } = storeState;

  // Selected card to inspect
  const [selectedCardId, setSelectedCardId] = useState<string | null>(null);

  // Bench checklist form states
  const [exteriorCheck, setExteriorCheck] = useState<"完美无瑕" | "轻微刮花" | "氧化发黄" | "挡板生锈" | "严重磕碰">("完美无瑕");
  const [fanCheck, setFanCheck] = useState<"静音顺畅" | "轻微异响" | "抖动偏摆" | "风扇停转">("静音顺畅");
  const [portsCheck, setPortsCheck] = useState<"全部正常" | "部分接口无信号" | "物理变形">("全部正常");
  const [gpuzCheck, setGpuzCheck] = useState<"核对一致" | "规格异常 / 假卡山寨">("核对一致");
  
  const [furmarkResult, setFurmarkResult] = useState("烤机15分钟，温度维持在70度，风扇转速正常，无死机花屏");
  const [threedMarkResult, setThreedMarkResult] = useState("TimeSpy 压力测试通过率 98.6%");
  const [vramResult, setVramResult] = useState<"全显存测试通过" | "某显卡测试通道错误" | "黄屏/花屏">("全显存测试通过");
  
  const [temperature, setTemperature] = useState<number>(72);
  const [wattage, setWattage] = useState<number>(350);
  const [noise, setNoise] = useState<"静音" | "适中" | "噪音明显">("适中");
  
  const [repaired, setRepaired] = useState(false);
  const [hiddenDefects, setHiddenDefects] = useState(false);
  const [remarks, setRemarks] = useState("");
  const [techInspector, setTechInspector] = useState("老默 (质检组长)");

  const [resultStatus, setResultStatus] = useState<"通过" | "轻微问题" | "需要维修" | "拒收入库" | "降价入库">("通过");

  // Filter list of inventory items in "待检测" or "检测中" state
  const pendingGpus = useMemo(() => {
    return inventory.filter(c => c.status === "待检测" || c.status === "检测中");
  }, [inventory]);

  // Combined previously tested records
  const passedGpus = useMemo(() => {
    return inspections;
  }, [inspections]);

  // Get active item details
  const activeCard = useMemo(() => {
    return inventory.find(c => c.id === selectedCardId) || null;
  }, [selectedCardId, inventory]);

  // Seed form values once row is clicked
  const handleSelectCard = (card: CardInventory) => {
    setSelectedCardId(card.id);
    
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

  const handlePostReport = (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeCard) return;

    submitInspection({
      inventoryId: activeCard.id,
      sn: activeCard.sn,
      inspector: techInspector,
      exteriorCheck,
      fanCheck,
      portsCheck,
      gpuzCheck,
      furmarkResult,
      threedMarkResult,
      vramResult,
      temperature: Number(temperature),
      wattage: Number(wattage),
      noise,
      repaired,
      hiddenDefects,
      resultStatus,
      remarks
    });

    alert(`${activeCard.id} 质检报告已提交。\n库存状态已根据质检结果自动更新。`);
    setSelectedCardId(null);
  };

  return (
    <div className="space-y-4">
      {/* Title */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-slate-900 p-5 rounded-2xl border border-slate-800">
        <div>
          <h2 className="text-base font-bold text-slate-100 flex items-center gap-2">
            <Wrench className="w-5 h-5 text-purple-400 animate-pulse" />
            <span>显卡上架质检测物理评定 (GPU-Z & FurMark 烤盘)</span>
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            一卡检测、一卡出纸制度。所有待售或回收二手卡，必须经过严格物理筛查（测试阻值、外观、风扇轴承、金手指探点和高负载测试），防止坏卡出库降低店铺评级。
          </p>
        </div>
        <div className="text-right">
          <span className="text-[11px] font-mono text-slate-500 font-bold block">当前排队质测卡量</span>
          <span className="text-purple-400 text-lg font-black font-mono">{pendingGpus.length} 张剩余</span>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* LEFT COLUMN: PIPELINE OF PENDING GPUS */}
        <div className="lg:col-span-1 space-y-4.5">
          {/* Waiting Bench list */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 space-y-3 shadow-md">
            <h3 className="text-xs font-bold text-slate-100 uppercase tracking-wider flex items-center justify-between border-b border-slate-800 pb-2">
              <span className="flex items-center gap-1.5"><Activity className="w-4 h-4 text-purple-400" /> 等待检测盘点池 ({pendingGpus.length})</span>
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
                        档案ID: {card.id} | SN: {card.sn}
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
                <div className="absolute top-3 right-3 text-[10px] text-purple-400 font-bold bg-purple-500/10 border border-purple-500/30 px-2 py-0.5 rounded font-mono animate-pulse">
                  质测工位 03A 通道活跃
                </div>
                <h4 className="text-sm font-black text-slate-100">{activeCard.productName}</h4>
                <div className="mt-2.5 grid grid-cols-3 gap-4 text-xs font-mono">
                  <div>
                    <span className="text-slate-500 block">独立库存编号</span>
                    <span className="text-slate-300 font-bold">{activeCard.id}</span>
                  </div>
                  <div>
                    <span className="text-slate-500 block">PCB物理序列号</span>
                    <span className="text-slate-300 font-bold text-cyan-300">{activeCard.sn}</span>
                  </div>
                  <div>
                    <span className="text-slate-500 block">进货来源成色</span>
                    <span className="text-slate-300">{activeCard.condition}</span>
                  </div>
                </div>
              </div>

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
                    onChange={e => setTechInspector(e.target.value)}
                    className="w-full bg-slate-900 border border-slate-800 text-xs text-slate-200 p-2.5 rounded"
                  />
                </div>
              </div>

              {/* Remarks */}
              <div className="space-y-1.5">
                <label className="text-[10px] text-slate-400 font-bold uppercase tracking-wider block">物理测试总体批注 (最终出张随存)</label>
                <textarea
                  value={remarks}
                  onChange={e => setRemarks(e.target.value)}
                  placeholder="请输入该卡的风扇物理清灰建议、挡板翻新指导或者后续保修的核销条码说明..."
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
                  className="px-5 py-2.5 bg-purple-500 hover:bg-purple-400 text-slate-950 font-black rounded-lg shadow-[0_0_15px_rgba(168,85,247,0.3)] duration-200"
                >
                  提交测试报告 · 更新在架档案
                </button>
              </div>
            </form>
          ) : (
            <div className="bg-slate-900 border border-dashed border-slate-800 rounded-xl p-16 text-center space-y-4">
              <div className="w-16 h-16 bg-purple-950/40 text-purple-400 rounded-full border border-purple-800/40 flex items-center justify-center mx-auto text-xl font-bold font-mono">
                GPU-Z
              </div>
              <div>
                <p className="text-sm font-bold text-slate-200">请优先从左侧“等待检测池”挑选要质检的显卡</p>
                <p className="text-xs text-slate-400 mt-1 max-w-[320px] mx-auto leading-relaxed">
                  选择后，该工位会自动提取卡牌的芯片模版，并加载对应的功耗及甜甜圈测试指南，协助您录入报告。
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
