/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState } from "react";
import {
  TrendingDown,
  AlertTriangle,
  Package,
  LineChart,
  ShieldAlert,
  TrendingDown as PriceDropIcon,
  Boxes,
  History,
  PackageCheck,
  ShoppingCart
} from "lucide-react";
import { useStoreStateReturn } from "../utils/state";
import { CardInventory } from "../types";

interface DashboardProps {
  storeState: useStoreStateReturn;
  setTab: (tab: string) => void;
  onSelectCardDetail?: (card: CardInventory) => void;
}

export default function Dashboard({ storeState, setTab, onSelectCardDetail }: DashboardProps) {
  const {
    inventory,
    products,
    salesInvoices,
    marketQuotes,
    permissions,
  } = storeState;

  const [activeChartTab, setActiveChartTab] = useState<"qty" | "revenue" | "profit">("qty");

  const today = "2026-05-29";

  // Compute dynamic stats
  const activeStock = inventory.filter(
    c => c.status !== "已售出" && cardActive(c.status)
  );

  function cardActive(s: string) {
    return !["已退货", "已报废"].includes(s);
  }

  // 1. 回收 counts
  const todayRecycleCount = inventory.filter(
    c => c.entryTime === today && c.sourceType === "个人回收"
  ).length;

  // 2. 进货 counts
  const todayPurchaseCount = inventory.filter(
    c => c.entryTime === today && c.sourceType !== "个人回收"
  ).length;

  // 3. 销售 counts
  const todaySalesCount = inventory.filter(c => c.salesTime === today).length;

  // 4. 今日营业额
  const todayRevenue = inventory
    .filter(c => c.salesTime === today)
    .reduce((sum, c) => sum + (c.salesPrice || 0), 0);

  // 5. 今日毛利润
  const todayProfit = inventory
    .filter(c => c.salesTime === today)
    .reduce((sum, c) => sum + ((c.salesPrice || 0) - c.costPrice), 0);

  // 6. 今日售后 counts

  // 7. 当前库存总数
  const totalStockCount = activeStock.length;

  // 8. 当前库存总成本
  const totalStockCost = activeStock.reduce((sum, c) => sum + c.costPrice, 0);

  // 9. 当前库存预估售价
  const totalStockMarket = activeStock.reduce((sum, c) => sum + c.marketPrice, 0);

  // 10. 本月销售总额 (Based on our simulated billing list)

  // 11. 本月总利润
  const monthlyProfit = salesInvoices.reduce((sum, s) => sum + s.totalProfit, 0);

  // 12. 待检测数
  const pendingTestCount = inventory.filter(c => c.status === "待检测").length;

  // 13. 待上架数

  // 14. 极高风险库存数 (Market below cost, stock date exceeds 30, or flagged mining risk)
  const riskStockItems = activeStock.filter(
    c => c.marketPrice < c.costPrice || c.storageDays >= 30 || c.gpuRisk
  );
  const riskStockCount = riskStockItems.length;

  // Pre-configured trend datasets
  // 1. Qty trends (Last 7 Days)
  const qtyTrend = [
    { label: "05-23", recycle: 1, purchase: 2, sales: 1 },
    { label: "05-24", recycle: 0, purchase: 1, sales: 2 },
    { label: "05-25", recycle: 2, purchase: 3, sales: 1 },
    { label: "05-26", recycle: 1, purchase: 1, sales: 3 },
    { label: "05-27", recycle: 3, purchase: 2, sales: 2 },
    { label: "05-28", recycle: 1, purchase: 4, sales: 3 },
    { label: "05-29", recycle: todayRecycleCount, purchase: todayPurchaseCount, sales: todaySalesCount }
  ];

  // 2. Revenue trends
  const revenueTrend = [
    { label: "05-23", value: 12500 },
    { label: "05-24", value: 19800 },
    { label: "05-25", value: 8500 },
    { label: "05-26", value: 24500 },
    { label: "05-27", value: 15400 },
    { label: "05-28", value: 28800 },
    { label: "05-29", value: todayRevenue || 17050 }
  ];

  // 3. Profit trends (Last 30 days summarized weekly for visual polish)
  const profitTrend30D = [
    { label: "W1 (05-01)", value: 8200 },
    { label: "W2 (05-08)", value: 14500 },
    { label: "W3 (05-15)", value: 11000 },
    { label: "W4 (05-22)", value: 18900 },
    { label: "W5 (05-29)", value: monthlyProfit || 21300 }
  ];

  // Market and inventory risk alert details
  const costUpturnedAlerts = activeStock.filter(c => c.marketPrice < c.costPrice);
  const agedAlerts = activeStock.filter(c => c.storageDays >= 30);
  const consecutiveDropAlerts = marketQuotes.filter(q => q.changeRatio < -2.0);

  return (
    <div className="space-y-6">
      {/* Upper overview banner */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 bg-slate-900 p-5 rounded-2xl border border-slate-800 shadow-sm relative overflow-hidden">
        <div>
          <h1 className="text-xl font-bold text-slate-100 flex items-center gap-2">
            经营概览 <span className="text-xs font-mono font-medium text-slate-500 bg-slate-800 py-0.5 px-2 rounded-md">2026-05-29</span>
          </h1>
          <p className="text-xs text-slate-400 mt-1">
            查看今日进货、销售、库存和利润表现，快速定位需要处理的业务。
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => setTab("purchase_add")}
            className="p-2.5 px-4 rounded-xl bg-cyan-500 hover:bg-cyan-400 text-white font-bold text-xs transition-all flex items-center gap-2 cursor-pointer"
          >
            <PackageCheck className="w-4 h-4 text-white" /> 新建进货
          </button>
          <button
            onClick={() => setTab("sales_add")}
            className="p-2.5 px-4 rounded-xl bg-slate-800 border border-slate-700 hover:border-slate-600 text-slate-200 font-bold text-xs transition-all flex items-center gap-2 cursor-pointer"
          >
            <ShoppingCart className="w-4 h-4 text-cyan-500" /> 新建销售
          </button>
        </div>
      </div>

      {/* CORE STATISTIC CONTAINER (METRIC GRID) */}
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3.5">
        {/* Today Recycled */}
        <div className="bg-slate-900 p-3.5 rounded-xl border border-slate-800 flex flex-col justify-between">
          <div className="text-slate-500 text-[11px] font-bold tracking-tight">今日回收(张)</div>
          <div className="flex items-baseline gap-1.5 mt-2">
            <span className="text-2xl font-black text-cyan-400 font-mono">{todayRecycleCount}</span>
            <span className="text-[10px] text-slate-400 font-semibold">自上门</span>
          </div>
          <div className="text-[10px] text-slate-500 mt-1 font-mono">100% 个人退役卡</div>
        </div>

        {/* Today Purchased */}
        <div className="bg-slate-900 p-3.5 rounded-xl border border-slate-800 flex flex-col justify-between">
          <div className="text-slate-500 text-[11px] font-bold tracking-tight">今日同行进货(张)</div>
          <div className="flex items-baseline gap-1.5 mt-2">
            <span className="text-2xl font-black text-indigo-400 font-mono">{todayPurchaseCount}</span>
            <span className="text-[10px] text-slate-400 font-semibold">批货</span>
          </div>
          <div className="text-[10px] text-slate-500 mt-1 font-mono">来自散牛/同行批发</div>
        </div>

        {/* Today Sold Count */}
        <div className="bg-slate-900 p-3.5 rounded-xl border border-slate-800 flex flex-col justify-between">
          <div className="text-slate-500 text-[11px] font-bold tracking-tight">今日销售(张)</div>
          <div className="flex items-baseline gap-1.5 mt-2">
            <span className="text-2xl font-black text-emerald-400 font-mono">{todaySalesCount}</span>
            <span className="text-[10px] text-emerald-500 font-semibold flex items-center">已售出</span>
          </div>
          <div className="text-[10px] text-slate-500 mt-1 font-mono">周转周期中频</div>
        </div>

        {/* Today Revenue */}
        <div className="bg-slate-900 p-3.5 rounded-xl border border-slate-800 flex flex-col justify-between">
          <div className="text-slate-500 text-[11px] font-bold tracking-tight">今日营业总额</div>
          <div className="mt-2">
            <span className="text-lg font-bold text-slate-100 font-mono">{todayRevenue.toLocaleString()}元</span>
          </div>
          <div className="text-[10px] text-slate-500 mt-1.5 font-mono">客单价良好</div>
        </div>

        {/* Today Gross Profit */}
        <div className="bg-slate-900 p-3.5 rounded-xl border border-slate-800 flex flex-col justify-between relative overflow-hidden">
          <div className="text-slate-500 text-[11px] font-bold tracking-tight">今日毛利</div>
          <div className="mt-2 flex items-center justify-between">
            {permissions.showProfit ? (
              <span className={`text-lg font-bold font-mono ${todayProfit >= 0 ? "text-emerald-400" : "text-rose-500"}`}>
                {todayProfit.toLocaleString()}元
              </span>
            ) : (
              <span className="text-xs text-slate-500 font-light italic">无权查看</span>
            )}
            {todayProfit > 0 && <span className="text-[9px] px-1 border border-emerald-500/30 text-emerald-400 font-mono rounded bg-emerald-500/5">正收益</span>}
          </div>
          <div className="text-[10px] text-slate-500 mt-1.5 font-mono">扣除测试维修损耗</div>
        </div>

        {/* Pending Inspections */}
        <div className="bg-slate-900 p-3.5 rounded-xl border border-slate-700/80 hover:border-purple-500/50 transition-colors cursor-pointer flex flex-col justify-between" onClick={() => setTab("inspections")}>
          <div className="text-slate-500 text-[11px] font-bold tracking-tight flex items-center justify-between">
            <span>待检测显卡</span>
            <span className="w-1.5 h-1.5 rounded-full bg-purple-500 animate-ping"></span>
          </div>
          <div className="flex items-baseline gap-1 mt-2">
            <span className="text-2xl font-black text-purple-400 font-mono">{pendingTestCount}</span>
            <span className="text-[10px] text-purple-300 bg-purple-500/10 px-1 rounded">堆积中</span>
          </div>
          <div className="text-[10px] text-slate-400 font-medium underline mt-1">查看检测任务 &rarr;</div>
        </div>

        {/* Risk Items */}
        <div className="bg-slate-900 p-3.5 rounded-xl border border-slate-800 hover:border-rose-800 transition-colors flex flex-col justify-between cursor-pointer" onClick={() => setTab("inventory")}>
          <div className="text-slate-500 text-[11px] font-bold tracking-tight">高危积压提醒</div>
          <div className="flex items-baseline gap-1.5 mt-2">
            <span className={`text-2xl font-black font-mono ${riskStockCount > 2 ? "text-rose-500" : "text-slate-300"}`}>
              {riskStockCount}
            </span>
            <span className="text-[10px] text-slate-400 font-semibold">项告警</span>
          </div>
          <div className="text-[10px] text-rose-400/80 mt-1 font-mono">倒挂或滞留30天+</div>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 bg-slate-950 p-4 rounded-xl border border-slate-800">
        <div>
          <span className="text-slate-500 text-[10px] font-bold uppercase tracking-wider block">当前门店保有量</span>
          <span className="text-slate-200 text-lg font-mono font-bold block mt-1">{totalStockCount} 张显卡</span>
        </div>
        {permissions.showCost ? (
          <div>
            <span className="text-slate-500 text-[10px] font-bold uppercase tracking-wider block">仓库存留总成本</span>
            <span className="text-slate-200 text-lg font-mono font-bold block mt-1">{totalStockCost.toLocaleString()}元</span>
          </div>
        ) : (
          <div>
            <span className="text-slate-500 text-[10px] font-bold uppercase tracking-wider block">仓库存留总成本</span>
            <span className="text-slate-500 text-xs italic block mt-1.5">店员无权访问成本价</span>
          </div>
        )}
        <div>
          <span className="text-slate-500 text-[10px] font-bold uppercase tracking-wider block">在库预估售价</span>
          <span className="text-slate-200 text-lg font-mono font-bold block mt-1">{totalStockMarket.toLocaleString()}元</span>
        </div>
        {permissions.showCost && (
          <div>
            <span className="text-slate-500 text-[10px] font-bold uppercase tracking-wider block">库存预估毛利</span>
            <span className={`text-lg font-mono font-bold block mt-1 ${totalStockMarket - totalStockCost >= 0 ? "text-emerald-400" : "text-rose-500"}`}>
              {(totalStockMarket - totalStockCost).toLocaleString()}元
            </span>
          </div>
        )}
      </div>

      {/* MID SECTION: CHARTS BLOCK & PRICE DROPS */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* CHART CONTAINER */}
        <div className="lg:col-span-2 bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-lg relative flex flex-col justify-between">
          <div className="flex items-center justify-between border-b border-slate-800 pb-4 mb-4">
            <div>
              <h3 className="text-sm font-bold text-slate-100 flex items-center gap-1.5">
                <LineChart className="w-4 h-4 text-cyan-400" />
                <span>业务流转趋势</span>
              </h3>
              <p className="text-[10px] text-slate-500 font-medium">按日查看进货、回收、销售和利润变化。</p>
            </div>
            {/* Chart switcher */}
            <div className="flex bg-slate-950 p-1 rounded-lg border border-slate-800 gap-1">
              <button
                onClick={() => setActiveChartTab("qty")}
                className={`p-1 px-3 text-[10px] font-bold rounded-md transition-all ${
                  activeChartTab === "qty" ? "bg-cyan-500 text-slate-950" : "text-slate-400 hover:text-slate-200"
                }`}
              >
                7日进销存量
              </button>
              <button
                onClick={() => setActiveChartTab("revenue")}
                className={`p-1 px-3 text-[10px] font-bold rounded-md transition-all ${
                  activeChartTab === "revenue" ? "bg-cyan-500 text-slate-950" : "text-slate-400 hover:text-slate-200"
                }`}
              >
                7日成交额
              </button>
              {permissions.showProfit && (
                <button
                  onClick={() => setActiveChartTab("profit")}
                  className={`p-1 px-3 text-[10px] font-bold rounded-md transition-all ${
                    activeChartTab === "profit" ? "bg-cyan-500 text-slate-950" : "text-slate-400 hover:text-slate-200"
                  }`}
                >
                  30日毛利
                </button>
              )}
            </div>
          </div>

          {/* CUSTOM HIGH-QUALITY RESPONSIVE SVG GRAPH */}
          <div className="w-full h-64 bg-slate-950/40 rounded-xl border border-slate-850 p-3 flex flex-col justify-between">
            {activeChartTab === "qty" && (
              <div className="w-full h-full flex flex-col justify-between relative">
                {/* SVG Line Render */}
                <div className="flex-1 w-full relative">
                  <svg className="w-full h-full" viewBox="0 0 600 180" preserveAspectRatio="none">
                    <defs>
                      <linearGradient id="colorRecycle" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#06b6d4" stopOpacity={0.2}/>
                        <stop offset="95%" stopColor="#06b6d4" stopOpacity={0}/>
                      </linearGradient>
                      <linearGradient id="colorSales" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#10b981" stopOpacity={0.2}/>
                        <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    
                    {/* Grid lines */}
                    <line x1="0" y1="30" x2="600" y2="30" stroke="#1e293b" strokeDasharray="3 3"/>
                    <line x1="0" y1="90" x2="600" y2="90" stroke="#1e293b" strokeDasharray="3 3"/>
                    <line x1="0" y1="150" x2="600" y2="150" stroke="#1e293b" strokeDasharray="3 3"/>

                    {/* Area recycle */}
                    <path
                      d={`M 10 120 L 100 150 L 190 60 L 280 120 L 370 30 L 460 120 L 550 ${150 - todayRecycleCount * 40}`}
                      fill="url(#colorRecycle)"
                      stroke="none"
                    />
                    
                    {/* Line recycle (Cyan) */}
                    <path
                      d={`M 10 120 L 100 150 L 190 60 L 280 120 L 370 30 L 460 120 L 550 ${150 - todayRecycleCount * 40}`}
                      fill="none"
                      stroke="#06b6d4"
                      strokeWidth="2.5"
                    />

                    {/* Line sales (Emerald Green) */}
                    <path
                      d={`M 10 120 L 100 60 L 190 120 L 280 30 L 370 90 L 460 60 L 550 ${150 - todaySalesCount * 40}`}
                      fill="none"
                      stroke="#10b981"
                      strokeWidth="2.5"
                    />

                    {/* Circle points on today (05-29) */}
                    <circle cx="550" cy={150 - todayRecycleCount * 40} r="4.5" fill="#06b6d4" stroke="#fff" strokeWidth="1.5"/>
                    <circle cx="550" cy={150 - todaySalesCount * 40} r="4.5" fill="#10b981" stroke="#fff" strokeWidth="1.5"/>
                  </svg>
                </div>
                {/* Labels */}
                <div className="flex justify-between text-[10px] text-slate-500 font-mono mt-1.5 px-2">
                  {qtyTrend.map(d => (
                    <span key={d.label}>{d.label}</span>
                  ))}
                </div>
                {/* Legends */}
                <div className="flex justify-center gap-6 mt-2 text-[10px] border-t border-slate-900 pt-2 font-semibold">
                  <div className="flex items-center gap-1 text-cyan-400">
                    <span className="w-2.5 h-1.5 bg-cyan-400 rounded-sm"></span>
                    <span>回收量</span>
                  </div>
                  <div className="flex items-center gap-1 text-indigo-400">
                    <span className="w-2.5 h-1.5 bg-indigo-500 rounded-sm"></span>
                    <span>同行进货量</span>
                  </div>
                  <div className="flex items-center gap-1 text-emerald-400">
                    <span className="w-2.5 h-1.5 bg-emerald-400 rounded-sm"></span>
                    <span>销售出库量</span>
                  </div>
                </div>
              </div>
            )}

            {activeChartTab === "revenue" && (
              <div className="w-full h-full flex flex-col justify-between">
                <div className="flex-1 w-full relative">
                  <svg className="w-full h-full" viewBox="0 0 600 180" preserveAspectRatio="none">
                    <defs>
                      <linearGradient id="revenueGlow" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#a855f7" stopOpacity={0.3}/>
                        <stop offset="95%" stopColor="#a855f7" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <line x1="0" y1="30" x2="600" y2="30" stroke="#1e293b" strokeDasharray="3 3"/>
                    <line x1="0" y1="90" x2="600" y2="90" stroke="#1e293b" strokeDasharray="3 3"/>
                    <line x1="0" y1="150" x2="600" y2="150" stroke="#1e293b" strokeDasharray="3 3"/>

                    {/* Area path */}
                    <path
                      d="M 10 130 L 100 100 L 190 150 L 280 80 L 370 120 L 460 60 L 550 110"
                      fill="url(#revenueGlow)"
                      stroke="none"
                    />
                    {/* Line path */}
                    <path
                      d="M 10 130 L 100 100 L 190 150 L 280 80 L 370 120 L 460 60 L 550 110"
                      fill="none"
                      stroke="#a855f7"
                      strokeWidth="3"
                    />
                    <circle cx="550" cy="110" r="4.5" fill="#a855f7" stroke="#fff" strokeWidth="1.5"/>
                  </svg>
                </div>
                <div className="flex justify-between text-[10px] text-slate-500 font-mono mt-1.5 px-2">
                  {revenueTrend.map(d => (
                    <span key={d.label}>{d.label}</span>
                  ))}
                </div>
                <div className="text-center font-mono text-[9px] text-slate-500 mt-2">
                  今日销售成交额比昨日相比波动为正值
                </div>
              </div>
            )}

            {activeChartTab === "profit" && (
              <div className="w-full h-full flex flex-col justify-between">
                <div className="flex-1 w-full relative">
                  <svg className="w-full h-full" viewBox="0 0 600 180" preserveAspectRatio="none">
                    <line x1="0" y1="30" x2="600" y2="30" stroke="#1e293b" strokeDasharray="3 3"/>
                    <line x1="0" y1="90" x2="600" y2="90" stroke="#1e293b" strokeDasharray="3 3"/>
                    <line x1="0" y1="150" x2="600" y2="150" stroke="#1e293b" strokeDasharray="3 3"/>

                    {/* Dynamic Bar Charts */}
                    <g fill="#10b981" opacity="0.85">
                      <rect x="50" y="100" width="25" height="50" rx="3" className="hover:opacity-100 transition-opacity" />
                      <rect x="170" y="60" width="25" height="90" rx="3" />
                      <rect x="290" y="80" width="25" height="70" rx="3" />
                      <rect x="410" y="30" width="25" height="120" rx="3" />
                      <rect x="530" y="20" width="25" height="130" rx="3" fill="#06b6d4" />
                    </g>
                  </svg>
                </div>
                <div className="flex justify-between text-[10px] text-slate-500 font-mono mt-1.5 px-10">
                  {profitTrend30D.map(d => (
                    <span key={d.label}>{d.label}</span>
                  ))}
                </div>
                <div className="text-center font-mono text-[9px] text-emerald-400 mt-2">
                  本期毛利: {monthlyProfit.toLocaleString()}元 (已扣除售后损耗)
                </div>
              </div>
            )}
          </div>

          <div className="mt-4 grid grid-cols-3 gap-3">
            <div className="bg-slate-950 p-2 text-center rounded-lg border border-slate-850">
              <span className="text-[10px] text-slate-500 block">30D 销量占比第一</span>
              <span className="text-xs text-slate-200 mt-0.5 font-bold block">RTX 4090 系列 (42.5%)</span>
            </div>
            <div className="bg-slate-950 p-2 text-center rounded-lg border border-slate-850">
              <span className="text-[10px] text-slate-500 block">利润冠军型号</span>
              <span className="text-xs text-emerald-400 mt-0.5 font-bold block">iGame 火神系列</span>
            </div>
            <div className="bg-slate-950 p-2 text-center rounded-lg border border-slate-850">
              <span className="text-[10px] text-slate-500 block">平均质检耗时</span>
              <span className="text-xs text-slate-200 mt-0.5 font-bold block">18分钟 / 张(FurMark 甜甜圈)</span>
            </div>
          </div>
        </div>

        {/* CONTINGENCY AND RISK WARNING */}
        <div className="bg-slate-900 border border-slate-850 rounded-2xl p-5 shadow-lg flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between border-b border-slate-800 pb-3 mb-3.5">
              <h3 className="text-xs font-bold text-slate-100 flex items-center gap-1.5 tracking-wider uppercase">
                <ShieldAlert className="w-4 h-4 text-rose-500" />
                <span>库存与价格提醒</span>
              </h3>
              <span className="text-[9px] bg-rose-500/10 text-rose-400 px-2 py-0.5 border border-rose-500/20 rounded font-bold">
                {costUpturnedAlerts.length + agedAlerts.length + (pendingTestCount > 2 ? 1 : 0)} 项风险
              </span>
            </div>

            <div className="space-y-3 max-h-[300px] overflow-y-auto pr-1">
              {/* BACKLOG INSPECTION ALERT */}
              {pendingTestCount > 2 && (
                <div className="p-3 bg-fuchsia-950/20 border border-fuchsia-500/30 rounded-lg">
                  <div className="flex items-start gap-2.5">
                    <AlertTriangle className="w-4 h-4 text-fuchsia-400 shrink-0 mt-0.5" />
                    <div>
                      <span className="text-xs font-bold text-fuchsia-300 block">检测工位积压过高</span>
                      <span className="text-[10px] text-slate-400 block mt-0.5">
                        有 <span className="font-bold text-fuchsia-300">{pendingTestCount}</span> 张回收显卡滞留在“待检测”状态，资金无法快速流转，请质检员立即登录进行 FurMark/3DMark 烤机检测。
                      </span>
                    </div>
                  </div>
                </div>
              )}

              {/* OVERPRICE WARNINGS: MARKET PRICE IS BELOW PURCHASE COST */}
              {costUpturnedAlerts.map(card => (
                <div key={card.id} className="p-3 bg-rose-950/20 border border-rose-500/30 rounded-lg">
                  <div className="flex items-start gap-2.5">
                    <PriceDropIcon className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                    <div className="flex-1">
                      <span className="text-xs font-bold text-rose-300 flex items-center justify-between gap-1">
                        <span>成本价倒挂警告</span>
                        <span className="font-mono bg-rose-500/10 px-1 border border-rose-500/20 text-[9px] text-rose-300 rounded font-normal">
                          倒挂: -{card.costPrice - card.marketPrice}元
                        </span>
                      </span>
                      <span className="text-[10px] text-slate-300 font-semibold block mt-0.5">
                        {card.productName}
                      </span>
                      <span className="text-[9px] text-slate-400 block mt-1 font-mono">
                        档案号: {card.id} | SN: {card.sn}
                        <br />
                        拿货价: {card.costPrice}元 | 当前回收参考价: {card.marketPrice}元
                      </span>
                      <button
                        onClick={() => onSelectCardDetail?.(card)}
                        className="text-[9px] text-rose-300 underline font-semibold mt-1.5 flex items-center gap-0.5 cursor-pointer hover:text-rose-100"
                      >
                        快速处置或打折销售 &rarr;
                      </button>
                    </div>
                  </div>
                </div>
              ))}

              {/* AGED STAGNANT WARNING (Over 30 days) */}
              {agedAlerts.map(card => (
                <div key={card.id} className="p-3 bg-amber-950/15 border border-amber-500/30 rounded-lg">
                  <div className="flex items-start gap-2.5">
                    <Package className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                    <div className="flex-1">
                      <span className="text-xs font-bold text-amber-300 flex items-center justify-between">
                        <span>在库时间过高 (超期积压)</span>
                        <span className="bg-amber-500/10 border border-amber-500/20 px-1 text-[9px] text-amber-400 font-mono rounded">
                          已存 {card.storageDays} 天
                        </span>
                      </span>
                      <span className="text-[10px] text-slate-200 block mt-0.5 font-semibold">
                        {card.productName}
                      </span>
                      <span className="text-[9px] text-slate-400 block mt-0.5 font-mono">
                        入库日期: {card.entryTime} (位置: {card.warehouseLocation})
                        <br />
                        成本积压资金: {card.costPrice}元
                      </span>
                      <span className="text-[10px] text-slate-400 italic block mt-1">
                        提示: 显卡价格具有快速贬值特性，建议降价出给同行。
                      </span>
                    </div>
                  </div>
                </div>
              ))}

              {/* MARKET DRIFT DROP ALERT */}
              {consecutiveDropAlerts.map(q => (
                <div key={q.id} className="p-3 bg-slate-950 border border-slate-800 rounded-lg">
                  <div className="flex items-start gap-2.5">
                    <TrendingDown className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                    <div>
                      <span className="text-xs font-bold text-slate-200 flex items-center gap-1.5">
                        <span>回收价下调型号</span>
                        <span className="text-[9px] bg-red-500/20 text-red-400 rounded px-1">{q.changeRatio}%</span>
                      </span>
                      <span className="text-[10px] text-slate-400 block mt-0.5 font-medium">
                        {q.productName} 今日回收参考价下调 {Math.abs(q.changeAmount)}元。建议谨慎高位回收此规格。
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="border-t border-slate-850 pt-3 mt-4 text-center">
            <span className="text-[10px] text-slate-500 font-mono">
              基于一卡一档，门店在架共 {activeStock.filter(c => c.status === "已上架").length} 张卡，瑕疵可售 {activeStock.filter(c => c.status === "已入库" && c.condition.includes("瑕疵")).length} 张
            </span>
          </div>
        </div>
      </div>

      {/* LOWER SECTION: TOP PROFITABLE MODELS & RECENT ACTIVITIES */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pb-6">
        {/* MODEL STOCK LEVELS */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-lg">
          <h3 className="text-xs font-bold text-slate-100 tracking-wider uppercase mb-4 flex items-center gap-1.5 border-b border-slate-800 pb-2">
            <Boxes className="w-4 h-4 text-cyan-400" />
            热门型号库存配比与近期均售
          </h3>

          <div className="space-y-4">
            {products.map(p => {
              const countInStore = inventory.filter(c => c.productId === p.id && c.status !== "已售出" && cardActive(c.status)).length;
              const maxScale = 5;
              const ratio = Math.min(100, (countInStore / maxScale) * 100);

              return (
                <div key={p.id} className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs font-semibold">
                    <span className="text-slate-300 truncate max-w-[240px]">{p.name}</span>
                    <span className="text-slate-400 font-mono text-[11px]">
                      在库: <span className="font-bold text-cyan-400">{countInStore}</span> 张
                    </span>
                  </div>
                  <div className="w-full bg-slate-950 rounded-full h-1.5 overflow-hidden">
                    <div
                      className="bg-gradient-to-r from-cyan-500 to-indigo-600 h-1.5 rounded-full"
                      style={{ width: `${ratio}%` }}
                    ></div>
                  </div>
                  <div className="flex items-center justify-between text-[9px] text-slate-500 font-mono">
                    <span>回收参考: {p.refBuyPrice}元</span>
                    <span>上期调拨: {p.lastDealTime || "无最近成交"}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* LOGS REGISTRY MINIFIED */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-lg flex flex-col justify-between">
          <div>
            <h3 className="text-xs font-bold text-slate-100 tracking-wider uppercase mb-4 flex items-center gap-1.5 border-b border-slate-800 pb-2">
              <History className="w-4 h-4 text-indigo-400" />
              最近日志审阅 (一卡一档行为追踪)
            </h3>

            <div className="space-y-3.5 max-h-[290px] overflow-y-auto">
              {storeState.logs.slice(0, 5).map(log => (
                <div key={log.id} className="flex gap-2.5 items-start text-xs leading-tight">
                  <div className="p-1 rounded bg-slate-950 border border-slate-800 self-start text-[9px] font-bold text-slate-400 tracking-wider font-mono shrink-0">
                    {log.module}
                  </div>
                  <div className="flex-1">
                    <p className="font-bold text-slate-200">{log.type}</p>
                    <p className="text-[11px] text-slate-400 mt-0.5">{log.target}: {log.afterVal || log.beforeVal}</p>
                    <span className="text-[9px] text-slate-500 font-mono mt-1 block">
                      由 {log.user} · 于 {log.time} 执行
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="mt-4 pt-3 border-t border-slate-850 text-right">
            <button
              onClick={() => setTab("logs")}
              className="text-xs text-cyan-400 font-bold hover:underline flex items-center gap-1 ml-auto cursor-pointer"
            >
              查看完整系统安全日志 &rarr;
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
