import {useState, type FormEventHandler, type ReactNode} from "react";
import {Button, Dialog} from "@/src/components/ui";

type FinanceEntryDialogShellProps = {
  open: boolean;
  pending: boolean;
  title: string;
  description: string;
  submitLabel: string;
  submitDisabled?: boolean;
  error?: string;
  preview?: string;
  previewAlt: string;
  children: ReactNode;
  onOpenChange: (open: boolean) => void;
  onSubmit: FormEventHandler<HTMLFormElement>;
  onPreviewChange: (preview?: string) => void;
};

export function FinanceEntryDialogShell({
  open,
  pending,
  title,
  description,
  submitLabel,
  submitDisabled = false,
  error,
  preview,
  previewAlt,
  children,
  onOpenChange,
  onSubmit,
  onPreviewChange,
}: FinanceEntryDialogShellProps) {
  return (
    <>
      <Dialog.Root open={open} onOpenChange={(next) => { if (!pending) onOpenChange(next); }}>
        <Dialog.Portal>
          <Dialog.Backdrop className="fixed inset-0 erp-modal-layer bg-[var(--erp-color-backdrop)] backdrop-blur-sm" />
          <Dialog.Viewport className="fixed inset-0 erp-modal-layer flex items-center justify-center p-4">
            <Dialog.Popup className="max-h-[92vh] w-full max-w-4xl overflow-y-auto rounded-[var(--erp-radius-xl)] border border-[var(--erp-color-border)] bg-[var(--erp-color-surface)] shadow-[var(--erp-shadow-popover)]">
              <div className="border-b border-[var(--erp-color-border)] px-5 py-4">
                <Dialog.Title className="text-lg font-bold">{title}</Dialog.Title>
                <Dialog.Description className="mt-1 text-xs text-[var(--erp-color-text-secondary)]">{description}</Dialog.Description>
              </div>
              <form onSubmit={onSubmit}>
                <div className="grid gap-4 p-5 md:grid-cols-2">
                  {children}
                  {error && <p role="alert" className="md:col-span-2 rounded-[var(--erp-radius-md)] bg-[var(--erp-color-danger-soft)] px-3 py-2 text-xs text-[var(--erp-color-danger)]">{error}</p>}
                </div>
                <div className="flex justify-end gap-2 border-t border-[var(--erp-color-border)] px-5 py-4">
                  <Button type="button" variant="secondary" onClick={() => onOpenChange(false)} disabled={pending}>取消</Button>
                  <Button type="submit" variant="primary" disabled={pending || submitDisabled}>{submitLabel}</Button>
                </div>
              </form>
            </Dialog.Popup>
          </Dialog.Viewport>
        </Dialog.Portal>
      </Dialog.Root>

      {preview && (
        <Dialog.Root open onOpenChange={(next) => { if (!next) onPreviewChange(); }}>
          <Dialog.Portal>
            <Dialog.Backdrop className="fixed inset-0 erp-modal-layer bg-[var(--erp-color-backdrop)]" />
            <Dialog.Viewport className="fixed inset-0 erp-modal-layer flex items-center justify-center p-8">
              <Dialog.Popup className="max-h-full max-w-5xl rounded-[var(--erp-radius-lg)] bg-[var(--erp-color-surface)] p-3">
                <Dialog.Title className="sr-only">凭证预览</Dialog.Title>
                <img src={preview} alt={previewAlt} className="max-h-[80vh] max-w-full object-contain" />
              </Dialog.Popup>
            </Dialog.Viewport>
          </Dialog.Portal>
        </Dialog.Root>
      )}
    </>
  );
}

export function FinanceEntryField({label, error, children}: {label: string; error?: string; children: ReactNode}) {
  return (
    <label className="block text-sm font-semibold">
      {label}
      <div className="mt-2">{children}</div>
      {error && <p className="mt-1 text-xs font-normal text-[var(--erp-color-danger)]">{error}</p>}
    </label>
  );
}

export function useFinanceEntryPreview() {
  const [preview, setPreview] = useState<string>();
  return {preview, setPreview};
}
