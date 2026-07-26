import { errorResponse, requireProfile } from "../../../lib/workflowAuth";

export const runtime = "nodejs";
const ROLES = ["sales", "admin", "accounting"];
const clean = (value, max = 200) => String(value || "").trim().slice(0, max);
const digits = (value) => String(value || "").replace(/\D/g, "").slice(0, 15);

export async function GET(request) {
  try {
    const { db } = await requireProfile(request, ROLES);
    const snap = await db.collection("users_by_phone").where("role", "==", "driver").limit(500).get();
    return Response.json({ ok: true, data: snap.docs.map((doc) => ({ id: doc.id, ...doc.data() })) });
  } catch (error) { return errorResponse(error); }
}

export async function POST(request) {
  try {
    const { profile, db } = await requireProfile(request, ROLES);
    const body = await request.json();
    const phoneDigits = digits(body.phoneDigits || body.phone);
    if (phoneDigits.length < 9) return Response.json({ ok: false, error: "Invalid driver phone" }, { status: 400 });
    const now = new Date().toISOString();
    const ref = db.collection("users_by_phone").doc(phoneDigits);
    const snap = await ref.get();
    const record = {
      role: "driver", phone: clean(body.phone || phoneDigits, 40), phoneDigits,
      name: clean(body.name), driverId: clean(body.driverId || `driver_${phoneDigits}`, 120),
      active: body.active !== false, status: body.active === false ? "disabled" : "active",
      updatedAt: now, updatedBy: profile.email || profile.uid,
      createdAt: snap.data()?.createdAt || now
    };
    await ref.set(record, { merge: true });
    if (snap.data()?.uidLast) await db.collection("users").doc(snap.data().uidLast).set(record, { merge: true });
    await db.collection("audit_logs").add({ action: snap.exists ? "driver_updated" : "driver_created", targetId: phoneDigits, uid: profile.uid, createdAt: now });
    return Response.json({ ok: true, data: { id: phoneDigits, ...record } });
  } catch (error) { return errorResponse(error); }
}

export const PATCH = POST;

export async function DELETE(request) {
  try {
    const { profile, db } = await requireProfile(request, ROLES);
    const body = await request.json();
    const phoneDigits = digits(body.phoneDigits || body.id);
    if (phoneDigits.length < 9) return Response.json({ ok: false, error: "Invalid driver phone" }, { status: 400 });
    const now = new Date().toISOString();
    const ref = db.collection("users_by_phone").doc(phoneDigits);
    const snap = await ref.get();
    const patch = { active: false, status: "disabled", disabledAt: now, disabledBy: profile.email || profile.uid, updatedAt: now };
    await ref.set(patch, { merge: true });
    if (snap.data()?.uidLast) await db.collection("users").doc(snap.data().uidLast).set(patch, { merge: true });
    await db.collection("audit_logs").add({ action: "driver_disabled", targetId: phoneDigits, uid: profile.uid, createdAt: now });
    return Response.json({ ok: true, data: { id: phoneDigits, active: false } });
  } catch (error) { return errorResponse(error); }
}
