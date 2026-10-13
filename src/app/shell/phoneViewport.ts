/** Layout-viewport resize (Android) and visual-only resize (iOS) need different
 * offsets: hide navigation for either keyboard, but never subtract it twice. */
export function resolvePhoneViewport({layoutHeight, visualHeight, offsetTop = 0, scale = 1}: {layoutHeight: number; visualHeight: number; offsetTop?: number; scale?: number}) {
  // Do not resize UI a second time during pinch zoom. Safari may also retain
  // an old offset briefly after dismissing the keyboard; clamp to the layout.
  const height = Math.abs(scale - 1) < 0.05 && visualHeight > 0 ? Math.min(layoutHeight, visualHeight) : layoutHeight;
  const top = Math.abs(scale - 1) < 0.05 ? Math.min(Math.max(0, offsetTop), Math.max(0, layoutHeight - height)) : 0;
  return {height, top, bottom: Math.max(0, layoutHeight - height - top)};
}

export function resolvePhoneKeyboard({editing, wasOpen = false, restingHeight, layoutHeight, visualHeight, offsetTop = 0, scale = 1}: {editing: boolean; wasOpen?: boolean; restingHeight: number; layoutHeight: number; visualHeight: number; offsetTop?: number; scale?: number}) {
  const viewport = resolvePhoneViewport({layoutHeight, visualHeight, offsetTop, scale});
  const open = (editing || wasOpen) && Math.abs(scale - 1) < 0.05 && restingHeight - viewport.height > 100;
  return {open, inset: open ? viewport.bottom : 0};
}

/** Scroll only enough to expose the focused field. Oversized textareas keep
 * their first editable line visible and scroll their own text/caret natively. */
export function resolvePhoneFocusScroll({top, bottom, visibleTop, visibleBottom}: {top: number; bottom: number; visibleTop: number; visibleBottom: number}) {
  if (visibleBottom <= visibleTop) return 0;
  if (top < visibleTop || bottom - top > visibleBottom - visibleTop) return top - visibleTop;
  return bottom > visibleBottom ? bottom - visibleBottom : 0;
}
