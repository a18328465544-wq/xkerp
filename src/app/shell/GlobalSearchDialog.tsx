import {Command, Search} from "lucide-react";
import {useMemo, useState} from "react";
import {useNavigate} from "@tanstack/react-router";
import {Button, Dialog, Input} from "@/src/components/ui";
import {navigationItems} from "@/src/config/navigation";
import {isMenuAllowed} from "@/src/utils/menu";
import {matchesKeyword} from "@/src/utils/search";
import {useAuth} from "@/src/app/auth";

export function GlobalSearchDialog({open, onOpenChange}: {open: boolean; onOpenChange: (open: boolean) => void}) {
  const {session} = useAuth();
  const navigate = useNavigate();
  const [searchText, setSearchText] = useState("");
  const allowedItems = useMemo(
    () => navigationItems.filter((item) => isMenuAllowed(session?.permissions.allowedMenus || [], item.id)),
    [session?.permissions.allowedMenus],
  );
  const results = useMemo(() => {
    const query = searchText.trim();
    return allowedItems.filter((item) => matchesKeyword([item.label, item.path], query)).slice(0, 24);
  }, [allowedItems, searchText]);

  const close = (nextOpen: boolean) => {
    onOpenChange(nextOpen);
    if (!nextOpen) setSearchText("");
  };
  const openResult = (path: string) => {
    close(false);
    void navigate({to: path});
  };

  return <Dialog.Root open={open} onOpenChange={close}>
    <Dialog.Portal>
      <Dialog.Backdrop className="fixed inset-0 erp-modal-layer bg-[var(--erp-color-backdrop)] backdrop-blur-[2px]" />
      <Dialog.Viewport className="fixed inset-0 erp-modal-layer flex items-start justify-center p-4 pt-[12vh]">
        <Dialog.Popup className="w-full max-w-xl overflow-hidden rounded-[var(--erp-radius-xl)] border border-[var(--erp-color-border)] bg-white shadow-[var(--erp-shadow-popover)]">
          <div className="flex items-center gap-3 border-b border-[var(--erp-color-border)] px-4 py-3">
            <Search className="h-5 w-5 shrink-0 text-[var(--erp-color-text-muted)]" aria-hidden="true" />
            <Input autoFocus value={searchText} onChange={(event) => setSearchText(event.target.value)} placeholder="搜索 SN、客户、订单或 GPU 型号" aria-label="全局搜索" className="h-9 border-0 px-0 shadow-none focus:ring-0" />
            <span className="hidden shrink-0 items-center gap-1 rounded border border-[var(--erp-color-border)] px-1.5 py-0.5 text-[10px] text-[var(--erp-color-text-muted)] sm:inline-flex"><Command className="h-3 w-3" aria-hidden="true" />K</span>
          </div>
          <Dialog.Title className="sr-only">全局搜索</Dialog.Title>
          <Dialog.Description className="sr-only">搜索并打开已授权的工作区页面。</Dialog.Description>
          <div className="erp-scrollbar max-h-[min(24rem,60vh)] overflow-y-auto p-2" role="listbox" aria-label="搜索结果">
            {results.length ? results.map((item) => <Button key={item.id} type="button" variant="ghost" className="h-auto w-full justify-start gap-3 rounded-[var(--erp-radius-md)] px-3 py-2.5 text-left" onClick={() => openResult(item.path)}><item.icon className="h-4 w-4 shrink-0 text-[var(--erp-color-text-muted)]" aria-hidden="true" /><span className="min-w-0"><span className="block truncate text-sm font-semibold">{item.label}</span><span className="block truncate text-[11px] text-[var(--erp-color-text-muted)]">{item.path}</span></span></Button>) : <p className="px-3 py-8 text-center text-sm text-[var(--erp-color-text-muted)]" role="status">没有匹配的已授权页面</p>}
          </div>
        </Dialog.Popup>
      </Dialog.Viewport>
    </Dialog.Portal>
  </Dialog.Root>;
}
