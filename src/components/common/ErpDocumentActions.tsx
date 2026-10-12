import {useState, type ReactNode} from "react";
import {Link} from "@tanstack/react-router";
import {Button} from "@/src/components/ui";
import {useErpPhone} from "@/src/hooks/useErpViewport";
import {ErpDialogShell} from "./ErpDialogShell";
import {resolveRecordPageActions, type ErpRecordPageAction} from "./page-templates/ErpRecordPage";

/** Presentation only: visibility, commands and confirmation remain feature-owned. */
export function ErpDocumentActions({title = "单据操作", actions, desktopContent, phone: phoneProp}: {
  title?: string;
  actions: readonly ErpRecordPageAction[];
  desktopContent: ReactNode;
  phone?: boolean;
}) {
  const phoneFromHook = useErpPhone();
  const [moreOpen, setMoreOpen] = useState(false);
  if (!(phoneProp ?? phoneFromHook)) return <>{desktopContent}</>;
  const {primary, more} = resolveRecordPageActions(actions);
  if (!primary && more.length === 0) return null;
  return <div className="erp-document-actions">
    {more.length > 0 && <Button type="button" variant="secondary" onClick={() => setMoreOpen(true)}>更多</Button>}
    {primary && (primary.to ? <Link className="erp-phone-detail-action-link" to={primary.to}>{primary.phoneLabel ?? primary.label}</Link> : <Button type="button" variant="primary" disabled={primary.disabled} onClick={primary.onClick}>{primary.phoneLabel ?? primary.label}</Button>)}
    <ErpDialogShell title={title} open={moreOpen} onOpenChange={setMoreOpen} mobilePresentation="sheet">
      <div className="grid gap-2">{more.map((action) => action.to ? <Link key={action.key} className="erp-phone-detail-action-link" to={action.to} onClick={() => setMoreOpen(false)}>{action.phoneLabel ?? action.label}</Link> : <Button key={action.key} type="button" variant={action.variant ?? "secondary"} disabled={action.disabled} onClick={() => {setMoreOpen(false); action.onClick?.();}}>{action.phoneLabel ?? action.label}</Button>)}</div>
    </ErpDialogShell>
  </div>;
}
