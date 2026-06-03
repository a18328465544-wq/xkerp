/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React from "react";
import {
  LayoutDashboard,
  Cpu,
  CornerDownRight,
  ClipboardList,
  Wrench,
  Package,
  BadgeDollarSign,
  WalletCards,
  ReceiptText,
  ArrowDownLeft,
  ArrowUpRight,
  ArrowRightLeft,
  BarChart3,
  TrendingUp,
  RefreshCw,
  Users,
  UserRoundCheck,
  Briefcase,
  History,
  Shield,
  Layers,
  LogOut,
  Sparkles
} from "lucide-react";
import { StoreRole } from "../types";
import type { SafeSystemUserAccount } from "../types";
import { DISPLAY_APP_VERSION } from "../utils/version";

interface SidebarProps {
  currentTab: string;
  setTab: (tab: string) => void;
  currentRole: StoreRole;
  setRole: (role: StoreRole) => void;
  allowedMenus: string[];
  currentUser: SafeSystemUserAccount;
  onLogout: () => void;
}

export default function Sidebar({
  currentTab,
  setTab,
  currentRole,
  setRole,
  allowedMenus,
  currentUser,
  onLogout
}: SidebarProps) {
  const allMenuItems = [
    { id: "dashboard", name: "首页数据看板", icon: LayoutDashboard },
    { id: "products", name: "配件与商品库", icon: Cpu },
    { id: "purchase_add", name: "新增进货/回收", icon: Layers, isSub: false, badge: "Excel" },
    { id: "purchase_list", name: "进货回收单据", icon: ClipboardList },
    { id: "inspections", name: "显卡检测录入", icon: Wrench, badge: "质检" },
    { id: "inventory", name: "单卡库存账单", icon: Package },
    { id: "sales_add", name: "新增销售出库", icon: BadgeDollarSign, isSub: false },
    { id: "sales_list", name: "销售出库单据", icon: ClipboardList },
    { id: "crm", name: "CRM 客户管理", icon: UserRoundCheck },
    { id: "customers", name: "客户关系档案", icon: Users },
    { id: "vendors", name: "供应商同行册", icon: Briefcase },
    { id: "settlement_accounts", name: "结算账户", icon: WalletCards },
    { id: "settlement_ledger", name: "账户流水", icon: ReceiptText },
    { id: "payment_in", name: "收款单", icon: ArrowDownLeft },
    { id: "payment_out", name: "付款单", icon: ArrowUpRight },
    { id: "account_transfer", name: "资金调拨", icon: ArrowRightLeft },
    { id: "finance_reports", name: "结算报表", icon: BarChart3 },
    { id: "finance", name: "财务流水", icon: BadgeDollarSign },
    { id: "quotes", name: "显卡行情波动", icon: TrendingUp },
    { id: "aftersales", name: "售后风险维护", icon: RefreshCw },
    { id: "permissions", name: "角色权限控制", icon: Shield },
    { id: "logs", name: "操作安全日志", icon: History }
  ];

  const filteredMenuItems = allMenuItems.filter(item => {
    if (allowedMenus.includes("all")) return true;
    return allowedMenus.includes(item.id);
  });

  const roles: StoreRole[] = ["老板", "店员", "检测员", "财务"];

  const getRoleBadgeColor = (role: StoreRole) => {
    switch (role) {
      case "老板":
        return "from-amber-500/20 to-orange-500/20 border-amber-500/50 text-amber-300 shadow-[0_0_8px_rgba(245,158,11,0.2)]";
      case "店员":
        return "from-sky-500/20 to-indigo-500/20 border-sky-500/50 text-sky-300";
      case "检测员":
        return "from-purple-500/20 to-fuchsia-500/20 border-purple-500/50 text-purple-300";
      case "财务":
        return "from-emerald-500/20 to-teal-500/20 border-emerald-500/50 text-emerald-300";
    }
  };

  return (
    <aside className="w-64 bg-slate-900 border-r border-slate-800 text-slate-100 flex flex-col h-screen sticky top-0 shrink-0 select-none">
      {/* Visual Header / Brand */}
      <div className="p-5 border-b border-slate-800/80 flex flex-col gap-2 relative overflow-hidden">
        <div className="absolute top-0 right-0 w-32 h-32 bg-cyan-500/5 rounded-full blur-2xl pointer-events-none"></div>
        <div className="absolute -bottom-10 -left-10 w-24 h-24 bg-purple-500/5 rounded-full blur-xl pointer-events-none"></div>

        <div className="flex items-center gap-2">
          <div className="p-1 px-1.5 rounded bg-gradient-to-br from-cyan-500 to-indigo-600 text-white font-black tracking-widest text-[10px] flex items-center shadow-[0_0_15px_rgba(6,182,212,0.3)]">
            ERP
          </div>
          <span className="font-extrabold text-xs tracking-tight bg-gradient-to-r from-slate-100 via-slate-200 to-slate-400 bg-clip-text text-transparent">
            成都显卡一号店进销存
          </span>
        </div>
        <p className="text-[10px] text-slate-400 font-medium font-mono leading-none flex items-center gap-1 mt-1">
          <Sparkles className="w-2.5 h-2.5 text-cyan-400" /> {DISPLAY_APP_VERSION} - 二手显卡进销存
        </p>
      </div>

      {/* Identity Selector Section */}
      <div className="px-4 py-3 border-b border-slate-800 bg-slate-950/20">
        <span className="text-[10px] font-bold text-slate-500 tracking-wider">当前角色</span>
        <div className="mt-1.5 flex items-center gap-2">
          <select
            value={currentRole}
            disabled
            onChange={e => {
              setRole(e.target.value as StoreRole);
              // reset tab if not allowed under new role
              const currentAllowed = e.target.value === "老板" ? ["all"] :
                                    e.target.value === "店员" ? ["dashboard", "products", "purchase_add", "purchase_list", "inventory", "sales_add", "sales_list", "crm", "customers", "quotes"] :
                                    e.target.value === "检测员" ? ["dashboard", "inventory", "inspections"] :
                                    ["dashboard", "purchase_list", "inventory", "sales_list", "settlement_accounts", "settlement_ledger", "payment_in", "payment_out", "account_transfer", "finance_reports", "finance", "vendors"];
              
              if (!currentAllowed.includes("all") && !currentAllowed.includes(currentTab)) {
                setTab("dashboard");
              }
            }}
            className="flex-1 bg-slate-950 border border-slate-800 text-xs rounded px-2.5 py-1.5 font-medium text-slate-200 focus:outline-none focus:border-cyan-500 transition-colors disabled:text-slate-500"
          >
            {roles.map(r => (
              <option key={r} value={r} className="bg-slate-900 text-slate-300">
                {r} 视图
              </option>
            ))}
          </select>
        </div>
        <div className="mt-2 text-center">
          <span className={`inline-block w-full text-center py-0.5 rounded text-[10px] font-bold border bg-gradient-to-r ${getRoleBadgeColor(currentRole)}`}>
            {currentUser.displayName} · {currentRole} 权限已应用
          </span>
        </div>
      </div>

      {/* Navigation List */}
      <div className="flex-1 overflow-y-auto py-3 space-y-1 px-3 custom-scrollbar">
        {filteredMenuItems.map(item => {
          const Icon = item.icon;
          const isActive = currentTab === item.id;
          return (
            <button
              id={`nav-link-${item.id}`}
              key={item.id}
              onClick={() => setTab(item.id)}
              className={`w-full text-left flex items-center justify-between px-3 py-2 rounded-lg text-xs font-semibold tracking-wide transition-all group duration-200 ${
                isActive
                  ? "bg-gradient-to-r from-cyan-950/40 via-indigo-950/30 to-slate-900 border-l-[3px] border-cyan-400 text-cyan-300 shadow-[inset_0_1px_1px_rgba(255,255,255,0.05)]"
                  : "text-slate-400 hover:bg-slate-800/60 hover:text-slate-200"
              }`}
            >
              <div className="flex items-center gap-3">
                <Icon
                  className={`w-4 h-4 shrink-0 transition-transform group-hover:scale-105 duration-200 ${
                    isActive ? "text-cyan-400" : "text-slate-400 group-hover:text-slate-200"
                  }`}
                />
                <span>{item.name}</span>
              </div>
              
              {item.badge && (
                <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-mono font-medium ${
                  isActive
                    ? "bg-cyan-400/20 text-cyan-400"
                    : "bg-slate-800 text-slate-500 group-hover:text-slate-300 group-hover:bg-slate-700"
                }`}>
                  {item.badge}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Footer Account Status */}
      <div className="p-3 bg-slate-950/40 border-t border-slate-800/80 flex items-center justify-between text-[11px] text-slate-500 font-mono">
        <div className="flex items-center gap-1.5 overflow-hidden">
          <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></div>
          <span className="truncate text-slate-400">{currentUser.displayName} ({currentUser.username})</span>
        </div>
        <button 
          onClick={onLogout}
          className="text-slate-500 hover:text-slate-300"
          title="退出系统"
        >
          <LogOut className="w-3.5 h-3.5" />
        </button>
      </div>
    </aside>
  );
}
