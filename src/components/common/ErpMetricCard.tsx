import type {ReactNode} from "react";
import {Card, CardContent} from "@/src/components/ui";

export type ErpMetricTone = "neutral" | "info" | "success" | "warning" | "danger";
export type ErpMetricVariant = "default" | "compact";

const toneClasses: Record<ErpMetricTone, string> = {
  neutral: "bg-[var(--erp-color-surface-muted)] text-[var(--erp-color-text-secondary)]",
  info: "bg-[var(--erp-color-info-soft)] text-[var(--erp-color-primary)]",
  success: "bg-[var(--erp-color-success-soft)] text-[var(--erp-color-success)]",
  warning: "bg-[var(--erp-color-warning-soft)] text-[var(--erp-color-warning)]",
  danger: "bg-[var(--erp-color-danger-soft)] text-[var(--erp-color-danger)]",
};

/** Shared metric surface used by analytics and finance pages. */
export function ErpMetricCard({label, value, detail, icon, tone, minHeight, variant = "default"}: {
  label: string;
  value: string;
  detail: string;
  icon: ReactNode;
  tone: ErpMetricTone;
  minHeight?: number;
  variant?: ErpMetricVariant;
}) {
  const compact = variant === "compact";
  return <Card data-erp-component="metric-card" data-density={compact ? "compact" : "default"}>
    <CardContent className={`flex items-start justify-between gap-3 ${compact ? "p-3" : "p-4"}`} style={{minHeight: minHeight ?? (compact ? 72 : 106)}}>
      <div className="min-w-0">
        <p data-erp-region="metric-label" className="text-xs font-semibold text-[var(--erp-color-text-secondary)]">{label}</p>
        <p data-erp-region="metric-value" className={`${compact ? "mt-1 text-lg" : "mt-2 text-2xl"} break-words font-mono font-bold leading-tight tracking-tight`}>{value}</p>
        <p data-erp-region="metric-detail" className="mt-1 break-words text-xs text-[var(--erp-color-text-muted)]">{detail}</p>
      </div>
      <span className={`flex ${compact ? "h-8 w-8" : "h-10 w-10"} shrink-0 items-center justify-center rounded-full ${toneClasses[tone]}`} aria-hidden="true">{icon}</span>
    </CardContent>
  </Card>;
}
