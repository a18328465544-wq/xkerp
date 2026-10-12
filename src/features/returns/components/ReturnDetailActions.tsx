import {CheckCircle2} from "lucide-react";
import {Button} from "@/src/components/ui";
import {ErpDocumentActions, type ErpRecordPageAction} from "@/src/components/common";
import type {SalesReturnListItem} from "@/src/types/returns";

/** Shared presentation only: permissions and financial commands stay with the page. */
export function ReturnDetailActions({item, canDelete, canEdit, onVoid, onReverse, onEdit, onComplete, completeLabel}: {
  item: SalesReturnListItem;
  canDelete: boolean;
  canEdit: boolean;
  onVoid: (item: SalesReturnListItem) => void;
  onReverse: (item: SalesReturnListItem) => void;
  onEdit: (item: SalesReturnListItem) => void;
  onComplete: (item: SalesReturnListItem) => void;
  completeLabel: string;
}) {
  const actions: ErpRecordPageAction[] = [
    ...(item.status === "待处理" ? [{key: "complete", label: completeLabel, onClick: () => onComplete(item), phone: "primary" as const}] : []),
    ...(canEdit && item.status !== "已作废" ? [{key: "edit", label: "编辑资料", onClick: () => onEdit(item), phone: item.status === "待处理" ? "more" as const : "primary" as const}] : []),
    ...(canDelete && item.status === "待处理" ? [{key: "void", label: "作废退货单", variant: "danger" as const, onClick: () => onVoid(item), phone: "more" as const}] : []),
    ...(canDelete && item.status === "已完成" ? [{key: "reverse", label: "冲销退货单", variant: "danger" as const, onClick: () => onReverse(item), phone: "more" as const}] : []),
  ];
  return <ErpDocumentActions title="退货单操作" actions={actions} desktopContent={<div data-erp-component="return-detail-actions" className="erp-form-actions flex flex-wrap justify-end gap-2">
    {canDelete && item.status === "待处理" && <Button type="button" size="sm" variant="danger" onClick={() => onVoid(item)}>作废退货单</Button>}
    {canDelete && item.status === "已完成" && <Button type="button" size="sm" variant="danger" onClick={() => onReverse(item)}>冲销退货单</Button>}
    {canEdit && item.status !== "已作废" && <Button type="button" size="sm" variant="secondary" onClick={() => onEdit(item)}>编辑资料</Button>}
    {item.status === "待处理" && <Button type="button" size="sm" className="col-span-2 md:col-span-1" variant="primary" onClick={() => onComplete(item)}><CheckCircle2 className="h-4 w-4" />{completeLabel}</Button>}
  </div>} />;
}
