import {useState, type ReactNode} from "react";
import {Link} from "@tanstack/react-router";
import {ArrowLeft, LockKeyhole} from "lucide-react";
import {Button, Card} from "@/src/components/ui";
import {useErpPhone} from "@/src/hooks/useErpViewport";
import {usePhoneBackAction} from "@/src/hooks/usePhoneBack";
import {cn} from "@/src/lib/cn";
import {ErpDialogShell} from "../ErpDialogShell";
import {ErpPageContent} from "../ErpPageFrame";
import {ErpDetailPageFrame} from "../ErpPageFrames";
import {ErpPageHeader} from "../ErpPageHeader";
import type {QuickStatusItemData} from "../ErpQuickStatus";

export interface ErpRecordPageAction {
  key: string;
  label: ReactNode;
  /** Phone wording (bottom bar and 更多 sheet), e.g. 「收款 ¥200」 for 「待收款 ¥200」. */
  phoneLabel?: ReactNode;
  icon?: ReactNode;
  /** Navigation target; rendered as a link. */
  to?: string;
  onClick?: () => void;
  disabled?: boolean;
  /** Desktop tooltip, e.g. why a delete is blocked. */
  title?: string;
  variant?: "primary" | "secondary" | "danger";
  /**
   * Phone placement: `primary` competes for the single bottom-bar button (first
   * one wins), `more` goes into the 更多 sheet, `both` does either.
   */
  phone?: "primary" | "more" | "both";
}

export interface ErpRecordPageProps {
  title: ReactNode;
  subtitle?: ReactNode;
  /** Desktop only; phones keep the header to title and back (M16). */
  quickStatus?: QuickStatusItemData[];
  back: {to: string; label: string};
  actions: readonly ErpRecordPageAction[];
  /** Title of the phone 更多 sheet, e.g. 「销售单操作」. */
  phoneMoreTitle?: string;
  /** Shown in the phone 更多 sheet under the actions, e.g. the edit policy summary. */
  phoneMoreNote?: ReactNode;
  /** Phone bottom-bar text when no action is available. */
  phoneIdleLabel?: string;
  /** Edit-scope notice: a card above the body on desktop, a disclosure below it on phones. */
  notice?: {title: ReactNode; body: ReactNode};
  children: ReactNode;
  /** Phone body when the record's phone structure differs from desktop (M16 order). */
  phoneBody?: ReactNode;
  className?: string;
}

/**
 * Detail page template (MOBILE_UI_RULES M16). Owns the header, back
 * navigation, actions and edit notice for both layouts; the page supplies
 * the record body.
 */
export function ErpRecordPage({title, subtitle, quickStatus, back, actions, phoneMoreTitle = "单据操作", phoneMoreNote, phoneIdleLabel = "当前只读", notice, children, phoneBody, className}: ErpRecordPageProps) {
  const phone = useErpPhone();
  const phoneBack = usePhoneBackAction(back.to);
  const [moreOpen, setMoreOpen] = useState(false);

  if (!phone) {
    return <ErpDetailPageFrame className={cn("max-w-[1600px] space-y-5 pb-12", className)}>
      <ErpPageHeader
        title={title}
        subtitle={subtitle}
        quickStatus={quickStatus}
        actions={<><Link to={back.to} className="inline-flex h-9 items-center gap-2 rounded-[var(--erp-radius-md)] border border-[var(--erp-color-border)] bg-[var(--erp-color-surface)] px-3 text-xs font-semibold text-[var(--erp-color-text)]"><ArrowLeft className="h-4 w-4" />{back.label}</Link>{actions.map((action) => <DesktopAction key={action.key} action={action} />)}</>}
      />
      <ErpPageContent className="space-y-[var(--erp-page-gap)]">
        {notice && <Card className="border-[var(--erp-color-border-strong)] bg-[var(--erp-color-warning-soft)]"><div className="flex items-start gap-3 p-4"><LockKeyhole className="mt-0.5 h-4 w-4 shrink-0 text-[var(--erp-color-warning)]" /><div><p className="text-sm font-semibold text-[var(--erp-color-text)]">{notice.title}</p><div className="mt-1 text-xs leading-5 text-[var(--erp-color-text-secondary)]">{notice.body}</div></div></div></Card>}
        {children}
      </ErpPageContent>
    </ErpDetailPageFrame>;
  }

  const primary = actions.find((action) => action.phone === "primary" || action.phone === "both");
  const more = actions.filter((action) => action.phone === "more" || action.phone === "both");
  return <ErpDetailPageFrame className={className}>
    <ErpPageHeader title={title} quickStatus={[]} leading={<Button type="button" variant="ghost" size="iconTouch" aria-label={back.label} onClick={phoneBack}><ArrowLeft className="h-5 w-5" /></Button>} />
    <ErpPageContent className="space-y-[var(--erp-page-gap)]">
      {phoneBody ?? children}
      {notice && <details className="text-xs text-[var(--erp-color-text-secondary)]"><summary className="min-h-11 py-3">{notice.title}</summary>{notice.body}</details>}
    </ErpPageContent>
    <div className="erp-phone-detail-actions">
      {(more.length > 0 || phoneMoreNote) && <Button type="button" variant="secondary" onClick={() => setMoreOpen(true)}>更多</Button>}
      {primary ? <PhoneAction action={primary} primary /> : <span className="flex items-center justify-center text-sm text-[var(--erp-color-text-muted)]">{phoneIdleLabel}</span>}
    </div>
    <ErpDialogShell open={moreOpen} onOpenChange={setMoreOpen} title={phoneMoreTitle} mobilePresentation="sheet">
      <div className="grid gap-2">
        {more.map((action) => <PhoneAction key={action.key} action={action} onDone={() => setMoreOpen(false)} />)}
        {phoneMoreNote && <div className="text-xs text-[var(--erp-color-text-secondary)]">{phoneMoreNote}</div>}
      </div>
    </ErpDialogShell>
  </ErpDetailPageFrame>;
}

function DesktopAction({action}: {action: ErpRecordPageAction}) {
  if (action.to) {
    return <Link to={action.to} className={cn("inline-flex h-9 items-center gap-2 rounded-[var(--erp-radius-md)] px-3 text-xs font-semibold", action.variant === "primary" ? "bg-[var(--erp-color-primary)] text-white shadow-sm" : "border border-[var(--erp-color-border)] bg-[var(--erp-color-surface)] text-[var(--erp-color-text)]")}>{action.icon}{action.label}</Link>;
  }
  return <Button type="button" size="sm" variant={action.variant ?? "secondary"} disabled={action.disabled} title={action.title} onClick={action.onClick}>{action.icon}{action.label}</Button>;
}

function PhoneAction({action, primary = false, onDone}: {action: ErpRecordPageAction; primary?: boolean; onDone?: () => void}) {
  const label = action.phoneLabel ?? action.label;
  if (action.to) return <Link className="erp-phone-detail-action-link" to={action.to}>{label}</Link>;
  return <Button type="button" variant={primary ? "primary" : action.variant === "danger" ? "danger" : undefined} disabled={action.disabled} onClick={() => {onDone?.(); action.onClick?.();}}>{label}</Button>;
}
