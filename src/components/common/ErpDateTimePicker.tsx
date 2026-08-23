import {Popover as BasePopover} from "@base-ui/react/popover";
import {CalendarClock, X} from "lucide-react";
import {useState} from "react";
import {Button, Input} from "@/src/components/ui";
import {cn} from "@/src/lib/cn";
import {formatDateKey, isDateKey, parseDateKey} from "@/src/lib/dateRangePickerUtils";
import {ErpCalendar} from "./ErpCalendar";

const TIME_PATTERN = /^(\d{2}):(\d{2})$/;
const DATE_TIME_PATTERN = /^(\d{4}-\d{2}-\d{2})[T\s](\d{2}):(\d{2})/;

type DateTimeParts = {dateKey: string; time: string};

function isTimeKey(value: string): boolean {
  const match = TIME_PATTERN.exec(value);
  if (!match) return false;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  return hours >= 0 && hours <= 23 && minutes >= 0 && minutes <= 59;
}

function parseDateTime(value?: string): DateTimeParts {
  if (!value) return {dateKey: "", time: ""};
  const match = DATE_TIME_PATTERN.exec(value.trim());
  const dateKey = match?.[1] || "";
  const time = match?.[2] && match?.[3] ? `${match[2]}:${match[3]}` : "";
  if (!isDateKey(dateKey) || !isTimeKey(time)) return {dateKey: "", time: ""};
  return {dateKey, time};
}

function composeDateTime(dateKey: string, time: string): string {
  return `${dateKey}T${time}`;
}

function displayDateTime(value?: string): string {
  const parts = parseDateTime(value);
  return parts.dateKey && parts.time ? `${parts.dateKey} ${parts.time}` : "";
}

export interface ErpDateTimePickerProps {
  /** The API-facing local date-time format remains YYYY-MM-DDTHH:mm. */
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

/** A shared date + time field. It deliberately keeps the existing local string contract. */
export function ErpDateTimePicker({
  value,
  onChange,
  density = "default",
  min,
  max,
  placeholder = "选择日期和时间",
  disabled,
  required,
  invalid,
  "aria-label": ariaLabel,
  "aria-describedby": ariaDescribedBy,
  className,
}: ErpDateTimePickerProps) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<DateTimeParts>(() => parseDateTime(value));
  const hasCustomWidth = Boolean(className?.match(/(?:^|\s)!?w-/));
  const controlHeight = density === "compact" ? "h-[var(--erp-control-height-compact)]" : "h-[var(--erp-control-height)]";
  const selected = draft.dateKey ? parseDateKey(draft.dateKey) || undefined : undefined;
  const minDate = min ? parseDateKey(min.slice(0, 10)) || undefined : undefined;
  const maxDate = max ? parseDateKey(max.slice(0, 10)) || undefined : undefined;
  const displayValue = displayDateTime(value);

  const syncFromValue = () => setDraft(parseDateTime(value));

  const handleOpenChange = (nextOpen: boolean) => {
    if (nextOpen) syncFromValue();
    setOpen(nextOpen);
  };

  const handleDateSelect = (date: Date | undefined) => {
    if (!date) return;
    const dateKey = formatDateKey(date);
    const time = isTimeKey(draft.time) ? draft.time : "09:00";
    setDraft({dateKey, time});
    onChange(composeDateTime(dateKey, time));
  };

  const handleTimeChange = (time: string) => {
    setDraft((current) => ({...current, time}));
    if (draft.dateKey && isTimeKey(time)) onChange(composeDateTime(draft.dateKey, time));
  };

  const handleClear = () => {
    setDraft({dateKey: "", time: ""});
    onChange("");
  };

  return (
    <BasePopover.Root open={open} onOpenChange={handleOpenChange}>
      <BasePopover.Trigger
        data-erp-date-time-picker="true"
        className={cn(
          "erp-focus-ring flex items-center justify-between gap-2 rounded-[var(--erp-radius-md)] border border-[var(--erp-color-border)] bg-[var(--erp-color-surface)] px-3 text-left text-sm text-[var(--erp-color-text)] transition-colors hover:border-[var(--erp-color-border-strong)] data-popup-open:border-[var(--erp-color-primary)] data-disabled:cursor-not-allowed data-disabled:bg-[var(--erp-color-surface-muted)] data-disabled:text-[var(--erp-color-text-muted)]",
          controlHeight,
          invalid && "border-[var(--erp-color-danger)]",
          hasCustomWidth ? undefined : "w-full",
          className,
        )}
        disabled={disabled}
        aria-label={ariaLabel}
        aria-required={required}
        aria-invalid={invalid || undefined}
        aria-describedby={ariaDescribedBy}
      >
        <span className={cn("truncate", displayValue && "font-mono", !displayValue && "text-[var(--erp-color-text-muted)]")}>
          {displayValue || placeholder}
        </span>
        <CalendarClock className="h-4 w-4 shrink-0 text-[var(--erp-color-text-muted)]" aria-hidden="true" />
      </BasePopover.Trigger>
      <BasePopover.Portal>
        {open && <div className="erp-popover-layer fixed inset-0 bg-[var(--erp-color-backdrop)]/35 sm:hidden" aria-hidden="true" onMouseDown={() => setOpen(false)} />}
        <BasePopover.Positioner className="erp-popover-layer erp-popover-positioner outline-none" sideOffset={4} align="start">
          <BasePopover.Popup className="erp-popover-surface relative rounded-[var(--erp-radius-lg)] border border-[var(--erp-color-border)] bg-[var(--erp-color-surface)] shadow-[var(--erp-shadow-popover)] outline-none">
            <div className="flex items-center justify-between border-b border-[var(--erp-color-border)] px-3 py-2.5">
              <div>
                <p className="text-sm font-semibold text-[var(--erp-color-text)]">选择跟进时间</p>
                <p className="mt-0.5 text-xs text-[var(--erp-color-text-muted)]">日期和时间按门店时区保存</p>
              </div>
              <Button type="button" size="icon" variant="ghost" aria-label="关闭日期时间" onClick={() => setOpen(false)}>
                <X className="h-4 w-4" aria-hidden="true" />
              </Button>
            </div>
            <div className="grid gap-3 p-3 sm:grid-cols-[auto_9rem] sm:items-start">
              <ErpCalendar selected={selected} onSelect={handleDateSelect} minDate={minDate} maxDate={maxDate} />
              <div className="space-y-3">
                <label className="block text-xs font-semibold text-[var(--erp-color-text-secondary)]">
                  时间
                  <Input
                    className="mt-1 h-[var(--erp-control-height-compact)] w-full font-mono text-xs"
                    type="time"
                    value={draft.time}
                    onChange={(event) => handleTimeChange(event.target.value)}
                    aria-label="跟进时间"
                  />
                </label>
                <p className="text-xs leading-5 text-[var(--erp-color-text-muted)]">选择日期后可调整具体时间。</p>
                <Button type="button" size="sm" variant="ghost" onClick={handleClear} disabled={!value && !draft.dateKey && !draft.time}>清除</Button>
              </div>
            </div>
          </BasePopover.Popup>
        </BasePopover.Positioner>
      </BasePopover.Portal>
    </BasePopover.Root>
  );
}
