import {test} from "node:test";
import assert from "node:assert/strict";
import {barcodeRearCameras, cameraCapabilities, cameraSettings, createBarcodeCameraZoom, enableBarcodeAutofocus, openBarcodeCamera, rememberBarcodeRearCamera, type BarcodeCameraTrack} from "./barcodeCamera";
import {barcodeFrameCrop, barcodeFrameSize} from "./barcodeScannerFrames";

test("barcode autofocus is optional, capability-checked and failure tolerant", async () => {
  assert.equal(await enableBarcodeAutofocus({}), false);
  let calls = 0;
  assert.equal(await enableBarcodeAutofocus({getCapabilities: () => ({focusMode: ["manual"]}), applyConstraints: async () => {calls++;}}), false);
  assert.equal(calls, 0);
  assert.equal(await enableBarcodeAutofocus({getCapabilities: () => ({focusMode: ["continuous"]}), applyConstraints: async (value) => {assert.equal(value.advanced[0]?.focusMode, "continuous");}}), true);
  assert.equal(await enableBarcodeAutofocus({getCapabilities: () => ({focusMode: ["continuous"]}), applyConstraints: async () => {throw new Error("unsupported");}}), false);
  assert.deepEqual(cameraCapabilities({getCapabilities: () => {throw new Error("old browser");}}), {});
  assert.deepEqual(cameraSettings({getSettings: () => null}), {});
});

test("zoom uses verified camera settings, respects range/step and digitally fills a limited range", async () => {
  let zoom = 1;
  const applied: number[] = [];
  const track: BarcodeCameraTrack = {getCapabilities: () => ({zoom: {min: 1, max: 1.5, step: .1}, focusMode: ["continuous"]}), getSettings: () => ({zoom}), applyConstraints: async (value) => {zoom = value.advanced[0]!.zoom!; applied.push(zoom); assert.equal(value.advanced[0]!.focusMode, "continuous");}};
  const set = createBarcodeCameraZoom(track, () => true);
  assert.deepEqual(await set(1.5), {magnification: 1.5, softwareZoom: 1});
  assert.deepEqual(await set(2), {magnification: 2, softwareZoom: 2 / 1.5});
  assert.deepEqual(await set(1), {magnification: 1, softwareZoom: 1});
  assert.deepEqual(applied, [1.5, 1.5, 1]);
});

test("unsupported, rejected or ignored zoom falls back to real digital cropping", async () => {
  for (const track of [{}, {getCapabilities: () => ({zoom: {min: 1, max: 4}}), getSettings: () => ({zoom: 1}), applyConstraints: async () => {}}, {getCapabilities: () => ({zoom: {min: 1, max: 4}}), applyConstraints: async () => {throw new Error("not supported");}}, {getCapabilities: () => ({zoom: {min: NaN, max: 4}})}]) {
    assert.deepEqual(await createBarcodeCameraZoom(track, () => true)(2), {magnification: 2, softwareZoom: 2});
  }
});

test("zoom remembers a non-1 initial lens baseline and never lies about a failed reset", async () => {
  let actual = 2;
  let reject = false;
  const set = createBarcodeCameraZoom({getCapabilities: () => ({zoom: {min: 1, max: 8}}), getSettings: () => ({zoom: actual}), applyConstraints: async (value) => {if (reject) throw Error("busy"); actual = value.advanced[0]!.zoom!;}}, () => true);
  assert.deepEqual(await set(2), {magnification: 2, softwareZoom: 1});
  reject = true;
  assert.deepEqual(await set(1), {magnification: 2, softwareZoom: 1});
});

test("advertised zoom without readable settings does not double digital magnification", async () => {
  let applied = false;
  const set = createBarcodeCameraZoom({getCapabilities: () => ({zoom: {min: 1, max: 4}}), applyConstraints: async () => {applied = true;}}, () => true);
  assert.deepEqual(await set(2), {magnification: 2, softwareZoom: 2});
  assert.equal(applied, false);
});

test("queued zoom stops when its session is closed or replaced", async () => {
  let active = true;
  let release!: () => void;
  let calls = 0;
  const set = createBarcodeCameraZoom({getCapabilities: () => ({zoom: {min: 1, max: 4}}), getSettings: () => ({zoom: 1}), applyConstraints: async () => {calls++; await new Promise<void>((resolve) => {release = resolve;});}}, () => active);
  const first = set(1.5), second = set(2);
  await new Promise((resolve) => setTimeout(resolve, 0));
  active = false;
  release();
  assert.equal(await first, null);
  assert.equal(await second, null);
  assert.equal(calls, 1);
});

test("rear lens list keeps active camera, excludes front/unknown labels and deduplicates", () => {
  const devices = [{kind: "videoinput", deviceId: "current", label: ""}, {kind: "videoinput", deviceId: "wide", label: "后置超广角"}, {kind: "videoinput", deviceId: "front", label: "Front camera"}, {kind: "videoinput", deviceId: "unknown", label: "Camera 3"}, {kind: "videoinput", deviceId: "wide", label: "Back camera"}, {kind: "audioinput", deviceId: "mic", label: "Rear mic"}] as const;
  assert.deepEqual(barcodeRearCameras(devices, "current"), [{deviceId: "current", label: "当前镜头"}, {deviceId: "wide", label: "后置超广角"}]);
});

test("camera requests HD rear video, retries stale device but never permission denial", async () => {
  const calls: MediaStreamConstraints[] = [];
  const stream = {} as MediaStream;
  const media = {enumerateDevices: async () => [], getUserMedia: async (value: MediaStreamConstraints) => {calls.push(value); if (calls.length === 1) throw new DOMException("missing", "OverconstrainedError"); return stream;}};
  assert.equal(await openBarcodeCamera(media, "old-id"), stream);
  assert.deepEqual(calls[0]?.video, {width: {ideal: 1920}, height: {ideal: 1080}, deviceId: {exact: "old-id"}});
  assert.deepEqual(calls[1]?.video, {width: {ideal: 1920}, height: {ideal: 1080}, facingMode: {ideal: "environment"}});
  let deniedCalls = 0;
  await assert.rejects(openBarcodeCamera({...media, getUserMedia: async () => {deniedCalls++; throw new DOMException("denied", "NotAllowedError");}}, "id"), {name: "NotAllowedError"});
  assert.equal(deniedCalls, 1);
});

test("digital crop is centered before resizing, keeps portrait geometry and rejects invalid frames", () => {
  assert.deepEqual(barcodeFrameCrop(1920, 1080, 2), {x: 480, y: 270, width: 960, height: 540});
  assert.deepEqual(barcodeFrameCrop(720, 1280, 2), {x: 180, y: 320, width: 360, height: 640});
  assert.deepEqual(barcodeFrameCrop(1280, 720), {x: 0, y: 0, width: 1280, height: 720});
  assert.equal(barcodeFrameCrop(0, 720), null);
  assert.deepEqual(barcodeFrameCrop(1280, 720, NaN), barcodeFrameCrop(1280, 720));
  assert.deepEqual(barcodeFrameSize(1920, 1080), {width: 1280, height: 720});
});

test("closing during remembered lens enumeration never starts a late camera permission request", async () => {
  rememberBarcodeRearCamera("rear");
  let active = true, mediaCalls = 0;
  let finish!: (devices: MediaDeviceInfo[]) => void;
  const media = {enumerateDevices: () => new Promise<MediaDeviceInfo[]>((resolve) => {finish = resolve;}), getUserMedia: async () => {mediaCalls++; return {} as MediaStream;}};
  const opening = openBarcodeCamera(media, undefined, () => active);
  active = false;
  finish([]);
  await assert.rejects(opening, {name: "AbortError"});
  assert.equal(mediaCalls, 0);
  rememberBarcodeRearCamera("");
});
