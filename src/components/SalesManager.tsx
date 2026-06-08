/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useMemo, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import {
  BadgeDollarSign,
  Search,
  Plus,
  CheckCircle,
} from "lucide-react";
import { useStoreStateReturn } from "../utils/state";
import { getLockedHandlerFieldState } from "../utils/sessionUser";
import { CardInventory, CustomerCard } from "../types";

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
    settlementAccounts,
    currentRole,
    currentUser
  } = storeState;
  const lockedHandlerState = getLockedHandlerFieldState(currentUser, currentRole);
  const defaultHandlerName = lockedHandlerState.value;

  // General billing sheets state
  const [customerName, setCustomerName] = useState("");
  const [contact, setContact] = useState("");
  const [selectedCustomerId, setSelectedCustomerId] = useState(customers[0]?.id || "");
  const [channel, setChannel] = useState<"到店" | "闲鱼" | "抖音" | "小红书" | "B站" | "微信私域" | "同行网店">("到店");
  
  const [isPaid, setIsPaid] = useState(true);
  const [paidAmount, setPaidAmount] = useState<number>(0);
  const [unpaidAmount, setUnpaidAmount] = useState<number>(0);
  
  const [needInvoice, setNeedInvoice] = useState(false);
  const [freeShipping, setFreeShipping] = useState(true);
  const [expressCompany, setExpressCompany] = useState("顺丰速运");
  const [expressNo, setExpressNo] = useState("");
  const [aftersalesTerms, setAftersalesTerms] = useState("店保三个月（非采矿导致坏点）");
  const [employee, setEmployee] = useState(defaultHandlerName);
  const [settlementAccountId, setSettlementAccountId] = useState(settlementAccounts[0]?.id || "");
  const [paymentHandler, setPaymentHandler] = useState(defaultHandlerName);
  const [remarks, setRemarks] = useState("");

  // Items to sell array
  const [salesItems, setSalesItems] = useState([
    {
      inventoryId: "",
      productName: "",
      productId: "",
      sn: "",
      condition: "充新99新",
      costPrice: 0,
      sellPrice: 0,
      aftersalesTerms: "店保三个月（非采矿导致坏点）"
    }
  ]);

  // Autocomplete targeting available stocks
  const [activeRowId, setActiveRowId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [lookupMenuRect, setLookupMenuRect] = useState<{ top: number; left: number; width: number; maxHeight: number } | null>(null);
  const lookupDropdownRef = useRef<HTMLDivElement>(null);

  // Available stocks are cards not sold and in a sellable state: "已入库" / "已上架" / "待检测" (just warning)
  const availableGpus = useMemo(() => {
    return inventory.filter(c => ["已入库", "已上架"].includes(c.status));
  }, [inventory]);

  const normalizeCustomerType = (type?: CustomerCard["type"]) => {
    if (type === "个人卖家客户" || type === "回收客户") return "个人卖家客户";
    return "个人买家客户";
  };

  useEffect(() => {
    setEmployee(defaultHandlerName);
    setPaymentHandler(defaultHandlerName);
  }, [defaultHandlerName]);

  const personalBuyerCustomers = useMemo(() => {
    return customers.filter(customer => normalizeCustomerType(customer.type) === "个人买家客户");
  }, [customers]);

  const selectedCustomer = useMemo(() => {
    return personalBuyerCustomers.find(customer => customer.id === selectedCustomerId) || null;
  }, [personalBuyerCustomers, selectedCustomerId]);

  const selectedSettlementAccount = useMemo(() => {
    return settlementAccounts.find(account => account.id === settlementAccountId) || settlementAccounts[0];
  }, [settlementAccountId, settlementAccounts]);

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

  const activeLookupIndex = activeRowId?.startsWith("srow-") ? Number(activeRowId.replace("srow-", "")) : -1;

  const openInventoryLookup = (rowIdx: number, value: string, input: HTMLInputElement) => {
    const rect = input.getBoundingClientRect();
    setActiveRowId(`srow-${rowIdx}`);
    setSearchQuery(value);
    setLookupMenuRect({
      top: rect.bottom + 6,
      left: rect.left,
      width: Math.max(rect.width, 360),
      maxHeight: Math.max(180, Math.min(280, window.innerHeight - rect.bottom - 16))
    });
  };

  const resolvePaymentMethod = (): "微信" | "支付宝" | "现金" | "银行卡" | "账期欠款" => {
    if (!isPaid && paidAmount <= 0) return "账期欠款";
    if (selectedSettlementAccount?.type === "微信") return "微信";
    if (selectedSettlementAccount?.type === "支付宝") return "支付宝";
    if (selectedSettlementAccount?.type === "现金") return "现金";
    return "银行卡";
  };

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
    if (!personalBuyerCustomers.some(customer => customer.id === selectedCustomerId)) {
      setSelectedCustomerId(personalBuyerCustomers[0]?.id || "");
    }
  }, [personalBuyerCustomers, selectedCustomerId]);

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

  useEffect(() => {
    const closeFloatingLookup = () => {
      setActiveRowId(null);
      setLookupMenuRect(null);
    };
    window.addEventListener("resize", closeFloatingLookup);
    return () => {
      window.removeEventListener("resize", closeFloatingLookup);
    };
  }, []);

  const addCheckoutRow = () => {
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
    setLookupMenuRect(null);
  };

  const handlePostSales = () => {
    if (!selectedCustomer) {
      alert("请先在【个人客户】里新增个人买家客户，再回到销售单选择客户开单。");
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
      paymentMethod: resolvePaymentMethod(),
      isPaid,
      paidAmount,
      unpaidAmount,
      settlementAccountId: paidAmount > 0 ? settlementAccountId : undefined,
      settlementAccountName: selectedSettlementAccount?.name,
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

    alert("销售单已提交，商品已进入【销售出库池】。\n请由仓库扫码或手动确认出库后，库存才会变为已售出。");
    setTab("sales_outbound");
  };

  const labelClass = "text-[12px] text-slate-500 font-semibold block mb-2";
  const fieldClass = "w-full h-12 bg-white border border-slate-800 text-sm text-slate-100 px-3 rounded-xl shadow-sm focus:outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100 transition";
  const readOnlyFieldClass = "w-full h-12 bg-slate-950 border border-slate-800 text-sm text-slate-500 px-3 rounded-xl shadow-sm";
  const compactFieldClass = "w-full h-11 bg-white border border-slate-800 text-sm text-slate-100 px-3 rounded-lg shadow-sm focus:outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100 transition";

  return (
    <div className="space-y-4">
      {/* Visual top */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-5 rounded-2xl border border-slate-800 shadow-sm">
        <div>
          <h2 className="text-lg font-semibold text-slate-100 flex items-center gap-2">
            <BadgeDollarSign className="w-5 h-5 text-blue-600" />
            <span>销售开单</span>
          </h2>
          <p className="text-sm text-slate-500 mt-1">
            选择客户、收款账户和可售库存，提交后自动出库并生成财务记录。
          </p>
        </div>
        <div className="bg-blue-50 px-3 py-2 border border-blue-100 text-xs text-blue-700 rounded-xl">
          可售库存 <span className="font-semibold font-mono">{availableGpus.length}</span> 张
        </div>
      </div>

      {/* BILLING CLIENT HEADERS */}
      <div className="bg-white p-5 md:p-6 rounded-2xl border border-slate-800 space-y-5 shadow-sm relative">

        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
          {/* Customer */}
          <div>
            <label className={labelClass}>个人买家客户</label>
            <select
              required
              value={selectedCustomerId}
              onChange={e => setSelectedCustomerId(e.target.value)}
              className={`${fieldClass} font-medium truncate`}
            >
              {personalBuyerCustomers.length === 0 && <option value="">请先新增个人买家客户</option>}
              {personalBuyerCustomers.map(customer => (
                <option key={customer.id} value={customer.id}>
                  {customer.name} / {customer.phone || customer.wechat || customer.source}
                </option>
              ))}
            </select>
          </div>

          {/* Contact */}
          <div>
            <label className={labelClass}>买方联系电话 / 微信</label>
            <input
              type="text"
              required
              value={contact}
              readOnly
              className={readOnlyFieldClass}
            />
          </div>

          {/* Platform channels */}
          <div>
            <label className={labelClass}>销售渠道</label>
            <select
              value={channel}
              onChange={e => setChannel(e.target.value as any)}
              className={`${fieldClass} font-medium`}
            >
              <option value="到店">到店现购</option>
              <option value="闲鱼">闲鱼买手</option>
              <option value="微信私域">微信私域</option>
              <option value="同行网店">同行调货</option>
              <option value="小红书">小红书</option>
              <option value="抖音">抖音</option>
              <option value="B站">B站</option>
            </select>
          </div>

          <div className="flex items-end">
            <button
              type="button"
              onClick={() => setTab("customers")}
              className="w-full h-12 bg-slate-950 hover:bg-slate-800 border border-slate-800 text-slate-100 text-sm font-semibold rounded-xl transition"
            >
              去个人客户新增
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-5 gap-4 border-t border-slate-800 pt-5 items-end">
          <div>
            <label className={labelClass}>收款账户</label>
            <select
              value={settlementAccountId}
              onChange={e => setSettlementAccountId(e.target.value)}
              className={`${fieldClass} font-medium`}
            >
              {settlementAccounts.map(account => (
                <option key={account.id} value={account.id}>{account.name} / {account.balance}元</option>
              ))}
            </select>
          </div>

          <div>
            <label className={labelClass}>经办人</label>
            <input
              value={paymentHandler}
              readOnly={lockedHandlerState.readOnly}
              disabled={lockedHandlerState.disabled}
              className={`${fieldClass} cursor-not-allowed opacity-80`}
            />
          </div>

          {/* Settle status toggle */}
          <div>
            <label className={labelClass}>收款状态</label>
            <div className="flex bg-slate-950 p-1 rounded-xl border border-slate-800 gap-1 h-12">
              <button
                type="button"
                onClick={() => setIsPaid(true)}
                className={`flex-1 text-sm font-semibold rounded-lg transition ${
                  isPaid ? "bg-blue-600 text-white shadow-sm" : "text-slate-500 hover:text-slate-100"
                }`}
              >
                全款
              </button>
              <button
                type="button"
                onClick={() => setIsPaid(false)}
                className={`flex-1 text-sm font-semibold rounded-lg transition ${
                  !isPaid ? "bg-amber-500 text-white shadow-sm" : "text-slate-500 hover:text-slate-100"
                }`}
              >
                挂账
              </button>
            </div>
          </div>

          {/* Debt balances */}
          <div>
            <label className={labelClass}>已收款(元)</label>
            <input
              type="number"
              disabled={isPaid}
              value={paidAmount}
              onChange={e => {
                const val = Number(e.target.value);
                setPaidAmount(val);
                setUnpaidAmount(Math.max(0, calculatedStats.totalAmount - val));
              }}
              className={`${compactFieldClass} font-mono font-semibold disabled:bg-slate-950 disabled:text-slate-400`}
            />
          </div>
          <div>
            <label className={labelClass}>未收款(欠款)</label>
            <div className="w-full h-11 bg-slate-950 border border-slate-800 px-3 text-sm font-mono font-semibold text-amber-500 rounded-lg flex items-center">
              {unpaidAmount}元
            </div>
          </div>

          {/* Invoices requirements and logistics */}
          <div className="grid grid-cols-2 gap-2 md:col-span-2">
            <div>
              <label className="flex items-center gap-2 cursor-pointer text-[12px] text-slate-500 font-semibold mb-2">
                <input
                  type="checkbox"
                  checked={needInvoice}
                  onChange={e => setNeedInvoice(e.target.checked)}
                  className="rounded text-blue-600 border-slate-800"
                />
                <span>需要发票</span>
              </label>
              <div className="w-full h-11 bg-slate-950 text-slate-500 border border-slate-800 px-3 rounded-lg text-sm flex items-center">
                {needInvoice ? "普通发票" : "收据/不开票"}
              </div>
            </div>

            <div>
              <label className="flex items-center gap-2 cursor-pointer text-[12px] text-slate-500 font-semibold mb-2">
                <input
                  type="checkbox"
                  checked={freeShipping}
                  onChange={e => setFreeShipping(e.target.checked)}
                  className="rounded text-blue-600 border-slate-800"
                />
                <span>包邮</span>
              </label>
              <div className="w-full h-11 bg-slate-950 text-slate-300 border border-slate-800 px-3 rounded-lg text-sm font-medium flex items-center">
                {freeShipping ? "顺丰包邮" : "到付自理"}
              </div>
            </div>
          </div>

          {/* Express lines */}
          <div>
            <label className={labelClass}>物流公司与快递单号</label>
            <input
              type="text"
              placeholder="例如：顺丰 SF148..."
              value={expressNo}
              onChange={e => setExpressNo(e.target.value)}
              className={`${fieldClass} font-mono`}
            />
          </div>
        </div>
      </div>

      {/* CORE CHECKOUT GRID SPREADSHEEET */}
      <div className="bg-white border border-slate-800 rounded-2xl overflow-x-auto shadow-sm">
        <table className="w-full text-left border-collapse table-fixed min-w-[1000px]">
          <thead>
            <tr className="border-b border-slate-800 bg-slate-950 text-[12px] text-slate-500 font-semibold">
              <th className="p-3 pl-4 w-[280px]">绑定库存卡</th>
              <th className="p-3 w-[120px]">SN</th>
              <th className="p-3 w-[110px]">成色</th>
              <th className="p-3 text-right">成本</th>
              <th className="p-3 text-right w-[120px]">成交价(元)</th>
              <th className="p-3 text-right">利润</th>
              <th className="p-3">质保承诺</th>
              <th className="p-3 pr-4 text-right w-[90px]">操作</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800 text-sm">
            {salesItems.map((item, idx) => {
              const rowProfit = item.sellPrice - item.costPrice;

              return (
                <tr key={idx} className="hover:bg-blue-50/40 transition-colors">
                  {/* LOOKUP INPUT COLUMN */}
                  <td className="p-2 pl-4 relative">
                    <div className="relative">
                      <input
                        type="text"
                        value={activeRowId === `srow-${idx}` ? searchQuery : item.productName}
                        placeholder="输入关键字 / SN / 库存 ID 搜索可售库存..."
                        onClick={e => openInventoryLookup(idx, item.productName, e.currentTarget)}
                        onFocus={e => openInventoryLookup(idx, item.productName, e.currentTarget)}
                        onChange={e => {
                          openInventoryLookup(idx, e.target.value, e.currentTarget);
                        }}
                        className="w-full h-10 bg-white border border-slate-800 text-sm text-slate-100 px-3 rounded-lg focus:outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100 font-medium truncate pr-8"
                      />
                      <Search className="w-3.5 h-3.5 absolute right-2.5 top-3 text-slate-400 pointer-events-none" />
                    </div>
                  </td>

                  {/* Serial block info */}
                  <td className="p-2 font-mono text-xs text-slate-500">
                    <span className="font-semibold text-blue-600">{item.sn || "等待绑定"}</span>
                  </td>

                  {/* Condition grade */}
                  <td className="p-2">
                    <span className="font-medium text-slate-300">{item.condition}</span>
                  </td>

                  {/* Reference Costs */}
                  <td className="p-2 text-right text-slate-500 font-mono text-xs">
                    {permissions.showCost ? (
                      <span>{item.costPrice}元</span>
                    ) : (
                      <span className="text-xs text-slate-400">隐藏</span>
                    )}
                  </td>

                  {/* Real actual sales prices inputting */}
                  <td className="p-3">
                    <input
                      type="number"
                      required
                      value={item.sellPrice}
                      onChange={e => updateItemForm(idx, "sellPrice", Number(e.target.value))}
                      className="w-full h-10 text-right bg-white border border-slate-800 text-sm text-slate-100 font-mono font-semibold px-3 rounded-lg focus:outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
                    />
                  </td>

                  {/* Actual margins profit */}
                  <td className="p-2 text-right font-mono font-semibold">
                    {permissions.showProfit ? (
                      <span className={rowProfit >= 0 ? "text-emerald-600" : "text-rose-600"}>
                        {rowProfit}元
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
                      className="w-full h-10 bg-white border border-slate-800 text-sm text-slate-300 px-3 rounded-lg focus:outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
                    />
                  </td>

                  {/* TRASH DISCARD CARD */}
                  <td className="p-2 text-right pr-4">
                    <button
                      type="button"
                      onClick={() => removeCheckoutRow(idx)}
                      className="h-9 px-3 border border-rose-800 text-rose-400 hover:bg-rose-950 rounded-lg font-semibold duration-150 cursor-pointer"
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

      {activeLookupIndex >= 0 && lookupMenuRect && createPortal(
        <div
          ref={lookupDropdownRef}
          className="fixed bg-white border border-slate-200 shadow-2xl rounded-xl z-[9999] p-1.5 overflow-y-auto custom-scrollbar"
          style={{
            top: lookupMenuRect.top,
            left: lookupMenuRect.left,
            width: lookupMenuRect.width,
            maxHeight: lookupMenuRect.maxHeight
          }}
        >
          <div className="p-2 border-b border-slate-200 text-xs text-slate-500 mb-1 flex items-center justify-between gap-2">
            <span>仅显示可售库存</span>
            <span className="font-mono text-slate-400">{filteredAvailableGpus.length} 条</span>
          </div>
          {filteredAvailableGpus.length === 0 ? (
            <div className="p-3 text-slate-500 text-sm">找不到可售库存</div>
          ) : (
            filteredAvailableGpus.map(c => (
              <button
                key={c.id}
                type="button"
                onClick={() => selectCardForCheckout(activeLookupIndex, c)}
                className="w-full text-left p-2.5 hover:bg-blue-50 rounded-lg flex items-center justify-between gap-3 transition-colors text-xs"
              >
                <div className="min-w-0">
                  <span className="font-semibold text-slate-100 block truncate">{c.productName}</span>
                  <span className="text-[10px] text-slate-500 font-mono block truncate">
                    ID: {c.id} | SN: {c.sn}
                  </span>
                </div>
                <div className="text-right whitespace-nowrap shrink-0">
                  <span className="text-blue-600 font-semibold block">售: {c.estSellPrice}元</span>
                  <span className="text-[10px] text-slate-400 font-mono block">成本: {c.costPrice}元</span>
                </div>
              </button>
            ))
          )}
        </div>,
        document.body
      )}

      {/* QUICK WORK TOOLBAR */}
      <div className="flex flex-col md:flex-row gap-3 bg-white border border-slate-800 p-3 rounded-2xl items-start md:items-center justify-between shadow-sm">
        <button
          type="button"
          onClick={addCheckoutRow}
          className="h-10 px-4 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-sm font-semibold flex items-center gap-2 cursor-pointer transition"
        >
          <Plus className="w-4 h-4" />
          增加一行商品
        </button>

        <span className="text-xs text-slate-500">
          销售绑定后，出库商品数量、利润统计和个人账户业绩将直接与库存 SN 卡扣挂钩。
        </span>
      </div>

      {/* FINAL FINANCIAL CHECKS SUMMARY */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 bg-white border border-slate-800 rounded-2xl p-5 shadow-sm relative">
        {/* Global terms remarks */}
        <div className="lg:col-span-2 space-y-3.5">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className={labelClass}>整单质保协议</label>
              <input
                type="text"
                value={aftersalesTerms}
                onChange={e => {
                  setAftersalesTerms(e.target.value);
                  // sync to all row items
                  salesItems.forEach((_, idx) => updateItemForm(idx, "aftersalesTerms", e.target.value));
                }}
                className={fieldClass}
              />
            </div>
            <div>
              <label className={labelClass}>开单销售</label>
              <select
                value={employee}
                disabled={lockedHandlerState.disabled}
                className={`${fieldClass} cursor-not-allowed opacity-80`}
              >
                <option value={defaultHandlerName}>{defaultHandlerName}</option>
              </select>
            </div>
          </div>

          <div>
            <label className={labelClass}>销售备注（可选）</label>
            <textarea
              value={remarks}
              onChange={e => setRemarks(e.target.value)}
              placeholder="记录客户对包装、线材、随纸报告和指定快递的需求。例如：随附3DMark压力测试报告复印件..."
              className="w-full bg-white border border-slate-800 text-sm text-slate-100 p-3 rounded-xl h-20 resize-none focus:outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100 transition"
            ></textarea>
          </div>
        </div>

        {/* PRICE SUMMARY */}
        <div className="bg-slate-950 p-4 border border-slate-800 rounded-2xl flex flex-col justify-between">
          <div className="space-y-2">
            <h4 className="text-sm font-semibold text-slate-100 border-b border-slate-800 pb-2 flex justify-between">
              <span>销售结算汇总</span>
              <span className="font-mono text-xs text-slate-500">{salesItems.length} 张单卡</span>
            </h4>

            <div className="flex justify-between text-sm text-slate-500 font-mono">
              <span>销售总额</span>
              <span className="text-slate-100 font-semibold">{calculatedStats.totalAmount.toLocaleString()}元</span>
            </div>

            {permissions.showCost && (
              <div className="flex justify-between text-sm text-slate-500 font-mono">
                <span>总成本</span>
                <span>{calculatedStats.totalCost.toLocaleString()}元</span>
              </div>
            )}

            <div className="flex justify-between text-sm text-slate-500 border-t border-slate-800 pt-2 font-mono">
              <span>预计利润</span>
              {permissions.showProfit ? (
                <span className={`text-lg font-semibold ${calculatedStats.totalProfit >= 0 ? "text-emerald-600" : "text-rose-600"}`}>
                  {calculatedStats.totalProfit.toLocaleString()}元
                </span>
              ) : (
                <span className="text-slate-500 font-light italic">店员隐藏</span>
              )}
            </div>
          </div>

          <button
            onClick={handlePostSales}
            className="w-full mt-4 h-12 bg-blue-600 hover:bg-blue-500 text-white font-semibold text-sm rounded-xl transition flex items-center justify-center gap-2 cursor-pointer"
          >
            <CheckCircle className="w-4 h-4" />
            确认开单并出库
          </button>
        </div>
      </div>
    </div>
  );
}
