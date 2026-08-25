import {useEffect, useLayoutEffect, useRef, useState, type ReactNode} from "react";
import {keepAliveKeysForTab, resolveWorkspaceKeepAliveKey, useWorkspaceTabRuntime, type WorkspaceKeepAliveKey} from "@/src/hooks/useWorkspaceTabRuntime";

type ScrollContainerRef = {current: HTMLElement | null};

export function WorkspaceKeepAliveOutlet({pathname, children, scrollContainerRef}: {pathname: string; children: ReactNode; scrollContainerRef: ScrollContainerRef}) {
  const {releaseRequests} = useWorkspaceTabRuntime();
  const activeKey = resolveWorkspaceKeepAliveKey(pathname);
  const cacheRef = useRef(new Map<WorkspaceKeepAliveKey, ReactNode>());
  const scrollPositionsRef = useRef<Record<string, number>>({});
  const previousActiveKeyRef = useRef<WorkspaceKeepAliveKey | null>(activeKey);
  const processedReleaseRequestsRef = useRef<Record<string, number>>({});
  const [, refreshCache] = useState(0);

  useLayoutEffect(() => {
    if (!activeKey || cacheRef.current.has(activeKey)) return;
    cacheRef.current.set(activeKey, children);
    refreshCache((value) => value + 1);
  }, [activeKey, children]);

  useEffect(() => {
    let changed = false;
    for (const [tabId, requestCount] of Object.entries(releaseRequests)) {
      const processedCount = processedReleaseRequestsRef.current[tabId] || 0;
      if (requestCount <= processedCount) continue;
      processedReleaseRequestsRef.current[tabId] = requestCount;
      for (const key of keepAliveKeysForTab(tabId)) {
        changed = cacheRef.current.delete(key) || changed;
        delete scrollPositionsRef.current[key];
      }
    }
    if (changed) refreshCache((value) => value + 1);
  }, [releaseRequests]);

  useLayoutEffect(() => {
    const previousKey = previousActiveKeyRef.current;
    const container = scrollContainerRef.current;
    if (container && previousKey !== activeKey) {
      if (previousKey) scrollPositionsRef.current[previousKey] = container.scrollTop;
      container.scrollTop = activeKey ? scrollPositionsRef.current[activeKey] || 0 : 0;
    }
    previousActiveKeyRef.current = activeKey;
  }, [activeKey, scrollContainerRef]);

  const cachedNode = activeKey ? cacheRef.current.get(activeKey) : undefined;
  const hiddenEntries = Array.from(cacheRef.current.entries()).filter(([key]) => key !== activeKey);

  return <>
    {hiddenEntries.map(([key, node]) => <div key={key} hidden aria-hidden="true" className="min-w-0">{node}</div>)}
    {activeKey ? <div key={activeKey} className="min-w-0">{cachedNode ?? children}</div> : children}
  </>;
}
