import {Button} from "@/src/components/ui";
import {ErpDialogShell} from "@/src/components/common";

export function VoiceHandoffConflictDialog({open, sceneLabel, onAppend, onReplace, onCancel}: {open: boolean; sceneLabel: string; onAppend: () => void; onReplace: () => void; onCancel: () => void}) {
  return <ErpDialogShell open={open} title="当前页面已有未提交草稿" description={`语音${sceneLabel}已准备好。请选择如何处理当前页面中的内容。`} size="sm" mobilePresentation="sheet" onOpenChange={(nextOpen) => {if (!nextOpen) onCancel();}} footer={<><Button type="button" variant="secondary" onClick={onCancel}>取消</Button><Button type="button" variant="secondary" onClick={onAppend}>追加</Button><Button type="button" variant="primary" onClick={onReplace}>替换草稿</Button></>}>
    <p className="text-sm leading-6 text-[var(--erp-color-text-secondary)]">追加会保留当前草稿并带入语音内容；替换会清空当前未提交内容。业务数据只有在原页面点击确认提交后才会保存。</p>
  </ErpDialogShell>;
}
