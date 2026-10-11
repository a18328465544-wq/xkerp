import {useCallback, useEffect, useRef, useState, type ReactNode} from "react";
import {useQuery} from "@tanstack/react-query";
import {FileText, Loader2, Mic} from "lucide-react";
import {Button, Select} from "@/src/components/ui";
import {queryKeys, voiceApi, type VoiceStatus} from "@/src/services/api";
import type {VoiceParseResult, VoiceResolvedScene, VoiceScene} from "@/src/types/voice";
import {VoiceCaptureButton, type VoiceCaptureMode, type VoiceRecorderSnapshot} from "@/src/features/voice/VoiceCaptureButton";
import {VoiceDraftPanel} from "@/src/features/voice/VoiceDraftPanel";
import {useErpPhone} from "@/src/hooks/useErpViewport";
import {isVoiceEntryShortcut} from "./voiceShortcut";

export function useVoiceStatus() {
  return useQuery<VoiceStatus>({
    queryKey: queryKeys.voice.status(),
    queryFn: ({signal}) => voiceApi.status(signal),
    staleTime: 60_000,
    retry: false,
    refetchOnWindowFocus: false,
  });
}

export interface VoiceEntryControlProps {
  scene: VoiceScene;
  mode?: VoiceCaptureMode;
  label?: string;
  compactTrigger?: boolean;
  allowedScenes?: readonly Exclude<VoiceResolvedScene, null>[];
  initialDraft?: {result: VoiceParseResult; transcript: string} | null;
  initialDraftPresentation?: "desktop" | "phone" | "all";
  applyLabel?: string;
  onTranscript?: (transcript: string) => void | Promise<void>;
  onTextFallback?: () => void;
  onParsed?: (result: VoiceParseResult) => void | Promise<void>;
  onApply?: (result: VoiceParseResult, transcript: string) => void | Promise<void>;
  renderPreview?: (result: VoiceParseResult) => ReactNode;
  applyDisabled?: boolean;
  className?: string;
}

export function VoiceEntryControl({scene, mode = "toggle", label, compactTrigger = false, allowedScenes, initialDraft, initialDraftPresentation = "all", applyLabel = "应用到当前表单草稿", onTranscript, onTextFallback, onParsed, onApply, renderPreview, applyDisabled = false, className}: VoiceEntryControlProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const status = useVoiceStatus();
  const phone = useErpPhone();
  const [open, setOpen] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [parsed, setParsed] = useState<VoiceParseResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [statusText, setStatusText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [recording, setRecording] = useState<VoiceRecorderSnapshot>({state: "idle", elapsedMs: 0, level: 0});
  const selectedSceneRef = useRef<Exclude<VoiceResolvedScene, null> | "">(scene === "auto" ? "" : scene);
  const [selectedScene, setSelectedScene] = useState<Exclude<VoiceResolvedScene, null> | "">(scene === "auto" ? "" : scene);
  const onParsedRef = useRef(onParsed);
  const initialDraftIdRef = useRef<string | null>(null);
  onParsedRef.current = onParsed;

  const parseText = useCallback(async (text: string, requestedScene: VoiceScene = scene) => {
    setBusy(true);
    setStatusText("解析中…");
    setError(null);
    try {
      const result = await voiceApi.parse({text, scene: requestedScene});
      if (result.scene) {
        selectedSceneRef.current = result.scene;
        setSelectedScene(result.scene);
      }
      if (onParsed) setStatusText("正在匹配表单候选…");
      await onParsed?.(result);
      setParsed(result);
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

  const applyParsedDraft = useCallback(async () => {
    if (!parsed || !onApply) return;
    setBusy(true);
    setError(null);
    try {
      await onApply(parsed, transcript);
      setOpen(false);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "草稿无法应用，请继续编辑识别文字。 ");
    } finally {
      setBusy(false);
    }
  }, [onApply, parsed, transcript]);

  useEffect(() => {
    const draft = initialDraft;
    if (initialDraftPresentation === "desktop" && phone || initialDraftPresentation === "phone" && !phone) return;
    if (!draft || initialDraftIdRef.current === draft.result.parseId) return;
    initialDraftIdRef.current = draft.result.parseId;
    setOpen(true);
    setTranscript(draft.transcript);
    setParsed(null);
    setError(null);
    setBusy(true);
    setStatusText("正在匹配表单候选…");
    void (async () => {
      try {
        await onParsedRef.current?.(draft.result);
        setParsed(draft.result);
        setStatusText("");
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : "草稿候选准备失败，请重试。");
        setStatusText("");
      } finally {
        setBusy(false);
      }
    })();
  }, [initialDraft?.result.parseId, initialDraftPresentation, phone]);

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
      if (!isVoiceEntryShortcut(event)) return;
      event.preventDefault();
      rootRef.current?.querySelector<HTMLButtonElement>("[data-voice-entry-trigger]")?.click();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [mode]);

  const sceneLabel = scene === "auto" ? "快捷录入" : scene === "purchase" ? "采购单" : scene === "sales" ? "销售单" : "客户线索";
  const asrEnabled = status.data?.asrEnabled === true;
  const fallbackLabel = mode === "hold" ? "改用文字" : label || "文字录入";
  const availableSceneOptions = (allowedScenes || ["purchase", "sales", "customer"]).map((value) => ({value, label: value === "purchase" ? "采购开单" : value === "sales" ? "销售开单" : "新建客户"}));
  const unresolvedScene = scene === "auto" && parsed?.scene === null;
  const parseSelectedScene = () => {
    const requested = selectedSceneRef.current;
    if (!requested || (allowedScenes && !allowedScenes.includes(requested))) {
      setError("请选择当前账号有权限的录入场景。");
      return;
    }
    void parseText(transcript.trim(), requested);
  };

  return <div ref={rootRef} className={className} data-erp-component="voice-entry-control">
    {status.isPending ? <Button type="button" variant="secondary" disabled data-voice-entry-trigger aria-label="正在检查语音输入能力" size={compactTrigger ? "icon" : undefined}><Loader2 className="h-4 w-4 animate-spin" />{!compactTrigger && "检查语音…"}</Button>
      : asrEnabled ? <VoiceCaptureButton mode={mode} maxSeconds={status.data?.maxSeconds || 30} onAudio={handleAudio} onRecorderChange={setRecording} onUnavailable={handleUnavailable} compactTrigger={compactTrigger} triggerLabel={label} className={compactTrigger ? "h-9 w-9" : mode === "hold" ? "min-h-12 w-full" : "min-h-[var(--erp-control-height)]"} />
      : <Button type="button" variant="secondary" data-voice-entry-trigger aria-label={compactTrigger ? "打开语音快捷录入（当前使用文字输入）" : undefined} aria-keyshortcuts={mode === "toggle" ? "Alt+V" : undefined} title={compactTrigger ? "语音快捷录入（未配置识别服务，点击后可输入文字）" : mode === "toggle" ? "文字录入（语音识别未启用）· Alt+V" : "改用文字输入"} size={compactTrigger ? "icon" : undefined} className={compactTrigger ? "h-9 w-9" : undefined} onClick={openTextFallback}>{compactTrigger ? <Mic className="h-4 w-4" /> : <><FileText className="h-4 w-4" />{fallbackLabel}</>}</Button>}
    {mode === "hold" && (recording.state === "starting" || recording.state === "recording") && <div className="pointer-events-none fixed inset-0 z-[var(--erp-layer-modal)] flex items-center justify-center bg-[var(--erp-color-backdrop)] px-6" role="status" aria-live="polite" aria-label="正在录音，松开按钮结束，上滑取消"><div className="w-full max-w-sm rounded-[var(--erp-radius-xl)] border border-[var(--erp-color-border)] bg-[var(--erp-color-surface)] p-6 text-center shadow-[var(--erp-shadow-popover)]"><span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-[var(--erp-color-warning-soft)] text-[var(--erp-color-warning)]"><Mic className="h-7 w-7" /></span><p className="mt-4 text-lg font-semibold text-[var(--erp-color-text)]">{recording.state === "starting" ? "正在启动麦克风…" : "正在录音"}</p><p aria-hidden="true" className="mt-2 text-2xl font-semibold tabular-nums text-[var(--erp-color-text)]">{formatClock(recording.elapsedMs)}</p><p className="mt-2 text-sm text-[var(--erp-color-text-secondary)]">松开结束 · 向上滑动取消</p><div className="mx-auto mt-4 flex h-8 items-center justify-center gap-1" aria-hidden="true">{[0.4, 0.7, 1, 0.62, 0.38].map((scale, index) => <i key={index} className="h-3 w-1.5 animate-pulse motion-reduce:animate-none rounded-full bg-[var(--erp-color-primary)]" style={{animationDelay: `${index * 100}ms`, transform: `scaleY(${Math.max(0.5, recording.level * 2) * scale})`}} />)}</div></div></div>}
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
      {unresolvedScene && <section className="space-y-2 rounded-[var(--erp-radius-md)] border border-[var(--erp-color-warning)]/30 bg-[var(--erp-color-warning-soft)] p-3" aria-label="选择录入场景"><p className="text-sm font-medium text-[var(--erp-color-text)]">暂时无法判断要进入哪种录入，请选择场景后重新解析。</p><div className="flex flex-wrap items-center gap-2"><Select className="min-w-44 flex-1" value={selectedScene} options={availableSceneOptions} onValueChange={(value) => {const next = value as Exclude<VoiceResolvedScene, null>; selectedSceneRef.current = next; setSelectedScene(next);}} aria-label="语音录入场景" placeholder="选择录入场景" /><Button type="button" variant="secondary" onClick={parseSelectedScene} disabled={busy || !selectedScene}>重新解析</Button></div></section>}
      {parsed && (renderPreview ? renderPreview(parsed) : <VoiceParsePreview result={parsed} />)}
      {parsed && onApply && <Button type="button" variant="primary" className="w-full sm:w-auto" onClick={() => void applyParsedDraft()} disabled={busy || applyDisabled || scene === "auto" && parsed.scene === null}>{applyLabel}</Button>}
    </VoiceDraftPanel>
  </div>;
}

function formatClock(milliseconds: number) {
  const seconds = Math.floor(milliseconds / 1_000);
  return `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
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
