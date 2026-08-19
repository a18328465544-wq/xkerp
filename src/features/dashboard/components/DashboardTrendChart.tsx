import {Area, AreaChart, CartesianGrid, XAxis, YAxis} from "recharts";
import {formatCurrency} from "@/src/lib/format";
import {ChartContainer, ChartLegend, ChartTooltip, ChartTooltipContent, type ChartConfig} from "@/src/components/ui";
import {ErpEmptyState} from "@/src/components/common";
import {useId} from "react";

export interface DashboardTrendRow {
  date: string;
  label: string;
  revenue: number;
  profit: number;
  today: boolean;
}

/**
 * The chart is intentionally isolated from DashboardPage so Recharts can be
 * requested after the first meaningful paint. The data contract stays local
 * to the dashboard and does not change the API/domain model.
 */
export default function DashboardTrendChart({data, showProfit = true}: {data: DashboardTrendRow[]; showProfit?: boolean}) {
  const gradientId = `revenue-fill-${useId().replace(/:/g, "")}`;
  const chartConfig = {
    revenue: {label: "销售额", color: "var(--erp-color-primary)"},
    ...(showProfit ? {profit: {label: "毛利", color: "var(--erp-color-success)", indicator: "dashed" as const}} : {}),
  } satisfies ChartConfig;
  const hasData = data.some((row) => row.revenue !== 0 || showProfit && row.profit !== 0);

  if (!hasData) return <div className="flex h-full items-center justify-center rounded-[var(--erp-radius-md)] bg-[var(--erp-color-surface-muted)]"><ErpEmptyState title="当前 7 天暂无销售数据" description={showProfit ? "调整时间范围或进入利润分析查看历史数据。" : "当前账号没有利润查看权限，销售数据仍可继续查看。"} /></div>;

  return <ChartContainer config={chartConfig} className="h-full">
    <AreaChart data={data} margin={{top: 12, right: 8, left: -16, bottom: 0}}>
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--color-revenue)" stopOpacity={0.22} />
          <stop offset="100%" stopColor="var(--color-revenue)" stopOpacity={0} />
        </linearGradient>
      </defs>
      <CartesianGrid strokeDasharray="3 5" stroke="var(--erp-color-border)" vertical={false} />
      <ChartLegend />
      <XAxis dataKey="label" interval="preserveStartEnd" minTickGap={24} tickMargin={8} tick={{fontSize: 10, fill: "var(--erp-color-text-muted)"}} axisLine={false} tickLine={false} />
      <YAxis width={44} tickMargin={4} tick={{fontSize: 10, fill: "var(--erp-color-text-muted)"}} axisLine={false} tickLine={false} tickFormatter={(value: number) => Math.abs(value) >= 10000 ? `${Math.round(value / 10000)}万` : String(value)} />
      <ChartTooltip content={<ChartTooltipContent formatter={(value) => formatCurrency(Number(value || 0))} />} />
      <Area type="monotone" dataKey="revenue" name="revenue" stroke="var(--color-revenue)" fill={`url(#${gradientId})`} strokeWidth={2.5} dot={{r: 3, fill: "var(--erp-color-surface)", strokeWidth: 2}} />
      {showProfit && <Area type="monotone" dataKey="profit" name="profit" stroke="var(--color-profit)" fill="none" strokeDasharray="6 3" strokeWidth={2} dot={{r: 2, fill: "var(--erp-color-surface)", strokeWidth: 2}} />}
    </AreaChart>
  </ChartContainer>;
}
