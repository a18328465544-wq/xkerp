import type {ReactNode} from "react";
import {Button, Dialog} from "@/src/components/ui";

export interface ErpDocumentDeleteDialogProps {
  open: boolean;
  title: ReactNode;
  documentName: string;
  description: ReactNode;
  pending: boolean;
  error?: string;
  onOpenChange: (open: boolean) => void;
  onConfirm: () => void;
}

/**
 * Shared destructive-action confirmation for business documents.
 * The server remains authoritative for permissions and business-stage checks.
 */
export function ErpDocumentDeleteDialog({open, title, documentName, description, pending, error, onOpenChange, onConfirm}: ErpDocumentDeleteDialogProps) {
  return <Dialog.Root open={open} onOpenChange={(nextOpen) => {if (!pending) onOpenChange(nextOpen);}}>
    <Dialog.Portal>
      <Dialog.Backdrop className="fixed inset-0 erp-modal-layer bg-[var(--erp-color-backdrop)] backdrop-blur-sm" />
      <Dialog.Viewport className="fixed inset-0 erp-modal-layer flex items-center justify-center p-4">
        <Dialog.Popup className="w-full max-w-md rounded-[var(--erp-radius-xl)] border border-[var(--erp-color-border)] bg-[var(--erp-color-surface)] p-5 shadow-[var(--erp-shadow-popover)]">
          <Dialog.Title className="text-base font-bold text-[var(--erp-color-text)]">{title}</Dialog.Title>
          <Dialog.Description className="mt-2 text-sm leading-6 text-[var(--erp-color-text-secondary)]">
            确认删除「{documentName}」？{description}
          </Dialog.Description>
          {error && <p role="alert" className="mt-3 rounded-[var(--erp-radius-md)] bg-[var(--erp-color-danger-soft)] px-3 py-2 text-xs leading-5 text-[var(--erp-color-danger)]">{error}</p>}
          <div className="mt-5 flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => onOpenChange(false)} disabled={pending}>取消</Button>
            <Button type="button" variant="danger" onClick={onConfirm} disabled={pending}>{pending ? "删除中…" : "确认删除"}</Button>
          </div>
        </Dialog.Popup>
      </Dialog.Viewport>
    </Dialog.Portal>
  </Dialog.Root>;
}
