import {Children, Fragment, isValidElement, useState, type ReactNode} from "react";
import {MoreHorizontal, RefreshCw} from "lucide-react";
import {Button, Popover} from "@/src/components/ui";
import {useErpPhone} from "@/src/hooks/useErpViewport";
import {ErpDialogShell} from "./ErpDialogShell";
import {cn} from "@/src/lib/cn";
import {QuickStatusGroup, type QuickStatusItemData, type QuickStatusVariant} from "./ErpQuickStatus";
import {ErpPageActions, ErpPageContext, ErpPageIdentity, ErpPageTopbar} from "./ErpPageFrame";

export interface ErpPageHeaderProps {
  phone?: boolean;
  /** Templates with their own More sheet retain their explicitly sized phone controls. */
  phoneActionsMode?: "collapse" | "inline";
  title: ReactNode;
  subtitle?: ReactNode;
  /**
   * High-density pages omit explanatory copy by default. Opt into the default
   * header only when the line changes a decision or communicates a safety
   * constraint (for example, a form workflow or a permission boundary).
   */
  density?: "compact" | "default";
  quickStatus?: ReadonlyArray<QuickStatusItemData>;
  quickStatusVariant?: QuickStatusVariant;
  dateContent?: ReactNode;
  actions?: ReactNode;
  /** Caller-owned back action; used by native phone task headers. */
  leading?: ReactNode;
}

export function isRefreshAction(element: ReactNode): boolean {
  if (!isValidElement(element)) return false;
  const props = element.props as {children?: ReactNode; "aria-label"?: string; title?: string; "data-erp-action"?: string};
  if (props["data-erp-action"] === "refresh") return true;
  if (typeof props["aria-label"] === "string" && props["aria-label"].includes("刷新")) return true;
  if (typeof props.title === "string" && props.title.includes("刷新")) return true;
  const text = Children.toArray(props.children).filter((c): c is string => typeof c === "string").join("");
  if (text.includes("刷新")) return true;
  const hasRefreshIcon = Children.toArray(props.children).some((c) => isValidElement(c) && (c.type === RefreshCw || (typeof c.type === "function" && c.type.name === "RefreshCw") || (c.type as {displayName?: string})?.displayName === "RefreshCw"));
  return hasRefreshIcon;
}

export function resolvePhonePageActions(actions: ReactNode): ReactNode[] {
  return Children.toArray(actions).flatMap((child) => isValidElement<{children?: ReactNode}>(child) && (child.type === Fragment || child.type === "div") ? resolvePhonePageActions(child.props.children) : [child]);
}

/**
 * Keep one primary and exports inline; plain secondary buttons move into More.
 * Anything else (view switches, lookup widgets) is page navigation or a
 * self-contained control and stays visible.
 */
export function resolveDesktopPageActions(actions: ReactNode) {
  const items = resolvePhonePageActions(actions);
  let primaryFound = false;
  const inline: ReactNode[] = [];
  const more: ReactNode[] = [];
  for (const item of items) {
    const props = isValidElement<{variant?: string; children?: ReactNode; "data-erp-action"?: string}>(item) ? item.props : undefined;
    const text = props ? Children.toArray(props.children).filter((child): child is string => typeof child === "string").join("") : "";
    if ((props?.variant === "primary" || /^(新建|新增|创建)/.test(text)) && !primaryFound) {primaryFound = true; inline.push(item);}
    else if (props?.["data-erp-action"] === "export" || text.includes("导出")) inline.push(item);
    else if (isValidElement(item) && item.type === Button) more.push(item);
    else inline.push(item);
  }
  return {inline, more};
}

export function ErpPageHeader({title, subtitle, density = "compact", quickStatus, quickStatusVariant = "compact", dateContent, actions, leading, phoneActionsMode = "collapse", phone: phoneProp}: ErpPageHeaderProps) {
  const phoneFromHook = useErpPhone();
  const phone = phoneProp ?? phoneFromHook;
  const [moreOpen, setMoreOpen] = useState(false);
  const [desktopMoreOpen, setDesktopMoreOpen] = useState(false);
  const rawActions = resolvePhonePageActions(actions);
  const desktopActions = resolveDesktopPageActions(actions);
  const actionItems = phone ? rawActions.filter((item) => !isRefreshAction(item)) : rawActions;
  const primaryIndex = actionItems.findIndex((item) => isValidElement<{variant?: string}>(item) && item.props.variant === "primary");
  const primary = actionItems[primaryIndex < 0 ? 0 : primaryIndex];
  const secondary = actionItems.filter((_, index) => index !== (primaryIndex < 0 ? 0 : primaryIndex));
  const hasQuickStatus = Boolean(quickStatus?.length);
  const showSubtitle = density === "default" && !phone;
  const rightArea = dateContent || actions ? <ErpPageActions>{phone && dateContent}{phone ? (phoneActionsMode === "inline" ? actionItems : secondary.length ? <>{primary}<Button type="button" variant="ghost" size="icon" aria-label="更多页面操作" onClick={() => setMoreOpen(true)}><MoreHorizontal className="h-5 w-5" /></Button></> : actionItems) : <>{desktopActions.inline}{desktopActions.more.length > 0 && <Popover.Root open={desktopMoreOpen} onOpenChange={setDesktopMoreOpen}><Popover.Trigger render={<Button type="button" size="sm" variant="secondary" aria-label="更多页面操作" />}><MoreHorizontal className="h-4 w-4" />更多</Popover.Trigger><Popover.Portal keepMounted><Popover.Positioner sideOffset={8} align="end"><Popover.Popup className="grid gap-2 p-3" onClickCapture={(event) => {if ((event.target as HTMLElement).closest("button")) setDesktopMoreOpen(false);}}>{desktopActions.more}</Popover.Popup></Popover.Positioner></Popover.Portal></Popover.Root>}</>}</ErpPageActions> : null;
  return <><ErpPageTopbar
    data-erp-component="page-header"
    data-density={density}
    // The persistent sidebar leaves a narrow canvas at tablet widths. Keep
    // the identity, quick-status strip, and actions in a readable stack until
    // the wide desktop canvas is available; otherwise short titles wrap into
    // two lines beside a partially wrapped status strip. On wide screens the
    // status chips sit beside the actions instead of floating mid-row.
    className={cn(density === "default" && "gap-4")}
  >
    {leading && <div className="shrink-0">{leading}</div>}
    <ErpPageIdentity title={title} subtitle={showSubtitle ? subtitle : undefined} reserveSubtitle={showSubtitle && Boolean(subtitle)} />
    {phone && hasQuickStatus ? <ErpPageContext><QuickStatusGroup items={quickStatus!} variant={quickStatusVariant} className="min-w-0" /></ErpPageContext> : null}
    {rightArea}
  </ErpPageTopbar>{!phone && (hasQuickStatus || dateContent) && <ErpPageContext className="flex flex-wrap items-center gap-3">{dateContent}{hasQuickStatus && <QuickStatusGroup items={quickStatus!} variant={quickStatusVariant} />}</ErpPageContext>}{phone && phoneActionsMode === "collapse" && secondary.length > 0 && <ErpDialogShell open={moreOpen} onOpenChange={setMoreOpen} title="页面操作" mobilePresentation="sheet"><div className="erp-phone-action-menu">{secondary}</div></ErpDialogShell>}</>;
}
