import {NumericFormat, type NumericFormatProps} from "react-number-format";
import {cn} from "@/src/lib/cn";

export function ErpAmountInput({className, allowNegative = false, ...props}: Omit<NumericFormatProps, "thousandSeparator">) {
  return <NumericFormat {...props} thousandSeparator="," prefix="¥ " allowNegative={allowNegative} decimalScale={2} className={cn("erp-focus-ring h-10 w-full rounded-[var(--erp-radius-md)] border border-[var(--erp-color-border)] bg-[var(--erp-color-surface)] px-3 font-mono text-sm outline-none focus:border-[var(--erp-color-primary)]", className)} />;
}
