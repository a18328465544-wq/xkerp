/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState, useMemo } from "react";
import {
  Users,
  Search,
  Plus,
  Compass,
  Briefcase,
  AlertTriangle,
  FileText,
  BadgeAlert,
  FolderMinus,
  CheckCircle,
  X,
  CreditCard,
  UserCheck
} from "lucide-react";
import { useStoreStateReturn } from "../utils/state";
import { CustomerCard as Customer, Vendor } from "../types";

interface PartnerManagerProps {
  storeState: useStoreStateReturn;
  initialTab?: "customers" | "vendors";
}

export default function PartnerManager({ storeState, initialTab = "customers" }: PartnerManagerProps) {
  const {
    customers,
    vendors,
    createCustomer,
    createVendor,
    addLog,
    currentRole
  } = storeState;

  // Tabs
  const [partnerTab, setPartnerTab] = useState<"customers" | "vendors">(initialTab);

  useEffect(() => {
    setPartnerTab(initialTab);
  }, [initialTab]);

  // Filter
  const [search, setSearch] = useState("");

  // Modals controllers
  const [isCustomerModalOpen, setIsCustomerModalOpen] = useState(false);
  const [isVendorModalOpen, setIsVendorModalOpen] = useState(false);

  // Form hooks - client
  const [cName, setCName] = useState("");
  const [cContact, setCContact] = useState("");
  const [cChannel, setCChannel] = useState<Customer["firstChannel"]>("闲鱼");
  const [cNotes, setCNotes] = useState("");

  // Form hooks - vendor
  const [vName, setVName] = useState("");
  const [vContact, setVContact] = useState("");
  const [vPartnerCategory, setVPartnerCategory] = useState<Vendor["partnerCategory"]>("同行");
  const [vType, setVType] = useState<Vendor["type"]>("工作室大宗货源");
  const [vIsRisk, setVIsRisk] = useState(false);
  const [vNotes, setVNotes] = useState("");

  useEffect(() => {
    setVType(vPartnerCategory === "个人" ? "门市散户" : "闲鱼同行");
  }, [vPartnerCategory]);

  // Filter computations
  const filteredCustomers = useMemo(() => {
    return customers.filter(c =>
      c.name.toLowerCase().includes(search.toLowerCase()) ||
      (c.contact || c.phone || "").toLowerCase().includes(search.toLowerCase())
    );
  }, [customers, search]);

  const filteredVendors = useMemo(() => {
    return vendors.filter(v =>
      v.name.toLowerCase().includes(search.toLowerCase()) ||
      (v.contact || v.phone || "").toLowerCase().includes(search.toLowerCase())
    );
  }, [vendors, search]);

  // Actions client
  const handleAddCustomer = (e: React.FormEvent) => {
    e.preventDefault();
    if (!cName.trim()) return;

    createCustomer({
      name: cName,
      contact: cContact,
      firstChannel: cChannel,
      totalPurchases: 1,
      debtBalance: 0,
      remarks: cNotes
    });

    setCName("");
    setCContact("");
    setCNotes("");
    setIsCustomerModalOpen(false);
    alert(`🎉 客户【${cName}】档案建卡成功！销售开单时可即时关联。`);
  };

  // Actions supplier
  const handleAddVendor = (e: React.FormEvent) => {
    e.preventDefault();
    if (!vName.trim()) return;

    createVendor({
      name: vName,
      contact: vContact,
      partnerCategory: vPartnerCategory,
      type: vType,
      isHighRisk: vIsRisk,
      debtBalance: 0,
      remarks: vNotes
    });

    setVName("");
    setVContact("");
    setVPartnerCategory("同行");
    setVNotes("");
    setIsVendorModalOpen(false);
    alert(`🎉 渠道商【${vName}】档案建档成功！回收登记中随时可以检索套用。`);
  };

  return (
    <div className="space-y-4">
      {/* Title */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-slate-900 p-5 rounded-2xl border border-slate-800">
        <div>
          <h2 className="text-base font-bold text-slate-100 flex items-center gap-2">
            <Users className="w-5 h-5 text-cyan-400" />
            <span>客户信用评定与渠道货源登记 (Partners Ledger)</span>
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            统筹管理门店的散客、电竞工作室供应商、以及同城调调商。对高风险工作室，予以标记警报，其下线所有的卡牌在烤机阶段将被重点对待。
          </p>
        </div>
        
        {/* Switch tabs */}
        <div className="flex bg-slate-950 p-1 rounded-xl border border-slate-800 shrink-0 select-none h-[42px] items-center">
          <button
            onClick={() => { setPartnerTab("customers"); setSearch(""); }}
            className={`px-4 py-1.5 rounded-lg text-xs font-black cursor-pointer ${
              partnerTab === "customers" ? "bg-cyan-500 text-slate-950" : "text-slate-400 hover:text-slate-200"
            }`}
          >
            买方客户数据库 ({customers.length})
          </button>
          <button
            onClick={() => { setPartnerTab("vendors"); setSearch(""); }}
            className={`px-4 py-1.5 rounded-lg text-xs font-black cursor-pointer ${
              partnerTab === "vendors" ? "bg-cyan-500 text-slate-950" : "text-slate-400 hover:text-slate-200"
            }`}
          >
            卖方回收供应商 ({vendors.length})
          </button>
        </div>
      </div>

      {/* SEARCH AND ADD ACTION BAR */}
      <div className="bg-slate-900 border border-slate-800 p-4 rounded-xl flex flex-col md:flex-row items-center justify-between gap-4 shadow-sm">
        <div className="relative w-full md:max-w-md">
          <Search className="w-4 h-4 absolute left-3 top-3 text-slate-500" />
          <input
            type="text"
            placeholder={partnerTab === "customers" ? "名称、客服联系方式穿透搜客..." : "穿透搜索合作渠道商、批发极、工作室..."}
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full bg-slate-950 border border-slate-850 pl-9 pr-3 py-2.5 rounded-lg text-xs text-slate-100 placeholder-slate-550 focus:outline-none focus:border-cyan-500 font-medium"
          />
        </div>

        {partnerTab === "customers" ? (
          <button
            onClick={() => setIsCustomerModalOpen(true)}
            className="w-full md:w-auto p-2.5 bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-black rounded-lg text-xs flex items-center justify-center gap-1 cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            快速登记新客户
          </button>
        ) : (
          <button
            onClick={() => setIsVendorModalOpen(true)}
            className="w-full md:w-auto p-2.5 bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-black rounded-lg text-xs flex items-center justify-center gap-1 cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            建档新供应商 / 渠道
          </button>
        )}
      </div>

      {/* DIRECTORY DISPLAY MATRIX */}
      {partnerTab === "customers" ? (
        // CLIENTS GRID
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {filteredCustomers.map(c => (
            <div key={c.id} className="bg-slate-900 border border-slate-800 rounded-2xl p-4.5 space-y-3 shadow-md hover:border-slate-700 transition-colors">
              <div className="flex justify-between items-center">
                <span className="text-[9px] bg-slate-950 border border-slate-850 text-slate-400 font-mono font-bold px-2 py-0.5 rounded-sm">
                  {c.id}
                </span>
                <span className="text-[10px] text-cyan-400 bg-cyan-950/40 px-2 rounded-full font-bold">
                  {c.firstChannel} 买家
                </span>
              </div>

              <div className="space-y-1">
                <h4 className="text-sm font-black text-slate-100">{c.name}</h4>
                <p className="text-xs text-slate-450 font-mono">{c.contact || c.phone || "无法核得联系方式"}</p>
              </div>

              <div className="grid grid-cols-2 gap-2 text-xs font-mono pt-1">
                <div className="bg-slate-950 p-2 rounded">
                  <span className="text-[10px] text-slate-550 block font-sans">累计采购数量</span>
                  <span className="text-slate-100 font-black block mt-1">{c.totalPurchases || c.buyCount || 0} 张</span>
                </div>
                <div className="bg-slate-950 p-2 rounded">
                  <span className="text-[10px] text-slate-555 block font-sans">客户欠款金额</span>
                  <span className={`font-black block mt-1 ${(c.debtBalance || 0) > 0 ? "text-amber-400" : "text-slate-500"}`}>
                    ¥{c.debtBalance || 0}
                  </span>
                </div>
              </div>

              <div className="text-[9px] text-slate-500 border-t border-slate-800/80 pt-2 text-ellipsis overflow-hidden whitespace-nowrap" title={c.remarks}>
                对账标签：{c.remarks || "普通高频个人电竞客群"}
              </div>
            </div>
          ))}
        </div>
      ) : (
        // SUPPLIERS GRID
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
          {filteredVendors.map(v => (
            <div
              key={v.id}
              className={`bg-slate-900 border rounded-2xl p-4.5 space-y-3 shadow-md hover:border-slate-700 transition-colors ${
                v.isHighRisk ? "border-rose-900/50 bg-rose-950/[0.02]" : "border-slate-800"
              }`}
            >
              <div className="flex justify-between items-center">
                <span className="text-[9px] bg-slate-950 border border-slate-850 text-slate-400 font-mono font-bold px-2 py-0.5 rounded-sm">
                  {v.id}
                </span>
                
                {v.isHighRisk ? (
                  <span className="text-[9px] font-black text-rose-455 bg-rose-500/10 px-2 py-0.5 rounded-full border border-rose-500/30 animate-pulse">
                     ⚠️ 矿危/翻新暗鬼
                  </span>
                ) : (
                  <span className="text-[10px] text-emerald-400 bg-emerald-950/40 px-2 rounded-full font-bold">
                    {v.partnerCategory || "同行"}
                  </span>
                )}
              </div>

              <div className="space-y-1">
                <h4 className="text-sm font-black text-slate-100 flex items-center gap-1.5">
                  {v.name}
                </h4>
                <p className="text-xs text-slate-455 font-mono">{v.contact || v.phone || v.contactPerson || "暂无物理联系手段"}</p>
              </div>

              <div className="grid grid-cols-2 gap-2 text-xs font-mono pt-1">
                <div className="bg-slate-950 p-2 rounded">
                  <span className="text-[10px] text-slate-550 block font-sans">来源身份</span>
                  <span className="text-slate-200 font-bold block mt-1 truncate">{v.partnerCategory || "同行"}</span>
                </div>
                <div className="bg-slate-950 p-2 rounded">
                  <span className="text-[10px] text-slate-555 block font-sans">本店未结账款</span>
                  <span className={`font-black block mt-1 ${(v.debtBalance || v.accountPayable || 0) > 0 ? "text-amber-400" : "text-slate-500"}`}>
                    ¥{v.debtBalance || v.accountPayable || 0}
                  </span>
                </div>
              </div>

              <div className="text-[9px] text-slate-500 border-t border-slate-800/80 pt-2 text-ellipsis overflow-hidden whitespace-nowrap" title={v.remarks}>
                对账标签：{v.remarks || "正常工作室合伙回收协议源"}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ADD CUSTOMER MODAL */}
      {isCustomerModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <form
            onSubmit={handleAddCustomer}
            className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-sm shadow-2xl p-5 space-y-4 text-slate-100"
          >
            <div className="flex items-center justify-between border-b border-slate-800 pb-2">
              <h3 className="font-bold text-slate-100 flex items-center gap-1.5 text-sm">
                <UserCheck className="w-5 h-5 text-cyan-400" />
                <span>登记新客源档案</span>
              </h3>
              <button type="button" onClick={() => setIsCustomerModalOpen(false)} className="text-slate-400">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3.5 text-xs">
              <div>
                <label className="text-slate-400 font-bold block mb-1">买家尊称</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. 李少（同城网咖采购）"
                  value={cName}
                  onChange={e => setCName(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-850 p-2.5 rounded text-white focus:outline-none"
                />
              </div>

              <div>
                <label className="text-slate-400 font-bold block mb-1">手机号码 / 微信</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. 13800138000"
                  value={cContact}
                  onChange={e => setCContact(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-850 p-2.5 rounded text-white focus:outline-none font-mono"
                />
              </div>

              <div>
                <label className="text-slate-400 font-bold block mb-1 font-sans">首单销售来源平台</label>
                <select
                  value={cChannel}
                  onChange={e => setCChannel(e.target.value as any)}
                  className="w-full bg-slate-950 border border-slate-850 p-2.5 rounded text-slate-205"
                >
                  <option value="到店">门市直销</option>
                  <option value="闲鱼">闲鱼担保</option>
                  <option value="微信私域">微信私域</option>
                  <option value="小红书">小红书粉款</option>
                  <option value="抖音">抖音直销</option>
                </select>
              </div>

              <div>
                <label className="text-slate-400 font-bold block mb-1">信用批注备注</label>
                <input
                  type="text"
                  placeholder="e.g. 大客户，要求顺丰保价"
                  value={cNotes}
                  onChange={e => setCNotes(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-855 p-2.5 rounded text-white focus:outline-none"
                />
              </div>
            </div>

            <div className="border-t border-slate-800 pt-3 flex justify-end gap-2 text-xs">
              <button
                type="button"
                onClick={() => setIsCustomerModalOpen(false)}
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

      {/* ADD VENDOR MODAL */}
      {isVendorModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4">
          <form
            onSubmit={handleAddVendor}
            className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-sm shadow-2xl p-5 space-y-4 text-slate-100"
          >
            <div className="flex items-center justify-between border-b border-slate-800 pb-2">
              <h3 className="font-bold text-slate-100 flex items-center gap-1.5 text-sm">
                <Briefcase className="w-5 h-5 text-cyan-400" />
                <span>登记供应商回收源档案</span>
              </h3>
              <button type="button" onClick={() => setIsVendorModalOpen(false)} className="text-slate-400">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3.5 text-xs">
              <div>
                <label className="text-slate-400 font-bold block mb-1">来源身份</label>
                <select
                  value={vPartnerCategory}
                  onChange={e => setVPartnerCategory(e.target.value as Vendor["partnerCategory"])}
                  className="w-full bg-slate-950 border border-slate-850 p-2.5 rounded text-slate-205"
                >
                  <option value="个人">个人</option>
                  <option value="同行">同行</option>
                </select>
              </div>

              <div>
                <label className="text-slate-400 font-bold block mb-1">
                  {vPartnerCategory === "个人" ? "个人卖家姓名" : "同行 / 供应商名称"}
                </label>
                <input
                  type="text"
                  required
                  placeholder={vPartnerCategory === "个人" ? "e.g. 张建国" : "e.g. 宏达数码极客批发 (老李)"}
                  value={vName}
                  onChange={e => setVName(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-850 p-2.5 rounded text-white focus:outline-none font-sans"
                />
              </div>

              <div>
                <label className="text-slate-400 font-bold block mb-1">手机号码 / 联系</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. 1391100223"
                  value={vContact}
                  onChange={e => setVContact(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-850 p-2.5 rounded text-white focus:outline-none font-mono"
                />
              </div>

              <div className="p-3 bg-red-950/10 border border-rose-950 rounded flex items-center gap-4 text-xs font-semibold">
                <input
                  type="checkbox"
                  id="risk_check"
                  checked={vIsRisk}
                  onChange={e => setVIsRisk(e.target.checked)}
                  className="rounded text-rose-500 bg-slate-900 border-slate-800"
                />
                <label htmlFor="risk_check" className="text-rose-400 cursor-pointer flex items-center gap-1">
                  <AlertTriangle className="w-4 h-4 text-rose-500 animate-pulse" />
                  标记为高风险供应商 (进货烤机质检强审)
                </label>
              </div>

              <div>
                <label className="text-slate-400 font-bold block mb-1">渠道说明</label>
                <input
                  type="text"
                  placeholder="备注水洗翻新率"
                  value={vNotes}
                  onChange={e => setVNotes(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-850 p-2.5 rounded text-slate-205"
                />
              </div>
            </div>

            <div className="border-t border-slate-800 pt-3 flex justify-end gap-2 text-xs">
              <button
                type="button"
                onClick={() => setIsVendorModalOpen(false)}
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
