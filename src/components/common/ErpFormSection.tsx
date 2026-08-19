import type {ReactNode} from "react";
import {Card, CardContent, CardHeader} from "@/src/components/ui";

export function ErpFormSection({title, description, children}: {title: ReactNode; description?: ReactNode; children: ReactNode}) {
  return <Card><CardHeader><div><h2 className="text-sm font-bold">{title}</h2><p className="erp-annotation-slot mt-1 text-xs text-[var(--erp-color-text-secondary)]" data-empty={!description || undefined} aria-hidden={!description || undefined}>{description || "\u00a0"}</p></div></CardHeader><CardContent>{children}</CardContent></Card>;
}
