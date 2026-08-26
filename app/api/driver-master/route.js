import { errorResponse, requireProfile } from "../../../lib/workflowAuth";

export const runtime = "nodejs";
const ROLES = ["sales", "admin", "accounting"];
const clean = (value, max = 200) => String(value || "").trim().slice(0, max);
const digits = (value) => String(value || "").replace(/\D/g, "").slice(0, 15);

// ห้ามคืน doc ดิบ: users_by_phone เก็บ passwordHash/passwordSalt และ trustedDeviceHashes อยู่ด้วย
// route นี้เปิดให้ sales/accounting/admin การคืนทั้ง doc = ยกแฮชรหัสผ่านคนขับให้ทุกคนที่เข้าถึงได้
// (รหัสผ่านสั้นสุด 4 ตัว จึงถอดออฟไลน์ได้จริง) จึงคืนเฉพาะฟิลด์ที่หน้าจอต้องใช้
function publicDriverRecord(id, data = {}) {
  return {
    id,
    name: String(data.name || ""),
    phone: String(data.phone || ""),
    phoneDigits: String(data.phoneDigits || ""),
    driverId: String(data.driverId || ""),
    role: String(data.role || ""),
    status: String(data.status || ""),
    active: data.active !== false,
    driverProfile: data.driverProfile || null,
    lastLoginAt: data.lastLoginAt || "",
    createdAt: data.createdAt || "",
    updatedAt: data.updatedAt || ""
  };
}

export async function GET(request) {
  try {
    const { db } = await requireProfile(request, ROLES);
    const snap = await db.collection("users_by_phone").where("role", "==", "driver").limit(500).get();
    return Response.json({ ok: true, data: snap.docs.map((doc) => publicDriverRecord(doc.id, doc.data() || {})) });
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
      updatedAt: now, updatedBy: profile.email || profile.uid,
      createdAt: snap.data()?.createdAt || now
    };
    // PATCH ใช้ handler เดียวกับ POST และเขียนแบบ merge ถ้าตั้ง active จาก body.active !== false ตลอด
    // การแก้ที่ไม่ส่ง active มา (undefined) จะกลายเป็น active: true แล้วปลดแบนคนขับที่ปิดใช้งานไว้
    // พร้อมมิเรอร์ไปที่ users/{uid} ด้วย คนขับจึงกลับมาเรียก API และล็อกอินได้ จึงแตะ active
    // เฉพาะตอนสร้างใหม่ หรือตอนที่ body ระบุ boolean มาจริง
    if (typeof body.active === "boolean" || !snap.exists) {
      const nextActive = typeof body.active === "boolean" ? body.active : true;
      record.active = nextActive;
      record.status = nextActive ? "active" : "disabled";
    }
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
