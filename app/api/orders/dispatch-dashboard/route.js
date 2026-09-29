import { buildDispatchDashboard, dispatchDashboardReadPlan } from "../../../../lib/dispatchDashboard";
import { isValidServiceDate } from "../../../../lib/serviceDate";
import { errorResponse, requireProfile } from "../../../../lib/workflowAuth";

export const runtime = "nodejs";

export async function POST(request) {
  try {
    const { db } = await requireProfile(request, ["sales", "admin"]);
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return Response.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
    }
    const selectedDate = String(body.selectedDate || "").slice(0, 10);
    if (!isValidServiceDate(selectedDate)) {
      return Response.json({ ok: false, error: "Invalid selected date" }, { status: 400 });
    }
    const plan = dispatchDashboardReadPlan(selectedDate);
    const snapshots = await Promise.all(plan.map((spec) => (
      db.collection(spec.collection).where(spec.field, spec.op, spec.value).limit((spec.limit || 500) + 1).get()
    )));
    const truncated = snapshots.find((snap, index) => snap.docs.length > (plan[index].limit || 500));
    if (truncated) {
      return Response.json({ ok: false, error: "ผลรายงานเกินขีดจำกัดที่ระบบรองรับ กรุณาเลือกวันที่หรือกรองข้อมูลให้แคบลง" }, { status: 422 });
    }
    const unique = new Map();
    for (const snap of snapshots) {
      for (const doc of snap.docs) unique.set(doc.id, { id: doc.id, ...doc.data() });
    }
    const orders = [...unique.values()];
    return Response.json({ ok: true, data: buildDispatchDashboard(orders, selectedDate) });
  } catch (error) { return errorResponse(error); }
}
