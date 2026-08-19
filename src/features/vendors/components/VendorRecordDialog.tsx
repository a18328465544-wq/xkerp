import {zodResolver} from "@hookform/resolvers/zod";
import {Controller, useForm} from "react-hook-form";
import {useEffect} from "react";
import {Button, Dialog, Input, Select, Textarea} from "@/src/components/ui";
import {vendorLevels, vendorTypes, type VendorDirectoryItem, type VendorLevel, type VendorRecordFormValues, type VendorType} from "@/src/types/vendor";
import {vendorRecordSchema} from "../vendor.schema";

const emptyValues: VendorRecordFormValues = {name: "", contact: "", type: "上游供应商", level: "C级", isCoreCustomer: false, riskReason: "", remarks: ""};

function valuesFromVendor(vendor: VendorDirectoryItem | null): VendorRecordFormValues {
  if (!vendor) return emptyValues;
  return {name: vendor.name, contact: vendor.contact, type: vendor.type, level: vendor.level, isCoreCustomer: vendor.isCoreCustomer, riskReason: vendor.riskReason || "", remarks: vendor.remarks || ""};
}

export function VendorRecordDialog({open, vendor, pending, error, onOpenChange, onSubmit}: {open: boolean; vendor: VendorDirectoryItem | null; pending: boolean; error?: string; onOpenChange: (open: boolean) => void; onSubmit: (values: VendorRecordFormValues) => Promise<void>}) {
  const form = useForm<VendorRecordFormValues>({defaultValues: emptyValues, resolver: zodResolver(vendorRecordSchema), mode: "onBlur"});
  const {control, register, reset, handleSubmit, setValue, watch, formState} = form;
  const isCore = watch("isCoreCustomer");
  const type = watch("type");
  const level = watch("level");
  const coreLocked = type === "核心采购方";

  useEffect(() => {if (open) reset(valuesFromVendor(vendor));}, [open, reset, vendor]);
  const message = (field: keyof VendorRecordFormValues) => formState.errors[field]?.message ? String(formState.errors[field]?.message) : undefined;

  return <Dialog.Root open={open} onOpenChange={(next) => {if (!pending) onOpenChange(next);}}><Dialog.Portal><Dialog.Backdrop className="fixed inset-0 erp-modal-layer bg-[var(--erp-color-backdrop)] backdrop-blur-sm" /><Dialog.Viewport className="fixed inset-0 erp-modal-layer flex items-center justify-center p-3 sm:p-5"><Dialog.Popup className="erp-scrollbar max-h-[calc(100vh-1.5rem)] w-full max-w-3xl overflow-y-auto rounded-[var(--erp-radius-xl)] border border-[var(--erp-color-border)] bg-[var(--erp-color-surface)] shadow-[var(--erp-shadow-popover)]"><div className="border-b border-[var(--erp-color-border)] px-5 py-4"><Dialog.Title className="text-base font-bold">{vendor ? "编辑同行档案" : "新建同行档案"}</Dialog.Title><Dialog.Description className="mt-1 text-xs text-[var(--erp-color-text-secondary)]">核心采购方固定为核心同行和 S 级；R 级同行必须记录风险原因。</Dialog.Description></div><form className="space-y-5 p-5" onSubmit={(event) => {void handleSubmit(onSubmit)(event);}}><div className="grid gap-4 sm:grid-cols-2"><Field label="同行 / 商号名称" error={message("name")}><Input {...register("name")} placeholder="请输入同行或商号名称" autoFocus disabled={pending} /></Field><Field label="电话 / 微信 / 闲鱼号" error={message("contact")}><Input {...register("contact")} placeholder="请输入主要联系方式" disabled={pending} /></Field><Field label="往来类型" error={message("type")}><Controller control={control} name="type" render={({field}) => <Select value={field.value} onValueChange={(next) => {const nextType = next as VendorType; field.onChange(nextType); if (nextType === "核心采购方") {setValue("isCoreCustomer", true, {shouldDirty: true, shouldValidate: true}); setValue("level", "S级", {shouldDirty: true, shouldValidate: true});}}} options={vendorTypes.map((value) => ({value, label: value}))} disabled={pending} aria-label="往来类型" />} /></Field><Field label="同行等级" error={message("level")}><Controller control={control} name="level" render={({field}) => <Select value={field.value} onValueChange={(next) => field.onChange(next as VendorLevel)} options={vendorLevels.map((value) => ({value, label: value, disabled: value === "S级" && !isCore && !coreLocked}))} disabled={pending || coreLocked} aria-label="同行等级" />} /></Field></div><div className="rounded-[var(--erp-radius-lg)] border border-[var(--erp-color-border)] bg-[var(--erp-color-surface-muted)] p-4"><label className="flex cursor-pointer items-center gap-3 rounded-[var(--erp-radius-md)] border border-[var(--erp-color-border)] bg-[var(--erp-color-surface)] px-4 py-3 text-sm font-semibold"><input type="checkbox" checked={isCore || coreLocked} disabled={pending || coreLocked} onChange={(event) => {const checked = event.target.checked; setValue("isCoreCustomer", checked, {shouldDirty: true, shouldValidate: true}); if (checked) setValue("level", "S级", {shouldDirty: true, shouldValidate: true}); else if (level === "S级") setValue("level", "C级", {shouldDirty: true, shouldValidate: true});}} />核心同行（固定 S 级）</label>{level === "R级" && <div className="mt-4"><Field label="风险原因" error={message("riskReason")}><Input {...register("riskReason")} placeholder="请说明欠款、纠纷或其他风险" disabled={pending} /></Field></div>}</div><Field label="备注" error={message("remarks")}><Textarea {...register("remarks")} maxLength={300} placeholder="记录主营型号、交易习惯或停用说明" disabled={pending} /></Field>{error && <p role="alert" className="rounded-[var(--erp-radius-md)] bg-[var(--erp-color-danger-soft)] px-3 py-2 text-xs text-[var(--erp-color-danger)]">{error}</p>}<div className="flex justify-end gap-2 border-t border-[var(--erp-color-border)] pt-4"><Button type="button" variant="secondary" onClick={() => onOpenChange(false)} disabled={pending}>取消</Button><Button type="submit" variant="primary" disabled={pending}>{pending ? "保存中…" : vendor ? "保存修改" : "创建同行"}</Button></div></form></Dialog.Popup></Dialog.Viewport></Dialog.Portal></Dialog.Root>;
}

function Field({label, children}: {label: string; error?: string; children: React.ReactNode}) {
  return <label className="block text-sm font-semibold">{label}<div className="mt-2">{children}</div></label>;
}
