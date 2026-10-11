export type VoiceShortcutKeyboardEvent = Pick<KeyboardEvent, "defaultPrevented" | "repeat" | "altKey" | "ctrlKey" | "metaKey" | "shiftKey" | "code">;

export function isVoiceEntryShortcut(event: VoiceShortcutKeyboardEvent) {
  return !event.defaultPrevented
    && !event.repeat
    && event.altKey
    && !event.ctrlKey
    && !event.metaKey
    && !event.shiftKey
    && event.code === "KeyV";
}
