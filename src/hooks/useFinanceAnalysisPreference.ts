import {useCallback, useState, type Dispatch, type SetStateAction} from "react";

const STORAGE_PREFIX = "gpu-erp-v2:finance:analysis:";

function readExpanded(key: string): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(`${STORAGE_PREFIX}${key}`) === "expanded";
  } catch {
    return false;
  }
}

function writeExpanded(key: string, expanded: boolean): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(`${STORAGE_PREFIX}${key}`, expanded ? "expanded" : "collapsed");
  } catch {
    // Analysis preferences must never block finance pages.
  }
}

export function useFinanceAnalysisPreference(key: string): [boolean, Dispatch<SetStateAction<boolean>>] {
  const [expanded, setExpanded] = useState(() => readExpanded(key));
  const setAndPersist = useCallback<Dispatch<SetStateAction<boolean>>>((nextValue) => {
    setExpanded((current) => {
      const next = typeof nextValue === "function" ? nextValue(current) : nextValue;
      writeExpanded(key, next);
      return next;
    });
  }, [key]);

  return [expanded, setAndPersist];
}
