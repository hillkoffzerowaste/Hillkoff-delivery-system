import { getAdminDb } from "./firebaseAdmin";
import {
  apiKeyPrefix,
  evaluateApiClient,
  extractApiKey,
  generateApiKey,
  hashApiKey,
  hashesMatch,
  normalizeIpList,
  normalizeOriginList,
  normalizeRoles,
  normalizeScopes,
  publicApiClient,
  requestClientIp
} from "./apiClients";

export const API_CLIENTS_COLLECTION = "api_clients";

const USAGE_WRITE_INTERVAL_MS = 60_000;
const RATE_WINDOW_MS = 60_000;
const DEFAULT_RATE_LIMIT_PER_MINUTE = 600;

const usageWrites = globalThis.__hillkoffApiUsageWrites || new Map();
globalThis.__hillkoffApiUsageWrites = usageWrites;

const rateCounters = globalThis.__hillkoffApiRateCounters || new Map();
globalThis.__hillkoffApiRateCounters = rateCounters;

// One Firestore lookup per request even when both the v1 wrapper and the
// wrapped handler resolve the caller.
const requestClients = new WeakMap();

function httpError(message, status) {
  return Object.assign(new Error(message), { status });
}

function clean(value, max = 200) {
  return String(value || "").trim().slice(0, max);
}

function isoOrEmpty(value) {
  const raw = clean(value, 40);
  if (!raw) return "";
  const at = new Date(raw);
  return Number.isFinite(at.getTime()) ? at.toISOString() : "";
}

function finiteRateLimit(value) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) return DEFAULT_RATE_LIMIT_PER_MINUTE;
  return Math.min(60_000, Math.trunc(number));
}

export async function findApiClientByKey(db, key) {
  const keyHash = hashApiKey(key);
  const snap = await db.collection(API_CLIENTS_COLLECTION).where("keyHash", "==", keyHash).limit(1).get();
  if (snap.empty) return null;
  const doc = snap.docs[0];
  const data = { id: doc.id, ...(doc.data() || {}) };
  // Defence in depth: the equality query already matched, but never trust a
  // single comparison path for credential material.
  return hashesMatch(data.keyHash, keyHash) ? data : null;
}

function isRateLimited(client) {
  const limit = finiteRateLimit(client.rateLimitPerMinute);
  if (!limit) return false;
  const now = Date.now();
  const recent = (rateCounters.get(client.id) || []).filter((at) => now - at < RATE_WINDOW_MS);
  recent.push(now);
  rateCounters.set(client.id, recent);
  if (rateCounters.size > 1000) {
    for (const [key, hits] of rateCounters) {
      if (!hits.some((at) => now - at < RATE_WINDOW_MS)) rateCounters.delete(key);
    }
  }
  return recent.length > limit;
}

export function recordApiClientUsage(db, client, ip) {
  const last = usageWrites.get(client.id) || 0;
  const now = Date.now();
  if (now - last < USAGE_WRITE_INTERVAL_MS) return;
  usageWrites.set(client.id, now);
  db.collection(API_CLIENTS_COLLECTION).doc(client.id).set({
    lastUsedAt: new Date(now).toISOString(),
    lastUsedIp: clean(ip, 64)
  }, { merge: true }).catch((error) => {
    console.warn("API client usage write failed", { clientId: client.id, message: error?.message });
  });
}

/**
 * Resolves the API key on a request into an active client record.
 * Throws an error carrying `status` when the key is absent or rejected.
 */
export async function authenticateApiKey(request, requiredScopes = []) {
  const key = extractApiKey(request);
  if (!key) throw httpError("Missing API key", 401);

  const db = getAdminDb();
  const cached = requestClients.get(request);
  const client = cached && cached.key === key ? cached.client : await findApiClientByKey(db, key);
  if (!cached || cached.key !== key) requestClients.set(request, { key, client });

  const ip = requestClientIp(request);
  const verdict = evaluateApiClient(client, {
    scopes: requiredScopes,
    origin: request.headers.get("origin") || "",
    ip
  });
  if (!verdict.ok) throw httpError(verdict.error, verdict.status);
  if (isRateLimited(client)) throw httpError("API rate limit exceeded", 429);

  recordApiClientUsage(db, client, ip);
  return { client, db };
}

export function apiClientProfile(client, allowedRoles = []) {
  const roles = normalizeRoles(client.roles);
  const role = allowedRoles.length ? roles.find((item) => allowedRoles.includes(item)) : roles[0];
  if (!role) throw httpError("Forbidden", 403);
  return {
    uid: `api_client:${client.id}`,
    email: clean(client.contactEmail || "", 200).toLowerCase(),
    role,
    name: clean(client.name, 200) || `API client ${client.id}`,
    phone: "",
    phoneDigits: "",
    driverId: "",
    active: true,
    apiClientId: client.id,
    apiClientScopes: Array.isArray(client.scopes) ? client.scopes : [],
    isApiClient: true
  };
}

export async function listApiClients(db, limit = 200) {
  const snap = await db.collection(API_CLIENTS_COLLECTION).orderBy("createdAt", "desc").limit(limit).get();
  return snap.docs.map((doc) => publicApiClient({ id: doc.id, ...(doc.data() || {}) }));
}

export async function createApiClient(db, input, actor) {
  const name = clean(input?.name, 120);
  if (name.length < 2) throw httpError("Client name must be at least 2 characters", 400);
  const scopes = normalizeScopes(input?.scopes ?? ["*"]);
  if (!scopes.length) throw httpError("At least one valid scope is required", 400);
  const roles = normalizeRoles(input?.roles ?? "*");
  if (!roles.length) throw httpError("At least one valid role is required", 400);

  const key = generateApiKey();
  const now = new Date().toISOString();
  const record = {
    name,
    description: clean(input?.description, 500),
    contactEmail: clean(input?.contactEmail, 200).toLowerCase(),
    keyHash: hashApiKey(key),
    keyPrefix: apiKeyPrefix(key),
    scopes,
    roles,
    origins: normalizeOriginList(input?.origins),
    ipAllowlist: normalizeIpList(input?.ipAllowlist),
    rateLimitPerMinute: finiteRateLimit(input?.rateLimitPerMinute),
    expiresAt: isoOrEmpty(input?.expiresAt),
    active: true,
    revokedAt: "",
    lastUsedAt: "",
    lastUsedIp: "",
    createdAt: now,
    createdBy: clean(actor?.email || actor?.uid, 200),
    updatedAt: now,
    updatedBy: clean(actor?.email || actor?.uid, 200)
  };
  const ref = await db.collection(API_CLIENTS_COLLECTION).add(record);
  await db.collection("audit_logs").add({
    action: "api_client_created",
    targetId: ref.id,
    uid: actor?.uid || "",
    createdAt: now
  });
  // The plaintext key is returned exactly once and never stored.
  return { client: publicApiClient({ id: ref.id, ...record }), key };
}

export async function updateApiClient(db, id, patch, actor) {
  const clientId = clean(id, 120);
  if (!clientId) throw httpError("Missing client id", 400);
  const ref = db.collection(API_CLIENTS_COLLECTION).doc(clientId);
  const snap = await ref.get();
  if (!snap.exists) throw httpError("API client not found", 404);

  const now = new Date().toISOString();
  const next = { updatedAt: now, updatedBy: clean(actor?.email || actor?.uid, 200) };
  if (patch?.name !== undefined) next.name = clean(patch.name, 120);
  if (patch?.description !== undefined) next.description = clean(patch.description, 500);
  if (patch?.contactEmail !== undefined) next.contactEmail = clean(patch.contactEmail, 200).toLowerCase();
  if (patch?.scopes !== undefined) next.scopes = normalizeScopes(patch.scopes);
  if (patch?.roles !== undefined) next.roles = normalizeRoles(patch.roles);
  if (patch?.origins !== undefined) next.origins = normalizeOriginList(patch.origins);
  if (patch?.ipAllowlist !== undefined) next.ipAllowlist = normalizeIpList(patch.ipAllowlist);
  if (patch?.rateLimitPerMinute !== undefined) next.rateLimitPerMinute = finiteRateLimit(patch.rateLimitPerMinute);
  if (patch?.expiresAt !== undefined) next.expiresAt = isoOrEmpty(patch.expiresAt);
  if (patch?.active !== undefined) {
    next.active = patch.active !== false;
    next.revokedAt = next.active ? "" : now;
  }
  if (next.scopes && !next.scopes.length) throw httpError("At least one valid scope is required", 400);
  if (next.roles && !next.roles.length) throw httpError("At least one valid role is required", 400);

  await ref.set(next, { merge: true });
  await db.collection("audit_logs").add({
    action: next.active === false ? "api_client_revoked" : "api_client_updated",
    targetId: clientId,
    uid: actor?.uid || "",
    createdAt: now
  });
  const updated = await ref.get();
  return publicApiClient({ id: clientId, ...(updated.data() || {}) });
}

export async function rotateApiClientKey(db, id, actor) {
  const clientId = clean(id, 120);
  if (!clientId) throw httpError("Missing client id", 400);
  const ref = db.collection(API_CLIENTS_COLLECTION).doc(clientId);
  const snap = await ref.get();
  if (!snap.exists) throw httpError("API client not found", 404);

  const key = generateApiKey();
  const now = new Date().toISOString();
  await ref.set({
    keyHash: hashApiKey(key),
    keyPrefix: apiKeyPrefix(key),
    active: true,
    revokedAt: "",
    rotatedAt: now,
    updatedAt: now,
    updatedBy: clean(actor?.email || actor?.uid, 200)
  }, { merge: true });
  await db.collection("audit_logs").add({
    action: "api_client_key_rotated",
    targetId: clientId,
    uid: actor?.uid || "",
    createdAt: now
  });
  const updated = await ref.get();
  return { client: publicApiClient({ id: clientId, ...(updated.data() || {}) }), key };
}
