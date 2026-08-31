import { errorResponse, requireProfile } from "../../../../lib/workflowAuth";

export const runtime = "nodejs";

const MAX_ORDERS = 200;

function serviceDateKey(value = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok", year: "numeric", month: "2-digit", day: "2-digit" })
    .formatToParts(value)
    .reduce((result, part) => ({ ...result, [part.type]: part.value }), {});
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function sequenceRef(db, driverId, serviceDate) {
  const safeDriverId = String(driverId).replace(/[^A-Za-z0-9_-]/g, "_").slice(0, 120);
  return db.collection("driver_delivery_sequences").doc(`${serviceDate}_${safeDriverId}`);
}

export async function GET(request) {
  try {
    const { profile, db } = await requireProfile(request, ["driver"]);
    const driverId = String(profile.driverId || "").trim();
    const serviceDate = String(new URL(request.url).searchParams.get("serviceDate") || serviceDateKey()).slice(0, 10);
    if (!driverId || !/^\d{4}-\d{2}-\d{2}$/.test(serviceDate)) return Response.json({ ok: false, error: "Invalid sequence request" }, { status: 400 });
    const snap = await sequenceRef(db, driverId, serviceDate).get();
    return Response.json({ ok: true, data: { serviceDate, orderIds: Array.isArray(snap.data()?.orderIds) ? snap.data().orderIds : [] } });
  } catch (error) { return errorResponse(error); }
}

export async function POST(request) {
  try {
    const { profile, db } = await requireProfile(request, ["driver"]);
    const body = await request.json();
    const ids = [...new Set(Array.isArray(body?.orderIds) ? body.orderIds : [])];
    const driverId = String(profile.driverId || "").trim();
    if (!driverId || !ids.length || ids.length > MAX_ORDERS || ids.some((id) => !/^[A-Za-z0-9._-]{1,120}$/.test(String(id)))) {
      return Response.json({ ok: false, error: "Invalid order sequence" }, { status: 400 });
    }
    const now = new Date().toISOString();
    const serviceDate = serviceDateKey();
    await sequenceRef(db, driverId, serviceDate).set({
      driverId,
      serviceDate,
      orderIds: ids,
      updatedAt: now,
      updatedBy: String(profile.name || driverId).slice(0, 200)
    }, { merge: true });
    return Response.json({ ok: true, data: { serviceDate, orderIds: ids, updatedAt: now } });
  } catch (error) { return errorResponse(error); }
}
