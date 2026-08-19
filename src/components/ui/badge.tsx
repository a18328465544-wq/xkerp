import type {HTMLAttributes, ReactNode} from "react";
import {cn} from "@/src/lib/cn";

export type BadgeTone = "neutral" | "info" | "success" | "warning" | "danger";
const toneClasses: Record<BadgeTone, string> = {
  neutral: "bg-[var(--erp-color-surface-muted)] text-[var(--erp-color-text-secondary)]",
  info: "bg-[var(--erp-color-info-soft)] text-[var(--erp-color-primary)]",
  success: "bg-[var(--erp-color-success-soft)] text-[var(--erp-color-success)]",
  warning: "bg-[var(--erp-color-warning-soft)] text-[var(--erp-color-warning)]",
  danger: "bg-[var(--erp-color-danger-soft)] text-[var(--erp-color-danger)]",
};

export function Badge({tone = "neutral", className, children, ...props}: HTMLAttributes<HTMLSpanElement> & {tone?: BadgeTone; children: ReactNode}) {
  return <span {...props} className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold", toneClasses[tone], className)}>{children}</span>;
}
