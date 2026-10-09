/**
 * Single source for every user-visible product name. The login page, shell,
 * browser title and PWA manifest must all read from here so the system never
 * shows two different names. The store name is static until /api/auth/me
 * exposes the tenant's own store name; switch `name` to that value then.
 */
export const BRAND = {
  /** Store identity — the primary name everywhere. */
  name: "成都显卡一号店",
  /** What this system is, shown as the secondary line next to the name. */
  product: "进销存",
  /** Short label for constrained places (home-screen icon, tab title). */
  shortName: "显卡一号店",
  slogan: "每一张显卡，从回收到售出都有据可查。",
  /** The GPU mark in /public is the only logo; favicon and UI share it. */
  markSrc: "/favicon.svg",
} as const;

