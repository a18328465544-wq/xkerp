import type {VoiceCaptureMode} from "./VoiceCaptureButton";
import type {VoiceRecorderState} from "./useVoiceRecorder";

export function isVoiceCaptureDisabled(mode: VoiceCaptureMode, state: VoiceRecorderState, disabled: boolean, busy: boolean) {
  return disabled || busy || state === "stopping" || state === "starting" && mode !== "hold";
}

export function resolveHoldReleaseIntent(activePointerId: number | null, eventPointerId: number, cancel: boolean) {
  if (activePointerId === null || activePointerId !== eventPointerId) return null;
  return cancel ? "cancel" : "stop";
}
