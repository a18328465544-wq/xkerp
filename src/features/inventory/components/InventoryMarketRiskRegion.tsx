import {AlertTriangle, Boxes, CalendarClock, ChevronLeft, ChevronRight, CircleDollarSign, TrendingDown} from "lucide-react";
import {ErpEmptyState, ErpMetricCard, ErpPageError, ErpStatusBadge} from "@/src/components/common";
import {Button} from "@/src/components/ui";
import {formatCurrency} from "@/src/lib/format";
import type {InventoryMarketRiskSnapshot} from "@/src/types/inventory";

export function InventoryMarketRiskRegion({data, loading, error, onRetry, phone, onExit, page, pageSize, onPageChange}: {
  data?: InventoryMarketRiskSnapshot;
  loading: boolean;
  error: Error | null;
  onRetry: () => void;
  phone: boolean;
  onExit: () => void;
  page: number;
  pageSize: number;
  onPageChange: (page: number) => void;
}) {
  const phoneViewHeader = phone && <div className="flex items-center justify-between gap-3 border-b border-[var(--erp-color-border-soft)] pb-2"><p role="status" aria-live="polite" className="flex min-w-0 items-center gap-2 text-sm font-semibold text-[var(--erp-color-text)]"><TrendingDown className="h-4 w-4 shrink-0 text-[var(--erp-color-risk)]" /><span>行情风险降价清单</span></p><Button type="button" size="sm" variant="ghost" className="shrink-0" onClick={onExit}><ChevronLeft className="h-4 w-4" />返回库存</Button></div>;
  if (error && !data) return phone ? <div className="space-y-4">{phoneViewHeader}<ErpPageError title="库存行情风险加载失败" description={error.message} onRetry={onRetry} /></div> : <ErpPageError title="库存行情风险加载失败" description={error.message} onRetry={onRetry} />;
  if (loading && !data) return phone ? <div className="space-y-4">{phoneViewHeader}<div className="rounded-[var(--erp-radius-lg)] border border-[var(--erp-color-border)] bg-[var(--erp-color-surface)] p-6 text-sm text-[var(--erp-color-text-muted)]">正在汇总库存行情与成本…</div></div> : <div className="rounded-[var(--erp-radius-lg)] border border-[var(--erp-color-border)] bg-[var(--erp-color-surface)] p-6 text-sm text-[var(--erp-color-text-muted)]">正在汇总库存行情与成本…</div>;
  if (!data) return null;
  const {summary, data: rows} = data;
  return <div className="space-y-4" data-erp-region="inventory-market-risk">{phoneViewHeader}
    <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
      <ErpMetricCard label="按行情估算浮亏" value={formatCurrency(summary.floatingLoss)} detail={`${summary.invertedCount} 张行情低于成本`} icon={<TrendingDown className="h-4 w-4" />} tone={summary.floatingLoss > 0 ? "warning" : "neutral"} valueTone={summary.floatingLoss > 0 ? "warning" : "neutral"} />
      <ErpMetricCard label="已知行情估值" value={formatCurrency(summary.totalMarketValue)} detail={`${summary.marketKnownCount} / ${summary.onHandCount} 张有行情`} icon={<CircleDollarSign className="h-4 w-4" />} />
      <ErpMetricCard label="行情倒挂库存" value={`${summary.invertedCount} 张`} detail="按浮亏金额从高到低排列" icon={<AlertTriangle className="h-4 w-4" />} tone={summary.invertedCount ? "warning" : "neutral"} valueTone={summary.invertedCount ? "warning" : "neutral"} />
      <ErpMetricCard label="缺少行情" value={`${summary.missingMarketCount} 张`} detail="补录行情后才能准确估值" icon={<Boxes className="h-4 w-4" />} />
    </div>
    {rows.length === 0 ? <ErpEmptyState title="当前筛选下没有在库卡" description="调整筛选条件，或回到单卡 / SN 视图查看完整库存。" /> : phone ? <div className="divide-y divide-[var(--erp-color-border)] overflow-hidden rounded-[var(--erp-radius-lg)] border border-[var(--erp-color-border)] bg-[var(--erp-color-surface)]">
      {rows.map((row) => <article key={row.inventoryId} className="space-y-3 p-4">
        <div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="truncate text-sm font-semibold text-[var(--erp-color-text)]">{row.productName}</p><p className="mt-1 truncate font-mono text-xs text-[var(--erp-color-text-muted)]">{row.serialNumber}</p></div>{row.floatingLoss > 0 ? <ErpStatusBadge label="行情低于成本" tone="danger" /> : <ErpStatusBadge label={row.marketKnown ? "行情正常" : "缺少行情"} tone={row.marketKnown ? "neutral" : "warning"} />}</div>
        <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs"><RiskFact label="库位" value={row.warehouseLocation} /><RiskFact label="库龄" value={`${row.inventoryDays} 天`} icon={<CalendarClock className="h-3 w-3" />} /><RiskFact label="成本" value={formatCurrency(row.costPrice)} /><RiskFact label="行情" value={row.marketKnown ? formatCurrency(row.marketPrice) : "未录入"} /><RiskFact label="浮亏" value={row.floatingLoss > 0 ? formatCurrency(row.floatingLoss) : "—"} loss={row.floatingLoss > 0} /></div>
      </article>)}
    </div> : <div className="overflow-x-auto rounded-[var(--erp-radius-lg)] border border-[var(--erp-color-border)] bg-[var(--erp-color-surface)]">
      <table className="w-full min-w-[900px] border-collapse text-sm"><thead className="bg-[var(--erp-color-surface-muted)] text-left text-xs text-[var(--erp-color-text-secondary)]"><tr>{["商品 / SN", "库位", "库龄", "成本", "行情参考", "浮亏", "状态"].map((label) => <th key={label} className="px-4 py-3 font-medium">{label}</th>)}</tr></thead><tbody className="divide-y divide-[var(--erp-color-border-soft)]">{rows.map((row) => <tr key={row.inventoryId} className="hover:bg-[var(--erp-color-surface-muted)]"><td className="px-4 py-3"><p className="font-medium text-[var(--erp-color-text)]">{row.productName}</p><p className="mt-1 font-mono text-xs text-[var(--erp-color-text-muted)]">{row.serialNumber}</p></td><td className="px-4 py-3 text-[var(--erp-color-text-secondary)]">{row.warehouseLocation}</td><td className="px-4 py-3 tabular-nums">{row.inventoryDays} 天</td><td className="px-4 py-3 tabular-nums">{formatCurrency(row.costPrice)}</td><td className="px-4 py-3 tabular-nums">{row.marketKnown ? formatCurrency(row.marketPrice) : <span className="text-[var(--erp-color-text-muted)]">未录入</span>}</td><td className="px-4 py-3 font-semibold tabular-nums">{row.floatingLoss > 0 ? <span className="text-[var(--erp-color-danger)]">{formatCurrency(row.floatingLoss)}</span> : "—"}</td><td className="px-4 py-3">{row.floatingLoss > 0 ? <ErpStatusBadge label="行情低于成本" tone="danger" /> : <ErpStatusBadge label={row.marketKnown ? "行情正常" : "缺少行情"} tone={row.marketKnown ? "neutral" : "warning"} />}</td></tr>)}</tbody></table>
    </div>}
    {rows.length > 0 && <div className="flex items-center justify-between rounded-[var(--erp-radius-md)] border border-[var(--erp-color-border)] bg-[var(--erp-color-surface)] px-3 py-2 text-xs text-[var(--erp-color-text-secondary)]"><span>{loading ? "筛选结果正在更新…" : `共 ${data.meta.total} 张`}</span><div className="flex items-center gap-2"><Button variant="ghost" size="icon" aria-label="上一页" disabled={page <= 1} onClick={() => onPageChange(page - 1)}><ChevronLeft className="h-4 w-4" /></Button><span>{page} / {Math.max(1, Math.ceil(data.meta.total / pageSize))}</span><Button variant="ghost" size="icon" aria-label="下一页" disabled={page >= Math.ceil(data.meta.total / pageSize)} onClick={() => onPageChange(page + 1)}><ChevronRight className="h-4 w-4" /></Button></div></div>}
  </div>;
}

function RiskFact({label, value, icon, loss}: {label: string; value: string; icon?: import("react").ReactNode; loss?: boolean}) {
  return <div><p className="flex items-center gap-1 text-[var(--erp-color-text-muted)]">{icon}{label}</p><p className={`mt-1 font-medium tabular-nums ${loss ? "text-[var(--erp-color-danger)]" : "text-[var(--erp-color-text)]"}`}>{value}</p></div>;
}
