import { createHash, randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import type { AppState } from "./store.ts";
import type { SafeSystemUserAccount, SystemUserAccount } from "../src/types.ts";

const PASSWORD_PREFIX = "scrypt";
const KEY_LENGTH = 64;
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 7;

export type PersistedSession = { userId: string; expiresAt: number };
export type SessionStore = {
  create(tokenHash: string, session: PersistedSession): Promise<void>;
  resolve(tokenHash: string): Promise<PersistedSession | null>;
  revoke(tokenHash: string): Promise<void>;
};

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

// Collections that are append-only / unbounded history and are NOT needed by the default landing
// dashboard. They are stripped from the initial state payload and loaded on demand when the user
// opens the page that needs them (mirrors products/logs). salesInvoices is intentionally NOT here
// because the dashboard depends on it for revenue/profit on first paint.
export function stripLazyStateCollections(state: ReturnType<typeof sanitizeAppStateForClient>) {
  return {
    ...state,
    products: [],
    logs: [],
    financeLedger: [],
    settlementLedger: [],
  };
}

export function hashSessionToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

// Sessions live in the shared database instead of a process-local Map. This keeps logins valid
// across restarts and lets every API instance authenticate the same bearer token. Only a token
// hash is persisted, so a database read cannot be replayed as a browser credential.
export function createSessionManager(store: SessionStore) {
  return {
    async create(userId: string) {
      const token = randomBytes(32).toString("hex");
      await store.create(hashSessionToken(token), { userId, expiresAt: Date.now() + SESSION_TTL_MS });
      return token;
    },
    async resolve(token: string | null | undefined) {
      if (!token) return null;
      return store.resolve(hashSessionToken(token));
    },
    async revoke(token: string | null | undefined) {
      if (token) await store.revoke(hashSessionToken(token));
    },
  };
}
