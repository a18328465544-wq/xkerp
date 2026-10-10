import {useEffect, useRef, useState, type PointerEvent} from "react";
import {Mic, MicOff, Square} from "lucide-react";
import {Button} from "@/src/components/ui";
import {cn} from "@/src/lib/cn";
import {createVoiceVad} from "./voiceVad";
import {useVoiceRecorder, type VoiceRecorderState} from "./useVoiceRecorder";

export type VoiceCaptureMode = "toggle" | "hold";
export interface VoiceRecorderSnapshot {state: VoiceRecorderState; elapsedMs: number; level: number}

export interface VoiceCaptureButtonProps {
  mode: VoiceCaptureMode;
  maxSeconds: number;
  disabled?: boolean;
  busy?: boolean;
  onAudio: (audio: Blob) => void | Promise<void>;
  onRecorderChange?: (snapshot: VoiceRecorderSnapshot) => void;
  onUnavailable?: (reason: string) => void;
  compactTrigger?: boolean;
  triggerLabel?: string;
  className?: string;
}

function clockLabel(milliseconds: number) {
  const seconds = Math.floor(milliseconds / 1_000);
  return `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
}

export function VoiceCaptureButton({mode, maxSeconds, disabled = false, busy = false, onAudio, onRecorderChange, onUnavailable, compactTrigger = false, triggerLabel, className}: VoiceCaptureButtonProps) {
  const recorder = useVoiceRecorder({maxSeconds, onComplete: onAudio});
  const [cancelArmed, setCancelArmed] = useState(false);
  const pointerStartRef = useRef<{id: number; y: number} | null>(null);
  const releaseIntentRef = useRef<"stop" | "cancel" | null>(null);
  const vadRef = useRef(createVoiceVad());
  const recording = recorder.state === "recording";
  const controlDisabled = disabled || busy || recorder.state === "starting" || recorder.state === "stopping";

  useEffect(() => {onRecorderChange?.({state: recorder.state, elapsedMs: recorder.elapsedMs, level: recorder.level});}, [onRecorderChange, recorder.elapsedMs, recorder.level, recorder.state]);

  useEffect(() => {
    if (mode !== "toggle" || !recording) {
      vadRef.current.reset();
      return;
    }
    if (vadRef.current.update(recorder.level, recorder.elapsedMs)) void recorder.stop();
  }, [mode, recording, recorder.elapsedMs, recorder.level, recorder.stop]);

  const begin = async () => {
    if (controlDisabled || recording) return;
    const result = await recorder.start();
    if (!result.ok) onUnavailable?.(result.reason);
    else if (mode === "hold" && releaseIntentRef.current) {
      const intent = releaseIntentRef.current;
      releaseIntentRef.current = null;
      if (intent === "cancel") void recorder.cancel();
      else void recorder.stop();
    }
  };

  const toggle = () => {
    if (controlDisabled) return;
    if (recording) void recorder.stop();
    else void begin();
  };

  const onPointerDown = (event: PointerEvent<HTMLButtonElement>) => {
    if (mode !== "hold" || controlDisabled || event.button !== 0) return;
    event.preventDefault();
    pointerStartRef.current = {id: event.pointerId, y: event.clientY};
    releaseIntentRef.current = null;
    event.currentTarget.setPointerCapture(event.pointerId);
    setCancelArmed(false);
    void begin();
  };

  const onPointerMove = (event: PointerEvent<HTMLButtonElement>) => {
    const start = pointerStartRef.current;
    if (mode !== "hold" || !start || start.id !== event.pointerId) return;
    const shouldCancel = start.y - event.clientY >= 64;
    setCancelArmed(shouldCancel);
    if (shouldCancel) event.preventDefault();
  };

  const finishHold = (event: PointerEvent<HTMLButtonElement>, cancel: boolean) => {
    const start = pointerStartRef.current;
    if (!start || start.id !== event.pointerId) return;
    event.preventDefault();
    pointerStartRef.current = null;
    setCancelArmed(false);
    const intent = cancel ? "cancel" : "stop";
    if (recorder.state !== "recording") releaseIntentRef.current = intent;
    else if (intent === "cancel") void recorder.cancel();
    else void recorder.stop();
  };

  const icon = mode === "hold"
    ? recording ? <MicOff className="h-4 w-4" aria-hidden="true" /> : <Mic className="h-4 w-4" aria-hidden="true" />
    : recording ? <Square className="h-3.5 w-3.5" aria-hidden="true" /> : <Mic className="h-4 w-4" aria-hidden="true" />;
  const label = cancelArmed ? "松开取消" : recording ? mode === "hold" ? "松开结束" : "结束录音" : triggerLabel || (mode === "hold" ? "按住说话" : "语音录入");

  return <div className="inline-flex min-w-0 flex-col items-start gap-1" data-erp-component="voice-capture">
    <Button
      type="button"
      variant={recording ? "warning" : "secondary"}
      disabled={controlDisabled}
      aria-label={label}
      aria-pressed={recording}
      aria-describedby={recorder.error ? "voice-capture-error" : undefined}
      aria-keyshortcuts={mode === "toggle" ? "Alt+V" : undefined}
      data-voice-entry-trigger
      title={mode === "toggle" ? "语音录入（Alt+V）" : "按住说话，向上滑动取消"}
      className={cn(mode === "hold" && "min-h-[var(--erp-mobile-touch-size)] touch-none select-none [-webkit-touch-callout:none]", recording && "text-white", className)}
      size={compactTrigger ? "icon" : undefined}
      onClick={mode === "toggle" ? toggle : undefined}
      onContextMenu={mode === "hold" ? (event) => event.preventDefault() : undefined}
      onPointerDown={mode === "hold" ? onPointerDown : undefined}
      onPointerMove={mode === "hold" ? onPointerMove : undefined}
      onPointerUp={mode === "hold" ? (event) => finishHold(event, cancelArmed) : undefined}
      onPointerCancel={mode === "hold" ? (event) => finishHold(event, true) : undefined}
      onLostPointerCapture={mode === "hold" ? (event) => finishHold(event, cancelArmed) : undefined}
    >
      {icon}<span className={compactTrigger ? "sr-only" : undefined}>{busy ? "处理中…" : label}</span>
    </Button>
    {recording && !compactTrigger && <div role="status" aria-live="polite" className="flex items-center gap-2 text-xs text-[var(--erp-color-text-secondary)]">
      <span className="flex h-3 items-end gap-0.5" aria-label="录音音量">
        {[0.42, 0.72, 1, 0.63, 0.36].map((scale, index) => <i key={index} aria-hidden="true" className="w-1 rounded-full bg-[var(--erp-color-warning)] transition-[height]" style={{height: `${Math.max(3, recorder.level * 12 * scale)}px`}} />)}
      </span>
      <span>{clockLabel(recorder.elapsedMs)} / {clockLabel(maxSeconds * 1_000)}</span>
      {mode === "hold" && <span>{cancelArmed ? "松开取消" : "向上滑动取消"}</span>}
    </div>}
    {recording && compactTrigger && <span role="status" aria-live="polite" className="sr-only">正在录音 {clockLabel(recorder.elapsedMs)}</span>}
    {recorder.error && <p id="voice-capture-error" role="status" className="max-w-sm text-xs text-[var(--erp-color-warning)]">{recorder.error}</p>}
  </div>;
}
