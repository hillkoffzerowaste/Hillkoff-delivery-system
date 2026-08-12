import { BOOKING_NUMBER_PATTERN, bookingRegistryId, normalizeBookingNumber } from "../../../../lib/bookingRegistry";
import { canSalesDeleteChiangmaiOrder } from "../../../../lib/preparationWorkflow";
import { errorResponse, requireProfile } from "../../../../lib/workflowAuth";

export const runtime = "nodejs";

function bookingReservations(db, order = {}) {
  const bookingNumbers = [...new Set((Array.isArray(order.bookingNumbers) ? order.bookingNumbers : [order.bookingNumber])
    .map(normalizeBookingNumber)
    .filter((bookingNumber) => BOOKING_NUMBER_PATTERN.test(bookingNumber)))];
  const serviceDate = String(order.serviceDate || order.createdAt || "").slice(0, 10);
  return bookingNumbers
    .map((bookingNumber) => ({ bookingNumber, registryId: bookingRegistryId(serviceDate, bookingNumber) }))
    .filter((item) => item.registryId)
    .map((item) => ({ ...item, ref: db.collection("booking_month_registry").doc(item.registryId) }));
}

export async function POST(request) {
  try {
    const { profile, db } = await requireProfile(request, ["sales", "admin"]);
    const body = await request.json();
    const selectedIds = Array.isArray(body?.selectedIds)
      ? [...new Set(body.selectedIds.map((id) => String(id || "").trim()).filter(Boolean))]
      : [];
    if (!selectedIds.length) return Response.json({ ok: false, error: "No selected orders" }, { status: 400 });
    if (selectedIds.length > 50) return Response.json({ ok: false, error: "Selection exceeds 50 orders" }, { status: 409 });

    const refs = selectedIds.map((id) => db.collection("orders").doc(id));
    const activityById = new Map(await Promise.all(refs.map(async (ref) => {
      const snapshot = await ref.collection("activity").limit(400).get();
      return [ref.id, snapshot.docs];
    })));
    const deletedAt = new Date().toISOString();
    const batchId = `order_delete_bulk_${Date.now()}`;
    const deletedIds = new Set();
    const alreadyDeletedIds = new Set();

    await db.runTransaction(async (transaction) => {
      deletedIds.clear();
      alreadyDeletedIds.clear();
      const snapshots = await Promise.all(refs.map((ref) => transaction.get(ref)));
      const existing = snapshots.filter((snapshot) => snapshot.exists);
      const blockingOrderIds = existing
        .filter((snapshot) => !canSalesDeleteChiangmaiOrder(snapshot.data()))
        .map((snapshot) => snapshot.id);
      if (blockingOrderIds.length) {
        throw Object.assign(new Error("Some orders are no longer eligible for deletion"), { status: 409, blockingOrderIds });
      }

      snapshots.filter((snapshot) => !snapshot.exists).forEach((snapshot) => alreadyDeletedIds.add(snapshot.id));
      const reservationItems = existing.flatMap((snapshot) => bookingReservations(db, snapshot.data()).map((item) => ({ ...item, orderId: snapshot.id })));
      const reservationSnapshots = await Promise.all(reservationItems.map((item) => transaction.get(item.ref)));
      const deletableReservations = reservationSnapshots
        .map((snapshot, index) => ({ snapshot, item: reservationItems[index] }))
        .filter(({ snapshot, item }) => snapshot.exists
          && snapshot.data()?.source === "orders"
          && String(snapshot.data()?.sourceId || "") === item.orderId);
      const activityCount = existing.reduce((count, snapshot) => count + (activityById.get(snapshot.id)?.length || 0), 0);
      const totalWrites = existing.length * 2 + activityCount + deletableReservations.length;
      if (totalWrites > 450) throw Object.assign(new Error("Selection has too much activity history; delete fewer orders at a time"), { status: 409 });

      existing.forEach((snapshot) => {
        const order = snapshot.data() || {};
        const releasedBookingNumbers = deletableReservations
          .filter(({ item }) => item.orderId === snapshot.id)
          .map(({ item }) => item.bookingNumber);
        (activityById.get(snapshot.id) || []).forEach((doc) => transaction.delete(doc.ref));
        transaction.delete(snapshot.ref);
        transaction.set(db.collection("audit_logs").doc(), {
          action: "order_deleted_bulk",
          batchId,
          orderId: snapshot.id,
          orderSnapshot: order,
          releasedBookingNumbers,
          byUid: profile.uid,
          byRole: profile.role,
          byName: profile.name,
          createdAt: deletedAt
        });
        deletedIds.add(snapshot.id);
      });
      deletableReservations.forEach(({ item }) => transaction.delete(item.ref));
    });

    return Response.json({ ok: true, data: { batchId, count: deletedIds.size, deletedIds: [...deletedIds, ...alreadyDeletedIds], alreadyDeletedIds: [...alreadyDeletedIds] } });
  } catch (error) {
    if (error?.status === 409 && Array.isArray(error.blockingOrderIds)) {
      return Response.json({ ok: false, error: error.message, blockingOrderIds: error.blockingOrderIds }, { status: 409 });
    }
    return errorResponse(error);
  }
}
