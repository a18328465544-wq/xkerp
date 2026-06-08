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
  Lock,
  Unlock,
  Search,
  Database,
  UserPlus,
  Save
} from "lucide-react";
import { useStoreStateReturn } from "../utils/state";
import { StoreRole } from "../types";
import { defaultPermissions } from "../data/mockData";

interface AdminSettingsProps {
  storeState: useStoreStateReturn;
}

export default function AdminSettings({ storeState }: AdminSettingsProps) {
  const {
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
    username: string;
    displayName: string;
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
  const editablePermissionKeys = ["showCost", "showProfit", "canDelete", "canEditHistory"] as const;

  const getRoleDefaults = (role: StoreRole) => {
    return defaultPermissions.find(item => item.role === role) || defaultPermissions[0];
  };

  const getDraft = (id: string) => {
    const user = systemUsers.find(item => item.id === id);
    if (!user) return null;
    const roleDefaults = getRoleDefaults(user.role);
    return userDrafts[id] || {
      username: user.username,
      displayName: user.displayName,
      role: user.role,
      enabled: user.enabled,
      password: "",
      showCost: user.permissionOverrides?.showCost ?? roleDefaults.showCost,
      showProfit: user.permissionOverrides?.showProfit ?? roleDefaults.showProfit,
      canDelete: user.permissionOverrides?.canDelete ?? roleDefaults.canDelete,
      canEditHistory: user.permissionOverrides?.canEditHistory ?? roleDefaults.canEditHistory
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

  const handleDraftRoleChange = (id: string, role: StoreRole) => {
    const roleDefaults = getRoleDefaults(role);
    updateDraft(id, {
      role,
      showCost: roleDefaults.showCost,
      showProfit: roleDefaults.showProfit,
      canDelete: roleDefaults.canDelete,
      canEditHistory: roleDefaults.canEditHistory
    });
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
      username: draft.username,
      displayName: draft.displayName,
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
    try {
      updateUser(id, payload);
      setUserDrafts(prev => ({ ...prev, [id]: { ...draft, password: "" } }));
      setAccountMessage("账号信息已更新。");
    } catch (err) {
      setAccountMessage(err instanceof Error ? err.message : "账号更新失败");
    }
  };

  return (
    <div className="space-y-4 text-slate-900">
      {/* Title */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
        <div>
          <h2 className="text-base font-black text-slate-950 flex items-center gap-2">
            <Shield className="w-5 h-5 text-blue-600" />
            <span>权限控制、安全设置与审计</span>
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            系统按账号和角色控制敏感数据。admin 默认账号锁定，其他老板、财务、店员和检测员账号都可编辑。
          </p>
        </div>
        <div className="flex gap-2 shrink-0">
          <button
            onClick={handleTriggerReset}
            className="p-2 border border-red-200 bg-red-50 hover:bg-red-100 text-red-600 rounded-lg font-bold text-xs flex items-center gap-1.5 cursor-pointer transition-colors"
          >
            <Database className="w-4 h-4" />
            重置并初始化初始对账单
          </button>
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-2xl p-5 space-y-4 shadow-sm">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 border-b border-slate-200 pb-3">
          <div>
            <h3 className="text-xs font-black text-slate-950 uppercase tracking-wider flex items-center gap-1.5">
              <UserCheck className="w-4 h-4 text-blue-600" />
              <span>账号登录与人员权限</span>
            </h3>
            <p className="text-[11px] text-slate-500 mt-1">
              当前登录：{currentUser?.displayName} ({currentUser?.username})。账号角色决定菜单入口，单账号权限可覆盖角色默认设置。
            </p>
          </div>
          {accountMessage && <span className="rounded-full bg-blue-50 px-3 py-1 text-[11px] text-blue-700 font-bold">{accountMessage}</span>}
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-5 gap-3">
          <input
            value={newUser.displayName}
            onChange={e => setNewUser(prev => ({ ...prev, displayName: e.target.value }))}
            placeholder="姓名，如销售小王"
            className="bg-white border border-slate-200 rounded-lg px-3 py-2 text-xs text-slate-900 outline-none focus:border-blue-500"
          />
          <input
            value={newUser.username}
            onChange={e => setNewUser(prev => ({ ...prev, username: e.target.value }))}
            placeholder="登录账号"
            className="bg-white border border-slate-200 rounded-lg px-3 py-2 text-xs text-slate-900 outline-none focus:border-blue-500"
          />
          <input
            type="password"
            value={newUser.password}
            onChange={e => setNewUser(prev => ({ ...prev, password: e.target.value }))}
            placeholder="初始密码"
            className="bg-white border border-slate-200 rounded-lg px-3 py-2 text-xs text-slate-900 outline-none focus:border-blue-500"
          />
          <select
            value={newUser.role}
            onChange={e => setNewUser(prev => ({ ...prev, role: e.target.value as StoreRole }))}
            className="bg-white border border-slate-200 rounded-lg px-3 py-2 text-xs text-slate-900 outline-none focus:border-blue-500"
          >
            {roles.map(role => <option key={role} value={role}>{role}</option>)}
          </select>
          <button
            onClick={handleCreateUser}
            className="bg-blue-600 hover:bg-blue-500 text-white rounded-lg px-3 py-2 text-xs font-black flex items-center justify-center gap-1.5"
          >
            <UserPlus className="w-4 h-4" />
            新增账号
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-xs min-w-[1120px]">
            <thead className="text-slate-500 border-b border-slate-200 bg-slate-50">
              <tr>
                <th className="p-2 text-left">姓名</th>
                <th className="p-2 text-left">登录账号</th>
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
            <tbody className="divide-y divide-slate-100">
              {systemUsers.map(user => {
                const draft = getDraft(user.id);
                if (!draft) return null;
                return (
                  <tr key={user.id} className="text-slate-700 hover:bg-blue-50/40">
                    <td className="p-2">
                      <input
                        value={draft.displayName}
                        onChange={e => updateDraft(user.id, { displayName: e.target.value })}
                        className="bg-white border border-slate-200 rounded-lg px-2 py-1.5 text-xs w-full text-slate-900 outline-none focus:border-blue-500"
                      />
                    </td>
                    <td className="p-2">
                      <input
                        value={draft.username}
                        onChange={e => updateDraft(user.id, { username: e.target.value })}
                        className="bg-white border border-slate-200 rounded-lg px-2 py-1.5 text-xs w-full font-mono text-slate-900 outline-none focus:border-blue-500"
                      />
                      <div className="font-mono text-[10px] text-slate-500 mt-1">{user.lastLoginTime ? `最后登录 ${user.lastLoginTime}` : "未记录登录"}</div>
                    </td>
                    <td className="p-2">
                      <select
                        value={draft.role}
                        onChange={e => handleDraftRoleChange(user.id, e.target.value as StoreRole)}
                        className="bg-white border border-slate-200 rounded-lg px-2 py-1.5 text-xs text-slate-900 outline-none focus:border-blue-500"
                      >
                        {roles.map(role => <option key={role} value={role}>{role}</option>)}
                      </select>
                    </td>
                    <td className="p-2 text-center">
                      <input type="checkbox" checked={draft.enabled} onChange={e => updateDraft(user.id, { enabled: e.target.checked })} />
                    </td>
                    {editablePermissionKeys.map(key => (
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
                        className="bg-white border border-slate-200 rounded-lg px-2 py-1.5 text-xs w-full text-slate-900 outline-none focus:border-blue-500"
                      />
                    </td>
                    <td className="p-2 text-right">
                      <button
                        onClick={() => handleSaveUser(user.id)}
                        className="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg font-bold inline-flex items-center gap-1"
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
        <div className="lg:col-span-1 bg-white border border-slate-200 rounded-2xl p-5 space-y-4 shadow-sm">
          <h3 className="text-xs font-black text-slate-950 uppercase tracking-wider flex items-center gap-1.5 border-b border-slate-200 pb-2">
            <Sliders className="w-4 h-4 text-blue-600" />
            <span>当前角色权限开关</span>
          </h3>

          <div className="space-y-3 pt-1">
            {/* Show cost */}
            <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 transition-all flex items-center justify-between">
              <div className="space-y-0.5 max-w-[210px]">
                <span className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                  {permissions.showCost ? <Unlock className="w-3.5 h-3.5 text-blue-600" /> : <Lock className="w-3.5 h-3.5 text-red-500" />}
                  展示采购回收成本(元)
                </span>
                <p className="text-[10px] text-slate-500 leading-normal">
                  若关闭，店员和测试员在“库存列表”、“销售单表格”中皆无权读到每张卡的回收原价。
                </p>
              </div>

              <input
                type="checkbox"
                checked={permissions.showCost}
                onChange={() => handleToggle("showCost")}
                className="rounded text-blue-600 bg-white border-slate-300 focus:ring-0 cursor-pointer"
              />
            </div>

            {/* Show net profits */}
            <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 transition-all flex items-center justify-between">
              <div className="space-y-0.5 max-w-[210px]">
                <span className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                  {permissions.showProfit ? <Unlock className="w-3.5 h-3.5 text-blue-600" /> : <Lock className="w-3.5 h-3.5 text-red-500" />}
                  经营毛利与预计利润
                </span>
                <p className="text-[10px] text-slate-500 leading-normal">
                  关闭后，开单页面、账单汇总和仪表盘将隐藏预计利润。
                </p>
              </div>

              <input
                type="checkbox"
                checked={permissions.showProfit}
                onChange={() => handleToggle("showProfit")}
                className="rounded text-blue-600 bg-white border-slate-300 focus:ring-0 cursor-pointer"
              />
            </div>

            {/* Delete/Void receipts */}
            <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 transition-all flex items-center justify-between">
              <div className="space-y-0.5 max-w-[210px]">
                <span className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                  {permissions.canDelete ? <Unlock className="w-3.5 h-3.5 text-blue-600" /> : <Lock className="w-3.5 h-3.5 text-red-500" />}
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
                className="rounded text-blue-600 bg-white border-slate-300 focus:ring-0 cursor-pointer"
              />
            </div>

            {/* Modify quotes */}
            <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 transition-all flex items-center justify-between">
              <div className="space-y-0.5 max-w-[210px]">
                <span className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                  {permissions.canEditHistory ? <Unlock className="w-3.5 h-3.5 text-blue-600" /> : <Lock className="w-3.5 h-3.5 text-red-500" />}
                  编辑价格参考行情
                </span>
                <p className="text-[10px] text-slate-500 leading-normal">
                  锁定价格参考修改。防止店员编造虚低回收价骗取客户低价放卡。
                </p>
              </div>

              <input
                type="checkbox"
                checked={permissions.canEditHistory}
                onChange={() => handleToggle("canEditHistory")}
                className="rounded text-blue-600 bg-white border-slate-300 focus:ring-0 cursor-pointer"
              />
            </div>
          </div>
        </div>

        {/* LOG AUDITING STREAM (右2) */}
        <div className="lg:col-span-2 bg-white border border-slate-200 rounded-2xl p-5 space-y-4 shadow-sm">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 pb-2">
            <h3 className="text-xs font-black text-slate-950 uppercase tracking-wider flex items-center gap-1.5 font-mono">
              <FileText className="w-4 h-4 text-blue-600" />
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
                  className="bg-white border border-slate-200 rounded-lg text-[11px] text-slate-900 pl-7 pr-2 py-1.5 outline-none focus:border-blue-500"
                />
              </div>

              <button
                onClick={() => {
                  clearAllLogs();
                  alert("操作日志已清除，刷新后生效。");
                }}
                className="p-1.5 border border-red-200 bg-red-50 hover:bg-red-100 hover:text-red-700 rounded-lg text-red-500 cursor-pointer text-[10px] font-bold"
              >
                清理日志
              </button>
            </div>
          </div>

          {/* Audit logs stream list */}
          <div className="space-y-3.5 max-h-[440px] overflow-y-auto pr-1">
            {filteredLogs.length === 0 ? (
              <div className="p-16 text-center text-slate-400 italic text-xs">
                没有找到任何安全行为日志。
              </div>
            ) : (
              filteredLogs.map(item => (
                <div key={item.id} className="p-3 bg-slate-50 rounded-xl border border-slate-200 text-xs flex flex-col md:flex-row justify-between gap-3 font-mono">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] text-slate-500">{item.time}</span>
                      <span className="text-blue-700 font-extrabold text-[11px] bg-blue-50 border border-blue-100 px-1.5 py-0.2 rounded">
                        {item.user}
                      </span>
                      <span className="text-slate-800 font-bold text-[11px]">{item.module} &rarr; {item.type}</span>
                    </div>

                    <div className="text-slate-400 text-[11px] leading-relaxed pt-1">
                      操作详情: <span className="text-slate-600">{item.afterVal}</span>
                    </div>
                  </div>

                  {item.target && (
                    <div className="text-right shrink-0">
                      <span className="text-[9px] text-slate-400 block">关联单号或SN码</span>
                      <span className="text-emerald-600 font-bold block mt-1">{item.target}</span>
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
