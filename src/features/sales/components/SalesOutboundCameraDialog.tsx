import {useEffect, useRef, useState} from "react";
import {Camera, RefreshCw} from "lucide-react";
import {Button, Dialog} from "@/src/components/ui";

interface DetectedBarcode { rawValue?: string }
interface BarcodeDetectorInstance { detect(source: HTMLVideoElement): Promise<DetectedBarcode[]> }
interface BarcodeDetectorConstructor { new(options?: {formats?: string[]}): BarcodeDetectorInstance }

export function SalesOutboundCameraDialog({open, onOpenChange, onDetected}: {open: boolean; onOpenChange: (open: boolean) => void; onDetected: (code: string) => void}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState("");
  const [starting, setStarting] = useState(false);

  useEffect(() => {
    if (!open) return;
    let active = true;
    let stream: MediaStream | undefined;
    let animationFrame = 0;
    const start = async () => {
      setStarting(true);
      setError("");
      try {
        const detectorConstructor = (globalThis as unknown as {BarcodeDetector?: BarcodeDetectorConstructor}).BarcodeDetector;
        if (!detectorConstructor) throw new Error("当前浏览器不支持摄像头条码识别，请使用扫码枪或粘贴 SN。");
        if (!navigator.mediaDevices?.getUserMedia) throw new Error("当前环境无法访问摄像头，请确认使用 HTTPS 或本机地址。");
        stream = await navigator.mediaDevices.getUserMedia({video: {facingMode: {ideal: "environment"}}, audio: false});
        if (!active || !videoRef.current) return;
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
        const detector = new detectorConstructor({formats: ["qr_code", "code_128", "code_39", "ean_13", "data_matrix"]});
        const scan = async () => {
          if (!active || !videoRef.current) return;
          try {
            const result = await detector.detect(videoRef.current);
            const value = result.find((item) => item.rawValue?.trim())?.rawValue?.trim();
            if (value) {
              onDetected(value);
              onOpenChange(false);
              return;
            }
          } catch {
            // A frame can fail while the camera is focusing; keep scanning.
          }
          animationFrame = requestAnimationFrame(() => {void scan();});
        };
        animationFrame = requestAnimationFrame(() => {void scan();});
      } catch (caught) {
        setError(caught instanceof Error ? caught.message : "摄像头启动失败");
      } finally {
        if (active) setStarting(false);
      }
    };
    void start();
    return () => {
      active = false;
      cancelAnimationFrame(animationFrame);
      stream?.getTracks().forEach((track) => track.stop());
      if (videoRef.current) videoRef.current.srcObject = null;
    };
  }, [onDetected, onOpenChange, open]);

  return <Dialog.Root open={open} onOpenChange={onOpenChange}>
    <Dialog.Portal>
      <Dialog.Backdrop className="fixed inset-0 erp-modal-layer bg-[var(--erp-color-backdrop)] backdrop-blur-sm" />
      <Dialog.Viewport className="fixed inset-0 erp-modal-layer flex items-center justify-center p-4">
        <Dialog.Popup className="w-full max-w-xl rounded-[var(--erp-radius-xl)] border border-[var(--erp-color-border)] bg-[var(--erp-color-surface)] shadow-[var(--erp-shadow-popover)]">
          <div className="flex items-start justify-between gap-4 border-b border-[var(--erp-color-border)] px-5 py-4"><div><Dialog.Title className="flex items-center gap-2 text-base font-bold"><Camera className="h-4 w-4 text-[var(--erp-color-primary)]" />摄像头扫码</Dialog.Title><Dialog.Description className="mt-1 text-xs text-[var(--erp-color-text-secondary)]">识别库存 ID、SN、条形码或二维码；识别成功后自动加入当前核验。</Dialog.Description></div><Dialog.Close render={<Button type="button" size="icon" variant="ghost" aria-label="关闭">×</Button>} /></div>
          <div className="p-5"><div className="relative aspect-video overflow-hidden rounded-[var(--erp-radius-lg)] bg-black"><video ref={videoRef} muted playsInline className="h-full w-full object-cover" />{starting && <div className="absolute inset-0 flex items-center justify-center text-sm text-white"><RefreshCw className="mr-2 h-4 w-4 animate-spin" />正在启动摄像头</div>}</div>{error && <p role="alert" className="mt-3 rounded-[var(--erp-radius-md)] bg-[var(--erp-color-warning-soft)] p-3 text-xs text-[var(--erp-color-warning)]">{error}</p>}<div className="mt-4 flex justify-end"><Button type="button" variant="secondary" onClick={() => onOpenChange(false)}>关闭</Button></div></div>
        </Dialog.Popup>
      </Dialog.Viewport>
    </Dialog.Portal>
  </Dialog.Root>;
}
