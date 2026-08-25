import {createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode} from "react";
import {useBlocker} from "@tanstack/react-router";
import {WORKSPACE_KEEP_ALIVE_ENTRIES, type WorkspaceKeepAliveKey} from "./workspaceTabRuntimeConfig";

export type WorkspaceNavigationIntent = "switch" | "close" | null;
export type {WorkspaceKeepAliveKey} from "./workspaceTabRuntimeConfig";

type ReleaseRequests = Record<string, number>;
type DirtyTabs = Record<string, boolean>;

interface WorkspaceTabRuntimeValue {
  navigationIntentRef: {current: WorkspaceNavigationIntent};
  setNavigationIntent: (intent: WorkspaceNavigationIntent) => void;
  clearNavigationIntent: () => void;
  releaseTab: (tabId: string) => void;
  releaseRequests: ReleaseRequests;
  setTabDirty: (tabId: string, dirty: boolean) => void;
  isTabDirty: (tabId: string) => boolean;
}

const WorkspaceTabRuntimeContext = createContext<WorkspaceTabRuntimeValue | null>(null);

export function WorkspaceTabRuntimeProvider({children}: {children: ReactNode}) {
  const navigationIntentRef = useRef<WorkspaceNavigationIntent>(null);
  const [releaseRequests, setReleaseRequests] = useState<ReleaseRequests>({});
  const [dirtyTabs, setDirtyTabs] = useState<DirtyTabs>({});

  const updateNavigationIntent = useCallback((intent: WorkspaceNavigationIntent) => {
    navigationIntentRef.current = intent;
  }, []);
  const clearNavigationIntent = useCallback(() => updateNavigationIntent(null), [updateNavigationIntent]);
  const releaseTab = useCallback((tabId: string) => {
    setReleaseRequests((current) => ({...current, [tabId]: (current[tabId] || 0) + 1}));
    setDirtyTabs((current) => {
      if (!current[tabId]) return current;
      const next = {...current};
      delete next[tabId];
      return next;
    });
  }, []);
  const setTabDirty = useCallback((tabId: string, dirty: boolean) => {
    setDirtyTabs((current) => {
      if (dirty === Boolean(current[tabId])) return current;
      if (!dirty) {
        const next = {...current};
        delete next[tabId];
        return next;
      }
      return {...current, [tabId]: true};
    });
  }, []);
  const isTabDirty = useCallback((tabId: string) => Boolean(dirtyTabs[tabId]), [dirtyTabs]);

  const value = useMemo<WorkspaceTabRuntimeValue>(() => ({
    navigationIntentRef,
    setNavigationIntent: updateNavigationIntent,
    clearNavigationIntent,
    releaseTab,
    releaseRequests,
    setTabDirty,
    isTabDirty,
  }), [clearNavigationIntent, dirtyTabs, isTabDirty, navigationIntentRef, releaseRequests, releaseTab, setTabDirty, updateNavigationIntent]);

  return <WorkspaceTabRuntimeContext.Provider value={value}>{children}</WorkspaceTabRuntimeContext.Provider>;
}

export function useWorkspaceTabRuntime() {
  const context = useContext(WorkspaceTabRuntimeContext);
  if (!context) throw new Error("useWorkspaceTabRuntime 必须在 WorkspaceTabRuntimeProvider 内使用");
  return context;
}

export function shouldBlockWorkspaceNavigation(dirty: boolean, navigationIntent: WorkspaceNavigationIntent) {
  return dirty && navigationIntent !== "switch";
}

export function useWorkspaceTabBlocker(dirty: boolean) {
  const {navigationIntentRef} = useWorkspaceTabRuntime();
  return useBlocker({
    withResolver: true,
    shouldBlockFn: () => shouldBlockWorkspaceNavigation(dirty, navigationIntentRef.current),
    enableBeforeUnload: false,
    disabled: !dirty,
  });
}

export function useWorkspaceTabDirty(tabId: string, dirty: boolean) {
  const {setTabDirty} = useWorkspaceTabRuntime();
  useEffect(() => {
    setTabDirty(tabId, dirty);
    return () => setTabDirty(tabId, false);
  }, [dirty, setTabDirty, tabId]);
}

export function resolveWorkspaceKeepAliveKey(pathname: string): WorkspaceKeepAliveKey | null {
  return WORKSPACE_KEEP_ALIVE_ENTRIES.find((entry) => entry.pathname === pathname)?.key || null;
}

export function keepAliveKeysForTab(tabId: string): WorkspaceKeepAliveKey[] {
  return WORKSPACE_KEEP_ALIVE_ENTRIES.filter((entry) => entry.tabId === tabId).map((entry) => entry.key);
}
