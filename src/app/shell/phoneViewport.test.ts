import assert from "node:assert/strict";
import test from "node:test";
import {resolvePhoneFocusScroll, resolvePhoneKeyboard, resolvePhoneViewport} from "./phoneViewport";

test("visual-only keyboard occlusion offsets the action bar", () => {
  assert.deepEqual(resolvePhoneKeyboard({editing: true, restingHeight: 844, layoutHeight: 844, visualHeight: 500}), {open: true, inset: 344});
});
test("layout resizing hides navigation without subtracting the keyboard twice", () => {
  assert.deepEqual(resolvePhoneKeyboard({editing: true, restingHeight: 844, layoutHeight: 500, visualHeight: 500}), {open: true, inset: 0});
});
test("pinch zoom and non-input view changes are not keyboards", () => {
  assert.deepEqual(resolvePhoneKeyboard({editing: false, restingHeight: 844, layoutHeight: 844, visualHeight: 500}), {open: false, inset: 0});
  assert.deepEqual(resolvePhoneKeyboard({editing: true, restingHeight: 844, layoutHeight: 844, visualHeight: 500, scale: 1.5}), {open: false, inset: 0});
});

test("iOS pan offsets are subtracted once and stale dismissal offsets are clamped", () => {
  assert.deepEqual(resolvePhoneViewport({layoutHeight: 844, visualHeight: 380, offsetTop: 80}), {height: 380, top: 80, bottom: 384});
  assert.deepEqual(resolvePhoneViewport({layoutHeight: 844, visualHeight: 844, offsetTop: 80}), {height: 844, top: 0, bottom: 0});
  assert.deepEqual(resolvePhoneViewport({layoutHeight: 844, visualHeight: 0, offsetTop: 80}), {height: 844, top: 0, bottom: 0});
});

test("focus changes retain occlusion until the keyboard has actually closed", () => {
  assert.deepEqual(resolvePhoneKeyboard({editing: false, wasOpen: true, restingHeight: 844, layoutHeight: 844, visualHeight: 380, offsetTop: 80}), {open: true, inset: 384});
  assert.deepEqual(resolvePhoneKeyboard({editing: false, wasOpen: true, restingHeight: 844, layoutHeight: 844, visualHeight: 844, offsetTop: 80}), {open: false, inset: 0});
});

test("a short keyboard accessory retains visible bounds without being classified as a full keyboard", () => {
  assert.deepEqual(resolvePhoneViewport({layoutHeight: 844, visualHeight: 800}), {height: 800, top: 0, bottom: 44});
  assert.deepEqual(resolvePhoneKeyboard({editing: true, restingHeight: 844, layoutHeight: 844, visualHeight: 800}), {open: false, inset: 0});
});

test("pinch zoom preserves layout instead of applying a second UI resize", () => {
  assert.deepEqual(resolvePhoneViewport({layoutHeight: 844, visualHeight: 400, offsetTop: 120, scale: 2}), {height: 844, top: 0, bottom: 0});
});

test("focused fields scroll only when clipped, with long textareas anchored at their first line", () => {
  assert.equal(resolvePhoneFocusScroll({top: 150, bottom: 194, visibleTop: 100, visibleBottom: 300}), 0);
  assert.equal(resolvePhoneFocusScroll({top: 310, bottom: 354, visibleTop: 100, visibleBottom: 300}), 54);
  assert.equal(resolvePhoneFocusScroll({top: 70, bottom: 114, visibleTop: 100, visibleBottom: 300}), -30);
  assert.equal(resolvePhoneFocusScroll({top: 310, bottom: 710, visibleTop: 100, visibleBottom: 300}), 210);
  assert.equal(resolvePhoneFocusScroll({top: 100, bottom: 500, visibleTop: 100, visibleBottom: 300}), 0);
  assert.equal(resolvePhoneFocusScroll({top: 100, bottom: 144, visibleTop: 200, visibleBottom: 150}), 0);
});
