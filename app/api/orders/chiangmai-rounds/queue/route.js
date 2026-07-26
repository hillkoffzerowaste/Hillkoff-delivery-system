import { isReadyOrderWaitingForDispatch } from "../../../../../lib/preparationWorkflow";
import { errorResponse, requireProfile } from "../../../../../lib/workflowAuth";
import { getAdminMessaging } from "../../../../../lib/firebaseAdmin";

export const runtime = "nodejs";

export async function POST(request) {
  try {
    const { profile, db } = await requireProfile(request, ["sales", "admin"]);
    const body = await request.json();
    const roundCode = String(body.roundCode || "");
    const roundDate = String(body.roundDate || "").slice(0, 10);
    const requestedIds = Array.isArray(body.selectedIds)
      ? [...new Set(body.selectedIds.map((id) => String(id || "").trim()).filter(Boolean))]
      : [];
    if (requestedIds.length > 200) return Response.json({ ok: false, error: "Selection exceeds 200 orders" }, { status: 409 });
    const snap = await db.collection("orders").where("chiangmaiRoundDate", "==", roundDate).limit(201).get();
    const roundOrders = snap.docs
      .map((doc) => ({ ref: doc.ref, id: doc.id, ...doc.data() }))
      .filter((order) => order.chiangmaiRoundCode === roundCode && !["completed", "cancelled", "pack_archived", "driver_archived"].includes(String(order.queueStatus || "")));
    if (!roundOrders.length) return Response.json({ ok: false, error: "No active orders in this round" }, { status: 404 });
    if (roundOrders.length > 200) return Response.json({ ok: false, error: "Round exceeds 200 orders" }, { status: 409 });
    const requestedSet = new Set(requestedIds);
    const orders = requestedIds.length ? roundOrders.filter((order) => requestedSet.has(order.id)) : roundOrders;
    const missingIds = requestedIds.filter((id) => !orders.some((order) => order.id === id));
    if (missingIds.length) return Response.json({ ok: false, error: "Some selected orders are not active in this round", missingOrderIds: missingIds }, { status: 409 });
    if (!orders.length) return Response.json({ ok: false, error: "No selected orders" }, { status: 400 });
    const now = new Date().toISOString();
    const batchId = `round_${roundDate}_${Date.now()}`;
    await db.runTransaction(async (transaction) => {
      const currentSnaps = await Promise.all(orders.map((order) => transaction.get(order.ref)));
      const currentOrders = currentSnaps
        .filter((doc) => doc.exists)
        .map((doc) => ({ id: doc.id, ref: doc.ref, ...doc.data() }))
        .filter((order) => order.chiangmaiRoundCode === roundCode && order.chiangmaiRoundDate === roundDate);
      if (currentOrders.length !== orders.length) {
        throw Object.assign(new Error("Selected orders changed before queueing"), { status: 409, blockingOrderIds: orders.filter((order) => !currentOrders.some((current) => current.id === order.id)).map((order) => order.id) });
      }
      const blockingOrderIds = currentOrders.filter((order) => !isReadyOrderWaitingForDispatch(order)).map((order) => order.id);
      if (blockingOrderIds.length) throw Object.assign(new Error("Round is not ready"), { status: 409, blockingOrderIds });
      for (const order of currentOrders) {
        transaction.set(order.ref, { queueStatus: "queued", status: "รอคนขับรับ", queuedAt: now, queuedBy: profile.name || profile.email, updatedAt: now }, { merge: true });
        transaction.set(order.ref.collection("activity").doc(), { action: "queue_round_bulk", roundCode, roundDate, batchId, uid: profile.uid, role: profile.role, at: now });
      }
    });
    await db.collection("audit_logs").add({ action: "queue_round_bulk", roundCode, roundDate, batchId, count: orders.length, uid: profile.uid, createdAt: now });
    try {
      const tokenSnap = await db.collection("push_tokens").where("role", "==", "driver").limit(500).get();
      const tokens = tokenSnap.docs.map((doc) => doc.id).filter(Boolean);
      if (tokens.length) await getAdminMessaging().sendEachForMulticast({
        tokens,
        data: {
          type: "chiangmai_round_ready",
          title: "รอบจัดส่งเชียงใหม่พร้อมแล้ว",
          body: `${roundDate} · ${orders.length} ออเดอร์`,
          roundCode,
          roundDate,
          count: String(orders.length)
        }
      });
    } catch (notificationError) {
      console.warn("Chiang Mai round summary notification failed", notificationError?.message || notificationError);
    }
    return Response.json({ ok: true, data: { roundCode, roundDate, batchId, count: orders.length } });
  } catch (error) {
    if (error?.status === 409 && Array.isArray(error.blockingOrderIds)) {
      return Response.json({ ok: false, error: error.message, blockingOrderIds: error.blockingOrderIds }, { status: 409 });
    }
    return errorResponse(error);
  }
}
