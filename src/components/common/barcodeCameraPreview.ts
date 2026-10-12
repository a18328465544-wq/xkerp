/** MDN HTMLVideoElement.requestVideoFrameCallback / HTMLMediaElement.readyState:
 * a resolved play() or loadedmetadata alone is not proof of a presented frame.
 * Register before play(), wait for a frame, then stable dimensions across two
 * paints. Older browsers use HAVE_CURRENT_DATA; never reveal on a fixed delay.
 * https://developer.mozilla.org/en-US/docs/Web/API/HTMLVideoElement/requestVideoFrameCallback
 */
export interface BarcodePreviewVideo {
  readonly videoWidth: number;
  readonly videoHeight: number;
  readonly readyState: number;
  requestVideoFrameCallback?: (callback: (now: number, metadata: {width: number; height: number}) => void) => number;
  cancelVideoFrameCallback?: (id: number) => void;
}
interface PreviewWaitOptions {
  timeoutMs?: number;
  requestPaint?: (callback: FrameRequestCallback) => number;
  cancelPaint?: (id: number) => void;
}

export function waitForBarcodeCameraPreview(video: BarcodePreviewVideo, signal: AbortSignal, options: PreviewWaitOptions = {}): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) {reject(new DOMException("Scanner session closed", "AbortError")); return;}
    const requestPaint = options.requestPaint ?? requestAnimationFrame;
    const cancelPaint = options.cancelPaint ?? cancelAnimationFrame;
    let paintId: number | undefined;
    let frameId: number | undefined;
    let settled = false;
    let presented = !video.requestVideoFrameCallback;
    let dimensions = "";
    let stablePaints = 0;
    const finish = (error?: Error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal.removeEventListener("abort", abort);
      if (paintId !== undefined) cancelPaint(paintId);
      if (frameId !== undefined) video.cancelVideoFrameCallback?.(frameId);
      if (error) reject(error); else resolve();
    };
    const abort = () => finish(new DOMException("Scanner session closed", "AbortError"));
    const timer = setTimeout(() => finish(new Error("相机画面暂时无法显示，请重试，或从图片识别。")), options.timeoutMs ?? 8000);
    signal.addEventListener("abort", abort, {once: true});
    const check = () => {
      paintId = undefined;
      if (settled) return;
      const hasFrame = video.readyState >= 2 && video.videoWidth > 0 && video.videoHeight > 0;
      const current = `${video.videoWidth}x${video.videoHeight}`;
      if (presented && hasFrame) {
        stablePaints = current === dimensions ? stablePaints + 1 : 1;
        dimensions = current;
        if (stablePaints >= 2) {finish(); return;}
      } else {stablePaints = 0; dimensions = "";}
      paintId = requestPaint(check);
    };
    const onFrame = (_now: number, metadata: {width: number; height: number}) => {
      frameId = undefined;
      if (settled) return;
      if (metadata.width > 0 && metadata.height > 0) presented = true;
      else frameId = video.requestVideoFrameCallback?.(onFrame);
    };
    try {
      if (video.requestVideoFrameCallback) frameId = video.requestVideoFrameCallback(onFrame);
      paintId = requestPaint(check);
    } catch (error) {finish(error instanceof Error ? error : new Error("相机画面暂时无法显示，请重试。"));}
  });
}
