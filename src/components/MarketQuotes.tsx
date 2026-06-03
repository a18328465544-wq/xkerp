/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo } from "react";
import {
  TrendingUp,
  TrendingDown,
  LineChart,
  Search,
  Plus,
  ArrowUpRight,
  ArrowDownRight,
  HelpCircle,
  Sparkles,
  RefreshCw,
  Bell,
  X,
  AlertTriangle,
  Flame,
  Info
} from "lucide-react";
import { useStoreStateReturn } from "../utils/state";
import { MarketQuote } from "../types";

interface MarketQuotesProps {
  storeState: useStoreStateReturn;
}

export default function MarketQuotes({ storeState }: MarketQuotesProps) {
  const {
    marketQuotes,
    createMarketQuote,
    inventory
  } = storeState;

  // Search filter
  const [search, setSearch] = useState("");
  const [selectedBrand, setSelectedBrand] = useState<string>("all");

  // Modal form states for adding a new market standard pricing record
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [model, setModel] = useState("RTX 4070 Ti Super");
  const [brand, setBrand] = useState("NVIDIA");
  const [refBuyPrice, setRefBuyPrice] = useState<number>(5100);
  const [refSellPrice, setRefSellPrice] = useState<number>(5650);
  const [trend, setTrend] = useState<"up" | "down" | "stable">("down");
  const [fluctuation, setFluctuation] = useState<string>("每周阴跌 ¥50-100");

  const [activeModelHistory, setActiveModelHistory] = useState<string | null>("RTX 4095");

  // Big gainers and losers simulations
  const marketDynamics = useMemo(() => {
    let bigDroppers = marketQuotes.filter(q => q.trend === "down").slice(0, 2);
    let bigGainers = marketQuotes.filter(q => q.trend === "up").slice(0, 2);
    return { bigDroppers, bigGainers };
  }, [marketQuotes]);

  // Filters listing
  const filteredQuotes = useMemo(() => {
    return marketQuotes.filter(q => {
      const matchSearch =
        q.model.toLowerCase().includes(search.toLowerCase()) ||
        q.brand.toLowerCase().includes(search.toLowerCase());
        
      const matchBrand = selectedBrand === "all" || q.brand.toLowerCase() === selectedBrand.toLowerCase();
      
      return matchSearch && matchBrand;
    });
  }, [marketQuotes, search, selectedBrand]);

  const handleCreateQuote = (e: React.FormEvent) => {
    e.preventDefault();
    if (!model.trim()) return;

    createMarketQuote({
      model,
      brand,
      refBuyPrice,
      refSellPrice,
      trend,
      fluctuation,
      updateTime: new Date().toISOString().split("T")[0],
      history: [
        { date: "05-10", buyPrice: Math.round(refBuyPrice * 1.05), sellPrice: Math.round(refSellPrice * 1.04) },
        { date: "05-18", buyPrice: Math.round(refBuyPrice * 1.02), sellPrice: Math.round(refSellPrice * 1.02) },
        { date: "05-25", buyPrice: refBuyPrice, sellPrice: refSellPrice }
      ]
    });

    setIsModalOpen(false);
    alert(`💡 行情指引：已录入 [${model}] 的主板交易指导价格大纲。门店在进行个人回收估损时，会自动提取对应的参考均线进行风控防卫。`);
  };

  // Render mock stock fluctuation line graphs
  const drawModelSparkline = (points: { date: string; buyPrice: number }[]) => {
    if (!points || points.length < 2) return null;
    const padding = 5;
    const w = 90;
    const h = 24;
    const maxVal = Math.max(...points.map(p => p.buyPrice));
    const minVal = Math.min(...points.map(p => p.buyPrice)) * 0.98;
    const range = maxVal - minVal || 1;

    const coords = points.map((p, idx) => {
      const x = padding + (idx / (points.length - 1)) * (w - 2 * padding);
      const y = h - padding - ((p.buyPrice - minVal) / range) * (h - 2 * padding);
      return `${x},${y}`;
    });

    return (
      <svg className="w-24 h-6 opacity-85" viewBox={`0 0 ${w} ${h}`}>
        <polyline
          fill="none"
          stroke="#22d3ee"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
          points={coords.join(" ")}
        />
        {/* Draw latest node */}
        <circle
          cx={padding + (points.length - 1) / (points.length - 1) * (w - 2 * padding)}
          cy={h - padding - ((points[points.length - 1].buyPrice - minVal) / range) * (h - 2 * padding)}
          r="2.5"
          fill="#ef4444"
        />
      </svg>
    );
  };

  return (
    <div className="space-y-4">
      {/* Visual Top */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-slate-900 p-5 rounded-2xl border border-slate-800">
        <div>
          <h2 className="text-base font-bold text-slate-100 flex items-center gap-2">
            <LineChart className="w-5 h-5 text-cyan-400" />
            <span>显卡每周公募均价大黄页 (显卡行情指引)</span>
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            本页指数数据来源：汇总自闲鱼近期10,000张显卡真实成交均值、贴吧二手群均值、以及同行批量拿货出厂价。每周一自动重构行情线，防范由于显卡价格暴跌导致的店内存货大面积贬值。
          </p>
        </div>
        <button
          onClick={() => {
            setIsModalOpen(true);
            setModel("RTX 5070 Ti");
            setRefBuyPrice(4800);
            setRefSellPrice(5350);
            setTrend("down");
            setFluctuation("新品预售冲击，急剧下调");
          }}
          className="p-2.5 bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-black rounded-xl text-xs flex items-center gap-1 cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          新增指导行情卡
        </button>
      </div>

      {/* DYNAMICS ALERTS CARDS */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Gainers */}
        <div className="bg-slate-905 border border-slate-850 p-4 rounded-xl flex items-center justify-between">
          <div className="space-y-1">
            <span className="text-[10px] text-emerald-400 font-extrabold uppercase tracking-wider flex items-center gap-1">
              <Sparkles className="w-3.5 h-3.5" /> 本周行情坚挺/溢价型号 (涨)
            </span>
            <div className="text-sm font-bold text-slate-100 mt-2.5 space-y-1">
              {marketDynamics.bigGainers.map((q, i) => (
                <div key={i} className="flex justify-between items-center gap-6">
                  <span>{q.model} ({q.brand})</span>
                  <span className="text-emerald-400 font-mono text-xs flex items-center gap-1">
                    <ArrowUpRight className="w-3 h-3" /> ¥{q.refBuyPrice} <span className="text-slate-500">|</span> 涨 {q.fluctuation}
                  </span>
                </div>
              ))}
            </div>
          </div>
          <div className="w-12 h-12 bg-emerald-950/40 text-emerald-400 rounded-full flex items-center justify-center font-black">
            📈
          </div>
        </div>

        {/* Droppers */}
        <div className="bg-slate-905 border border-slate-850 p-4 rounded-xl flex items-center justify-between">
          <div className="space-y-1">
            <span className="text-[10px] text-rose-400 font-extrabold uppercase tracking-wider flex items-center gap-1">
              <Bell className="w-3.5 h-3.5" /> 存在暴跌暴损高危型号 (跌)
            </span>
            <div className="text-sm font-bold text-slate-100 mt-2.5 space-y-1">
              {marketDynamics.bigDroppers.map((q, i) => (
                <div key={i} className="flex justify-between items-center gap-6">
                  <span>{q.model} ({q.brand})</span>
                  <span className="text-rose-400 font-mono text-xs flex items-center gap-1">
                    <ArrowDownRight className="w-3 h-3" /> ¥{q.refBuyPrice} <span className="text-slate-500">|</span> 跌 {q.fluctuation}
                  </span>
                </div>
              ))}
            </div>
          </div>
          <div className="w-12 h-12 bg-rose-950/40 text-rose-450 rounded-full flex items-center justify-center font-black animate-pulse">
            📉
          </div>
        </div>
      </div>

      {/* FILTER SEARCH BAR */}
      <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="relative">
          <Search className="w-3.5 h-3.5 absolute left-3 top-3 text-slate-500" />
          <input
            type="text"
            placeholder="搜索指导行情卡..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full bg-slate-950 border border-slate-850 pl-8.5 pr-3 py-2.5 rounded-lg text-xs focus:outline-none text-slate-200"
          />
        </div>

        <div>
          <select
            value={selectedBrand}
            onChange={e => setSelectedBrand(e.target.value)}
            className="w-full bg-slate-950 border border-slate-850 text-xs text-slate-350 p-2.5 rounded-lg"
          >
            <option value="all">芯片架构厂商 (全部)</option>
            <option value="NVIDIA">英伟达 NVIDIA RTX</option>
            <option value="AMD">超威半导体 AMD RX</option>
            <option value="INTEL">蓝厂 INTEL Arc</option>
          </select>
        </div>

        <div className="flex items-center text-[11px] text-slate-400 font-mono justify-end bg-slate-950/20 px-3.5 rounded">
          根据此表：库存高过参考回收价20%的将自动触发 Dashboard “倒挂提醒”
        </div>
      </div>

      {/* MAIN GUIDLINE QUOTE CARD LISTS */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        {filteredQuotes.map(q => {
          const matchingInventoryCount = inventory.filter(c => c.productName.toLowerCase().includes(q.model.toLowerCase()) && c.status !== "已售出").length;

          return (
            <div
              key={q.model}
              className={`bg-slate-900 border rounded-2xl p-4.5 space-y-4 shadow-md hover:border-slate-700 transition-all ${
                q.trend === "down" ? "border-slate-850" : "border-slate-800"
              }`}
            >
              <div className="flex justify-between items-start">
                <div>
                  <span className="text-[9px] bg-slate-955 text-slate-400 font-mono font-bold px-1.5 py-0.5 rounded-sm uppercase">
                    {q.brand}
                  </span>
                  <h4 className="text-sm font-extrabold text-slate-100 mt-1.5">{q.model}</h4>
                </div>

                <span className={`inline-flex items-center gap-0.5 text-[10px] font-black px-1.5 rounded-sm ${
                  q.trend === "up" ? "bg-emerald-950 text-emerald-400" :
                  q.trend === "down" ? "bg-rose-955 text-rose-455" : "bg-slate-800 text-slate-400"
                }`}>
                  {q.trend === "up" ? "本周看涨" :
                   q.trend === "down" ? "行情阴跌" : "价格维稳"}
                </span>
              </div>

              {/* Sparkline visualization */}
              <div className="bg-slate-950/60 p-2.5 rounded-lg border border-slate-850/60 flex items-center justify-between">
                <div>
                  <span className="text-[10px] text-slate-500 font-bold block leading-none">五月均价波点</span>
                  <span className="text-[9px] text-slate-450 font-mono block mt-1.5 leading-none">波动：{q.fluctuation}</span>
                </div>
                {q.history && drawModelSparkline(q.history)}
              </div>

              {/* Reference Buy and Resell rates */}
              <div className="grid grid-cols-2 gap-2 text-xs font-mono">
                <div className="bg-slate-955 p-2 rounded">
                  <span className="text-[10px] text-slate-500 block font-sans">指导回收底价</span>
                  <span className="text-cyan-400 font-bold text-sm block mt-1">¥{q.refBuyPrice}</span>
                </div>
                <div className="bg-slate-955 p-2 rounded">
                  <span className="text-[10px] text-slate-500 block font-sans">指导零售均价</span>
                  <span className="text-emerald-400 font-bold text-sm block mt-1">¥{q.refSellPrice}</span>
                </div>
              </div>

              <div className="text-[10px] text-slate-500 flex items-center justify-between border-t border-slate-800/80 pt-2.5 font-mono">
                <span>更新：{q.updateTime}</span>
                <span>本店存量: <span className="text-slate-300 font-bold">{matchingInventoryCount} 张在架</span></span>
              </div>
            </div>
          );
        })}
      </div>

      {/* CREATE MODAL DIALOG */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <form
            onSubmit={handleCreateQuote}
            className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-md shadow-2xl overflow-hidden text-slate-100 p-5 space-y-4"
          >
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="font-bold text-slate-100 flex items-center gap-2">
                <LineChart className="w-5 h-5 text-cyan-400" />
                <span>录入行情波动指导卡</span>
              </h3>
              <button type="button" onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-slate-200">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4 text-xs">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-slate-400 font-bold block mb-1">显卡芯片系列名称</label>
                  <input
                    type="text"
                    required
                    value={model}
                    onChange={e => setModel(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-850 p-2.5 rounded text-slate-250 focus:outline-none focus:border-cyan-500"
                  />
                </div>
                <div>
                  <label className="text-slate-400 font-bold block mb-1 font-sans">核心架构牌子</label>
                  <select
                    value={brand}
                    onChange={e => setBrand(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-850 p-2.5 rounded text-slate-205"
                  >
                    <option value="NVIDIA">英伟达 NVIDIA</option>
                    <option value="AMD">超威 AMD</option>
                    <option value="INTEL">英特尔 INTEL</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-slate-400 font-bold block mb-1">建议回收均价 (¥)</label>
                  <input
                    type="number"
                    required
                    value={refBuyPrice}
                    onChange={e => setRefBuyPrice(Number(e.target.value))}
                    className="w-full bg-slate-950 border border-slate-850 p-2.5 rounded font-mono text-slate-205"
                  />
                </div>
                <div>
                  <label className="text-slate-400 font-bold block mb-1">建议销售均价 (¥)</label>
                  <input
                    type="number"
                    required
                    value={refSellPrice}
                    onChange={e => setRefSellPrice(Number(e.target.value))}
                    className="w-full bg-slate-950 border border-slate-850 p-2.5 rounded font-mono text-slate-205"
                  />
                </div>
              </div>

              <div>
                <label className="text-slate-400 font-bold block mb-1">本周期波动走势</label>
                <select
                  value={trend}
                  onChange={e => setTrend(e.target.value as any)}
                  className="w-full bg-slate-950 border border-slate-850 p-2.5 rounded font-semibold text-slate-205"
                >
                  <option value="stable">稳（供需均衡、价格滞留在横盘期）</option>
                  <option value="up">升（供应短缺、高溢价抢购）</option>
                  <option value="down">跌（新品过敏、抛重矿砸市、渠道积积压跌）</option>
                </select>
              </div>

              <div>
                <label className="text-slate-400 font-bold block mb-1">波动幅度批注</label>
                <input
                  type="text"
                  placeholder="e.g. 每周阴跌 ¥50"
                  value={fluctuation}
                  onChange={e => setFluctuation(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-850 p-2.5 rounded text-slate-205"
                />
              </div>
            </div>

            <div className="border-t border-slate-800 pt-4 flex justify-end gap-2 text-xs">
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="px-4 py-2 border border-slate-705 rounded text-slate-400 font-bold hover:bg-slate-800"
              >
                取消
              </button>
              <button
                type="submit"
                className="px-5 py-2 bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-black rounded shadow-[0_0_12px_rgba(6,182,212,0.3)]"
              >
                确认录入
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
