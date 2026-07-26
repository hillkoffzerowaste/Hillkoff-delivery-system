import { getAdminAuth, getAdminDb } from "../../../../../lib/firebaseAdmin";
import { hashOtp, isOtpExpired, normalizePhoneDigits, otpHashesEqual } from "../../../../../lib/otp";
import { driverIdentityPatch } from "../../../../../lib/driverIdentity";
import { isAdminEmail } from "../../../../../lib/workflowAuth";

export const runtime = "nodejs";

function httpError(message, status) {
  return Object.assign(new Error(message), { status });
}

export async function POST(request) {
  let payload;
  try {
    payload = await request.json();
  } catch {
    return Response.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  const idToken = String(payload?.idToken || "").trim();
  const sessionId = String(payload?.sessionId || "").trim();
  const otp = String(payload?.otp || "").trim();
  const deviceId = String(payload?.deviceId || "").trim().slice(0, 200);
  if (!idToken || !sessionId || !otp) return Response.json({ ok: false, error: "Missing OTP verification data" }, { status: 400 });
  if (sessionId.length > 200 || sessionId.includes("/")) return Response.json({ ok: false, error: "Invalid OTP session" }, { status: 400 });
  if (!/^\d{6}$/.test(otp)) return Response.json({ ok: false, error: "OTP_INVALID" }, { status: 400 });

  try {
    const decoded = await getAdminAuth().verifyIdToken(idToken, true);
    const db = getAdminDb();
    const otpRef = db.collection("otp_sessions").doc(sessionId);
    const verification = await db.runTransaction(async (transaction) => {
      const otpSnap = await transaction.get(otpRef);
      if (!otpSnap.exists) throw httpError("OTP_NOT_FOUND", 404);
      const session = otpSnap.data() || {};
      if (session.uid !== decoded.uid) throw httpError("OTP_OWNER_MISMATCH", 403);
      if (session.usedAt) throw httpError("OTP_ALREADY_USED", 401);
      if (isOtpExpired(session)) throw httpError("OTP_EXPIRED", 401);
      if (Number(session.attempts || 0) >= 5) throw httpError("OTP_TOO_MANY_ATTEMPTS", 429);
      const decodedEmail = String(decoded.email || "").trim().toLowerCase();
      if (!decodedEmail || decodedEmail !== String(session.email || "").trim().toLowerCase()) {
        throw httpError("OTP_OWNER_MISMATCH", 403);
      }
      const expected = hashOtp(otp, session.otpSalt);
      if (!otpHashesEqual(expected, session.otpHash)) {
        transaction.set(otpRef, {
          attempts: Number(session.attempts || 0) + 1,
          updatedAt: new Date().toISOString()
        }, { merge: true });
        return { ok: false };
      }
      transaction.set(otpRef, { usedAt: new Date().toISOString(), updatedAt: new Date().toISOString() }, { merge: true });
      return { ok: true, session };
    });
    if (!verification.ok) return Response.json({ ok: false, error: "OTP_INVALID" }, { status: 401 });
    const session = verification.session;

    const email = String(decoded.email || "").toLowerCase();
    const role = isAdminEmail(email) ? "admin" : String(session.role || "");
    if (!["sales", "driver", "admin", "accounting"].includes(role)) throw httpError("Invalid role", 403);
    if (role === "driver") throw httpError("DRIVER_GOOGLE_LOGIN_DISABLED", 403);
    const phoneDigits = normalizePhoneDigits(session.phoneDigits);
    const profileRef = phoneDigits
      ? db.collection("users_by_phone").doc(phoneDigits)
      : db.collection("users").doc(decoded.uid);
    const existingSnap = await profileRef.get();
    const existing = existingSnap.exists ? existingSnap.data() : {};
    if (existing?.role && existing.role !== role) throw httpError("ROLE_MISMATCH", 403);
    if (role === "driver" && (!existingSnap.exists || existing.role !== "driver" || existing.active === false || ["disabled", "rejected"].includes(existing.status))) {
      throw httpError("DRIVER_NOT_APPROVED", 403);
    }
    const driverProfile = existing?.driverProfile || null;
    const driverId = role === "driver" ? (existing?.driverId || `driver_${phoneDigits || decoded.uid}`) : null;
    const status = existing?.status || (role === "driver" && !driverProfile ? "pending_profile" : "active");

    const profile = {
      uid: decoded.uid,
      uidLast: decoded.uid,
      email: session.email || decoded.email || "",
      role,
      status,
      active: existing?.active !== false,
      phone: existing?.phone || phoneDigits || "",
      phoneDigits: phoneDigits || existing?.phoneDigits || "",
      name: session.name || existing?.name || decoded.name || session.email || "",
      driverId,
      driverProfile: role === "driver" ? driverProfile : null,
      authProvider: "google",
      lastLoginAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      createdAt: existing?.createdAt || new Date().toISOString()
    };
    if (role === "driver") Object.assign(profile, driverIdentityPatch(existing, decoded.uid));

    const batch = db.batch();
    batch.set(profileRef, profile, { merge: true });
    batch.set(db.collection("users").doc(decoded.uid), profile, { merge: true });
    batch.set(db.collection("login_events").doc(), {
      uid: decoded.uid,
      email: profile.email,
      role,
      phone: profile.phone,
      deviceId,
      success: true,
      provider: "google_otp",
      createdAt: new Date().toISOString()
    });
    await batch.commit();

    return Response.json({
      ok: true,
      data: {
        uid: decoded.uid,
        role,
        email: profile.email,
        phone: profile.phone,
        name: profile.name,
        driverId,
        status,
        driverProfile
      }
    });
  } catch (e) {
    const status = Number.isInteger(e?.status) ? e.status : String(e?.code || "").startsWith("auth/") ? 401 : 500;
    console.error("OTP verification failed", { code: e?.code, status, message: e?.message });
    const message = status >= 500 ? "Unexpected server error" : status === 401 && String(e?.code || "").startsWith("auth/") ? "Invalid or expired authentication token" : (e?.message || "OTP verification failed");
    return Response.json({ ok: false, error: message }, { status });
  }
}
