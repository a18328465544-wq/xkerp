import type {HTMLAttributes, ReactNode} from "react";
import {cn} from "@/src/lib/cn";

export function Card({className, children, ...props}: HTMLAttributes<HTMLElement> & {children: ReactNode}) {
  return <section {...props} className={cn("rounded-[var(--erp-radius-lg)] border border-[var(--erp-color-border)] bg-[var(--erp-color-surface)] shadow-[var(--erp-shadow-card)]", className)}>{children}</section>;
}

export function CardHeader({className, children, ...props}: HTMLAttributes<HTMLDivElement> & {children: ReactNode}) {
  return <div {...props} className={cn("flex items-start justify-between gap-3 border-b border-[var(--erp-color-border)] px-5 py-4", className)}>{children}</div>;
}

export function CardContent({className, children, ...props}: HTMLAttributes<HTMLDivElement> & {children: ReactNode}) {
  return <div {...props} className={cn("p-5", className)}>{children}</div>;
}
