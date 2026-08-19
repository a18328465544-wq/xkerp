import type {InputHTMLAttributes} from "react";
import {cn} from "@/src/lib/cn";

export function Input({className, ...props}: InputHTMLAttributes<HTMLInputElement>) {
  const hasCustomWidth = Boolean(className?.match(/(?:^|\s)!?w-/));
  return <input {...props} className={cn("erp-focus-ring h-10 rounded-[var(--erp-radius-md)] border border-[var(--erp-color-border)] bg-[var(--erp-color-surface)] px-3 text-sm text-[var(--erp-color-text)] outline-none placeholder:text-[var(--erp-color-text-muted)] focus:border-[var(--erp-color-primary)] disabled:bg-[var(--erp-color-surface-muted)]", hasCustomWidth ? undefined : "w-full", className)} />;
}
