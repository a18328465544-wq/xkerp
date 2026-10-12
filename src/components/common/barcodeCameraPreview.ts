/** MDN HTMLVideoElement.requestVideoFrameCallback / HTMLMediaElement.readyState:
 * a resolved play() or loadedmetadata alone is not proof of a presented frame.
 * Re-register for actual video frames (not just browser paints). Require four
 * frames with unchanged geometry spanning at least 300ms, then two paints.
 * Older browsers observe playback progress as well as HAVE_CURRENT_DATA.
 * This checks startup geometry, not physical autofocus/image sharpness.
 * https://developer.mozilla.org/en-US/docs/Web/API/HTMLVideoElement/requestVideoFrameCallback
 */
export interface BarcodePreviewVideo {
  readonly videoWidth: number;
  readonly videoHeight: number;
  readonly readyState: number;
  readonly currentTime: number;
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
    let dimensions = "";
    let frameDimensions = "";
    let stableFrames = 0;
    let stableSince = 0;
    let lastFrameAt = 0;
    let lastMediaTime = -1;
    let framesStable = false;
    let stablePaints = 0;
    const reset = () => {stableFrames = 0; framesStable = false; stablePaints = 0; frameDimensions = "";};
    const observeFrame = (now: number, current: string) => {
      // A stalled source or a late orientation/size change starts a new window.
      if (current !== frameDimensions || now - lastFrameAt > 500) {
        reset(); frameDimensions = current; stableSince = now;
      }
      stableFrames++;
      lastFrameAt = now;
      framesStable = stableFrames >= 4 && now - stableSince >= 300;
    };
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
    const check = (now: number) => {
      paintId = undefined;
      if (settled) return;
      const hasFrame = video.readyState >= 2 && video.videoWidth > 0 && video.videoHeight > 0;
      const current = `${video.videoWidth}x${video.videoHeight}`;
      if (!hasFrame || current !== dimensions) {reset(); dimensions = hasFrame ? current : "";}
      if (hasFrame && !video.requestVideoFrameCallback && video.currentTime > lastMediaTime) {
        lastMediaTime = video.currentTime;
        observeFrame(now, current);
      }
      if (framesStable && now - lastFrameAt <= 500 && hasFrame) {
        stablePaints++;
        if (stablePaints >= 2) {finish(); return;}
      } else stablePaints = 0;
      paintId = requestPaint(check);
    };
    const onFrame = (now: number, metadata: {width: number; height: number}) => {
      frameId = undefined;
      if (settled) return;
      if (video.readyState >= 2 && video.videoWidth > 0 && video.videoHeight > 0 && metadata.width > 0 && metadata.height > 0) {
        const current = `${video.videoWidth}x${video.videoHeight}`;
        if (current !== dimensions) {reset(); dimensions = current;}
        // Metadata is included separately: media pixel dimensions may legitimately
        // differ from display dimensions; do not require equality (MDN).
        observeFrame(now, `${current}/${metadata.width}x${metadata.height}`);
      } else reset();
      frameId = video.requestVideoFrameCallback?.(onFrame);
    };
    try {
      if (video.requestVideoFrameCallback) frameId = video.requestVideoFrameCallback(onFrame);
      paintId = requestPaint(check);
    } catch (error) {finish(error instanceof Error ? error : new Error("相机画面暂时无法显示，请重试。"));}
  });
}
