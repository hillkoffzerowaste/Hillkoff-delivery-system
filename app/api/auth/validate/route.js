import { getAdminAuth, getAdminDb } from "../../../../lib/firebaseAdmin";
import { isAdminEmail } from "../../../../lib/workflowAuth";

export const runtime = "nodejs";

export async function POST(request) {
  let payload;
  try {
    payload = await request.json();
  } catch {
    return Response.json({ ok: false, valid: false, error: "Invalid JSON" }, { status: 400 });
  }

  const idToken = String(payload?.idToken || "").trim();
  if (!idToken) return Response.json({ ok: true, valid: false }, { status: 200 });

  try {
    const adminAuth = getAdminAuth();
    const decoded = await adminAuth.verifyIdToken(idToken, true);
    const db = getAdminDb();
    const snap = await db.collection("users").doc(decoded.uid).get();
    let profile = snap.exists ? snap.data() : null;
    if (!profile) {
      const legacy = await db.collection("users_by_phone").where("uidLast", "==", decoded.uid).limit(1).get();
      profile = legacy.docs[0]?.data() || null;
    }
    const email = String(decoded.email || profile?.email || "").toLowerCase();
    const role = isAdminEmail(email) ? "admin" : profile?.role || null;
    if (!profile || !["admin", "sales", "driver", "store", "pack"].includes(role)) {
      return Response.json({ ok: true, valid: false, error: "PROFILE_NOT_FOUND" }, { status: 200 });
    }
    if (profile.active === false || ["disabled", "rejected"].includes(profile.status)) {
      return Response.json({ ok: true, valid: false, error: "ACCOUNT_DISABLED" }, { status: 200 });
    }
    const phoneDigits = String(profile.phoneDigits || "").replace(/\D/g, "");
    if (phoneDigits && ["driver", "sales"].includes(role)) {
      const canonical = await db.collection("users_by_phone").doc(phoneDigits).get();
      if (!canonical.exists || String(canonical.data()?.uidLast || canonical.data()?.uid || "") !== decoded.uid) {
        return Response.json({ ok: true, valid: false, error: "SESSION_REPLACED" }, { status: 200 });
      }
    }
    return Response.json({
      ok: true,
      valid: true,
      data: {
        uid: decoded.uid,
        phone: profile.phone || decoded.phone_number || null,
        role,
        name: profile?.name || null,
        email,
        driverId: profile?.driverId || null
      }
    });
  } catch (e) {
    return Response.json({ ok: true, valid: false, error: e?.message || String(e) }, { status: 200 });
  }
}

