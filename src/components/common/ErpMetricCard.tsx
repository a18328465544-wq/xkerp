import {ArrowDownRight, ArrowUpRight} from "lucide-react";
import {createContext, isValidElement, useCallback, useContext, useId, useLayoutEffect, useMemo, useState, type ReactNode} from "react";
import {flattenChildren} from "@/src/lib/flattenChildren";
import {Card, CardContent} from "@/src/components/ui";
import {useErpPhone} from "@/src/hooks/useErpViewport";

export type ErpMetricTone = "neutral" | "info" | "success" | "warning" | "danger";
export type ErpMetricVariant = "default" | "compact";
/** `responsive` is compact on phones and default elsewhere. */
export type ErpMetricCardVariant = ErpMetricVariant | "responsive";
export type ErpMetricValueSize = "large" | "medium" | "small";
export type ErpMetricComparison = "higher-is-better" | "lower-is-better" | "neutral";

export function metricComparisonTone(value: number, meaning: ErpMetricComparison): ErpMetricTone {
  if (value === 0 || meaning === "neutral") return "info";
  return (meaning === "lower-is-better" ? value < 0 : value > 0) ? "success" : "danger";
}

const toneClasses: Record<ErpMetricTone, string> = {
  neutral: "bg-[var(--erp-color-surface-muted)] text-[var(--erp-color-text-secondary)]",
  info: "bg-[var(--erp-color-info-soft)] text-[var(--erp-color-primary)]",
  success: "bg-[var(--erp-color-success-soft)] text-[var(--erp-color-success)]",
  warning: "bg-[var(--erp-color-warning-soft)] text-[var(--erp-color-warning)]",
  danger: "bg-[var(--erp-color-danger-soft)] text-[var(--erp-color-danger)]",
};
const valueToneClasses: Record<ErpMetricTone | "muted", string> = {
  neutral: "text-[var(--erp-color-text)]",
  info: "text-[var(--erp-color-net)]",
  success: "text-[var(--erp-color-income)]",
  warning: "text-[var(--erp-color-risk)]",
  danger: "text-[var(--erp-color-expense)]",
  muted: "text-[var(--erp-color-text-muted)]",
};

const valueSizeClasses: Record<ErpMetricVariant, Record<ErpMetricValueSize, string>> = {
  default: {
    large: "text-[length:var(--erp-font-metric-primary-large)]",
    medium: "text-[length:var(--erp-font-metric-primary-medium)]",
    small: "text-[length:var(--erp-font-metric-primary-small)]",
  },
  compact: {
    large: "text-[length:var(--erp-font-metric-compact-large)]",
    medium: "text-[length:var(--erp-font-metric-compact-medium)]",
    small: "text-[length:var(--erp-font-metric-compact-small)]",
  },
};

/** Zero amounts and counts read neutral (MOBILE_UI_RULES M22): 「¥0.00」「0 人」「0 款」. */
export function isZeroMetricValue(value: string) {
  return /^[-+]?[¥￥]?[-+]?0+(?:\.0+)?(?:%|[\u4e00-\u9fff]{1,2}|[a-zA-Z]{1,3})?$/.test(value.replace(/[\s,]/g, ""));
}

/** Missing data is not zero; unavailable metric cards do not reserve space. */
export function hasErpMetricValue(value: unknown): boolean {
  if (value == null || typeof value === "number" && !Number.isFinite(value)) return false;
  return !["", "—", "–", "-", "--", "无权限", "未授权"].includes(String(value).trim());
}

export function availableMetricItems(children: ReactNode) {
  return flattenChildren(children).filter((item) => !isValidElement<{value?: unknown; label?: unknown}>(item) || !("value" in item.props && "label" in item.props) || hasErpMetricValue(item.props.value));
}

export function usefulMetricDetail(detail: ReactNode): ReactNode {
  if (typeof detail !== "string") return detail;
  return /^(按)?当前筛选(结果|汇总|范围)?$|^参考价格上涨$/.test(detail.trim()) ? undefined : detail;
}

/** Keep the card geometry stable and scale only the value typography by length. */
export function getErpMetricValueSize(value: string): ErpMetricValueSize {
  const normalized = value.trim().replace(/\s+/g, "");
  if (normalized.length <= 4) return "large";
  if (normalized.length <= 8) return "medium";
  return "small";
}

const valueSizeOrder: ErpMetricValueSize[] = ["large", "medium", "small"];

/** The smallest tier wins, so the longest value still fits its card. */
export function getErpMetricGroupValueSize(sizes: readonly ErpMetricValueSize[]): ErpMetricValueSize | undefined {
  return sizes.length ? valueSizeOrder[Math.max(...sizes.map((size) => valueSizeOrder.indexOf(size)))] : undefined;
}

type MetricGroup = {size?: ErpMetricValueSize; register: (id: string, size: ErpMetricValueSize | null) => void};
const MetricGroupContext = createContext<MetricGroup | null>(null);

/**
 * One value size per metric group: a grid mixing 「1 个」 and 「¥10,000.00」
 * renders both at the smaller tier so the row reads as aligned. Cards register
 * their own tier, so page-local wrappers around ErpMetricCard join the group too.
 */
export function ErpMetricGroup({children}: {children: ReactNode}) {
  const [sizes, setSizes] = useState<Record<string, ErpMetricValueSize>>({});
  const register = useCallback((id: string, size: ErpMetricValueSize | null) => setSizes((current) => {
    if ((current[id] ?? null) === size) return current;
    const next = {...current};
    if (size) next[id] = size; else delete next[id];
    return next;
  }), []);
  const size = getErpMetricGroupValueSize(Object.values(sizes));
  const group = useMemo(() => ({size, register}), [size, register]);
  return <MetricGroupContext.Provider value={group}>{children}</MetricGroupContext.Provider>;
}

/** Shared metric surface used by dashboards, analytics and finance pages. */
export function ErpMetricCard({label, value, detail, icon, tone = "neutral", valueTone = "neutral", minHeight, variant: requestedVariant = "responsive", valueSize, compare, compareMeaning = "higher-is-better", compareLabel = "较昨日", compareLabelClassName, supplementalContent}: {
  label: string;
  value: string;
  detail?: ReactNode;
  icon?: ReactNode;
  tone?: ErpMetricTone;
  valueTone?: ErpMetricTone | "muted";
  minHeight?: number;
  variant?: ErpMetricCardVariant;
  /** Optional override for exceptional values; normal cards use the length tier automatically. */
  valueSize?: ErpMetricValueSize;
  /** Direction and business meaning are separate; spending changes can stay neutral. */
  compare?: number | null;
  compareMeaning?: ErpMetricComparison;
  compareLabel?: ReactNode;
  compareLabelClassName?: string;
  supplementalContent?: ReactNode;
}) {
  const phone = useErpPhone();
  const available = hasErpMetricValue(value);
  const displayedDetail = usefulMetricDetail(detail);
  const variant: ErpMetricVariant = requestedVariant === "responsive" ? (phone ? "compact" : "default") : requestedVariant;
  const compact = variant === "compact";
  const resolvedValueTone = valueTone !== "muted" && isZeroMetricValue(value) ? "neutral" : valueTone;
  const group = useContext(MetricGroupContext);
  const ownValueSize = valueSize ?? getErpMetricValueSize(value);
  const id = useId();
  const register = group?.register;
  useLayoutEffect(() => {
    if (!register || valueSize || !available) return;
    register(id, ownValueSize);
    return () => register(id, null);
  }, [register, id, ownValueSize, valueSize, available]);
  if (!available) return null;
  const resolvedValueSize = valueSize ?? group?.size ?? ownValueSize;
  const hasComparison = compare !== undefined;
  const hasFooter = displayedDetail !== undefined || hasComparison;
  const valueFont = `--erp-font-metric-${compact ? "compact" : "primary"}-${resolvedValueSize}`;
  const fittedFont = `min(var(${valueFont}), max(var(--erp-text-sm), calc((100cqi - var(--erp-space-10)) / ${Math.max(1, value.trim().replace(/\s+/g, "").length * 0.65)})))`;
  return <Card data-erp-component="metric-card" data-density={compact ? "compact" : "default"} data-value-size={resolvedValueSize}>
    <CardContent className={`relative ${compact ? "p-4" : "p-5"}`} style={{minHeight: minHeight ?? (compact ? 76 : hasFooter ? 112 : 88)}}>
      <div className="min-w-0">
        <p data-erp-region="metric-label" className={`text-xs font-medium text-[var(--erp-color-text-secondary)] ${icon ? "pr-10" : ""}`}>{label}</p>
        <p data-erp-region="metric-value" data-value-size={resolvedValueSize} title={value} style={{fontSize: fittedFont}} className={`${compact ? "mt-1" : "mt-2"} ${valueSizeClasses[variant][resolvedValueSize]} ${valueToneClasses[resolvedValueTone]} erp-data-number min-w-0 font-semibold leading-tight tracking-tight`}>{value}</p>
        {hasFooter ? <div data-erp-region="metric-footer" className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs">
          {displayedDetail !== undefined ? <span data-erp-region="metric-detail" className="min-w-0 break-words text-[var(--erp-color-text-secondary)]">{displayedDetail}</span> : null}
          {hasComparison ? (compare == null ? <span data-erp-region="metric-comparison" className="text-[var(--erp-color-text-muted)]">暂无对比</span> : <span data-erp-region="metric-comparison" className={`inline-flex items-center gap-0.5 font-medium ${valueToneClasses[metricComparisonTone(compare, compareMeaning)]}`}><span className="sr-only">{compare === 0 ? "持平" : compare > 0 ? "上升" : "下降"}</span>{compare >= 0 ? <ArrowUpRight className="h-3 w-3" aria-hidden="true" /> : <ArrowDownRight className="h-3 w-3" aria-hidden="true" />}{Math.abs(compare).toFixed(1)}%<span className={compareLabelClassName || "font-normal text-[var(--erp-color-text-muted)]"}>{compareLabel}</span></span>) : null}
        </div> : null}
        {supplementalContent ? <div data-erp-region="metric-supplement" className="mt-2">{supplementalContent}</div> : null}
      </div>
      {icon ? <span data-erp-region="metric-icon" className={`absolute right-4 top-3 flex h-6 w-6 items-center justify-center rounded-full ${toneClasses[tone]}`} aria-hidden="true">{icon}</span> : null}
    </CardContent>
  </Card>;
}
