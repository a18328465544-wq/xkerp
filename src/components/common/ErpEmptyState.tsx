import type {ReactNode} from "react";
import {Inbox} from "lucide-react";
import {cn} from "@/src/lib/cn";

export type ErpEmptyStateDensity = "default" | "compact";

export function ErpEmptyState({title = "暂无数据", description, action, density = "default", className}: {title?: ReactNode; description?: ReactNode; action?: ReactNode; density?: ErpEmptyStateDensity; className?: string}) {
  return <div data-erp-component="empty-state" data-density={density} className={cn("flex flex-col items-center justify-center gap-2 text-center", density === "compact" ? "min-h-[var(--erp-empty-min-height-compact)] p-4" : "min-h-[var(--erp-empty-min-height)] p-6", className)}><Inbox className={density === "compact" ? "h-7 w-7 text-[var(--erp-color-text-muted)]" : "h-8 w-8 text-[var(--erp-color-text-muted)]"} /><p className="font-semibold text-[var(--erp-color-text)]">{title}</p>{description && <p className="max-w-md text-xs text-[var(--erp-color-text-secondary)]">{description}</p>}{action}</div>;
}
