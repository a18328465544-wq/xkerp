/**
 * Frontend-only feature gates.  These flags reserve interaction entry points
 * without pretending that the corresponding FastAPI capability already exists.
 */
export const featureFlags = {
  ai: false,
  salesAiEntry: false,
} as const;
