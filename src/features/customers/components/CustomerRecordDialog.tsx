import {zodResolver} from "@hookform/resolvers/zod";
import {Controller, useForm} from "react-hook-form";
import {useEffect} from "react";
import {Button, Dialog, Input, Select, Textarea} from "@/src/components/ui";
import type {CustomerDirectoryItem, CustomerLevel, CustomerRecordFormValues} from "@/src/types/customer";
import {customerLevels} from "@/src/types/customer";
import {customerRecordSchema} from "../customer.schema";

const commonSources = ["闲鱼", "微信", "抖音", "到店", "转介绍", "散客自荐", "其他"];
const commonTypes = ["个人买家客户", "个人卖家客户", "回收客户", "购买客户", "散客玩家", "老主顾", "售后敏感户"];
const emptyValues: CustomerRecordFormValues = {name: "", contact: "", type: "个人买家客户", source: "闲鱼", level: "C级", isCoreCustomer: false, riskReason: "", remarks: ""};

function valuesFromCustomer(customer: CustomerDirectoryItem | null): CustomerRecordFormValues {
  if (!customer) return emptyValues;
  return {name: customer.name, contact: customer.contact, type: customer.type, source: customer.source, level: customer.level, isCoreCustomer: customer.isCoreCustomer, riskReason: customer.riskReason || "", remarks: customer.remarks || ""};
}

export function CustomerRecordDialog({open, customer, channels, types, pending, error, onOpenChange, onSubmit}: {open: boolean; customer: CustomerDirectoryItem | null; channels: string[]; types: string[]; pending: boolean; error?: string; onOpenChange: (open: boolean) => void; onSubmit: (values: CustomerRecordFormValues) => Promise<void>}) {
  const form = useForm<CustomerRecordFormValues>({defaultValues: emptyValues, resolver: zodResolver(customerRecordSchema), mode: "onBlur"});
  const {control, register, reset, handleSubmit, setValue, watch, formState} = form;
  const isCore = watch("isCoreCustomer");
  const level = watch("level");

  useEffect(() => {if (open) reset(valuesFromCustomer(customer));}, [customer, open, reset]);
  const sourceOptions = Array.from(new Set([...commonSources, ...channels])).map((value) => ({value, label: value}));
  const typeOptions = Array.from(new Set([...commonTypes, ...types])).map((value) => ({value, label: value}));
  const message = (field: keyof CustomerRecordFormValues) => formState.errors[field]?.message ? String(formState.errors[field]?.message) : undefined;

  return <Dialog.Root open={open} onOpenChange={(next) => {if (!pending) onOpenChange(next);}}><Dialog.Portal><Dialog.Backdrop className="fixed inset-0 erp-modal-layer bg-[var(--erp-color-backdrop)] backdrop-blur-sm" /><Dialog.Viewport className="fixed inset-0 erp-modal-layer flex items-center justify-center p-3 sm:p-5"><Dialog.Popup className="erp-scrollbar max-h-[calc(100vh-1.5rem)] w-full max-w-3xl overflow-y-auto rounded-[var(--erp-radius-xl)] border border-[var(--erp-color-border)] bg-[var(--erp-color-surface)] shadow-[var(--erp-shadow-popover)]"><div className="border-b border-[var(--erp-color-border)] px-5 py-4"><Dialog.Title className="text-base font-bold">{customer ? "编辑客户档案" : "新建客户档案"}</Dialog.Title><Dialog.Description className="mt-1 text-xs text-[var(--erp-color-text-secondary)]">沿用现有客户等级：核心客户固定 S 级，R 级必须说明风险原因。</Dialog.Description></div><form className="space-y-5 p-5" onSubmit={(event) => {void handleSubmit(onSubmit)(event);}}><div className="grid gap-4 sm:grid-cols-2"><Field label="客户名称" error={message("name")}><Input {...register("name")} placeholder="请输入客户名称" autoFocus disabled={pending} /></Field><Field label="电话 / 微信 / 闲鱼号" error={message("contact")}><Input {...register("contact")} placeholder="可留空，但同名客户可能被服务端拒绝" disabled={pending} /></Field><Field label="客户类型" error={message("type")}><Controller control={control} name="type" render={({field}) => <Select value={field.value} onValueChange={field.onChange} options={typeOptions} disabled={pending} aria-label="客户类型" />} /></Field><Field label="客户来源" error={message("source")}><Controller control={control} name="source" render={({field}) => <Select value={field.value} onValueChange={field.onChange} options={sourceOptions} disabled={pending} aria-label="客户来源" />} /></Field></div><div className="rounded-[var(--erp-radius-lg)] border border-[var(--erp-color-border)] bg-[var(--erp-color-surface-muted)] p-4"><div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_auto]"><Field label="客户等级" error={message("level")}><Controller control={control} name="level" render={({field}) => <Select value={field.value} onValueChange={(next) => field.onChange(next as CustomerLevel)} options={customerLevels.map((value) => ({value, label: value, disabled: value === "S级" && !isCore}))} disabled={pending} aria-label="客户等级" />} /></Field><label className="flex min-h-16 cursor-pointer items-center gap-3 rounded-[var(--erp-radius-md)] border border-[var(--erp-color-border)] bg-[var(--erp-color-surface)] px-4 text-sm font-semibold"><input type="checkbox" checked={isCore} disabled={pending} onChange={(event) => {const checked = event.target.checked; setValue("isCoreCustomer", checked, {shouldDirty: true, shouldValidate: true}); if (checked) setValue("level", "S级", {shouldDirty: true, shouldValidate: true}); else if (level === "S级") setValue("level", "C级", {shouldDirty: true, shouldValidate: true});}} />核心客户（固定 S 级）</label></div>{level === "R级" && <div className="mt-4"><Field label="风险原因" error={message("riskReason")}><Input {...register("riskReason")} placeholder="请说明欠款、纠纷或其他风险" disabled={pending} /></Field></div>}</div><Field label="备注" error={message("remarks")}><Textarea {...register("remarks")} maxLength={300} placeholder="记录偏好、交易习惯或停用说明" disabled={pending} /></Field>{error && <p role="alert" className="rounded-[var(--erp-radius-md)] bg-[var(--erp-color-danger-soft)] px-3 py-2 text-xs text-[var(--erp-color-danger)]">{error}</p>}<div className="flex justify-end gap-2 border-t border-[var(--erp-color-border)] pt-4"><Button type="button" variant="secondary" onClick={() => onOpenChange(false)} disabled={pending}>取消</Button><Button type="submit" variant="primary" disabled={pending}>{pending ? "保存中…" : customer ? "保存修改" : "创建客户"}</Button></div></form></Dialog.Popup></Dialog.Viewport></Dialog.Portal></Dialog.Root>;
}

function Field({label, children}: {label: string; error?: string; children: React.ReactNode}) {
  return <label className="block text-sm font-semibold">{label}<div className="mt-2">{children}</div></label>;
}
