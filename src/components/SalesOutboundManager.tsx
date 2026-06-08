/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect, useMemo, useState } from "react";
import { CheckCircle, PackageCheck, ScanLine, Search, Truck } from "lucide-react";
import { useStoreStateReturn } from "../utils/state";
import { getLockedHandlerFieldState } from "../utils/sessionUser";
import { SalesInvoice } from "../types";

interface SalesOutboundManagerProps {
  storeState: useStoreStateReturn;
}

const fmt = (value: number) => `${Math.round(value || 0).toLocaleString()}元`;

export default function SalesOutboundManager({ storeState }: SalesOutboundManagerProps) {
  const { salesInvoices, inventory, confirmSalesOutbound, currentRole, currentUser } = storeState;
  const lockedHandlerState = getLockedHandlerFieldState(currentUser, currentRole);
  const defaultHandlerName = lockedHandlerState.value;
  const [search, setSearch] = useState("");
  const [selectedInvoiceNo, setSelectedInvoiceNo] = useState("");
  const [scanText, setScanText] = useState("");
  const [handler, setHandler] = useState(defaultHandlerName);
  const [remarks, setRemarks] = useState("");

  useEffect(() => {
    setHandler(defaultHandlerName);
  }, [defaultHandlerName]);

  const pendingInvoices = useMemo(() => {
    return salesInvoices.filter(invoice => {
      const legacyAlreadySold = invoice.items.length > 0 && invoice.items.every(item =>
        inventory.find(card => card.id === item.inventoryId)?.status === "已售出"
      );
      return (invoice.outboundStatus || (legacyAlreadySold ? "已出库" : "待出库")) !== "已出库";
    });
  }, [inventory, salesInvoices]);

  const filteredInvoices = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    if (!keyword) return pendingInvoices;
    return pendingInvoices.filter(invoice =>
      invoice.invoiceNo.toLowerCase().includes(keyword) ||
      invoice.customerName.toLowerCase().includes(keyword) ||
      invoice.contact.toLowerCase().includes(keyword) ||
      invoice.items.some(item => item.productName.toLowerCase().includes(keyword) || item.sn.toLowerCase().includes(keyword))
    );
  }, [pendingInvoices, search]);

  const selectedInvoice = useMemo<SalesInvoice | null>(() => {
    return pendingInvoices.find(invoice => invoice.invoiceNo === selectedInvoiceNo || invoice.id === selectedInvoiceNo) || filteredInvoices[0] || null;
  }, [filteredInvoices, pendingInvoices, selectedInvoiceNo]);

  const scanCodes = useMemo(() => {
    return Array.from(new Set(scanText.split(/[\n,，\s]+/).map(item => item.trim()).filter(Boolean)));
  }, [scanText]);

  const scannedCount = useMemo(() => {
    if (!selectedInvoice) return 0;
    return selectedInvoice.items.filter(item => {
      const card = inventory.find(inv => inv.id === item.inventoryId);
      return scanCodes.some(code =>
        code.toLowerCase() === item.inventoryId.toLowerCase() ||
        code.toLowerCase() === item.sn.toLowerCase() ||
        (!!card?.sn && code.toLowerCase() === card.sn.toLowerCase())
      );
    }).length;
  }, [inventory, scanCodes, selectedInvoice]);

  const expectedCount = selectedInvoice?.items.length || 0;

  const handleConfirm = (manual: boolean) => {
    if (!selectedInvoice) {
      alert("当前没有待出库销售单。");
      return;
    }
    try {
      confirmSalesOutbound(selectedInvoice.id, {
        handler,
        codes: scanCodes,
        manual,
        remarks
      });
      alert(manual ? "已手动确认销售出库。" : "扫码核验通过，已完成销售出库。");
      setScanText("");
      setRemarks("");
      setSelectedInvoiceNo("");
    } catch (error) {
      alert(error instanceof Error ? error.message : "销售出库确认失败");
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm md:flex-row md:items-center md:justify-between">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-semibold text-slate-950">
            <Truck className="h-5 w-5 text-blue-600" />
            <span>销售出库</span>
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            销售开单后进入出库池，仓库扫码或手动确认后才会完整出库并扣减库存。
          </p>
        </div>
        <div className="rounded-xl border border-blue-100 bg-blue-50 px-4 py-3 text-sm font-semibold text-blue-700">
          待出库 {pendingInvoices.length} 单
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_420px]">
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <div className="flex flex-col gap-3 border-b border-slate-200 p-4 md:flex-row md:items-center md:justify-between">
            <div className="relative w-full md:max-w-md">
              <Search className="absolute left-3 top-3 h-4 w-4 text-slate-400" />
              <input
                value={search}
                onChange={event => setSearch(event.target.value)}
                placeholder="搜索销售单号、客户、SN、商品"
                className="h-11 w-full rounded-xl border border-slate-200 bg-white pl-9 pr-3 text-sm text-slate-950 outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
              />
            </div>
            <div className="text-xs text-slate-500">点击单据后在右侧扫码确认</div>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-[880px] w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs font-semibold text-slate-500">
                <tr>
                  <th className="border-b border-slate-200 px-4 py-3">销售单号</th>
                  <th className="border-b border-slate-200 px-4 py-3">客户</th>
                  <th className="border-b border-slate-200 px-4 py-3">商品</th>
                  <th className="border-b border-slate-200 px-4 py-3">数量</th>
                  <th className="border-b border-slate-200 px-4 py-3">金额</th>
                  <th className="border-b border-slate-200 px-4 py-3">物流</th>
                  <th className="border-b border-slate-200 px-4 py-3">状态</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredInvoices.map(invoice => (
                  <tr
                    key={invoice.id}
                    onClick={() => setSelectedInvoiceNo(invoice.invoiceNo)}
                    className={`cursor-pointer hover:bg-blue-50/50 ${selectedInvoice?.id === invoice.id ? "bg-blue-50" : ""}`}
                  >
                    <td className="px-4 py-3 font-mono text-xs font-semibold text-blue-600">{invoice.invoiceNo}</td>
                    <td className="px-4 py-3">
                      <div className="font-semibold text-slate-950">{invoice.customerName}</div>
                      <div className="font-mono text-xs text-slate-500">{invoice.contact}</div>
                    </td>
                    <td className="max-w-[320px] px-4 py-3 text-slate-600">
                      <div className="truncate" title={invoice.items.map(item => item.productName).join("、")}>
                        {invoice.items.map(item => item.productName).join("、")}
                      </div>
                    </td>
                    <td className="px-4 py-3 font-mono font-semibold text-slate-950">{invoice.totalCount}</td>
                    <td className="px-4 py-3 font-mono font-semibold text-slate-950">{fmt(invoice.totalAmount)}</td>
                    <td className="px-4 py-3 text-slate-600">{invoice.expressNo || "无需物流"}</td>
                    <td className="px-4 py-3">
                      <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-1 text-xs font-semibold text-amber-700">待出库</span>
                    </td>
                  </tr>
                ))}
                {filteredInvoices.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-4 py-10 text-center text-sm text-slate-500">暂无待出库销售单。</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center gap-2 text-base font-semibold text-slate-950">
            <ScanLine className="h-5 w-5 text-blue-600" />
            出库确认
          </div>

          {selectedInvoice ? (
            <div className="mt-4 space-y-4">
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                <div className="font-mono text-xs font-semibold text-blue-600">{selectedInvoice.invoiceNo}</div>
                <div className="mt-1 text-sm font-semibold text-slate-950">{selectedInvoice.customerName}</div>
                <div className="mt-1 text-xs text-slate-500">需核验 {expectedCount} 件，已扫码 {scannedCount} 件</div>
              </div>

              <div className="space-y-2">
                {selectedInvoice.items.map(item => {
                  const card = inventory.find(inv => inv.id === item.inventoryId);
                  const isScanned = scanCodes.some(code =>
                    code.toLowerCase() === item.inventoryId.toLowerCase() ||
                    code.toLowerCase() === item.sn.toLowerCase() ||
                    (!!card?.sn && code.toLowerCase() === card.sn.toLowerCase())
                  );
                  return (
                    <div key={item.inventoryId} className="rounded-xl border border-slate-200 p-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="truncate text-sm font-semibold text-slate-950">{item.productName}</div>
                          <div className="mt-1 font-mono text-xs text-slate-500">SN: {card?.sn || item.sn || "未记录"}</div>
                          <div className="mt-1 font-mono text-xs text-slate-500">库存ID: {item.inventoryId}</div>
                        </div>
                        {isScanned ? (
                          <CheckCircle className="h-5 w-5 shrink-0 text-emerald-600" />
                        ) : (
                          <PackageCheck className="h-5 w-5 shrink-0 text-slate-300" />
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>

              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-500">扫码内容</label>
                <textarea
                  value={scanText}
                  onChange={event => setScanText(event.target.value)}
                  rows={4}
                  placeholder="逐行扫描或粘贴库存ID / SN"
                  className="w-full rounded-xl border border-slate-200 p-3 font-mono text-sm text-slate-950 outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-500">出库经办人</label>
                <input
                  value={handler}
                  readOnly={lockedHandlerState.readOnly}
                  disabled={lockedHandlerState.disabled}
                  className="h-11 w-full cursor-not-allowed rounded-xl border border-slate-200 px-3 text-sm text-slate-950 opacity-80 outline-none"
                />
              </div>

              <div>
                <label className="mb-1 block text-xs font-semibold text-slate-500">备注</label>
                <input
                  value={remarks}
                  onChange={event => setRemarks(event.target.value)}
                  placeholder="如：顺丰已揽收 / 门店自提"
                  className="h-11 w-full rounded-xl border border-slate-200 px-3 text-sm text-slate-950 outline-none focus:border-blue-500 focus:ring-4 focus:ring-blue-100"
                />
              </div>

              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <button
                  onClick={() => handleConfirm(false)}
                  disabled={expectedCount === 0 || scannedCount < expectedCount}
                  className="h-11 rounded-xl bg-blue-600 text-sm font-semibold text-white transition hover:bg-blue-500 disabled:cursor-not-allowed disabled:bg-slate-300"
                >
                  扫码确认出库
                </button>
                <button
                  onClick={() => handleConfirm(true)}
                  className="h-11 rounded-xl border border-slate-200 text-sm font-semibold text-slate-700 transition hover:bg-slate-50"
                >
                  手动确认出库
                </button>
              </div>
            </div>
          ) : (
            <div className="mt-4 rounded-xl border border-dashed border-slate-200 p-8 text-center text-sm text-slate-500">
              选择一张待出库销售单后开始扫码。
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
