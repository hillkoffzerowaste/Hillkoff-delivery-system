import { getAdminAuth, getAdminDb } from "../../../../../lib/firebaseAdmin";
import { createOtpSessionPayload, normalizeEmail, normalizePhoneDigits } from "../../../../../lib/otp";
import { sendOtpEmail } from "../../../../../lib/otpEmail";
import { isAdminEmail } from "../../../../../lib/workflowAuth";

export const runtime = "nodejs";

const OTP_MIN_INTERVAL_MS = 60_000;
const OTP_WINDOW_MS = 60 * 60_000;
const OTP_MAX_PER_WINDOW = 8;

function httpError(message, status) {
  return Object.assign(new Error(message), { status });
}

function isAllowed(role, email) {
  if (role === "sales") return email.endsWith("@hillkoff.com");
  if (role === "driver") return true;
  if (role === "admin") return isAdminEmail(email);
  return false;
}

async function requireApprovedDriver(db, phoneDigits) {
  const snap = await db.collection("users_by_phone").doc(phoneDigits).get();
  const profile = snap.exists ? snap.data() || {} : null;
  if (!profile || profile.role !== "driver" || profile.active === false || ["disabled", "rejected"].includes(profile.status)) {
    throw httpError("DRIVER_NOT_APPROVED", 403);
  }
}

async function reserveOtpRequest(db, uid) {
  const ref = db.collection("otp_rate_limits").doc(uid);
  const now = Date.now();
  await db.runTransaction(async (transaction) => {
    const snap = await transaction.get(ref);
    const current = snap.exists ? snap.data() || {} : {};
    const lastRequestAtMs = Number(current.lastRequestAtMs || 0);
    if (lastRequestAtMs && now - lastRequestAtMs < OTP_MIN_INTERVAL_MS) {
      throw httpError("OTP_REQUEST_TOO_SOON", 429);
    }
    const currentWindowStartedAtMs = Number(current.windowStartedAtMs || 0);
    const inCurrentWindow = currentWindowStartedAtMs && now - currentWindowStartedAtMs < OTP_WINDOW_MS;
    const requestCount = inCurrentWindow ? Number(current.requestCount || 0) : 0;
    if (requestCount >= OTP_MAX_PER_WINDOW) throw httpError("OTP_RATE_LIMITED", 429);
    transaction.set(ref, {
      lastRequestAtMs: now,
      windowStartedAtMs: inCurrentWindow ? currentWindowStartedAtMs : now,
      requestCount: requestCount + 1,
      updatedAt: new Date(now).toISOString()
    }, { merge: true });
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
  const phoneDigits = normalizePhoneDigits(payload?.phone);
  const name = String(payload?.name || "").trim().slice(0, 160);
  if (!idToken) return Response.json({ ok: false, error: "Missing idToken" }, { status: 400 });
  if (!["sales", "driver", "admin"].includes(role)) return Response.json({ ok: false, error: "Invalid role" }, { status: 400 });
  if (role === "driver") return Response.json({ ok: false, error: "DRIVER_GOOGLE_LOGIN_DISABLED" }, { status: 403 });
  if (role === "driver" && (phoneDigits.length < 9 || phoneDigits.length > 15)) {
    return Response.json({ ok: false, error: "Invalid driver phone" }, { status: 400 });
  }

  try {
    const decoded = await getAdminAuth().verifyIdToken(idToken, true);
    const email = normalizeEmail(decoded.email);
    if (!email) return Response.json({ ok: false, error: "Google account has no email" }, { status: 400 });
    if (!isAllowed(role, email)) return Response.json({ ok: false, error: "Email is not allowed for this role" }, { status: 403 });

    const db = getAdminDb();
    if (role === "driver") await requireApprovedDriver(db, phoneDigits);
    await reserveOtpRequest(db, decoded.uid);
    const { code, session } = createOtpSessionPayload({
      uid: decoded.uid,
      email,
      role,
      phoneDigits,
      name: name || decoded.name || email
    });
    const ref = await db.collection("otp_sessions").add({
      ...session,
      delivery: "pending",
      updatedAt: new Date().toISOString()
    });

    const emailResult = await sendOtpEmail({ to: email, code, expiresAt: session.expiresAt }).catch((e) => ({
      ok: false,
      error: e?.message || String(e)
    }));

    const allowDevOtp = process.env.NODE_ENV !== "production" && process.env.OTP_DEV_MODE === "true";
    if (!emailResult?.ok && !allowDevOtp) {
      await ref.set({ delivery: "failed", deliveryError: String(emailResult?.error || emailResult?.reason || "Email delivery failed").slice(0, 500) }, { merge: true });
      throw httpError("OTP_EMAIL_DELIVERY_FAILED", 503);
    }

    const delivery = emailResult?.ok ? "email" : "development";
    await ref.set({ delivery, updatedAt: new Date().toISOString() }, { merge: true });
    await db.collection("audit_logs").add({
      action: "otp_requested",
      uid: decoded.uid,
      email,
      role,
      delivery,
      emailResult: {
        ok: Boolean(emailResult?.ok),
        skipped: Boolean(emailResult?.skipped),
        error: emailResult?.error || "",
        reason: emailResult?.reason || ""
      },
      createdAt: new Date().toISOString()
    });

    return Response.json({
      ok: true,
      data: {
        sessionId: ref.id,
        expiresAt: session.expiresAt,
        delivery,
        devOtp: allowDevOtp ? code : undefined
      }
    });
  } catch (e) {
    const status = Number.isInteger(e?.status) ? e.status : String(e?.code || "").startsWith("auth/") ? 401 : 500;
    console.error("OTP start failed", { code: e?.code, status, message: e?.message });
    const message = status >= 500 ? "Unexpected server error" : status === 401 ? "Invalid or expired authentication token" : (e?.message || "OTP request failed");
    return Response.json({ ok: false, error: message }, { status });
  }
}
