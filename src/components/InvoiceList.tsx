/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useMemo } from "react";
import {
  FileText,
  Search,
  Printer,
  X,
  Save
} from "lucide-react";
import { useStoreStateReturn } from "../utils/state";
import { PurchaseInvoice, SalesInvoice } from "../types";

interface InvoiceListProps {
  storeState: useStoreStateReturn;
  type: "purchase" | "sales";
}

export default function InvoiceList({ storeState, type }: InvoiceListProps) {
  const { purchaseInvoices, salesInvoices, permissions, updatePurchaseInvoice, updateSalesInvoice } = storeState;

  // Search local state
  const [search, setSearch] = useState("");
  const [focusedInvoice, setFocusedInvoice] = useState<any | null>(null);
  const [editingInvoice, setEditingInvoice] = useState<any | null>(null);

  // Compute lists
  const dataList = useMemo(() => {
    if (type === "purchase") {
      return [...purchaseInvoices].reverse().filter(p =>
        p.id.toLowerCase().includes(search.toLowerCase()) ||
        p.supplierName.toLowerCase().includes(search.toLowerCase())
      );
    } else {
      return [...salesInvoices].reverse().filter(s =>
        s.id.toLowerCase().includes(search.toLowerCase()) ||
        s.customerName.toLowerCase().includes(search.toLowerCase())
      );
    }
  }, [purchaseInvoices, salesInvoices, type, search]);

  const handlePrintSlip = (invoice: any) => {
    alert(`📄 凭单打印指令发送成功！\n---------------\n类型: ${type === "purchase" ? "进货确认单" : "销售出库单"}\n单号: ${invoice.id}\n对手方: ${type === "purchase" ? invoice.supplierName : invoice.customerName}\n总计数量: ${invoice.items.length} 张单卡\n结算状态: ${invoice.isPaid ? "已结清" : "带部分欠款"}`);
  };

  const openEdit = (invoice: any) => {
    setEditingInvoice(JSON.parse(JSON.stringify(invoice)));
  };

  const updateEditingField = (key: string, value: any) => {
    setEditingInvoice((prev: any) => prev ? { ...prev, [key]: value } : prev);
  };

  const updateEditingItem = (index: number, key: string, value: any) => {
    setEditingInvoice((prev: any) => {
      if (!prev) return prev;
      const items = [...prev.items];
      items[index] = { ...items[index], [key]: value };
      return { ...prev, items };
    });
  };

  const saveEdit = () => {
    if (!editingInvoice) return;
    const items = editingInvoice.items.map((item: any) => type === "purchase" ? {
      ...item,
      buyPrice: Number(item.buyPrice) || 0,
      estSellPrice: Number(item.estSellPrice) || 0,
    } : {
      ...item,
      costPrice: Number(item.costPrice) || 0,
      sellPrice: Number(item.sellPrice) || 0,
      profit: (Number(item.sellPrice) || 0) - (Number(item.costPrice) || 0),
    });
    const updates = {
      ...editingInvoice,
      paidAmount: Number(editingInvoice.paidAmount) || 0,
      unpaidAmount: Number(editingInvoice.unpaidAmount) || 0,
      items,
    };
    if (type === "purchase") {
      updatePurchaseInvoice(editingInvoice.id, updates);
    } else {
      updateSalesInvoice(editingInvoice.id, updates);
    }
    setEditingInvoice(null);
    alert("单据已更新。");
  };

  return (
    <div className="space-y-4">
      {/* Top action details */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-slate-900 border border-slate-800 p-4 rounded-xl">
        <h3 className="text-xs font-bold text-slate-100 uppercase tracking-widest flex items-center gap-1.5 font-mono">
          <FileText className="w-4 h-4 text-cyan-400" />
          <span>已入账历史{type === "purchase" ? "货品采购单" : "客户销售明细"}柜 ({dataList.length} 笔)</span>
        </h3>

        {/* Local Search bar */}
        <div className="relative w-full sm:w-80">
          <Search className="w-3.5 h-3.5 absolute left-3 top-3 text-slate-500" />
          <input
            type="text"
            placeholder={type === "purchase" ? "搜供货商名称、单号..." : "搜销售买家尊称、销售合同号..."}
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-100 pl-8.5 pr-3 py-2.5 placeholder-slate-550 focus:outline-none focus:border-cyan-500"
          />
        </div>
      </div>

      {/* MATRIX RECORDS ROWS */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {dataList.length === 0 ? (
          <div className="md:col-span-3 p-12 text-center text-slate-550 italic text-xs font-mono">
            暂无符合条件的历史单据。
          </div>
        ) : (
          dataList.map(invoice => {
            const itemCount = invoice.items.length;
            const sumPrice = type === "purchase" 
              ? invoice.items.reduce((acc: number, item: any) => acc + item.buyPrice, 0)
              : invoice.items.reduce((acc: number, item: any) => acc + item.sellPrice, 0);

            return (
              <div
                key={invoice.id}
                className="bg-slate-900 border border-slate-800 rounded-xl p-4.5 space-y-3.5 shadow-md hover:border-slate-700 transition-colors"
              >
                <div className="flex justify-between items-start">
                  <div>
                    <span className="text-[10px] text-slate-500 font-mono block">单据编号</span>
                    <span className="text-xs font-black text-slate-100 font-mono block mt-0.5">{invoice.id}</span>
                  </div>

                  <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                    invoice.isPaid ? "bg-emerald-500/10 text-emerald-405" : "bg-amber-500/10 text-amber-500"
                  }`}>
                    {invoice.isPaid ? "资金已讫" : "未清尾账"}
                  </span>
                </div>

                <div className="text-xs space-y-1 bg-slate-950 p-2.5 rounded border border-slate-855">
                  <div className="flex justify-between leading-normal text-slate-400">
                    <span>对手实体:</span>
                    <span className="text-slate-200 font-bold max-w-[120px] truncate" title={type === "purchase" ? invoice.supplierName : invoice.customerName}>
                      {type === "purchase" ? invoice.supplierName : invoice.customerName}
                    </span>
                  </div>
                  <div className="flex justify-between leading-normal text-slate-400">
                    <span>总计流量:</span>
                    <span className="text-slate-100 font-bold font-mono">{itemCount} 张单卡</span>
                  </div>
                  <div className="flex justify-between leading-normal text-slate-400">
                    <span>单据总额:</span>
                    <span className="text-cyan-400 font-black font-mono">
                      ¥{sumPrice.toLocaleString()}
                    </span>
                  </div>
                </div>

                <div className="flex justify-between items-center text-[10px] text-slate-500 font-mono">
                  <span>入账日期: {invoice.date}</span>
                  <div className="flex gap-2">
                    <button
                      onClick={() => openEdit(invoice)}
                      className="text-amber-300 hover:underline font-bold font-sans cursor-pointer"
                    >
                      编辑
                    </button>
                    <button
                      onClick={() => setFocusedInvoice(invoice)}
                      className="text-cyan-451 hover:underline font-bold font-sans cursor-pointer"
                    >
                      详细
                    </button>
                    <button
                      onClick={() => handlePrintSlip(invoice)}
                      title="快速打印凭根纸条"
                      className="text-slate-400 hover:text-cyan-400 cursor-pointer"
                    >
                      <Printer className="w-3.5 h-3.5 inline" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* DETAIL DRAWER / POPUP FOR A SINGLE INVOICE */}
      {focusedInvoice && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-xl shadow-2xl relative text-slate-200 overflow-hidden">
            <div className="absolute top-0 right-0 w-32 h-32 bg-cyan-400/[0.02] rounded-full blur-2xl"></div>

            <div className="p-5 border-b border-slate-800 flex items-center justify-between">
              <div>
                <span className="text-[10px] text-slate-500 uppercase tracking-widest font-mono font-bold block">
                  {type === "purchase" ? "入库进货凭条明细" : "开具销售出库凭单"}
                </span>
                <h3 className="font-bold text-slate-100 text-sm mt-1">单号: {focusedInvoice.id}</h3>
              </div>
              <button onClick={() => setFocusedInvoice(null)} className="text-slate-400 hover:text-slate-200 cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Inward Modal Scrollbody details */}
            <div className="p-5 space-y-4 max-h-[380px] overflow-y-auto custom-scrollbar">
              <div className="grid grid-cols-2 gap-4 text-xs font-mono bg-slate-950 p-4 rounded-xl border border-slate-855">
                <div>
                  <span className="text-slate-500 block">合作交易对手方</span>
                  <span className="text-slate-100 font-extrabold text-sm block mt-1">
                    {type === "purchase" ? focusedInvoice.supplierName : focusedInvoice.customerName}
                  </span>
                </div>
                <div>
                  <span className="text-slate-500 block">对方联系人 / 渠道</span>
                  <span className="text-slate-250 block mt-1 font-sans">{focusedInvoice.contact || "同城面收"}</span>
                </div>
                <div>
                  <span className="text-slate-500 block">支付通道 / 已付款款项</span>
                  <span className="text-white block mt-1 font-sans">
                    {focusedInvoice.paymentMethod}支付 | {focusedInvoice.isPaid ? "全额结清" : `欠款 ¥${focusedInvoice.unpaidAmount}`}
                  </span>
                </div>
                <div>
                  <span className="text-slate-500 block">经办/经手负责人</span>
                  <span className="text-slate-200 block mt-1 font-sans">{focusedInvoice.handleBy}</span>
                </div>
              </div>

              {/* Items listing table summary */}
              <div className="space-y-2">
                <h4 className="text-[10px] text-slate-400 font-bold uppercase tracking-wider font-mono">
                  随附显卡物理一卡一档明细板：
                </h4>

                <div className="space-y-2 font-mono">
                  {focusedInvoice.items.map((it: any, idx: number) => (
                    <div key={idx} className="p-2.5 bg-slate-950 border border-slate-855 rounded-lg text-xs flex justify-between items-center">
                      <div>
                        <span className="text-slate-100 font-black block">{it.productName}</span>
                        <div className="text-[10px] text-slate-500 flex gap-2 mt-1">
                          <span>SN: <b className="text-cyan-400 underline">{it.sn}</b></span>
                          <span>品相: {it.condition}</span>
                        </div>
                      </div>
                      <div className="text-right">
                        <span className="font-bold text-slate-100 block">
                          ¥{type === "purchase" ? it.buyPrice : it.sellPrice}
                        </span>
                        {type === "sales" && permissions.showProfit && (
                          <span className="text-[9px] text-emerald-400 bg-emerald-900/20 px-1 rounded block mt-1 leading-none py-0.5">
                            盈 ¥{it.sellPrice - it.costPrice}
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Global terms remarks */}
              <div className="p-3 bg-slate-950 rounded border border-slate-900 text-[11px] text-slate-405 leading-normal font-sans">
                💡 <b>单据全局说明</b>：
                {focusedInvoice.remarks || "该单据已归档，可用于打印和售后查询。随箱保修凭单在约定质保期内有效。"}
              </div>
            </div>

            {/* Modal actions footer */}
            <div className="p-4 border-t border-slate-800 bg-slate-950/40 flex justify-end gap-2 text-xs">
              <button
                type="button"
                onClick={() => setFocusedInvoice(null)}
                className="px-4 py-2 border border-slate-705 rounded text-slate-400 font-bold hover:bg-slate-800 cursor-pointer"
              >
                关闭
              </button>
              <button
                type="button"
                onClick={() => handlePrintSlip(focusedInvoice)}
                className="px-5 py-2 bg-cyan-500 hover:bg-cyan-400 text-slate-950 font-black rounded shadow-[0_0_12px_rgba(6,182,212,0.35)] cursor-pointer flex items-center gap-1.5"
              >
                <Printer className="w-4 h-4 text-slate-950" />
                打印此联存单
              </button>
            </div>
          </div>
        </div>
      )}

      {editingInvoice && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-3xl shadow-2xl relative text-slate-200 overflow-hidden">
            <div className="p-5 border-b border-slate-800 flex items-center justify-between">
              <div>
                <span className="text-[10px] text-slate-500 uppercase tracking-widest font-mono font-bold block">
                  编辑{type === "purchase" ? "进货" : "销售"}单据
                </span>
                <h3 className="font-bold text-slate-100 text-sm mt-1">{editingInvoice.invoiceNo || editingInvoice.id}</h3>
              </div>
              <button onClick={() => setEditingInvoice(null)} className="text-slate-400 hover:text-slate-200 cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 space-y-4 max-h-[70vh] overflow-y-auto custom-scrollbar">
              <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                <input value={editingInvoice.date || ""} onChange={e => updateEditingField("date", e.target.value)} className="bg-slate-950 border border-slate-800 text-xs text-slate-200 p-2.5 rounded" placeholder="日期" />
                <input
                  value={type === "purchase" ? editingInvoice.supplierName : editingInvoice.customerName}
                  onChange={e => updateEditingField(type === "purchase" ? "supplierName" : "customerName", e.target.value)}
                  className="bg-slate-950 border border-slate-800 text-xs text-slate-200 p-2.5 rounded"
                  placeholder={type === "purchase" ? "供应商" : "客户"}
                />
                <input value={editingInvoice.contact || ""} onChange={e => updateEditingField("contact", e.target.value)} className="bg-slate-950 border border-slate-800 text-xs text-slate-200 p-2.5 rounded" placeholder="联系方式" />
                <input value={editingInvoice.paymentMethod || ""} onChange={e => updateEditingField("paymentMethod", e.target.value)} className="bg-slate-950 border border-slate-800 text-xs text-slate-200 p-2.5 rounded" placeholder="收付款方式" />
                <input type="number" value={editingInvoice.paidAmount || 0} onChange={e => updateEditingField("paidAmount", Number(e.target.value))} className="bg-slate-950 border border-slate-800 text-xs text-slate-200 p-2.5 rounded" placeholder="已付/已收" />
                <input type="number" value={editingInvoice.unpaidAmount || 0} onChange={e => updateEditingField("unpaidAmount", Number(e.target.value))} className="bg-slate-950 border border-slate-800 text-xs text-slate-200 p-2.5 rounded" placeholder="未付/未收" />
                <input value={editingInvoice.handleBy || ""} onChange={e => updateEditingField("handleBy", e.target.value)} className="bg-slate-950 border border-slate-800 text-xs text-slate-200 p-2.5 rounded" placeholder="经办人" />
                <input value={editingInvoice.remarks || ""} onChange={e => updateEditingField("remarks", e.target.value)} className="bg-slate-950 border border-slate-800 text-xs text-slate-200 p-2.5 rounded" placeholder="备注" />
              </div>

              <div className="space-y-2">
                <h4 className="text-[10px] text-slate-400 font-bold uppercase tracking-wider font-mono">明细价格可编辑，物理库存绑定只读</h4>
                {editingInvoice.items.map((item: any, index: number) => (
                  <div key={`${item.sn}-${index}`} className="grid grid-cols-1 md:grid-cols-6 gap-2 bg-slate-950 border border-slate-800 rounded-lg p-3">
                    <div className="md:col-span-2 text-xs">
                      <div className="text-slate-100 font-black truncate">{item.productName}</div>
                      <div className="text-[10px] text-slate-500 mt-1">SN: {item.sn || "-"} / {item.inventoryId || item.productId}</div>
                    </div>
                    {type === "purchase" ? (
                      <>
                        <input type="number" value={item.buyPrice || 0} onChange={e => updateEditingItem(index, "buyPrice", Number(e.target.value))} className="bg-slate-900 border border-slate-800 text-xs text-slate-200 p-2 rounded" placeholder="进价" />
                        <input type="number" value={item.estSellPrice || 0} onChange={e => updateEditingItem(index, "estSellPrice", Number(e.target.value))} className="bg-slate-900 border border-slate-800 text-xs text-slate-200 p-2 rounded" placeholder="预估售价" />
                      </>
                    ) : (
                      <>
                        <input type="number" value={item.costPrice || 0} onChange={e => updateEditingItem(index, "costPrice", Number(e.target.value))} className="bg-slate-900 border border-slate-800 text-xs text-slate-200 p-2 rounded" placeholder="成本" />
                        <input type="number" value={item.sellPrice || 0} onChange={e => updateEditingItem(index, "sellPrice", Number(e.target.value))} className="bg-slate-900 border border-slate-800 text-xs text-slate-200 p-2 rounded" placeholder="售价" />
                      </>
                    )}
                    <input value={item.remarks || ""} onChange={e => updateEditingItem(index, "remarks", e.target.value)} className="md:col-span-2 bg-slate-900 border border-slate-800 text-xs text-slate-200 p-2 rounded" placeholder="明细备注" />
                  </div>
                ))}
              </div>
            </div>

            <div className="p-4 border-t border-slate-800 bg-slate-950/40 flex justify-end gap-2 text-xs">
              <button type="button" onClick={() => setEditingInvoice(null)} className="px-4 py-2 border border-slate-705 rounded text-slate-400 font-bold hover:bg-slate-800">取消</button>
              <button type="button" onClick={saveEdit} className="px-5 py-2 bg-amber-400 hover:bg-amber-300 text-slate-950 font-black rounded flex items-center gap-1.5">
                <Save className="w-4 h-4" /> 保存修改
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
