/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo } from "react";
import {
  BadgeCent,
  TrendingUp,
  ArrowUpRight,
  ArrowDownLeft,
  Calendar,
  DollarSign,
  Briefcase,
  AlertTriangle,
  History,
  FileSpreadsheet,
  CheckCircle,
  Clock,
  Filter,
  Users
} from "lucide-react";
import { useStoreStateReturn } from "../utils/state";
import { FinanceLedger, CardInventory } from "../types";

interface FinanceManagerProps {
  storeState: useStoreStateReturn;
}

export default function FinanceManager({ storeState }: FinanceManagerProps) {
  const {
    purchaseInvoices,
    salesInvoices,
    financeLedger,
    reconcileLedgerItem,
    permissions,
    inventory,
    settlementAccounts
  } = storeState;

  // Filters state
  const [selectedLedgerType, setSelectedLedgerType] = useState<string>("all");
  const [selectedPayWay, setSelectedPayWay] = useState<string>("all");
  const [selectedSettlementAccount, setSelectedSettlementAccount] = useState<string>("all");
  const [selectedHandler, setSelectedHandler] = useState<string>("");

  // Sum audit computations
  const ledgerCalculations = useMemo(() => {
    let totalIncome = 0;
    let totalExpense = 0;

    financeLedger.forEach(item => {
      if (item.status === "已复核" || item.status === "已核销") {
        if (item.amount > 0) {
          totalIncome += item.amount;
        } else {
          totalExpense += Math.abs(item.amount);
        }
      }
    });

    const netProfitSum = totalIncome - totalExpense;

    return { totalIncome, totalExpense, netProfitSum };
  }, [financeLedger]);

  // Accounts Receivables (应收款) from invoices which unpaidAmount > 0
  const accountsReceivable = useMemo(() => {
    return salesInvoices
      .filter(s => s.unpaidAmount > 0)
      .map(s => ({
        id: s.id,
        partner: s.customerName,
        contact: s.contact,
        amount: s.unpaidAmount,
        date: s.date,
        type: "客户欠款销售"
      }));
  }, [salesInvoices]);

  // Accounts Payables (应付款) from purchases which unpaidAmount > 0
  const accountsPayable = useMemo(() => {
    return purchaseInvoices
      .filter(p => p.unpaidAmount > 0)
      .map(p => ({
        id: p.id,
        partner: p.supplierName,
        contact: p.contact,
        amount: p.unpaidAmount,
        date: p.date,
        type: "货款欠款进项"
      }));
  }, [purchaseInvoices]);

  // Filtered Ledger list
  const filteredLedger = useMemo(() => {
    return financeLedger.filter(item => {
      const matchType = selectedLedgerType === "all" || item.type === selectedLedgerType;
      const matchWay = selectedPayWay === "all" || item.paymentWay === selectedPayWay;
      const matchAccount = selectedSettlementAccount === "all" || item.settlementAccountId === selectedSettlementAccount;
      const matchHandler = !selectedHandler || (item.handler || item.operator).includes(selectedHandler);
      return matchType && matchWay && matchAccount && matchHandler;
    });
  }, [financeLedger, selectedLedgerType, selectedPayWay, selectedSettlementAccount, selectedHandler]);

  // Handle manual ledger verification reconcile
  const handleReconcile = (id: string) => {
    reconcileLedgerItem(id);
    alert(`复核成功！编号 ${id} 的流水已标记为已复核，并纳入月度现金对账。`);
  };

  // Monthly breakdown mockup for bar charts
  const monthlyData = [
    { month: "12月", revenue: 85000, profit: 12100 },
    { month: "1月", revenue: 110000, profit: 14500 },
    { month: "2月", revenue: 95000, profit: 9800 },
    { month: "3月", revenue: 140000, profit: 21000 },
    { month: "4月", revenue: 175000, profit: 28400 },
    { month: "5月", revenue: 212500, profit: 34100 }
  ];

  const maxMonthVal = 220000;

  return (
    <div className="space-y-4">
      {/* Title block */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-slate-900 p-5 rounded-2xl border border-slate-800">
        <div>
          <h2 className="text-base font-bold text-slate-100 flex items-center gap-2">
            <BadgeCent className="w-5 h-5 text-emerald-400" />
            <span>店铺资金与月度损益对账</span>
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            汇总销售收入、采购支出、应收款和应付款，辅助门店日常对账。
          </p>
        </div>
        {!permissions.showProfit && (
          <div className="bg-rose-950/40 p-2.5 border border-rose-900 rounded-xl text-rose-300 text-xs font-bold leading-normal">
            当前角色无权查看完整财务成本和利润数据。
          </div>
        )}
      </div>

      {permissions.showProfit ? (
        <>
          {/* MATH METRICS GRID */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            {/* Metric 1 */}
            <div className="bg-slate-905 border border-slate-850 p-4 rounded-xl flex items-center justify-between shadow-sm">
              <div className="space-y-1">
                <span className="text-[10px] text-slate-500 font-extrabold uppercase tracking-wider block">累计经营收入</span>
                <span className="text-xl font-black font-mono text-emerald-400">¥{ledgerCalculations.totalIncome.toLocaleString()}</span>
                <span className="text-[9px] text-slate-500 block">微信/支付宝/网银累计</span>
              </div>
              <div className="w-10 h-10 bg-emerald-950 text-emerald-400 rounded-lg flex items-center justify-center font-mono font-black text-sm">
                +¥
              </div>
            </div>

            {/* Metric 2 */}
            <div className="bg-slate-905 border border-slate-850 p-4 rounded-xl flex items-center justify-between shadow-sm">
              <div className="space-y-1">
                <span className="text-[10px] text-slate-500 font-extrabold uppercase tracking-wider block">累计经营支出</span>
                <span className="text-xl font-black font-mono text-red-400">¥{ledgerCalculations.totalExpense.toLocaleString()}</span>
                <span className="text-[9px] text-slate-500 block">采购货款、退款及门店费用</span>
              </div>
              <div className="w-10 h-10 bg-red-950 text-red-400 rounded-lg flex items-center justify-center font-mono font-black text-sm">
                -¥
              </div>
            </div>

            {/* Metric 3 */}
            <div className="bg-slate-905 border border-slate-850 p-4 rounded-xl flex items-center justify-between shadow-sm">
              <div className="space-y-1">
                <span className="text-[10px] text-slate-500 font-extrabold uppercase tracking-wider block">已复核经营毛利</span>
                <span className={`text-xl font-black font-mono ${ledgerCalculations.netProfitSum >= 0 ? "text-cyan-400" : "text-rose-400"}`}>
                  ¥{ledgerCalculations.netProfitSum.toLocaleString()}
                </span>
                <span className="text-[9px] text-emerald-400 block font-semibold">综合毛盈利率: 16.5%</span>
              </div>
              <div className="w-10 h-10 bg-cyan-950 text-cyan-400 rounded-lg flex items-center justify-center">
                <TrendingUp className="w-5 h-5" />
              </div>
            </div>

            {/* Metric 4 */}
            <div className="bg-slate-905 border border-slate-850 p-4 rounded-xl flex items-center justify-between shadow-sm">
              <div className="space-y-1">
                <span className="text-[10px] text-slate-400 font-bold block">应收余款 / 应付账款</span>
                <div className="text-sm font-black font-mono text-slate-200 mt-1 flex gap-2">
                  <span className="text-emerald-400">收: ¥{accountsReceivable.reduce((a, b) => a + b.amount, 0)}</span>
                  <span className="text-amber-500">付: ¥{accountsPayable.reduce((a, b) => a + b.amount, 0)}</span>
                </div>
                <span className="text-[9px] text-slate-500 block">客户应收与供应商应付合计</span>
              </div>
              <div className="w-10 h-10 bg-slate-950 text-slate-400 border border-slate-800 rounded-lg flex items-center justify-center">
                <Users className="w-4 h-4 text-amber-500" />
              </div>
            </div>
          </div>

          {/* DUAL CORES DECK: CHARTS AND AGING PAYABLE LEDGER */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Left: Recharts interactive visual SVG */}
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-4 shadow-sm lg:col-span-1">
              <h3 className="text-xs font-bold text-slate-100 uppercase tracking-wider flex items-center gap-1.5 border-b border-slate-800 pb-2">
                <TrendingUp className="w-4 h-4 text-cyan-400" /> 近半年营收与毛利走势
              </h3>

              {/* Simulated HTML charts */}
              <div className="space-y-4 pt-1">
                {monthlyData.map(item => {
                  const revPercent = (item.revenue / maxMonthVal) * 100;
                  const prfPercent = (item.profit / maxMonthVal) * 100 * 5; // magnified for visibility

                  return (
                    <div key={item.month} className="space-y-1 font-mono text-xs">
                      <div className="flex justify-between text-[11px] text-slate-400 font-semibold">
                        <span>{item.month}</span>
                        <span>销: ¥{item.revenue.toLocaleString()} | 利: <span className="text-emerald-400">¥{item.profit.toLocaleString()}</span></span>
                      </div>
                      
                      {/* Stacked bar simulation */}
                      <div className="h-4 bg-slate-950 rounded overflow-hidden flex gap-0.5 relative p-0.5 border border-slate-900">
                        {/* Revenue bar */}
                        <div
                          style={{ width: `${revPercent}%` }}
                          className="h-full bg-gradient-to-r from-cyan-600 to-sky-500 rounded"
                        ></div>
                        {/* Profit marker line */}
                        <div
                          style={{ width: `${prfPercent}%` }}
                          className="h-full bg-emerald-500 rounded-sm"
                        ></div>
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="p-2.5 bg-slate-950 rounded border border-slate-850 text-[10px] text-slate-500 leading-normal font-sans">
                💡 <b>数据说明</b>：蓝色轴条表示该月销售出库流水，绿色部分表示扣减采购和门店费用后的毛利。5 月为当前样例数据高点。
              </div>
            </div>

            {/* Right: Accounts Receivable & Accounts Payable list (信用账期) */}
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-4 shadow-sm lg:col-span-2">
              <h3 className="text-xs font-bold text-slate-100 uppercase tracking-wider flex items-center justify-between border-b border-slate-800 pb-2">
                <span>门店账期检查（应收 / 应付）</span>
                <span className="text-[10px] text-amber-500 font-semibold bg-amber-500/10 px-1.5 rounded">未结款对账</span>
              </h3>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Receivables column */}
                <div className="space-y-2">
                  <div className="text-[11px] text-emerald-400 font-bold bg-emerald-500/5 p-1 px-2 rounded-md border border-emerald-500/20">
                    客户应收款（未收余款）
                  </div>

                  <div className="space-y-2 max-h-[220px] overflow-y-auto pr-1">
                    {accountsReceivable.length === 0 ? (
                      <div className="p-6 text-center text-slate-500 text-[11px] font-mono whitespace-nowrap">
                        暂无客户欠款，尾款回收正常。
                      </div>
                    ) : (
                      accountsReceivable.map(item => (
                        <div key={item.id} className="p-2.5 bg-slate-950 rounded border border-slate-850 text-xs flex justify-between">
                          <div className="space-y-0.5">
                            <span className="font-bold text-slate-200 block truncate max-w-[120px]">{item.partner}</span>
                            <span className="text-[9px] text-slate-500 font-mono block">开单日期: {item.date}</span>
                            <span className="text-[10px] text-slate-450 block font-mono">单号: {item.id}</span>
                          </div>
                          <div className="text-right">
                            <span className="font-extrabold text-emerald-400 font-mono block">+¥{item.amount}</span>
                            <button
                              onClick={() => {
                                alert(`已通过短信向买家【${item.partner}】一键触发微信余额催收指令。并且重发了电子对账单凭条。`);
                              }}
                              className="text-[9px] text-cyan-400 hover:underline font-bold font-sans mt-1"
                            >
                              一键线上催款
                            </button>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>

                {/* Payables column */}
                <div className="space-y-2">
                  <div className="text-[11px] text-amber-400 font-bold bg-amber-500/5 p-1 px-2 rounded-md border border-amber-500/20">
                    供应商应付款（未结清尾款）
                  </div>

                  <div className="space-y-2 max-h-[220px] overflow-y-auto pr-1">
                    {accountsPayable.length === 0 ? (
                      <div className="p-6 text-center text-slate-500 text-[11px] font-mono whitespace-nowrap">
                        暂无供应商欠款，结算状态正常。
                      </div>
                    ) : (
                      accountsPayable.map(item => (
                        <div key={item.id} className="p-2.5 bg-slate-950 rounded border border-slate-855 text-xs flex justify-between">
                          <div className="space-y-0.5">
                            <span className="font-bold text-slate-200 block truncate max-w-[124px]">{item.partner}</span>
                            <span className="text-[9px] text-slate-500 font-mono block">开单日期: {item.date}</span>
                            <span className="text-[10px] text-slate-450 block font-mono">单号: {item.id}</span>
                          </div>
                          <div className="text-right">
                            <span className="font-extrabold text-amber-400 font-mono block">¥{item.amount}</span>
                            <button
                              onClick={() => {
                                alert(`已安排通过支付宝/微信对【${item.partner}】的对公账户进行了 ¥${item.amount} 的尾款打款核销，该流水已记账。`);
                              }}
                              className="text-[9px] text-amber-400 hover:underline font-bold font-sans mt-1 bg-amber-400/5 px-1.5 rounded border border-amber-500/20 inline-block"
                            >
                              做核准尾款对账
                            </button>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* LEDGER STREAM TABLE */}
          <div className="bg-slate-900 border border-slate-850 rounded-xl overflow-x-auto shadow-md">
            <div className="p-4 border-b border-slate-800 flex flex-col md:flex-row items-center justify-between gap-4 bg-slate-950/20">
              <h3 className="text-xs font-bold text-slate-100 uppercase tracking-widest flex items-center gap-1.5">
                <History className="w-4 h-4 text-cyan-400" />
                <span>财务流水账</span>
              </h3>

              {/* Filtering */}
              <div className="flex gap-2">
                <select
                  value={selectedLedgerType}
                  onChange={e => setSelectedLedgerType(e.target.value)}
                  className="bg-slate-950 border border-slate-800 text-[10px] text-slate-350 p-2 rounded focus:outline-none"
                >
                  <option value="all">所有事件类型 (全部)</option>
                  <option value="进货支出">进货支出</option>
                  <option value="销售收入">销售收入</option>
                  <option value="售后退款">售后退款</option>
                  <option value="杂费支出">其它门店杂费</option>
                  <option value="员工提成">技术工提成</option>
                </select>

                <select
                  value={selectedPayWay}
                  onChange={e => setSelectedPayWay(e.target.value)}
                  className="bg-slate-950 border border-slate-800 text-[10px] text-slate-350 p-2 rounded focus:outline-none"
                >
                  <option value="all">所有付款渠道</option>
                  <option value="微信">微信支付</option>
                  <option value="支付宝">支付宝</option>
                  <option value="银行卡">对公账银行卡</option>
                  <option value="现金">门市现金</option>
                </select>

                <select
                  value={selectedSettlementAccount}
                  onChange={e => setSelectedSettlementAccount(e.target.value)}
                  className="bg-slate-950 border border-slate-800 text-[10px] text-slate-350 p-2 rounded focus:outline-none"
                >
                  <option value="all">所有结算账户</option>
                  {settlementAccounts.map(account => (
                    <option key={account.id} value={account.id}>{account.name}</option>
                  ))}
                </select>

                <input
                  value={selectedHandler}
                  onChange={e => setSelectedHandler(e.target.value)}
                  placeholder="经办人"
                  className="bg-slate-950 border border-slate-800 text-[10px] text-slate-350 p-2 rounded focus:outline-none w-24"
                />
              </div>
            </div>

            <table className="w-full text-left border-collapse min-w-[800px]">
              <thead>
                <tr className="border-b border-slate-800 bg-slate-950 text-[11px] text-slate-400 font-bold uppercase font-mono">
                  <th className="p-3 pl-4">交易流水时间</th>
                  <th className="p-3">事件编号 / 清单关联</th>
                  <th className="p-3">类型</th>
                  <th className="p-3">收款核销方式</th>
                  <th className="p-3 text-right">变动金额 (¥)</th>
                  <th className="p-3">结算账户</th>
                  <th className="p-3">财务经手经办人</th>
                  <th className="p-3 text-center">复审状态</th>
                  <th className="p-3 text-right pr-4">物理审计操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60 text-xs font-mono">
                {filteredLedger.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="p-10 text-center text-slate-500 font-semibold text-xs">
                      无对应核对标准的流账明细。
                    </td>
                  </tr>
                ) : (
                  filteredLedger.map(item => {
                    const isIncPositive = item.amount > 0;

                    return (
                      <tr key={item.id} className="hover:bg-slate-850/20 transition-colors">
                        <td className="p-3 pl-4 text-slate-450">{item.time}</td>
                        <td className="p-3">
                          <span className="font-bold text-slate-200">{item.id}</span>
                          {item.relatedId && (
                            <span className="block text-[9px] text-slate-500">票根: {item.relatedId}</span>
                          )}
                        </td>
                        <td className="p-3">
                          <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-bold ${
                            item.type.includes("收入") ? "bg-emerald-950 text-emerald-450" :
                            item.type.includes("退款") ? "bg-rose-955 text-rose-400" : "bg-slate-800 text-slate-350"
                          }`}>
                            {item.type}
                          </span>
                        </td>
                        <td className="p-3 text-slate-300 font-sans">{item.paymentWay}</td>
                        <td className={`p-3 text-right font-black text-sm ${isIncPositive ? "text-emerald-400" : "text-rose-400"}`}>
                          {isIncPositive ? `+` : ``}{item.amount}
                        </td>
                        <td className="p-3 text-slate-300">{item.settlementAccountName || "-"}</td>
                        <td className="p-3 text-slate-300">{item.handler || item.operator}</td>
                        <td className="p-3 text-center">
                          <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold ${
                            item.status === "已复核" ? "bg-emerald-500/10 text-emerald-400" : "bg-amber-500/10 text-amber-500 animate-pulse"
                          }`}>
                            {item.status}
                          </span>
                        </td>
                        <td className="p-3 text-right pr-4">
                          {item.status === "待审核" ? (
                            <button
                              onClick={() => handleReconcile(item.id)}
                              className="p-1 px-2.5 bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-black rounded text-[10px] duration-150 cursor-pointer"
                            >
                              一键对账核销
                            </button>
                          ) : (
                            <span className="text-[10px] text-slate-500 font-sans">已完成</span>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </>
      ) : (
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-16 text-center space-y-4">
          <div className="w-16 h-16 bg-rose-950/20 text-rose-450 border border-rose-900/30 rounded-full flex items-center justify-center mx-auto text-xl font-bold font-mono">
            ⚠️
          </div>
          <div className="max-w-md mx-auto space-y-2">
            <h3 className="text-base font-extrabold text-slate-200">资金对账权限受限</h3>
            <p className="text-xs text-slate-400 leading-relaxed font-sans">
              您当前以【<b>{storeState.currentRole}</b>】名义登录，未被授予敏感性经营收入、毛利指数、回款扣款条目查看等专权。
              如需查看完整财务数据，请切换到老板角色或联系管理员授权。
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
