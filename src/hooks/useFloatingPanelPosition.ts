import {useEffect, useState, type RefObject} from "react";
import {resolvePhoneViewport} from "@/src/app/shell/phoneViewport";

export interface FloatingPanelPosition {
  left: number;
  top: number;
  width: number;
  maxHeight: number;
}

/**
 * Keeps listbox/popover panels anchored to a field while rendering them at the
 * document root. This prevents table/card overflow containers from clipping
 * searchable option panels.
 */
export function useFloatingPanelPosition(anchorRef: RefObject<HTMLElement | null>, open: boolean, maxHeight = 320): FloatingPanelPosition | null {
  const [position, setPosition] = useState<FloatingPanelPosition | null>(null);

  useEffect(() => {
    if (!open) {
      setPosition(null);
      return;
    }

    const update = () => {
      const anchor = anchorRef.current;
      if (!anchor) return;
      const rect = anchor.getBoundingClientRect();
      const viewportPadding = 8;
      const gap = 8;
      const viewport = window.visualViewport;
      const touchViewport = window.matchMedia("(pointer: coarse)").matches && Math.abs((viewport?.scale ?? 1) - 1) < 0.05;
      const bounds = resolvePhoneViewport({layoutHeight: window.innerHeight, visualHeight: viewport?.height ?? window.innerHeight, offsetTop: viewport?.offsetTop, scale: viewport?.scale});
      const visibleTop = touchViewport ? bounds.top : 0;
      const visibleBottom = touchViewport ? bounds.top + bounds.height : window.innerHeight;
      const workspaceBarHeight = Number.parseFloat(
        window.getComputedStyle(document.documentElement).getPropertyValue("--erp-workspace-bar-height"),
      ) || 0;
      const topBoundary = Math.max(visibleTop + viewportPadding, workspaceBarHeight + viewportPadding);
      const width = Math.min(rect.width, Math.max(0, window.innerWidth - viewportPadding * 2));
      const left = Math.min(Math.max(viewportPadding, rect.left), Math.max(viewportPadding, window.innerWidth - width - viewportPadding));
      const availableBelow = Math.max(0, visibleBottom - rect.bottom - gap - viewportPadding);
      const availableAbove = Math.max(0, rect.top - gap - topBoundary);
      const shouldFlip = availableBelow < Math.min(200, maxHeight) && availableAbove > availableBelow;
      const available = shouldFlip ? availableAbove : availableBelow;
      const resolvedHeight = touchViewport ? Math.min(maxHeight, available) : Math.max(120, Math.min(maxHeight, available || maxHeight));
      const top = shouldFlip
        ? Math.max(topBoundary, rect.top - gap - resolvedHeight)
        : Math.max(topBoundary, rect.bottom + gap);
      setPosition({left, top, width, maxHeight: resolvedHeight});
    };

    update();
    window.addEventListener("resize", update);
    window.visualViewport?.addEventListener("resize", update);
    window.visualViewport?.addEventListener("scroll", update);
    document.addEventListener("scroll", update, true);
    return () => {
      window.removeEventListener("resize", update);
      window.visualViewport?.removeEventListener("resize", update);
      window.visualViewport?.removeEventListener("scroll", update);
      document.removeEventListener("scroll", update, true);
    };
  }, [anchorRef, maxHeight, open]);

  return position;
}
