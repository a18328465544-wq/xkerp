import type {HTMLAttributes, ReactNode} from "react";
import {cn} from "@/src/lib/cn";
import {AnalyticsFrame} from "./page-frames/AnalyticsFrame";

/**
 * Shared page-frame primitives. They only describe the work pattern of a page;
 * business data and actions stay in the feature that owns the page.
 */
type FrameProps = HTMLAttributes<HTMLDivElement> & {children: ReactNode};

function FrameBase({className, children, ...props}: FrameProps) {
  const hasCustomMaxWidth = Boolean(className?.match(/(?:^|\s)max-w-/));
  return <div {...props} className={cn("mx-auto w-full pb-6", hasCustomMaxWidth ? undefined : "max-w-[var(--erp-page-max-width)]", className)}>{children}</div>;
}

export function ErpListPageFrame({className, children, ...props}: FrameProps) {
  return <FrameBase {...props} data-page-frame="list" className={cn("space-y-4", className)}>{children}</FrameBase>;
}

export function ErpTransactionPageFrame({className, children, ...props}: FrameProps) {
  return <FrameBase {...props} data-page-frame="transaction" className={cn("space-y-3", className)}>{children}</FrameBase>;
}

export function ErpTransactionColumns({className, children, ...props}: FrameProps) {
  return <div {...props} data-page-frame-region="transaction-columns" className={cn("grid min-w-0 items-start gap-3 xl:grid-cols-[minmax(0,1fr)_380px]", className)}>{children}</div>;
}

export function ErpTransactionPrimary({className, children, ...props}: FrameProps) {
  return <div {...props} data-page-frame-region="transaction-primary" className={cn("min-w-0 space-y-3", className)}>{children}</div>;
}

export function ErpTransactionSecondary({className, children, ...props}: FrameProps) {
  return <aside {...props} data-page-frame-region="transaction-secondary" className={cn("space-y-3 xl:sticky xl:top-20", className)}>{children}</aside>;
}

export function ErpWarehousePageFrame({className, children, ...props}: FrameProps) {
  return <FrameBase {...props} data-page-frame="warehouse" className={cn("space-y-4", className)}>{children}</FrameBase>;
}

export function ErpFinancePageFrame({className, children, ...props}: FrameProps) {
  return <FrameBase {...props} data-page-frame="finance" className={cn("max-w-[var(--erp-page-max-width)] space-y-4", className)}>{children}</FrameBase>;
}

export function ErpCrmPageFrame({className, children, ...props}: FrameProps) {
  return <FrameBase {...props} data-page-frame="crm" className={cn("space-y-4", className)}>{children}</FrameBase>;
}

export function ErpAnalyticsPageFrame({className, children, ...props}: FrameProps) {
  return <AnalyticsFrame {...props} className={className}>{children}</AnalyticsFrame>;
}

export function ErpDetailPageFrame({className, children, ...props}: FrameProps) {
  return <FrameBase {...props} data-page-frame="detail" className={cn("space-y-4", className)}>{children}</FrameBase>;
}

export function ErpSettingsPageFrame({className, children, ...props}: FrameProps) {
  return <FrameBase {...props} data-page-frame="settings" className={cn("space-y-4", className)}>{children}</FrameBase>;
}
