import crypto from "node:crypto";
import { FieldValue } from "firebase-admin/firestore";
import { getAdminAuth, getAdminDb } from "../../../../lib/firebaseAdmin";
import { driverIdentityPatch } from "../../../../lib/driverIdentity";

export const runtime = "nodejs";

const PASSWORD_PATTERN = /^.{4,72}$/s;
const MAX_FAILED_ATTEMPTS = 5;
const FAILURE_WINDOW_MS = 15 * 60_000;
const LOCKOUT_MS = 15 * 60_000;

function normalizePhoneDigits(raw) {
  return String(raw || "").replace(/\D/g, "");
}

function legacyPasswordHash(password, salt) {
  return crypto.createHash("sha256").update(`${salt}:${password}`, "utf8").digest("hex");
}

function scryptPasswordHash(password, salt) {
  return crypto.scryptSync(password, salt, 32).toString("hex");
}

function safeHexEqual(left, right) {
  const a = Buffer.from(String(left || ""), "hex");
  const b = Buffer.from(String(right || ""), "hex");
  return a.length > 0 && a.length === b.length && crypto.timingSafeEqual(a, b);
}

function passwordMatches(profile, password) {
  const salt = String(profile?.passwordSalt || profile?.pinSalt || "");
  const expected = String(profile?.passwordHash || profile?.pinHash || "");
  if (!salt || !expected) return false;
  const version = profile?.passwordHashVersion || profile?.pinHashVersion;
  const actual = version === "scrypt-v1"
    ? scryptPasswordHash(password, salt)
    : legacyPasswordHash(password, salt);
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
    authProvider: "password",
    updatedAt: profile.updatedAt,
    createdAt: profile.createdAt
  };
}

async function getLoginLimit(db, phone) {
  const snap = await db.collection("login_rate_limits").doc(phone).get();
  const data = snap.exists ? snap.data() || {} : {};
  return Number(data.lockedUntilMs || 0);
}

async function recordPasswordFailure(db, phone) {
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
  const phoneRaw = String(payload?.username || payload?.phone || "").trim().slice(0, 40);
  const phone = normalizePhoneDigits(phoneRaw);
  const password = String(payload?.password || "").trim();
  const rawDeviceId = String(payload?.deviceId || "").trim();
  const deviceId = rawDeviceId.length >= 20 && rawDeviceId.length <= 200 ? rawDeviceId : "";
  const rememberDevice = payload?.rememberDevice === true;

  if (!idToken) return Response.json({ ok: false, error: "Missing idToken" }, { status: 400 });
  if (role !== "driver") return Response.json({ ok: false, error: "PASSWORD_LOGIN_NOT_ALLOWED_FOR_ROLE" }, { status: 403 });
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

    const hasPassword = Boolean((existing.passwordHash || existing.pinHash) && (existing.passwordSalt || existing.pinSalt));
    if (!hasPassword) return Response.json({ ok: false, error: "PASSWORD_NOT_SET" }, { status: 401 });
    if (!PASSWORD_PATTERN.test(password)) return Response.json({ ok: false, error: "INVALID_PASSWORD" }, { status: 401 });

    const deviceHash = deviceId ? hashDeviceId(deviceId) : "";
    const trustedDeviceHashes = Array.isArray(existing.trustedDeviceHashes)
      ? existing.trustedDeviceHashes.map(String).filter(Boolean).slice(-8)
      : [];

    // ต้องเช็ค lockout ก่อนตรวจรหัสผ่าน ไม่ใช่เช็คแค่ตอนรหัสผิด: ถ้าเช็คทีหลัง รหัสที่ถูกจะ
    // ผ่านได้ทั้งที่ล็อกอยู่ และช่วงที่ล็อกจะกลายเป็นช่องให้เดารหัสฟรีไม่จำกัด เพราะรหัสผิด
    // ตอนล็อกคืน 429 โดยไม่นับ attempt เพิ่ม จึงเดาได้เร็วเท่าไหร่ก็ได้จนเจอรหัสที่ถูก
    const lockedUntilMs = await getLoginLimit(db, phone);
    if (lockedUntilMs > Date.now()) {
      return Response.json({ ok: false, error: "TOO_MANY_LOGIN_ATTEMPTS", retryAt: new Date(lockedUntilMs).toISOString() }, { status: 429 });
    }

    if (!passwordMatches(existing, password)) {
      const nextLockedUntilMs = await recordPasswordFailure(db, phone);
      return Response.json({
        ok: false,
        error: nextLockedUntilMs ? "TOO_MANY_LOGIN_ATTEMPTS" : "INVALID_PASSWORD",
        ...(nextLockedUntilMs ? { retryAt: new Date(nextLockedUntilMs).toISOString() } : {})
      }, { status: nextLockedUntilMs ? 429 : 401 });
    }

    const now = new Date().toISOString();
    const passwordSalt = String(existing.passwordSalt || existing.pinSalt || crypto.randomBytes(16).toString("hex"));
    const currentVersion = existing.passwordHashVersion || existing.pinHashVersion;
    const shouldUpgradePassword = currentVersion !== "scrypt-v1";
    const passwordHash = shouldUpgradePassword
      ? scryptPasswordHash(password, passwordSalt)
      : (existing.passwordHash || existing.pinHash);
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
      passwordSalt,
      passwordHash,
      passwordHashVersion: shouldUpgradePassword ? "scrypt-v1" : currentVersion,
      pinSalt: FieldValue.delete(),
      pinHash: FieldValue.delete(),
      pinHashVersion: FieldValue.delete(),
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
      provider: "password",
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
    console.error("Password login failed", { code: error?.code, message: error?.message });
    return Response.json({ ok: false, error: status === 401 ? "Invalid or expired authentication token" : "Unexpected server error" }, { status });
  }
}
