import {Command, CornerDownLeft, Search} from "lucide-react";
import {useEffect, useMemo, useState} from "react";
import {useNavigate} from "@tanstack/react-router";
import {Button, Dialog, Input} from "@/src/components/ui";
import {navigationItems} from "@/src/config/navigation";
import {isMenuAllowed} from "@/src/utils/menu";
import {matchesKeyword} from "@/src/utils/search";
import {useAuth} from "@/src/app/auth";
import {cn} from "@/src/lib/cn";

export function GlobalSearchDialog({open, onOpenChange}: {open: boolean; onOpenChange: (open: boolean) => void}) {
  const {session} = useAuth();
  const navigate = useNavigate();
  const [searchText, setSearchText] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);

  const allowedItems = useMemo(
    () => navigationItems.filter((item) => isMenuAllowed(session?.permissions.allowedMenus || [], item.id)),
    [session?.permissions.allowedMenus],
  );
  const results = useMemo(() => {
    const query = searchText.trim();
    return allowedItems.filter((item) => matchesKeyword([item.label, item.path], query)).slice(0, 24);
  }, [allowedItems, searchText]);

  useEffect(() => {
    setActiveIndex(0);
  }, [results]);

  const close = (nextOpen: boolean) => {
    onOpenChange(nextOpen);
    if (!nextOpen) {
      setSearchText("");
      setActiveIndex(0);
    }
  };

  const openResult = (path: string) => {
    close(false);
    void navigate({to: path});
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (!results.length) return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((prev) => (prev + 1) % results.length);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((prev) => (prev - 1 + results.length) % results.length);
    } else if (event.key === "Enter") {
      event.preventDefault();
      const selected = results[activeIndex];
      if (selected) openResult(selected.path);
    }
  };

  return (
    <Dialog.Root open={open} onOpenChange={close}>
      <Dialog.Portal>
        <Dialog.Backdrop className="erp-modal-layer fixed inset-0 bg-[var(--erp-color-backdrop)] backdrop-blur-[2px]" />
        <Dialog.Viewport className="erp-modal-layer fixed inset-0 flex items-start justify-center p-4 pt-[12vh]">
          <Dialog.Popup className="w-full max-w-xl overflow-hidden rounded-[var(--erp-radius-xl)] border border-[var(--erp-color-border)] bg-white shadow-[var(--erp-shadow-popover)]">
            <div className="flex items-center gap-3 border-b border-[var(--erp-color-border)] px-4 py-3">
              <Search className="h-5 w-5 shrink-0 text-[var(--erp-color-text-muted)]" aria-hidden="true" />
              <Input
                autoFocus
                value={searchText}
                onChange={(event) => setSearchText(event.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="搜索工作区模块、SN、客户、订单或 GPU 型号"
                aria-label="全局搜索"
                className="h-9 border-0 px-0 shadow-none focus:ring-0"
              />
              <span className="hidden shrink-0 items-center gap-1 rounded border border-[var(--erp-color-border)] px-1.5 py-0.5 text-[10px] text-[var(--erp-color-text-muted)] sm:inline-flex">
                <Command className="h-3 w-3" aria-hidden="true" />K
              </span>
            </div>
            <Dialog.Title className="sr-only">全局搜索</Dialog.Title>
            <Dialog.Description className="sr-only">搜索并打开已授权的工作区页面。</Dialog.Description>
            <div className="erp-scrollbar max-h-[min(24rem,60vh)] overflow-y-auto p-2" role="listbox" aria-label="搜索结果">
              {results.length ? (
                results.map((item, index) => {
                  const isSelected = index === activeIndex;
                  return (
                    <Button
                      key={item.id}
                      type="button"
                      variant="ghost"
                      className={cn(
                        "h-auto w-full justify-start gap-3 rounded-[var(--erp-radius-md)] px-3 py-2.5 text-left transition-colors",
                        isSelected && "bg-[var(--erp-color-info-soft)] text-[var(--erp-color-primary)] font-medium",
                      )}
                      onClick={() => openResult(item.path)}
                      onMouseEnter={() => setActiveIndex(index)}
                    >
                      <item.icon
                        className={cn(
                          "h-4 w-4 shrink-0 transition-colors",
                          isSelected ? "text-[var(--erp-color-primary)]" : "text-[var(--erp-color-text-muted)]",
                        )}
                        aria-hidden="true"
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold">{item.label}</span>
                        <span
                          className={cn(
                            "block truncate text-[11px]",
                            isSelected ? "text-[var(--erp-color-primary)]/80" : "text-[var(--erp-color-text-muted)]",
                          )}
                        >
                          {item.path}
                        </span>
                      </span>
                      {isSelected && (
                        <CornerDownLeft className="h-3.5 w-3.5 shrink-0 text-[var(--erp-color-primary)] opacity-70" aria-hidden="true" />
                      )}
                    </Button>
                  );
                })
              ) : (
                <p className="px-3 py-8 text-center text-sm text-[var(--erp-color-text-muted)]" role="status">
                  没有匹配的已授权工作区
                </p>
              )}
            </div>
            {results.length > 0 && (
              <div className="flex items-center justify-between border-t border-[var(--erp-color-border)] bg-[var(--erp-color-surface-muted)]/60 px-4 py-2 text-[11px] text-[var(--erp-color-text-muted)]">
                <div className="flex items-center gap-3">
                  <span className="flex items-center gap-1">
                    <kbd className="rounded border border-[var(--erp-color-border)] bg-[var(--erp-color-surface)] px-1 py-0.5 font-mono text-[10px]">↑↓</kbd>
                    导航
                  </span>
                  <span className="flex items-center gap-1">
                    <kbd className="rounded border border-[var(--erp-color-border)] bg-[var(--erp-color-surface)] px-1 py-0.5 font-mono text-[10px]">↵</kbd>
                    进入
                  </span>
                  <span className="flex items-center gap-1">
                    <kbd className="rounded border border-[var(--erp-color-border)] bg-[var(--erp-color-surface)] px-1 py-0.5 font-mono text-[10px]">esc</kbd>
                    关闭
                  </span>
                </div>
                <span className="tabular-nums">共 {results.length} 个工作区</span>
              </div>
            )}
          </Dialog.Popup>
        </Dialog.Viewport>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
