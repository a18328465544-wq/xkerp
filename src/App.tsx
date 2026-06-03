/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo } from "react";
import {
  Clock,
  User,
  Shield,
  HelpCircle,
  Bell,
  Sparkles,
  Info,
  Terminal,
  Activity,
  Layers
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
        return { title: "系统控制台", desc: "综合监控中心，展示今日回收成果及滞销贬值风险。" };
      case "products":
        return { title: "全品类硬件与显卡商品库", desc: "统一管理显卡、CPU、主板、固态、内存、电源等核心配件模板及参考买入/卖出价格。" };
      case "purchase_add":
        return { title: "新增进货/回收单", desc: "Excel级输入体验，支持扫码枪录入，为显卡建立数字物理ID。" };
      case "purchase_list":
        return { title: "已入账采购单据", desc: "往期采购汇总、单据查看与打印。" };
      case "inspections":
        return { title: "GPU-Z 与 FurMark 烤机质检", desc: "通过烤机、外观和接口检查评估设备状态。" };
      case "inventory":
        return { title: "一卡一档库存管理", desc: "追踪每张显卡的来源、状态、库位和标签打印。" };
      case "sales_add":
        return { title: "新增客户销售出库单", desc: "绑定库存卡序列号、发货方式和售后质保条款。" };
      case "sales_list":
        return { title: "客户出货与零售单据", desc: "销售往来单、发货单及退款记录核对。" };
      case "customers":
      case "vendors":
        return { title: "经营网络档案", desc: "客户与供应商档案、交易记录和信用信息管理。" };
      case "crm":
        return { title: "CRM 客户管理", desc: "客户线索、跟进记录、需求预算和成交阶段统一管理。" };
      case "finance":
        return { title: "财务流水", desc: "累计经营收入与成本支出，跟踪未结清尾款和账期对账。" };
      case "settlement_accounts":
        return { title: "结算账户", desc: "微信、支付宝、现金、银行卡、备用金等账户余额统一管理。" };
      case "settlement_ledger":
        return { title: "账户流水", desc: "逐笔追踪账户收入、支出、调拨和关联单据。" };
      case "payment_in":
        return { title: "收款单", desc: "登记客户收款、收款账户、收款人及关联销售单。" };
      case "payment_out":
        return { title: "付款单", desc: "登记供应商付款、付款账户、付款人及关联采购单。" };
      case "account_transfer":
        return { title: "资金调拨", desc: "支持微信、支付宝、银行卡等结算账户之间转账。" };
      case "finance_reports":
        return { title: "结算报表", desc: "按账户、经办人、客户、供应商筛选收入支出并导出。" };
      case "quotes":
        return { title: "显卡行情变动表", desc: "汇总平台行情与成交价格，辅助库存定价和风险判断。" };
      case "aftersales":
        return { title: "售后风险处理台", desc: "记录外观、维修痕迹、阻值检测和售后处理结果。" };
      case "permissions":
      case "logs":
        return { title: "操作日志与权限审计", desc: "管理权限开关、敏感数据显示和操作日志检索。" };
      default:
        return { title: "精诚电脑配件及显卡进销存ERP中枢", desc: "支持多零配件品类统合、一卡一档的高精度追溯和进销存对账管理系统。" };
    }
  };

  const activePageInfo = getPageTitleInfo();

  if (!currentUser) {
    return <LoginScreen storeState={storeState} />;
  }

  return (
    <div className="flex bg-slate-950 text-slate-100 min-h-screen font-sans">
      {/* PERSISTENT LIGHTWEIGHT NEON SIDEBAR */}
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
        <div className="fixed inset-0 z-80 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-slate-900 border border-cyan-500/25 rounded-2xl shadow-2xl shadow-cyan-950/40 overflow-hidden">
            <div className="p-5 border-b border-slate-800 flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center shrink-0">
                <Bell className="w-5 h-5 text-cyan-300" />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2 text-[10px] font-mono text-cyan-300 font-bold">
                  <Sparkles className="w-3 h-3" />
                  <span>系统版本更新</span>
                </div>
                <h2 className="text-lg font-black text-slate-100 mt-1">
                  已升级到 {DISPLAY_APP_VERSION}
                </h2>
                <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                  本次更新会改变部分业务字段和库存操作方式，建议上线前让店员、仓库和财务都刷新一次页面。
                </p>
              </div>
            </div>

            <div className="p-5 space-y-3">
              {VERSION_UPDATE_NOTES.map(note => (
                <div key={note} className="flex gap-2 text-xs text-slate-300 leading-relaxed">
                  <Info className="w-3.5 h-3.5 text-cyan-400 mt-0.5 shrink-0" />
                  <span>{note}</span>
                </div>
              ))}
              <div className="bg-slate-950 border border-slate-800 rounded-lg p-3 text-[11px] text-slate-500 font-mono">
                当前版本号：{DISPLAY_APP_VERSION}
              </div>
            </div>

            <div className="p-4 bg-slate-950/60 border-t border-slate-800 flex justify-end">
              <button
                onClick={closeVersionNotice}
                className="px-5 py-2 bg-cyan-500 hover:bg-cyan-400 text-slate-950 rounded-lg text-xs font-black transition-colors"
              >
                知道了，进入系统
              </button>
            </div>
          </div>
        </div>
      )}

      {/* CORE VIEWPORT SCROLL AREA */}
      <div className="flex-1 flex flex-col min-w-0 h-screen overflow-y-auto custom-scrollbar relative">
        
        {/* TOP BAR BRAND HEADER */}
        <header className="sticky top-0 z-40 bg-slate-950/85 backdrop-blur-md border-b border-slate-900 px-6 py-4 flex items-center justify-between">
          <div className="space-y-1">
            <div className="text-xs text-slate-500 font-mono font-bold flex items-center gap-1.5">
              <Activity className="w-3.5 h-3.5 text-cyan-400 rotate-90" />
              <span>{activePageInfo.desc}</span>
            </div>
            <h1 className="text-base font-black text-slate-150 tracking-wide">
              {activePageInfo.title}
            </h1>
          </div>

          <div className="flex items-center gap-4 text-xs">
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
        <main className="flex-1 p-6 space-y-6">
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

          {currentTab === "sales_add" && (
            <SalesManager storeState={storeState} setTab={setCurrentTab} />
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
