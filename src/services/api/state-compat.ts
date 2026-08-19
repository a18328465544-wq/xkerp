import {apiRequest} from "./client";

/**
 * Temporary compatibility boundary for resources that do not yet have a
 * dedicated paginated endpoint. Keeping this call in one place makes the
 * remaining migration visible and prevents new pages from spreading raw
 * `/api/state?mode=full` usage.
 */
export function fetchFullStateCompat<T>(signal?: AbortSignal): Promise<T> {
  return fetchStateCompat("full", signal);
}

/**
 * Lightweight state boundary for landing/dashboard reads. The server strips
 * unbounded collections (logs, ledgers and product templates) from this mode,
 * while keeping the inventory, sales and market collections needed for the
 * first paint.
 */
export function fetchInitialStateCompat<T>(signal?: AbortSignal): Promise<T> {
  return fetchStateCompat("initial", signal);
}

function fetchStateCompat<T>(mode: "full" | "initial", signal?: AbortSignal): Promise<T> {
  return apiRequest<T>(`/api/state?mode=${mode}`, {signal});
}
