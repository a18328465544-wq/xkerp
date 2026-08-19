import type {ReactNode} from "react";
import {cn} from "@/src/lib/cn";
import {QuickStatusGroup, type QuickStatusItemData, type QuickStatusVariant} from "./ErpQuickStatus";

export interface ErpPageHeaderProps {
  title: ReactNode;
  subtitle?: ReactNode;
  /**
   * High-density pages omit explanatory copy by default. Opt into the default
   * header only when the line changes a decision or communicates a safety
   * constraint (for example, a form workflow or a permission boundary).
   */
  density?: "compact" | "default";
  quickStatus?: ReadonlyArray<QuickStatusItemData>;
  quickStatusVariant?: QuickStatusVariant;
  dateContent?: ReactNode;
  actions?: ReactNode;
}

export function ErpPageHeader({title, subtitle, density = "compact", quickStatus, quickStatusVariant = "compact", dateContent, actions}: ErpPageHeaderProps) {
  const hasQuickStatus = Boolean(quickStatus?.length);
  /* Default headers reserve one subtitle line; async hints must not move actions. */
  const showSubtitle = density === "default";
  const rightArea = dateContent || actions ? <div data-erp-region="header-actions" className="flex w-full shrink-0 flex-wrap items-center justify-start gap-2 sm:w-auto sm:justify-end">{dateContent}{actions}</div> : null;
  return <header data-erp-component="page-header" data-density={density} className={cn("flex flex-col gap-3", density === "default" && "gap-4", hasQuickStatus && "lg:grid lg:grid-cols-[minmax(180px,0.8fr)_minmax(0,1.8fr)_auto] lg:items-start lg:gap-4", !hasQuickStatus && "sm:flex-row sm:items-start sm:justify-between")}>
    <div className="min-w-0"><h1 className={cn("font-bold tracking-tight text-[var(--erp-color-text)]", density === "compact" ? "text-xl sm:text-2xl" : "text-2xl sm:text-[var(--erp-font-page-title)]")}>{title}</h1>{showSubtitle && <p className="erp-annotation-slot mt-1 text-sm text-[var(--erp-color-text-secondary)]" data-empty={!subtitle || undefined} aria-hidden={!subtitle || undefined}>{subtitle || "\u00a0"}</p>}</div>
    {hasQuickStatus ? <QuickStatusGroup items={quickStatus!} variant={quickStatusVariant} className="min-w-0" /> : null}
    {rightArea}
  </header>;
}
