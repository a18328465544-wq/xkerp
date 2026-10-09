import {Switch as SwitchPrimitive} from "@base-ui/react/switch";
import {forwardRef, type ComponentPropsWithoutRef, type ElementRef} from "react";
import {cn} from "@/src/lib/cn";

export interface SwitchProps
  extends Omit<ComponentPropsWithoutRef<typeof SwitchPrimitive.Root>, "onChange"> {
  onChange?: (checked: boolean) => void;
}

export const Switch = forwardRef<
  ElementRef<typeof SwitchPrimitive.Root>,
  SwitchProps
>(function Switch({className, onChange, onCheckedChange, ...props}, ref) {
  const mergedClassName = typeof className === "function"
    ? ((state: Parameters<Extract<ComponentPropsWithoutRef<typeof SwitchPrimitive.Root>["className"], Function>>[0]) => cn("erp-switch-root", (className as Function)(state)))
    : cn("erp-switch-root", className);

  return (
    <SwitchPrimitive.Root
      ref={ref}
      className={mergedClassName}
      onCheckedChange={(checked, event) => {
        onCheckedChange?.(checked, event);
        onChange?.(checked);
      }}
      {...props}
    >
      <SwitchPrimitive.Thumb className="erp-switch-thumb" />
    </SwitchPrimitive.Root>
  );
});

Switch.displayName = "Switch";
