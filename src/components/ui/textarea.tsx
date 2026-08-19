import type {TextareaHTMLAttributes} from "react";
import {cn} from "@/src/lib/cn";

export function Textarea({className, ...props}: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...props} className={cn("erp-focus-ring min-h-24 w-full resize-y rounded-[var(--erp-radius-md)] border border-[var(--erp-color-border)] bg-[var(--erp-color-surface)] px-3 py-2 text-sm text-[var(--erp-color-text)] outline-none placeholder:text-[var(--erp-color-text-muted)] focus:border-[var(--erp-color-primary)]", className)} />;
}
