import {Popover as BasePopover} from "@base-ui/react/popover";
import {lazy, Suspense, useEffect, useState} from "react";
import {LogOut, Menu, Search, Sparkles, UserRound} from "lucide-react";
import {useRouterState} from "@tanstack/react-router";
import {Button} from "@/src/components/ui";
import {useUiStore} from "@/src/stores";
import {useAuth} from "@/src/app/auth";
import {WorkspaceTabs} from "./WorkspaceTabs";

const GlobalSearchDialog = lazy(() =>
  import("./GlobalSearchDialog").then((module) => ({default: module.GlobalSearchDialog})),
);

export function AppHeader() {
  const setMobileSidebarOpen = useUiStore((state) => state.setMobileSidebarOpen);
  const setAiDrawerOpen = useUiStore((state) => state.setAiDrawerOpen);
  const {session, logout} = useAuth();
  const pathname = useRouterState({select: (state) => state.location.pathname});
  const [searchOpen, setSearchOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setSearchOpen(true);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  useEffect(() => setAccountOpen(false), [pathname]);

  return (
    <>
      <header className="erp-tab-navigation relative flex h-[var(--erp-workspace-bar-height)] min-h-[var(--erp-workspace-bar-height)] shrink-0 items-center gap-1 border-b border-[var(--erp-color-border)] bg-white/95 px-2 backdrop-blur sm:gap-2 sm:px-3 lg:px-4">
        <Button
          className="lg:hidden"
          aria-label="打开菜单"
          size="icon"
          variant="ghost"
          onClick={() => setMobileSidebarOpen(true)}
        >
          <Menu className="h-4 w-4" />
        </Button>
        <WorkspaceTabs />
        <div className="ml-auto flex shrink-0 items-center gap-1">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label="全局搜索"
            title="全局搜索 · ⌘K / Ctrl+K"
            onClick={() => setSearchOpen(true)}
          >
            <Search className="h-4 w-4" />
          </Button>
          <div className="sm:hidden">
            <BasePopover.Root open={accountOpen} onOpenChange={setAccountOpen}>
              <BasePopover.Trigger
                className="erp-focus-ring inline-flex h-9 w-9 items-center justify-center rounded-[var(--erp-radius-md)] text-[var(--erp-color-text-secondary)] transition-colors hover:bg-[var(--erp-color-surface-muted)] hover:text-[var(--erp-color-text)]"
                aria-label="账号菜单"
                title="账号菜单"
              >
                <UserRound className="h-4 w-4" />
              </BasePopover.Trigger>
              <BasePopover.Portal>
                <BasePopover.Positioner className="erp-popover-layer erp-popover-positioner outline-none" sideOffset={6} align="end">
                  <BasePopover.Popup className="erp-popover-surface w-52 rounded-[var(--erp-radius-lg)] border border-[var(--erp-color-border)] bg-[var(--erp-color-surface)] p-1.5 shadow-[var(--erp-shadow-popover)] outline-none">
                    <Button type="button" variant="ghost" className="w-full justify-start" onClick={() => { setAiDrawerOpen(true); setAccountOpen(false); }}>
                      <Sparkles className="h-4 w-4 text-[var(--erp-color-primary)]" />
                      AI 助手
                    </Button>
                    <Button type="button" variant="ghost" className="w-full justify-start" onClick={() => { setAccountOpen(false); logout(); }}>
                      <LogOut className="h-4 w-4" />
                      退出登录
                      {session?.user.displayName ? <span className="ml-auto max-w-20 truncate text-xs font-normal text-[var(--erp-color-text-muted)]">{session.user.displayName}</span> : null}
                    </Button>
                  </BasePopover.Popup>
                </BasePopover.Positioner>
              </BasePopover.Portal>
            </BasePopover.Root>
          </div>
          <div className="hidden items-center gap-1 sm:flex">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label="AI 助手"
              title="AI 助手"
              onClick={() => setAiDrawerOpen(true)}
            >
              <Sparkles className="h-4 w-4 text-[var(--erp-color-primary)]" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label={`退出登录${session?.user.displayName ? `（${session.user.displayName}）` : ""}`}
              title="退出登录"
              onClick={logout}
            >
              <UserRound className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </header>
      {searchOpen && (
        <Suspense fallback={null}>
          <GlobalSearchDialog open={searchOpen} onOpenChange={setSearchOpen} />
        </Suspense>
      )}
    </>
  );
}
