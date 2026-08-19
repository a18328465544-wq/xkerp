import {useEffect, useMemo, useRef, useState} from "react";
import {Link, useNavigate, useRouterState} from "@tanstack/react-router";
import {Pin, X} from "lucide-react";
import {Button} from "@/src/components/ui";
import {useAuth} from "@/src/app/auth";
import {isNavigationItemActive, navigationItems, type NavigationItem} from "@/src/config/navigation";
import {isMenuAllowed} from "@/src/utils/menu";
import {cn} from "@/src/lib/cn";
import {dedupeWorkspaceTabItems} from "./workspaceTabItems";
import {
  closeWorkspaceTab,
  filterWorkspaceStateByPermissions,
  openWorkspaceTab,
  restoreWorkspaceState,
  type WorkspaceTabState,
  WORKSPACE_HOME_ID,
} from "./workspaceTabState";

const STORAGE_PREFIX = "gpu-erp-v2:workspace-tabs:";

function storageKey(userId: string) {
  return `${STORAGE_PREFIX}${userId}`;
}

function readStoredState(userId: string, allowedIds: string[]) {
  if (typeof window === "undefined") return restoreWorkspaceState(null, allowedIds);
  try {
    return restoreWorkspaceState(window.localStorage.getItem(storageKey(userId)), allowedIds);
  } catch {
    return restoreWorkspaceState(null, allowedIds);
  }
}

function findNavigationItem(pathname: string, allowedIds: string[]) {
  const allowed = (item: NavigationItem) => allowedIds.includes(item.id);
  const exact = navigationItems.find((item) => allowed(item) && isNavigationItemActive(item, pathname));
  if (exact) return exact;
  return navigationItems.find((item) => allowed(item) && item.path !== "/" && pathname.startsWith(`${item.path}/`));
}

function itemById(id: string) {
  return navigationItems.find((item) => item.id === id);
}

export function WorkspaceTabs() {
  const {session} = useAuth();
  const navigate = useNavigate();
  const pathname = useRouterState({select: (state) => state.location.pathname});
  const allowedIds = useMemo(() => {
    const ids = navigationItems
      .filter((item) => isMenuAllowed(session?.permissions.allowedMenus || [], item.id))
      .map((item) => item.id);
    return Array.from(new Set([WORKSPACE_HOME_ID, ...ids]));
  }, [session?.permissions.allowedMenus]);
  const userId = session?.user.id || "anonymous";
  const currentItem = findNavigationItem(pathname, allowedIds);
  const [state, setState] = useState<WorkspaceTabState>(() => readStoredState(userId, allowedIds));
  const stateRef = useRef(state);
  const [pendingClose, setPendingClose] = useState<{id: string; targetId: string; startPathname: string} | null>(null);

  stateRef.current = state;

  useEffect(() => {
    const restored = readStoredState(userId, allowedIds);
    stateRef.current = restored;
    setState(restored);
  }, [allowedIds, userId]);

  useEffect(() => {
    if (!currentItem) return;
    const next = openWorkspaceTab(stateRef.current, currentItem.id);
    if (JSON.stringify(next) === JSON.stringify(stateRef.current)) return;
    stateRef.current = next;
    setState(next);
  }, [currentItem?.id]);

  useEffect(() => {
    if (!pendingClose || pathname === pendingClose.startPathname) return;
    const target = itemById(pendingClose.targetId);
    if (!target || !isNavigationItemActive(target, pathname)) {
      setPendingClose(null);
      return;
    }
    stateRef.current = closeWorkspaceTab(stateRef.current, pendingClose.id);
    setState(stateRef.current);
    setPendingClose(null);
  }, [pathname, pendingClose]);

  useEffect(() => {
    const filtered = filterWorkspaceStateByPermissions(stateRef.current, allowedIds);
    if (JSON.stringify(filtered) === JSON.stringify(stateRef.current)) return;
    stateRef.current = filtered;
    setState(filtered);
  }, [allowedIds]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      window.localStorage.setItem(storageKey(userId), JSON.stringify(state));
    } catch {
      // Storage is an enhancement; navigation remains usable when it is blocked.
    }
  }, [state, userId]);

  const transition = (update: (previous: WorkspaceTabState) => WorkspaceTabState) => {
    const next = update(stateRef.current);
    stateRef.current = next;
    setState(next);
    return next;
  };

  const activate = (id: string) => {
    const item = itemById(id);
    if (!item || !allowedIds.includes(id)) return;
    setPendingClose(null);
    transition((previous) => openWorkspaceTab(previous, id));
  };

  const close = (id: string) => {
    const previous = stateRef.current;
    if (previous.activeId !== id) {
      transition((value) => closeWorkspaceTab(value, id));
      return;
    }
    const next = closeWorkspaceTab(previous, id);
    const item = itemById(next.activeId);
    if (!item || item.path === pathname) {
      transition(() => next);
      return;
    }
    setPendingClose({id, targetId: next.activeId, startPathname: pathname});
    void navigate({to: item.path});
  };

  const pinned = state.pinnedIds.filter((id) => state.openIds.includes(id));
  const regular = state.openIds.filter((id) => !state.pinnedIds.includes(id));
  const tabs = dedupeWorkspaceTabItems([...pinned, ...regular]
    .map((id) => itemById(id))
    .filter((item): item is NavigationItem => Boolean(item)));

  return (
    <nav className="erp-scrollbar flex min-w-0 flex-1 items-center gap-1 overflow-x-auto overflow-y-hidden" aria-label="已打开页面">
      {tabs.map((item) => {
        const active = state.activeId === item.id || isNavigationItemActive(item, pathname);
        const pinnedTab = state.pinnedIds.includes(item.id);
        const closable = item.id !== WORKSPACE_HOME_ID;
        return (
          <div key={item.id} className="group relative flex min-w-[88px] max-w-[144px] shrink-0 items-center sm:min-w-[100px] sm:max-w-[180px]">
            <Link
              to={item.path}
              aria-current={active ? "page" : undefined}
              onClick={() => activate(item.id)}
              className={cn(
                "erp-focus-ring flex h-9 min-w-0 flex-1 items-center gap-1 rounded-[var(--erp-radius-sm)] px-2 pr-6 text-xs font-semibold transition-colors sm:gap-1.5 sm:px-2.5 sm:pr-8",
                active
                  ? "bg-[var(--erp-color-info-soft)] text-[var(--erp-color-primary)]"
                  : "text-[var(--erp-color-text-muted)] hover:bg-[var(--erp-color-surface-muted)] hover:text-[var(--erp-color-text)]",
              )}
            >
              {pinnedTab && <Pin className="h-3 w-3 shrink-0" aria-label="已固定" />}
              <span className="min-w-0 flex-1 truncate">{item.label}</span>
            </Link>
            {closable && (
              <Button
                type="button"
                size="iconTouch"
                variant="ghost"
                aria-label={`关闭${item.label}`}
                title={`关闭${item.label}`}
                className="absolute right-0 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 sm:focus:opacity-100"
                onClick={(event) => { event.stopPropagation(); close(item.id); }}
              >
                <X className="h-3.5 w-3.5" />
              </Button>
            )}
          </div>
        );
      })}
    </nav>
  );
}
