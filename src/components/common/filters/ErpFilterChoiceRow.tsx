import {ChevronRight} from "lucide-react";
import {Button} from "@/src/components/ui";

/** Whole-row lookup trigger. Option fetching and draft state stay in the domain. */
export function ErpFilterChoiceRow({label, value, onClick}: {label: string; value: string; onClick: () => void}) {
  return <Button variant="ghost" className="erp-filter-choice-row" aria-label={`${label}，${value}`} aria-haspopup="dialog" onClick={onClick}>
    <span className="erp-filter-choice-label">{label}</span><span className="erp-filter-choice-value" title={value}>{value}</span><ChevronRight className="h-4 w-4" aria-hidden="true" />
  </Button>;
}
