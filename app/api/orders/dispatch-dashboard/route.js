import { buildDispatchDashboard, dispatchDashboardReadPlan } from "../../../../lib/dispatchDashboard";
import { errorResponse, requireProfile } from "../../../../lib/workflowAuth";

export const runtime = "nodejs";

export async function POST(request) {
  try {
    const { db } = await requireProfile(request, ["sales", "admin"]);
    const body = await request.json();
    const selectedDate = String(body.selectedDate || "").slice(0, 10);
    const plan = dispatchDashboardReadPlan(selectedDate);
    const snapshots = await Promise.all(plan.map((spec) => (
      db.collection(spec.collection).where(spec.field, spec.op, spec.value).limit(spec.limit || 500).get()
    )));
    const unique = new Map();
    for (const snap of snapshots) {
      for (const doc of snap.docs) unique.set(doc.id, { id: doc.id, ...doc.data() });
    }
    const orders = [...unique.values()];
    return Response.json({ ok: true, data: buildDispatchDashboard(orders, selectedDate) });
  } catch (error) { return errorResponse(error); }
}
