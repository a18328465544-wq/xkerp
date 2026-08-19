import type {HTMLAttributes, ReactNode} from "react";
import {cn} from "@/src/lib/cn";

/**
 * The shared outer page contract. It owns canvas width and first-level rhythm;
 * feature pages only provide the regions that have business meaning.
 */
export type ErpPageFrameDensity = "compact" | "standard" | "comfortable";

export interface ErpPageFrameProps extends HTMLAttributes<HTMLDivElement> {
  children?: ReactNode;
  density?: ErpPageFrameDensity;
}

const densityClasses: Record<ErpPageFrameDensity, string> = {
  compact: "space-y-[var(--erp-page-gap-compact)]",
  standard: "space-y-[var(--erp-page-gap)]",
  comfortable: "space-y-[var(--erp-page-gap-comfortable)]",
};

export function ErpPageFrame({density = "standard", className, children, ...props}: ErpPageFrameProps) {
  const hasCustomMaxWidth = Boolean(className?.match(/(?:^|\s)max-w-/));
  return (
    <div
      {...props}
      data-erp-component="page-frame"
      data-page-density={density}
      className={cn(
        "mx-auto w-full pb-6",
        hasCustomMaxWidth ? undefined : "max-w-[var(--erp-page-max-width)]",
        densityClasses[density],
        className,
      )}
    >
      {children}
    </div>
  );
}

export interface ErpPageTopbarProps extends HTMLAttributes<HTMLElement> {
  children?: ReactNode;
}

export function ErpPageTopbar({className, children, ...props}: ErpPageTopbarProps) {
  return (
    <header {...props} data-erp-region="page-topbar" className={cn("flex min-w-0 flex-col gap-3 sm:flex-row sm:items-start sm:justify-between", className)}>
      {children}
    </header>
  );
}

export interface ErpPageIdentityProps extends Omit<HTMLAttributes<HTMLDivElement>, "title"> {
  title?: ReactNode;
  subtitle?: ReactNode;
  reserveSubtitle?: boolean;
  children?: ReactNode;
}

export function ErpPageIdentity({title, subtitle, reserveSubtitle = false, className, children, ...props}: ErpPageIdentityProps) {
  return (
    <div {...props} data-erp-region="page-identity" className={cn("min-w-0", className)}>
      {title ? <h1 className="text-xl font-bold tracking-tight text-[var(--erp-color-text)] sm:text-2xl">{title}</h1> : null}
      {(subtitle || reserveSubtitle) ? <p className="erp-annotation-slot mt-1 max-w-3xl text-sm text-[var(--erp-color-text-secondary)]" data-empty={!subtitle || undefined} aria-hidden={!subtitle || undefined}>{subtitle || "\u00a0"}</p> : null}
      {children}
    </div>
  );
}

export function ErpPageTabs({className, children, ...props}: HTMLAttributes<HTMLElement> & {children?: ReactNode}) {
  return <nav {...props} data-erp-region="page-tabs" className={cn("min-w-0 overflow-x-auto", className)}>{children}</nav>;
}

export function ErpPageActions({className, children, ...props}: HTMLAttributes<HTMLDivElement> & {children?: ReactNode}) {
  return <div {...props} data-erp-region="page-actions" className={cn("flex shrink-0 flex-wrap items-center justify-start gap-2 sm:justify-end", className)}>{children}</div>;
}

export function ErpPageContext({className, children, ...props}: HTMLAttributes<HTMLElement> & {children?: ReactNode}) {
  if (!children) return null;
  return <section {...props} data-erp-region="page-context" className={cn("min-w-0", className)}>{children}</section>;
}

export function ErpPageToolbar({className, children, ...props}: HTMLAttributes<HTMLElement> & {children?: ReactNode}) {
  if (!children) return null;
  return <section {...props} data-erp-region="page-toolbar" className={cn("min-w-0", className)}>{children}</section>;
}

export function ErpPageContent({className, children, ...props}: HTMLAttributes<HTMLElement> & {children?: ReactNode}) {
  return <section {...props} data-erp-region="page-content" className={cn("min-w-0", className)}>{children}</section>;
}
