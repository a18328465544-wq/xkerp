/** W3C MediaStream Image Capture (2025-04-23), sections 9.2–9.4:
 * https://www.w3.org/TR/image-capture/
 * focusMode/zoom are optional track capabilities, not guaranteed Safari APIs.
 * Read getCapabilities(), apply only advertised constraints, then getSettings()
 * to verify actual zoom. Never claim digital cropping changes optical focus.
 */
interface CameraRange {min: number; max: number; step?: number}
interface CameraCapabilities {focusMode?: readonly string[]; zoom?: CameraRange}
interface CameraSettings {zoom?: number; deviceId?: string}
export interface BarcodeCameraTrack {
  // TypeScript's DOM declarations do not yet include Image Capture extensions.
  // Read them as unknown and validate instead of widening global DOM types.
  getCapabilities?: () => unknown;
  getSettings?: () => unknown;
  applyConstraints?: (constraints: MediaTrackConstraints & {advanced: Array<{focusMode?: string; zoom?: number}>}) => Promise<void>;
}

export function cameraSettings(track: BarcodeCameraTrack): CameraSettings {
  try {
    const value = track.getSettings?.();
    if (!value || typeof value !== "object") return {};
    const settings = value as Record<string, unknown>;
    return {zoom: typeof settings.zoom === "number" && Number.isFinite(settings.zoom) && settings.zoom > 0 ? settings.zoom : undefined, deviceId: typeof settings.deviceId === "string" ? settings.deviceId : undefined};
  } catch {return {};}
}

export function cameraCapabilities(track: BarcodeCameraTrack): CameraCapabilities {
  try {
    const value = track.getCapabilities?.();
    if (!value || typeof value !== "object") return {};
    const capabilities = value as Record<string, unknown>;
    const zoom = capabilities.zoom && typeof capabilities.zoom === "object" ? capabilities.zoom as Record<string, unknown> : {};
    return {
      focusMode: Array.isArray(capabilities.focusMode) ? capabilities.focusMode.filter((mode): mode is string => typeof mode === "string") : undefined,
      zoom: typeof zoom.min === "number" && typeof zoom.max === "number" ? {min: zoom.min, max: zoom.max, step: typeof zoom.step === "number" && Number.isFinite(zoom.step) ? zoom.step : undefined} : undefined,
    };
  } catch {return {};}
}

export async function enableBarcodeAutofocus(track: BarcodeCameraTrack) {
  if (!cameraCapabilities(track).focusMode?.includes("continuous") || !track.applyConstraints) return false;
  try {await track.applyConstraints({advanced: [{focusMode: "continuous"}]}); return true;}
  catch {return false;} // Optional enhancement must never stop normal scanning.
}

export function validCameraZoomRange(range: CameraRange | undefined): range is CameraRange {
  return Boolean(range && Number.isFinite(range.min) && Number.isFinite(range.max) && range.min > 0 && range.max >= range.min);
}

/** Each controller belongs to one camera session; queued changes cannot leak
 * into a replacement lens or a kept-alive inactive workspace. */
export function createBarcodeCameraZoom(track: BarcodeCameraTrack, isActive: () => boolean) {
  const range = cameraCapabilities(track).zoom;
  const initial = cameraSettings(track).zoom;
  // Without a readable current zoom, applying hardware zoom and also cropping
  // could accidentally double the requested magnification. Use digital only.
  const canVerifyHardware = initial !== undefined;
  const base = validCameraZoomRange(range) ? Math.max(range.min, Math.min(range.max, initial && Number.isFinite(initial) ? initial : range.min)) : 1;
  let queue: Promise<unknown> = Promise.resolve();
  const set = async (requested: number) => {
    if (!isActive()) return null;
    const magnification = Number.isFinite(requested) ? Math.max(1, Math.min(2, requested)) : 1;
    let hardware = 1;
    if (canVerifyHardware && validCameraZoomRange(range) && track.applyConstraints) {
      const desired = Math.max(range.min, Math.min(range.max, base * magnification));
      const target = range.step && range.step > 0 ? Math.max(range.min, Math.min(range.max, range.min + Math.round((desired - range.min) / range.step) * range.step)) : desired;
      const focusMode = cameraCapabilities(track).focusMode?.includes("continuous") ? "continuous" : undefined;
      try {await track.applyConstraints({advanced: [{zoom: target, ...(focusMode ? {focusMode} : {})}]});} catch { /* Use verified current zoom plus digital crop. */ }
      if (!isActive()) return null;
      const actual = cameraSettings(track).zoom;
      // A browser can silently ignore a constraint. Never assume it succeeded.
      if (actual && Number.isFinite(actual)) hardware = Math.max(1, actual / base);
    }
    return {magnification: Math.max(magnification, hardware), softwareZoom: Math.max(1, magnification / hardware)};
  };
  return (requested: number) => {
    const result = queue.then(() => set(requested));
    queue = result.catch(() => undefined);
    return result;
  };
}

type CameraDevice = Pick<MediaDeviceInfo, "kind" | "deviceId" | "label">;
export function barcodeRearCameras(devices: readonly CameraDevice[], currentId: string | undefined) {
  const seen = new Set<string>();
  return devices.filter((device) => {
    if (device.kind !== "videoinput" || !device.deviceId || seen.has(device.deviceId)) return false;
    seen.add(device.deviceId);
    if (device.deviceId === currentId) return true;
    // Labels are localized and sometimes opaque. Unknown lenses are not guessed
    // to be rear/macro cameras; retain the current environment-selected camera.
    return !/front|user|前置|前面|正面|facetime/i.test(device.label) && /back|rear|environment|后置|後置|背面|traseira|arrière|rück/i.test(device.label);
  }).map((device) => ({deviceId: device.deviceId, label: device.label || "当前镜头"}));
}

let preferredRearCamera: string | undefined;
export function rememberBarcodeRearCamera(deviceId: string) {preferredRearCamera = deviceId;}

export async function openBarcodeCamera(media: Pick<MediaDevices, "getUserMedia" | "enumerateDevices">, requestedDeviceId?: string, isActive: () => boolean = () => true) {
  const checkActive = () => {if (!isActive()) throw new DOMException("Scanner session closed", "AbortError");};
  checkActive();
  let deviceId = requestedDeviceId;
  if (!deviceId && preferredRearCamera) {
    try {
      const devices = barcodeRearCameras(await media.enumerateDevices(), undefined);
      if (devices.some((device) => device.deviceId === preferredRearCamera)) deviceId = preferredRearCamera;
    } catch { /* Permissions may hide devices; use environment instead. */ }
  }
  checkActive();
  const video = {width: {ideal: 1920}, height: {ideal: 1080}};
  if (deviceId) {
    try {return await media.getUserMedia({audio: false, video: {...video, deviceId: {exact: deviceId}}});}
    catch (error) {
      // A removed/rotated device ID may fail. Do not bypass permission denial.
      if (!(error instanceof Error) || !["NotFoundError", "OverconstrainedError"].includes(error.name)) throw error;
    }
  }
  checkActive();
  return media.getUserMedia({audio: false, video: {...video, facingMode: {ideal: "environment"}}});
}
