import {Dialog as DialogPrimitive} from "@base-ui/react/dialog";
import type {ComponentProps, ReactNode} from "react";
import {X} from "lucide-react";
import {Button} from "./button";
import {cn} from "@/src/lib/cn";

type DialogBackdropProps = ComponentProps<typeof DialogPrimitive.Backdrop>;
type DialogViewportProps = ComponentProps<typeof DialogPrimitive.Viewport>;
type DialogPopupProps = ComponentProps<typeof DialogPrimitive.Popup>;

function mergeDialogClassName<T>(base: string, className: string | ((state: T) => string | undefined) | undefined) {
  return typeof className === "function" ? (state: T) => cn(base, className(state)) : cn(base, className);
}

function ErpDialogBackdrop({className, ...props}: DialogBackdropProps) {
  return <DialogPrimitive.Backdrop {...props} className={mergeDialogClassName("erp-dialog-backdrop", className)} />;
}

function ErpDialogViewport({className, ...props}: DialogViewportProps) {
  return <DialogPrimitive.Viewport {...props} className={mergeDialogClassName("erp-dialog-viewport", className)} />;
}

function ErpDialogPopup({className, ...props}: DialogPopupProps) {
  return <DialogPrimitive.Popup {...props} className={mergeDialogClassName("erp-dialog-popup", className)} />;
}

/* Keep Base UI's complete Dialog API while centralizing the responsive
   contract for every feature dialog that imports this shared primitive. */
export const Dialog = {
  ...DialogPrimitive,
  Backdrop: ErpDialogBackdrop,
  Viewport: ErpDialogViewport,
  Popup: ErpDialogPopup,
} as typeof DialogPrimitive;

export function DialogSurface({title, description, children, className}: {title: ReactNode; description?: ReactNode; children: ReactNode; className?: string}) {
  return (
    <Dialog.Root>
      <Dialog.Portal>
        <Dialog.Backdrop className="erp-modal-layer fixed inset-0 bg-[var(--erp-color-backdrop)] backdrop-blur-sm" />
        <Dialog.Viewport className="erp-modal-layer fixed inset-0 flex items-center justify-center p-4">
          <Dialog.Popup className={cn("max-h-[calc(100dvh-1.5rem)] w-full max-w-lg overflow-y-auto rounded-[var(--erp-radius-xl)] border border-[var(--erp-color-border)] bg-[var(--erp-color-surface)] shadow-[var(--erp-shadow-popover)] sm:max-h-[calc(100dvh-2.5rem)]", className)}>
            <div className="flex items-start justify-between gap-3 border-b border-[var(--erp-color-border)] px-4 py-3 sm:gap-4 sm:px-5 sm:py-4">
              <div className="min-w-0"><Dialog.Title className="text-base font-bold text-[var(--erp-color-text)]">{title}</Dialog.Title><Dialog.Description className="erp-annotation-slot mt-1 text-xs text-[var(--erp-color-text-secondary)]" data-empty={!description || undefined} aria-hidden={!description || undefined}>{description || "\u00a0"}</Dialog.Description></div>
              <Dialog.Close render={<Button aria-label="关闭" size="icon" variant="ghost"><X className="h-4 w-4" /></Button>} />
            </div>
            <div className="p-4 sm:p-5">{children}</div>
          </Dialog.Popup>
        </Dialog.Viewport>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
