import { dailyOrdersReadPlan } from "../../../../lib/operationsReporting";
import { errorResponse, requireProfile } from "../../../../lib/workflowAuth";

export const runtime = "nodejs";
const MAX_RANGE_DAYS = 92;
const MAX_REPORT_ROWS = 5000;
const REPORT_FIELDS = [
  "serviceDate", "status", "cod", "driverId", "driverName", "zone",
  "deliveryMethod", "customerName", "complaint", "complaintStatus", "deliveredAt"
];

function projectOrder(id, data) {
  const row = { id };
  for (const field of REPORT_FIELDS) row[field] = data[field] ?? "";
  return row;
}

export async function POST(request) {
  try {
    const { db } = await requireProfile(request, ["sales", "admin"]);
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return Response.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
    }
    const from = String(body.from || "").slice(0, 10);
    const to = String(body.to || "").slice(0, 10);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to) || from > to) {
      return Response.json({ ok: false, error: "Invalid report date range" }, { status: 400 });
    }
    const spanDays = Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86400000) + 1;
    if (!Number.isFinite(spanDays) || spanDays < 1 || spanDays > MAX_RANGE_DAYS) {
      return Response.json({ ok: false, error: `Date range too wide (max ${MAX_RANGE_DAYS} days)` }, { status: 400 });
    }
    const plan = dailyOrdersReadPlan({ from, to });
    const [spec] = plan;
    const snap = await db.collection(spec.collection)
      .where(spec.field, ">=", spec.from)
      .where(spec.field, "<=", spec.to)
      .limit(MAX_REPORT_ROWS + 1)
      .get();
    if (snap.size > MAX_REPORT_ROWS) {
      return Response.json({ ok: false, error: "Report has more than 5,000 orders; choose a shorter date range" }, { status: 422 });
    }
    const data = snap.docs.map((doc) => projectOrder(doc.id, doc.data() || {}));
    return Response.json({ ok: true, data });
  } catch (error) { return errorResponse(error); }
}
