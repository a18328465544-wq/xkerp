import {useEffect, useState} from "react";
import {Button, Input, Select} from "@/src/components/ui";
import {ErpField} from "@/src/components/common/ErpField";
import {ErpPageError} from "@/src/components/common/ErpPageError";
import {gpuMemoryTypeValues, gpuVendorValues, type GpuCoreCreateInput, type GpuCoreRecord, type GpuMemoryType, type GpuSpecInput, type GpuVendor} from "@/src/types/gpuCore";
import {canonicalGpuCore} from "@/src/utils/gpuCoreCatalog";

export type GpuCatalogEdit = {kind: "core"; initialModel: string; requireSpec: boolean} | {kind: "spec"; core: GpuCoreRecord};
/** Mounted as a step inside the parent's existing dialog; never opens a nested modal. */
export function GpuCatalogEditor({edit, formId, onSaved, onBusy, createCore, addSpec}: {edit: GpuCatalogEdit; formId: string; onSaved: (core: GpuCoreRecord) => Promise<void>; onBusy: (busy: boolean) => void; createCore: (input: GpuCoreCreateInput) => Promise<GpuCoreRecord>; addSpec: (coreId: string, input: GpuSpecInput) => Promise<GpuCoreRecord>}) {
  const [vendor, setVendor] = useState<GpuVendor>("NVIDIA");
  const [model, setModel] = useState(edit.kind === "core" ? edit.initialModel : edit.core.model);
  const [capacity, setCapacity] = useState("");
  const [memoryType, setMemoryType] = useState<GpuMemoryType>("GDDR6");
  const [revision, setRevision] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const core = edit.kind === "core" ? canonicalGpuCore(vendor, model) : edit.core;
  useEffect(() => () => onBusy(false), [onBusy]);
  return <form id={formId} className="space-y-3" onSubmit={event => {
    event.preventDefault();
    if (busy) return;
    const save = async () => {
      if (!core) throw new Error("请输入带 RTX、GTX、RX 或 ARC 前缀的完整型号");
      const requiresSpec = edit.kind === "spec" || edit.requireSpec;
      if ((requiresSpec || capacity) && (!/^\d+$/.test(capacity) || Number(capacity) < 1 || Number(capacity) > 512)) throw new Error("请输入 1–512GB 的整数显存容量");
      const spec = {capacityGb: Number(capacity), memoryType, revision};
      const result = edit.kind === "spec" ? await addSpec(edit.core.id, spec) : await createCore({vendor, model: core.model, specs: capacity ? [spec] : []});
      await onSaved(result);
    };
    setBusy(true); onBusy(true); setError("");
    void save().catch(reason => setError(reason instanceof Error ? reason.message : "暂时无法保存，请稍后重试")).finally(() => {setBusy(false); onBusy(false);});
  }}>
    <p className="text-sm text-[var(--erp-color-text-secondary)]">{edit.kind === "core" ? "保存后回到原表单并选中此核心。不会创建商品、库存或报价。" : "新增规格不会修改已有商品。门店新增规格会标明非标准，不能覆盖标准目录。"}</p>
    {edit.kind === "core" && <div className="grid gap-3 sm:grid-cols-2"><ErpField label="核心厂商" required><Select aria-label="核心厂商" value={vendor} options={gpuVendorValues.map(value => ({value, label: value}))} disabled={busy} onValueChange={value => setVendor(value as GpuVendor)} /></ErpField><ErpField label="完整核心型号" required><Input aria-label="完整核心型号" value={model} disabled={busy} placeholder="例如 RTX4070TI" onChange={event => setModel(event.target.value)} /></ErpField></div>}
    <ErpField label="核心 ID"><Input readOnly value={core?.id || "待确认完整型号"} /></ErpField>
    <div className="grid gap-3 sm:grid-cols-2"><ErpField label="显存容量（GB）" required={edit.kind === "spec" || edit.requireSpec}><Input aria-label="显存容量（GB）" inputMode="numeric" value={capacity} disabled={busy} placeholder="例如 16" onChange={event => setCapacity(event.target.value)} /></ErpField><ErpField label="显存类型"><Select aria-label="显存类型" value={memoryType} options={gpuMemoryTypeValues.map(value => ({value, label: value}))} disabled={busy} onValueChange={value => setMemoryType(value as GpuMemoryType)} /></ErpField></div>
    <ErpField label="规格说明 / 修订（选填）" hint="例如扩容、魔改或 OEM 修订，不填写报价来源。"><Input value={revision} maxLength={30} disabled={busy} onChange={event => setRevision(event.target.value)} /></ErpField>
    {edit.kind === "core" && !edit.requireSpec && <p className="text-xs text-[var(--erp-color-text-secondary)]">行情可以先只建核心；创建实物商品前需补齐显存规格。</p>}
    {error && <ErpPageError title="保存失败" description={error} />}
  </form>;
}
export function GpuCatalogEditorFooter({formId, busy, onCancel}: {formId: string; busy: boolean; onCancel: () => void}) {
  return <><Button type="button" variant="secondary" disabled={busy} onClick={onCancel}>返回原表单</Button><Button type="submit" form={formId} loading={busy} variant="primary">保存并选中</Button></>;
}
