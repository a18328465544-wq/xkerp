import {useCallback, useEffect, useState} from "react";
import {useWorkspaceTabActivity} from "./useWorkspaceTabRuntime";

type UrlSearchStateOptions<T> = {
  defaultValue: T;
  parse: (search: string) => T;
  serialize: (value: T) => URLSearchParams;
  preserveKeys?: readonly string[];
};

function currentSearch() {
  return typeof window === "undefined" ? "" : window.location.search;
}

function writeSearch(params: URLSearchParams) {
  if (typeof window === "undefined") return;
  const query = params.toString();
  window.history.replaceState(null, "", `${window.location.pathname}${query ? `?${query}` : ""}${window.location.hash}`);
  window.dispatchEvent(new PopStateEvent("popstate"));
}

/**
 * URL state boundary used by list pages. Browser history remains the transport
 * for compatibility with existing routes, but parsing/serialization and
 * popstate handling now live in one hook instead of every page.
 */
export function useUrlSearchState<T>({defaultValue, parse, serialize, preserveKeys = []}: UrlSearchStateOptions<T>) {
  const {active} = useWorkspaceTabActivity();
  // Keep-alive pages all live in the same React tree. Their URL state must not
  // react to another page's query-string changes while they are hidden, or a
  // detail drawer from the hidden page can be portaled over the active page.
  const [value, setValue] = useState<T>(() => typeof window === "undefined" || !active ? defaultValue : parse(currentSearch()));

  useEffect(() => {
    if (!active) return;
    const onPopState = () => setValue(parse(currentSearch()));
    window.addEventListener("popstate", onPopState);
    // A keep-alive page may become active without remounting. Re-read the
    // current URL at that boundary so direct links and browser navigation are
    // still reflected by the newly visible page.
    onPopState();
    return () => window.removeEventListener("popstate", onPopState);
  }, [active, parse]);

  const commit = useCallback((next: T) => {
    const current = new URLSearchParams(currentSearch());
    const nextParams = serialize(next);
    for (const key of preserveKeys) {
      const currentValue = current.get(key);
      if (currentValue !== null && !nextParams.has(key)) nextParams.set(key, currentValue);
    }
    setValue(next);
    writeSearch(nextParams);
  }, [preserveKeys, serialize]);

  return {value, setValue, commit};
}

export function replaceUrlSearch(params: URLSearchParams) {
  writeSearch(params);
}
