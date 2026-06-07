import { getAdminAuth, getAdminDb } from "../../../../../lib/firebaseAdmin";
import { createOtpSessionPayload, normalizeEmail, normalizePhoneDigits } from "../../../../../lib/otp";
import { sendOtpEmail } from "../../../../../lib/otpEmail";

export const runtime = "nodejs";

function isAllowed(role, email) {
  if (role === "sales") return email.endsWith("@hillkoff.com");
  if (role === "driver") return true;
  if (role === "admin") {
    const allowlist = String(process.env.ADMIN_EMAIL_ALLOWLIST || "")
      .split(",")
      .map((v) => normalizeEmail(v))
      .filter(Boolean);
    return allowlist.includes(email);
  }
  return false;
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
  const name = String(payload?.name || "").trim();
  if (!idToken) return Response.json({ ok: false, error: "Missing idToken" }, { status: 400 });
  if (!["sales", "driver", "admin"].includes(role)) return Response.json({ ok: false, error: "Invalid role" }, { status: 400 });
  if (role === "driver" && !phoneDigits) return Response.json({ ok: false, error: "Missing driver phone" }, { status: 400 });

  try {
    const decoded = await getAdminAuth().verifyIdToken(idToken, true);
    const email = normalizeEmail(decoded.email);
    if (!email) return Response.json({ ok: false, error: "Google account has no email" }, { status: 400 });
    if (!isAllowed(role, email)) return Response.json({ ok: false, error: "Email is not allowed for this role" }, { status: 403 });

    const db = getAdminDb();
    const { code, session } = createOtpSessionPayload({
      uid: decoded.uid,
      email,
      role,
      phoneDigits,
      name: name || decoded.name || email
    });
    const ref = await db.collection("otp_sessions").add({
      ...session,
      delivery: "manual",
      updatedAt: new Date().toISOString()
    });

    const emailResult = await sendOtpEmail({ to: email, code, expiresAt: session.expiresAt }).catch((e) => ({
      ok: false,
      error: e?.message || String(e)
    }));

    await db.collection("audit_logs").add({
      action: "otp_requested",
      uid: decoded.uid,
      email,
      role,
      delivery: emailResult?.ok ? "email" : "manual",
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
        delivery: emailResult?.ok ? "email" : "manual",
        devOtp: process.env.OTP_DEV_MODE === "true" ? code : undefined
      }
    });
  } catch (e) {
    return Response.json({ ok: false, error: e?.message || String(e) }, { status: 401 });
  }
}
