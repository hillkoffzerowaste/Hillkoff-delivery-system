import { orderCreatedDateKey } from "../../../../lib/operationsReporting";
import { resolveNextRoundDate, validateChiangmaiRound } from "../../../../lib/preparationWorkflow";
import { errorResponse, requireProfile } from "../../../../lib/workflowAuth";

export const runtime = "nodejs";

export async function PATCH(request) {
  try {
    const { profile, db } = await requireProfile(request, ["sales", "admin"]);
    const body = await request.json();
    const orderId = String(body.orderId || "");
    if (!orderId || orderId.includes("/") || orderId.length > 120) return Response.json({ ok: false, error: "Invalid orderId" }, { status: 400 });
    const ref = db.collection("orders").doc(orderId);
    const snap = await ref.get();
    if (!snap.exists) return Response.json({ ok: false, error: "Order not found" }, { status: 404 });
    const order = snap.data() || {};
    const roundCode = validateChiangmaiRound(order, String(body.roundCode || ""));
    const roundDate = resolveNextRoundDate(orderCreatedDateKey(order), roundCode);
    const now = new Date().toISOString();
    const history = [...(Array.isArray(order.workflowHistory) ? order.workflowHistory : []).slice(-99), {
      action: "assign_chiangmai_round", roundCode, roundDate, role: profile.role, uid: profile.uid, at: now
    }];
    const patch = { chiangmaiRoundCode: roundCode, chiangmaiRoundDate: roundDate, chiangmaiRoundAssignedAt: now, chiangmaiRoundAssignedBy: profile.name || profile.email, workflowHistory: history, updatedAt: now };
    await ref.set(patch, { merge: true });
    await ref.collection("activity").add(history.at(-1));
    return Response.json({ ok: true, data: { orderId, ...patch } });
  } catch (error) { return errorResponse(error); }
}
