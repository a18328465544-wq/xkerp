/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Briefcase,
  Filter,
  Plus,
  Search,
  UserCheck,
  Users,
  X
} from "lucide-react";
import { useStoreStateReturn } from "../utils/state";
import { CustomerCard as Customer, Vendor } from "../types";

interface PartnerManagerProps {
  storeState: useStoreStateReturn;
  initialTab?: "customers" | "vendors";
}

type CustomerType = "个人买家客户" | "个人卖家客户";
type PeerType = "收货同行" | "卖货同行";

interface PartnerTableRow {
  id: string;
  name: string;
  contact: string;
  type: CustomerType | PeerType;
  channel: string;
  tradeCount: number;
  tradeAmount: number;
  frequentModels: string;
  balance: number;
  lastDealTime: string;
  remarks: string;
  risk?: boolean;
}

const customerTypeOptions: CustomerType[] = ["个人买家客户", "个人卖家客户"];
const peerTypeOptions: PeerType[] = ["收货同行", "卖货同行"];

const formatCurrency = (value: number) => `${Math.round(value || 0).toLocaleString()}元`;

const getContact = (item: { contact?: string; phone?: string; wechat?: string; contactPerson?: string }) =>
  item.contact || item.phone || item.wechat || item.contactPerson || "";

const normalizeCustomerType = (type?: Customer["type"]): CustomerType => {
  if (type === "个人卖家客户" || type === "回收客户") return "个人卖家客户";
  return "个人买家客户";
};

const normalizePeerType = (type?: Vendor["type"]): PeerType => {
  if (type === "卖货同行" || type === "大黄牛" || type === "数码渠道大厂" || type === "批发客户") {
    return "卖货同行";
  }
  return "收货同行";
};

const matchesPerson = (name: string, contact: string, targetName?: string, targetContact?: string) => {
  const cleanName = name.trim();
  const cleanTargetName = (targetName || "").trim();
  const cleanContact = contact.trim();
  const cleanTargetContact = (targetContact || "").trim();

  return (
    (!!cleanName && !!cleanTargetName && cleanName === cleanTargetName) ||
    (!!cleanContact && !!cleanTargetContact && cleanContact === cleanTargetContact)
  );
};

const topModels = (items: Array<{ model?: string; productName?: string }>, fallback = "暂无交易记录") => {
  const counts = new Map<string, number>();
  items.forEach(item => {
    const label = (item.model || item.productName || "").trim();
    if (!label) return;
    counts.set(label, (counts.get(label) || 0) + 1);
  });

  const ranked = Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([name, count]) => `${name}×${count}`);

  return ranked.length ? ranked.join("、") : fallback;
};

export default function PartnerManager({ storeState, initialTab = "customers" }: PartnerManagerProps) {
  const {
    customers,
    vendors,
    purchaseInvoices,
    salesInvoices,
    createCustomer,
    createVendor
  } = storeState;

  const [partnerTab, setPartnerTab] = useState<"customers" | "vendors">(initialTab);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [channelFilter, setChannelFilter] = useState("all");

  const [isCustomerModalOpen, setIsCustomerModalOpen] = useState(false);
  const [isVendorModalOpen, setIsVendorModalOpen] = useState(false);

  const [cName, setCName] = useState("");
  const [cContact, setCContact] = useState("");
  const [cType, setCType] = useState<CustomerType>("个人买家客户");
  const [cChannel, setCChannel] = useState<Customer["firstChannel"]>("闲鱼");
  const [cNotes, setCNotes] = useState("");

  const [vName, setVName] = useState("");
  const [vContact, setVContact] = useState("");
  const [vType, setVType] = useState<PeerType>("收货同行");
  const [vIsRisk, setVIsRisk] = useState(false);
  const [vNotes, setVNotes] = useState("");

  useEffect(() => {
    setPartnerTab(initialTab);
  }, [initialTab]);

  const resetFilters = (tab: "customers" | "vendors") => {
    setPartnerTab(tab);
    setSearch("");
    setTypeFilter("all");
    setChannelFilter("all");
  };

  const customerRows = useMemo<PartnerTableRow[]>(() => {
    return customers.map(customer => {
      const contact = getContact(customer);
      const sales = salesInvoices.filter(invoice =>
        matchesPerson(customer.name, contact, invoice.customerName, invoice.contact)
      );
      const purchases = purchaseInvoices.filter(invoice =>
        ["个人回收", "客户置换"].includes(invoice.sourceType) &&
        matchesPerson(customer.name, contact, invoice.supplierName, invoice.contact)
      );
      const invoiceItems = [
        ...sales.flatMap(invoice => invoice.items),
        ...purchases.flatMap(invoice => invoice.items)
      ];
      const tradeCount = sales.reduce((sum, invoice) => sum + invoice.totalCount, 0) +
        purchases.reduce((sum, invoice) => sum + invoice.totalCount, 0);
      const tradeAmount = sales.reduce((sum, invoice) => sum + invoice.totalAmount, 0) +
        purchases.reduce((sum, invoice) => sum + invoice.totalCost, 0);

      return {
        id: customer.id,
        name: customer.name,
        contact,
        type: normalizeCustomerType(customer.type),
        channel: customer.firstChannel || customer.source || "未记录",
        tradeCount: tradeCount || customer.buyCount + customer.recycleCount || customer.totalPurchases || 0,
        tradeAmount: tradeAmount || customer.totalAmount || 0,
        frequentModels: topModels(invoiceItems, customer.tags?.slice(0, 2).join("、") || "暂无交易记录"),
        balance: customer.debtBalance || 0,
        lastDealTime: customer.lastDealTime || "-",
        remarks: customer.remarks || ""
      };
    });
  }, [customers, purchaseInvoices, salesInvoices]);

  const peerRows = useMemo<PartnerTableRow[]>(() => {
    return vendors
      .filter(vendor => (vendor.partnerCategory || "同行") === "同行")
      .map(vendor => {
        const contact = getContact(vendor);
        const purchases = purchaseInvoices.filter(invoice =>
          !["个人回收", "客户置换"].includes(invoice.sourceType) &&
          matchesPerson(vendor.name, contact, invoice.supplierName, invoice.contact)
        );
        const peerSales = salesInvoices.filter(invoice =>
          invoice.channel === "同行网店" &&
          matchesPerson(vendor.name, contact, invoice.customerName, invoice.contact)
        );
        const invoiceItems = [
          ...purchases.flatMap(invoice => invoice.items),
          ...peerSales.flatMap(invoice => invoice.items)
        ];
        const tradeCount = purchases.reduce((sum, invoice) => sum + invoice.totalCount, 0) +
          peerSales.reduce((sum, invoice) => sum + invoice.totalCount, 0);
        const tradeAmount = purchases.reduce((sum, invoice) => sum + invoice.totalCost, 0) +
          peerSales.reduce((sum, invoice) => sum + invoice.totalAmount, 0);

        return {
          id: vendor.id,
          name: vendor.name,
          contact,
          type: normalizePeerType(vendor.type),
          channel: "同行",
          tradeCount: tradeCount || vendor.totalCount || 0,
          tradeAmount: tradeAmount || vendor.totalBuyAmount || 0,
          frequentModels: topModels(invoiceItems, vendor.remarks || "暂无交易记录"),
          balance: vendor.debtBalance || vendor.accountPayable || 0,
          lastDealTime: vendor.lastDealTime || "-",
          remarks: vendor.remarks || "",
          risk: vendor.isHighRisk || vendor.aftersalesRate >= 20
        };
      });
  }, [purchaseInvoices, salesInvoices, vendors]);

  const activeRows = partnerTab === "customers" ? customerRows : peerRows;
  const typeOptions = partnerTab === "customers" ? customerTypeOptions : peerTypeOptions;
  const channelOptions = useMemo(() => {
    const channels = activeRows.map(row => row.channel).filter(Boolean);
    return Array.from(new Set(channels));
  }, [activeRows]);

  const filteredRows = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    return activeRows.filter(row => {
      const matchesKeyword = !keyword ||
        row.name.toLowerCase().includes(keyword) ||
        row.contact.toLowerCase().includes(keyword) ||
        row.frequentModels.toLowerCase().includes(keyword) ||
        row.remarks.toLowerCase().includes(keyword);
      const matchesType = typeFilter === "all" || row.type === typeFilter;
      const matchesChannel = channelFilter === "all" || row.channel === channelFilter;
      return matchesKeyword && matchesType && matchesChannel;
    });
  }, [activeRows, channelFilter, search, typeFilter]);

  const totals = useMemo(() => ({
    count: filteredRows.length,
    tradeCount: filteredRows.reduce((sum, row) => sum + row.tradeCount, 0),
    tradeAmount: filteredRows.reduce((sum, row) => sum + row.tradeAmount, 0)
  }), [filteredRows]);

  const handleAddCustomer = (event: React.FormEvent) => {
    event.preventDefault();
    if (!cName.trim()) return;

    createCustomer({
      name: cName.trim(),
      contact: cContact.trim(),
      type: cType,
      firstChannel: cChannel,
      totalPurchases: 0,
      debtBalance: 0,
      remarks: cNotes.trim(),
      tags: [cType]
    });

    setCName("");
    setCContact("");
    setCType("个人买家客户");
    setCNotes("");
    setIsCustomerModalOpen(false);
    alert(`个人客户【${cName}】已建档。`);
  };

  const handleAddVendor = (event: React.FormEvent) => {
    event.preventDefault();
    if (!vName.trim()) return;

    createVendor({
      name: vName.trim(),
      contact: vContact.trim(),
      partnerCategory: "同行",
      type: vType,
      isHighRisk: vIsRisk,
      debtBalance: 0,
      remarks: vNotes.trim()
    });

    setVName("");
    setVContact("");
    setVType("收货同行");
    setVIsRisk(false);
    setVNotes("");
    setIsVendorModalOpen(false);
    alert(`同行【${vName}】已建档。`);
  };

  const renderTypeBadge = (type: PartnerTableRow["type"], risk?: boolean) => {
    const base = type.includes("卖") ? "bg-sky-50 text-sky-700 border-sky-200" : "bg-blue-50 text-blue-700 border-blue-200";
    return (
      <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-1 text-[11px] font-semibold ${risk ? "bg-rose-50 text-rose-700 border-rose-200" : base}`}>
        {risk && <AlertTriangle className="h-3 w-3" />}
        {type}
      </span>
    );
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-semibold text-slate-950">
            <Users className="h-5 w-5 text-blue-600" />
            <span>往来档案</span>
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            同行列表只放收货同行和卖货同行，个人客户只放个人买家和个人卖家，方便后续做分级和对账。
          </p>
        </div>

        <div className="flex h-11 rounded-xl border border-slate-200 bg-slate-50 p-1">
          <button
            onClick={() => resetFilters("customers")}
            className={`rounded-lg px-4 text-sm font-semibold transition ${
              partnerTab === "customers" ? "bg-blue-600 text-white shadow-sm" : "text-slate-600 hover:text-slate-950"
            }`}
          >
            个人客户 ({customerRows.length})
          </button>
          <button
            onClick={() => resetFilters("vendors")}
            className={`rounded-lg px-4 text-sm font-semibold transition ${
              partnerTab === "vendors" ? "bg-blue-600 text-white shadow-sm" : "text-slate-600 hover:text-slate-950"
            }`}
          >
            同行列表 ({peerRows.length})
          </button>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div className="grid w-full grid-cols-1 gap-3 md:grid-cols-3">
            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-500">关键词</label>
              <div className="relative">
                <Search className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
                <input
                  value={search}
                  onChange={event => setSearch(event.target.value)}
                  placeholder={partnerTab === "customers" ? "搜索姓名、电话、常交易型号" : "搜索同行、联系人、常交易型号"}
                  className="h-11 w-full rounded-xl border border-slate-200 bg-white pl-9 pr-3 text-sm text-slate-950 outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
                />
              </div>
            </div>

            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-500">档案类型</label>
              <select
                value={typeFilter}
                onChange={event => setTypeFilter(event.target.value)}
                className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-950 outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
              >
                <option value="all">全部类型</option>
                {typeOptions.map(type => <option key={type} value={type}>{type}</option>)}
              </select>
            </div>

            <div>
              <label className="mb-1 block text-xs font-semibold text-slate-500">来源 / 分组</label>
              <select
                value={channelFilter}
                onChange={event => setChannelFilter(event.target.value)}
                className="h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-slate-950 outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
              >
                <option value="all">全部来源</option>
                {channelOptions.map(channel => <option key={channel} value={channel}>{channel}</option>)}
              </select>
            </div>
          </div>

          <button
            onClick={() => partnerTab === "customers" ? setIsCustomerModalOpen(true) : setIsVendorModalOpen(true)}
            className="h-11 shrink-0 rounded-xl bg-blue-600 px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-500"
          >
            <span className="inline-flex items-center gap-2">
              <Plus className="h-4 w-4" />
              {partnerTab === "customers" ? "新增个人客户" : "新增同行"}
            </span>
          </button>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-3">
          <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
            <div className="text-xs font-semibold text-slate-500">当前档案数</div>
            <div className="mt-1 font-mono text-xl font-semibold text-slate-950">{totals.count}</div>
          </div>
          <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
            <div className="text-xs font-semibold text-slate-500">累计交易数量</div>
            <div className="mt-1 font-mono text-xl font-semibold text-slate-950">{totals.tradeCount}</div>
          </div>
          <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
            <div className="text-xs font-semibold text-slate-500">累计交易金额</div>
            <div className="mt-1 font-mono text-xl font-semibold text-slate-950">{formatCurrency(totals.tradeAmount)}</div>
          </div>
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
          <div className="flex items-center gap-2 text-sm font-semibold text-slate-950">
            <Filter className="h-4 w-4 text-blue-600" />
            {partnerTab === "customers" ? "个人客户明细" : "同行明细"}
          </div>
          <div className="text-xs text-slate-500">支持按类型、来源和型号筛选</div>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-[1080px] w-full border-collapse text-left text-sm">
            <thead className="bg-slate-50 text-xs font-semibold text-slate-500">
              <tr>
                <th className="border-b border-slate-200 px-4 py-3">档案编号</th>
                <th className="border-b border-slate-200 px-4 py-3">名称</th>
                <th className="border-b border-slate-200 px-4 py-3">类型</th>
                <th className="border-b border-slate-200 px-4 py-3">联系电话 / 微信</th>
                <th className="border-b border-slate-200 px-4 py-3">交易数量</th>
                <th className="border-b border-slate-200 px-4 py-3">交易金额</th>
                <th className="border-b border-slate-200 px-4 py-3">经常交易型号</th>
                <th className="border-b border-slate-200 px-4 py-3">{partnerTab === "customers" ? "客户欠款" : "未结账款"}</th>
                <th className="border-b border-slate-200 px-4 py-3">最近交易</th>
                <th className="border-b border-slate-200 px-4 py-3">备注</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredRows.map(row => (
                <tr key={row.id} className="hover:bg-blue-50/40">
                  <td className="px-4 py-3 font-mono text-xs font-semibold text-slate-500">{row.id}</td>
                  <td className="px-4 py-3 font-semibold text-slate-950">{row.name}</td>
                  <td className="px-4 py-3">{renderTypeBadge(row.type, row.risk)}</td>
                  <td className="px-4 py-3 font-mono text-xs text-slate-600">{row.contact || "未记录"}</td>
                  <td className="px-4 py-3 font-mono font-semibold text-slate-950">{row.tradeCount}</td>
                  <td className="px-4 py-3 font-mono font-semibold text-slate-950">{formatCurrency(row.tradeAmount)}</td>
                  <td className="max-w-[260px] truncate px-4 py-3 text-slate-600" title={row.frequentModels}>{row.frequentModels}</td>
                  <td className={`px-4 py-3 font-mono font-semibold ${row.balance > 0 ? "text-amber-600" : "text-slate-500"}`}>
                    {formatCurrency(row.balance)}
                  </td>
                  <td className="px-4 py-3 font-mono text-xs text-slate-500">{row.lastDealTime}</td>
                  <td className="max-w-[260px] truncate px-4 py-3 text-slate-500" title={row.remarks}>{row.remarks || "无"}</td>
                </tr>
              ))}
              {filteredRows.length === 0 && (
                <tr>
                  <td colSpan={10} className="px-4 py-10 text-center text-sm text-slate-500">
                    没有符合筛选条件的档案。
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {isCustomerModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4 backdrop-blur-sm">
          <form
            onSubmit={handleAddCustomer}
            className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-5 text-slate-950 shadow-2xl"
          >
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <h3 className="flex items-center gap-2 text-base font-semibold">
                <UserCheck className="h-5 w-5 text-blue-600" />
                新增个人客户
              </h3>
              <button type="button" onClick={() => setIsCustomerModalOpen(false)} className="text-slate-400 hover:text-slate-950">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="mt-4 space-y-3 text-sm">
              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-500">客户类型</label>
                <select value={cType} onChange={event => setCType(event.target.value as CustomerType)} className="h-11 w-full rounded-xl border border-slate-200 px-3 outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100">
                  {customerTypeOptions.map(type => <option key={type} value={type}>{type}</option>)}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-500">客户姓名</label>
                <input required value={cName} onChange={event => setCName(event.target.value)} placeholder="如：李先生" className="h-11 w-full rounded-xl border border-slate-200 px-3 outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100" />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-500">手机号码 / 微信</label>
                <input required value={cContact} onChange={event => setCContact(event.target.value)} placeholder="如：13800138000" className="h-11 w-full rounded-xl border border-slate-200 px-3 font-mono outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100" />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-500">来源平台</label>
                <select value={cChannel} onChange={event => setCChannel(event.target.value)} className="h-11 w-full rounded-xl border border-slate-200 px-3 outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100">
                  <option value="到店">到店</option>
                  <option value="闲鱼">闲鱼</option>
                  <option value="微信私域">微信私域</option>
                  <option value="小红书">小红书</option>
                  <option value="抖音">抖音</option>
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-500">备注</label>
                <input value={cNotes} onChange={event => setCNotes(event.target.value)} placeholder="可记录偏好、信用、交易习惯" className="h-11 w-full rounded-xl border border-slate-200 px-3 outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100" />
              </div>
            </div>

            <div className="mt-5 flex justify-end gap-2 border-t border-slate-200 pt-4">
              <button type="button" onClick={() => setIsCustomerModalOpen(false)} className="h-10 rounded-xl border border-slate-200 px-4 text-sm font-semibold text-slate-600 hover:bg-slate-50">取消</button>
              <button type="submit" className="h-10 rounded-xl bg-blue-600 px-4 text-sm font-semibold text-white hover:bg-blue-500">保存客户</button>
            </div>
          </form>
        </div>
      )}

      {isVendorModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4 backdrop-blur-sm">
          <form
            onSubmit={handleAddVendor}
            className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-5 text-slate-950 shadow-2xl"
          >
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <h3 className="flex items-center gap-2 text-base font-semibold">
                <Briefcase className="h-5 w-5 text-blue-600" />
                新增同行
              </h3>
              <button type="button" onClick={() => setIsVendorModalOpen(false)} className="text-slate-400 hover:text-slate-950">
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="mt-4 space-y-3 text-sm">
              <div className="rounded-xl border border-blue-100 bg-blue-50 px-3 py-2 text-xs font-semibold text-blue-700">
                该档案固定归类为同行，不再登记个人客户。
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-500">同行类型</label>
                <select value={vType} onChange={event => setVType(event.target.value as PeerType)} className="h-11 w-full rounded-xl border border-slate-200 px-3 outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100">
                  {peerTypeOptions.map(type => <option key={type} value={type}>{type}</option>)}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-500">同行名称</label>
                <input required value={vName} onChange={event => setVName(event.target.value)} placeholder="如：宏达数码批发" className="h-11 w-full rounded-xl border border-slate-200 px-3 outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100" />
              </div>
              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-500">手机号码 / 联系方式</label>
                <input required value={vContact} onChange={event => setVContact(event.target.value)} placeholder="如：13911002233" className="h-11 w-full rounded-xl border border-slate-200 px-3 font-mono outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100" />
              </div>
              <label className="flex items-center gap-2 rounded-xl border border-slate-200 px-3 py-3 text-sm font-semibold text-slate-600">
                <input type="checkbox" checked={vIsRisk} onChange={event => setVIsRisk(event.target.checked)} className="h-4 w-4 rounded border-slate-300 text-blue-600" />
                标记为高风险同行
              </label>
              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-500">备注</label>
                <input value={vNotes} onChange={event => setVNotes(event.target.value)} placeholder="可记录账期、常出型号、售后风险" className="h-11 w-full rounded-xl border border-slate-200 px-3 outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100" />
              </div>
            </div>

            <div className="mt-5 flex justify-end gap-2 border-t border-slate-200 pt-4">
              <button type="button" onClick={() => setIsVendorModalOpen(false)} className="h-10 rounded-xl border border-slate-200 px-4 text-sm font-semibold text-slate-600 hover:bg-slate-50">取消</button>
              <button type="submit" className="h-10 rounded-xl bg-blue-600 px-4 text-sm font-semibold text-white hover:bg-blue-500">保存同行</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
