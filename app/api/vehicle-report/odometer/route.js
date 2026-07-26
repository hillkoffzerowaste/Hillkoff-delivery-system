import { buildOdometerCorrection, canCorrectVehicleOdometer } from "../../../../lib/vehicleOdometerCorrection";
import { errorResponse, requireProfile } from "../../../../lib/workflowAuth";

export const runtime = "nodejs";

function httpError(message, status) {
  return Object.assign(new Error(message), { status });
}

function eventOdometers(events, eventType) {
  return events
    .filter((event) => String(event.eventType || "") === eventType)
    .map((event) => Number(event.odometer))
    .filter((value) => Number.isFinite(value) && value > 0);
}

export async function PATCH(request) {
  try {
    const { profile, db } = await requireProfile(request, ["admin", "accounting"]);
    if (!canCorrectVehicleOdometer(profile)) throw httpError("Forbidden", 403);
    const body = await request.json();
    const eventId = String(body.eventId || "").trim();
    if (!eventId || eventId.length > 200 || eventId.includes("/")) throw httpError("Invalid event", 400);

    const eventRef = db.collection("vehicle_usage_events").doc(eventId);
    const auditRef = db.collection("vehicle_odometer_audits").doc();
    const now = new Date().toISOString();
    const data = await db.runTransaction(async (transaction) => {
      const eventSnap = await transaction.get(eventRef);
      if (!eventSnap.exists) throw httpError("Vehicle usage event not found", 404);
      const event = { id: eventSnap.id, ...eventSnap.data() };
      if (!["start", "end"].includes(String(event.eventType || ""))) {
        throw httpError("Only start or end odometer events can be corrected", 409);
      }

      const relatedQuery = db.collection("vehicle_usage_events")
        .where("vehicleId", "==", String(event.vehicleId || ""))
        .where("serviceDate", "==", String(event.serviceDate || ""))
        .where("driverId", "==", String(event.driverId || ""))
        .limit(50);
      const relatedSnap = await transaction.get(relatedQuery);
      const relatedEvents = relatedSnap.docs
        .map((doc) => ({ id: doc.id, ...doc.data() }));
      const starts = eventOdometers(relatedEvents, "start");
      const ends = eventOdometers(relatedEvents, "end");
      const minimumOdometer = starts.length ? Math.min(...starts) : 0;
      const maximumOdometer = ends.length ? Math.max(...ends) : 0;
      const correction = buildOdometerCorrection({
        event,
        odometer: body.odometer,
        minimumOdometer,
        maximumOdometer,
        reason: body.reason,
        actor: profile,
        now
      });

      transaction.set(eventRef, correction.eventPatch, { merge: true });
      transaction.set(auditRef, correction.auditRecord);
      return { eventId, odometer: correction.eventPatch.odometer, auditId: auditRef.id };
    });
    return Response.json({ ok: true, data });
  } catch (error) {
    return errorResponse(error);
  }
}
