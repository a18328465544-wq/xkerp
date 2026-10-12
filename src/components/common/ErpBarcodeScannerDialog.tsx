import {useErpPhone} from "@/src/hooks/useErpViewport";
import {ErpSearchInput} from "./ErpSearchInput";
import {useEffect, useId, useRef, useState} from "react";
import {Camera, ImageUp, RefreshCw, SwitchCamera} from "lucide-react";
import {Button} from "@/src/components/ui";
import {useWorkspaceTabActivity} from "@/src/hooks/useWorkspaceTabRuntime";
import {ErpDialogShell} from "./ErpDialogShell";
import {deliverActiveBarcode} from "./barcodeScannerSession";
import {barcodeScannerErrorMessage} from "./barcodeScannerError";
import {createBarcodeDecoder, type BarcodeDecoder, type NativeBarcodeDetector} from "./barcodeDecoder";
import {createBarcodeFrameReader, readBarcodeImage} from "./barcodeScannerFrames";
import {barcodeRearCameras, cameraSettings, createBarcodeCameraZoom, enableBarcodeAutofocus, openBarcodeCamera, rememberBarcodeRearCamera} from "./barcodeCamera";
import {ErpSegmentedControl} from "./ErpSegmentedControl";
import {waitForBarcodeCameraPreview} from "./barcodeCameraPreview";

export const DEFAULT_BARCODE_FORMATS = ["qr_code", "code_128", "code_39", "code_93", "ean_13", "ean_8", "data_matrix"] as const;

export interface ErpBarcodeScannerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDetected: (code: string) => void;
  title?: string;
  description?: string;
  formats?: readonly string[];
  /** Fallback guidance for environments without either decoding engine. */
  unsupportedMessage?: string;
}

export function ErpBarcodeScannerDialog({open, onOpenChange, onDetected, title = "摄像头扫码", description = "识别条形码或二维码，识别成功后回填当前字段。", formats = DEFAULT_BARCODE_FORMATS, unsupportedMessage = "当前浏览器不支持摄像头条码识别，请使用扫码枪或手动输入 SN。"}: ErpBarcodeScannerDialogProps) {
  const phone = useErpPhone();
  const manualId = useId();
  const [manualCode, setManualCode] = useState("");
  useEffect(() => {if (open) setManualCode("");}, [open]);
  const {active: tabActive} = useWorkspaceTabActivity();
  const cameraEnabled = open && tabActive;
  const cameraEnabledRef = useRef(cameraEnabled);
  cameraEnabledRef.current = cameraEnabled;
  const videoRef = useRef<HTMLVideoElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const photoScanRef = useRef<((file: File) => Promise<void>) | undefined>(undefined);
  const deliverCodeRef = useRef<((code: string) => void) | undefined>(undefined);
  const [error, setError] = useState("");
  const [starting, setStarting] = useState(false);
  const [decoderPreparing, setDecoderPreparing] = useState(false);
  const [photoPending, setPhotoPending] = useState(false);
  const [photoError, setPhotoError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [cameraDeviceId, setCameraDeviceId] = useState<string>();
  const [cameras, setCameras] = useState<Array<{deviceId: string; label: string}>>([]);
  const [currentCamera, setCurrentCamera] = useState<string>();
  const [magnification, setMagnification] = useState(1);
  const [softwareZoom, setSoftwareZoom] = useState(1);
  const [cameraReady, setCameraReady] = useState(false);
  const [zoomPending, setZoomPending] = useState(false);
  const zoomActionRef = useRef<((zoom: number) => Promise<void>) | undefined>(undefined);
  // Keep the camera session tied to the visible, active Tab, not callback identity. Some
  // feature forms intentionally provide inline handlers and should not cause
  // an active camera stream to restart on every form render. Keep the opening
  // intent in the parent so returning to a kept-alive Tab starts a fresh stream.
  const callbacksRef = useRef({onDetected, onOpenChange});
  callbacksRef.current = {onDetected, onOpenChange};
  const scannerConfigRef = useRef({formats, unsupportedMessage});
  scannerConfigRef.current = {formats, unsupportedMessage};

  useEffect(() => {
    if (!cameraEnabled) {setCameraReady(false); return;}
    let active = true;
    const controller = new AbortController();
    let stream: MediaStream | undefined;
    let decoder: BarcodeDecoder | undefined;
    let sessionVideo: HTMLVideoElement | null = null;
    let animationFrame = 0;
    let nextFrameAt = 0;
    let photoInFlight = false;
    let zoomInFlight = false;
    let cropZoom = 1;
    let frameIndex = 0;
    let settleUntil = 0;
    let readZoomFrame: ReturnType<typeof createBarcodeFrameReader> | undefined;
    const isActive = () => active && !controller.signal.aborted && cameraEnabledRef.current;
    const releaseCamera = () => {
      const ownedStream = stream;
      stream = undefined;
      ownedStream?.getTracks().forEach((track) => track.stop());
      if (ownedStream && sessionVideo?.srcObject === ownedStream) sessionVideo.srcObject = null;
    };
    const deliverCode = (value: string) => {
      if (!isActive()) return;
      active = false;
      cameraEnabledRef.current = false;
      controller.abort();
      releaseCamera();
      callbacksRef.current.onDetected(value);
      callbacksRef.current.onOpenChange(false);
    };
    deliverCodeRef.current = deliverCode;
    setStarting(true);
    setDecoderPreparing(false);
    setError("");
    setPhotoError("");
    setPhotoPending(false);
    setCameraReady(false);
    setZoomPending(false);
    setMagnification(1);
    setSoftwareZoom(1);
    setCameras([]);
    setCurrentCamera(undefined);
    const zoomAction = async (zoom: number) => {
      if (!isActive() || zoomInFlight || !stream) return;
      const track = stream.getVideoTracks()[0];
      if (!track) return;
      zoomInFlight = true;
      setZoomPending(true);
      try {
        const result = await zoomController?.(zoom);
        if (result && isActive()) {
          cropZoom = result.softwareZoom;
          setSoftwareZoom(result.softwareZoom);
          setMagnification(result.magnification);
          // Give autofocus a brief settling window after changing magnification.
          settleUntil = performance.now() + 250;
        }
      } finally {zoomInFlight = false; if (isActive()) setZoomPending(false);}
    };
    let zoomController: ReturnType<typeof createBarcodeCameraZoom> | undefined;
    zoomActionRef.current = zoomAction;
    const Detector = (globalThis as unknown as {BarcodeDetector?: NativeBarcodeDetector}).BarcodeDetector;
    const decoderReady = createBarcodeDecoder(scannerConfigRef.current.formats, {
      native: Detector,
      signal: controller.signal,
      unsupportedMessage: scannerConfigRef.current.unsupportedMessage,
      onPreparing: (preparing) => {if (isActive()) setDecoderPreparing(preparing);},
    });
    const scanPhoto = async (file: File) => {
      if (!isActive() || photoInFlight) return;
      photoInFlight = true;
      setPhotoPending(true);
      setPhotoError("");
      try {
        const image = await readBarcodeImage(file, controller.signal);
        const imageDecoder = await decoderReady;
        if (!isActive()) return;
        const delivered = await deliverActiveBarcode(image, (source) => imageDecoder.detect(source), isActive, deliverCode);
        if (!delivered && isActive()) setPhotoError("图片中没有识别到条码，请拍清条码并保留两侧白边，或手动输入 SN。");
      } catch (caught) {
        if (isActive()) setPhotoError(barcodeScannerErrorMessage(caught));
      } finally {
        photoInFlight = false;
        if (isActive()) setPhotoPending(false);
      }
    };
    photoScanRef.current = scanPhoto;
    const start = async () => {
      try {
        decoder = await decoderReady;
        if (!isActive()) {decoder.dispose(); return;}
        if (!navigator.mediaDevices?.getUserMedia) throw new Error("当前环境无法访问摄像头，请确认使用 HTTPS 或本机地址。");
        const acquiredStream = await openBarcodeCamera(navigator.mediaDevices, cameraDeviceId, isActive);
        if (!isActive() || !videoRef.current) {
          acquiredStream.getTracks().forEach((track) => track.stop());
          return;
        }
        stream = acquiredStream;
        const video = videoRef.current;
        sessionVideo = video;
        const track = stream.getVideoTracks()[0];
        // Start optional autofocus while the preparation cover is still up,
        // not after exposing the initial camera frame. It must not block play.
        if (track) void enableBarcodeAutofocus(track);
        video.srcObject = stream;
        // Install before play so a fast first frame cannot race the readiness
        // listener. The preparation cover stays opaque until geometry settles.
        const previewController = new AbortController();
        const cancelPreview = () => previewController.abort();
        controller.signal.addEventListener("abort", cancelPreview, {once: true});
        try {await Promise.all([waitForBarcodeCameraPreview(video, previewController.signal), video.play()]);}
        finally {controller.signal.removeEventListener("abort", cancelPreview); previewController.abort();}
        if (!isActive() || videoRef.current !== video) return;
        if (track) {
          const actualId = cameraSettings(track).deviceId;
          setCurrentCamera(actualId);
          zoomController = createBarcodeCameraZoom(track, isActive);
          if (navigator.mediaDevices.enumerateDevices) void navigator.mediaDevices.enumerateDevices().then((devices) => {
            if (isActive()) setCameras(barcodeRearCameras(devices, actualId));
          }).catch(() => {});
        }
        setCameraReady(Boolean(track));
        const scan = async (timestamp: number) => {
          if (!isActive() || videoRef.current !== video) return;
          if (photoInFlight || zoomInFlight || timestamp < nextFrameAt || timestamp < settleUntil) {
            animationFrame = requestAnimationFrame((time) => {void scan(time);});
            return;
          }
          nextFrameAt = timestamp + 125;
          try {
            // Digital zoom feeds the matching central ROI to both native/WASM
            // engines. Every fourth frame still searches the whole source,
            // retaining edge quiet zones and QR codes outside the aiming aid.
            const useCrop = cropZoom > 1 && ++frameIndex % 4 !== 0;
            if (useCrop) readZoomFrame ??= createBarcodeFrameReader();
            const source = useCrop ? readZoomFrame!(video, cropZoom) : video;
            const delivered = source && await deliverActiveBarcode(source, (frame) => decoder!.detect(frame), () => isActive() && !photoInFlight && !zoomInFlight && videoRef.current === video, deliverCode);
            if (delivered) return;
          } catch (caught) {
            if (isActive()) {releaseCamera(); setError(barcodeScannerErrorMessage(caught));}
            return;
          }
          if (isActive()) animationFrame = requestAnimationFrame((time) => {void scan(time);});
        };
        animationFrame = requestAnimationFrame((time) => {void scan(time);});
      } catch (caught) {
        releaseCamera();
        if (isActive()) {setError(barcodeScannerErrorMessage(caught)); setCameraReady(false);}
      } finally {
        if (isActive()) setStarting(false);
      }
    };
    void start();
    return () => {
      active = false;
      controller.abort();
      cancelAnimationFrame(animationFrame);
      decoder?.dispose();
      releaseCamera();
      setCameraReady(false);
      if (photoScanRef.current === scanPhoto) photoScanRef.current = undefined;
      if (deliverCodeRef.current === deliverCode) deliverCodeRef.current = undefined;
      if (zoomActionRef.current === zoomAction) zoomActionRef.current = undefined;
    };
  }, [cameraEnabled, attempt, cameraDeviceId]);

  return <ErpDialogShell
    open={open}
    onOpenChange={onOpenChange}
    title={<span className="flex items-center gap-2"><Camera className="h-4 w-4 text-[var(--erp-color-primary)]" />{title}</span>}
    description={description}
    size="md"
    mobilePresentation="dialog"
    className="erp-barcode-scanner-dialog"
  >
    <div data-erp-component="barcode-scanner-camera" data-preview-ready={cameraEnabled && cameraReady && !error} className="erp-barcode-camera" aria-busy={!cameraReady || decoderPreparing}>
      <video ref={videoRef} muted playsInline className="erp-barcode-video" style={{transform: `scale(${softwareZoom})`}} aria-label="扫码相机预览" />
      {/* Aiming aid only. Default and periodic zoom fallback read full frames;
          explicit digital magnification also reads a matching central ROI. */}
      {!error && <div data-erp-region="barcode-guide" className="erp-barcode-guide" aria-hidden="true">
        <span /><span /><span /><span />
      </div>}
      {(starting || !cameraReady) && !error && <div role="status" className="erp-barcode-camera-status"><RefreshCw className="h-4 w-4 animate-spin" />正在准备扫码</div>}
      {cameraReady && decoderPreparing && <span role="status" className="sr-only">正在准备条码识别</span>}
      {error && !starting && <div aria-hidden="true" className="erp-barcode-camera-status"><Camera className="h-5 w-5" /><span>摄像头暂不可用</span></div>}
    </div>
    <p className="mt-2 text-center text-xs text-[var(--erp-color-text-secondary)]">模糊时请稍微拿远，再放大。将条形码横向放入框内，保留两侧白边</p>
    <div className="mt-3" data-erp-region="barcode-camera-controls"><ErpSegmentedControl label="扫码放大倍数" value={String(magnification)} options={[{value: "1", label: "1×"}, {value: "1.5", label: "1.5×"}, {value: "2", label: "2×"}]} disabled={!cameraReady || Boolean(error) || starting || decoderPreparing || photoPending || zoomPending} onValueChange={(value) => {void zoomActionRef.current?.(Number(value));}} /></div>
    <input ref={imageInputRef} type="file" accept="image/jpeg,image/png,image/webp,image/bmp" className="hidden" aria-label="选择条码图片" onChange={(event) => {const file = event.target.files?.[0]; event.target.value = ""; if (file) void photoScanRef.current?.(file);}} />
    <div className="mt-3 flex flex-wrap gap-2"><Button type="button" variant="secondary" disabled={photoPending || zoomPending} onClick={() => imageInputRef.current?.click()}><ImageUp className="h-4 w-4" />{photoPending ? "正在识别图片…" : "从图片识别"}</Button>{error ? <Button type="button" variant="secondary" disabled={starting || photoPending} onClick={() => setAttempt((current) => current + 1)}><RefreshCw className="h-4 w-4" />重试扫码</Button> : <Button type="button" variant="secondary" data-erp-region="barcode-camera-switch" className={cameras.length > 1 ? undefined : "invisible"} aria-hidden={cameras.length < 2 ? true : undefined} tabIndex={cameras.length > 1 ? undefined : -1} disabled={!cameraReady || starting || photoPending || zoomPending || cameras.length < 2} onClick={() => {
      const next = cameras[(cameras.findIndex((camera) => camera.deviceId === currentCamera) + 1) % cameras.length];
      if (!next) return;
      rememberBarcodeRearCamera(next.deviceId);
      setCameraDeviceId(next.deviceId);
      setAttempt((value) => value + 1);
    }}><SwitchCamera className="h-4 w-4" />切换镜头</Button>}</div>
    {phone && <div className="mt-4 space-y-2"><label className="block text-xs font-medium" htmlFor={manualId}>手动输入 SN / 编号</label><div className="flex gap-2"><ErpSearchInput id={manualId} value={manualCode} onChange={(event) => setManualCode(event.target.value)} aria-label="扫码备用输入" placeholder="输入或粘贴序列号" className="min-w-0 flex-1" /><Button type="button" variant="primary" disabled={!manualCode.trim()} onClick={() => deliverCodeRef.current?.(manualCode.trim())}>使用</Button></div></div>}
    {photoError && <p role="alert" className="mt-3 rounded-[var(--erp-radius-md)] bg-[var(--erp-color-warning-soft)] p-3 text-xs text-[var(--erp-color-warning)]">{photoError}</p>}
    {error && <p role="alert" className="mt-3 rounded-[var(--erp-radius-md)] bg-[var(--erp-color-warning-soft)] p-3 text-xs text-[var(--erp-color-warning)]">{error}</p>}
  </ErpDialogShell>;
}
