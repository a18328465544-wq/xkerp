import {useCallback, useEffect, useRef, useState} from "react";
import {useQuery} from "@tanstack/react-query";
import {FileText, Loader2} from "lucide-react";
import {Button} from "@/src/components/ui";
import type {VoiceParseResult, VoiceScene} from "@/src/types/voice";
import {voiceApi, type VoiceStatus} from "./voiceApi";
import {VoiceCaptureButton, type VoiceCaptureMode} from "./VoiceCaptureButton";
import {VoiceDraftPanel} from "./VoiceDraftPanel";

const voiceStatusQueryKey = ["voice", "status"] as const;

export function useVoiceStatus() {
  return useQuery<VoiceStatus>({
    queryKey: voiceStatusQueryKey,
    queryFn: ({signal}) => voiceApi.status(signal),
    staleTime: 60_000,
    retry: false,
    refetchOnWindowFocus: false,
  });
}

export interface VoiceEntryControlProps {
  scene: Exclude<VoiceScene, "auto">;
  mode?: VoiceCaptureMode;
  label?: string;
  onTranscript?: (transcript: string) => void | Promise<void>;
  onTextFallback?: () => void;
  onParsed?: (result: VoiceParseResult) => void;
  className?: string;
}

export function VoiceEntryControl({scene, mode = "toggle", label, onTranscript, onTextFallback, onParsed, className}: VoiceEntryControlProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const status = useVoiceStatus();
  const [open, setOpen] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [parsed, setParsed] = useState<VoiceParseResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [statusText, setStatusText] = useState("");
  const [error, setError] = useState<string | null>(null);

  const parseText = useCallback(async (text: string) => {
    if (scene === "customer") return;
    setBusy(true);
    setStatusText("解析中…");
    setError(null);
    try {
      const result = await voiceApi.parse({text, scene});
      setParsed(result);
      onParsed?.(result);
      setStatusText("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "解析失败，请改用文字输入后重试。");
      setStatusText("");
    } finally {
      setBusy(false);
    }
  }, [onParsed, scene]);

  const handleAudio = useCallback(async (audio: Blob) => {
    setOpen(true);
    setParsed(null);
    setError(null);
    setBusy(true);
    setStatusText("识别中…");
    try {
      const result = await voiceApi.transcribe(audio);
      setTranscript(result.text);
      if (onTranscript) {
        await onTranscript(result.text);
        setStatusText("");
        setOpen(false);
        return;
      }
      await parseText(result.text);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "语音识别失败，请改用文字输入。");
      setStatusText("");
    } finally {
      setBusy(false);
    }
  }, [onTranscript, parseText]);

  const openTextFallback = useCallback(() => {
    setError(null);
    if (onTextFallback) {
      onTextFallback();
      return;
    }
    setTranscript("");
    setParsed(null);
    setStatusText("当前未启用语音识别，可直接输入文字生成草稿。");
    setOpen(true);
  }, [onTextFallback]);

  const handleUnavailable = useCallback((reason: string) => {
    setError(reason);
    if (onTextFallback) onTextFallback();
    else {
      setTranscript("");
      setStatusText("麦克风不可用，可直接输入文字生成草稿。");
      setOpen(true);
    }
  }, [onTextFallback]);

  useEffect(() => {
    if (mode !== "toggle") return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.repeat || !event.altKey || event.ctrlKey || event.metaKey || event.shiftKey || event.key.toLowerCase() !== "v") return;
      event.preventDefault();
      rootRef.current?.querySelector<HTMLButtonElement>("[data-voice-entry-trigger]")?.click();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [mode]);

  const sceneLabel = scene === "purchase" ? "采购单" : scene === "sales" ? "销售单" : "客户线索";
  const asrEnabled = status.data?.asrEnabled === true;

  return <div ref={rootRef} className={className} data-erp-component="voice-entry-control">
    {status.isPending ? <Button type="button" variant="secondary" disabled data-voice-entry-trigger aria-label="正在检查语音输入能力"><Loader2 className="h-4 w-4 animate-spin" />检查语音…</Button>
      : asrEnabled ? <VoiceCaptureButton mode={mode} maxSeconds={status.data?.maxSeconds || 30} onAudio={handleAudio} onUnavailable={handleUnavailable} className="min-h-[var(--erp-control-height)]" />
      : <Button type="button" variant="secondary" data-voice-entry-trigger aria-keyshortcuts={mode === "toggle" ? "Alt+V" : undefined} title={mode === "toggle" ? "文字录入（语音识别未启用）· Alt+V" : "文字录入（语音识别未启用）"} onClick={openTextFallback}><FileText className="h-4 w-4" />{label || "文字录入"}</Button>}
    <VoiceDraftPanel
      open={open}
      sceneLabel={sceneLabel}
      transcript={transcript}
      onTranscriptChange={setTranscript}
      onReparse={() => void parseText(transcript.trim())}
      onClose={() => setOpen(false)}
      pending={busy}
      statusText={statusText}
      error={error}
    >
      {parsed && <VoiceParsePreview result={parsed} />}
    </VoiceDraftPanel>
  </div>;
}

function VoiceParsePreview({result}: {result: VoiceParseResult}) {
  const lines = result.purchase?.lines || result.sales?.lines || [];
  const partner = result.purchase?.partner.query || result.sales?.customer.query;
  return <section aria-label="语音解析草稿" className="space-y-3 rounded-[var(--erp-radius-md)] border border-[var(--erp-color-border)] bg-[var(--erp-color-surface-muted)] p-3">
    <div className="flex items-center justify-between gap-3"><h3 className="text-sm font-semibold">识别草稿预览</h3><span className="text-xs text-[var(--erp-color-text-muted)]">{result.source === "ai" ? "AI 解析" : "规则解析"}</span></div>
    {partner && <p className="text-sm text-[var(--erp-color-text-secondary)]">对象：<strong className="text-[var(--erp-color-text)]">{partner}</strong></p>}
    {lines.length > 0 ? <ul className="space-y-2">{lines.map((line, index) => <li key={`${line.productQuery}-${index}`} className="flex flex-wrap justify-between gap-x-3 gap-y-1 text-sm"><span>{line.productQuery} × {line.quantity}</span><span className="erp-data-number text-[var(--erp-color-text-secondary)]">{"buyPrice" in line && line.buyPrice !== undefined ? `¥${line.buyPrice}` : "sellPrice" in line && line.sellPrice !== undefined ? `¥${line.sellPrice}` : "待确认价格"}</span></li>)}</ul> : <p className="text-sm text-[var(--erp-color-text-muted)]">暂未识别到商品明细。</p>}
    {result.issues.length > 0 && <ul className="space-y-1 text-xs text-[var(--erp-color-warning)]">{result.issues.map((issue, index) => <li key={`${issue.field}-${index}`}>{issue.message}</li>)}</ul>}
    <p className="text-xs text-[var(--erp-color-text-muted)]">这只是待确认草稿，不会写入采购或销售业务数据。</p>
  </section>;
}
