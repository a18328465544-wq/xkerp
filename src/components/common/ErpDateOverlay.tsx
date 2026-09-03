import {Popover as BasePopover} from "@base-ui/react/popover";
import {X} from "lucide-react";
import type {ReactElement, ReactNode} from "react";
import {useEffect, useState} from "react";
import {Button} from "@/src/components/ui";
import {cn} from "@/src/lib/cn";

export type ErpDateOverlayRenderContext = {
  compactViewport: boolean;
};

export interface ErpDateOverlayProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  trigger: ReactElement;
  children: ReactNode | ((context: ErpDateOverlayRenderContext) => ReactNode);
  className?: string;
  panelClassName?: string;
  title?: ReactNode;
  description?: ReactNode;
  headerMobileOnly?: boolean;
  closeLabel?: string;
  sideOffset?: number;
  align?: "start" | "center" | "end";
}

function useCompactViewport() {
  const [compact, setCompact] = useState(false);

  useEffect(() => {
    const media = window.matchMedia("(max-width: 639px)");
    const update = () => setCompact(media.matches);
    update();
    media.addEventListener?.("change", update);
    return () => media.removeEventListener?.("change", update);
  }, []);

  return compact;
}

/** Shared date overlay shell: trigger, layer contract, mobile sheet and header behavior. */
export function ErpDateOverlay({open, onOpenChange, trigger, children, className, panelClassName, title, description, headerMobileOnly, closeLabel = "关闭日期", sideOffset = 4, align = "start"}: ErpDateOverlayProps) {
  const compactViewport = useCompactViewport();
  const content = typeof children === "function" ? children({compactViewport}) : children;

  return (
    <div className={cn("min-w-0 max-w-full", className)}>
      <BasePopover.Root open={open} onOpenChange={onOpenChange}>
        <BasePopover.Trigger render={trigger} />
        <BasePopover.Portal>
          {open && compactViewport && <div className="erp-popover-layer fixed inset-0 bg-[var(--erp-color-backdrop)]/35 sm:hidden" aria-hidden="true" onMouseDown={() => onOpenChange(false)} />}
          <BasePopover.Positioner className="erp-popover-layer erp-popover-positioner erp-date-popover-positioner outline-none" sideOffset={sideOffset} align={align}>
            <BasePopover.Popup className={cn("erp-popover-surface relative min-w-0 max-w-full rounded-[var(--erp-radius-lg)] border border-[var(--erp-color-border)] bg-[var(--erp-color-surface)] shadow-[var(--erp-shadow-popover)] outline-none", panelClassName)}>
              {title ? <div className={cn("flex items-start justify-between gap-3 border-b border-[var(--erp-color-border)] px-3 py-2.5 sm:px-4", headerMobileOnly && "sm:hidden")}>
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-[var(--erp-color-text)]">{title}</p>
                  {description ? <p className="mt-0.5 truncate text-xs text-[var(--erp-color-text-muted)]">{description}</p> : null}
                </div>
                <Button type="button" size="icon" variant="ghost" className="-mr-1 -mt-1 shrink-0" aria-label={closeLabel} onClick={() => onOpenChange(false)}>
                  <X className="h-4 w-4" aria-hidden="true" />
                </Button>
              </div> : null}
              {content}
            </BasePopover.Popup>
          </BasePopover.Positioner>
        </BasePopover.Portal>
      </BasePopover.Root>
    </div>
  );
}
