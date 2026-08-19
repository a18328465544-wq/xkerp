import {formatCurrency} from "@/src/lib/format";

export function ProfitDisplay({value}: {value: number | undefined}) {
  if (value === undefined) return <span className="font-mono text-[var(--erp-color-text-muted)]">—</span>;
  return <span className={value >= 0 ? "font-mono font-semibold text-[var(--erp-color-success)]" : "font-mono font-semibold text-[var(--erp-color-danger)]"}>{value >= 0 ? "+" : ""}{formatCurrency(value)}</span>;
}
