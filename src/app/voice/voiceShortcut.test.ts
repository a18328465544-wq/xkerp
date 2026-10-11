import assert from "node:assert/strict";
import test from "node:test";
import {isVoiceEntryShortcut} from "./voiceShortcut";

const optionV = (overrides: Partial<KeyboardEvent> = {}) => ({
  defaultPrevented: false,
  repeat: false,
  altKey: true,
  ctrlKey: false,
  metaKey: false,
  shiftKey: false,
  code: "KeyV",
  key: "√",
  ...overrides,
} as KeyboardEvent);

test("voice shortcut recognizes macOS Option+V by physical key code", () => {
  assert.equal(isVoiceEntryShortcut(optionV()), true);
});

test("voice shortcut only responds from the active workspace tab", () => {
  assert.equal(isVoiceEntryShortcut(optionV(), true), true);
  assert.equal(isVoiceEntryShortcut(optionV(), false), false);
});

test("voice shortcut rejects modified, repeated, or already handled events", () => {
  assert.equal(isVoiceEntryShortcut(optionV({code: "KeyA"})), false);
  assert.equal(isVoiceEntryShortcut(optionV({ctrlKey: true})), false);
  assert.equal(isVoiceEntryShortcut(optionV({metaKey: true})), false);
  assert.equal(isVoiceEntryShortcut(optionV({shiftKey: true})), false);
  assert.equal(isVoiceEntryShortcut(optionV({repeat: true})), false);
  assert.equal(isVoiceEntryShortcut(optionV({defaultPrevented: true})), false);
});
