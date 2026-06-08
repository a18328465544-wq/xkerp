import React from "react";
import { AlertTriangle, RotateCcw } from "lucide-react";
import { DISPLAY_APP_VERSION } from "../utils/version";

interface Props {
  children: React.ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export default class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error("Uncaught error rendering App:", error, errorInfo);
  }

  handleClearAndReset = () => {
    try {
      localStorage.clear();
      // Clear all possible cookies as well
      const cookies = document.cookie.split(";");
      for (let i = 0; i < cookies.length; i++) {
        const cookie = cookies[i];
        const eqPos = cookie.indexOf("=");
        const name = eqPos > -1 ? cookie.substr(0, eqPos) : cookie;
        document.cookie = name + "=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/";
      }
      alert("🎉 系统数据缓存已全部清除并校准，正在重新加载...");
      window.location.reload();
    } catch (e) {
      console.error(e);
      window.location.reload();
    }
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center p-6 font-sans">
          <div className="max-w-md w-full bg-slate-900 border border-slate-800 rounded-2xl p-6 text-center space-y-6 shadow-xl relative overflow-hidden">
            <div className="absolute top-0 left-0 w-full h-1.5 bg-gradient-to-r from-cyan-500 to-indigo-600"></div>
            
            <div className="flex justify-center">
              <div className="w-16 h-16 rounded-full bg-rose-500/10 border border-rose-500/20 flex items-center justify-center text-rose-400">
                <AlertTriangle className="w-8 h-8" />
              </div>
            </div>

            <div className="space-y-2">
              <h1 className="text-lg font-black tracking-wide text-slate-200">
                核芯数据库或渲染网关冲突
              </h1>
              <p className="text-xs text-slate-400 leading-relaxed">
                发现本地缓存数据与新版程序存在冲突，或者页面渲染时遇到异常。
              </p>
            </div>

            {this.state.error && (
              <div className="bg-slate-950 p-3 rounded-lg border border-slate-855 text-left">
                <span className="text-[10px] text-slate-500 font-mono block mb-1">Error Logs:</span>
                <p className="font-mono text-[11px] text-rose-400 leading-normal break-all font-bold">
                  {this.state.error.toString()}
                </p>
              </div>
            )}

            <div className="pt-2 flex flex-col gap-2.5">
              <button
                onClick={this.handleClearAndReset}
                className="w-full py-2.5 px-4 bg-gradient-to-r from-cyan-500 to-indigo-600 hover:from-cyan-400 hover:to-indigo-500 text-white rounded-xl font-bold text-xs flex items-center justify-center gap-2 shadow-lg shadow-cyan-500/15 hover:shadow-cyan-500/25 transition-all cursor-pointer"
              >
                <RotateCcw className="w-4 h-4" />
                清除冲突缓存并重载系统 (一键修复)
              </button>

              <button
                onClick={() => window.location.reload()}
                className="w-full py-2.5 px-4 bg-slate-800 hover:bg-slate-755 text-slate-300 rounded-xl font-bold text-xs flex items-center justify-center gap-2 border border-slate-755 transition-colors cursor-pointer"
              >
                刷新当前页面试试
              </button>
            </div>

            <p className="text-[10px] text-slate-500 leading-none">
              精诚显卡进销存 {DISPLAY_APP_VERSION} 安全防护系统
            </p>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
