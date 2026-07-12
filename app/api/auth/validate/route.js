import { getAdminAuth, getAdminDb } from "../../../../lib/firebaseAdmin";

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
    const profile = snap.exists ? snap.data() : null;
    const email = String(decoded.email || profile?.email || "").toLowerCase();
    const role = email === "online_marketing@hillkoff.com" ? "admin" : profile?.role || null;
    if (profile?.active === false) return Response.json({ ok: true, valid: false, error: "ACCOUNT_DISABLED" }, { status: 200 });
    return Response.json({
      ok: true,
      valid: true,
      data: {
        uid: decoded.uid,
        phone: decoded.phone_number || null,
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

