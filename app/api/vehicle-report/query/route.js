import { buildVehicleReport } from "../../../../lib/vehicleReport";
import { listVehicles } from "../../../../lib/vehicleRepository";
import { errorResponse, requireProfile } from "../../../../lib/workflowAuth";

export const runtime = "nodejs";
const ROLES = ["sales", "admin", "accounting"];
const rows = (snap) => snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));

async function readCollection(db, name, limit = 5000) {
  return rows(await db.collection(name).limit(limit).get());
}

export async function POST(request) {
  try {
    const { db } = await requireProfile(request, ROLES);
    const body = await request.json();
    const [usageEvents, fuelBills, assessments, orders, vehicles] = await Promise.all([
      readCollection(db, "vehicle_usage_events"),
      readCollection(db, "fuel_bills"),
      readCollection(db, "driver_daily_assessments"),
      readCollection(db, "orders"),
      listVehicles(db, { includeInactive: true })
    ]);
    const data = buildVehicleReport({
      from: String(body.from || "").slice(0, 10), to: String(body.to || "").slice(0, 10),
      vehicleId: String(body.vehicleId || ""), driverId: String(body.driverId || ""),
      usageEvents, fuelBills, assessments, orders, vehicles
    });
    return Response.json({ ok: true, data });
  } catch (error) { return errorResponse(error); }
}
