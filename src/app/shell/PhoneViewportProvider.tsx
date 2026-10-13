import {createContext, useContext, useEffect, useState, type ReactNode} from "react";
import {useErpPhone} from "@/src/hooks/useErpViewport";
import {resolvePhoneFocusScroll, resolvePhoneKeyboard, resolvePhoneViewport} from "./phoneViewport";

const closed = {open: false, inset: 0};
const PhoneKeyboardContext = createContext(closed);
export function usePhoneKeyboard() { return useContext(PhoneKeyboardContext); }

function editable(element: Element | null): element is HTMLElement {
  if (!(element instanceof HTMLElement) || element.closest('[inert], [hidden], [aria-hidden="true"]')) return false;
  if (element.isContentEditable) return true;
  return (element instanceof HTMLTextAreaElement || element instanceof HTMLInputElement && !["hidden", "checkbox", "radio", "button", "submit", "reset", "file", "range", "color"].includes(element.type)) && !element.readOnly && !element.disabled;
}

function revealFocusedField(viewport: ReturnType<typeof resolvePhoneViewport>) {
  const field = document.activeElement;
  if (!editable(field) || !field.isConnected || field.getClientRects().length === 0) return;
  // Pinned controls follow their surface's viewport. Scrolling their parent
  // cannot move them and would disturb the list underneath the search dock.
  if (field.closest('[data-erp-component="mobile-action-dock"], [data-erp-region="dialog-toolbar"], [data-erp-region="dialog-footer"], [data-erp-region="drawer-footer"], .erp-phone-selector-query')) return;
  const gap = Number.parseFloat(getComputedStyle(field).scrollMarginTop) || 0;
  let bottom = viewport.top + viewport.height;
  const surface = field.closest('.erp-dialog-popup, [data-erp-shell]');
  for (const bar of surface?.querySelectorAll<HTMLElement>('[data-erp-component="submit-bar"], [data-erp-component="mobile-action-dock"], .erp-mobile-workflow-actions, .erp-inspection-submit, .erp-mobile-bottom-nav, .erp-phone-detail-actions, .erp-phone-selection-bar') ?? []) {
    const rect = bar.getBoundingClientRect();
    const style = getComputedStyle(bar);
    if (!bar.contains(field) && rect.height > 0 && style.visibility !== "hidden" && ["fixed", "sticky"].includes(style.position) && rect.top > viewport.top && rect.top < bottom && rect.bottom >= bottom - gap) bottom = rect.top;
  }
  for (let parent = field.parentElement; parent && parent !== document.body; parent = parent.parentElement) {
    if (!/(auto|scroll)/.test(getComputedStyle(parent).overflowY) || parent.scrollHeight <= parent.clientHeight) continue;
    const rect = parent.getBoundingClientRect();
    const fieldRect = field.getBoundingClientRect();
    const delta = resolvePhoneFocusScroll({top: fieldRect.top, bottom: fieldRect.bottom, visibleTop: Math.max(viewport.top, rect.top + parent.clientTop) + gap, visibleBottom: Math.min(bottom, rect.top + parent.clientTop + parent.clientHeight) - gap});
    if (Math.abs(delta) > 1) parent.scrollTop += delta;
  }
  // Login is outside the locked workbench and uses native document scrolling.
  if (!surface) {
    const rect = field.getBoundingClientRect();
    const delta = resolvePhoneFocusScroll({top: rect.top, bottom: rect.bottom, visibleTop: viewport.top + gap, visibleBottom: bottom - gap});
    if (Math.abs(delta) > 1) window.scrollBy({top: delta, behavior: "instant"});
  }
}

/** One viewport owner above authentication: login, pages and portaled controls
 * all share the same keyboard geometry. Desktop pointers retain native layout. */
export function PhoneViewportProvider({children}: {children: ReactNode}) {
  const phone = useErpPhone();
  const [keyboard, setKeyboard] = useState(closed);
  useEffect(() => {
    if (!phone && !window.matchMedia("(pointer: coarse)").matches) { setKeyboard(closed); return; }
    const viewport = window.visualViewport;
    const root = document.documentElement;
    const properties = ["--erp-phone-keyboard-inset", "--erp-phone-visible-height", "--erp-phone-viewport-offset-top"] as const;
    const previous = properties.map((name) => root.style.getPropertyValue(name));
    const previousKeyboard = root.getAttribute("data-phone-keyboard");
    const previousViewport = root.getAttribute("data-phone-viewport");
    let restingHeight = window.innerHeight;
    let width = window.innerWidth;
    let current = closed;
    let frame = 0;
    let revealFrame = 0;
    let settleTimers: number[] = [];
    const update = () => {
      frame = 0;
      const editing = editable(document.activeElement);
      const scale = viewport?.scale ?? 1;
      const geometry = resolvePhoneViewport({layoutHeight: window.innerHeight, visualHeight: viewport?.height ?? window.innerHeight, offsetTop: viewport?.offsetTop, scale});
      if (Math.abs(window.innerWidth - width) > 100 || !editing && !current.open) {restingHeight = window.innerHeight; width = window.innerWidth;}
      current = resolvePhoneKeyboard({editing, wasOpen: current.open, restingHeight, layoutHeight: window.innerHeight, visualHeight: geometry.height, offsetTop: geometry.top, scale});
      setKeyboard((previousState) => previousState.open === current.open && previousState.inset === current.inset ? previousState : current);
      // Position surfaces by the real visible rectangle even when only a
      // short keyboard accessory bar is present. Keyboard classification is
      // used for navigation, never to discard genuine viewport occlusion.
      root.style.setProperty(properties[0], `${geometry.bottom}px`);
      root.style.setProperty(properties[1], `${geometry.height}px`);
      root.style.setProperty(properties[2], `${geometry.top}px`);
      if (current.open) root.setAttribute("data-phone-keyboard", "open"); else root.removeAttribute("data-phone-keyboard");
      if (geometry.height < window.innerHeight - 1 || geometry.top > 1) root.setAttribute("data-phone-viewport", "occluded"); else root.removeAttribute("data-phone-viewport");
      if (!editing && !current.open) restingHeight = window.innerHeight;
      cancelAnimationFrame(revealFrame);
      if (editing && Math.abs(scale - 1) < 0.05) revealFrame = requestAnimationFrame(() => revealFocusedField(geometry));
    };
    const schedule = () => {if (!frame) frame = requestAnimationFrame(update);};
    const settle = () => {
      settleTimers.forEach(clearTimeout);
      schedule();
      // WebKit can publish the final visual rectangle after its keyboard
      // animation. Bounded retries also cover focus/blur ordering and BFCache.
      settleTimers = [100, 350].map((delay) => window.setTimeout(schedule, delay));
    };
    viewport?.addEventListener("resize", schedule);
    viewport?.addEventListener("scroll", schedule);
    window.addEventListener("resize", settle);
    window.addEventListener("orientationchange", settle);
    window.addEventListener("pageshow", settle);
    document.addEventListener("visibilitychange", settle);
    document.addEventListener("focusin", settle);
    document.addEventListener("focusout", settle);
    document.addEventListener("input", schedule);
    update();
    return () => {
      cancelAnimationFrame(frame); cancelAnimationFrame(revealFrame); settleTimers.forEach(clearTimeout);
      viewport?.removeEventListener("resize", schedule); viewport?.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", settle); window.removeEventListener("orientationchange", settle); window.removeEventListener("pageshow", settle);
      document.removeEventListener("visibilitychange", settle); document.removeEventListener("focusin", settle); document.removeEventListener("focusout", settle); document.removeEventListener("input", schedule);
      properties.forEach((name, index) => {if (previous[index]) root.style.setProperty(name, previous[index]); else root.style.removeProperty(name);});
      if (previousKeyboard === null) root.removeAttribute("data-phone-keyboard"); else root.setAttribute("data-phone-keyboard", previousKeyboard);
      if (previousViewport === null) root.removeAttribute("data-phone-viewport"); else root.setAttribute("data-phone-viewport", previousViewport);
    };
  }, [phone]);
  return <PhoneKeyboardContext.Provider value={keyboard}>{children}</PhoneKeyboardContext.Provider>;
}
