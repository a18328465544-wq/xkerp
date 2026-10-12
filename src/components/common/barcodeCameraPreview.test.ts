import assert from "node:assert/strict";
import test from "node:test";
import {waitForBarcodeCameraPreview, type BarcodePreviewVideo} from "./barcodeCameraPreview";

function fixture(native = true) {
  let id = 0;
  const paints = new Map<number, FrameRequestCallback>();
  const frames = new Map<number, (now: number, metadata: {width: number; height: number}) => void>();
  const video = {
    readyState: 0, videoWidth: 0, videoHeight: 0,
    ...(native ? {requestVideoFrameCallback: (callback: (now: number, metadata: {width: number; height: number}) => void) => {frames.set(++id, callback); return id;}, cancelVideoFrameCallback: (value: number) => {frames.delete(value);}} : {}),
  } satisfies BarcodePreviewVideo;
  const options = {requestPaint: (callback: FrameRequestCallback) => {paints.set(++id, callback); return id;}, cancelPaint: (value: number) => {paints.delete(value);}};
  const paint = () => {const pending = [...paints.values()]; paints.clear(); pending.forEach((callback) => callback(0));};
  const frame = (width = 720, height = 1280) => {const pending = [...frames.values()]; frames.clear(); pending.forEach((callback) => callback(0, {width, height}));};
  return {video, options, paint, frame, paints, frames};
}

test("preview does not reveal metadata or resolved play without a presented frame", async () => {
  const f = fixture();
  let ready = false;
  const wait = waitForBarcodeCameraPreview(f.video, new AbortController().signal, f.options).then(() => {ready = true;});
  Object.assign(f.video, {readyState: 2, videoWidth: 720, videoHeight: 1280});
  f.paint(); f.paint(); await Promise.resolve();
  assert.equal(ready, false);
  f.frame(); f.paint(); await Promise.resolve();
  assert.equal(ready, false);
  f.paint(); await wait;
  assert.equal(ready, true);
  assert.equal(f.paints.size, 0);
  assert.equal(f.frames.size, 0);
});

test("dimension changes restart the stable paint check", async () => {
  const f = fixture();
  let ready = false;
  const wait = waitForBarcodeCameraPreview(f.video, new AbortController().signal, f.options).then(() => {ready = true;});
  Object.assign(f.video, {readyState: 2, videoWidth: 720, videoHeight: 1280});
  f.frame(); f.paint();
  Object.assign(f.video, {videoWidth: 1920, videoHeight: 1080});
  f.paint(); await Promise.resolve();
  assert.equal(ready, false);
  f.paint(); await wait;
});

test("zero-sized first frames are ignored until an effective frame arrives", async () => {
  const f = fixture();
  const wait = waitForBarcodeCameraPreview(f.video, new AbortController().signal, f.options);
  f.frame(0, 0); f.paint();
  assert.equal(f.frames.size, 1);
  Object.assign(f.video, {readyState: 2, videoWidth: 1280, videoHeight: 720});
  f.frame(1280, 720); f.paint(); f.paint(); await wait;
});

test("older browsers require current frame data, not metadata, and stable dimensions", async () => {
  const f = fixture(false);
  let ready = false;
  const wait = waitForBarcodeCameraPreview(f.video, new AbortController().signal, f.options).then(() => {ready = true;});
  Object.assign(f.video, {readyState: 1, videoWidth: 720, videoHeight: 1280});
  f.paint(); f.paint(); await Promise.resolve();
  assert.equal(ready, false);
  f.video.readyState = 2;
  f.paint(); f.paint(); await wait;
});

test("closing during frame preparation cancels paints and late frame callbacks", async () => {
  const f = fixture();
  const controller = new AbortController();
  const wait = waitForBarcodeCameraPreview(f.video, controller.signal, f.options);
  controller.abort();
  await assert.rejects(wait, {name: "AbortError"});
  assert.equal(f.paints.size, 0);
  assert.equal(f.frames.size, 0);
  f.frame(); f.paint();
});

test("already closed sessions never register frame callbacks", async () => {
  const f = fixture();
  const controller = new AbortController(); controller.abort();
  await assert.rejects(waitForBarcodeCameraPreview(f.video, controller.signal, f.options), {name: "AbortError"});
  assert.equal(f.paints.size, 0); assert.equal(f.frames.size, 0);
});

test("a stalled preview fails visibly and cleans callbacks rather than revealing on timeout", async () => {
  const f = fixture();
  await assert.rejects(waitForBarcodeCameraPreview(f.video, new AbortController().signal, {...f.options, timeoutMs: 10}), /相机画面暂时无法显示/);
  assert.equal(f.paints.size, 0); assert.equal(f.frames.size, 0);
});
