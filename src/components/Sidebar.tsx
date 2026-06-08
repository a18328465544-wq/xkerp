/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  Home,
  PackageSearch,
  PackageCheck,
  ClipboardList,
  Wrench,
  ShoppingCart,
  ScanLine,
  Receipt,
  WalletCards,
  ReceiptText,
  ArrowDownLeft,
  ArrowUpRight,
  ArrowRightLeft,
  ChartNoAxesCombined,
  Landmark,
  TrendingUp,
  RefreshCw,
  UsersRound,
  ContactRound,
  Building2,
  Combine,
  History,
  ShieldCheck,
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
    { id: "dashboard", name: "首页", icon: Home },
    { id: "products", name: "商品库", icon: PackageSearch },
    { id: "purchase_add", name: "进货/回收", icon: PackageCheck, isSub: false, badge: "批量" },
    { id: "purchase_list", name: "进货单据", icon: ClipboardList },
    { id: "inspections", name: "检测录入", icon: Wrench, badge: "质检" },
    { id: "inventory", name: "单卡库存", icon: PackageCheck },
    { id: "assembly", name: "组装拆卸", icon: Combine, badge: "SN" },
    { id: "sales_add", name: "销售开单", icon: ShoppingCart, isSub: false },
    { id: "sales_outbound", name: "销售出库", icon: ScanLine, badge: "扫码" },
    { id: "sales_list", name: "销售单据", icon: Receipt },
    { id: "crm", name: "CRM 客户", icon: UsersRound },
    { id: "customers", name: "个人客户", icon: ContactRound },
    { id: "vendors", name: "同行列表", icon: Building2 },
    { id: "settlement_accounts", name: "结算账户", icon: WalletCards },
    { id: "settlement_ledger", name: "账户流水", icon: ReceiptText },
    { id: "payment_in", name: "收款单", icon: ArrowDownLeft },
    { id: "payment_out", name: "付款单", icon: ArrowUpRight },
    { id: "account_transfer", name: "资金调拨", icon: ArrowRightLeft },
    { id: "finance_reports", name: "结算报表", icon: ChartNoAxesCombined },
    { id: "finance", name: "财务流水", icon: Landmark },
    { id: "quotes", name: "行情参考", icon: TrendingUp },
    { id: "aftersales", name: "售后维护", icon: RefreshCw },
    { id: "permissions", name: "权限管理", icon: ShieldCheck },
    { id: "logs", name: "操作日志", icon: History }
  ];

  const filteredMenuItems = allMenuItems.filter(item => {
    if (allowedMenus.includes("all")) return true;
    return allowedMenus.includes(item.id);
  });

  const roles: StoreRole[] = ["老板", "店员", "检测员", "财务"];

  const getRoleBadgeColor = (role: StoreRole) => {
    switch (role) {
      case "老板":
        return "bg-blue-50 border-blue-200 text-blue-700";
      case "店员":
        return "bg-sky-50 border-sky-200 text-sky-700";
      case "检测员":
        return "bg-violet-50 border-violet-200 text-violet-700";
      case "财务":
        return "bg-emerald-50 border-emerald-200 text-emerald-700";
    }
  };

  return (
    <aside className="w-full md:w-64 bg-slate-900 border-b md:border-b-0 md:border-r border-slate-800 text-slate-100 flex flex-col md:h-screen sticky top-0 z-50 md:z-auto shrink-0 select-none">
      {/* Visual Header / Brand */}
      <div className="p-4 md:p-5 border-b border-slate-800/80 flex flex-col gap-2 relative overflow-hidden">
        <div className="flex items-center gap-2">
          <div className="p-1 px-1.5 rounded-md bg-cyan-500 text-white font-black tracking-widest text-[10px] flex items-center">
            ERP
          </div>
          <span className="font-extrabold text-sm tracking-tight text-slate-100">
            成都显卡一号店
          </span>
        </div>
        <p className="text-[10px] text-slate-400 font-medium font-mono leading-none flex items-center gap-1 mt-1">
          <Sparkles className="w-2.5 h-2.5 text-cyan-400" /> 显卡进销存管理 · {DISPLAY_APP_VERSION}
        </p>
      </div>

      {/* Identity Selector Section */}
      <div className="px-4 py-2 md:py-3 border-b border-slate-800 bg-slate-950/20">
        <span className="hidden md:block text-[10px] font-bold text-slate-500 tracking-wider">当前角色</span>
        <div className="mt-1.5 flex items-center gap-2">
          <select
            value={currentRole}
            disabled
            onChange={e => {
              setRole(e.target.value as StoreRole);
              // reset tab if not allowed under new role
              const currentAllowed = e.target.value === "老板" ? ["all"] :
                                    e.target.value === "店员" ? ["dashboard", "products", "purchase_add", "purchase_list", "inventory", "sales_add", "sales_outbound", "sales_list", "crm", "customers", "quotes"] :
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
          <span className={`inline-block w-full text-center py-0.5 rounded text-[10px] font-bold border ${getRoleBadgeColor(currentRole)}`}>
            {currentUser.displayName} · {currentRole} 权限已应用
          </span>
        </div>
      </div>

      {/* Navigation List */}
      <div className="md:flex-1 overflow-x-auto md:overflow-x-visible md:overflow-y-auto py-2 md:py-3 px-3 custom-scrollbar">
        <div className="flex md:block gap-2 md:gap-0 md:space-y-1">
        {filteredMenuItems.map(item => {
          const Icon = item.icon;
          const isActive = currentTab === item.id;
          return (
            <button
              id={`nav-link-${item.id}`}
              key={item.id}
              onClick={() => setTab(item.id)}
              className={`w-auto md:w-full shrink-0 text-left flex items-center justify-center md:justify-between px-3 py-2 rounded-lg text-xs font-semibold tracking-wide transition-all group duration-200 ${
                isActive
                  ? "bg-cyan-950/60 md:border-l-[3px] border-cyan-500 text-cyan-500"
                  : "text-slate-400 hover:bg-slate-800/60 hover:text-slate-200"
              }`}
            >
              <div className="flex items-center gap-2 md:gap-3">
                <Icon
                  className={`w-4 h-4 shrink-0 transition-transform group-hover:scale-105 duration-200 ${
                    isActive ? "text-cyan-500" : "text-slate-400 group-hover:text-slate-200"
                  }`}
                />
                <span className="whitespace-nowrap">{item.name}</span>
              </div>
              
              {item.badge && (
                <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-mono font-medium ${
                  isActive
                    ? "bg-cyan-500/10 text-cyan-500"
                    : "bg-slate-800 text-slate-500 group-hover:text-slate-300 group-hover:bg-slate-700"
                }`}>
                  {item.badge}
                </span>
              )}
            </button>
          );
        })}
        </div>
      </div>

      {/* Footer Account Status */}
      <div className="hidden md:flex p-3 bg-slate-950/40 border-t border-slate-800/80 items-center justify-between text-[11px] text-slate-500 font-mono">
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
