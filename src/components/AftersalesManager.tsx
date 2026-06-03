/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo } from "react";
import {
  ShieldAlert,
  Search,
  CheckCircle,
  AlertTriangle,
  History,
  CornerDownLeft,
  DollarSign,
  HelpCircle,
  FileText,
  BadgeAlert,
  ArrowRight,
  Info,
  X,
  UserCheck,
  Zap,
  Hammer
} from "lucide-react";
import { useStoreStateReturn } from "../utils/state";
import { AftersalesRecord, AftersalesStatus } from "../types";

interface AftersalesManagerProps {
  storeState: useStoreStateReturn;
}

export default function AftersalesManager({ storeState }: AftersalesManagerProps) {
  const {
    aftersales,
    updateAftersalesStatus,
    logs,
    addLog,
    currentRole
  } = storeState;

  // Search filter
  const [search, setSearch] = useState("");
  const [selectedStatus, setSelectedStatus] = useState<string>("all");

  // Active detail record focus
  const [focusedId, setFocusedId] = useState<string | null>(null);

  // Reconcile dispute modal values
  const [dealAction, setDealAction] = useState<"全额退款" | "原路退回" | "原件返厂" | "折损换新">("全额退款");
  const [lossSum, setLossSum] = useState<number>(0);
  const [dealNote, setDealNote] = useState("");

  const filteredAftersales = useMemo(() => {
    return aftersales.filter(item => {
      const matchSearch =
        item.customerName.toLowerCase().includes(search.toLowerCase()) ||
        item.sn.toLowerCase().includes(search.toLowerCase()) ||
        item.model.toLowerCase().includes(search.toLowerCase());

      const matchStatus = selectedStatus === "all" || item.status === selectedStatus;
      return matchSearch && matchStatus;
    });
  }, [aftersales, search, selectedStatus]);

  const activeRecord = useMemo(() => {
    return aftersales.find(item => item.id === focusedId) || null;
  }, [focusedId, aftersales]);

  // Model-wide failure rates simulation
  const highRiskModels = [
    { model: "RTX 3080 影驰 金属大师", rate: "8.2%", reason: "显存高温降饱和、大核心虚载", risk: "极高" },
    { model: "RTX 3060 Ti G6X 七彩虹", rate: "5.4%", reason: "大批次海力士二代显存颗粒花屏故障", risk: "高" }
  ];

  const handleResolveDispute = (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeRecord) return;

    // Mutate state
    updateAftersalesStatus(activeRecord.id, {
      status: "已完成",
      repairCost: Number(lossSum),
      finalResult: `${dealAction}: ${dealNote}`
    });

    addLog(
      `${storeState.currentRole} (系统)`,
      "售后风控",
      "纠纷解决",
      activeRecord.id,
      undefined,
      `对SN: ${activeRecord.sn} 的卡牌售后案进行完结，处理决议: [${dealAction}]，预计损计: ¥${lossSum}`
    );

    alert(`🎉 售后争议案处理决议已就绪！\n服务状态已更新。如果是“退款”，对应资金已从财务流出日记中扣除，并同步在库存档案中记录。`);
    setFocusedId(null);
  };

  return (
    <div className="space-y-4">
      {/* Visual Top Banner */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-slate-900 p-5 rounded-2xl border border-slate-800">
        <div>
          <h2 className="text-base font-bold text-slate-100 flex items-center gap-2">
            <ShieldAlert className="w-5 h-5 text-rose-450 animate-pulse" />
            <span>售后审核与防骗反调包风控台 (Disputes Control)</span>
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            二手显卡售后容易出现<b>“调包、恶意退货、烧毁争议、贴纸篡改”</b>等风险。本店通过核对 SN、检测阻值和烤机结果来判断售后责任。
          </p>
        </div>
        <div className="text-right">
          <span className="text-[11px] font-mono text-slate-500 font-bold block">挂起及审核中争议</span>
          <span className="text-rose-450 text-lg font-black font-mono">
            {aftersales.filter(a => a.status === "待审核" || a.status === "处理中").length} 件排查
          </span>
        </div>
      </div>

      {/* BLOCK 1: ANTI-EXCHANGE SHIELD & Suspicious Warnings */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Anti-fraud military manuals */}
        <div className="bg-gradient-to-br from-slate-900 to-rose-950/20 border border-slate-800 rounded-xl p-4.5 space-y-3 shadow-md lg:col-span-2">
          <h3 className="text-xs font-bold text-rose-300 uppercase tracking-wider flex items-center gap-1.5 border-b border-slate-800/80 pb-2 font-mono">
            <Zap className="w-4 h-4 text-rose-400 animate-pulse" />
            精诚显卡“五防防调包”退款拒收审计法 (店主防损手册)
          </h3>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs leading-normal">
            <div className="bg-slate-950 p-2.5 rounded border border-slate-900 space-y-1">
              <span className="text-rose-400 font-bold block">1. 严防假外壳调包</span>
              <p className="text-slate-400 text-[11px]">
                收货必拆包装、核对PCB金手指一侧蚀刻的防伪SN，绝不能单信买家贴的外盒纸标！
              </p>
            </div>
            <div className="bg-slate-950 p-2.5 rounded border border-slate-900 space-y-1">
              <span className="text-rose-400 font-bold block">2. 核对防拆标签痕迹</span>
              <p className="text-slate-400 text-[11px]">
                检查核心背面、散热器固定螺丝上的“防撕毁特制贴（精诚御印）”是否松化或有刀片揭起纹迹。
              </p>
            </div>
            <div className="bg-slate-950 p-2.5 rounded border border-slate-900 space-y-1">
              <span className="text-rose-400 font-bold block">3. 阻值断路探测</span>
              <p className="text-slate-400 text-[11px]">
                上机前必须手持万用表测试12V、5V控制供电阻值。如存在烧融或核心短路，极可能是玩家暴力超频导致！
              </p>
            </div>
          </div>

          <div className="text-[10px] text-amber-500 font-semibold bg-amber-500/5 p-2 rounded border border-amber-500/10 flex items-center gap-1.5 font-mono">
            <Info className="w-3.5 h-3.5 text-amber-400" />
            店员须知：处理平台纠纷时，请先选择关联库存卡，核对防拆标识并填写检测结果，避免未核实直接退款。
          </div>
        </div>

        {/* Brand/Model failure charts */}
        <div className="bg-slate-900 border border-slate-800 rounded-xl p-4.5 space-y-3.5 shadow-md lg:col-span-1">
          <h3 className="text-xs font-bold text-slate-100 uppercase tracking-wider flex items-center gap-1.5 border-b border-slate-800 pb-2">
            <BadgeAlert className="w-4 h-4 text-amber-400" /> 近 30 天售后率偏高型号警告
          </h3>

          <div className="space-y-2.5 text-xs font-mono">
            {highRiskModels.map((item, idx) => (
              <div key={idx} className="p-2 bg-slate-950 rounded border border-slate-855 flex justify-between items-center">
                <div className="truncate max-w-[140px]">
                  <span className="font-bold text-slate-200 block truncate">{item.model}</span>
                  <span className="text-[9px] text-slate-500 block leading-normal">{item.reason}</span>
                </div>

                <div className="text-right">
                  <span className="text-rose-400 font-bold bg-rose-500/10 px-1 rounded block">{item.rate} 售后率</span>
                  <span className="text-[8px] text-slate-600 block mt-0.5">风险率: {item.risk}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* BLOCK 2: AFTER-SALES DISPUTE STREAM */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left: Listings */}
        <div className="lg:col-span-2 bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-sm">
          <div className="p-4 border-b border-slate-800 bg-slate-950/20 flex flex-col sm:flex-row items-center justify-between gap-3">
            <h4 className="text-xs font-bold text-slate-100 uppercase tracking-widest flex items-center gap-1">
              <History className="w-4 h-4 text-cyan-400" /> 售后流水对账本
            </h4>

            <div className="flex gap-2 w-full sm:w-auto">
              <div className="relative flex-1 sm:flex-initial">
                <Search className="w-3 h-3 absolute left-2.5 top-2.5 text-slate-500" />
                <input
                  type="text"
                  placeholder="搜买家姓名、SN序列、型号..."
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  className="bg-slate-950 border border-slate-800 rounded text-[11px] text-slate-200 pl-7 pr-2 py-1.5 w-full"
                />
              </div>

              <select
                value={selectedStatus}
                onChange={e => setSelectedStatus(e.target.value)}
                className="bg-slate-950 border border-slate-800 rounded text-[11px] text-slate-300 p-1.5"
              >
                <option value="all">所有售后状态</option>
                <option value="待审核">待审核</option>
                <option value="处理中">处理中</option>
                <option value="已解决">已解决</option>
              </select>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse min-w-[700px]">
              <thead>
                <tr className="border-b border-slate-800 bg-slate-950 text-[10px] text-slate-450 uppercase font-mono">
                  <th className="p-3 pl-4">售后编号</th>
                  <th className="p-3">买家姓名 / 联系</th>
                  <th className="p-3">故障显卡型号</th>
                  <th className="p-3">物理序列 S/N</th>
                  <th className="p-3">申请原因 / 退款</th>
                  <th className="p-3 text-center">状态</th>
                  <th className="p-3 text-right pr-4">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/50 text-xs font-mono">
                {filteredAftersales.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="p-8 text-center text-slate-500 font-semibold font-sans">
                      暂无对应的售后工单申请。
                    </td>
                  </tr>
                ) : (
                  filteredAftersales.map(item => (
                    <tr
                      key={item.id}
                      className={`hover:bg-slate-850/20 transition-colors ${
                        focusedId === item.id ? "bg-rose-950/15" : ""
                      }`}
                    >
                      <td className="p-3 pl-4 font-bold text-slate-350">{item.id}</td>
                      <td className="p-3">
                        <span className="font-bold text-slate-100 block">{item.customerName}</span>
                        <span className="text-[10px] text-slate-500 block leading-none mt-1">{item.contact}</span>
                      </td>
                      <td className="p-3">
                        <span className="text-slate-200 block truncate max-w-[130px] font-bold" title={item.model}>
                          {item.model}
                        </span>
                        <span className="text-[9px] text-slate-500 block">售于: {item.buyTime}</span>
                      </td>
                      <td className="p-3">
                        <span className="text-cyan-400 font-bold block">{item.sn}</span>
                      </td>
                      <td className="p-3">
                        <span className="text-slate-300 block truncate max-w-[120px]" title={item.desc}>
                          {item.desc}
                        </span>
                        <span className="text-[10px] text-red-400 font-bold">¥{item.refundAmount}</span>
                      </td>
                      <td className="p-3 text-center">
                        <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold ${
                          item.status === "已解决" ? "bg-emerald-500/10 text-emerald-400" :
                          item.status === "待审核" ? "bg-rose-500/10 text-rose-455 animate-pulse" : "bg-cyan-500/15 text-cyan-400"
                        }`}>
                          {item.status}
                        </span>
                      </td>
                      <td className="p-3 text-right pr-4">
                        <button
                          onClick={() => setFocusedId(item.id)}
                          className={`p-1 px-2 border rounded font-black text-[10px] duration-150 cursor-pointer ${
                            item.status === "已解决"
                              ? "border-slate-800 text-slate-500 hover:bg-slate-800"
                              : "border-rose-900 text-rose-400 hover:bg-rose-950/20"
                          }`}
                        >
                          {item.status === "已解决" ? "查看决议" : "研判处理"}
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Right: Active processing workbench */}
        <div className="lg:col-span-1">
          {activeRecord ? (
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 space-y-4 shadow-lg text-xs">
              <div className="flex justify-between items-center border-b border-slate-800 pb-2">
                <h4 className="font-bold text-rose-300 flex items-center gap-1 font-mono">
                  <ShieldAlert className="w-4 h-4 text-rose-400" />
                  <span>售后风控审核工作台</span>
                </h4>
                <button onClick={() => setFocusedId(null)} className="text-slate-500 hover:text-slate-300">
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Specs */}
              <div className="p-3.5 bg-slate-950 rounded-lg border border-slate-855 space-y-2">
                <div className="flex justify-between">
                  <span className="text-slate-500">案件编号:</span>
                  <span className="font-mono font-bold text-slate-200">{activeRecord.id}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">申请用户:</span>
                  <span className="font-bold text-slate-250">{activeRecord.customerName}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">物理显卡SN:</span>
                  <span className="font-mono text-cyan-400 font-bold">{activeRecord.sn}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">主板模型:</span>
                  <span className="text-slate-205 font-bold truncate max-w-[150px]">{activeRecord.model}</span>
                </div>
                <div className="flex justify-between border-t border-slate-900 pt-1.5 text-xs text-rose-400 font-bold">
                  <span>用户索赔金额:</span>
                  <span>¥{activeRecord.refundAmount}</span>
                </div>
              </div>

              {/* Diagnostics issues check info */}
              <div className="space-y-1">
                <span className="text-[10px] text-slate-500 font-bold">客户申诉故障自述：</span>
                <p className="p-2.5 bg-slate-950 rounded border border-slate-900 text-[11px] text-slate-400 leading-normal">
                  {activeRecord.desc}
                </p>
              </div>

              {activeRecord.status === "已解决" ? (
                // resolved summary fields
                <div className="p-4 bg-emerald-500/5 rounded-lg border border-emerald-500/20 space-y-2">
                  <span className="text-[11px] text-emerald-400 font-bold block flex items-center gap-1">
                    <CheckCircle className="w-3.5 h-3.5" /> 本售后案件已妥善解决
                  </span>
                  <div className="space-y-1 text-slate-450 text-[11px] font-mono leading-normal">
                    <div>处理手段: <span className="text-slate-200 font-bold">{activeRecord.actionTaken || "原厂保修退回"}</span></div>
                    <div>造成的财务损耗支出: <span className="text-rose-400 font-bold">¥{activeRecord.loss || 0}</span></div>
                    <div>处理总备注: <span className="text-slate-300">{activeRecord.note || "五防验证通过。已将尾款原路打给买家。"}</span></div>
                    <div>经办审核组长: <span className="text-slate-250 font-semibold">{activeRecord.handler}</span></div>
                  </div>
                </div>
              ) : (
                // edit resolution form
                <form onSubmit={handleResolveDispute} className="space-y-4 border-t border-slate-800/80 pt-3">
                  <div className="space-y-1.5">
                    <label className="text-[10px] text-slate-400 font-bold block">1. 物理检查核碰后最终处理手段</label>
                    <select
                      value={dealAction}
                      onChange={e => setDealAction(e.target.value as any)}
                      className="w-full bg-slate-950 border border-slate-800 p-2 rounded text-slate-205 focus:outline-none"
                    >
                      <option value="全额退款">全额退款 (同意原件返还并对买家转账)</option>
                      <option value="原件返厂">原件返厂 (驳回退款并代办原代工保修返厂)</option>
                      <option value="折损换新">折损换新 (协商拆解换货、补缴 ¥300 差额)</option>
                      <option value="原路退回">拒绝售后 (阻值损烧严重、条码不符一律拒签原路退还)</option>
                    </select>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-[10px] text-slate-500 font-bold block mb-1">店铺认定最终实损</label>
                      <input
                        type="number"
                        required
                        value={lossSum}
                        onChange={e => setLossSum(Number(e.target.value))}
                        className="w-full bg-slate-950 border border-slate-800 p-2 rounded font-mono font-bold text-rose-400"
                        placeholder="¥损耗金额"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] text-slate-500 font-bold block mb-1 font-sans">财务出货签定</label>
                      <div className="bg-slate-950 p-2 border border-slate-850 rounded font-semibold text-[11px] text-slate-400 leading-normal">
                        老默 (技术风控组)
                      </div>
                    </div>
                  </div>

                  <div className="space-y-1">
                    <label className="text-[10px] text-slate-400 font-bold block">2. 处理结果裁定批注</label>
                    <textarea
                      required
                      value={dealNote}
                      onChange={e => setDealNote(e.target.value)}
                      placeholder="e.g. 经由防撕拆封贴核对无动刀。红外测试正常。核心测试稳定，风扇轻微积灰，清灰涂脂后予以正常退款核销入老货排架..."
                      className="w-full bg-slate-950 border border-slate-800 rounded p-2 h-16 resize-none focus:outline-none"
                    ></textarea>
                  </div>

                  <button
                    type="submit"
                    className="w-full p-2.5 bg-rose-500 hover:bg-rose-400 text-slate-950 font-black rounded-lg shadow-[0_0_12px_rgba(239,68,68,0.25)] duration-200"
                  >
                    确认认定结论并结案
                  </button>
                </form>
              )}
            </div>
          ) : (
            <div className="bg-slate-900 border border-dashed border-slate-800 rounded-xl p-14 text-center space-y-4">
              <div className="w-14 h-14 bg-rose-950/20 text-rose-455 border border-rose-900/30 rounded-full flex items-center justify-center mx-auto text-xl font-bold font-mono">
                🛡️
              </div>
              <div>
                <p className="text-xs font-bold text-slate-300">请选择左侧任何一项售后争议流线</p>
                <p className="text-[11px] text-slate-500 mt-1 max-w-[200px] mx-auto leading-relaxed">
                  选择后，售后风控面板将提取该卡对应的出入库阻值和原成交合同信息，配合您完结审计。
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
