import {X} from "lucide-react";
import type {ReactNode} from "react";
import {Dialog} from "@/src/components/ui";
import {Button} from "@/src/components/ui";
import {cn} from "@/src/lib/cn";

export function ErpDetailDrawer({open, onOpenChange, title, description, children, footer}: {open: boolean; onOpenChange: (open: boolean) => void; title: ReactNode; description?: ReactNode; children: ReactNode; footer?: ReactNode}) {
  return <Dialog.Root open={open} onOpenChange={onOpenChange}>
    <Dialog.Portal>
      <Dialog.Backdrop className="erp-drawer-backdrop-layer erp-drawer-backdrop fixed inset-x-0 bottom-0 bg-[var(--erp-color-backdrop)] backdrop-blur-[2px]" />
      <Dialog.Viewport className="erp-drawer-layer erp-drawer-viewport fixed inset-x-0 bottom-0 flex justify-end">
        <Dialog.Popup className={cn("flex h-full max-h-full w-full max-w-xl flex-col border-l border-[var(--erp-color-border)] bg-[var(--erp-color-surface)] shadow-[var(--erp-shadow-popover)]")}> 
          <div className="flex shrink-0 items-start justify-between gap-3 border-b border-[var(--erp-color-border)] px-4 py-3 sm:gap-4 sm:px-5 sm:py-4">
            <div className="min-w-0"><Dialog.Title className="truncate text-base font-bold text-[var(--erp-color-text)]">{title}</Dialog.Title><Dialog.Description className="erp-annotation-slot mt-1 text-xs text-[var(--erp-color-text-secondary)]" data-empty={!description || undefined} aria-hidden={!description || undefined}>{description || "\u00a0"}</Dialog.Description></div>
            <Dialog.Close render={<Button aria-label="关闭详情" size="icon" variant="ghost"><X className="h-4 w-4" /></Button>} />
          </div>
          <div className="erp-scrollbar min-h-0 flex-1 overflow-y-auto p-4 sm:p-5">{children}</div>
          {footer && <div className="erp-safe-area-bottom shrink-0 border-t border-[var(--erp-color-border)] px-4 py-3 sm:px-5 sm:py-4">{footer}</div>}
        </Dialog.Popup>
      </Dialog.Viewport>
    </Dialog.Portal>
  </Dialog.Root>;
}
