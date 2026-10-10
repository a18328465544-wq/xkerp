import type {ReactNode} from "react";
import {ArrowLeft} from "lucide-react";
import {Button, Card, CardContent} from "@/src/components/ui";
import {useErpPhone} from "@/src/hooks/useErpViewport";
import {usePhoneBackAction} from "@/src/hooks/usePhoneBack";
import {ErpPageHeader} from "../ErpPageHeader";

export interface ErpTransactionHeaderProps {
  title: string;
  /** Shorter phone title, e.g. 「采购开单」 for 「进货与回收」. */
  phoneTitle?: string;
  subtitle?: ReactNode;
  back: {label: string; fallback: string; onDesktopBack: () => void};
  pending?: boolean;
  /** Desktop header actions after the back button. */
  actions?: ReactNode;
  /** Phone header actions; the back button moves to the leading slot. */
  phoneActions?: ReactNode;
}

/**
 * Header for order and return editors (MOBILE_UI_RULES M14): phones get an
 * icon back button that follows the phone back stack; desktop gets a labelled
 * back button beside the page actions.
 */
export function ErpTransactionHeader({title, phoneTitle = title, subtitle, back, pending = false, actions, phoneActions}: ErpTransactionHeaderProps) {
  const phone = useErpPhone();
  const phoneBack = usePhoneBackAction(back.fallback);
  const backButton = phone
    ? <Button type="button" variant="ghost" size="iconTouch" aria-label={back.label} disabled={pending} onClick={phoneBack}><ArrowLeft className="h-4 w-4" /></Button>
    : <Button type="button" variant="secondary" size="md" aria-label={back.label} disabled={pending} onClick={back.onDesktopBack}><ArrowLeft className="h-4 w-4" />{back.label}</Button>;
  return <Card className="border-[var(--erp-color-border-strong)]"><CardContent className="p-3">
    <ErpPageHeader density="default" title={phone ? phoneTitle : title} subtitle={subtitle} leading={phone ? backButton : undefined} actions={phone ? phoneActions : <>{backButton}{actions}</>} />
  </CardContent></Card>;
}
