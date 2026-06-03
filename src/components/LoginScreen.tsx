import React, { useState } from "react";
import { LockKeyhole, LogIn, ShieldCheck } from "lucide-react";
import { DISPLAY_APP_VERSION } from "../utils/version";
import { useStoreStateReturn } from "../utils/state";

interface LoginScreenProps {
  storeState: useStoreStateReturn;
}

export default function LoginScreen({ storeState }: LoginScreenProps) {
  const [username, setUsername] = useState("admin");
  const [password, setPassword] = useState("admin123");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setIsSubmitting(true);
    try {
      await storeState.login(username, password);
    } catch (err) {
      setError(err instanceof Error ? err.message : "登录失败，请检查账号密码");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center p-6">
      <div className="w-full max-w-sm bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden">
        <div className="p-6 border-b border-slate-800 space-y-3">
          <div className="w-11 h-11 rounded-xl bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center">
            <ShieldCheck className="w-6 h-6 text-cyan-300" />
          </div>
          <div>
            <h1 className="text-lg font-black text-slate-100">成都显卡一号店进销存系统</h1>
            <p className="text-xs text-slate-500 mt-1 font-mono">{DISPLAY_APP_VERSION} · 账号登录</p>
          </div>
        </div>

        <form onSubmit={handleLogin} className="p-6 space-y-4">
          <label className="block space-y-1.5">
            <span className="text-[11px] text-slate-400 font-bold">账号</span>
            <input
              value={username}
              onChange={e => setUsername(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-cyan-500"
              placeholder="请输入账号"
              autoComplete="username"
            />
          </label>

          <label className="block space-y-1.5">
            <span className="text-[11px] text-slate-400 font-bold">密码</span>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-2 text-sm text-slate-100 focus:outline-none focus:border-cyan-500"
              placeholder="请输入密码"
              autoComplete="current-password"
            />
          </label>

          {error && (
            <div className="bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs px-3 py-2 rounded-lg">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full bg-cyan-500 hover:bg-cyan-400 disabled:bg-slate-700 disabled:text-slate-400 text-slate-950 font-black rounded-lg py-2.5 text-sm flex items-center justify-center gap-2 transition-colors"
          >
            {isSubmitting ? <LockKeyhole className="w-4 h-4" /> : <LogIn className="w-4 h-4" />}
            登录系统
          </button>
        </form>

        <div className="px-6 pb-6 text-[11px] text-slate-500 leading-relaxed">
          默认老板账号：<span className="font-mono text-slate-300">admin / admin123</span>。上线后请在权限管理中立刻修改密码。
        </div>
      </div>
    </div>
  );
}
