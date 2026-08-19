import {ApiError, normalizeApiError} from "./errors";
import {reportClientError, reportClientRequest} from "../observability/clientTelemetry";

export {ApiError};

export const ACCESS_TOKEN_KEY = "gpu-erp-v2-access-token";

export function getAccessToken() {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(ACCESS_TOKEN_KEY);
}

export function setAccessToken(token: string) {
  if (typeof window !== "undefined") window.localStorage.setItem(ACCESS_TOKEN_KEY, token);
}

export function clearAccessToken() {
  if (typeof window !== "undefined") window.localStorage.removeItem(ACCESS_TOKEN_KEY);
}

function notifyAuthExpired() {
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent("gpu-erp:auth-expired"));
}

function createRequestId() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  return `v2-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function requestPath(path: string) {
  try {
    return new URL(path, typeof window === "undefined" ? "http://localhost" : window.location.origin).pathname;
  } catch {
    return path.split("?")[0] || path;
  }
}

function reportApiFailure(error: ApiError, path: string, method: string, requestId: string) {
  reportClientError({
    kind: "api",
    requestId: error.requestId || requestId,
    method,
    path: requestPath(path),
    status: error.status,
    code: error.code,
    message: error.message,
  });
}

export async function apiRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = getAccessToken();
  const headers = new Headers(init.headers);
  const requestId = headers.get("X-Request-ID") || createRequestId();
  headers.set("X-Request-ID", requestId);
  headers.set("Accept", "application/json");
  if (init.body && !(init.body instanceof FormData) && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  if (token) headers.set("Authorization", `Bearer ${token}`);
  const method = init.method || "GET";
  reportClientRequest({phase: "start", requestId, method, path: requestPath(path)});

  let response: Response;
  try {
    response = await fetch(path, {...init, headers});
  } catch (error) {
    const normalized = normalizeApiError(error, 0, requestId);
    reportClientRequest({phase: "error", requestId, method, path: requestPath(path)});
    reportApiFailure(normalized, path, init.method || "GET", requestId);
    throw normalized;
  }

  const payload = await response.json().catch(() => undefined);
  if (!response.ok) {
    const error = normalizeApiError(payload, response.status, requestId);
    if (error instanceof ApiError && error.isUnauthorized) {
      clearAccessToken();
      notifyAuthExpired();
    }
    const responseRequestId = response.headers.get("X-Request-ID") || requestId;
    reportClientRequest({phase: "error", requestId: responseRequestId, method, path: requestPath(path), status: response.status});
    reportApiFailure(error, path, method, responseRequestId);
    throw error;
  }
  reportClientRequest({phase: "success", requestId: response.headers.get("X-Request-ID") || requestId, method, path: requestPath(path), status: response.status});
  return payload as T;
}

export async function apiDownload(path: string, init: RequestInit = {}): Promise<Blob> {
  const token = getAccessToken();
  const headers = new Headers(init.headers);
  const requestId = headers.get("X-Request-ID") || createRequestId();
  headers.set("X-Request-ID", requestId);
  if (token) headers.set("Authorization", `Bearer ${token}`);
  const method = init.method || "GET";
  reportClientRequest({phase: "start", requestId, method, path: requestPath(path)});
  let response: Response;
  try {
    response = await fetch(path, {...init, headers});
  } catch (error) {
    const normalized = normalizeApiError(error, 0, requestId);
    reportClientRequest({phase: "error", requestId, method, path: requestPath(path)});
    reportApiFailure(normalized, path, init.method || "GET", requestId);
    throw normalized;
  }
  if (!response.ok) {
    const payload = await response.json().catch(() => undefined);
    const error = normalizeApiError(payload, response.status, requestId);
    if (error instanceof ApiError && error.isUnauthorized) {
      clearAccessToken();
      notifyAuthExpired();
    }
    const responseRequestId = response.headers.get("X-Request-ID") || requestId;
    reportClientRequest({phase: "error", requestId: responseRequestId, method, path: requestPath(path), status: response.status});
    reportApiFailure(error, path, method, responseRequestId);
    throw error;
  }
  reportClientRequest({phase: "success", requestId: response.headers.get("X-Request-ID") || requestId, method, path: requestPath(path), status: response.status});
  return response.blob();
}
