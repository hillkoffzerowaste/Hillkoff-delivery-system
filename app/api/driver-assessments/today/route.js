import { HILLKOFF_VEHICLES } from "../../../../lib/vehicleMaster";
import { errorResponse, requireProfile } from "../../../../lib/workflowAuth";

export const runtime = "nodejs";

function toServiceDateKey(dateLike) {
  const date = dateLike ? new Date(dateLike) : new Date();
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(date);
  const y = parts.find((p) => p.type === "year")?.value || "1970";
  const m = parts.find((p) => p.type === "month")?.value || "01";
  const d = parts.find((p) => p.type === "day")?.value || "01";
  return `${y}-${m}-${d}`;
}

export async function POST(request) {
  let payload;
  try {
    payload = await request.json();
  } catch {
    return Response.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  const serviceDate = String(payload?.serviceDate || toServiceDateKey(new Date()));
  if (!/^\d{4}-\d{2}-\d{2}$/.test(serviceDate)) {
    return Response.json({ ok: false, error: "Invalid serviceDate" }, { status: 400 });
  }

  try {
    const { db } = await requireProfile(request, ["sales", "admin"]);

    const [driversSnap, assessmentsSnap] = await Promise.all([
      db.collection("users_by_phone").where("role", "==", "driver").get(),
      db.collection("driver_daily_assessments").where("serviceDate", "==", serviceDate).get()
    ]);

    const drivers = driversSnap.docs.map((doc) => {
      const data = doc.data() || {};
      const profile = data.driverProfile || {};
      const name = data.name || [profile.firstName, profile.lastName].filter(Boolean).join(" ") || data.phone || doc.id;
      return {
        id: data.driverId || `driver_${data.phoneDigits || doc.id}`,
        name,
        phone: data.phone || data.phoneDigits || "",
        plate: profile.plate || "",
        zone: profile.zone || "",
        vehicle: profile.vehicle || ""
      };
    });

    const assessments = assessmentsSnap.docs.map((doc) => ({ id: doc.id, ...(doc.data() || {}) }));

    return Response.json({ ok: true, data: { serviceDate, drivers, assessments, vehicles: HILLKOFF_VEHICLES } });
  } catch (error) { return errorResponse(error); }
}
