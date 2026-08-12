import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

export const API_KEY_PREFIX = "hk_live_";
export const API_KEY_DISPLAY_LENGTH = 16;
export const API_KEY_PATTERN = /^hk_live_[A-Za-z0-9_-]{40,64}$/;

// Roles an API client may act as. A client carrying every role behaves like a
// full-access integration; a narrower list keeps the key out of routes that the
// partner app has no business calling.
export const API_CLIENT_ROLES = ["admin", "sales", "store", "pack", "driver", "accounting"];

export const API_SCOPES = [
  "orders:read",
  "orders:write",
  "customers:read",
  "customers:write",
  "drivers:read",
  "drivers:write",
  "vehicles:read",
  "vehicles:write",
  "reports:read",
  "reports:write",
  "tracking:read"
];

export const FULL_ACCESS_SCOPE = "*";

export function generateApiKey() {
  return `${API_KEY_PREFIX}${randomBytes(32).toString("base64url")}`;
}

export function hashApiKey(key) {
  return createHash("sha256").update(String(key || ""), "utf8").digest("hex");
}

export function apiKeyPrefix(key) {
  return String(key || "").slice(0, API_KEY_DISPLAY_LENGTH);
}

export function looksLikeApiKey(value) {
  return API_KEY_PATTERN.test(String(value || ""));
}

export function hashesMatch(a, b) {
  const left = Buffer.from(String(a || ""), "utf8");
  const right = Buffer.from(String(b || ""), "utf8");
  if (left.length !== right.length || !left.length) return false;
  return timingSafeEqual(left, right);
}

/**
 * Accepts `x-api-key: hk_live_...`, `Authorization: ApiKey hk_live_...` and
 * `Authorization: Bearer hk_live_...`. Firebase ID tokens never start with the
 * key prefix, so the bearer form cannot collide with user sessions.
 */
export function extractApiKey(request) {
  const direct = String(request?.headers?.get?.("x-api-key") || "").trim();
  if (direct) return looksLikeApiKey(direct) ? direct : "";

  const header = String(request?.headers?.get?.("authorization") || "").trim();
  const [scheme, ...rest] = header.split(/\s+/);
  const value = rest.join(" ").trim();
  if (!value) return "";
  if (!["apikey", "bearer"].includes(scheme.toLowerCase())) return "";
  return looksLikeApiKey(value) ? value : "";
}

export function normalizeScopes(input) {
  const list = Array.isArray(input)
    ? input
    : String(input || "").split(/[\s,]+/);
  const cleaned = list
    .map((item) => String(item || "").trim().toLowerCase())
    .filter(Boolean);
  if (cleaned.includes(FULL_ACCESS_SCOPE)) return [FULL_ACCESS_SCOPE];
  const known = new Set([...API_SCOPES]);
  const wildcards = new Set(API_SCOPES.map((scope) => `${scope.split(":")[0]}:*`));
  return [...new Set(cleaned.filter((item) => known.has(item) || wildcards.has(item)))].sort();
}

export function scopeGranted(granted, required) {
  const want = String(required || "").trim().toLowerCase();
  if (!want) return true;
  const list = Array.isArray(granted) ? granted : [];
  if (list.includes(FULL_ACCESS_SCOPE)) return true;
  if (list.includes(want)) return true;
  const group = want.split(":")[0];
  return list.includes(`${group}:*`);
}

export function missingScopes(granted, required = []) {
  const wanted = Array.isArray(required) ? required : [required];
  return wanted.map((item) => String(item || "").trim().toLowerCase()).filter(Boolean).filter((item) => !scopeGranted(granted, item));
}

export function normalizeRoles(input) {
  const list = Array.isArray(input) ? input : String(input || "").split(/[\s,]+/);
  const cleaned = list.map((item) => String(item || "").trim().toLowerCase()).filter(Boolean);
  if (cleaned.includes("*")) return [...API_CLIENT_ROLES];
  return API_CLIENT_ROLES.filter((role) => cleaned.includes(role));
}

export function normalizeOriginList(input) {
  const list = Array.isArray(input) ? input : String(input || "").split(/[\s,]+/);
  return [...new Set(list
    .map((item) => String(item || "").trim().replace(/\/+$/, ""))
    .filter(Boolean)
    .map((item) => (item === "*" ? "*" : item.toLowerCase())))];
}

export function normalizeIpList(input) {
  const list = Array.isArray(input) ? input : String(input || "").split(/[\s,]+/);
  return [...new Set(list.map((item) => String(item || "").trim()).filter(Boolean))];
}

/** An empty allowlist means "any origin" — the key itself is the credential. */
export function isOriginAllowed(origin, allowlist) {
  const list = Array.isArray(allowlist) ? allowlist : [];
  if (!list.length || list.includes("*")) return true;
  const value = String(origin || "").trim().replace(/\/+$/, "").toLowerCase();
  if (!value) return true;
  return list.includes(value);
}

export function isIpAllowed(ip, allowlist) {
  const list = Array.isArray(allowlist) ? allowlist : [];
  if (!list.length) return true;
  const value = String(ip || "").trim();
  if (!value) return false;
  return list.includes(value);
}

export function requestClientIp(request) {
  const forwarded = String(request?.headers?.get?.("x-forwarded-for") || "").split(",")[0].trim();
  return forwarded || String(request?.headers?.get?.("x-real-ip") || "").trim();
}

export function isExpired(client, now = new Date()) {
  const raw = String(client?.expiresAt || "").trim();
  if (!raw) return false;
  const at = new Date(raw).getTime();
  return Number.isFinite(at) && at <= now.getTime();
}

/**
 * Pure policy check for an already-loaded client record. Returns the HTTP shape
 * the caller should reply with so route code stays free of auth branching.
 */
export function evaluateApiClient(client, { now = new Date(), scopes = [], origin = "", ip = "" } = {}) {
  if (!client) return { ok: false, status: 401, error: "Invalid API key" };
  if (client.active === false || client.revokedAt) return { ok: false, status: 401, error: "API key has been revoked" };
  if (isExpired(client, now)) return { ok: false, status: 401, error: "API key has expired" };
  if (!isOriginAllowed(origin, client.origins)) return { ok: false, status: 403, error: "Origin not allowed for this API key" };
  if (!isIpAllowed(ip, client.ipAllowlist)) return { ok: false, status: 403, error: "IP address not allowed for this API key" };
  const missing = missingScopes(client.scopes, scopes);
  if (missing.length) return { ok: false, status: 403, error: `API key is missing scope: ${missing.join(", ")}` };
  return { ok: true, status: 200, error: "" };
}

export function corsHeaders(origin, client) {
  const allowlist = Array.isArray(client?.origins) ? client.origins : [];
  const value = String(origin || "").trim().replace(/\/+$/, "");
  const allowOrigin = !value
    ? "*"
    : (isOriginAllowed(value, allowlist) ? value : "");
  if (!allowOrigin) return {};
  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Methods": "GET,POST,PATCH,PUT,DELETE,OPTIONS",
    "Access-Control-Allow-Headers": "Authorization,Content-Type,X-Api-Key",
    "Access-Control-Max-Age": "600",
    Vary: "Origin"
  };
}

/** Firestore record minus the secret material, safe to return to the admin UI. */
export function publicApiClient(client) {
  if (!client) return null;
  const { keyHash, ...rest } = client;
  return rest;
}
