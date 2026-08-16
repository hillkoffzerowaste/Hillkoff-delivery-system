import {
  buildSalesChiangmaiCompletionPatch,
  canSalesCompleteChiangmaiOrder
} from "../../../../lib/preparationWorkflow";
import { syncDeliveryOrderToSheet } from "../../../../lib/deliverySheetSync";
import { errorResponse, requireProfile } from "../../../../lib/workflowAuth";

export const runtime = "nodejs";

export async function POST(request) {
  try {
    const { profile, db } = await requireProfile(request, ["sales", "admin"]);
    const body = await request.json();
    const selectedIds = Array.isArray(body?.selectedIds)
      ? [...new Set(body.selectedIds.map((id) => String(id || "").trim()).filter(Boolean))]
      : [];
    if (!selectedIds.length) return Response.json({ ok: false, error: "No selected orders" }, { status: 400 });
    if (selectedIds.length > 200) return Response.json({ ok: false, error: "Selection exceeds 200 orders" }, { status: 409 });
    if (selectedIds.some((id) => id.length > 120 || id.includes("/"))) {
      return Response.json({ ok: false, error: "Invalid order id" }, { status: 400 });
    }

    const refs = selectedIds.map((id) => db.collection("orders").doc(id));
    const auditRef = db.collection("audit_logs").doc();
    const now = new Date().toISOString();
    const batchId = `sales_complete_${Date.now()}`;
    const completedOrders = [];

    await db.runTransaction(async (transaction) => {
      completedOrders.length = 0;
      const snapshots = await Promise.all(refs.map((ref) => transaction.get(ref)));
      const blockingOrderIds = snapshots
        .filter((snapshot) => !snapshot.exists || !canSalesCompleteChiangmaiOrder(snapshot.data()))
        .map((snapshot) => snapshot.id);
      if (blockingOrderIds.length) {
        throw Object.assign(new Error("Some orders are no longer eligible for sales completion"), { status: 409, blockingOrderIds });
      }

      snapshots.forEach((snapshot) => {
        const order = snapshot.data();
        const { patch, history } = buildSalesChiangmaiCompletionPatch(order, profile, now, batchId);
        transaction.set(snapshot.ref, patch, { merge: true });
        transaction.set(snapshot.ref.collection("activity").doc(), history);
        completedOrders.push({ id: snapshot.id, ...order, ...patch });
      });
      transaction.set(auditRef, {
        action: "sales_complete_bulk",
        batchId,
        count: selectedIds.length,
        orderIds: selectedIds,
        uid: profile.uid,
        role: profile.role,
        createdAt: now
      });
    });
    const syncResults = await Promise.allSettled(completedOrders.map((order) => syncDeliveryOrderToSheet(db, order.id, order)));
    if (syncResults.some((result) => result.status === "rejected")) {
      console.warn("Delivery sheet sync failed after sales bulk completion", { batchId });
    }

    return Response.json({ ok: true, data: { batchId, count: selectedIds.length, completedIds: selectedIds } });
  } catch (error) {
    if (error?.status === 409 && Array.isArray(error.blockingOrderIds)) {
      return Response.json({ ok: false, error: error.message, blockingOrderIds: error.blockingOrderIds }, { status: 409 });
    }
    return errorResponse(error);
  }
}
