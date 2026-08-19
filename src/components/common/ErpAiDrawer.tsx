import {Bot, Sparkles, X} from "lucide-react";
import {Dialog, Button} from "@/src/components/ui";
import {useUiStore} from "@/src/stores";

export function ErpAiDrawer() {
  const open = useUiStore((state) => state.aiDrawerOpen);
  const setOpen = useUiStore((state) => state.setAiDrawerOpen);
  return <Dialog.Root open={open} onOpenChange={setOpen}>
    <Dialog.Portal>
      <Dialog.Backdrop className="erp-drawer-backdrop-layer erp-drawer-backdrop fixed inset-x-0 bottom-0 bg-[var(--erp-color-backdrop)] backdrop-blur-[2px]" />
      <Dialog.Viewport className="erp-drawer-layer erp-drawer-viewport fixed inset-x-0 bottom-0 flex justify-end">
        <Dialog.Popup className="flex h-full max-h-full w-full max-w-md flex-col border-l border-[var(--erp-color-border)] bg-[var(--erp-color-surface)] shadow-[var(--erp-shadow-popover)]">
          <div className="flex items-center justify-between border-b border-[var(--erp-color-border)] px-5 py-4"><div className="flex items-center gap-2"><Sparkles className="h-5 w-5 text-[var(--erp-color-primary)]" /><Dialog.Title className="font-bold">AI 助手</Dialog.Title></div><Dialog.Close render={<Button size="icon" variant="ghost" aria-label="关闭 AI 助手"><X className="h-4 w-4" /></Button>} /></div>
          <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center"><span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[var(--erp-color-info-soft)] text-[var(--erp-color-primary)]"><Bot className="h-6 w-6" /></span><h2 className="font-semibold">AI 能力准备中</h2><p className="max-w-xs text-sm leading-6 text-[var(--erp-color-text-secondary)]">前端入口、消息区域和工具调用位置已经预留。接入 FastAPI AI 接口后，这里会显示真实对话与分析结果。</p><span className="rounded-full bg-[var(--erp-color-surface-muted)] px-3 py-1 text-xs text-[var(--erp-color-text-muted)]">本轮不生成模拟建议</span></div>
        </Dialog.Popup>
      </Dialog.Viewport>
    </Dialog.Portal>
  </Dialog.Root>;
}
