import {BRAND} from "@/src/config/brand";
import {cn} from "@/src/lib/cn";

/** The store's GPU mark — the same artwork as the favicon. Decorative: the
 * adjacent name carries the accessible label. */
export function ErpBrandMark({className}: {className?: string}) {
  return <img src={BRAND.markSrc} alt="" aria-hidden="true" draggable={false} className={cn("h-9 w-9 shrink-0 select-none rounded-[var(--erp-radius-lg)]", className)} />;
}

/** Mark + store name + product line. `tone="inverse"` is for dark surfaces. */
export function ErpBrandLockup({tone = "default", size = "md", className}: {tone?: "default" | "inverse"; size?: "md" | "lg"; className?: string}) {
  const inverse = tone === "inverse";
  return <div data-erp-component="brand-lockup" className={cn("flex min-w-0 items-center gap-3", className)}>
    <ErpBrandMark className={size === "lg" ? "h-11 w-11" : undefined} />
    <div className="min-w-0 leading-tight">
      <p className={cn("truncate font-semibold", size === "lg" ? "text-base" : "text-sm", inverse ? "text-white" : "text-[var(--erp-color-text)]")}>{BRAND.name}</p>
      <p className={cn("mt-0.5 truncate text-xs", inverse ? "text-white/60" : "text-[var(--erp-color-text-muted)]")}>{BRAND.product}</p>
    </div>
  </div>;
}
