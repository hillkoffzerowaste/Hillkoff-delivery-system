import { listVehicles } from "../../../lib/vehicleRepository";
import { errorResponse, requireProfile } from "../../../lib/workflowAuth";

export const runtime = "nodejs";
const MANAGER_ROLES = ["sales", "admin", "accounting"];
const clean = (value, max = 200) => String(value || "").trim().slice(0, max);

export async function GET(request) {
  try {
    const { profile, db } = await requireProfile(request, ["driver", ...MANAGER_ROLES]);
    const includeInactive = new URL(request.url).searchParams.get("includeInactive") === "true";
    if (includeInactive && !MANAGER_ROLES.includes(profile.role)) {
      return Response.json({ ok: false, error: "Forbidden" }, { status: 403 });
    }
    return Response.json({ ok: true, data: await listVehicles(db, { includeInactive }) });
  } catch (error) { return errorResponse(error); }
}

export async function POST(request) {
  try {
    const { profile, db } = await requireProfile(request, MANAGER_ROLES);
    const body = await request.json();
    const id = clean(body.id || body.assetCode, 120);
    if (!id || id.includes("/")) return Response.json({ ok: false, error: "Invalid vehicle id" }, { status: 400 });
    const now = new Date().toISOString();
    const ref = db.collection("vehicle_master").doc(id);
    const snap = await ref.get();
    const record = {
      id, assetCode: clean(body.assetCode || id, 120), plate: clean(body.plate, 80),
      vehicleType: clean(body.vehicleType), brand: clean(body.brand, 100), model: clean(body.model, 100),
      responsiblePerson: clean(body.responsiblePerson), department: clean(body.department),
      active: body.active !== false, createdAt: snap.data()?.createdAt || now,
      createdBy: snap.data()?.createdBy || profile.email || profile.uid,
      updatedAt: now, updatedBy: profile.email || profile.uid
    };
    await ref.set(record, { merge: true });
    await db.collection("audit_logs").add({ action: snap.exists ? "vehicle_updated" : "vehicle_created", targetId: id, role: profile.role, uid: profile.uid, createdAt: now });
    return Response.json({ ok: true, data: record });
  } catch (error) { return errorResponse(error); }
}

export const PATCH = POST;

export async function DELETE(request) {
  try {
    const { profile, db } = await requireProfile(request, MANAGER_ROLES);
    const body = await request.json();
    const id = clean(body.id, 120);
    if (!id || id.includes("/")) return Response.json({ ok: false, error: "Invalid vehicle id" }, { status: 400 });
    const now = new Date().toISOString();
    await db.collection("vehicle_master").doc(id).set({ active: false, disabledAt: now, disabledBy: profile.email || profile.uid, updatedAt: now }, { merge: true });
    await db.collection("audit_logs").add({ action: "vehicle_disabled", targetId: id, role: profile.role, uid: profile.uid, createdAt: now });
    return Response.json({ ok: true, data: { id, active: false } });
  } catch (error) { return errorResponse(error); }
}
