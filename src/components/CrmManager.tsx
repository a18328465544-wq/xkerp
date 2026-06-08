/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useMemo, useState } from "react";
import {
  CalendarClock,
  ClipboardList,
  MessageSquareText,
  Plus,
  Search,
  Target,
  UserRoundCheck,
  Users,
} from "lucide-react";
import { CrmFollowUpRecord, CrmRequirement, CustomerCard } from "../types";
import { useStoreStateReturn } from "../utils/state";
import { getLockedHandlerFieldState } from "../utils/sessionUser";

interface CrmManagerProps {
  storeState: useStoreStateReturn;
}

const nowText = () => new Date().toISOString().replace("T", " ").substring(0, 16);
const fieldClass = "w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2.5 text-xs text-slate-100 placeholder-slate-500 focus:outline-none focus:border-emerald-500";

export default function CrmManager({ storeState }: CrmManagerProps) {
  const {
    customers,
    currentRole,
    createCustomer,
    createCrmFollowUp,
    createCrmRequirement,
    getCrmSummary,
    currentUser,
  } = storeState;
  const lockedHandlerState = getLockedHandlerFieldState(currentUser, currentRole);
  const defaultHandlerName = lockedHandlerState.value;

  const [search, setSearch] = useState("");
  const [ownerFilter, setOwnerFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [intentFilter, setIntentFilter] = useState("");

  const [customerForm, setCustomerForm] = useState({
    name: "",
    contact: "",
    firstChannel: "微信私域",
    owner: defaultHandlerName,
    level: "潜在客户" as CustomerCard["level"],
    crmStatus: "线索" as CustomerCard["crmStatus"],
    intent: "中" as CustomerCard["intent"],
    budget: "0",
    remarks: "",
  });

  const [followForm, setFollowForm] = useState({
    customerId: customers[0]?.id || "",
    contactMethod: "微信" as CrmFollowUpRecord["contactMethod"],
    content: "",
    result: "继续跟进" as CrmFollowUpRecord["result"],
    handler: defaultHandlerName,
    followTime: nowText(),
    nextFollowTime: "",
    remarks: "",
  });

  const [requirementForm, setRequirementForm] = useState({
    customerId: customers[0]?.id || "",
    productDemand: "",
    budget: "0",
    intent: "中" as CrmRequirement["intent"],
    stage: "需求确认" as CrmRequirement["stage"],
    source: "CRM",
    handler: defaultHandlerName,
    expectedDealTime: "",
    remarks: "",
  });

  const owners = useMemo(() => {
    const list = customers.map(item => item.owner).filter(Boolean) as string[];
    return Array.from(new Set(list));
  }, [customers]);

  useEffect(() => {
    setCustomerForm(prev => ({ ...prev, owner: defaultHandlerName }));
    setFollowForm(prev => ({ ...prev, handler: defaultHandlerName }));
    setRequirementForm(prev => ({ ...prev, handler: defaultHandlerName }));
  }, [defaultHandlerName]);

  const summary = useMemo(
    () => getCrmSummary({ owner: ownerFilter, status: statusFilter, intent: intentFilter, customerName: search }),
    [getCrmSummary, ownerFilter, statusFilter, intentFilter, search]
  );

  const filteredCustomers = summary.customers;
  const recentFollowUps = summary.followUps.slice(0, 8);
  const activeRequirements = summary.requirements.slice(0, 8);

  const submitCustomer = (event: React.FormEvent) => {
    event.preventDefault();
    if (!customerForm.name.trim()) return;
    const created = createCustomer({
      ...customerForm,
      fromCrm: true,
      budget: Number(customerForm.budget) || 0,
      crmStage: "新线索",
      totalPurchases: 0,
      debtBalance: 0,
    });
    setFollowForm(prev => ({ ...prev, customerId: created.id }));
    setRequirementForm(prev => ({ ...prev, customerId: created.id }));
    setCustomerForm(prev => ({ ...prev, name: "", contact: "", budget: "0", remarks: "" }));
  };

  const submitFollowUp = (event: React.FormEvent) => {
    event.preventDefault();
    if (!followForm.customerId || !followForm.content.trim()) return;
    createCrmFollowUp({
      ...followForm,
      followTime: followForm.followTime || nowText(),
      nextFollowTime: followForm.nextFollowTime || undefined,
      remarks: followForm.remarks || undefined,
    });
    setFollowForm(prev => ({ ...prev, content: "", followTime: nowText(), nextFollowTime: "", remarks: "" }));
  };

  const submitRequirement = (event: React.FormEvent) => {
    event.preventDefault();
    if (!requirementForm.customerId || !requirementForm.productDemand.trim()) return;
    createCrmRequirement({
      ...requirementForm,
      budget: Number(requirementForm.budget) || 0,
      expectedDealTime: requirementForm.expectedDealTime || undefined,
      remarks: requirementForm.remarks || undefined,
    });
    setRequirementForm(prev => ({ ...prev, productDemand: "", budget: "0", expectedDealTime: "", remarks: "" }));
  };

  const customerOptions = customers.map(customer => (
    <option key={customer.id} value={customer.id}>
      {customer.name} / {customer.owner || "未分配"}
    </option>
  ));

  return (
    <div className="space-y-5">
      <section className="bg-slate-900 border border-slate-800 rounded-xl p-5">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <h2 className="text-base font-black text-slate-100 flex items-center gap-2">
              <Users className="w-5 h-5 text-emerald-400" />
              CRM 客户管理
            </h2>
            <p className="text-xs text-slate-400 mt-1">集中管理客户线索、跟进记录、需求预算、负责人和成交阶段。</p>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
            {[
              ["客户总数", summary.totals.customers, "text-slate-100"],
              ["跟进中", summary.totals.following, "text-cyan-300"],
              ["高意向", summary.totals.highIntent, "text-amber-300"],
              ["待跟进", summary.totals.pendingFollowUps, "text-rose-300"],
            ].map(([label, value, color]) => (
              <div key={label} className="bg-slate-950 border border-slate-800 rounded-lg p-3 min-w-28">
                <div className="text-[10px] text-slate-500">{label}</div>
                <div className={`text-lg font-black mt-1 ${color}`}>{value}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="bg-slate-900 border border-slate-800 rounded-xl p-4">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
          <label className="relative">
            <Search className="absolute left-3 top-3 w-4 h-4 text-slate-500" />
            <input
              value={search}
              onChange={event => setSearch(event.target.value)}
              placeholder="搜索客户、电话、微信"
              className="w-full bg-slate-950 border border-slate-800 rounded-lg pl-9 pr-3 py-2.5 text-xs text-slate-100 focus:outline-none focus:border-emerald-500"
            />
          </label>
          <select value={ownerFilter} onChange={event => setOwnerFilter(event.target.value)} className="bg-slate-950 border border-slate-800 rounded-lg px-3 py-2.5 text-xs text-slate-100 focus:outline-none focus:border-emerald-500">
            <option value="">全部负责人</option>
            {owners.map(owner => <option key={owner} value={owner}>{owner}</option>)}
          </select>
          <select value={statusFilter} onChange={event => setStatusFilter(event.target.value)} className="bg-slate-950 border border-slate-800 rounded-lg px-3 py-2.5 text-xs text-slate-100 focus:outline-none focus:border-emerald-500">
            <option value="">全部状态</option>
            {["线索", "跟进中", "已成交", "沉睡", "流失"].map(item => <option key={item} value={item}>{item}</option>)}
          </select>
          <select value={intentFilter} onChange={event => setIntentFilter(event.target.value)} className="bg-slate-950 border border-slate-800 rounded-lg px-3 py-2.5 text-xs text-slate-100 focus:outline-none focus:border-emerald-500">
            <option value="">全部意向</option>
            {["高", "中", "低"].map(item => <option key={item} value={item}>{item}意向</option>)}
          </select>
        </div>
      </section>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
        <form onSubmit={submitCustomer} className="bg-slate-900 border border-slate-800 rounded-xl p-4 space-y-3">
          <h3 className="text-sm font-black text-slate-100 flex items-center gap-2">
            <Plus className="w-4 h-4 text-emerald-400" />
            新增客户线索
          </h3>
          <input value={customerForm.name} onChange={event => setCustomerForm(prev => ({ ...prev, name: event.target.value }))} placeholder="客户名称" className={fieldClass} />
          <input value={customerForm.contact} onChange={event => setCustomerForm(prev => ({ ...prev, contact: event.target.value }))} placeholder="电话 / 微信 / 闲鱼号" className={fieldClass} />
          <div className="grid grid-cols-2 gap-2">
            <select value={customerForm.firstChannel} onChange={event => setCustomerForm(prev => ({ ...prev, firstChannel: event.target.value }))} className={fieldClass}>
              {["微信私域", "闲鱼", "淘宝", "到店", "抖音", "同行介绍", "其他"].map(item => <option key={item} value={item}>{item}</option>)}
            </select>
            <input value={customerForm.owner} readOnly={lockedHandlerState.readOnly} disabled={lockedHandlerState.disabled} placeholder="负责人" className={`${fieldClass} cursor-not-allowed opacity-80`} />
          </div>
          <div className="grid grid-cols-3 gap-2">
            <select value={customerForm.level} onChange={event => setCustomerForm(prev => ({ ...prev, level: event.target.value as CustomerCard["level"] }))} className={fieldClass}>
              {["潜在客户", "普通客户", "VIP客户", "重点客户", "黑名单"].map(item => <option key={item} value={item}>{item}</option>)}
            </select>
            <select value={customerForm.intent} onChange={event => setCustomerForm(prev => ({ ...prev, intent: event.target.value as CustomerCard["intent"] }))} className={fieldClass}>
              {["高", "中", "低"].map(item => <option key={item} value={item}>{item}意向</option>)}
            </select>
            <input type="number" value={customerForm.budget} onChange={event => setCustomerForm(prev => ({ ...prev, budget: event.target.value }))} placeholder="预算" className={fieldClass} />
          </div>
          <textarea value={customerForm.remarks} onChange={event => setCustomerForm(prev => ({ ...prev, remarks: event.target.value }))} placeholder="备注" className={`${fieldClass} min-h-20`} />
          <button className="w-full bg-emerald-500 hover:bg-emerald-400 text-slate-950 rounded-lg py-2.5 text-xs font-black">保存客户</button>
        </form>

        <form onSubmit={submitFollowUp} className="bg-slate-900 border border-slate-800 rounded-xl p-4 space-y-3">
          <h3 className="text-sm font-black text-slate-100 flex items-center gap-2">
            <MessageSquareText className="w-4 h-4 text-cyan-400" />
            新增跟进记录
          </h3>
          <select value={followForm.customerId} onChange={event => setFollowForm(prev => ({ ...prev, customerId: event.target.value }))} className={fieldClass}>
            <option value="">选择客户</option>
            {customerOptions}
          </select>
          <div className="grid grid-cols-2 gap-2">
            <select value={followForm.contactMethod} onChange={event => setFollowForm(prev => ({ ...prev, contactMethod: event.target.value as CrmFollowUpRecord["contactMethod"] }))} className={fieldClass}>
              {["微信", "电话", "闲鱼", "淘宝", "到店", "其他"].map(item => <option key={item} value={item}>{item}</option>)}
            </select>
            <select value={followForm.result} onChange={event => setFollowForm(prev => ({ ...prev, result: event.target.value as CrmFollowUpRecord["result"] }))} className={fieldClass}>
              {["继续跟进", "已报价", "已成交", "暂缓", "无效线索", "售后维护"].map(item => <option key={item} value={item}>{item}</option>)}
            </select>
          </div>
          <textarea value={followForm.content} onChange={event => setFollowForm(prev => ({ ...prev, content: event.target.value }))} placeholder="本次沟通内容" className={`${fieldClass} min-h-20`} />
          <div className="grid grid-cols-2 gap-2">
            <input value={followForm.handler} readOnly={lockedHandlerState.readOnly} disabled={lockedHandlerState.disabled} placeholder="经办人" className={`${fieldClass} cursor-not-allowed opacity-80`} />
            <input value={followForm.nextFollowTime} onChange={event => setFollowForm(prev => ({ ...prev, nextFollowTime: event.target.value }))} placeholder="下次跟进时间" className={fieldClass} />
          </div>
          <button className="w-full bg-cyan-500 hover:bg-cyan-400 text-slate-950 rounded-lg py-2.5 text-xs font-black">保存跟进</button>
        </form>

        <form onSubmit={submitRequirement} className="bg-slate-900 border border-slate-800 rounded-xl p-4 space-y-3">
          <h3 className="text-sm font-black text-slate-100 flex items-center gap-2">
            <Target className="w-4 h-4 text-amber-400" />
            登记客户需求
          </h3>
          <select value={requirementForm.customerId} onChange={event => setRequirementForm(prev => ({ ...prev, customerId: event.target.value }))} className={fieldClass}>
            <option value="">选择客户</option>
            {customerOptions}
          </select>
          <input value={requirementForm.productDemand} onChange={event => setRequirementForm(prev => ({ ...prev, productDemand: event.target.value }))} placeholder="需求商品 / 配置" className={fieldClass} />
          <div className="grid grid-cols-3 gap-2">
            <input type="number" value={requirementForm.budget} onChange={event => setRequirementForm(prev => ({ ...prev, budget: event.target.value }))} placeholder="预算" className={fieldClass} />
            <select value={requirementForm.intent} onChange={event => setRequirementForm(prev => ({ ...prev, intent: event.target.value as CrmRequirement["intent"] }))} className={fieldClass}>
              {["高", "中", "低"].map(item => <option key={item} value={item}>{item}意向</option>)}
            </select>
            <select value={requirementForm.stage} onChange={event => setRequirementForm(prev => ({ ...prev, stage: event.target.value as CrmRequirement["stage"] }))} className={fieldClass}>
              {["需求确认", "报价中", "已成交", "已关闭"].map(item => <option key={item} value={item}>{item}</option>)}
            </select>
          </div>
          <input value={requirementForm.handler} readOnly={lockedHandlerState.readOnly} disabled={lockedHandlerState.disabled} placeholder="经办人" className={`${fieldClass} cursor-not-allowed opacity-80`} />
          <button className="w-full bg-amber-400 hover:bg-amber-300 text-slate-950 rounded-lg py-2.5 text-xs font-black">保存需求</button>
        </form>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-5">
        <section className="xl:col-span-2 bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-800 flex items-center gap-2 text-sm font-black text-slate-100">
            <UserRoundCheck className="w-4 h-4 text-emerald-400" />
            客户池
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-slate-950 text-slate-500">
                <tr>
                  {["客户", "负责人", "状态", "意向", "预算", "阶段", "下次跟进"].map(head => (
                    <th key={head} className="text-left px-4 py-3 font-bold">{head}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {filteredCustomers.map(customer => (
                  <tr key={customer.id} className="hover:bg-slate-850/50">
                    <td className="px-4 py-3">
                      <div className="font-black text-slate-100">{customer.name}</div>
                      <div className="text-[10px] text-slate-500 mt-0.5">{customer.phone || customer.wechat || customer.source}</div>
                    </td>
                    <td className="px-4 py-3 text-slate-300">{customer.owner || "未分配"}</td>
                    <td className="px-4 py-3 text-cyan-300">{customer.crmStatus || "线索"}</td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-1 rounded-full text-[10px] font-black ${customer.intent === "高" ? "bg-amber-400/15 text-amber-300" : "bg-slate-800 text-slate-300"}`}>
                        {customer.intent || "中"}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-300">{customer.budget || 0}元</td>
                    <td className="px-4 py-3 text-slate-300">{customer.crmStage || "新线索"}</td>
                    <td className="px-4 py-3 text-slate-400">{customer.nextFollowTime || "未设置"}</td>
                  </tr>
                ))}
                {filteredCustomers.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-4 py-10 text-center text-slate-500">暂无符合条件的客户</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        <section className="bg-slate-900 border border-slate-800 rounded-xl p-4 space-y-3">
          <h3 className="text-sm font-black text-slate-100 flex items-center gap-2">
            <ClipboardList className="w-4 h-4 text-violet-300" />
            负责人汇总
          </h3>
          {summary.ownerSummary.map(item => (
            <div key={item.owner} className="bg-slate-950 border border-slate-800 rounded-lg p-3 text-xs">
              <div className="flex justify-between text-slate-100 font-black">
                <span>{item.owner}</span>
                <span>{item.customers} 客户</span>
              </div>
              <div className="grid grid-cols-3 gap-2 mt-2 text-[10px] text-slate-400">
                <span>跟进 {item.followUps}</span>
                <span>需求 {item.requirements}</span>
                <span>高意向 {item.highIntent}</span>
              </div>
            </div>
          ))}
        </section>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-5">
        <section className="bg-slate-900 border border-slate-800 rounded-xl p-4">
          <h3 className="text-sm font-black text-slate-100 flex items-center gap-2 mb-3">
            <CalendarClock className="w-4 h-4 text-cyan-300" />
            最近跟进
          </h3>
          <div className="space-y-2">
            {recentFollowUps.map(item => (
              <div key={item.id} className="bg-slate-950 border border-slate-800 rounded-lg p-3 text-xs">
                <div className="flex justify-between gap-3">
                  <span className="font-black text-slate-100">{item.customerName}</span>
                  <span className="text-slate-500">{item.followTime}</span>
                </div>
                <p className="text-slate-300 mt-2 leading-relaxed">{item.content}</p>
                <div className="text-[10px] text-slate-500 mt-2">{item.handler} / {item.contactMethod} / {item.result}</div>
              </div>
            ))}
            {recentFollowUps.length === 0 && <div className="text-xs text-slate-500 py-8 text-center">暂无跟进记录</div>}
          </div>
        </section>

        <section className="bg-slate-900 border border-slate-800 rounded-xl p-4">
          <h3 className="text-sm font-black text-slate-100 flex items-center gap-2 mb-3">
            <Target className="w-4 h-4 text-amber-300" />
            客户需求
          </h3>
          <div className="space-y-2">
            {activeRequirements.map(item => (
              <div key={item.id} className="bg-slate-950 border border-slate-800 rounded-lg p-3 text-xs">
                <div className="flex justify-between gap-3">
                  <span className="font-black text-slate-100">{item.customerName}</span>
                  <span className="text-amber-300">{item.budget}元</span>
                </div>
                <p className="text-slate-300 mt-2">{item.productDemand}</p>
                <div className="text-[10px] text-slate-500 mt-2">{item.handler} / {item.intent}意向 / {item.stage}</div>
              </div>
            ))}
            {activeRequirements.length === 0 && <div className="text-xs text-slate-500 py-8 text-center">暂无需求记录</div>}
          </div>
        </section>
      </div>
    </div>
  );
}
