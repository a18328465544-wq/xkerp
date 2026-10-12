import type {ReactNode} from "react";
import {Check} from "lucide-react";
import {Button} from "@/src/components/ui";
import {cn} from "@/src/lib/cn";
import {isComposingKey, nextEnabledChoice} from "@/src/lib/controlInteraction";

export interface ErpChoiceChipOption<T extends string> {
  value: T;
  label: ReactNode;
  /** Optional result count shown after the label, e.g. 「待收款 12」. */
  count?: ReactNode;
  disabled?: boolean;
}

/**
 * Single-select filter chips (DESIGN.md: choice chip). Bordered pill, tonal
 * selected state plus a check mark so selection never relies on colour alone.
 * Use for filtering a list by a fixed set of short options; actions use Button,
 * 2–5 working modes use ErpSegmentedControl.
 */
export function ErpChoiceChips<T extends string>({label, value, options, onValueChange, layout = "wrap", disabled, className}: {
  label: string;
  value: T;
  options: readonly ErpChoiceChipOption<T>[];
  onValueChange: (value: T) => void;
  /** wrap: every option visible (filter sheets); scroll: one horizontal row (quick filters). */
  layout?: "wrap" | "scroll";
  disabled?: boolean;
  className?: string;
}) {
  const selectedIndex = options.findIndex((option) => option.value === value && !option.disabled);
  const tabStop = selectedIndex >= 0 ? selectedIndex : options.findIndex((option) => !option.disabled);
  return <div data-erp-component="choice-chips" data-layout={layout} role="radiogroup" aria-label={label} className={cn("erp-choice-chips", className)}>
    {options.map((option, index) => {
      const checked = option.value === value;
      return <Button key={option.value} type="button" size="sm" variant="ghost" role="radio" aria-checked={checked} className="erp-choice-chip" tabIndex={!disabled && index === tabStop ? 0 : -1} disabled={disabled || option.disabled} onClick={() => onValueChange(option.value)} onKeyDown={(event) => {
        if (disabled || isComposingKey(event.nativeEvent) || !["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End"].includes(event.key)) return;
        event.preventDefault();
        const next = nextEnabledChoice(options, index, event.key);
        if (next < 0) return;
        onValueChange(options[next]!.value);
        event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>("button")[next]?.focus();
      }}>
        {checked && <Check className="erp-choice-chip-check" aria-hidden="true" />}
        <span>{option.label}</span>
        {option.count !== undefined && <span className="erp-choice-chip-count">{option.count}</span>}
      </Button>;
    })}
  </div>;
}
