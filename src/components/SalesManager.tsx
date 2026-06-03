/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo, useRef, useEffect } from "react";
import {
  BadgeDollarSign,
  Search,
  Plus,
  Trash2,
  CheckCircle,
  HelpCircle,
  TrendingUp,
  X,
  Layers,
  Store,
  Truck,
  FileSpreadsheet
} from "lucide-react";
import { useStoreStateReturn } from "../utils/state";
import { CardInventory, CustomerCard, SalesItem } from "../types";

interface SalesManagerProps {
  storeState: useStoreStateReturn;
  setTab: (tab: string) => void;
}

export default function SalesManager({ storeState, setTab }: SalesManagerProps) {
  const {
    inventory,
    customers,
    createSalesInvoice,
    permissions,
    settlementAccounts
  } = storeState;

  // General billing sheets state
  const [customerName, setCustomerName] = useState("徐小龙（极客发烧友）");
  const [contact, setContact] = useState("13522198842");
  const [selectedCustomerId, setSelectedCustomerId] = useState(customers[0]?.id || "");
  const [channel, setChannel] = useState<"到店" | "闲鱼" | "抖音" | "小红书" | "B站" | "微信私域" | "同行网店">("到店");
  const [paymentMethod, setPaymentMethod] = useState<"微信" | "支付宝" | "现金" | "银行卡" | "账期欠款">("微信");
  
  const [isPaid, setIsPaid] = useState(true);
  const [paidAmount, setPaidAmount] = useState<number>(19500);
  const [unpaidAmount, setUnpaidAmount] = useState<number>(0);
  
  const [needInvoice, setNeedInvoice] = useState(false);
  const [freeShipping, setFreeShipping] = useState(true);
  const [expressCompany, setExpressCompany] = useState("顺丰速运");
  const [expressNo, setExpressNo] = useState("");
  const [aftersalesTerms, setAftersalesTerms] = useState("店保三个月（非采矿导致坏点）");
  const [employee, setEmployee] = useState("王小明 (店员)");
  const [settlementAccountId, setSettlementAccountId] = useState(settlementAccounts[0]?.id || "");
  const [paymentHandler, setPaymentHandler] = useState("王小明 (店员)");
  const [remarks, setRemarks] = useState("");

  // Items to sell array
  const [salesItems, setSalesItems] = useState([
    {
      inventoryId: "KC-20260501-001",
      productName: "RTX 4090 华硕 ROG 猛禽 24G",
      productId: "SP-001",
      sn: "SN4090STRX8829A",
      condition: "充新99新",
      costPrice: 18100,
      sellPrice: 19500,
      aftersalesTerms: "店保三个月（非采矿导致坏点）"
    }
  ]);

  // Autocomplete targeting available stocks
  const [activeRowId, setActiveRowId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const lookupDropdownRef = useRef<HTMLDivElement>(null);

  // Available stocks are cards not sold and in a sellable state: "已入库" / "已上架" / "待检测" (just warning)
  const availableGpus = useMemo(() => {
    return inventory.filter(c => ["已入库", "已上架"].includes(c.status));
  }, [inventory]);

  const selectedCustomer = useMemo(() => {
    return customers.find(customer => customer.id === selectedCustomerId) || null;
  }, [customers, selectedCustomerId]);

  const normalizeSalesChannel = (customer: CustomerCard) => {
    const channelValue = customer.firstChannel || customer.source;
    const allowed = ["到店", "闲鱼", "抖音", "小红书", "B站", "微信私域", "同行网店"];
    return allowed.includes(channelValue) ? channelValue as typeof channel : channel;
  };

  const filteredAvailableGpus = useMemo(() => {
    if (!searchQuery) return availableGpus;
    return availableGpus.filter(c =>
      c.productName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.sn.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.id.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [availableGpus, searchQuery]);

  // Calculations
  const calculatedStats = useMemo(() => {
    let totalCost = 0;
    let totalAmount = 0;
    salesItems.forEach(it => {
      totalCost += it.costPrice;
      totalAmount += it.sellPrice;
    });
    const totalProfit = totalAmount - totalCost;
    return { totalCost, totalAmount, totalProfit };
  }, [salesItems]);

  // Auto tie cash flow
  useEffect(() => {
    if (isPaid) {
      setPaidAmount(calculatedStats.totalAmount);
      setUnpaidAmount(0);
    } else {
      setPaidAmount(Math.round(calculatedStats.totalAmount * 0.5));
      setUnpaidAmount(calculatedStats.totalAmount - Math.round(calculatedStats.totalAmount * 0.5));
    }
  }, [isPaid, calculatedStats.totalAmount]);

  useEffect(() => {
    if (!selectedCustomerId && customers[0]) {
      setSelectedCustomerId(customers[0].id);
    }
  }, [customers, selectedCustomerId]);

  useEffect(() => {
    if (!selectedCustomer) return;
    setCustomerName(selectedCustomer.name);
    setContact(selectedCustomer.contact || selectedCustomer.phone || selectedCustomer.wechat || "");
    setChannel(normalizeSalesChannel(selectedCustomer));
  }, [selectedCustomer]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (lookupDropdownRef.current && !lookupDropdownRef.current.contains(event.target as Node)) {
        setActiveRowId(null);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const addCheckoutRow = () => {
    const nextCheckoutId = `co-${Date.now()}`;
    const defaultAvailableCard = availableGpus[0];
    
    if (defaultAvailableCard) {
      setSalesItems(prev => [
        ...prev,
        {
          inventoryId: defaultAvailableCard.id,
          productName: defaultAvailableCard.productName,
          productId: defaultAvailableCard.productId,
          sn: defaultAvailableCard.sn,
          condition: defaultAvailableCard.condition,
          costPrice: defaultAvailableCard.costPrice,
          sellPrice: defaultAvailableCard.estSellPrice,
          aftersalesTerms: aftersalesTerms
        }
      ]);
    } else {
      alert("⚠️ 目前没有更多[已质检并具备上架资格]的库存显卡！\n请先从回收模块新增进货或者进入检测任务池通过质检报告。");
    }
  };

  const removeCheckoutRow = (idx: number) => {
    if (salesItems.length <= 1) {
      alert("销售单必须指定至少 1 张显卡作为发货商品。");
      return;
    }
    setSalesItems(prev => prev.filter((_, i) => i !== idx));
  };

  const updateItemForm = (idx: number, key: string, val: any) => {
    setSalesItems(prev => {
      return prev.map((item, i) => {
        if (i === idx) {
          return {
            ...item,
            [key]: val
          };
        }
        return item;
      });
    });
  };

  const selectCardForCheckout = (rowIdx: number, card: CardInventory) => {
    // Check if card already selected in other index
    const isAlreadyChosen = salesItems.some((it, i) => i !== rowIdx && it.inventoryId === card.id);
    if (isAlreadyChosen) {
      alert(`⚠️ 显卡 SN: ${card.sn} (库存号: ${card.id}) 早已被当前销售单其他明细锁定！二手显卡一卡一档，无法单次重复出售同一份物理板。`);
      return;
    }

    updateItemForm(rowIdx, "inventoryId", card.id);
    updateItemForm(rowIdx, "productName", card.productName);
    updateItemForm(rowIdx, "productId", card.productId);
    updateItemForm(rowIdx, "sn", card.sn);
    updateItemForm(rowIdx, "condition", card.condition);
    updateItemForm(rowIdx, "costPrice", card.costPrice);
    updateItemForm(rowIdx, "sellPrice", card.estSellPrice);
    setActiveRowId(null);
  };

  const handlePostSales = () => {
    if (!selectedCustomer) {
      alert("请先在【客户关系档案】里新增客户，再回到销售单选择客户开单。");
      setTab("customers");
      return;
    }

    // Double check empty fields
    for (let i = 0; i < salesItems.length; i++) {
      const item = salesItems[i];
      if (!item.inventoryId) {
        alert("销售明细中有显卡尚未绑定具体的物理库存档案卡。请点击绑定！");
        return;
      }
      if (item.sellPrice <= 0) {
        alert("售价配置不正确。请输入合理的金额进行结算。");
        return;
      }
    }

    createSalesInvoice({
      date: new Date().toISOString().split("T")[0],
      customerName,
      contact,
      channel,
      paymentMethod,
      isPaid,
      paidAmount,
      unpaidAmount,
      settlementAccountId: paidAmount > 0 ? settlementAccountId : undefined,
      settlementAccountName: settlementAccounts.find(account => account.id === settlementAccountId)?.name,
      paymentHandler,
      paymentStatus: unpaidAmount <= 0 ? "已收款" : paidAmount > 0 ? "部分收款" : "未收款",
      needInvoice,
      freeShipping,
      expressCompany,
      expressNo: expressNo || "无需物流(自提)",
      aftersalesTerms,
      handleBy: employee,
      remarks,
      items: salesItems.map(it => ({
        inventoryId: it.inventoryId,
        productId: it.productId,
        productName: it.productName,
        sn: it.sn,
        condition: it.condition,
        costPrice: it.costPrice,
        sellPrice: it.sellPrice,
        profit: it.sellPrice - it.costPrice,
        aftersalesTerms: it.aftersalesTerms
      }))
    });

    alert("销售单已提交并完成出库。\n对应库存状态已更新为 [已售出]，财务流水和客户统计已同步更新。");
    setTab("sales_list");
  };

  return (
    <div className="space-y-4">
      {/* Visual top */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-slate-900 p-5 rounded-2xl border border-slate-800">
        <div>
          <h2 className="text-base font-bold text-slate-100 flex items-center gap-2">
            <BadgeDollarSign className="w-5 h-5 text-emerald-400" />
            <span>新增标准销售单 (绑定 SN / 一卡一档锁定)</span>
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            录入销售单时必须明确关联到库内实机物理卡的 SN 编号。销售出库后，绑定的库存卡会自动变更为“已售出”并进入质保追踪。
          </p>
        </div>
        <div className="bg-slate-950 p-2 border border-slate-850 text-[11px] text-slate-400 rounded-lg">
          在架可售卡池: <span className="text-emerald-400 font-bold font-mono">{availableGpus.length} 张候售</span>
        </div>
      </div>

      {/* BILLING CLIENT HEADERS */}
      <div className="bg-slate-900 p-5 rounded-xl border border-slate-850 space-y-4 shadow-sm relative">
        <div className="absolute top-0 right-0 w-16 h-16 bg-emerald-500/[0.01] rounded-full blur-xl"></div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {/* Customer */}
          <div>
            <label className="text-[10px] text-slate-400 font-bold block mb-1">买方客户档案</label>
            <select
              required
              value={selectedCustomerId}
              onChange={e => setSelectedCustomerId(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 text-xs text-slate-200 p-2.5 rounded focus:outline-none focus:border-cyan-500 font-bold"
            >
              {customers.length === 0 && <option value="">请先新增客户档案</option>}
              {customers.map(customer => (
                <option key={customer.id} value={customer.id}>
                  {customer.name} / {customer.phone || customer.wechat || customer.source}
                </option>
              ))}
            </select>
          </div>

          {/* Contact */}
          <div>
            <label className="text-[10px] text-slate-400 font-bold block mb-1">买方联系电话 / 微信</label>
            <input
              type="text"
              required
              value={contact}
              readOnly
              className="w-full bg-slate-950 border border-slate-800 text-xs text-slate-400 p-2.5 rounded focus:outline-none"
            />
          </div>

          {/* Platform channels */}
          <div>
            <label className="text-[10px] text-slate-400 font-bold block mb-1">销售渠道来源平台</label>
            <select
              value={channel}
              onChange={e => setChannel(e.target.value as any)}
              className="w-full bg-slate-950 border border-slate-800 text-xs text-slate-200 p-2.5 rounded focus:outline-none font-semibold"
            >
              <option value="到店">到店现购 (同城客)</option>
              <option value="闲鱼">闲鱼买手 (二手大盘)</option>
              <option value="微信私域">微信私域 (朋友圈直款)</option>
              <option value="同行网店">同行调货 (拼客铺)</option>
              <option value="小红书">小红书推广 (个人升级)</option>
              <option value="抖音">抖音电竞门店 (粉丝拿货)</option>
            </select>
          </div>

          <div className="flex items-end">
            <button
              type="button"
              onClick={() => setTab("customers")}
              className="w-full bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 text-xs font-black p-2.5 rounded"
            >
              去客户档案新增
            </button>
          </div>

          {/* Settle method */}
          <div>
            <label className="text-[10px] text-slate-400 font-bold block mb-1">收款方式</label>
            <select
              value={paymentMethod}
              onChange={e => setPaymentMethod(e.target.value as any)}
              className="w-full bg-slate-950 border border-slate-800 text-xs text-slate-200 p-2.5 rounded focus:outline-none"
            >
              <option value="微信">微信支付 (秒过款)</option>
              <option value="支付宝">支付宝打款</option>
              <option value="银行卡">对公账网银</option>
              <option value="现金">门市现金</option>
              <option value="账期欠款">账期欠款 (同行月结)</option>
            </select>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 border-t border-slate-800/80 pt-3">
          <div>
            <label className="text-[10px] text-slate-400 font-bold block mb-1">收款账户</label>
            <select
              value={settlementAccountId}
              onChange={e => setSettlementAccountId(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 text-xs text-slate-200 p-2.5 rounded focus:outline-none"
            >
              {settlementAccounts.map(account => (
                <option key={account.id} value={account.id}>{account.name} / ¥{account.balance}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-[10px] text-slate-400 font-bold block mb-1">收款人 / 经办人</label>
            <input
              value={paymentHandler}
              onChange={e => setPaymentHandler(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 text-xs text-slate-200 p-2.5 rounded focus:outline-none"
            />
          </div>

          {/* Settle status toggle */}
          <div>
            <label className="text-[10px] text-slate-400 font-bold block mb-1">已收讫货款</label>
            <div className="flex bg-slate-950 p-1 rounded border border-slate-800 gap-1 h-[37px]">
              <button
                type="button"
                onClick={() => setIsPaid(true)}
                className={`flex-1 text-[11px] font-bold rounded ${
                  isPaid ? "bg-emerald-500 text-slate-950" : "text-slate-400 hover:text-slate-205"
                }`}
              >
                已全额结清
              </button>
              <button
                type="button"
                onClick={() => setIsPaid(false)}
                className={`flex-1 text-[11px] font-bold rounded ${
                  !isPaid ? "bg-amber-500 text-slate-950" : "text-slate-400 hover:text-slate-205"
                }`}
              >
                部分收款/挂账
              </button>
            </div>
          </div>

          {/* Debt balances */}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-[10px] text-slate-500 font-bold block mb-1">已收款(¥)</label>
              <input
                type="number"
                disabled={isPaid}
                value={paidAmount}
                onChange={e => {
                  const val = Number(e.target.value);
                  setPaidAmount(val);
                  setUnpaidAmount(Math.max(0, calculatedStats.totalAmount - val));
                }}
                className="w-full bg-slate-950 border border-slate-850 p-2.5 text-xs text-emerald-400 font-mono font-bold rounded disabled:text-slate-500"
              />
            </div>
            <div>
              <label className="text-[10px] text-slate-500 font-bold block mb-1">未收款(欠款)</label>
              <div className="w-full bg-slate-950 border border-slate-855 p-2.5 text-xs font-mono font-bold text-amber-500 rounded">
                ¥{unpaidAmount}
              </div>
            </div>
          </div>

          {/* Invoices requirements and logistics */}
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="flex items-center gap-1.5 cursor-pointer text-[10px] text-slate-400 font-bold uppercase block mb-1">
                <input
                  type="checkbox"
                  checked={needInvoice}
                  onChange={e => setNeedInvoice(e.target.checked)}
                  className="rounded text-emerald-500 bg-slate-950 border-slate-800"
                />
                <span>需要发票（2% 税）</span>
              </label>
              <div className="w-full bg-slate-950 text-slate-400 border border-slate-850 p-2 rounded text-[10px] font-mono leading-none">
                {needInvoice ? "普通发票" : "收据/不开票"}
              </div>
            </div>

            <div>
              <label className="flex items-center gap-1.5 cursor-pointer text-[10px] text-slate-400 font-bold uppercase block mb-1">
                <input
                  type="checkbox"
                  checked={freeShipping}
                  onChange={e => setFreeShipping(e.target.checked)}
                  className="rounded text-emerald-500 bg-slate-950 border-slate-800"
                />
                <span>是否包邮包递</span>
              </label>
              <div className="w-full bg-slate-950 text-slate-100 border border-slate-855 p-2 rounded text-[11px] font-bold">
                {freeShipping ? "顺丰包邮" : "到付自理"}
              </div>
            </div>
          </div>

          {/* Express lines */}
          <div>
            <label className="text-[10px] text-slate-400 font-bold block mb-1">物流公司与快递单号</label>
            <div className="flex gap-1.5">
              <input
                type="text"
                placeholder="e.g. 快递单号 SF148..."
                value={expressNo}
                onChange={e => setExpressNo(e.target.value)}
                className="w-full bg-slate-950 border border-slate-800 text-xs text-slate-200 p-2.5 rounded font-mono"
              />
            </div>
          </div>
        </div>
      </div>

      {/* CORE CHECKOUT GRID SPREADSHEEET */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-x-auto shadow-md">
        <table className="w-full text-left border-collapse table-fixed min-w-[1000px]">
          <thead>
            <tr className="border-b border-slate-800 bg-slate-950 font-mono text-[11px] text-slate-400 font-bold uppercase">
              <th className="p-3 pl-4 w-[280px]">点击绑定物理库存卡 (搜SN/库存ID/名称)</th>
              <th className="p-3 w-[120px]">SN</th>
              <th className="p-3 w-[110px]">成色级别</th>
              <th className="p-3 text-right">入库成本价(参考)</th>
              <th className="p-3 text-right w-[110px]">实际销售成交价(¥)</th>
              <th className="p-3 text-right">差价净毛利润</th>
              <th className="p-3">售后质保承诺配置</th>
              <th className="p-3 pr-4 text-right w-[90px]">操作</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/80 text-xs">
            {salesItems.map((item, idx) => {
              const rowProfit = item.sellPrice - item.costPrice;

              return (
                <tr key={idx} className="hover:bg-slate-850/20 transition-colors">
                  {/* LOOKUP INPUT COLUMN */}
                  <td className="p-2 pl-4 relative">
                    <div className="relative">
                      <input
                        type="text"
                        value={activeRowId === `srow-${idx}` ? searchQuery : item.productName}
                        placeholder="输入关键字 / SN / 库存 ID 搜索可售库存..."
                        onClick={() => {
                          setActiveRowId(`srow-${idx}`);
                          setSearchQuery(item.productName);
                        }}
                        onChange={e => {
                          setSearchQuery(e.target.value);
                          setActiveRowId(`srow-${idx}`);
                        }}
                        className="w-full bg-slate-950 border border-slate-800 text-[11px] text-slate-200 px-2.5 py-2 rounded focus:outline-none focus:border-cyan-400 font-bold truncate pr-6"
                      />
                      <Search className="w-3.5 h-3.5 absolute right-2.5 top-2.5 text-slate-500 pointer-events-none" />
                    </div>

                    {/* Autocomplete cards */}
                    {activeRowId === `srow-${idx}` && (
                      <div
                        ref={lookupDropdownRef}
                        className="absolute left-4 right-4 top-11 bg-slate-950 border border-slate-800 shadow-2xl rounded-lg z-50 p-1.5 max-h-[190px] overflow-y-auto custom-scrollbar"
                      >
                        <div className="p-1 px-2 border-b border-slate-900 text-[10px] text-slate-500 font-mono tracking-wider mb-1">
                          系统仅显示当前可售（已入库、已上架）的单卡明细：
                        </div>
                        {filteredAvailableGpus.length === 0 ? (
                          <div className="p-3 text-slate-500 text-[11px] italic">找不到空闲销售显卡...</div>
                        ) : (
                          filteredAvailableGpus.map(c => (
                            <button
                              key={c.id}
                              type="button"
                              onClick={() => selectCardForCheckout(idx, c)}
                              className="w-full text-left p-2 hover:bg-slate-800 rounded flex items-center justify-between transition-colors text-[11px]"
                            >
                              <div className="truncate max-w-[210px]">
                                <span className="font-extrabold text-slate-100 block truncate">{c.productName}</span>
                                <span className="text-[9px] text-slate-500 font-mono block">
                                  ID: {c.id} | SN: {c.sn}
                                </span>
                              </div>
                              <div className="text-right whitespace-nowrap shrink-0">
                                <span className="text-emerald-400 font-bold block">售: ¥{c.estSellPrice}</span>
                                <span className="text-[8px] text-slate-655 font-mono block">成本: ¥{c.costPrice}</span>
                              </div>
                            </button>
                          ))
                        )}
                      </div>
                    )}
                  </td>

                  {/* Serial block info */}
                  <td className="p-2 font-mono text-[11px] text-slate-350">
                    <span className="font-bold underline text-cyan-400">{item.sn || "等待绑定"}</span>
                  </td>

                  {/* Condition grade */}
                  <td className="p-2">
                    <span className="font-semibold text-slate-300">{item.condition}</span>
                  </td>

                  {/* Reference Costs */}
                  <td className="p-2 text-right text-slate-400 font-mono">
                    {permissions.showCost ? (
                      <span>¥{item.costPrice}</span>
                    ) : (
                      <span className="text-[9px] italic text-slate-600">隐藏</span>
                    )}
                  </td>

                  {/* Real actual sales prices inputting */}
                  <td className="p-3">
                    <input
                      type="number"
                      required
                      value={item.sellPrice}
                      onChange={e => updateItemForm(idx, "sellPrice", Number(e.target.value))}
                      className="w-full text-right bg-slate-950 border border-slate-800 text-[11px] text-emerald-400 font-mono font-black p-1.5 rounded focus:outline-none focus:border-cyan-500"
                    />
                  </td>

                  {/* Actual margins profit */}
                  <td className="p-2 text-right font-mono font-extrabold">
                    {permissions.showProfit ? (
                      <span className={rowProfit >= 0 ? "text-emerald-400" : "text-rose-500"}>
                        ¥{rowProfit}
                      </span>
                    ) : (
                      <span className="text-slate-600 text-[10px]">保密</span>
                    )}
                  </td>

                  {/* Custom guaranty warranties terms */}
                  <td className="p-2">
                    <input
                      type="text"
                      value={item.aftersalesTerms}
                      onChange={e => updateItemForm(idx, "aftersalesTerms", e.target.value)}
                      className="w-full bg-slate-950 border border-slate-800 text-[11px] text-slate-300 p-1.5 rounded focus:outline-none"
                    />
                  </td>

                  {/* TRASH DISCARD CARD */}
                  <td className="p-2 text-right pr-4">
                    <button
                      type="button"
                      onClick={() => removeCheckoutRow(idx)}
                      className="p-1 px-2.5 border border-rose-950 text-rose-450 hover:bg-rose-500/10 rounded font-semibold duration-150 cursor-pointer"
                    >
                      移除
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* QUICK WORK TOOLBAR */}
      <div className="flex bg-slate-900 border border-slate-800 p-3 rounded-lg items-center justify-between">
        <button
          type="button"
          onClick={addCheckoutRow}
          className="p-2 px-5 bg-slate-850 hover:bg-slate-800 text-slate-100 rounded text-xs font-bold flex items-center gap-1 cursor-pointer"
        >
          <Plus className="w-4 h-4 text-emerald-400" />
          销售整包继续增加一行显卡
        </button>

        <span className="text-[10px] text-slate-500 font-mono font-semibold">
          销售绑定后，出库商品数量、利润大盘和个人账户业绩将直接与库存SN卡扣挂钩。
        </span>
      </div>

      {/* FINAL FINANCIAL CHECKS SUMMARY */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 bg-slate-950 border border-slate-800 rounded-xl p-5 shadow-2xl relative">
        <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-500/[0.02] rounded-full blur-2xl"></div>

        {/* Global terms remarks */}
        <div className="lg:col-span-2 space-y-3.5">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-[10px] text-slate-400 font-bold block mb-1">主单级别全局质保协议</label>
              <input
                type="text"
                value={aftersalesTerms}
                onChange={e => {
                  setAftersalesTerms(e.target.value);
                  // sync to all row items
                  salesItems.forEach((_, idx) => updateItemForm(idx, "aftersalesTerms", e.target.value));
                }}
                className="w-full bg-slate-900 border border-slate-800 text-xs text-slate-300 p-2.5 rounded-lg"
              />
            </div>
            <div>
              <label className="text-[10px] text-slate-400 font-bold block mb-1">开单销售店员</label>
              <select
                value={employee}
                onChange={e => setEmployee(e.target.value)}
                className="w-full bg-slate-900 border border-slate-800 text-xs text-slate-200 p-2.5 rounded-lg"
              >
                <option value="王小明 (店员)">王小明 (店员)</option>
                <option value="前台王姑娘">前台王姑娘 (微信私域)</option>
                <option value="店长小张">店长小张 (主理回收对接)</option>
              </select>
            </div>
          </div>

          <div>
            <label className="text-[10px] text-slate-400 font-bold block mb-1">销售备注（可选）</label>
            <textarea
              value={remarks}
              onChange={e => setRemarks(e.target.value)}
              placeholder="记录客户对包装、线材、随纸报告和指定快递的需求。例如：随附3DMark压力测试报告复印件..."
              className="w-full bg-slate-900 border border-slate-800 text-xs text-slate-200 p-2.5 rounded-lg h-16 resize-none focus:outline-none"
            ></textarea>
          </div>
        </div>

        {/* PRICE SUMMARY */}
        <div className="bg-slate-900 p-4 border border-slate-850 rounded-xl flex flex-col justify-between">
          <div className="space-y-2">
            <h4 className="text-xs font-bold text-slate-300 tracking-wider Border-b border-slate-800 pb-1.5 flex justify-between uppercase">
              <span>销售结算汇总</span>
              <span className="font-mono text-[9px] text-slate-500 font-bold">{salesItems.length} 张单卡</span>
            </h4>

            <div className="flex justify-between text-xs text-slate-400 font-mono">
              <span>零售销售总额:</span>
              <span className="text-slate-100 font-bold text-sm">¥{calculatedStats.totalAmount.toLocaleString()}</span>
            </div>

            {permissions.showCost && (
              <div className="flex justify-between text-xs text-slate-500 font-mono">
                <span>总进货成本:</span>
                <span>¥{calculatedStats.totalCost.toLocaleString()}</span>
              </div>
            )}

            <div className="flex justify-between text-xs text-slate-400 border-t border-slate-850 pt-2 font-mono">
              <span>预计差价实收净利润:</span>
              {permissions.showProfit ? (
                <span className={`text-base font-black ${calculatedStats.totalProfit >= 0 ? "text-emerald-400" : "text-rose-500"}`}>
                  ¥{calculatedStats.totalProfit.toLocaleString()}
                </span>
              ) : (
                <span className="text-slate-500 font-light italic">店员隐藏</span>
              )}
            </div>
          </div>

          <button
            onClick={handlePostSales}
            className="w-full mt-4 p-3 bg-gradient-to-r from-emerald-500 to-green-600 hover:from-emerald-400 hover:to-green-500 text-slate-950 font-black text-xs rounded-xl shadow-[0_0_12px_rgba(16,185,129,0.3)] transition-all flex items-center justify-center gap-1 cursor-pointer"
          >
            <CheckCircle className="w-4 h-4 text-slate-950" />
            确认销售开单 · 出库扣减
          </button>
        </div>
      </div>
    </div>
  );
}
