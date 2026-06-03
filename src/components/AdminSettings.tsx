/**
 * @license
 * SPDX-License-Identifier: Apache-2.5
 */

import React, { useState } from "react";
import {
  Sliders,
  Shield,
  FileText,
  UserCheck,
  Zap,
  Lock,
  Unlock,
  RefreshCw,
  Search,
  Eye,
  EyeOff,
  Trash2,
  Database,
  UserPlus,
  Save
} from "lucide-react";
import { useStoreStateReturn } from "../utils/state";
import { StoreRole } from "../types";

interface AdminSettingsProps {
  storeState: useStoreStateReturn;
}

export default function AdminSettings({ storeState }: AdminSettingsProps) {
  const {
    currentRole,
    setRole,
    permissions,
    togglePermission,
    logs,
    clearAllLogs,
    resetToInitialMock,
    systemUsers,
    currentUser,
    createUser,
    updateUser
  } = storeState;

  // Search filter logs
  const [logSearch, setLogSearch] = useState("");
  const [newUser, setNewUser] = useState({
    username: "",
    password: "",
    displayName: "",
    role: "店员" as StoreRole,
    enabled: true
  });
  const [userDrafts, setUserDrafts] = useState<Record<string, {
    role: StoreRole;
    enabled: boolean;
    password: string;
    showCost: boolean;
    showProfit: boolean;
    canDelete: boolean;
    canEditHistory: boolean;
  }>>({});
  const [accountMessage, setAccountMessage] = useState("");

  const roles: StoreRole[] = ["老板", "店员", "检测员", "财务"];

  const getDraft = (id: string) => {
    const user = systemUsers.find(item => item.id === id);
    if (!user) return null;
    return userDrafts[id] || {
      role: user.role,
      enabled: user.enabled,
      password: "",
      showCost: user.permissionOverrides?.showCost ?? false,
      showProfit: user.permissionOverrides?.showProfit ?? false,
      canDelete: user.permissionOverrides?.canDelete ?? false,
      canEditHistory: user.permissionOverrides?.canEditHistory ?? false
    };
  };

  const updateDraft = (id: string, patch: Partial<NonNullable<ReturnType<typeof getDraft>>>) => {
    const draft = getDraft(id);
    if (!draft) return;
    setUserDrafts(prev => ({ ...prev, [id]: { ...draft, ...patch } }));
  };

  const filteredLogs = React.useMemo(() => {
    if (!logSearch) return logs;
    return logs.filter(lg =>
      lg.user.toLowerCase().includes(logSearch.toLowerCase()) ||
      lg.module.toLowerCase().includes(logSearch.toLowerCase()) ||
      lg.type.toLowerCase().includes(logSearch.toLowerCase()) ||
      (lg.afterVal && lg.afterVal.toLowerCase().includes(logSearch.toLowerCase()))
    );
  }, [logs, logSearch]);

  const handleToggle = (key: "showCost" | "showProfit" | "canDelete" | "canEditHistory") => {
    togglePermission(key);
  };

  const handleTriggerReset = () => {
    if (confirm("确定要重置演示数据吗？\n此操作将清空自定义录入的采购单、质检单和销售单，并恢复标准演示账套。")) {
      resetToInitialMock();
      alert("🎉 缓存重写完成！已全部回滚到标准高标质检测试流原始账目。");
      window.location.reload();
    }
  };

  const handleCreateUser = () => {
    try {
      createUser({ ...newUser, permissionOverrides: {} });
      setNewUser({ username: "", password: "", displayName: "", role: "店员", enabled: true });
      setAccountMessage("账号已新增。");
    } catch (err) {
      setAccountMessage(err instanceof Error ? err.message : "新增账号失败");
    }
  };

  const handleSaveUser = (id: string) => {
    const draft = getDraft(id);
    if (!draft) return;
    const payload = {
      role: draft.role,
      enabled: draft.enabled,
      ...(draft.password ? { password: draft.password } : {}),
      permissionOverrides: {
        showCost: draft.showCost,
        showProfit: draft.showProfit,
        canDelete: draft.canDelete,
        canEditHistory: draft.canEditHistory
      }
    };
    updateUser(id, payload);
    setUserDrafts(prev => ({ ...prev, [id]: { ...draft, password: "" } }));
    setAccountMessage("账号权限已更新。");
  };

  return (
    <div className="space-y-4">
      {/* Title */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-slate-900 p-5 rounded-2xl border border-slate-800">
        <div>
          <h2 className="text-base font-bold text-slate-100 flex items-center gap-2">
            <Shield className="w-5 h-5 text-cyan-400" />
            <span>权限控制、安全设置与审计</span>
          </h2>
          <p className="text-xs text-slate-400 mt-1">
            系统按角色控制敏感数据展示。老板可调整菜单权限，隐藏成本价、利润和营业总额。
          </p>
        </div>
        <div className="flex gap-2 shrink-0">
          <button
            onClick={handleTriggerReset}
            className="p-2 border border-slate-800 hover:bg-slate-800 text-rose-400 rounded hover:text-rose-300 font-bold text-xs flex items-center gap-1.5 cursor-pointer transition-colors"
          >
            <Database className="w-4 h-4" />
            重置并初始化初始对账单
          </button>
        </div>
      </div>

      <div className="bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-4 shadow-sm">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 border-b border-slate-800 pb-3">
          <div>
            <h3 className="text-xs font-bold text-slate-100 uppercase tracking-wider flex items-center gap-1.5">
              <UserCheck className="w-4 h-4 text-cyan-400" />
              <span>账号登录与人员权限</span>
            </h3>
            <p className="text-[11px] text-slate-500 mt-1">
              当前登录：{currentUser?.displayName} ({currentUser?.username})。账号角色决定菜单入口，单账号权限可覆盖角色默认设置。
            </p>
          </div>
          {accountMessage && <span className="text-[11px] text-cyan-300 font-bold">{accountMessage}</span>}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-5 gap-3">
          <input
            value={newUser.displayName}
            onChange={e => setNewUser(prev => ({ ...prev, displayName: e.target.value }))}
            placeholder="姓名，如销售小王"
            className="bg-slate-950 border border-slate-800 rounded px-3 py-2 text-xs text-slate-200"
          />
          <input
            value={newUser.username}
            onChange={e => setNewUser(prev => ({ ...prev, username: e.target.value }))}
            placeholder="登录账号"
            className="bg-slate-950 border border-slate-800 rounded px-3 py-2 text-xs text-slate-200"
          />
          <input
            type="password"
            value={newUser.password}
            onChange={e => setNewUser(prev => ({ ...prev, password: e.target.value }))}
            placeholder="初始密码"
            className="bg-slate-950 border border-slate-800 rounded px-3 py-2 text-xs text-slate-200"
          />
          <select
            value={newUser.role}
            onChange={e => setNewUser(prev => ({ ...prev, role: e.target.value as StoreRole }))}
            className="bg-slate-950 border border-slate-800 rounded px-3 py-2 text-xs text-slate-200"
          >
            {roles.map(role => <option key={role} value={role}>{role}</option>)}
          </select>
          <button
            onClick={handleCreateUser}
            className="bg-cyan-500 hover:bg-cyan-400 text-slate-950 rounded px-3 py-2 text-xs font-black flex items-center justify-center gap-1.5"
          >
            <UserPlus className="w-4 h-4" />
            新增账号
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-xs min-w-[920px]">
            <thead className="text-slate-500 border-b border-slate-800">
              <tr>
                <th className="p-2 text-left">账号</th>
                <th className="p-2 text-left">角色</th>
                <th className="p-2 text-center">启用</th>
                <th className="p-2 text-center">看成本</th>
                <th className="p-2 text-center">看利润</th>
                <th className="p-2 text-center">可删除</th>
                <th className="p-2 text-center">改历史</th>
                <th className="p-2 text-left">新密码</th>
                <th className="p-2 text-right">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800">
              {systemUsers.map(user => {
                const draft = getDraft(user.id);
                if (!draft) return null;
                return (
                  <tr key={user.id} className="text-slate-300">
                    <td className="p-2">
                      <div className="font-bold text-slate-100">{user.displayName}</div>
                      <div className="font-mono text-[10px] text-slate-500">{user.username} {user.lastLoginTime ? `· ${user.lastLoginTime}` : ""}</div>
                    </td>
                    <td className="p-2">
                      <select
                        value={draft.role}
                        onChange={e => updateDraft(user.id, { role: e.target.value as StoreRole })}
                        className="bg-slate-950 border border-slate-800 rounded px-2 py-1 text-xs"
                      >
                        {roles.map(role => <option key={role} value={role}>{role}</option>)}
                      </select>
                    </td>
                    <td className="p-2 text-center">
                      <input type="checkbox" checked={draft.enabled} onChange={e => updateDraft(user.id, { enabled: e.target.checked })} />
                    </td>
                    {(["showCost", "showProfit", "canDelete", "canEditHistory"] as const).map(key => (
                      <td key={key} className="p-2 text-center">
                        <input type="checkbox" checked={draft[key]} onChange={e => updateDraft(user.id, { [key]: e.target.checked })} />
                      </td>
                    ))}
                    <td className="p-2">
                      <input
                        type="password"
                        value={draft.password}
                        onChange={e => updateDraft(user.id, { password: e.target.value })}
                        placeholder="留空不改"
                        className="bg-slate-950 border border-slate-800 rounded px-2 py-1 text-xs w-full"
                      />
                    </td>
                    <td className="p-2 text-right">
                      <button
                        onClick={() => handleSaveUser(user.id)}
                        className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-cyan-300 rounded font-bold inline-flex items-center gap-1"
                      >
                        <Save className="w-3.5 h-3.5" />
                        保存
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* PRIVILEGE GRID TOGGLES (左1) */}
        <div className="lg:col-span-1 bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-4 shadow-sm">
          <h3 className="text-xs font-bold text-slate-105 uppercase tracking-wider flex items-center gap-1.5 border-b border-slate-800 pb-2">
            <Sliders className="w-4 h-4 text-cyan-400" />
            <span>角色菜单权限开关</span>
          </h3>

          <div className="space-y-3 pt-1">
            {/* Show cost */}
            <div className="p-3 bg-slate-950 rounded border border-slate-855 transition-all flex items-center justify-between">
              <div className="space-y-0.5 max-w-[210px]">
                <span className="text-xs font-bold text-slate-200 flex items-center gap-1.5">
                  {permissions.showCost ? <Unlock className="w-3.5 h-3.5 text-cyan-405" /> : <Lock className="w-3.5 h-3.5 text-rose-455" />}
                  展示采购回收成本(¥)
                </span>
                <p className="text-[10px] text-slate-500 leading-normal">
                  若关闭，店员和测试员在“库存列表”、“销售单表格”中皆无权读到每张卡的回收原价。
                </p>
              </div>

              <input
                type="checkbox"
                checked={permissions.showCost}
                onChange={() => handleToggle("showCost")}
                className="rounded text-cyan-500 bg-slate-900 border-slate-800 focus:ring-0 cursor-pointer"
              />
            </div>

            {/* Show net profits */}
            <div className="p-3 bg-slate-950 rounded border border-slate-855 transition-all flex items-center justify-between">
              <div className="space-y-0.5 max-w-[210px]">
                <span className="text-xs font-bold text-slate-200 flex items-center gap-1.5">
                  {permissions.showProfit ? <Unlock className="w-3.5 h-3.5 text-cyan-405" /> : <Lock className="w-3.5 h-3.5 text-rose-455" />}
                  大盘总损益与预计利润
                </span>
                <p className="text-[10px] text-slate-500 leading-normal">
                  关闭后，开单页面、账单汇总和仪表盘将隐藏预计利润。
                </p>
              </div>

              <input
                type="checkbox"
                checked={permissions.showProfit}
                onChange={() => handleToggle("showProfit")}
                className="rounded text-cyan-500 bg-slate-900 border-slate-800 focus:ring-0 cursor-pointer"
              />
            </div>

            {/* Delete/Void receipts */}
            <div className="p-3 bg-slate-950 rounded border border-slate-855 transition-all flex items-center justify-between">
              <div className="space-y-0.5 max-w-[210px]">
                <span className="text-xs font-bold text-slate-205 flex items-center gap-1.5">
                  {permissions.canDelete ? <Unlock className="w-3.5 h-3.5 text-cyan-405" /> : <Lock className="w-3.5 h-3.5 text-rose-455" />}
                  允许删除与红销强退
                </span>
                <p className="text-[10px] text-slate-500 leading-normal">
                  限制店员销毁采购单据。防止私自删改存货SN以调换配件中饱私囊。
                </p>
              </div>

              <input
                type="checkbox"
                checked={permissions.canDelete}
                onChange={() => handleToggle("canDelete")}
                className="rounded text-cyan-500 bg-slate-900 border-slate-800 focus:ring-0 cursor-pointer"
              />
            </div>

            {/* Modify quotes */}
            <div className="p-3 bg-slate-950 rounded border border-slate-855 transition-all flex items-center justify-between">
              <div className="space-y-0.5 max-w-[210px]">
                <span className="text-xs font-bold text-slate-205 flex items-center gap-1.5">
                  {permissions.canEditHistory ? <Unlock className="w-3.5 h-3.5 text-cyan-405" /> : <Lock className="w-3.5 h-3.5 text-rose-455" />}
                  编辑大盘均价行情
                </span>
                <p className="text-[10px] text-slate-500 leading-normal">
                  锁定行情大盘修改。防止店员编造虚低回收价骗取客户低价放卡。
                </p>
              </div>

              <input
                type="checkbox"
                checked={permissions.canEditHistory}
                onChange={() => handleToggle("canEditHistory")}
                className="rounded text-cyan-500 bg-slate-900 border-slate-800 focus:ring-0 cursor-pointer"
              />
            </div>
          </div>
        </div>

        {/* LOG AUDITING STREAM (右2) */}
        <div className="lg:col-span-2 bg-slate-900 border border-slate-800 rounded-xl p-5 space-y-4 shadow-sm">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-800 pb-2">
            <h3 className="text-xs font-bold text-slate-100 uppercase tracking-wider flex items-center gap-1.5 font-mono">
              <FileText className="w-4 h-4 text-cyan-400" />
              <span>多维物理操作安全审计流水对账簿 ({filteredLogs.length})</span>
            </h3>

            <div className="flex gap-2">
              <div className="relative">
                <Search className="w-3 h-3 absolute left-2.5 top-2.5 text-slate-500" />
                <input
                  type="text"
                  placeholder="搜索日志操作、模块或细节..."
                  value={logSearch}
                  onChange={e => setLogSearch(e.target.value)}
                  className="bg-slate-950 border border-slate-850 rounded text-[11px] text-slate-300 pl-7 pr-2 py-1.5"
                />
              </div>

              <button
                onClick={() => {
                  clearAllLogs();
                  alert("操作日志已清除，刷新后生效。");
                }}
                className="p-1.5 border border-slate-800 hover:bg-slate-850 hover:text-rose-400 rounded text-slate-500 cursor-pointer text-[10px]"
              >
                解构清理
              </button>
            </div>
          </div>

          {/* Audit logs stream list */}
          <div className="space-y-3.5 max-h-[440px] overflow-y-auto pr-1">
            {filteredLogs.length === 0 ? (
              <div className="p-16 text-center text-slate-550 italic text-xs">
                没有找到任何安全行为日志。
              </div>
            ) : (
              filteredLogs.map(item => (
                <div key={item.id} className="p-3 bg-slate-950 rounded-lg border border-slate-855 text-xs flex flex-col md:flex-row justify-between gap-3 font-mono">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] text-slate-500">{item.time}</span>
                      <span className="text-cyan-400 font-extrabold text-[11px] bg-slate-900 border border-slate-850 px-1.5 py-0.2 rounded">
                        {item.user}
                      </span>
                      <span className="text-slate-200 font-bold text-[11px]">{item.module} &rarr; {item.type}</span>
                    </div>

                    <div className="text-slate-400 text-[11px] leading-relaxed pt-1">
                      操作详情: <span className="text-slate-300">{item.afterVal}</span>
                    </div>
                  </div>

                  {item.target && (
                    <div className="text-right shrink-0">
                      <span className="text-[9px] text-slate-550 block">关联单号或SN码</span>
                      <span className="text-emerald-400 font-bold block mt-1">{item.target}</span>
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
