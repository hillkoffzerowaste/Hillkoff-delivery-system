import crypto from "node:crypto";
import { getAdminAuth, getAdminDb } from "../../../../lib/firebaseAdmin";
import { driverIdentityPatch } from "../../../../lib/driverIdentity";

export const runtime = "nodejs";

const PIN_PATTERN = /^\d{4,8}$/;
const MAX_FAILED_ATTEMPTS = 5;
const FAILURE_WINDOW_MS = 15 * 60_000;
const LOCKOUT_MS = 15 * 60_000;

function normalizePhoneDigits(raw) {
  return String(raw || "").replace(/\D/g, "");
}

function legacyPinHash(pin, salt) {
  return crypto.createHash("sha256").update(`${salt}:${pin}`, "utf8").digest("hex");
}

function scryptPinHash(pin, salt) {
  return crypto.scryptSync(pin, salt, 32).toString("hex");
}

function safeHexEqual(left, right) {
  const a = Buffer.from(String(left || ""), "hex");
  const b = Buffer.from(String(right || ""), "hex");
  return a.length > 0 && a.length === b.length && crypto.timingSafeEqual(a, b);
}

function pinMatches(profile, pin) {
  const salt = String(profile?.pinSalt || "");
  const expected = String(profile?.pinHash || "");
  if (!salt || !expected) return false;
  const actual = profile?.pinHashVersion === "scrypt-v1"
    ? scryptPinHash(pin, salt)
    : legacyPinHash(pin, salt);
  return safeHexEqual(actual, expected);
}

function hashDeviceId(deviceId) {
  const secret = String(process.env.OTP_SECRET || "").trim();
  if (secret.length < 32) throw new Error("OTP_SECRET must be at least 32 characters");
  return crypto.createHmac("sha256", secret).update(deviceId, "utf8").digest("hex");
}

function publicProfile(profile) {
  return {
    uid: profile.uid,
    uidLast: profile.uidLast,
    role: profile.role,
    phone: profile.phone,
    phoneDigits: profile.phoneDigits,
    name: profile.name,
    driverId: profile.driverId,
    driverProfile: profile.driverProfile || null,
    status: profile.status || "active",
    active: profile.active !== false,
    authProvider: "pin",
    updatedAt: profile.updatedAt,
    createdAt: profile.createdAt
  };
}

async function getLoginLimit(db, phone) {
  const snap = await db.collection("login_rate_limits").doc(phone).get();
  const data = snap.exists ? snap.data() || {} : {};
  return Number(data.lockedUntilMs || 0);
}

async function recordPinFailure(db, phone) {
  const ref = db.collection("login_rate_limits").doc(phone);
  const now = Date.now();
  return db.runTransaction(async (transaction) => {
    const snap = await transaction.get(ref);
    const current = snap.exists ? snap.data() || {} : {};
    const windowStartedAtMs = Number(current.windowStartedAtMs || 0);
    const inWindow = windowStartedAtMs && now - windowStartedAtMs < FAILURE_WINDOW_MS;
    const failedAttempts = (inWindow ? Number(current.failedAttempts || 0) : 0) + 1;
    const lockedUntilMs = failedAttempts >= MAX_FAILED_ATTEMPTS ? now + LOCKOUT_MS : 0;
    transaction.set(ref, {
      failedAttempts,
      windowStartedAtMs: inWindow ? windowStartedAtMs : now,
      lockedUntilMs,
      updatedAt: new Date(now).toISOString()
    }, { merge: true });
    return lockedUntilMs;
  });
}

export async function POST(request) {
  let payload;
  try {
    payload = await request.json();
  } catch {
    return Response.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  const idToken = String(payload?.idToken || "").trim();
  const role = String(payload?.role || "").trim();
  const phoneRaw = String(payload?.phone || "").trim().slice(0, 40);
  const phone = normalizePhoneDigits(phoneRaw);
  const pin = String(payload?.pin || "").trim();
  const setPin = payload?.setPin === true;
  const rawDeviceId = String(payload?.deviceId || "").trim();
  const deviceId = rawDeviceId.length >= 20 && rawDeviceId.length <= 200 ? rawDeviceId : "";
  const rememberDevice = payload?.rememberDevice === true;

  if (!idToken) return Response.json({ ok: false, error: "Missing idToken" }, { status: 400 });
  if (!["driver", "sales"].includes(role)) return Response.json({ ok: false, error: "Invalid role" }, { status: 400 });
  if (phone.length < 9 || phone.length > 15) return Response.json({ ok: false, error: "Invalid phone" }, { status: 400 });

  try {
    const decoded = await getAdminAuth().verifyIdToken(idToken, true);
    const db = getAdminDb();
    const userRef = db.collection("users_by_phone").doc(phone);
    const existingSnap = await userRef.get();
    if (!existingSnap.exists) return Response.json({ ok: false, error: "ACCOUNT_NOT_APPROVED" }, { status: 403 });

    const existing = existingSnap.data() || {};
    if (existing.role !== role) return Response.json({ ok: false, error: "ROLE_MISMATCH" }, { status: 403 });
    if (existing.active === false || ["disabled", "rejected"].includes(existing.status)) {
      return Response.json({ ok: false, error: "ACCOUNT_DISABLED" }, { status: 403 });
    }

    const hasPin = Boolean(existing.pinHash && existing.pinSalt);
    if (setPin && hasPin) return Response.json({ ok: false, error: "PIN_ALREADY_SET" }, { status: 403 });
    if (!hasPin && !setPin) return Response.json({ ok: false, error: "PIN_NOT_SET" }, { status: 401 });
    if (setPin && !PIN_PATTERN.test(pin)) return Response.json({ ok: false, error: "PIN_INVALID_FORMAT" }, { status: 400 });

    const deviceHash = deviceId ? hashDeviceId(deviceId) : "";
    const trustedDeviceHashes = Array.isArray(existing.trustedDeviceHashes)
      ? existing.trustedDeviceHashes.map(String).filter(Boolean).slice(-8)
      : [];
    const isDeviceTrusted = Boolean(deviceHash && trustedDeviceHashes.includes(deviceHash));

    if (!isDeviceTrusted) {
      const lockedUntilMs = await getLoginLimit(db, phone);
      if (lockedUntilMs > Date.now()) {
        return Response.json({ ok: false, error: "PIN_TOO_MANY_ATTEMPTS", retryAt: new Date(lockedUntilMs).toISOString() }, { status: 429 });
      }
      if (!setPin && !PIN_PATTERN.test(pin)) {
        return Response.json({ ok: false, error: "PIN_INVALID_FORMAT" }, { status: 400 });
      }
      if (!setPin && !pinMatches(existing, pin)) {
        const nextLockedUntilMs = await recordPinFailure(db, phone);
        return Response.json({
          ok: false,
          error: nextLockedUntilMs ? "PIN_TOO_MANY_ATTEMPTS" : "INVALID_PIN",
          ...(nextLockedUntilMs ? { retryAt: new Date(nextLockedUntilMs).toISOString() } : {})
        }, { status: nextLockedUntilMs ? 429 : 401 });
      }
    }

    const now = new Date().toISOString();
    const pinSalt = setPin ? crypto.randomBytes(16).toString("hex") : String(existing.pinSalt || "");
    const shouldUpgradePin = !setPin && !isDeviceTrusted && existing.pinHashVersion !== "scrypt-v1";
    const pinHash = setPin || shouldUpgradePin ? scryptPinHash(pin, pinSalt) : existing.pinHash;
    const nextDeviceHashes = new Set(trustedDeviceHashes);
    if (rememberDevice && deviceHash) nextDeviceHashes.add(deviceHash);

    const next = {
      ...existing,
      uid: decoded.uid,
      uidLast: decoded.uid,
      role,
      phone: existing.phone || phoneRaw || phone,
      phoneDigits: phone,
      name: existing.name || String(payload?.name || "").trim().slice(0, 160) || null,
      driverId: role === "driver" ? (existing.driverId || `driver_${phone}`) : null,
      pinSalt,
      pinHash,
      pinHashVersion: setPin || shouldUpgradePin ? "scrypt-v1" : existing.pinHashVersion || "sha256-v1",
      trustedDevices: [],
      trustedDeviceHashes: Array.from(nextDeviceHashes).slice(-8),
      driverProfile: role === "driver" ? existing.driverProfile || null : null,
      active: existing.active !== false,
      status: existing.status || "active",
      updatedAt: now,
      lastLoginAt: now,
      createdAt: existing.createdAt || now
    };
    if (role === "driver") Object.assign(next, driverIdentityPatch(existing, decoded.uid));

    const batch = db.batch();
    batch.set(userRef, next, { merge: true });
    batch.set(db.collection("users").doc(decoded.uid), publicProfile(next), { merge: true });
    batch.delete(db.collection("login_rate_limits").doc(phone));
    batch.set(db.collection("login_events").doc(), {
      uid: decoded.uid,
      role,
      phone: next.phone,
      success: true,
      provider: "pin",
      createdAt: now
    });
    await batch.commit();

    return Response.json({
      ok: true,
      data: {
        uid: decoded.uid,
        role,
        phone: next.phone,
        name: next.name,
        driverId: next.driverId,
        driverProfile: next.driverProfile || null
      }
    });
  } catch (error) {
    const status = String(error?.code || "").startsWith("auth/") ? 401 : 500;
    console.error("PIN login failed", { code: error?.code, message: error?.message });
    return Response.json({ ok: false, error: status === 401 ? "Invalid or expired authentication token" : "Unexpected server error" }, { status });
  }
}
