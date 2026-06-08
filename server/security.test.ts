import assert from "node:assert/strict";
import test from "node:test";

import { createInitialState } from "./store.ts";
import {
  createSessionManager,
  hashPassword,
  sanitizeAppStateForClient,
  verifyPassword,
} from "./security.ts";

test("password hashing verifies secrets without storing plaintext", () => {
  const hash = hashPassword("safe-pass-123");

  assert.match(hash, /^scrypt\$/);
  assert.equal(hash.includes("safe-pass-123"), false);
  assert.equal(verifyPassword(hash, "safe-pass-123"), true);
  assert.equal(verifyPassword(hash, "wrong-pass"), false);
});

test("client state strips passwords and current server session", () => {
  const state = createInitialState();
  state.currentUserId = "USR-ADMIN";

  const safeState = sanitizeAppStateForClient(state);

  assert.equal(Object.hasOwn(safeState, "currentUserId"), false);
  assert.equal(Object.hasOwn(safeState.systemUsers[0], "password"), false);
  assert.equal(safeState.inventory.length, state.inventory.length);
});

test("session manager issues and revokes bearer tokens", () => {
  const sessions = createSessionManager();
  const token = sessions.create("USR-ADMIN");

  assert.equal(typeof token, "string");
  assert.equal(sessions.resolve(token)?.userId, "USR-ADMIN");

  sessions.revoke(token);
  assert.equal(sessions.resolve(token), null);
});
