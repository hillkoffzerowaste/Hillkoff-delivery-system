import { getAdminAuth, getAdminDb } from "../../../../lib/firebaseAdmin";

export const runtime = "nodejs";

function normalizePhoneDigits(raw) {
  return String(raw || "").replace(/\D/g, "");
}

export async function POST(request) {
  let payload;
  try {
    payload = await request.json();
  } catch {
    return Response.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  const idToken = String(payload?.idToken || "").trim();
  const role = String(payload?.role || "").trim(); // driver | sales
  const name = String(payload?.name || "").trim();
  const phoneRaw = String(payload?.phone || "").trim();
  const phone = normalizePhoneDigits(phoneRaw);

  if (!idToken) return Response.json({ ok: false, error: "Missing idToken" }, { status: 400 });
  if (!["driver", "sales"].includes(role)) return Response.json({ ok: false, error: "Invalid role" }, { status: 400 });

  try {
    const adminAuth = getAdminAuth();
    const decoded = await adminAuth.verifyIdToken(idToken, true);
    const db = getAdminDb();

    const uid = decoded.uid;
    const tokenPhone = decoded.phone_number || "";
    const tokenDigits = normalizePhoneDigits(tokenPhone);
    if (phone && tokenDigits && phone !== tokenDigits) {
      return Response.json({ ok: false, error: "Phone mismatch" }, { status: 401 });
    }

    const userRef = db.collection("users").doc(uid);
    const existingSnap = await userRef.get();
    const existing = existingSnap.exists ? existingSnap.data() : null;

    const next = {
      uid,
      role,
      phone: tokenPhone || phoneRaw || null,
      phoneDigits: tokenDigits || phone || null,
      name: name || existing?.name || null,
      driverId: role === "driver" ? (existing?.driverId || uid) : null,
      updatedAt: new Date().toISOString(),
      createdAt: existing?.createdAt || new Date().toISOString()
    };

    await userRef.set(next, { merge: true });

    await db.collection("login_events").add({
      uid,
      role,
      phone: next.phone,
      success: true,
      createdAt: new Date().toISOString()
    });

    return Response.json({
      ok: true,
      data: { uid, role, phone: next.phone, name: next.name, driverId: next.driverId }
    });
  } catch (e) {
    return Response.json({ ok: false, error: e?.message || String(e) }, { status: 401 });
  }
}

