/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect, useMemo, useState } from "react";
import {
  ArrowDownLeft,
  ArrowRightLeft,
  ArrowUpRight,
  Download,
  Landmark,
  Plus,
  ReceiptText,
  Search,
  Save,
  Trash2,
  WalletCards
} from "lucide-react";
import { useStoreStateReturn } from "../utils/state";
import { getLockedHandlerFieldState } from "../utils/sessionUser";
import { AccountTransferRecord, PaymentInRecord, PaymentOutRecord, SettlementAccountType, SettlementBusinessType, SettlementDirection } from "../types";

interface SettlementFinanceProps {
  storeState: useStoreStateReturn;
  view: "accounts" | "ledger" | "payment_in" | "payment_out" | "transfer" | "reports";
}

const accountTypes: SettlementAccountType[] = ["现金", "微信", "支付宝", "银行卡", "闲鱼", "淘宝待结算", "对公账户", "老板个人账户", "员工备用金", "其他"];
const businessTypes: SettlementBusinessType[] = ["销售收款", "采购付款", "回收付款", "客户退款", "采购退款", "其他收入", "其他支出", "账户调拨", "员工提成", "运费", "维修费", "平台手续费"];

const money = (value: number) => `${Number(value || 0).toLocaleString()}元`;

function exportCsv(filename: string, rows: object[]) {
  if (!rows.length) return;
  const headers = Object.keys(rows[0] as Record<string, unknown>);
  const csv = [
    headers.join(","),
    ...rows.map(row => {
      const record = row as Record<string, unknown>;
      return headers.map(key => `"${String(record[key] ?? "").replace(/"/g, '""')}"`).join(",");
    })
  ].join("\n");
  const blob = new Blob([`\uFEFF${csv}`], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export default function SettlementFinance({ storeState, view }: SettlementFinanceProps) {
  const {
    settlementAccounts,
    settlementLedger,
    paymentInRecords,
    paymentOutRecords,
    accountTransfers,
    salesInvoices,
    purchaseInvoices,
    createSettlementAccount,
    createPaymentIn,
    updatePaymentIn,
    deletePaymentIn,
    createPaymentOut,
    updatePaymentOut,
    deletePaymentOut,
    createAccountTransfer,
    updateAccountTransfer,
    deleteAccountTransfer,
    getAccountSummary,
    currentRole,
    currentUser
  } = storeState;
  const lockedHandlerState = getLockedHandlerFieldState(currentUser, currentRole);
  const defaultHandlerName = lockedHandlerState.value;

  const [accountName, setAccountName] = useState("");
  const [accountType, setAccountType] = useState<SettlementAccountType>("微信");
  const [accountOwner, setAccountOwner] = useState("老板");
  const [platform, setPlatform] = useState("微信支付");
  const [openingBalance, setOpeningBalance] = useState(0);
  const [allowNegative, setAllowNegative] = useState(true);
  const [accountRemarks, setAccountRemarks] = useState("");

  const [selectedAccountId, setSelectedAccountId] = useState(settlementAccounts[0]?.id || "");
  const [handler, setHandler] = useState(defaultHandlerName);
  const [customerName, setCustomerName] = useState("");
  const [supplierName, setSupplierName] = useState("");
  const [paymentAmount, setPaymentAmount] = useState(0);
  const [paymentMethod, setPaymentMethod] = useState("微信");
  const [relatedSale, setRelatedSale] = useState("");
  const [relatedPurchase, setRelatedPurchase] = useState("");
  const [paymentRemarks, setPaymentRemarks] = useState("");
  const [paymentOutBusinessType, setPaymentOutBusinessType] = useState<SettlementBusinessType>("采购付款");

  const [toAccountId, setToAccountId] = useState(settlementAccounts[1]?.id || settlementAccounts[0]?.id || "");
  const [transferAmount, setTransferAmount] = useState(1000);
  const [transferFee, setTransferFee] = useState(0);
  const [editingFinance, setEditingFinance] = useState<{ kind: "payment_in" | "payment_out" | "transfer"; id: string } | null>(null);

  const [filterAccount, setFilterAccount] = useState("all");
  const [filterHandler, setFilterHandler] = useState("");
  const [filterBusiness, setFilterBusiness] = useState("all");
  const [filterDirection, setFilterDirection] = useState("all");
  const [filterDoc, setFilterDoc] = useState("");
  const [filterKeyword, setFilterKeyword] = useState("");
  const [transferAccountFilter, setTransferAccountFilter] = useState("all");
  const [transferHandlerFilter, setTransferHandlerFilter] = useState("");
  const [transferKeyword, setTransferKeyword] = useState("");

  const summary = getAccountSummary({
    accountId: filterAccount === "all" ? undefined : filterAccount,
    handler: filterHandler || undefined
  });

  useEffect(() => {
    setHandler(defaultHandlerName);
  }, [defaultHandlerName]);

  const filteredLedger = useMemo(() => {
    return settlementLedger.filter(item => {
      const matchAccount = filterAccount === "all" || item.accountId === filterAccount;
      const matchHandler = !filterHandler || item.handler.includes(filterHandler);
      const matchBusiness = filterBusiness === "all" || item.businessType === filterBusiness;
      const matchDirection = filterDirection === "all" || item.direction === filterDirection;
      const matchDoc = !filterDoc || item.relatedDocNo?.includes(filterDoc);
      const matchKeyword = !filterKeyword ||
        item.customerName?.includes(filterKeyword) ||
        item.supplierName?.includes(filterKeyword) ||
        item.remarks?.includes(filterKeyword) ||
        item.accountName.includes(filterKeyword);
      return matchAccount && matchHandler && matchBusiness && matchDirection && matchDoc && matchKeyword;
    });
  }, [settlementLedger, filterAccount, filterHandler, filterBusiness, filterDirection, filterDoc, filterKeyword]);

  const selectedAccount = settlementAccounts.find(item => item.id === selectedAccountId) || settlementAccounts[0];

  const filteredTransfers = useMemo(() => {
    const keyword = transferKeyword.trim();
    const handlerKeyword = transferHandlerFilter.trim();
    return accountTransfers.filter(record => {
      const matchAccount =
        transferAccountFilter === "all" ||
        record.fromAccountId === transferAccountFilter ||
        record.toAccountId === transferAccountFilter;
      const matchHandler = !handlerKeyword || record.handler.includes(handlerKeyword);
      const matchKeyword =
        !keyword ||
        record.id.includes(keyword) ||
        record.time.includes(keyword) ||
        record.fromAccountName.includes(keyword) ||
        record.toAccountName.includes(keyword) ||
        record.remarks?.includes(keyword);
      return matchAccount && matchHandler && matchKeyword;
    });
  }, [accountTransfers, transferAccountFilter, transferHandlerFilter, transferKeyword]);

  const handleCreateAccount = () => {
    createSettlementAccount({
      name: accountName,
      type: accountType,
      owner: accountOwner,
      platform,
      balance: openingBalance,
      availableBalance: openingBalance,
      frozenAmount: 0,
      enabled: true,
      allowNegative,
      remarks: accountRemarks
    });
    alert("结算账户已提交创建。");
  };

  const handlePaymentIn = () => {
    if (!selectedAccount) return alert("请先选择收款账户。");
    const payload = {
      customerName,
      accountId: selectedAccount.id,
      amount: paymentAmount,
      handler,
      paymentMethod,
      relatedDocType: relatedSale ? "销售单" : undefined,
      relatedDocNo: relatedSale || undefined,
      time: new Date().toISOString().replace("T", " ").substring(0, 16),
      remarks: paymentRemarks
    };
    if (editingFinance?.kind === "payment_in") {
      updatePaymentIn(editingFinance.id, payload);
      setEditingFinance(null);
      alert("收款单已保存修改。");
    } else {
      createPaymentIn(payload);
      alert("收款单已提交，账户流水和财务流水会自动生成。");
    }
  };

  const handlePaymentOut = () => {
    if (!selectedAccount) return alert("请先选择付款账户。");
    const payload = {
      supplierName,
      accountId: selectedAccount.id,
      amount: paymentAmount,
      handler,
      paymentMethod,
      businessType: paymentOutBusinessType,
      relatedDocType: relatedPurchase ? "采购单" : undefined,
      relatedDocNo: relatedPurchase || undefined,
      time: new Date().toISOString().replace("T", " ").substring(0, 16),
      remarks: paymentRemarks
    };
    if (editingFinance?.kind === "payment_out") {
      updatePaymentOut(editingFinance.id, payload);
      setEditingFinance(null);
      alert("付款单已保存修改。");
    } else {
      createPaymentOut(payload);
      alert("付款单已提交，账户允许负余额，账户流水和财务流水会自动生成。");
    }
  };

  const handleTransfer = () => {
    if (!selectedAccount || !toAccountId) return alert("请选择转出和转入账户。");
    if (selectedAccount.id === toAccountId) return alert("转出账户和转入账户不能相同。");
    const payload = {
      fromAccountId: selectedAccount.id,
      toAccountId,
      amount: transferAmount,
      fee: transferFee,
      receivedAmount: Math.max(0, transferAmount - transferFee),
      handler,
      time: new Date().toISOString().replace("T", " ").substring(0, 16),
      remarks: paymentRemarks
    };
    if (editingFinance?.kind === "transfer") {
      updateAccountTransfer(editingFinance.id, payload);
      setEditingFinance(null);
      alert("资金调拨已保存修改。");
    } else {
      createAccountTransfer(payload);
      alert("资金调拨已提交，将生成转出和转入两条账户流水。");
    }
  };

  const editPaymentIn = (record: PaymentInRecord) => {
    setEditingFinance({ kind: "payment_in", id: record.id });
    setSelectedAccountId(record.accountId);
    setCustomerName(record.customerName);
    setPaymentAmount(record.amount);
    setHandler(defaultHandlerName);
    setPaymentMethod(record.paymentMethod);
    setRelatedSale(record.relatedDocNo || "");
    setPaymentRemarks(record.remarks || "");
  };

  const editPaymentOut = (record: PaymentOutRecord) => {
    setEditingFinance({ kind: "payment_out", id: record.id });
    setSelectedAccountId(record.accountId);
    setSupplierName(record.supplierName || record.customerName || "");
    setPaymentAmount(record.amount);
    setHandler(defaultHandlerName);
    setPaymentMethod(record.paymentMethod);
    setRelatedPurchase(record.relatedDocNo || "");
    setPaymentOutBusinessType(record.businessType);
    setPaymentRemarks(record.remarks || "");
  };

  const editTransfer = (record: AccountTransferRecord) => {
    setEditingFinance({ kind: "transfer", id: record.id });
    setSelectedAccountId(record.fromAccountId);
    setToAccountId(record.toAccountId);
    setTransferAmount(record.amount);
    setTransferFee(record.fee);
    setHandler(defaultHandlerName);
    setPaymentRemarks(record.remarks || "");
  };

  const confirmDeleteFinance = (kind: "payment_in" | "payment_out" | "transfer", id: string) => {
    const label = kind === "payment_in" ? "收款单" : kind === "payment_out" ? "付款单" : "资金调拨单";
    if (!window.confirm(`确认删除${label} ${id}？系统会同步反向修正账户余额和流水。`)) return;
    try {
      if (kind === "payment_in") deletePaymentIn(id);
      if (kind === "payment_out") deletePaymentOut(id);
      if (kind === "transfer") deleteAccountTransfer(id);
      if (editingFinance?.id === id) setEditingFinance(null);
      alert(`${label}已删除。`);
    } catch (error) {
      alert(error instanceof Error ? error.message : "删除失败，请稍后再试。");
    }
  };

  const renderFilters = () => (
    <div className="grid grid-cols-1 md:grid-cols-6 gap-2 bg-slate-900 border border-slate-800 rounded-lg p-3">
      <select value={filterAccount} onChange={e => setFilterAccount(e.target.value)} className="bg-slate-950 border border-slate-800 text-xs text-slate-200 p-2 rounded">
        <option value="all">全部账户</option>
        {settlementAccounts.map(account => <option key={account.id} value={account.id}>{account.name}</option>)}
      </select>
      <input value={filterHandler} onChange={e => setFilterHandler(e.target.value)} placeholder="经办人" className="bg-slate-950 border border-slate-800 text-xs text-slate-200 p-2 rounded" />
      <select value={filterBusiness} onChange={e => setFilterBusiness(e.target.value)} className="bg-slate-950 border border-slate-800 text-xs text-slate-200 p-2 rounded">
        <option value="all">全部业务</option>
        {businessTypes.map(type => <option key={type} value={type}>{type}</option>)}
      </select>
      <select value={filterDirection} onChange={e => setFilterDirection(e.target.value)} className="bg-slate-950 border border-slate-800 text-xs text-slate-200 p-2 rounded">
        <option value="all">收入/支出</option>
        {(["收入", "支出", "转入", "转出", "冲销"] as SettlementDirection[]).map(direction => <option key={direction} value={direction}>{direction}</option>)}
      </select>
      <input value={filterDoc} onChange={e => setFilterDoc(e.target.value)} placeholder="关联单据" className="bg-slate-950 border border-slate-800 text-xs text-slate-200 p-2 rounded" />
      <div className="relative">
        <input value={filterKeyword} onChange={e => setFilterKeyword(e.target.value)} placeholder="客户/供应商/备注" className="w-full bg-slate-950 border border-slate-800 text-xs text-slate-200 p-2 pl-8 rounded" />
        <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-slate-500" />
      </div>
    </div>
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 bg-slate-900 border border-slate-800 rounded-xl p-5">
        <div>
          <h2 className="text-base font-black text-slate-100 flex items-center gap-2">
            <WalletCards className="w-5 h-5 text-emerald-400" />
            结算账户资金中枢
          </h2>
          <p className="text-xs text-slate-400 mt-1">统一记录谁收款、谁付款、使用哪个账户、关联哪张业务单据。</p>
        </div>
        <button
          onClick={() => exportCsv("settlement-ledger.csv", filteredLedger)}
          className="h-9 px-3 bg-slate-950 border border-slate-700 hover:border-cyan-500 text-xs text-slate-200 rounded flex items-center gap-2"
        >
          <Download className="w-4 h-4" /> 导出 Excel
        </button>
      </div>

      {view === "accounts" && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            {summary.accounts.map(account => (
              <div key={account.id} className="bg-slate-900 border border-slate-800 rounded-lg p-4 space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <div className="text-sm font-black text-slate-100">{account.name}</div>
                    <div className="text-[10px] text-slate-500 mt-1">{account.type} / {account.owner} / {account.platform}</div>
                  </div>
                  <span className={`text-[10px] px-2 py-0.5 rounded ${account.enabled ? "bg-emerald-500/10 text-emerald-400" : "bg-slate-800 text-slate-500"}`}>{account.enabled ? "启用" : "停用"}</span>
                </div>
                <div className={`text-2xl font-black font-mono ${account.balance < 0 ? "text-rose-400" : "text-emerald-400"}`}>{money(account.balance)}</div>
                <div className="grid grid-cols-2 gap-2 text-[10px] text-slate-400">
                  <span>今日收: <b className="text-emerald-400">{money(account.todayIncome)}</b></span>
                  <span>今日付: <b className="text-rose-400">{money(account.todayExpense)}</b></span>
                  <span>本月收: <b className="text-slate-200">{money(account.monthIncome)}</b></span>
                  <span>本月付: <b className="text-slate-200">{money(account.monthExpense)}</b></span>
                </div>
                <div className="text-[10px] text-slate-500">最后变动: {account.lastChangeTime || "暂无"}</div>
              </div>
            ))}
          </div>

          <div className="bg-slate-900 border border-slate-800 rounded-lg p-4">
            <h3 className="text-xs font-bold text-slate-200 mb-3 flex items-center gap-2"><Plus className="w-4 h-4 text-cyan-400" />新增结算账户</h3>
            <div className="grid grid-cols-1 md:grid-cols-6 gap-3">
              <input value={accountName} onChange={e => setAccountName(e.target.value)} className="bg-slate-950 border border-slate-800 text-xs text-slate-200 p-2 rounded" placeholder="账户名称" />
              <select value={accountType} onChange={e => setAccountType(e.target.value as SettlementAccountType)} className="bg-slate-950 border border-slate-800 text-xs text-slate-200 p-2 rounded">{accountTypes.map(type => <option key={type}>{type}</option>)}</select>
              <input value={accountOwner} onChange={e => setAccountOwner(e.target.value)} className="bg-slate-950 border border-slate-800 text-xs text-slate-200 p-2 rounded" placeholder="归属人" />
              <input value={platform} onChange={e => setPlatform(e.target.value)} className="bg-slate-950 border border-slate-800 text-xs text-slate-200 p-2 rounded" placeholder="平台" />
              <input type="number" value={openingBalance} onChange={e => setOpeningBalance(Number(e.target.value))} className="bg-slate-950 border border-slate-800 text-xs text-slate-200 p-2 rounded" placeholder="当前余额" />
              <label className="flex items-center gap-2 text-xs text-slate-300"><input type="checkbox" checked={allowNegative} onChange={e => setAllowNegative(e.target.checked)} />允许负数</label>
              <input value={accountRemarks} onChange={e => setAccountRemarks(e.target.value)} className="md:col-span-5 bg-slate-950 border border-slate-800 text-xs text-slate-200 p-2 rounded" placeholder="备注" />
              <button onClick={handleCreateAccount} className="bg-cyan-500 hover:bg-cyan-400 text-slate-950 text-xs font-black rounded">新增账户</button>
            </div>
          </div>
        </div>
      )}

      {view === "ledger" && (
        <div className="space-y-3">
          {renderFilters()}
          <div className="bg-slate-900 border border-slate-800 rounded-lg overflow-x-auto">
            <table className="w-full min-w-[980px] text-left text-xs">
              <thead className="bg-slate-950 text-slate-400 font-mono">
                <tr><th className="p-3">时间</th><th className="p-3">结算账户</th><th className="p-3">业务类型</th><th className="p-3 text-right">收入</th><th className="p-3 text-right">支出</th><th className="p-3 text-right">变动后余额</th><th className="p-3">经办人</th><th className="p-3">关联单据</th><th className="p-3">备注</th></tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {filteredLedger.map(item => (
                  <tr key={item.id} className="hover:bg-slate-800/30">
                    <td className="p-3 text-slate-400">{item.time}</td><td className="p-3 text-slate-200 font-bold">{item.accountName}</td><td className="p-3 text-cyan-300">{item.businessType}</td><td className="p-3 text-right text-emerald-400 font-mono">{item.incomeAmount ? money(item.incomeAmount) : "-"}</td><td className="p-3 text-right text-rose-400 font-mono">{item.expenseAmount ? money(item.expenseAmount) : "-"}</td><td className={`p-3 text-right font-mono ${item.afterBalance < 0 ? "text-rose-400" : "text-slate-200"}`}>{money(item.afterBalance)}</td><td className="p-3 text-slate-300">{item.handler}</td><td className="p-3 text-slate-400">{item.relatedDocType || "-"} {item.relatedDocNo || ""}</td><td className="p-3 text-slate-500">{item.remarks || "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {(view === "payment_in" || view === "payment_out" || view === "transfer") && (
        <div className="bg-slate-900 border border-slate-800 rounded-lg p-5 space-y-4">
          <h3 className="text-sm font-black text-slate-100 flex items-center gap-2">
            {view === "payment_in" ? <ArrowDownLeft className="w-5 h-5 text-emerald-400" /> : view === "payment_out" ? <ArrowUpRight className="w-5 h-5 text-rose-400" /> : <ArrowRightLeft className="w-5 h-5 text-cyan-400" />}
            {view === "payment_in" ? "新增收款单" : view === "payment_out" ? "新增付款单" : "资金调拨"}
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <select value={selectedAccountId} onChange={e => setSelectedAccountId(e.target.value)} className="bg-slate-950 border border-slate-800 text-xs text-slate-200 p-2.5 rounded">
              {settlementAccounts.map(account => <option key={account.id} value={account.id}>{view === "transfer" ? "转出：" : ""}{account.name} ({money(account.balance)})</option>)}
            </select>
            {view === "transfer" && (
              <select value={toAccountId} onChange={e => setToAccountId(e.target.value)} className="bg-slate-950 border border-slate-800 text-xs text-slate-200 p-2.5 rounded">
                {settlementAccounts.map(account => <option key={account.id} value={account.id}>转入：{account.name} ({money(account.balance)})</option>)}
              </select>
            )}
            {view === "payment_in" && <input value={customerName} onChange={e => setCustomerName(e.target.value)} className="bg-slate-950 border border-slate-800 text-xs text-slate-200 p-2.5 rounded" placeholder="客户" />}
            {view === "payment_out" && <input value={supplierName} onChange={e => setSupplierName(e.target.value)} className="bg-slate-950 border border-slate-800 text-xs text-slate-200 p-2.5 rounded" placeholder="供应商 / 客户" />}
            <input type="number" value={view === "transfer" ? transferAmount : paymentAmount} onChange={e => view === "transfer" ? setTransferAmount(Number(e.target.value)) : setPaymentAmount(Number(e.target.value))} className="bg-slate-950 border border-slate-800 text-xs text-slate-200 p-2.5 rounded" placeholder="金额" />
            {view === "transfer" && <input type="number" value={transferFee} onChange={e => setTransferFee(Number(e.target.value))} className="bg-slate-950 border border-slate-800 text-xs text-slate-200 p-2.5 rounded" placeholder="手续费" />}
            <input value={handler} readOnly={lockedHandlerState.readOnly} disabled={lockedHandlerState.disabled} className="bg-slate-950 border border-slate-800 text-xs text-slate-200 p-2.5 rounded cursor-not-allowed opacity-80" placeholder="经办人" />
            {view !== "transfer" && <input value={paymentMethod} onChange={e => setPaymentMethod(e.target.value)} className="bg-slate-950 border border-slate-800 text-xs text-slate-200 p-2.5 rounded" placeholder="收付款方式" />}
            {view === "payment_in" && <select value={relatedSale} onChange={e => setRelatedSale(e.target.value)} className="bg-slate-950 border border-slate-800 text-xs text-slate-200 p-2.5 rounded"><option value="">不关联销售单</option>{salesInvoices.map(invoice => <option key={invoice.id} value={invoice.invoiceNo}>{invoice.invoiceNo} / {invoice.customerName}</option>)}</select>}
            {view === "payment_out" && <select value={relatedPurchase} onChange={e => setRelatedPurchase(e.target.value)} className="bg-slate-950 border border-slate-800 text-xs text-slate-200 p-2.5 rounded"><option value="">不关联采购单</option>{purchaseInvoices.map(invoice => <option key={invoice.id} value={invoice.invoiceNo}>{invoice.invoiceNo} / {invoice.supplierName}</option>)}</select>}
            {view === "payment_out" && <select value={paymentOutBusinessType} onChange={e => setPaymentOutBusinessType(e.target.value as SettlementBusinessType)} className="bg-slate-950 border border-slate-800 text-xs text-slate-200 p-2.5 rounded">{businessTypes.filter(type => !type.includes("收款")).map(type => <option key={type}>{type}</option>)}</select>}
            <input value={paymentRemarks} onChange={e => setPaymentRemarks(e.target.value)} className="md:col-span-3 bg-slate-950 border border-slate-800 text-xs text-slate-200 p-2.5 rounded" placeholder="备注" />
            <button onClick={view === "payment_in" ? handlePaymentIn : view === "payment_out" ? handlePaymentOut : handleTransfer} className="h-10 bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-black rounded flex items-center justify-center gap-1.5">
              {editingFinance ? <Save className="w-4 h-4" /> : null}
              {editingFinance ? "保存修改" : "提交"}
            </button>
          </div>
          {selectedAccount && selectedAccount.balance < 0 && <div className="text-xs text-rose-400 bg-rose-500/10 border border-rose-500/20 p-3 rounded">当前账户为负余额，系统允许继续付款，但会在账户列表中红色提示。</div>}
          {editingFinance && (
            <button onClick={() => setEditingFinance(null)} className="text-xs text-slate-400 hover:text-slate-200 underline">
              取消编辑，恢复新增模式
            </button>
          )}

          <div className="border-t border-slate-800 pt-4 space-y-2">
            <h4 className="text-xs font-black text-slate-300">{view === "payment_in" ? "收款单记录" : view === "payment_out" ? "付款单记录" : "资金调拨记录"}</h4>
            <div className="space-y-2 max-h-80 overflow-y-auto custom-scrollbar">
              {view === "payment_in" && paymentInRecords.map(record => (
                <div key={record.id} className="bg-slate-950 border border-slate-800 rounded-lg p-3 text-xs flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-slate-100 font-black">{record.customerName} / {money(record.amount)}</div>
                    <div className="text-slate-500 mt-1">{record.accountName} · {record.handler} · {record.relatedDocNo || "未关联单据"}</div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button onClick={() => editPaymentIn(record)} className="text-amber-300 hover:underline font-bold">编辑</button>
                    <button onClick={() => confirmDeleteFinance("payment_in", record.id)} className="text-rose-300 hover:underline font-bold inline-flex items-center gap-1">
                      <Trash2 className="w-3.5 h-3.5" /> 删除
                    </button>
                  </div>
                </div>
              ))}
              {view === "payment_out" && paymentOutRecords.map(record => (
                <div key={record.id} className="bg-slate-950 border border-slate-800 rounded-lg p-3 text-xs flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="text-slate-100 font-black">{record.supplierName || record.customerName || "付款对象"} / {money(record.amount)}</div>
                    <div className="text-slate-500 mt-1">{record.accountName} · {record.handler} · {record.relatedDocNo || "未关联单据"}</div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button onClick={() => editPaymentOut(record)} className="text-amber-300 hover:underline font-bold">编辑</button>
                    <button onClick={() => confirmDeleteFinance("payment_out", record.id)} className="text-rose-300 hover:underline font-bold inline-flex items-center gap-1">
                      <Trash2 className="w-3.5 h-3.5" /> 删除
                    </button>
                  </div>
                </div>
              ))}
              {view === "transfer" && (
                <div className="space-y-3">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                    <select
                      value={transferAccountFilter}
                      onChange={e => setTransferAccountFilter(e.target.value)}
                      className="bg-slate-950 border border-slate-800 text-xs text-slate-200 p-2 rounded"
                    >
                      <option value="all">全部调拨账户</option>
                      {settlementAccounts.map(account => (
                        <option key={account.id} value={account.id}>{account.name}</option>
                      ))}
                    </select>
                    <input
                      value={transferHandlerFilter}
                      onChange={e => setTransferHandlerFilter(e.target.value)}
                      placeholder="经办人筛选"
                      className="bg-slate-950 border border-slate-800 text-xs text-slate-200 p-2 rounded"
                    />
                    <div className="relative">
                      <input
                        value={transferKeyword}
                        onChange={e => setTransferKeyword(e.target.value)}
                        placeholder="调拨单号 / 时间 / 备注"
                        className="w-full bg-slate-950 border border-slate-800 text-xs text-slate-200 p-2 pl-8 rounded"
                      />
                      <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-slate-500" />
                    </div>
                  </div>
                  <div className="overflow-x-auto border border-slate-800 rounded-lg">
                    <table className="w-full min-w-[980px] text-left text-xs">
                      <thead className="bg-slate-950 text-slate-400 font-mono">
                        <tr>
                          <th className="p-3">调拨单号</th>
                          <th className="p-3">调拨时间</th>
                          <th className="p-3">转出账户</th>
                          <th className="p-3">转入账户</th>
                          <th className="p-3 text-right">调拨金额</th>
                          <th className="p-3 text-right">手续费</th>
                          <th className="p-3 text-right">实际到账</th>
                          <th className="p-3">经办人</th>
                          <th className="p-3">备注</th>
                          <th className="p-3 text-right">操作</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800">
                        {filteredTransfers.map(record => (
                          <tr key={record.id} className="hover:bg-slate-800/30">
                            <td className="p-3 text-cyan-300 font-mono font-bold">{record.id}</td>
                            <td className="p-3 text-slate-400">{record.time}</td>
                            <td className="p-3 text-slate-200 font-bold">{record.fromAccountName}</td>
                            <td className="p-3 text-slate-200 font-bold">{record.toAccountName}</td>
                            <td className="p-3 text-right text-slate-100 font-mono">{money(record.amount)}</td>
                            <td className="p-3 text-right text-rose-300 font-mono">{money(record.fee)}</td>
                            <td className="p-3 text-right text-emerald-300 font-mono">{money(record.receivedAmount)}</td>
                            <td className="p-3 text-slate-300">{record.handler}</td>
                            <td className="p-3 text-slate-500">{record.remarks || "-"}</td>
                            <td className="p-3 text-right">
                              <div className="inline-flex items-center justify-end gap-2">
                                <button onClick={() => editTransfer(record)} className="text-amber-300 hover:underline font-bold">编辑</button>
                                <button onClick={() => confirmDeleteFinance("transfer", record.id)} className="text-rose-300 hover:underline font-bold inline-flex items-center gap-1">
                                  <Trash2 className="w-3.5 h-3.5" /> 删除
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                        {filteredTransfers.length === 0 && (
                          <tr>
                            <td className="p-5 text-center text-slate-500" colSpan={10}>暂无符合条件的资金调拨单据</td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {view === "reports" && (
        <div className="space-y-4">
          {renderFilters()}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="bg-slate-900 border border-slate-800 rounded-lg p-4"><Landmark className="w-5 h-5 text-cyan-400 mb-3" /><div className="text-xs text-slate-500">账户总余额</div><div className="text-xl font-black text-slate-100 font-mono">{money(summary.totals.balance)}</div></div>
            <div className="bg-slate-900 border border-slate-800 rounded-lg p-4"><ArrowDownLeft className="w-5 h-5 text-emerald-400 mb-3" /><div className="text-xs text-slate-500">筛选收入</div><div className="text-xl font-black text-emerald-400 font-mono">{money(summary.totals.income)}</div></div>
            <div className="bg-slate-900 border border-slate-800 rounded-lg p-4"><ArrowUpRight className="w-5 h-5 text-rose-400 mb-3" /><div className="text-xs text-slate-500">筛选支出</div><div className="text-xl font-black text-rose-400 font-mono">{money(summary.totals.expense)}</div></div>
            <div className="bg-slate-900 border border-slate-800 rounded-lg p-4"><ReceiptText className="w-5 h-5 text-amber-400 mb-3" /><div className="text-xs text-slate-500">流水笔数</div><div className="text-xl font-black text-slate-100 font-mono">{summary.ledger.length}</div></div>
          </div>
          <div className="bg-slate-900 border border-slate-800 rounded-lg overflow-x-auto">
            <table className="w-full min-w-[680px] text-left text-xs">
              <thead className="bg-slate-950 text-slate-400"><tr><th className="p-3">经办人</th><th className="p-3 text-right">收款金额</th><th className="p-3 text-right">付款金额</th><th className="p-3 text-right">收款笔数</th><th className="p-3 text-right">付款笔数</th></tr></thead>
              <tbody className="divide-y divide-slate-800">
                {summary.employeeSummary.map(item => <tr key={item.handler}><td className="p-3 text-slate-200 font-bold">{item.handler}</td><td className="p-3 text-right text-emerald-400 font-mono">{money(item.receivedAmount)}</td><td className="p-3 text-right text-rose-400 font-mono">{money(item.paidAmount)}</td><td className="p-3 text-right text-slate-300">{item.incomeCount}</td><td className="p-3 text-right text-slate-300">{item.expenseCount}</td></tr>)}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
