import {zodResolver} from "@hookform/resolvers/zod";
import {useEffect} from "react";
import {Controller, useForm} from "react-hook-form";
import {Button, Dialog, Input, Select, Textarea} from "@/src/components/ui";
import {customerChannelValues, partnerQuickCreateSchema, vendorTypeValues, type PartnerQuickCreateValues} from "@/src/lib/partnerQuickCreate";

export type ErpPartnerQuickCreateTarget = "customer" | "vendor";

export interface ErpPartnerQuickCreateDialogProps {
  open: boolean;
  target: ErpPartnerQuickCreateTarget | null;
  initialName?: string;
  pending?: boolean;
  error?: string;
  onOpenChange: (open: boolean) => void;
  onSubmit: (values: PartnerQuickCreateValues) => Promise<void> | void;
}

/** Shared quick-create presentation; feature adapters own API and permissions. */
export function ErpPartnerQuickCreateDialog({open, target, initialName = "", pending = false, error, onOpenChange, onSubmit}: ErpPartnerQuickCreateDialogProps) {
  const form = useForm<PartnerQuickCreateValues>({
    defaultValues: {name: initialName, contact: "", channel: "闲鱼", vendorType: "上游供应商", remarks: ""},
    resolver: zodResolver(partnerQuickCreateSchema),
    mode: "onBlur",
  });
  const {control, register, reset, handleSubmit} = form;

  useEffect(() => {
    if (open) reset({name: initialName, contact: "", channel: "闲鱼", vendorType: "上游供应商", remarks: ""});
  }, [initialName, open, reset, target]);

  const label = target === "vendor" ? "同行档案" : "个人客户";
  return <Dialog.Root open={open} onOpenChange={onOpenChange}>
    <Dialog.Portal>
      <Dialog.Backdrop className="fixed inset-0 erp-modal-layer bg-[var(--erp-color-backdrop)] backdrop-blur-sm" />
      <Dialog.Viewport className="fixed inset-0 erp-modal-layer flex items-center justify-center p-4">
        <Dialog.Popup className="w-full max-w-xl rounded-[var(--erp-radius-xl)] border border-[var(--erp-color-border)] bg-[var(--erp-color-surface)] shadow-[var(--erp-shadow-popover)]">
          <div className="flex items-start justify-between gap-4 border-b border-[var(--erp-color-border)] px-5 py-4">
            <div><Dialog.Title className="text-base font-bold">{target === "vendor" ? "新增同行档案" : "新增个人客户"}</Dialog.Title><Dialog.Description className="mt-1 text-xs text-[var(--erp-color-text-secondary)]">保存后自动选中，不离开当前单据。</Dialog.Description></div>
            <Dialog.Close render={<Button type="button" size="icon" variant="ghost" aria-label="关闭" disabled={pending}>×</Button>} />
          </div>
          <form onSubmit={(event) => {void handleSubmit(async (values) => {await onSubmit(values);})(event);}} className="space-y-4 p-5">
            {target === "customer" ? <div className="rounded-[var(--erp-radius-md)] border border-[var(--erp-color-info)] bg-[var(--erp-color-info-soft)] px-3 py-2 text-xs text-[var(--erp-color-primary)]">个人客户档案可同时用于回收和销售，不区分买货或卖货方向。</div> : <label className="block text-sm font-semibold">同行类型<Controller control={control} name="vendorType" render={({field}) => <Select className="mt-2" value={field.value} options={vendorTypeValues.map((value) => ({value, label: value}))} onValueChange={field.onChange} disabled={pending} aria-label="同行类型" />} /></label>}
            <div className="grid gap-4 sm:grid-cols-2"><label className="block text-sm font-semibold">{target === "vendor" ? "同行名称" : "客户姓名"}<Input {...register("name")} className="mt-2" placeholder={target === "vendor" ? "如：飞跃硬件批发部" : "如：李先生"} disabled={pending} autoFocus /></label><label className="block text-sm font-semibold">联系电话 / 微信<Input {...register("contact")} className="mt-2 font-mono" placeholder="可填写手机号或微信号" disabled={pending} /></label></div>
            {target === "customer" && <label className="block text-sm font-semibold">来源平台<Controller control={control} name="channel" render={({field}) => <Select className="mt-2" value={field.value} options={customerChannelValues.map((value) => ({value, label: value}))} onValueChange={field.onChange} disabled={pending} aria-label="客户来源平台" />} /></label>}
            <label className="block text-sm font-semibold">备注（可选）<Textarea {...register("remarks")} className="mt-2 min-h-20" placeholder="来源、账期、常交易型号等" disabled={pending} /></label>
            {error && <p role="alert" className="rounded-[var(--erp-radius-md)] bg-[var(--erp-color-danger-soft)] px-3 py-2 text-xs text-[var(--erp-color-danger)]">{error}</p>}
            <div className="flex justify-end gap-2 border-t border-[var(--erp-color-border)] pt-4"><Button type="button" variant="secondary" onClick={() => onOpenChange(false)} disabled={pending}>取消</Button><Button type="submit" variant="primary" disabled={pending}>{pending ? "保存中…" : `保存并选中${label}`}</Button></div>
          </form>
        </Dialog.Popup>
      </Dialog.Viewport>
    </Dialog.Portal>
  </Dialog.Root>;
}
