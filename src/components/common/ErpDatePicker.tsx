import {Popover as BasePopover} from "@base-ui/react/popover";
import {CalendarDays, X} from "lucide-react";
import {useEffect, useState} from "react";
import {Button} from "@/src/components/ui";
import {ErpCalendar} from "./ErpCalendar";
import {cn} from "@/src/lib/cn";
import {formatDateKey, parseDateKey} from "@/src/lib/dateRangePickerUtils";

function parseDateInput(value?: string) {
  return value ? parseDateKey(value) || undefined : undefined;
}

function formatDateInput(date: Date) {
  return formatDateKey(date);
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

export interface ErpDatePickerProps {
  value?: string;
  onChange: (value: string) => void;
  /** Use the compact control height when the picker lives in a filter toolbar. */
  density?: "default" | "compact";
  min?: string;
  max?: string;
  placeholder?: string;
  disabled?: boolean;
  required?: boolean;
  invalid?: boolean;
  "aria-label"?: string;
  "aria-describedby"?: string;
  className?: string;
}

/** A controlled, accessible date field backed by the shared Base UI popover. */
export function ErpDatePicker({value, onChange, density = "default", min, max, placeholder = "选择日期", disabled, required, invalid, "aria-label": ariaLabel, "aria-describedby": ariaDescribedBy, className}: ErpDatePickerProps) {
  const [open, setOpen] = useState(false);
  const selected = parseDateInput(value);
  const minDate = parseDateInput(min);
  const maxDate = parseDateInput(max);
  const compactViewport = useCompactViewport();
  const hasCustomWidth = Boolean(className?.match(/(?:^|\s)!?w-/));
  const controlHeight = density === "compact" ? "h-[var(--erp-control-height-compact)]" : "h-[var(--erp-control-height)]";

  return <BasePopover.Root open={open} onOpenChange={setOpen}>
    <BasePopover.Trigger
      className={cn("erp-focus-ring flex items-center justify-between gap-2 rounded-[var(--erp-radius-md)] border border-[var(--erp-color-border)] bg-[var(--erp-color-surface)] px-3 text-left text-sm text-[var(--erp-color-text)] transition-colors hover:border-[var(--erp-color-border-strong)] data-disabled:cursor-not-allowed data-disabled:bg-[var(--erp-color-surface-muted)] data-disabled:text-[var(--erp-color-text-muted)]", controlHeight, invalid && "border-[var(--erp-color-danger)]", hasCustomWidth ? undefined : "w-full", className)}
      disabled={disabled}
      aria-label={ariaLabel}
      aria-required={required}
      aria-invalid={invalid || undefined}
      aria-describedby={ariaDescribedBy}
    >
      <span className={cn("truncate", selected && "font-mono", !selected && "text-[var(--erp-color-text-muted)]")}>{selected ? formatDateInput(selected) : placeholder}</span>
      <CalendarDays className="h-4 w-4 shrink-0 text-[var(--erp-color-text-muted)]" aria-hidden="true" />
    </BasePopover.Trigger>
    <BasePopover.Portal>
      {open && compactViewport && <div className="erp-popover-layer fixed inset-0 bg-[var(--erp-color-backdrop)]/35 sm:hidden" aria-hidden="true" onMouseDown={() => setOpen(false)} />}
      <BasePopover.Positioner className="erp-popover-layer outline-none" sideOffset={4}>
        <BasePopover.Popup className="relative rounded-[var(--erp-radius-lg)] border border-[var(--erp-color-border)] bg-[var(--erp-color-surface)] shadow-[var(--erp-shadow-popover)] outline-none max-sm:!fixed max-sm:inset-x-2 max-sm:bottom-2 max-sm:top-auto max-sm:max-h-[calc(100dvh-1rem)] max-sm:w-[calc(100vw-1rem)] max-sm:max-w-none">
          <div className="flex items-center justify-between border-b border-[var(--erp-color-border)] px-3 py-2.5 sm:hidden">
            <p className="text-sm font-semibold text-[var(--erp-color-text)]">选择日期</p>
            <Button type="button" size="icon" variant="ghost" aria-label="关闭日期" onClick={() => setOpen(false)}>
              <X className="h-4 w-4" aria-hidden="true" />
            </Button>
          </div>
          <ErpCalendar selected={selected} onSelect={(date) => { if (date) { onChange(formatDateInput(date)); setOpen(false); } }} minDate={minDate} maxDate={maxDate} />
        </BasePopover.Popup>
      </BasePopover.Positioner>
    </BasePopover.Portal>
  </BasePopover.Root>;
}
