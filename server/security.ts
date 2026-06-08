import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import type { AppState } from "./store.ts";
import type { SafeSystemUserAccount, SystemUserAccount } from "../src/types.ts";

const PASSWORD_PREFIX = "scrypt";
const KEY_LENGTH = 64;
const SESSION_TTL_MS = 1000 * 60 * 60 * 12;

export function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, KEY_LENGTH).toString("hex");
  return `${PASSWORD_PREFIX}$${salt}$${hash}`;
}

export function isPasswordHash(value: string | undefined) {
  return Boolean(value?.startsWith(`${PASSWORD_PREFIX}$`));
}

export function verifyPassword(storedPassword: string | undefined, inputPassword: string) {
  if (!storedPassword) return false;
  if (!isPasswordHash(storedPassword)) {
    return storedPassword === inputPassword;
  }

  const [, salt, storedHash] = storedPassword.split("$");
  if (!salt || !storedHash) return false;
  const inputHash = scryptSync(inputPassword, salt, KEY_LENGTH);
  const stored = Buffer.from(storedHash, "hex");
  return stored.length === inputHash.length && timingSafeEqual(stored, inputHash);
}

export function sanitizeUserAccount(user: SystemUserAccount): SafeSystemUserAccount {
  const { password: _password, ...safeUser } = user;
  return safeUser;
}

export function sanitizeAppStateForClient(state: AppState) {
  const { currentUserId: _currentUserId, systemUsers, ...safeState } = state;
  return {
    ...safeState,
    systemUsers: systemUsers.map(sanitizeUserAccount),
  };
}

export function createSessionManager() {
  const sessions = new Map<string, { userId: string; expiresAt: number }>();

  const resolve = (token: string | null | undefined) => {
    if (!token) return null;
    const session = sessions.get(token);
    if (!session) return null;
    if (session.expiresAt < Date.now()) {
      sessions.delete(token);
      return null;
    }
    return session;
  };

  return {
    create(userId: string) {
      const token = randomBytes(32).toString("hex");
      sessions.set(token, { userId, expiresAt: Date.now() + SESSION_TTL_MS });
      return token;
    },
    resolve,
    revoke(token: string | null | undefined) {
      if (token) sessions.delete(token);
    },
  };
}
