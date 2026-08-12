import { getAdminAuth, getAdminDb } from "./firebaseAdmin";
import { extractApiKey } from "./apiClients";
import { apiClientProfile, authenticateApiKey } from "./apiClientStore";

export const ADMIN_EMAIL = "online_marketing@hillkoff.com";

export const API_V1_PREFIX = "/api/v1/";

/**
 * API keys are only honoured under the versioned integration namespace. Routes
 * that the in-house UI calls keep requiring a Firebase ID token, so issuing a
 * key can never widen access beyond the documented `/api/v1` contract.
 */
export function isApiV1Request(request) {
  try {
    const { pathname } = new URL(request.url);
    return pathname === "/api/v1" || pathname.startsWith(API_V1_PREFIX);
  } catch {
    return false;
  }
}

export function isAdminEmail(value) {
  const email = String(value || "").trim().toLowerCase();
  if (!email) return false;
  const allowlist = String(process.env.ADMIN_EMAIL_ALLOWLIST || "")
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
  return email === ADMIN_EMAIL || allowlist.includes(email);
}

export function isHillkoffEmail(value) {
  return String(value || "").trim().toLowerCase().endsWith("@hillkoff.com");
}

export function isApprovedAccountingEmail(value) {
  const email = String(value || "").trim().toLowerCase();
  if (!isHillkoffEmail(email)) return false;
  const allowlist = String(process.env.ACCOUNTING_EMAIL_ALLOWLIST || "")
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
  return allowlist.includes(email);
}

export async function requireProfile(request, allowedRoles = []) {
  if (extractApiKey(request)) {
    if (!isApiV1Request(request)) {
      throw Object.assign(new Error("API keys are only accepted on /api/v1 endpoints"), { status: 401 });
    }
    const { client, db } = await authenticateApiKey(request);
    const profile = apiClientProfile(client, allowedRoles);
    return { profile, db, decoded: { uid: profile.uid, email: profile.email, apiClientId: client.id } };
  }

  const header = String(request.headers.get("authorization") || "");
  const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  if (!token) throw Object.assign(new Error("Missing authorization token"), { status: 401 });

  let decoded;
  try {
    decoded = await getAdminAuth().verifyIdToken(token, true);
  } catch (error) {
    throw Object.assign(new Error("Invalid or expired authorization token"), { status: 401, cause: error });
  }
  const db = getAdminDb();
  const snap = await db.collection("users").doc(decoded.uid).get();
  let data = snap.exists ? snap.data() : {};
  if (!snap.exists) {
    const legacy = await db.collection("users_by_phone").where("uidLast", "==", decoded.uid).limit(1).get();
    if (!legacy.empty) data = legacy.docs[0].data() || {};
  }
  const email = String(decoded.email || data.email || "").toLowerCase();
  const role = isAdminEmail(email) ? "admin" : String(data.role || "");
  const profile = {
    uid: decoded.uid,
    email,
    role,
    name: data.name || decoded.name || "",
    phone: data.phone || "",
    phoneDigits: data.phoneDigits || "",
    driverId: data.driverId || "",
    active: data.active !== false && !["disabled", "rejected"].includes(String(data.status || ""))
  };
  if (!role) throw Object.assign(new Error("Profile not found"), { status: 403 });
  if (profile.phoneDigits && ["driver", "sales"].includes(role)) {
    const canonical = await db.collection("users_by_phone").doc(String(profile.phoneDigits)).get();
    const canonicalData = canonical.exists ? canonical.data() || {} : {};
    const isCurrentUid = String(canonicalData.uidLast || canonicalData.uid || "") === decoded.uid;
    const isKnownDriverUid = role === "driver"
      && Array.isArray(canonicalData.legacyUids)
      && canonicalData.legacyUids.map(String).includes(decoded.uid);
    if (!canonical.exists || (!isCurrentUid && !isKnownDriverUid)) {
      throw Object.assign(new Error("Session has been replaced by a newer login"), { status: 401 });
    }
  }
  if (!profile.active) throw Object.assign(new Error("Account disabled"), { status: 403 });
  if (allowedRoles.length && !allowedRoles.includes(role)) throw Object.assign(new Error("Forbidden"), { status: 403 });
  return { profile, db, decoded };
}

function getHttpErrorStatus(error) {
  const status = Number(error?.status);
  return Number.isInteger(status) && status >= 400 && status <= 599 ? status : 500;
}

export function errorResponse(error) {
  const status = getHttpErrorStatus(error);
  const detail = String(error?.message || "Unexpected server error").trim() || "Unexpected server error";
  const message = status >= 500 ? "Unexpected server error" : detail;
  console.error("API request failed", { name: error?.name, code: error?.code, status, message: detail });
  return Response.json({ ok: false, error: message }, { status });
}
