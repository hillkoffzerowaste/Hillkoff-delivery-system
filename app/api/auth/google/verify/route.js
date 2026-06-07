import { getAdminAuth, getAdminDb } from "../../../../../lib/firebaseAdmin";
import { hashOtp, isOtpExpired, normalizePhoneDigits } from "../../../../../lib/otp";

export const runtime = "nodejs";

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
  const deviceId = String(payload?.deviceId || "").trim();
  if (!idToken || !sessionId || !otp) return Response.json({ ok: false, error: "Missing OTP verification data" }, { status: 400 });

  try {
    const decoded = await getAdminAuth().verifyIdToken(idToken, true);
    const db = getAdminDb();
    const otpRef = db.collection("otp_sessions").doc(sessionId);
    const otpSnap = await otpRef.get();
    if (!otpSnap.exists) return Response.json({ ok: false, error: "OTP_NOT_FOUND" }, { status: 404 });
    const session = otpSnap.data() || {};
    if (session.uid !== decoded.uid) return Response.json({ ok: false, error: "OTP_OWNER_MISMATCH" }, { status: 403 });
    if (session.usedAt) return Response.json({ ok: false, error: "OTP_ALREADY_USED" }, { status: 401 });
    if (isOtpExpired(session)) return Response.json({ ok: false, error: "OTP_EXPIRED" }, { status: 401 });
    if (Number(session.attempts || 0) >= 5) return Response.json({ ok: false, error: "OTP_TOO_MANY_ATTEMPTS" }, { status: 429 });

    const expected = hashOtp(otp, session.otpSalt);
    if (expected !== session.otpHash) {
      await otpRef.set({ attempts: Number(session.attempts || 0) + 1, updatedAt: new Date().toISOString() }, { merge: true });
      return Response.json({ ok: false, error: "OTP_INVALID" }, { status: 401 });
    }

    const role = String(session.role || "");
    const phoneDigits = normalizePhoneDigits(session.phoneDigits);
    const profileRef = phoneDigits
      ? db.collection("users_by_phone").doc(phoneDigits)
      : db.collection("users").doc(decoded.uid);
    const existingSnap = await profileRef.get();
    const existing = existingSnap.exists ? existingSnap.data() : {};
    const driverProfile = existing?.driverProfile || null;
    const driverId = role === "driver" ? (existing?.driverId || `driver_${phoneDigits || decoded.uid}`) : null;
    const status = existing?.status || (role === "driver" && !driverProfile ? "pending_profile" : "active");

    const profile = {
      uid: decoded.uid,
      uidLast: decoded.uid,
      email: session.email || decoded.email || "",
      role,
      status,
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

    await profileRef.set(profile, { merge: true });
    await db.collection("users").doc(decoded.uid).set(profile, { merge: true });
    await otpRef.set({ usedAt: new Date().toISOString(), updatedAt: new Date().toISOString() }, { merge: true });
    await db.collection("login_events").add({
      uid: decoded.uid,
      email: profile.email,
      role,
      phone: profile.phone,
      deviceId,
      success: true,
      provider: "google_otp",
      createdAt: new Date().toISOString()
    });

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
    return Response.json({ ok: false, error: e?.message || String(e) }, { status: 401 });
  }
}
