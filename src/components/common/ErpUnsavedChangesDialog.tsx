import {Dialog} from "@/src/components/ui";
import {Button} from "@/src/components/ui";

export function ErpUnsavedChangesDialog({open, onStay, onLeave}: {open: boolean; onStay: () => void; onLeave: () => void}) {
  return <Dialog.Root open={open} onOpenChange={(nextOpen) => {if (!nextOpen) onStay();}}>
    <Dialog.Portal>
      <Dialog.Backdrop className="erp-modal-layer fixed inset-0 bg-[var(--erp-color-backdrop)] backdrop-blur-sm" />
      <Dialog.Viewport className="erp-modal-layer fixed inset-0 flex items-center justify-center p-4">
        <Dialog.Popup className="w-full max-w-md rounded-[var(--erp-radius-xl)] border border-[var(--erp-color-border)] bg-[var(--erp-color-surface)] p-5 shadow-[var(--erp-shadow-popover)]">
          <Dialog.Title className="text-base font-bold text-[var(--erp-color-text)]">当前内容尚未保存</Dialog.Title>
          <Dialog.Description className="mt-2 text-sm leading-6 text-[var(--erp-color-text-secondary)]">离开后当前表单中的修改会丢失。你可以继续编辑，或确认放弃本次修改。</Dialog.Description>
          <div className="mt-5 flex justify-end gap-2">
            <Button type="button" variant="secondary" autoFocus onClick={onStay}>继续编辑</Button>
            <Button type="button" variant="danger" onClick={onLeave}>放弃并离开</Button>
          </div>
        </Dialog.Popup>
      </Dialog.Viewport>
    </Dialog.Portal>
  </Dialog.Root>;
}
