import {useCallback, useEffect, useState} from "react";
import {ErpUnsavedChangesDialog} from "./ErpUnsavedChangesDialog";

export function useErpDirtyGuard(dirty: boolean) {
  useEffect(() => {
    if (!dirty) return;
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [dirty]);
}

export function confirmLeaveIfDirty(dirty: boolean) {
  return !dirty;
}

/** TanStack Router expects true to mean "keep blocking navigation". */
export function shouldBlockNavigationIfDirty(dirty: boolean) {
  return dirty;
}

export function useErpUnsavedChangesGuard(dirty: boolean) {
  const [pendingAction, setPendingAction] = useState<(() => void) | null>(null);
  const requestLeave = useCallback((action: () => void) => {
    if (!dirty) {
      action();
      return;
    }
    setPendingAction(() => action);
  }, [dirty]);
  const stay = useCallback(() => setPendingAction(null), []);
  const leave = useCallback(() => {
    const action = pendingAction;
    setPendingAction(null);
    action?.();
  }, [pendingAction]);
  return {
    requestLeave,
    dialog: <ErpUnsavedChangesDialog open={Boolean(pendingAction)} onStay={stay} onLeave={leave} />,
  };
}
