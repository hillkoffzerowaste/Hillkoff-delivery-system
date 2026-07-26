import { buildDispatchDashboard } from "../../../../lib/dispatchDashboard";
import { errorResponse, requireProfile } from "../../../../lib/workflowAuth";

export const runtime = "nodejs";

export async function POST(request) {
  try {
    const { db } = await requireProfile(request, ["sales", "admin"]);
    const body = await request.json();
    const selectedDate = String(body.selectedDate || "").slice(0, 10);
    const snap = await db.collection("orders").limit(5000).get();
    const orders = snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
    return Response.json({ ok: true, data: buildDispatchDashboard(orders, selectedDate) });
  } catch (error) { return errorResponse(error); }
}
