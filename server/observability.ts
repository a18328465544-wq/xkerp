const sensitiveQueryKey = /^(authorization|token|access[_-]?token|refresh[_-]?token|password|secret|cookie|api[_-]?key|signature|webhook)$/i;

export function redactRequestPath(rawPath: string) {
  const value = String(rawPath || "/");
  const queryIndex = value.indexOf("?");
  const pathname = value.slice(0, queryIndex < 0 ? value.length : queryIndex).slice(0, 500);
  if (queryIndex < 0) return pathname;

  const query = new URLSearchParams(value.slice(queryIndex + 1));
  const safeQuery = Array.from(query.entries())
    .map(([key, item]) => [key, sensitiveQueryKey.test(key) ? "[REDACTED]" : item.slice(0, 200)] as const)
    .map(([key, item]) => encodeURIComponent(key) + "=" + encodeURIComponent(item))
    .join("&");
  return (pathname + "?" + safeQuery).slice(0, 1200);
}

export function safeErrorMessage(error: unknown) {
  const rawMessage = error instanceof Error ? error.message : "Unknown server error";
  return rawMessage
    .replace(/\bBearer\s+[^\s,;]+/gi, "Bearer [REDACTED]")
    .replace(/(authorization|token|password|secret|cookie)\s*[:=]\s*[^\s,;]+/gi, "$1=[REDACTED]")
    .slice(0, 500);
}
