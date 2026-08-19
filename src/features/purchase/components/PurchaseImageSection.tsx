import {X} from "lucide-react";
import {useEffect, useMemo, useState} from "react";
import type {UseFormSetValue} from "react-hook-form";
import {Button, Dialog} from "@/src/components/ui";
import {ErpFormSection, ErpUploader} from "@/src/components/common";
import {IMAGE_ACCEPTED_MIME_TYPES, IMAGE_MAX_COUNT} from "@/src/lib/media/image-compression";
import type {PurchaseFormValues} from "@/src/types/purchase";
import {usePurchaseMediaUpload, type PurchaseMediaStateChange} from "../hooks/usePurchaseMediaUpload";

interface PurchaseImageSectionProps {
  setValue: UseFormSetValue<PurchaseFormValues>;
  disabled?: boolean;
  canUpload?: boolean;
  embedded?: boolean;
  onStateChange?: (state: PurchaseMediaStateChange) => void;
  onReady?: (clear: () => void) => void;
}

export function PurchaseImageSection({setValue, disabled = false, canUpload = true, embedded = false, onStateChange, onReady}: PurchaseImageSectionProps) {
  const upload = usePurchaseMediaUpload({setValue, disabled: disabled || !canUpload, onStateChange});
  const [previewId, setPreviewId] = useState<string | null>(null);
  const previewItem = upload.items.find((item) => item.id === previewId);
  const accept = useMemo(() => IMAGE_ACCEPTED_MIME_TYPES.join(","), []);

  useEffect(() => {
    onReady?.(upload.clear);
  }, [onReady, upload.clear]);

  const content = <>
      {!canUpload && <p role="alert" className="mb-3 rounded-[var(--erp-radius-md)] bg-[var(--erp-color-warning-soft)] px-3 py-2 text-xs text-[var(--erp-color-warning)]">当前账号没有采购图片上传权限。</p>}
      <ErpUploader
        items={upload.items.map((item) => ({id: item.id, name: item.name, previewUrl: item.previewUrl, status: item.status, error: item.error, sizeBytes: item.sizeBytes, compressedBytes: item.compressedBytes}))}
        maxCount={IMAGE_MAX_COUNT}
        accept={accept}
        disabled={disabled || !canUpload}
        error={upload.error}
        description="支持 JPG、PNG、WEBP，单张原图最大 12MB，最多 6 张。"
        onFilesSelected={upload.addFiles}
        onRetry={upload.retry}
        onRemove={upload.remove}
        onPreview={(item) => setPreviewId(item.id)}
      />
      {upload.blocking && <p role="status" className="mt-3 text-xs text-[var(--erp-color-warning)]">仍有图片正在上传或上传失败，请完成处理后再提交采购单。</p>}
    </>;

  return <>
    {embedded ? content : <ErpFormSection title="采购凭证与商品图片" description="可上传外观、包装、快递或回收凭证；图片会先压缩并上传，采购表单只保存媒体 URL。">{content}</ErpFormSection>}

    <Dialog.Root open={Boolean(previewItem)} onOpenChange={(open) => {if (!open) setPreviewId(null);}}>
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 erp-modal-layer bg-[var(--erp-color-backdrop)] backdrop-blur-sm" />
        <Dialog.Viewport className="fixed inset-0 erp-modal-layer flex items-center justify-center p-4">
          <Dialog.Popup className="relative flex max-h-[90vh] w-full max-w-4xl flex-col overflow-hidden rounded-[var(--erp-radius-xl)] border border-[var(--erp-color-border)] bg-[var(--erp-color-surface)] shadow-[var(--erp-shadow-popover)]">
            <div className="flex items-center justify-between gap-3 border-b border-[var(--erp-color-border)] px-5 py-3"><Dialog.Title className="truncate text-sm font-bold">{previewItem?.name || "图片预览"}</Dialog.Title><Dialog.Close render={<Button type="button" size="icon" variant="ghost" aria-label="关闭预览"><X className="h-4 w-4" /></Button>} /></div>
            <div className="flex min-h-72 items-center justify-center bg-[var(--erp-color-surface-muted)] p-5"><img src={previewItem?.previewUrl} alt={previewItem?.name || "采购图片"} className="max-h-[75vh] max-w-full object-contain" /></div>
          </Dialog.Popup>
        </Dialog.Viewport>
      </Dialog.Portal>
    </Dialog.Root>
  </>;
}
