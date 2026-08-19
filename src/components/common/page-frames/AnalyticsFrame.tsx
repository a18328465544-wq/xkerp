import type {HTMLAttributes, ReactNode} from "react";
import {cn} from "@/src/lib/cn";
import {ErpFilterBar} from "../ErpFilterBar";
import {ErpPageFrame} from "../ErpPageFrame";

type RegionProps = HTMLAttributes<HTMLElement> & {children: ReactNode};

export type AnalyticsMainVariant = "3-1" | "3-2" | "full";
export type AnalyticsVisualizationSize = "compact" | "standard" | "expanded";

/**
 * Analytics page contract. The frame owns hierarchy and responsive layout;
 * business features provide content through the regions below.
 */
export function AnalyticsFrame({className, children, ...props}: HTMLAttributes<HTMLDivElement> & {children: ReactNode}) {
  return <ErpPageFrame {...props} data-page-frame="analytics" data-analytics-layout="reference-v2" className={className}>{children}</ErpPageFrame>;
}

export function AnalyticsKpiRegion({primary, secondary, className, ...props}: Omit<RegionProps, "children"> & {primary: ReactNode; secondary?: ReactNode}) {
  return <section {...props} data-erp-region="analytics-kpis" className={cn("min-w-0 space-y-3", className)}>
    <div data-erp-region-level="primary" data-analytics-tier="core" data-analytics-density="primary" className="grid min-w-0 grid-cols-[repeat(auto-fit,minmax(min(100%,240px),1fr))] gap-3">{primary}</div>
    {secondary ? <div data-erp-region-level="secondary" data-analytics-tier="supporting" data-analytics-density="secondary" className="grid min-w-0 grid-cols-[repeat(auto-fit,minmax(min(100%,190px),1fr))] gap-2">{secondary}</div> : null}
  </section>;
}

export function AnalyticsToolbar({children, actions, className, ...props}: Omit<RegionProps, "children"> & {children: ReactNode; actions?: ReactNode}) {
  return <section {...props} data-erp-region="analytics-toolbar" data-analytics-toolbar="single-row" className={cn("min-w-0 w-full", className)}>
    <ErpFilterBar compact surface="card" actions={actions}>{children}</ErpFilterBar>
  </section>;
}

export function AnalyticsMainRegion({variant = "3-1", className, children, ...props}: RegionProps & {variant?: AnalyticsMainVariant}) {
  const grid = variant === "full" ? "grid-cols-1" : variant === "3-2" ? "lg:grid-cols-[minmax(0,3fr)_minmax(280px,2fr)]" : "lg:grid-cols-[minmax(0,3fr)_minmax(280px,1fr)]";
  return <section {...props} data-erp-region="analytics-main" data-analytics-variant={variant} className={cn("grid min-w-0 grid-cols-1 items-stretch gap-4", grid, className)}>{children}</section>;
}

const visualizationSizeClasses: Record<AnalyticsVisualizationSize, string> = {
  compact: "min-h-48",
  standard: "min-h-72",
  expanded: "min-h-96",
};

function AnalyticsVisualization({size = "standard", className, children, ...props}: RegionProps & {size?: AnalyticsVisualizationSize}) {
  return <div {...props} data-erp-region="analytics-visualization" data-analytics-visualization-size={size} className={cn("flex h-full min-w-0 flex-col [&>*]:h-full", visualizationSizeClasses[size], className)}>{children}</div>;
}

function AnalyticsInsights({className, children, ...props}: RegionProps) {
  return <aside {...props} data-erp-region="analytics-insights" className={cn("flex h-full min-w-0 flex-col [&>*]:h-full", className)}>{children}</aside>;
}

AnalyticsMainRegion.Visualization = AnalyticsVisualization;
AnalyticsMainRegion.Insights = AnalyticsInsights;

export function AnalyticsDetailRegion({className, children, ...props}: RegionProps) {
  return <section {...props} data-erp-region="analytics-detail" data-analytics-region-order="detail" className={cn("min-w-0", className)}>{children}</section>;
}
