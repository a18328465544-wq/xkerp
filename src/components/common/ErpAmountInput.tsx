import {NumericFormat, type NumericFormatProps} from "react-number-format";
import {cn} from "@/src/lib/cn";

export function ErpAmountInput({className, allowNegative = false, ...props}: Omit<NumericFormatProps, "thousandSeparator">) {
  return <NumericFormat {...props} thousandSeparator="," prefix="¥ " allowNegative={allowNegative} decimalScale={2} data-erp-component="amount-input" className={cn("erp-focus-ring erp-form-control w-full rounded-[var(--erp-radius-control)] border border-[var(--erp-color-border)] bg-[var(--erp-color-surface)] px-3 font-mono text-sm outline-none transition-[border-color,box-shadow] focus:border-[var(--erp-color-primary)]", className)} />;
}
