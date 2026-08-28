import { resolveVerifiedDriver } from "../../../../lib/driverIdentity";
import { resolveVehicle } from "../../../../lib/vehicleRepository";
import { errorResponse, requireProfile } from "../../../../lib/workflowAuth";

export const runtime = "nodejs";

export async function GET(request) {
  try {
    const { db, decoded } = await requireProfile(request, ["driver"]);
    const identity = await resolveVerifiedDriver(db, decoded);
    const user = identity?.user || {};
    const vehicle = await resolveVehicle(db, user.lastVehicleId);
    if (!vehicle) return Response.json({ ok: true, data: null });
    return Response.json({
      ok: true,
      data: { vehicleId: vehicle.id, plate: vehicle.plate || "", usedAt: String(user.lastVehicleUsedAt || "") }
    });
  } catch (error) { return errorResponse(error); }
}
