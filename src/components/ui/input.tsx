import {forwardRef, type InputHTMLAttributes} from "react";
import {cn} from "@/src/lib/cn";

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function Input({className, ...props}, ref) {
  const hasCustomWidth = Boolean(className?.match(/(?:^|\s)!?w-/));
  const dataProps = props as InputHTMLAttributes<HTMLInputElement> & {"data-density"?: string; "data-variant"?: string};
  const compact = dataProps["data-density"] === "compact";
  const search = props.type === "search" || dataProps["data-variant"] === "search";
  return <input ref={ref} {...props} data-erp-component="input" className={cn("erp-focus-ring border border-[var(--erp-color-border)] bg-[var(--erp-color-surface)] px-3 text-sm text-[var(--erp-color-text)] outline-none placeholder:text-[var(--erp-color-text-muted)] transition-[border-color,box-shadow] focus:border-[var(--erp-color-primary)] disabled:bg-[var(--erp-color-surface-muted)]", compact ? "erp-filter-control" : search ? "erp-search-control" : "erp-form-control", hasCustomWidth ? undefined : "w-full", className)} />;
});
