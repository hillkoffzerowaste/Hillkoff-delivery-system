import { errorResponse, requireProfile } from "../../../../lib/workflowAuth";

export const runtime = "nodejs";

const MAX_ORDERS = 200;

export async function POST(request) {
  try {
    const { profile, db } = await requireProfile(request, ["driver"]);
    const body = await request.json();
    const ids = [...new Set(Array.isArray(body?.orderIds) ? body.orderIds : [])];
    const driverId = String(profile.driverId || "").trim();
    if (!driverId || !ids.length || ids.length > MAX_ORDERS || ids.some((id) => !/^[A-Za-z0-9._-]{1,120}$/.test(String(id)))) {
      return Response.json({ ok: false, error: "Invalid order sequence" }, { status: 400 });
    }
    const refs = ids.map((id) => db.collection("orders").doc(String(id)));
    const snapshots = await db.getAll(...refs);
    if (snapshots.some((snap) => !snap.exists || String(snap.data()?.driverId || "") !== driverId || String(snap.data()?.status || "") !== "กำลังส่ง")) {
      return Response.json({ ok: false, error: "One or more orders are no longer assigned to you" }, { status: 409 });
    }
    const now = new Date().toISOString();
    const serviceDate = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok", year: "numeric", month: "2-digit", day: "2-digit" })
      .formatToParts(new Date()).reduce((value, part) => ({ ...value, [part.type]: part.value }), {});
    const serviceDateKey = `${serviceDate.year}-${serviceDate.month}-${serviceDate.day}`;
    const batch = db.batch();
    snapshots.forEach((snap, index) => {
      batch.update(snap.ref, {
        driverSequence: index + 1,
        driverSequenceServiceDate: serviceDateKey,
        driverSequenceUpdatedAt: now,
        driverSequenceUpdatedBy: String(profile.name || driverId).slice(0, 200),
        updatedAt: now
      });
    });
    await batch.commit();
    return Response.json({ ok: true, data: { orderIds: ids, updatedAt: now } });
  } catch (error) { return errorResponse(error); }
}
