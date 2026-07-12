import { getAdminAuth, getAdminDb } from "./firebaseAdmin";

export const ADMIN_EMAIL = "online_marketing@hillkoff.com";

export async function requireProfile(request, allowedRoles = []) {
  const header = String(request.headers.get("authorization") || "");
  const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  if (!token) throw Object.assign(new Error("Missing authorization token"), { status: 401 });

  const decoded = await getAdminAuth().verifyIdToken(token, true);
  const db = getAdminDb();
  const snap = await db.collection("users").doc(decoded.uid).get();
  let data = snap.exists ? snap.data() : {};
  if (!snap.exists) {
    const legacy = await db.collection("users_by_phone").where("uidLast", "==", decoded.uid).limit(1).get();
    if (!legacy.empty) data = legacy.docs[0].data() || {};
  }
  const email = String(decoded.email || data.email || "").toLowerCase();
  const role = email === ADMIN_EMAIL ? "admin" : String(data.role || "");
  const profile = { uid: decoded.uid, email, role, name: data.name || decoded.name || "", active: data.active !== false };
  if (!profile.active) throw Object.assign(new Error("Account disabled"), { status: 403 });
  if (allowedRoles.length && !allowedRoles.includes(role)) throw Object.assign(new Error("Forbidden"), { status: 403 });
  return { profile, db, decoded };
}

export function errorResponse(error) {
  return Response.json({ ok: false, error: error?.message || String(error) }, { status: error?.status || 401 });
}
