/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { Camera, Combine, PackagePlus, Plus, Search, ScanLine, Trash2 } from "lucide-react";
import { useStoreStateReturn } from "../utils/state";
import { getLockedHandlerFieldState } from "../utils/sessionUser";
import { AssemblyPartRecord, AssemblyOperationType, ProductCategory } from "../types";

interface AssemblyManagerProps {
  storeState: useStoreStateReturn;
}

type ScanTarget =
  | { scope: "beforeSn" }
  | { scope: "afterSn" }
  | { scope: "beforePart"; index: number }
  | { scope: "afterPart"; index: number };

declare global {
  interface Window {
    BarcodeDetector?: new (options?: { formats?: string[] }) => {
      detect: (source: HTMLVideoElement) => Promise<Array<{ rawValue?: string }>>;
    };
  }
}

const categoryOptions: ProductCategory[] = ["显卡", "CPU", "主板", "内存", "硬盘", "电源", "散热", "机箱", "整机", "其他配件"];

const emptyPart = (index: number): AssemblyPartRecord => ({
  partName: `配件-${index + 1}`,
  category: "其他配件",
  sn: "",
  remarks: ""
});

const formatSnList = (parts: AssemblyPartRecord[]) =>
  parts.length ? parts.map(part => `${part.partName} / ${part.sn}`).join("，") : "-";

export default function AssemblyManager({ storeState }: AssemblyManagerProps) {
  const { inventory, assemblyOperations, createAssemblyOperation, deleteAssemblyOperation, currentRole, currentUser } = storeState;
  const lockedHandler = getLockedHandlerFieldState(currentUser, currentRole);
  const [mode, setMode] = useState<AssemblyOperationType>("拆卸");
  const [search, setSearch] = useState("");
  const [beforeSn, setBeforeSn] = useState("");
  const [afterSn, setAfterSn] = useState("");
  const [afterProductName, setAfterProductName] = useState("组装成品");
  const [afterCategory, setAfterCategory] = useState<ProductCategory>("整机");
  const [afterParts, setAfterParts] = useState<AssemblyPartRecord[]>([emptyPart(0)]);
  const [beforeParts, setBeforeParts] = useState<AssemblyPartRecord[]>([emptyPart(0)]);
  const [remarks, setRemarks] = useState("");
  const [scanTarget, setScanTarget] = useState<ScanTarget | null>(null);
  const [scanMessage, setScanMessage] = useState("");
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const sourceCard = useMemo(() => {
    const keyword = beforeSn.trim().toLowerCase();
    if (!keyword) return null;
    return inventory.find(card => card.sn.toLowerCase() === keyword || card.id.toLowerCase() === keyword) || null;
  }, [beforeSn, inventory]);

  const filteredRecords = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    return assemblyOperations.filter(record => {
      if (!keyword) return true;
      return [
        record.id,
        record.type,
        record.handler,
        record.beforeSn,
        record.beforeProductName,
        record.afterSn,
        record.afterProductName,
        formatSnList(record.beforeParts),
        formatSnList(record.afterParts)
      ].filter(Boolean).join(" ").toLowerCase().includes(keyword);
    });
  }, [assemblyOperations, search]);

  const stopScanner = () => {
    streamRef.current?.getTracks().forEach(track => track.stop());
    streamRef.current = null;
    setScanTarget(null);
  };

  const applyScannedSn = (sn: string) => {
    const value = sn.trim();
    if (!value || !scanTarget) return;
    if (scanTarget.scope === "beforeSn") setBeforeSn(value);
    if (scanTarget.scope === "afterSn") setAfterSn(value);
    if (scanTarget.scope === "beforePart") {
      setBeforeParts(prev => prev.map((part, index) => index === scanTarget.index ? { ...part, sn: value } : part));
    }
    if (scanTarget.scope === "afterPart") {
      setAfterParts(prev => prev.map((part, index) => index === scanTarget.index ? { ...part, sn: value } : part));
    }
    stopScanner();
  };

  useEffect(() => {
    if (!scanTarget) return;
    let interval: number | undefined;
    let cancelled = false;

    const startScanner = async () => {
      try {
        if (!navigator.mediaDevices?.getUserMedia) {
          setScanMessage("当前浏览器不支持摄像头扫码，请直接手动输入 SN。");
          return;
        }
        streamRef.current = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
        if (cancelled) {
          streamRef.current.getTracks().forEach(track => track.stop());
          return;
        }
        if (videoRef.current) {
          videoRef.current.srcObject = streamRef.current;
          await videoRef.current.play();
        }
        if (!window.BarcodeDetector) {
          setScanMessage("摄像头已打开；当前浏览器未提供条码识别能力，请用扫码枪输入或手动输入。");
          return;
        }
        const detector = new window.BarcodeDetector({ formats: ["qr_code", "code_128", "code_39", "ean_13", "ean_8"] });
        setScanMessage("请将 SN 条码放入取景框。");
        interval = window.setInterval(async () => {
          if (!videoRef.current) return;
          const results = await detector.detect(videoRef.current);
          const code = results[0]?.rawValue;
          if (code) applyScannedSn(code);
        }, 600);
      } catch {
        setScanMessage("摄像头启动失败，请检查浏览器权限，或直接手动输入 SN。");
      }
    };

    void startScanner();
    return () => {
      cancelled = true;
      if (interval) window.clearInterval(interval);
      streamRef.current?.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    };
  }, [scanTarget]);

  const updatePart = (kind: "before" | "after", index: number, patch: Partial<AssemblyPartRecord>) => {
    const setter = kind === "before" ? setBeforeParts : setAfterParts;
    setter(prev => prev.map((part, i) => i === index ? { ...part, ...patch } : part));
  };

  const removePart = (kind: "before" | "after", index: number) => {
    const setter = kind === "before" ? setBeforeParts : setAfterParts;
    setter(prev => prev.length <= 1 ? prev : prev.filter((_, i) => i !== index));
  };

  const addPart = (kind: "before" | "after") => {
    const setter = kind === "before" ? setBeforeParts : setAfterParts;
    setter(prev => [...prev, emptyPart(prev.length)]);
  };

  const handleSubmit = () => {
    try {
      createAssemblyOperation({
        type: mode,
        handler: lockedHandler.value,
        beforeSn: mode === "拆卸" ? beforeSn : undefined,
        beforeParts: mode === "组装" ? beforeParts : [],
        afterSn: mode === "组装" ? afterSn : undefined,
        afterProductName: mode === "组装" ? afterProductName : undefined,
        afterCategory: mode === "组装" ? afterCategory : undefined,
        afterParts: mode === "拆卸" ? afterParts : [],
        remarks
      });
      setRemarks("");
      setBeforeSn("");
      setAfterSn("");
      setBeforeParts([emptyPart(0)]);
      setAfterParts([emptyPart(0)]);
      alert(`${mode}单已保存，库存状态已同步更新。`);
    } catch (error) {
      alert(error instanceof Error ? error.message : "组装拆卸保存失败");
    }
  };

  const handleDeleteRecord = (recordId: string) => {
    if (!window.confirm(`确认删除组装拆卸单 ${recordId}？系统会同步回滚对应库存状态。`)) return;
    try {
      deleteAssemblyOperation(recordId);
      alert("组装拆卸单已删除。");
    } catch (error) {
      alert(error instanceof Error ? error.message : "删除失败，请稍后再试。");
    }
  };

  const partTable = (kind: "before" | "after", parts: AssemblyPartRecord[]) => (
    <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
      <table className="min-w-[760px] w-full text-sm">
        <thead className="bg-slate-50 text-slate-500">
          <tr>
            <th className="px-4 py-3 text-left font-black">配件名称</th>
            <th className="px-4 py-3 text-left font-black">类目</th>
            <th className="px-4 py-3 text-left font-black">SN</th>
            <th className="px-4 py-3 text-left font-black">备注</th>
            <th className="px-4 py-3 text-center font-black">操作</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {parts.map((part, index) => (
            <tr key={`${kind}-${index}`} className="hover:bg-blue-50/40">
              <td className="px-3 py-2">
                <input
                  value={part.partName}
                  onChange={event => updatePart(kind, index, { partName: event.target.value })}
                  className="w-full h-11 rounded-lg border border-slate-200 bg-white px-3 text-slate-900 outline-none focus:border-blue-500"
                />
              </td>
              <td className="px-3 py-2">
                <select
                  value={part.category}
                  onChange={event => updatePart(kind, index, { category: event.target.value as ProductCategory })}
                  className="w-full h-11 rounded-lg border border-slate-200 bg-white px-3 text-slate-900 outline-none focus:border-blue-500"
                >
                  {categoryOptions.map(category => (
                    <option key={category} value={category}>{category}</option>
                  ))}
                </select>
              </td>
              <td className="px-3 py-2">
                <div className="flex gap-2">
                  <input
                    value={part.sn}
                    onChange={event => updatePart(kind, index, { sn: event.target.value })}
                    placeholder="扫码或手动输入 SN"
                    className="w-full h-11 rounded-lg border border-slate-200 bg-white px-3 text-slate-900 outline-none focus:border-blue-500"
                  />
                  <button
                    onClick={() => setScanTarget({ scope: kind === "before" ? "beforePart" : "afterPart", index })}
                    className="h-11 w-11 shrink-0 rounded-lg bg-blue-600 text-white flex items-center justify-center hover:bg-blue-500"
                    title="摄像头扫码录入"
                  >
                    <Camera className="w-4 h-4" />
                  </button>
                </div>
              </td>
              <td className="px-3 py-2">
                <input
                  value={part.remarks || ""}
                  onChange={event => updatePart(kind, index, { remarks: event.target.value })}
                  className="w-full h-11 rounded-lg border border-slate-200 bg-white px-3 text-slate-900 outline-none focus:border-blue-500"
                />
              </td>
              <td className="px-3 py-2 text-center">
                <button
                  onClick={() => removePart(kind, index)}
                  className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-slate-200 text-slate-500 hover:border-red-200 hover:bg-red-50 hover:text-red-600"
                  title="删除行"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );

  return (
    <div className="space-y-5 text-slate-900">
      <section className="rounded-2xl border border-slate-200 bg-white p-4 md:p-5 shadow-sm">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-blue-600 text-xs font-black">
              <Combine className="w-4 h-4" />
              组装拆卸单据
            </div>
            <h2 className="text-xl font-black mt-1">拆前、拆后、组装来源全部按 SN 留痕</h2>
          </div>
          <div className="inline-flex rounded-xl border border-slate-200 bg-slate-100 p-1">
            {(["拆卸", "组装"] as AssemblyOperationType[]).map(item => (
              <button
                key={item}
                onClick={() => setMode(item)}
                className={`px-5 py-2 rounded-lg text-sm font-black transition-colors ${mode === item ? "bg-blue-600 text-white shadow-sm" : "text-slate-500 hover:text-slate-900"}`}
              >
                {item}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-5 grid grid-cols-1 lg:grid-cols-4 gap-4">
          <label className="space-y-2">
            <span className="text-xs font-black text-slate-500">经办人</span>
            <input
              value={lockedHandler.value}
              disabled
              className="w-full h-12 rounded-xl border border-slate-200 bg-slate-50 px-4 font-bold text-slate-500"
            />
          </label>
          {mode === "拆卸" ? (
            <label className="space-y-2 lg:col-span-2">
              <span className="text-xs font-black text-slate-500">拆之前 SN</span>
              <div className="flex gap-2">
                <input
                  value={beforeSn}
                  onChange={event => setBeforeSn(event.target.value)}
                  placeholder="扫码或手动输入整卡 / 原件 SN"
                  className="w-full h-12 rounded-xl border border-slate-200 bg-white px-4 text-slate-900 outline-none focus:border-blue-500"
                />
                <button
                  onClick={() => setScanTarget({ scope: "beforeSn" })}
                  className="h-12 w-12 rounded-xl bg-blue-600 text-white flex items-center justify-center hover:bg-blue-500"
                  title="摄像头扫码录入"
                >
                  <ScanLine className="w-5 h-5" />
                </button>
              </div>
            </label>
          ) : (
            <>
              <label className="space-y-2">
                <span className="text-xs font-black text-slate-500">组装后名称</span>
                <input
                  value={afterProductName}
                  onChange={event => setAfterProductName(event.target.value)}
                  className="w-full h-12 rounded-xl border border-slate-200 bg-white px-4 text-slate-900 outline-none focus:border-blue-500"
                />
              </label>
              <label className="space-y-2">
                <span className="text-xs font-black text-slate-500">组装后类目</span>
                <select
                  value={afterCategory}
                  onChange={event => setAfterCategory(event.target.value as ProductCategory)}
                  className="w-full h-12 rounded-xl border border-slate-200 bg-white px-4 text-slate-900 outline-none focus:border-blue-500"
                >
                  {categoryOptions.map(category => (
                    <option key={category} value={category}>{category}</option>
                  ))}
                </select>
              </label>
            </>
          )}
          <label className="space-y-2">
            <span className="text-xs font-black text-slate-500">备注</span>
            <input
              value={remarks}
              onChange={event => setRemarks(event.target.value)}
              className="w-full h-12 rounded-xl border border-slate-200 bg-white px-4 text-slate-900 outline-none focus:border-blue-500"
            />
          </label>
        </div>

        {mode === "拆卸" && sourceCard && (
          <div className="mt-4 rounded-xl border border-blue-100 bg-blue-50 px-4 py-3 text-sm text-blue-900">
            已匹配：<b>{sourceCard.productName}</b> · 档案 {sourceCard.id} · 当前状态 {sourceCard.status} · 库位 {sourceCard.warehouseLocation}
          </div>
        )}

        {mode === "组装" && (
          <div className="mt-5 grid grid-cols-1 md:grid-cols-2 gap-4">
            <label className="space-y-2">
              <span className="text-xs font-black text-slate-500">组装后 SN</span>
              <div className="flex gap-2">
                <input
                  value={afterSn}
                  onChange={event => setAfterSn(event.target.value)}
                  placeholder="扫码或手动输入新成品 SN"
                  className="w-full h-12 rounded-xl border border-slate-200 bg-white px-4 text-slate-900 outline-none focus:border-blue-500"
                />
                <button
                  onClick={() => setScanTarget({ scope: "afterSn" })}
                  className="h-12 w-12 rounded-xl bg-blue-600 text-white flex items-center justify-center hover:bg-blue-500"
                  title="摄像头扫码录入"
                >
                  <ScanLine className="w-5 h-5" />
                </button>
              </div>
            </label>
          </div>
        )}

        <div className="mt-5 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-black text-slate-700">
              {mode === "拆卸" ? "拆之后配件 SN 表格" : "组装来源配件 SN 表格"}
            </h3>
            <button
              onClick={() => addPart(mode === "拆卸" ? "after" : "before")}
              className="inline-flex items-center gap-2 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-xs font-black text-blue-700 hover:bg-blue-100"
            >
              <Plus className="w-4 h-4" />
              加一行
            </button>
          </div>
          {mode === "拆卸" ? partTable("after", afterParts) : partTable("before", beforeParts)}
        </div>

        <div className="mt-5 flex justify-end">
          <button
            onClick={handleSubmit}
            className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-6 py-3 text-sm font-black text-white hover:bg-blue-500"
          >
            <PackagePlus className="w-4 h-4" />
            保存{mode}单
          </button>
        </div>
      </section>

      <section className="rounded-2xl border border-slate-200 bg-white p-4 md:p-5 shadow-sm">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 mb-4">
          <h3 className="text-base font-black">组装拆卸记录</h3>
          <label className="relative w-full md:w-80">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              value={search}
              onChange={event => setSearch(event.target.value)}
              placeholder="按单号、SN、名称、经办人筛选"
              className="w-full h-11 rounded-xl border border-slate-200 bg-white pl-10 pr-3 text-sm outline-none focus:border-blue-500"
            />
          </label>
        </div>
        <div className="overflow-x-auto rounded-xl border border-slate-200">
          <table className="min-w-[1080px] w-full text-sm">
            <thead className="bg-slate-50 text-slate-500">
              <tr>
                <th className="px-4 py-3 text-left font-black">单号</th>
                <th className="px-4 py-3 text-left font-black">时间</th>
                <th className="px-4 py-3 text-left font-black">类型</th>
                <th className="px-4 py-3 text-left font-black">拆前 / 来源</th>
                <th className="px-4 py-3 text-left font-black">拆后 / 成品</th>
                <th className="px-4 py-3 text-left font-black">经办人</th>
                <th className="px-4 py-3 text-left font-black">备注</th>
                <th className="px-4 py-3 text-right font-black">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredRecords.map(record => (
                <tr key={record.id} className="hover:bg-blue-50/40">
                  <td className="px-4 py-3 font-mono font-black text-blue-600">{record.id}</td>
                  <td className="px-4 py-3 text-slate-600">{record.time}</td>
                  <td className="px-4 py-3">
                    <span className="rounded-full bg-blue-50 px-2 py-1 text-xs font-black text-blue-700">{record.type}</span>
                  </td>
                  <td className="px-4 py-3 text-slate-700">{record.type === "拆卸" ? `${record.beforeProductName || "-"} / ${record.beforeSn || "-"}` : formatSnList(record.beforeParts)}</td>
                  <td className="px-4 py-3 text-slate-700">{record.type === "拆卸" ? formatSnList(record.afterParts) : `${record.afterProductName || "-"} / ${record.afterSn || "-"}`}</td>
                  <td className="px-4 py-3 text-slate-700">{record.handler}</td>
                  <td className="px-4 py-3 text-slate-500">{record.remarks || "-"}</td>
                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={() => handleDeleteRecord(record.id)}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-black text-rose-600 hover:bg-rose-100"
                    >
                      <Trash2 className="w-4 h-4" />
                      删除
                    </button>
                  </td>
                </tr>
              ))}
              {!filteredRecords.length && (
                <tr>
                  <td colSpan={8} className="px-4 py-10 text-center text-slate-400">暂无组装拆卸记录</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {scanTarget && (
        <div className="fixed inset-0 z-[90] bg-slate-950/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-4 shadow-2xl">
            <div className="flex items-center justify-between mb-3">
              <div className="font-black text-slate-900">扫码录入 SN</div>
              <button onClick={stopScanner} className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-black text-slate-600">关闭</button>
            </div>
            <video ref={videoRef} className="h-72 w-full rounded-xl bg-slate-950 object-cover" muted playsInline />
            <p className="mt-3 rounded-xl bg-blue-50 px-3 py-2 text-xs font-bold text-blue-700">{scanMessage || "正在请求摄像头权限..."}</p>
          </div>
        </div>
      )}
    </div>
  );
}
