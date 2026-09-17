import {Button} from "@/src/components/ui";
import {ErpDialogShell} from "./ErpDialogShell";

export function ErpUnsavedChangesDialog({open, onStay, onLeave}: {open: boolean; onStay: () => void; onLeave: () => void}) {
  return <ErpDialogShell
    open={open}
    onOpenChange={(nextOpen) => {if (!nextOpen) onStay();}}
    title="当前内容尚未保存"
    description="离开后当前表单中的修改会丢失。你可以继续编辑，或确认放弃本次修改。"
    footer={<><Button type="button" variant="secondary" autoFocus onClick={onStay}>继续编辑</Button><Button type="button" variant="danger" onClick={onLeave}>放弃并离开</Button></>}
  >
    <p className="text-sm text-[var(--erp-color-text-secondary)]">请确认是否要离开当前页面。</p>
  </ErpDialogShell>;
}
