import assert from "node:assert/strict";
import test from "node:test";
import {waitForBarcodeCameraPreview, type BarcodePreviewVideo} from "./barcodeCameraPreview";

function fixture(native = true) {
  let id = 0;
  const paints = new Map<number, FrameRequestCallback>();
  const frames = new Map<number, (now: number, metadata: {width: number; height: number}) => void>();
  const video = {
    readyState: 0, videoWidth: 0, videoHeight: 0, currentTime: 0,
    ...(native ? {requestVideoFrameCallback: (callback: (now: number, metadata: {width: number; height: number}) => void) => {frames.set(++id, callback); return id;}, cancelVideoFrameCallback: (value: number) => {frames.delete(value);}} : {}),
  } satisfies BarcodePreviewVideo;
  const options = {requestPaint: (callback: FrameRequestCallback) => {paints.set(++id, callback); return id;}, cancelPaint: (value: number) => {paints.delete(value);}};
  const paint = (now = 0) => {const pending = [...paints.values()]; paints.clear(); pending.forEach((callback) => callback(now));};
  const frame = (width = 720, height = 1280, now = 0) => {const pending = [...frames.values()]; frames.clear(); pending.forEach((callback) => callback(now, {width, height}));};
  const stable = (width = 720, height = 1280, start = 0) => {
    for (let n = 0; n < 4; n++) {frame(width, height, start + n * 100); paint(start + n * 100);}
    paint(start + 316);
  };
  return {video, options, paint, frame, stable, paints, frames};
}

test("preview does not reveal metadata or resolved play without a presented frame", async () => {
  const f = fixture();
  let ready = false;
  const wait = waitForBarcodeCameraPreview(f.video, new AbortController().signal, f.options).then(() => {ready = true;});
  Object.assign(f.video, {readyState: 2, videoWidth: 720, videoHeight: 1280});
  f.paint(); f.paint(); await Promise.resolve();
  assert.equal(ready, false);
  f.frame(); f.paint(); f.paint(316); await Promise.resolve();
  assert.equal(ready, false);
  assert.equal(f.frames.size, 1, "must keep observing actual camera frames");
  f.stable(); await wait;
  assert.equal(ready, true);
  assert.equal(f.paints.size, 0);
  assert.equal(f.frames.size, 0);
});

test("late portrait-to-landscape dimensions restart actual-frame stability", async () => {
  const f = fixture();
  let ready = false;
  const wait = waitForBarcodeCameraPreview(f.video, new AbortController().signal, f.options).then(() => {ready = true;});
  Object.assign(f.video, {readyState: 2, videoWidth: 720, videoHeight: 1280});
  f.frame(); f.paint(); f.frame(720, 1280, 100); f.paint(100);
  Object.assign(f.video, {videoWidth: 1920, videoHeight: 1080});
  f.paint(200); f.frame(1920, 1080, 200); f.paint(216); await Promise.resolve();
  assert.equal(ready, false);
  f.stable(1920, 1080, 300); await wait;
});

test("zero-sized first frames are ignored until an effective frame arrives", async () => {
  const f = fixture();
  const wait = waitForBarcodeCameraPreview(f.video, new AbortController().signal, f.options);
  f.frame(0, 0); f.paint();
  assert.equal(f.frames.size, 1);
  Object.assign(f.video, {readyState: 2, videoWidth: 1280, videoHeight: 720});
  f.stable(1280, 720); await wait;
});

test("older browsers require advancing playback, not metadata or repeated paints", async () => {
  const f = fixture(false);
  let ready = false;
  const wait = waitForBarcodeCameraPreview(f.video, new AbortController().signal, f.options).then(() => {ready = true;});
  Object.assign(f.video, {readyState: 1, videoWidth: 720, videoHeight: 1280});
  f.paint(); f.paint(); await Promise.resolve();
  assert.equal(ready, false);
  f.video.readyState = 2;
  f.paint(); f.paint(400); await Promise.resolve();
  assert.equal(ready, false);
  for (let n = 0; n < 4; n++) {f.video.currentTime += 0.1; f.paint(500 + n * 100);}
  f.paint(816); await wait;
});

test("metadata changes also reset the window without assuming square media pixels", async () => {
  const f = fixture(); let ready = false;
  const wait = waitForBarcodeCameraPreview(f.video, new AbortController().signal, f.options).then(() => {ready = true;});
  Object.assign(f.video, {readyState: 2, videoWidth: 720, videoHeight: 1280});
  f.frame(1280, 720); f.paint(); f.frame(1280, 720, 100); f.paint(100);
  f.frame(720, 1280, 200); f.paint(200); f.frame(720, 1280, 300); f.paint(300);
  await Promise.resolve(); assert.equal(ready, false);
  f.stable(720, 1280, 400); await wait;
});

test("many rapid callbacks cannot substitute for a sustained stable stream", async () => {
  const f = fixture(); let ready = false;
  const wait = waitForBarcodeCameraPreview(f.video, new AbortController().signal, f.options).then(() => {ready = true;});
  Object.assign(f.video, {readyState: 2, videoWidth: 720, videoHeight: 1280});
  for (let n = 0; n < 10; n++) {f.frame(720, 1280, n * 10); f.paint(n * 10);}
  f.paint(400); await Promise.resolve(); assert.equal(ready, false);
  f.frame(720, 1280, 400); f.paint(400); f.paint(416); await wait;
});

test("a stalled source must establish a new stable frame window", async () => {
  const f = fixture(); let ready = false;
  const wait = waitForBarcodeCameraPreview(f.video, new AbortController().signal, f.options).then(() => {ready = true;});
  Object.assign(f.video, {readyState: 2, videoWidth: 720, videoHeight: 1280});
  f.frame(); f.paint(); f.frame(720, 1280, 100); f.paint(100);
  f.frame(720, 1280, 1000); f.paint(1000); await Promise.resolve(); assert.equal(ready, false);
  f.stable(720, 1280, 1100); await wait;
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
