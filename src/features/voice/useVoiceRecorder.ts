import {useCallback, useEffect, useRef, useState} from "react";
import {encodeCapturedWav} from "./voiceAudio";

export type VoiceRecorderState = "idle" | "starting" | "recording" | "stopping";
export type VoiceRecorderStartResult = {ok: true} | {ok: false; reason: string};

interface VoiceRecorderOptions {
  maxSeconds: number;
  onComplete?: (audio: Blob) => void | Promise<void>;
}

interface RecordingSession {
  context: AudioContext;
  stream: MediaStream;
  source: MediaStreamAudioSourceNode;
  node: AudioWorkletNode;
  chunks: Float32Array[];
  startedAt: number;
  timer: number;
  lastLevelAt: number;
}

export interface VoiceRecorderSupport {
  secureContext: boolean;
  getUserMedia: boolean;
  audioContext: boolean;
  audioWorkletNode: boolean;
}

export function voiceRecorderUnavailableReason(support: VoiceRecorderSupport) {
  if (!support.secureContext) return "麦克风需要在 HTTPS 安全页面中使用，请改用文字输入。";
  if (!support.getUserMedia) return "当前浏览器不支持麦克风，请使用输入框或手机键盘语音输入。";
  if (!support.audioContext || !support.audioWorkletNode) return "当前浏览器不支持 PCM 录音，请使用输入框或手机键盘语音输入。";
  return null;
}

function availabilityReason() {
  if (typeof window === "undefined") return "当前环境不能访问麦克风，请直接输入文字。";
  const secureContext = window.isSecureContext;
  const getUserMedia = Boolean(navigator.mediaDevices?.getUserMedia);
  const contextWindow = window as Window & {webkitAudioContext?: typeof AudioContext};
  const Context = window.AudioContext || contextWindow.webkitAudioContext;
  return voiceRecorderUnavailableReason({secureContext, getUserMedia, audioContext: Boolean(Context), audioWorkletNode: typeof AudioWorkletNode !== "undefined"});
}

function describeRecorderError(error: unknown) {
  if (error instanceof DOMException && ["NotAllowedError", "SecurityError"].includes(error.name)) {
    return "麦克风权限被拒绝，请在浏览器设置中允许麦克风，或改用文字输入。";
  }
  if (error instanceof DOMException && error.name === "NotFoundError") return "没有找到可用麦克风，请检查设备或改用文字输入。";
  return "暂时无法启动麦克风，请改用文字输入。";
}

function stopTracks(stream: MediaStream | null) {
  for (const track of stream?.getTracks() || []) track.stop();
}

function closeContext(context: AudioContext | null) {
  if (!context || context.state === "closed") return;
  void context.close().catch(() => undefined);
}

async function flushWorklet(node: AudioWorkletNode) {
  await new Promise<void>((resolve) => {
    const timeout = window.setTimeout(() => {
      node.port.removeEventListener("message", onMessage);
      resolve();
    }, 50);
    const onMessage = (event: MessageEvent<unknown>) => {
      if (!event.data || typeof event.data !== "object" || (event.data as {kind?: unknown}).kind !== "flushed") return;
      window.clearTimeout(timeout);
      node.port.removeEventListener("message", onMessage);
      resolve();
    };
    node.port.addEventListener("message", onMessage);
    node.port.postMessage({kind: "flush"});
  });
}

/** Captures mono PCM through AudioWorklet and returns only an in-memory WAV Blob. */
export function useVoiceRecorder({maxSeconds, onComplete}: VoiceRecorderOptions) {
  const [state, setState] = useState<VoiceRecorderState>("idle");
  const [level, setLevel] = useState(0);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const sessionRef = useRef<RecordingSession | null>(null);
  const stateRef = useRef<VoiceRecorderState>("idle");
  const onCompleteRef = useRef(onComplete);
  const attemptRef = useRef(0);
  const mountedRef = useRef(true);
  const stopRef = useRef<() => Promise<Blob | null>>(async () => null);

  useEffect(() => { onCompleteRef.current = onComplete; }, [onComplete]);
  const transition = useCallback((next: VoiceRecorderState) => {
    stateRef.current = next;
    if (mountedRef.current) setState(next);
  }, []);

  const releaseSession = useCallback(async (session: RecordingSession, flush: boolean) => {
    if (flush) await flushWorklet(session.node).catch(() => undefined);
    session.node.port.onmessage = null;
    session.node.disconnect();
    session.source.disconnect();
    stopTracks(session.stream);
    closeContext(session.context);
  }, []);

  const stop = useCallback(async () => {
    const session = sessionRef.current;
    if (!session || stateRef.current !== "recording") return null;
    transition("stopping");
    sessionRef.current = null;
    window.clearInterval(session.timer);
    const sourceRate = session.context.sampleRate;
    await releaseSession(session, true);
    const duration = Math.min(maxSeconds, Math.max(0, (performance.now() - session.startedAt) / 1_000));
    const audio = encodeCapturedWav(session.chunks, sourceRate);
    transition("idle");
    if (mountedRef.current) {
      setLevel(0);
      setElapsedMs(Math.round(duration * 1_000));
    }
    if (audio.size <= 44 || duration < 0.2) {
      if (mountedRef.current) setError("录音时间太短，请再说一次或改用文字输入。");
      return null;
    }
    try {
      await onCompleteRef.current?.(audio);
    } catch {
      if (mountedRef.current) setError("语音处理失败，请改用文字输入或稍后重试。");
    }
    return audio;
  }, [maxSeconds, releaseSession, transition]);
  stopRef.current = stop;

  const cancel = useCallback(async () => {
    attemptRef.current++;
    const session = sessionRef.current;
    sessionRef.current = null;
    if (session) {
      window.clearInterval(session.timer);
      await releaseSession(session, false);
    }
    transition("idle");
    if (mountedRef.current) {
      setLevel(0);
      setElapsedMs(0);
    }
  }, [releaseSession, transition]);

  const start = useCallback(async (): Promise<VoiceRecorderStartResult> => {
    if (stateRef.current !== "idle") return {ok: false, reason: "录音仍在进行，请稍后操作。"};
    setError(null);
    setElapsedMs(0);
    const unavailable = availabilityReason();
    if (unavailable) {
      setError(unavailable);
      return {ok: false, reason: unavailable};
    }
    const contextWindow = window as Window & {webkitAudioContext?: typeof AudioContext};
    const Context = window.AudioContext || contextWindow.webkitAudioContext;
    if (!Context) {
      const reason = "当前浏览器不支持 PCM 录音，请使用输入框或手机键盘语音输入。";
      setError(reason);
      return {ok: false, reason};
    }

    const attempt = ++attemptRef.current;
    transition("starting");
    let context: AudioContext | null = null;
    let stream: MediaStream | null = null;
    try {
      // Create and resume synchronously in the pointer gesture for iOS Safari.
      context = new Context();
      const resume = context.resume();
      const media = navigator.mediaDevices.getUserMedia({audio: {channelCount: 1, echoCancellation: true, noiseSuppression: true}});
      const [resumeResult, mediaResult] = await Promise.allSettled([resume, media]);
      if (mediaResult.status === "fulfilled") stream = mediaResult.value;
      if (resumeResult.status === "rejected") throw resumeResult.reason;
      if (mediaResult.status === "rejected") throw mediaResult.reason;
      const acquiredStream = stream;
      if (!acquiredStream) throw new Error("microphone-unavailable");
      if (attempt !== attemptRef.current) {
        stopTracks(acquiredStream);
        closeContext(context);
        return {ok: false, reason: "录音已取消。"};
      }
      if (!context.audioWorklet) throw new Error("worklet-unavailable");
      await context.audioWorklet.addModule(new URL("./voice-pcm-worklet.js", import.meta.url).href);
      if (attempt !== attemptRef.current) {
        stopTracks(acquiredStream);
        closeContext(context);
        return {ok: false, reason: "录音已取消。"};
      }
      const source = context.createMediaStreamSource(acquiredStream);
      const node = new AudioWorkletNode(context, "erp-voice-pcm-capture", {numberOfInputs: 1, numberOfOutputs: 1, channelCount: 1, channelCountMode: "explicit", channelInterpretation: "speakers"});
      const session: RecordingSession = {context, stream: acquiredStream, source, node, chunks: [], startedAt: performance.now(), timer: 0, lastLevelAt: 0};
      node.port.onmessage = (event: MessageEvent<unknown>) => {
        if (!(event.data instanceof Float32Array) || sessionRef.current !== session) return;
        session.chunks.push(event.data);
        const now = performance.now();
        if (now - session.lastLevelAt < 60) return;
        session.lastLevelAt = now;
        let energy = 0;
        for (const sample of event.data) energy += sample * sample;
        if (mountedRef.current) setLevel(Math.min(1, Math.sqrt(energy / Math.max(event.data.length, 1)) * 5));
      };
      source.connect(node);
      node.connect(context.destination);
      sessionRef.current = session;
      transition("recording");
      session.timer = window.setInterval(() => {
        const elapsed = Math.max(0, performance.now() - session.startedAt);
        if (mountedRef.current) setElapsedMs(Math.min(Math.round(maxSeconds * 1_000), Math.round(elapsed)));
        if (elapsed >= maxSeconds * 1_000) void stopRef.current();
      }, 100);
      return {ok: true};
    } catch (caught) {
      stopTracks(stream);
      closeContext(context);
      if (attempt !== attemptRef.current) return {ok: false, reason: "录音已取消。"};
      const reason = caught instanceof Error && caught.message === "worklet-unavailable"
        ? "当前浏览器不支持 PCM 录音，请使用输入框或手机键盘语音输入。"
        : describeRecorderError(caught);
      setError(reason);
      transition("idle");
      return {ok: false, reason};
    }
  }, [maxSeconds, transition]);

  const clearError = useCallback(() => setError(null), []);

  useEffect(() => {
    mountedRef.current = true;
    const cancelWhenHidden = () => {
      if (document.visibilityState === "hidden") void cancel();
    };
    window.addEventListener("pagehide", cancel);
    document.addEventListener("visibilitychange", cancelWhenHidden);
    return () => {
      mountedRef.current = false;
      window.removeEventListener("pagehide", cancel);
      document.removeEventListener("visibilitychange", cancelWhenHidden);
      void cancel();
    };
  }, [cancel]);

  return {state, level, elapsedMs, error, start, stop, cancel, clearError};
}
