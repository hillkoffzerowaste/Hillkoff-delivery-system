const TRACK_WINDOW_MS = 10 * 60 * 1000;
const TRACK_MAX_REQUESTS = 20;

export function requestClientKey(request) {
  const realIp = String(request?.headers?.get?.("x-real-ip") || "").trim();
  if (realIp) return realIp;

  const forwardedFor = String(request?.headers?.get?.("x-forwarded-for") || "");
  return forwardedFor.split(",")[0].trim();
}

export function isRateLimited(request, attempts, now = Date.now()) {
  const key = requestClientKey(request);
  if (!key) return false;

  const recent = (attempts.get(key) || []).filter((at) => now - at < TRACK_WINDOW_MS);
  recent.push(now);
  attempts.set(key, recent);

  if (attempts.size > 2000) {
    for (const [entryKey, entryAttempts] of attempts) {
      if (!entryAttempts.some((at) => now - at < TRACK_WINDOW_MS)) attempts.delete(entryKey);
    }
  }

  return recent.length > TRACK_MAX_REQUESTS;
}
