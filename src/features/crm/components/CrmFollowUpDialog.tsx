import {zodResolver} from "@hookform/resolvers/zod";
import {Controller, useForm} from "react-hook-form";
import {useEffect} from "react";
import {Button, Dialog, Input, Select, Textarea} from "@/src/components/ui";
import {ErpAmountInput, ErpDateTimePicker} from "@/src/components/common";
import type {CrmAccount, CrmFollowUpFormValues} from "@/src/types/crm";
import {crmFollowUpSchema} from "../crm.schema";

const methodOptions = ["电话", "微信", "闲鱼", "淘宝", "到店", "其他"].map((value) => ({value, label: value}));
const resultOptions = ["继续跟进", "已报价", "已成交", "暂缓", "无效线索", "售后维护"].map((value) => ({value, label: value}));

function defaults(account: CrmAccount | null): CrmFollowUpFormValues {
  return {customerId: account?.legacyCustomerId || "", contactMethod: "微信", content: "", result: "继续跟进", nextFollowTime: "", nextAction: account?.nextAction || "", dealProbability: account?.dealProbability || 0, estimatedAmount: account?.estimatedAmount || 0, remarks: ""};
}

export function CrmFollowUpDialog({account, pending, error, onOpenChange, onSubmit}: {account: CrmAccount | null; pending: boolean; error?: string; onOpenChange: (open: boolean) => void; onSubmit: (values: CrmFollowUpFormValues) => Promise<void>}) {
  const form = useForm<CrmFollowUpFormValues>({resolver: zodResolver(crmFollowUpSchema), defaultValues: defaults(account)});
  useEffect(() => {form.reset(defaults(account));}, [account, form]);

  return <Dialog.Root open={Boolean(account)} onOpenChange={(open) => {if (!pending) onOpenChange(open);}}>
    <Dialog.Portal>
      <Dialog.Backdrop className="fixed inset-0 erp-modal-layer bg-[var(--erp-color-backdrop)] backdrop-blur-sm" />
      <Dialog.Viewport className="fixed inset-0 erp-modal-layer flex items-center justify-center p-4">
        <Dialog.Popup className="w-full max-w-2xl rounded-[var(--erp-radius-xl)] border border-[var(--erp-color-border)] bg-[var(--erp-color-surface)] shadow-[var(--erp-shadow-popover)]">
          <div className="border-b border-[var(--erp-color-border)] px-5 py-4"><Dialog.Title className="text-base font-bold">新增客户跟进</Dialog.Title><Dialog.Description className="mt-1 text-xs text-[var(--erp-color-text-secondary)]">{account ? `${account.displayName} · 跟进成功后由现有服务端同步客户阶段和时间线。` : "选择客户后录入跟进"}</Dialog.Description></div>
          <form onSubmit={form.handleSubmit(onSubmit)}>
            <div className="grid gap-4 p-5 sm:grid-cols-2">
              <label className="text-sm font-semibold">联系方式<Controller name="contactMethod" control={form.control} render={({field}) => <Select className="mt-2" value={field.value} onValueChange={field.onChange} options={methodOptions} aria-label="跟进联系方式" />} /></label>
              <label className="text-sm font-semibold">跟进结果<Controller name="result" control={form.control} render={({field}) => <Select className="mt-2" value={field.value} onValueChange={field.onChange} options={resultOptions} aria-label="跟进结果" />} /></label>
              <label className="sm:col-span-2 text-sm font-semibold">跟进内容<Textarea className="mt-2 min-h-24" {...form.register("content")} placeholder="记录客户反馈、关键需求和本次沟通结论" /></label>
              <label className="text-sm font-semibold">下次跟进时间<Controller name="nextFollowTime" control={form.control} render={({field}) => <ErpDateTimePicker className="mt-2" value={field.value} onChange={field.onChange} aria-label="下次跟进时间" />} /></label>
              <label className="text-sm font-semibold">下一步动作<Input className="mt-2" {...form.register("nextAction")} placeholder="例如：发送正式报价" /></label>
              <label className="text-sm font-semibold">成交概率（%）<Input className="mt-2" type="number" min="0" max="100" {...form.register("dealProbability", {valueAsNumber: true})} /></label>
              <label className="text-sm font-semibold">预计成交额<Controller name="estimatedAmount" control={form.control} render={({field}) => <ErpAmountInput className="mt-2" value={field.value} onValueChange={(values) => field.onChange(values.floatValue || 0)} />} /></label>
              <label className="sm:col-span-2 text-sm font-semibold">备注<Textarea className="mt-2 min-h-16" {...form.register("remarks")} placeholder="可选补充" /></label>
              {error && <p role="alert" className="sm:col-span-2 rounded-[var(--erp-radius-md)] bg-[var(--erp-color-danger-soft)] px-3 py-2 text-xs text-[var(--erp-color-danger)]">{error}</p>}
            </div>
            <div className="flex justify-end gap-2 border-t border-[var(--erp-color-border)] px-5 py-4"><Button type="button" variant="secondary" disabled={pending} onClick={() => onOpenChange(false)}>取消</Button><Button type="submit" variant="primary" disabled={pending || !account?.legacyCustomerId}>{pending ? "保存中…" : "保存跟进"}</Button></div>
          </form>
        </Dialog.Popup>
      </Dialog.Viewport>
    </Dialog.Portal>
  </Dialog.Root>;
}
