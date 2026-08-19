import {zodResolver} from "@hookform/resolvers/zod";
import {Controller, useForm} from "react-hook-form";
import {useEffect, type ReactNode} from "react";
import {Button, Dialog, Input, Select} from "@/src/components/ui";
import {ErpAmountInput} from "@/src/components/common";
import {financeAccountTypes, type FinanceAccountCreateValues, type FinanceAccountItem, type FinanceAccountReconcileValues, type FinanceAccountType} from "@/src/types/finance-account";
import {financeAccountCreateSchema, financeAccountReconcileSchema} from "../finance-account.schema";

export function FinanceAccountCreateDialog({open, pending, error, onOpenChange, onSubmit}: {open: boolean; pending: boolean; error?: string; onOpenChange: (open: boolean) => void; onSubmit: (values: FinanceAccountCreateValues) => Promise<void>}) {
  const form = useForm<FinanceAccountCreateValues>({defaultValues: {name: "", type: "银行卡"}, resolver: zodResolver(financeAccountCreateSchema), mode: "onBlur"});
  useEffect(() => {if (open) form.reset({name: "", type: "银行卡"});}, [form, open]);
  return <Dialog.Root open={open} onOpenChange={(next) => {if (!pending) onOpenChange(next);}}>
    <Dialog.Portal>
      <Dialog.Backdrop className="fixed inset-0 erp-modal-layer bg-[var(--erp-color-backdrop)] backdrop-blur-sm" />
      <Dialog.Viewport className="fixed inset-0 erp-modal-layer flex items-center justify-center p-4">
        <Dialog.Popup className="w-full max-w-lg rounded-[var(--erp-radius-xl)] border border-[var(--erp-color-border)] bg-[var(--erp-color-surface)] shadow-[var(--erp-shadow-popover)]">
          <div className="border-b border-[var(--erp-color-border)] px-5 py-4">
            <Dialog.Title className="text-base font-bold">新增资金账户</Dialog.Title>
            <Dialog.Description className="mt-1 text-xs text-[var(--erp-color-text-secondary)]">新账户按现有业务规则以 0 元启用，并允许业务动作形成负余额。</Dialog.Description>
          </div>
          <form className="space-y-4 p-5" onSubmit={(event) => {void form.handleSubmit(onSubmit)(event);}}>
            <Field label="账户名称" error={form.formState.errors.name?.message}><Input {...form.register("name")} placeholder="例如：建行经营账户" autoFocus disabled={pending} /></Field>
            <Field label="账户类型" error={form.formState.errors.type?.message}><Controller control={form.control} name="type" render={({field}) => <Select value={field.value} onValueChange={(value) => field.onChange(value as FinanceAccountType)} options={financeAccountTypes.map((value) => ({value, label: value}))} aria-label="账户类型" disabled={pending} />} /></Field>
            <div className="rounded-[var(--erp-radius-md)] bg-[var(--erp-color-info-soft)] px-3 py-2 text-xs text-[var(--erp-color-text-secondary)]">账户初始账面、可用和冻结金额均为 0；本页不会伪造期初余额。</div>
            {error && <p role="alert" className="rounded-[var(--erp-radius-md)] bg-[var(--erp-color-danger-soft)] px-3 py-2 text-xs text-[var(--erp-color-danger)]">{error}</p>}
            <div className="flex justify-end gap-2 border-t border-[var(--erp-color-border)] pt-4"><Button type="button" variant="secondary" onClick={() => onOpenChange(false)} disabled={pending}>取消</Button><Button type="submit" variant="primary" disabled={pending}>{pending ? "创建中…" : "创建账户"}</Button></div>
          </form>
        </Dialog.Popup>
      </Dialog.Viewport>
    </Dialog.Portal>
  </Dialog.Root>;
}

export function FinanceAccountReconcileDialog({account, pending, error, onOpenChange, onSubmit}: {account: FinanceAccountItem | null; pending: boolean; error?: string; onOpenChange: (open: boolean) => void; onSubmit: (values: FinanceAccountReconcileValues) => Promise<void>}) {
  const form = useForm<FinanceAccountReconcileValues>({defaultValues: {actualBalance: 0}, resolver: zodResolver(financeAccountReconcileSchema), mode: "onBlur"});
  useEffect(() => {if (account) form.reset({actualBalance: account.actualBalance ?? account.balance});}, [account, form]);
  const actual = form.watch("actualBalance");
  const difference = account ? Number(actual || 0) - account.balance : 0;
  return <Dialog.Root open={Boolean(account)} onOpenChange={(open) => {if (!open && !pending) onOpenChange(false);}}>
    <Dialog.Portal>
      <Dialog.Backdrop className="fixed inset-0 erp-modal-layer bg-[var(--erp-color-backdrop)] backdrop-blur-sm" />
      <Dialog.Viewport className="fixed inset-0 erp-modal-layer flex items-center justify-center p-4">
        <Dialog.Popup className="w-full max-w-lg rounded-[var(--erp-radius-xl)] border border-[var(--erp-color-border)] bg-[var(--erp-color-surface)] shadow-[var(--erp-shadow-popover)]">
          <div className="border-b border-[var(--erp-color-border)] px-5 py-4"><Dialog.Title className="text-base font-bold">实盘核对 · {account?.name}</Dialog.Title><Dialog.Description className="mt-1 text-xs text-[var(--erp-color-text-secondary)]">核对只记录实盘余额和差额，不会修改账面余额，也不会生成资金流水。</Dialog.Description></div>
          <form className="space-y-4 p-5" onSubmit={(event) => {void form.handleSubmit(onSubmit)(event);}}>
            <div className="grid grid-cols-2 gap-3 rounded-[var(--erp-radius-lg)] bg-[var(--erp-color-surface-muted)] p-4"><Summary label="账面余额" value={account?.balance || 0} /><Summary label="当前差额" value={difference} tone={Math.abs(difference) > 0.009 ? "warning" : "success"} /></div>
            <Field label="实盘余额" error={form.formState.errors.actualBalance?.message}><Controller control={form.control} name="actualBalance" render={({field}) => <ErpAmountInput allowNegative value={field.value} onValueChange={({floatValue}) => field.onChange(floatValue ?? 0)} disabled={pending} aria-label="实盘余额" />} /></Field>
            {error && <p role="alert" className="rounded-[var(--erp-radius-md)] bg-[var(--erp-color-danger-soft)] px-3 py-2 text-xs text-[var(--erp-color-danger)]">{error}</p>}
            <div className="flex justify-end gap-2 border-t border-[var(--erp-color-border)] pt-4"><Button type="button" variant="secondary" onClick={() => onOpenChange(false)} disabled={pending}>取消</Button><Button type="submit" variant="primary" disabled={pending}>{pending ? "记录中…" : "记录核对结果"}</Button></div>
          </form>
        </Dialog.Popup>
      </Dialog.Viewport>
    </Dialog.Portal>
  </Dialog.Root>;
}

export function FinanceAccountDeleteDialog({account, pending, onOpenChange, onConfirm}: {account: FinanceAccountItem | null; pending: boolean; onOpenChange: (open: boolean) => void; onConfirm: () => void}) {
  return <Dialog.Root open={Boolean(account)} onOpenChange={(open) => {if (!open && !pending) onOpenChange(false);}}><Dialog.Portal><Dialog.Backdrop className="fixed inset-0 erp-modal-layer bg-[var(--erp-color-backdrop)]" /><Dialog.Viewport className="fixed inset-0 erp-modal-layer flex items-center justify-center p-4"><Dialog.Popup className="w-full max-w-md rounded-[var(--erp-radius-xl)] border border-[var(--erp-color-border)] bg-[var(--erp-color-surface)] p-5 shadow-[var(--erp-shadow-popover)]"><Dialog.Title className="text-base font-bold">删除资金账户</Dialog.Title><Dialog.Description className="mt-2 text-sm leading-relaxed text-[var(--erp-color-text-secondary)]">确认删除「{account?.name}」？已有流水、收付款、调拨或业务单据关联时，服务端会拒绝删除。</Dialog.Description><div className="mt-5 flex justify-end gap-2"><Button type="button" variant="secondary" onClick={() => onOpenChange(false)} disabled={pending}>取消</Button><Button type="button" variant="danger" onClick={onConfirm} disabled={pending}>{pending ? "删除中…" : "确认删除"}</Button></div></Dialog.Popup></Dialog.Viewport></Dialog.Portal></Dialog.Root>;
}

function Field({label, children}: {label: string; error?: string; children: ReactNode}) {
  return <label className="block text-sm font-semibold">{label}<div className="mt-2">{children}</div></label>;
}

function Summary({label, value, tone}: {label: string; value: number; tone?: "warning" | "success"}) {
  const color = tone === "warning" ? "text-[var(--erp-color-warning)]" : tone === "success" ? "text-[var(--erp-color-success)]" : "text-[var(--erp-color-text)]";
  return <div><p className="text-xs text-[var(--erp-color-text-muted)]">{label}</p><p className={`mt-1 font-mono text-lg font-bold ${color}`}>¥{value.toLocaleString("zh-CN", {maximumFractionDigits: 2})}</p></div>;
}
