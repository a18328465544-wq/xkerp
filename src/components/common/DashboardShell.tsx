import type {HTMLAttributes, ReactNode} from "react";
import {cn} from "@/src/lib/cn";

export function DashboardShell({className, children, ...props}: HTMLAttributes<HTMLDivElement> & {children: ReactNode}) {
  return <div {...props} className={cn("mx-auto w-full max-w-[var(--erp-page-max-width)] space-y-5 pb-6", className)}>{children}</div>;
}

export function MetricsRegion({className, children, ...props}: HTMLAttributes<HTMLDivElement> & {children: ReactNode}) {
  return <section {...props} data-erp-component="metrics-region" className={cn("grid grid-cols-[repeat(auto-fit,minmax(min(100%,220px),1fr))] gap-3", className)}>{children}</section>;
}

export function DashboardSection({title, description, actions, density = "compact", className, children, ...props}: Omit<HTMLAttributes<HTMLElement>, "title"> & {title?: ReactNode; description?: ReactNode; actions?: ReactNode; density?: "compact" | "default"; children: ReactNode}) {
  /* Default sections reserve one helper line so async/conditional copy cannot move the content below. */
  const showDescription = density === "default" && Boolean(title || description);
  const hasHeader = Boolean(title || showDescription || actions);
  return <section {...props} data-erp-component="dashboard-section" data-density={density} className={cn("rounded-[var(--erp-radius-xl)] border border-[var(--erp-color-border)] bg-[var(--erp-color-surface)] p-4 shadow-[var(--erp-shadow-card)]", density === "default" && "p-5", className)}>
    {hasHeader && <div data-erp-region="section-header" className={cn("flex flex-wrap items-start justify-between gap-3 border-b border-[var(--erp-color-border)] pb-3", density === "default" && "pb-4")}>
      <div className="min-w-0">{title && <h2 className="text-[var(--erp-font-section-title)] font-bold text-[var(--erp-color-text)]">{title}</h2>}{showDescription && <p className="erp-annotation-slot mt-1 text-xs text-[var(--erp-color-text-secondary)]" data-empty={!description || undefined} aria-hidden={!description || undefined}>{description || "\u00a0"}</p>}</div>
      {actions && <div className="flex w-full shrink-0 flex-wrap items-center gap-2 sm:w-auto sm:justify-end">{actions}</div>}
    </div>}
    <div data-erp-region="section-content" className={cn(hasHeader ? "pt-3" : "", density === "default" && hasHeader && "pt-4")}>{children}</div>
  </section>;
}

export function MainRegion({variant = "70-30", className, children, ...props}: HTMLAttributes<HTMLDivElement> & {variant?: "full" | "70-30" | "60-40" | "50-50"; children: ReactNode}) {
  const grid = variant === "full" ? "grid-cols-1" : variant === "60-40" ? "lg:grid-cols-[minmax(0,3fr)_minmax(280px,2fr)]" : variant === "50-50" ? "lg:grid-cols-2" : "lg:grid-cols-[minmax(0,7fr)_minmax(280px,3fr)]";
  return <div {...props} className={cn("grid min-w-0 grid-cols-1 gap-5", grid, className)}>{children}</div>;
}

function MainRegionPrimary({className, children, ...props}: HTMLAttributes<HTMLDivElement> & {children: ReactNode}) {
  return <div {...props} className={cn("min-w-0", className)}>{children}</div>;
}

function MainRegionSecondary({className, children, ...props}: HTMLAttributes<HTMLDivElement> & {children: ReactNode}) {
  return <aside {...props} className={cn("min-w-0", className)}>{children}</aside>;
}

MainRegion.Primary = MainRegionPrimary;
MainRegion.Secondary = MainRegionSecondary;

export function BottomRegion({className, children, ...props}: HTMLAttributes<HTMLElement> & {children: ReactNode}) {
  if (!children) return null;
  return <section {...props} className={cn("min-w-0", className)}>{children}</section>;
}
