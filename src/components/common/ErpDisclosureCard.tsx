import type {ReactNode} from "react";
import {ChevronDown} from "lucide-react";
import {cn} from "@/src/lib/cn";

/**
 * Folded secondary content (「更多指标」「毛利分析与趋势」). Matches the finance
 * analysis disclosure: card surface, section-title weight, trailing 展开/收起.
 */
export function ErpDisclosureCard({title, children, className}: {title: ReactNode; children: ReactNode; className?: string}) {
  return <details data-erp-component="disclosure-card" className={cn("group erp-card-surface min-w-0 p-[var(--erp-card-padding-compact)]", className)}>
    <summary className="erp-focus-ring flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 rounded-[var(--erp-radius-md)] [&::-webkit-details-marker]:hidden">
      <span className="min-w-0 text-erp-lg font-semibold text-[var(--erp-color-text)]">{title}</span>
      <span className="inline-flex shrink-0 items-center gap-1 text-sm font-medium text-[var(--erp-color-text-secondary)]">
        <ChevronDown aria-hidden="true" className="h-4 w-4 transition-transform group-open:rotate-180" />
        <span className="group-open:hidden">展开</span><span className="hidden group-open:inline">收起</span>
      </span>
    </summary>
    <div className="min-w-0 pt-3">{children}</div>
  </details>;
}
