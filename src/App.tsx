/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useMemo } from "react";
import {
  Clock,
  Bell,
  Sparkles,
  Info,
  Activity,
} from "lucide-react";
import { useStoreState } from "./utils/state";
import { CardInventory } from "./types";

// Core views imports
import Sidebar from "./components/Sidebar";
import Dashboard from "./components/Dashboard";
import ProductLibrary from "./components/ProductLibrary";
import PurchaseInvoice from "./components/PurchaseInvoice";
import InventoryManager from "./components/InventoryManager";
import InspectionManager from "./components/InspectionManager";
import SalesManager from "./components/SalesManager";
import SalesOutboundManager from "./components/SalesOutboundManager";
import AssemblyManager from "./components/AssemblyManager";
import FinanceManager from "./components/FinanceManager";
import SettlementFinance from "./components/SettlementFinance";
import MarketQuotes from "./components/MarketQuotes";
import AftersalesManager from "./components/AftersalesManager";
import PartnerManager from "./components/PartnerManager";
import CrmManager from "./components/CrmManager";
import AdminSettings from "./components/AdminSettings";
import InvoiceList from "./components/InvoiceList";
import LoginScreen from "./components/LoginScreen";
import {
  APP_VERSION,
  DISPLAY_APP_VERSION,
  VERSION_NOTICE_STORAGE_KEY,
  VERSION_UPDATE_NOTES,
  getVersionNoticeState
} from "./utils/version";

export default function App() {
  const storeState = useStoreState();
  const { currentRole, setRole, permissions, currentUser, logout } = storeState;

  // Active routing Tab
  const [currentTab, setCurrentTab] = useState<string>("dashboard");
  const [isVersionNoticeOpen, setIsVersionNoticeOpen] = useState(false);

  // Realtime Clock states
  const [timeStr, setTimeStr] = useState("");

  // Target card pointer forwarded from dashboard click events ("穿透跳转")
  const [preSelectedCard, setPreSelectedCard] = useState<CardInventory | null>(null);

  // Tick clock
  useEffect(() => {
    const updateTime = () => {
      const d = new Date();
      const yr = d.getFullYear();
      const mo = String(d.getMonth() + 1).padStart(2, "0");
      const dy = String(d.getDate()).padStart(2, "0");
      const hr = String(d.getHours()).padStart(2, "0");
      const mn = String(d.getMinutes()).padStart(2, "0");
      const sc = String(d.getSeconds()).padStart(2, "0");
      setTimeStr(`${yr}-${mo}-${dy} ${hr}:${mn}:${sc} 北京时间`);
    };

    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    try {
      const seenVersion = localStorage.getItem(VERSION_NOTICE_STORAGE_KEY);
      setIsVersionNoticeOpen(getVersionNoticeState(seenVersion).shouldShow);
    } catch {
      setIsVersionNoticeOpen(true);
    }
  }, []);

  const closeVersionNotice = () => {
    try {
      localStorage.setItem(VERSION_NOTICE_STORAGE_KEY, APP_VERSION);
    } catch {
      // Ignore storage failures; the notice can still be dismissed for this session.
    }
    setIsVersionNoticeOpen(false);
  };

  // Allowed menus depending on role mapping
  const allowedMenus = useMemo(() => {
    return permissions.allowedMenus?.length ? permissions.allowedMenus : ["dashboard"];
  }, [permissions.allowedMenus]);

  // Triggers forwarded from Dashboard warnings ("点击穿透检测")
  const handleInspectCardFromDashboard = (card: CardInventory) => {
    setPreSelectedCard(card);
    setCurrentTab("inventory");
  };

  // Helper title for active viewport
  const getPageTitleInfo = () => {
    switch (currentTab) {
      case "dashboard":
        return { title: "经营概览", desc: "查看今日进货、销售、库存和资金表现。" };
      case "products":
        return { title: "商品库", desc: "管理显卡与配件模板、参考价格和常用型号。" };
      case "purchase_add":
        return { title: "进货与回收", desc: "建立单卡档案，记录来源、成本、付款账户与库存状态。" };
      case "purchase_list":
        return { title: "进货单据", desc: "查看、编辑和核对进货回收记录。" };
      case "inspections":
        return { title: "检测录入", desc: "记录烤机、外观、接口和质检结论。" };
      case "inventory":
        return { title: "单卡库存", desc: "追踪每张显卡的来源、状态、库位和标签。" };
      case "assembly":
        return { title: "组装拆卸", desc: "记录拆前 SN、拆后配件 SN 和组装成品 SN。" };
      case "sales_add":
        return { title: "销售开单", desc: "选择库存卡，登记客户、收款账户和发货信息。" };
      case "sales_outbound":
        return { title: "销售出库", desc: "核验销售单商品，扫码或手动确认后完成出库。" };
      case "sales_list":
        return { title: "销售单据", desc: "查看、编辑和核对销售出库记录。" };
      case "customers":
      case "vendors":
        return { title: "往来档案", desc: "管理个人客户和同行列表，区分买卖身份与交易表现。" };
      case "crm":
        return { title: "CRM 客户", desc: "管理客户线索、跟进记录、需求预算和成交阶段。" };
      case "finance":
        return { title: "财务流水", desc: "累计经营收入与成本支出，跟踪未结清尾款和账期对账。" };
      case "settlement_accounts":
        return { title: "结算账户", desc: "微信、支付宝、现金、银行卡、备用金等账户余额统一管理。" };
      case "settlement_ledger":
        return { title: "账户流水", desc: "逐笔追踪账户收入、支出、调拨和关联单据。" };
      case "payment_in":
        return { title: "收款单", desc: "登记客户收款、收款账户、经办人及关联销售单。" };
      case "payment_out":
        return { title: "付款单", desc: "登记供应商付款、付款账户、经办人及关联采购单。" };
      case "account_transfer":
        return { title: "资金调拨", desc: "支持微信、支付宝、银行卡等结算账户之间转账。" };
      case "finance_reports":
        return { title: "结算报表", desc: "按账户、经办人、客户、供应商筛选收入支出并导出。" };
      case "quotes":
        return { title: "行情参考", desc: "汇总平台行情与成交价格，辅助库存定价。" };
      case "aftersales":
        return { title: "售后维护", desc: "记录外观、维修痕迹、检测结果和售后处理。" };
      case "permissions":
      case "logs":
        return { title: "权限与日志", desc: "管理账号权限、敏感数据显示和操作记录。" };
      default:
        return { title: "成都显卡一号店", desc: "显卡进销存与财务结算管理。" };
    }
  };

  const activePageInfo = getPageTitleInfo();

  if (!currentUser) {
    return <LoginScreen storeState={storeState} />;
  }

  return (
    <div className="flex flex-col md:flex-row bg-slate-950 text-slate-100 min-h-screen font-sans">
      {/* PERSISTENT SIDEBAR */}
      <Sidebar
        currentTab={currentTab}
        setTab={setCurrentTab}
        currentRole={currentRole}
        setRole={setRole}
        allowedMenus={allowedMenus}
        currentUser={currentUser}
        onLogout={logout}
      />

      {isVersionNoticeOpen && (
        <div className="fixed inset-0 z-80 bg-slate-950/40 backdrop-blur-sm flex items-end sm:items-center justify-center p-3 sm:p-4">
          <div className="w-full max-w-md max-h-[calc(100dvh-24px)] sm:max-h-[calc(100vh-48px)] bg-white border border-slate-200 rounded-2xl shadow-2xl shadow-slate-900/15 overflow-hidden flex flex-col">
            <div className="p-4 sm:p-5 border-b border-slate-200 flex items-start gap-3 shrink-0">
              <div className="w-10 h-10 rounded-xl bg-blue-50 border border-blue-100 flex items-center justify-center shrink-0">
                <Bell className="w-5 h-5 text-blue-600" />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2 text-[10px] font-mono text-blue-600 font-bold">
                  <Sparkles className="w-3 h-3" />
                  <span>系统版本更新</span>
                </div>
                <h2 className="text-lg font-black text-slate-950 mt-1">
                  已升级到 {DISPLAY_APP_VERSION}
                </h2>
                <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                  本次更新锁定经办人、清理收付款字段文案，并继续优化单据责任追踪。
                </p>
              </div>
            </div>

            <div className="p-4 sm:p-5 space-y-3 overflow-y-auto custom-scrollbar">
              {VERSION_UPDATE_NOTES.map(note => (
                <div key={note} className="flex gap-2 text-xs text-slate-600 leading-relaxed">
                  <Info className="w-3.5 h-3.5 text-blue-500 mt-0.5 shrink-0" />
                  <span>{note}</span>
                </div>
              ))}
              <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 text-[11px] text-slate-500 font-mono">
                当前版本号：{DISPLAY_APP_VERSION}
              </div>
            </div>

            <div className="p-3 sm:p-4 bg-white/95 border-t border-slate-200 flex justify-end shrink-0">
              <button
                onClick={closeVersionNotice}
                className="w-full sm:w-auto px-5 py-3 sm:py-2 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-sm sm:text-xs font-black transition-colors"
              >
                知道了，进入系统
              </button>
            </div>
          </div>
        </div>
      )}

      {/* CORE VIEWPORT SCROLL AREA */}
      <div className="flex-1 flex flex-col min-w-0 min-h-0 md:h-screen overflow-y-auto custom-scrollbar relative">
        
        {/* TOP BAR BRAND HEADER */}
        <header className="sticky top-0 z-40 bg-slate-950/85 backdrop-blur-md border-b border-slate-900 px-4 md:px-6 py-3 md:py-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="space-y-1 min-w-0">
            <div className="text-[11px] md:text-xs text-slate-500 font-mono font-bold flex items-start md:items-center gap-1.5 leading-relaxed">
              <Activity className="w-3.5 h-3.5 text-cyan-400 rotate-90" />
              <span className="min-w-0">{activePageInfo.desc}</span>
            </div>
            <h1 className="text-base md:text-lg font-black text-slate-150 tracking-wide">
              {activePageInfo.title}
            </h1>
          </div>

          <div className="hidden sm:flex items-center gap-4 text-xs">
            {/* Clocks live */}
            <div className="hidden lg:flex items-center gap-1.5 p-2 px-3 bg-slate-900/60 border border-slate-855 rounded-xl text-slate-400 font-mono">
              <Clock className="w-3.5 h-3.5 text-cyan-400" />
              <span>{timeStr || "同步时间中..."}</span>
            </div>

            {/* Account statuses indicators */}
            <div className="flex items-center gap-3.5 bg-slate-900 border border-slate-850 p-1.5 pr-4 rounded-xl">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-cyan-500/20 to-indigo-600/30 border border-cyan-500/30 flex items-center justify-center font-bold font-mono text-cyan-300">
                {currentRole[0]}
              </div>
              <div>
                <span className="font-extrabold text-slate-205 block leading-none">{currentUser.displayName}</span>
                <span className="text-[9px] text-slate-500 font-mono block mt-1 leading-none">
                  {currentUser.role === "老板" ? "全部管理权限" : `${currentUser.role} 权限`}
                </span>
              </div>
            </div>
          </div>
        </header>

        {/* ACTIVE CORE SUBSYSTEM LAYOUT PANEL */}
        <main className="flex-1 p-3 md:p-6 space-y-4 md:space-y-6">
          {currentTab === "dashboard" && (
            <Dashboard
              storeState={storeState}
              setTab={setCurrentTab}
              onSelectCardDetail={handleInspectCardFromDashboard}
            />
          )}

          {currentTab === "products" && (
            <ProductLibrary storeState={storeState} />
          )}

          {currentTab === "purchase_add" && (
            <PurchaseInvoice storeState={storeState} setTab={setCurrentTab} />
          )}

          {currentTab === "purchase_list" && (
            <InvoiceList storeState={storeState} type="purchase" />
          )}

          {currentTab === "inspections" && (
            <InspectionManager storeState={storeState} />
          )}

          {currentTab === "inventory" && (
            <InventoryManager
              storeState={storeState}
              preSelectedCard={preSelectedCard}
              clearPreSelectedCard={() => setPreSelectedCard(null)}
            />
          )}

          {currentTab === "assembly" && (
            <AssemblyManager storeState={storeState} />
          )}

          {currentTab === "sales_add" && (
            <SalesManager storeState={storeState} setTab={setCurrentTab} />
          )}

          {currentTab === "sales_outbound" && (
            <SalesOutboundManager storeState={storeState} />
          )}

          {currentTab === "sales_list" && (
            <InvoiceList storeState={storeState} type="sales" />
          )}

          {(currentTab === "customers" || currentTab === "vendors") && (
            <PartnerManager
              storeState={storeState}
              initialTab={currentTab === "vendors" ? "vendors" : "customers"}
            />
          )}

          {currentTab === "crm" && (
            <CrmManager storeState={storeState} />
          )}

          {currentTab === "finance" && (
            <FinanceManager storeState={storeState} />
          )}

          {currentTab === "settlement_accounts" && (
            <SettlementFinance storeState={storeState} view="accounts" />
          )}

          {currentTab === "settlement_ledger" && (
            <SettlementFinance storeState={storeState} view="ledger" />
          )}

          {currentTab === "payment_in" && (
            <SettlementFinance storeState={storeState} view="payment_in" />
          )}

          {currentTab === "payment_out" && (
            <SettlementFinance storeState={storeState} view="payment_out" />
          )}

          {currentTab === "account_transfer" && (
            <SettlementFinance storeState={storeState} view="transfer" />
          )}

          {currentTab === "finance_reports" && (
            <SettlementFinance storeState={storeState} view="reports" />
          )}

          {currentTab === "quotes" && (
            <MarketQuotes storeState={storeState} />
          )}

          {currentTab === "aftersales" && (
            <AftersalesManager storeState={storeState} />
          )}

          {(currentTab === "permissions" || currentTab === "logs") && (
            <AdminSettings storeState={storeState} />
          )}
        </main>
      </div>
    </div>
  );
}
