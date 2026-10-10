import type {ReactNode} from "react";
import {useErpPhone} from "@/src/hooks/useErpViewport";
import {Button, Textarea} from "@/src/components/ui";
import {ErpDetailDrawer, ErpDialogShell} from "@/src/components/common";

export interface VoiceDraftPanelProps {
  open: boolean;
  sceneLabel: string;
  transcript: string;
  onTranscriptChange: (value: string) => void;
  onReparse: () => void;
  onClose: () => void;
  pending?: boolean;
  statusText?: string;
  error?: string | null;
  children?: ReactNode;
}

export interface VoiceDraftTranscriptEditorProps {
  sceneLabel: string;
  transcript: string;
  onTranscriptChange: (value: string) => void;
  error?: string | null;
  statusText?: string;
  children?: ReactNode;
}

export function VoiceDraftTranscriptEditor({sceneLabel, transcript, onTranscriptChange, error, statusText, children}: VoiceDraftTranscriptEditorProps) {
  return <div className="space-y-4">
    {statusText && <p role="status" aria-live="polite" className="text-sm text-[var(--erp-color-text-secondary)]">{statusText}</p>}
    <section className="space-y-2">
      <label htmlFor="voice-draft-transcript" className="text-sm font-medium text-[var(--erp-color-text)]">识别文字 · {sceneLabel}</label>
      <Textarea id="voice-draft-transcript" value={transcript} onChange={(event) => onTranscriptChange(event.target.value)} rows={4} maxLength={2_000} className="text-base sm:text-sm" aria-describedby="voice-draft-audio-disclosure" />
      <p id="voice-draft-audio-disclosure" className="text-xs leading-5 text-[var(--erp-color-text-muted)]">录音仅用于识别，不保存；转写内容可以编辑，只有点击原表单的确认提交后才会保存业务数据。</p>
    </section>
    {error && <p role="alert" className="text-sm text-[var(--erp-color-danger)]">{error}</p>}
    {children}
  </div>;
}

export function VoiceDraftPanel({open, sceneLabel, transcript, onTranscriptChange, onReparse, onClose, pending = false, statusText, error, children}: VoiceDraftPanelProps) {
  const phone = useErpPhone();
  const description = "识别文字可以修改。录音会发送至当前配置的语音识别服务，不保存音频；草稿仅在你确认后写入业务单据。";
  const body = <VoiceDraftTranscriptEditor sceneLabel={sceneLabel} transcript={transcript} onTranscriptChange={onTranscriptChange} error={error} statusText={statusText}>{children}</VoiceDraftTranscriptEditor>;
  const footer = <>{phone && <Button type="button" variant="secondary" onClick={() => document.getElementById("voice-draft-transcript")?.focus()}>改用文字</Button>}<Button type="button" variant="primary" disabled={pending || !transcript.trim()} loading={pending} onClick={onReparse}>{pending ? "解析中…" : "重新解析"}</Button></>;

  if (phone) return <ErpDialogShell open={open} onOpenChange={(next) => {if (!next) onClose();}} title="语音录入草稿" description={description} size="lg" mobilePresentation="sheet" pending={pending} footer={footer}>{body}</ErpDialogShell>;
  return <ErpDetailDrawer open={open} onOpenChange={(next) => {if (!next) onClose();}} title="语音录入草稿" description={description} footer={footer}>{body}</ErpDetailDrawer>;
}
