import { buildVehicleReport } from "../../../../lib/vehicleReport";
import { vehicleReportReadPlan } from "../../../../lib/operationsReporting";
import { listVehicles } from "../../../../lib/vehicleRepository";
import { errorResponse, requireProfile } from "../../../../lib/workflowAuth";

export const runtime = "nodejs";
const ROLES = ["sales", "admin", "accounting"];
const MAX_RANGE_DAYS = 92;
const MAX_QUERY_ROWS = 5000;
const rows = (snap) => snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));

async function executeRead(db, spec) {
  let query = db.collection(spec.collection).where(spec.field, ">=", spec.from);
  query = spec.toExclusive
    ? query.where(spec.field, "<", spec.toExclusive)
    : query.where(spec.field, "<=", spec.to);
  const snap = await query.limit(MAX_QUERY_ROWS + 1).get();
  if (snap.size > MAX_QUERY_ROWS) {
    throw Object.assign(new Error("Report query exceeded 5,000 rows; choose a shorter date range"), { status: 422 });
  }
  return rows(snap);
}

function uniqueRows(groups) {
  const unique = new Map();
  for (const group of groups) for (const row of group) unique.set(String(row.id), row);
  return [...unique.values()];
}

export async function POST(request) {
  try {
    const { db } = await requireProfile(request, ROLES);
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return Response.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
    }
    const filters = {
      from: String(body.from || "").slice(0, 10),
      to: String(body.to || "").slice(0, 10)
    };
    const spanDays = Math.round((Date.parse(`${filters.to}T00:00:00Z`) - Date.parse(`${filters.from}T00:00:00Z`)) / 86_400_000) + 1;
    if (!Number.isFinite(spanDays) || spanDays < 1 || spanDays > MAX_RANGE_DAYS) {
      return Response.json({ ok: false, error: `Date range must be 1 to ${MAX_RANGE_DAYS} days` }, { status: 400 });
    }
    const plan = vehicleReportReadPlan(filters);
    const [usageEvents, fuelBills, assessments, ordersByServiceDate, ordersByDeliveryDate, ordersByUpdatedAt, vehicles] = await Promise.all([
      ...plan.map((spec) => executeRead(db, spec)),
      listVehicles(db, { includeInactive: true })
    ]);
    const orders = uniqueRows([ordersByServiceDate, ordersByDeliveryDate, ordersByUpdatedAt]);
    const data = buildVehicleReport({
      ...filters,
      vehicleId: String(body.vehicleId || ""), driverId: String(body.driverId || ""),
      usageEvents, fuelBills, assessments, orders, vehicles
    });
    return Response.json({ ok: true, data });
  } catch (error) { return errorResponse(error); }
}
