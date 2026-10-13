import {ArrowUp} from "lucide-react";
import {Button} from "@/src/components/ui";
import {lazy, Suspense, useCallback, useEffect, useRef, useState, type ReactNode} from "react";
import {useQueryClient} from "@tanstack/react-query";
import {useRouterState} from "@tanstack/react-router";
import {AppHeader} from "./AppHeader";
import {AppSidebar} from "./AppSidebar";
import {WorkspaceTabRuntimeProvider, useWorkspaceTabRuntime} from "@/src/hooks/useWorkspaceTabRuntime";
import {reportClientError} from "@/src/services/observability";
import {WorkspaceTabWorkspaceProvider} from "./WorkspaceTabWorkspace";
import {WorkspaceTabKeepAlive} from "./WorkspaceTabKeepAlive";
import {AppMobileNavigation} from "./AppMobileNavigation";
import {useErpPhone} from "@/src/hooks/useErpViewport";
import {usePhoneKeyboard} from "./PhoneViewportProvider";
import {PhoneBackProvider} from "@/src/hooks/usePhoneBack";
import {useAuth} from "@/src/app/auth";
import {isPathAllowed, navigationItems} from "@/src/config/navigation";
import {notify} from "@/src/utils/notification";
import {ErpPullToRefreshIndicator, usePullToRefresh} from "@/src/components/common";

const ErpAiDrawer = lazy(() =>
  import("@/src/components/common/ErpAiDrawer").then((module) => ({default: module.ErpAiDrawer})),
);

export function AppShell({children}: {children: ReactNode}) {
  const {session} = useAuth();
  const allowedMenus = session?.permissions.allowedMenus || [];
  const recoveryPath = navigationItems.find((item) => !item.hiddenInNavigation && isPathAllowed(allowedMenus, item.path))?.path;
  return <WorkspaceTabRuntimeProvider><WorkspaceTabWorkspaceProvider><PhoneBackProvider recoveryPath={recoveryPath} isPathAllowed={(pathname) => isPathAllowed(allowedMenus, pathname)}><AppShellContent>{children}</AppShellContent></PhoneBackProvider></WorkspaceTabWorkspaceProvider></WorkspaceTabRuntimeProvider>;
}

function AppShellContent({children}: {children: ReactNode}) {
  const queryClient = useQueryClient();
  const pathname = useRouterState({select: (state) => state.location.pathname});
  const mainRef = useRef<HTMLElement>(null);
  const phone = useErpPhone();
  const [profileVisible, setProfileVisible] = useState(false);
  const keyboard = usePhoneKeyboard();
  const [showScrollTop, setShowScrollTop] = useState(false);
  const {clearNavigationIntent} = useWorkspaceTabRuntime();

  const onPullRefresh = useCallback(async () => {
    try {
      await queryClient.refetchQueries({type: "active"}, {throwOnError: true});
    } catch {
      notify.error("刷新失败，请稍后重试");
    }
  }, [queryClient]);

  const pullState = usePullToRefresh({
    containerRef: mainRef,
    onRefresh: onPullRefresh,
    enabled: phone && !profileVisible,
  });

  useEffect(() => {
    setShowScrollTop(false);
  }, [pathname]);

  useEffect(() => {
    const mainEl = mainRef.current;
    if (!phone || !mainEl) return;
    const onScroll = () => {
      setShowScrollTop(mainEl.scrollTop > 380);
    };
    mainEl.addEventListener("scroll", onScroll, {passive: true});
    return () => mainEl.removeEventListener("scroll", onScroll);
  }, [phone]);

  // Give keyboard and screen-reader users a predictable reading position after
  // workspace navigation. Dialogs and form controls retain focus when they
  // change without changing the route.
  useEffect(() => {
    clearNavigationIntent();
    mainRef.current?.focus({preventScroll: true});
  }, [clearNavigationIntent, pathname]);

  useEffect(() => {
    const handleRuntimeError = (event: ErrorEvent) => {
      reportClientError({kind: "runtime", message: event.error instanceof Error ? event.error.message : event.message || "未捕获的前端错误"});
    };
    const handleRejection = (event: PromiseRejectionEvent) => {
      reportClientError({kind: "runtime", message: event.reason instanceof Error ? event.reason.message : String(event.reason || "未处理的异步错误")});
    };
    window.addEventListener("error", handleRuntimeError);
    window.addEventListener("unhandledrejection", handleRejection);
    return () => {
      window.removeEventListener("error", handleRuntimeError);
      window.removeEventListener("unhandledrejection", handleRejection);
    };
  }, []);

  return <div data-erp-shell="true" data-phone-keyboard={keyboard.open ? "open" : undefined} className="flex h-[100dvh] min-w-0 overflow-hidden bg-[var(--erp-color-canvas)]">
    <a href="#main-content" hidden={phone && profileVisible} className="erp-skip-link">跳到主要内容</a>
    <AppSidebar />
    <div className="flex min-h-0 min-w-0 flex-1 flex-col"><AppHeader /><main id="main-content" inert={phone && profileVisible || undefined} aria-hidden={phone && profileVisible || undefined} ref={mainRef} tabIndex={-1} aria-label="主要内容" className="erp-main-content erp-scrollbar min-h-0 min-w-0 flex-1 overflow-x-hidden overflow-y-auto p-3 outline-none sm:p-4 lg:p-6">{phone && <ErpPullToRefreshIndicator state={pullState} />}<WorkspaceTabKeepAlive fallback={children} scrollContainerRef={mainRef} /></main>{phone && showScrollTop && <Button type="button" size="iconTouch" variant="secondary" aria-label="回到顶部" className="erp-phone-scroll-top" onClick={() => mainRef.current?.scrollTo({top: 0, behavior: "smooth"})}><ArrowUp className="h-5 w-5" /></Button>}{phone && <AppMobileNavigation onProfileVisibilityChange={setProfileVisible} />}</div>
    <Suspense fallback={null}><ErpAiDrawer /></Suspense>
  </div>;
}
