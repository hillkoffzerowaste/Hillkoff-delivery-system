import { errorResponse, requireProfile } from "../../../../lib/workflowAuth";
import { BOOKING_NUMBER_PATTERN, bookingRegistryId, isOrderRegistrySource, normalizeBookingNumber } from "../../../../lib/bookingRegistry";

export const runtime = "nodejs";

export async function POST(request) {
  try {
    const { profile, db } = await requireProfile(request, ["sales", "store", "admin"]);
    const body = await request.json();
    const orderId = String(body?.orderId || "").trim().slice(0, 200);
    if (!orderId) return Response.json({ ok: false, error: "Missing orderId" }, { status: 400 });
    if (orderId.includes("/")) return Response.json({ ok: false, error: "Invalid orderId" }, { status: 400 });

    const ref = db.collection("orders").doc(orderId);
    const snap = await ref.get();
    if (!snap.exists) return Response.json({ ok: true, data: { id: orderId, alreadyDeleted: true } });
    const order = snap.data() || {};
    if (profile.role !== "admin") {
      const driverStarted = Boolean(order.driverId)
        || !["preparing", "ready"].includes(String(order.queueStatus || ""))
        || ["รอคนขับรับ", "กำลังส่ง", "กำลังจัดส่ง", "ส่งสำเร็จ"].includes(String(order.status || ""));
      if (!order.workflowType || driverStarted) {
        return Response.json({ ok: false, error: "ลบได้เฉพาะงานเตรียมที่ยังไม่เข้าคิวและยังไม่มีคนขับรับ" }, { status: 403 });
      }
    }

    const activity = await ref.collection("activity").limit(400).get();
    const deletedAt = new Date().toISOString();
    const releasedBookingNumbers = [];
    let permissionError = null;
    await db.runTransaction(async (transaction) => {
      const currentSnap = await transaction.get(ref);
      if (!currentSnap.exists) return;
      const currentOrder = currentSnap.data() || {};
      if (profile.role !== "admin") {
        const driverStarted = Boolean(currentOrder.driverId)
          || !["preparing", "ready"].includes(String(currentOrder.queueStatus || ""))
          || ["รอคนขับรับ", "กำลังส่ง", "กำลังจัดส่ง", "ส่งสำเร็จ"].includes(String(currentOrder.status || ""));
        if (!currentOrder.workflowType || driverStarted) {
          permissionError = "ลบได้เฉพาะงานเตรียมที่ยังไม่เข้าคิวและยังไม่มีคนขับรับ";
          return;
        }
      }
      const bookingNumbers = [...new Set((Array.isArray(currentOrder.bookingNumbers) ? currentOrder.bookingNumbers : [currentOrder.bookingNumber])
        .map(normalizeBookingNumber)
        .filter((bookingNumber) => BOOKING_NUMBER_PATTERN.test(bookingNumber)))];
      const serviceDate = String(currentOrder.serviceDate || currentOrder.createdAt || "").slice(0, 10);
      const reservations = bookingNumbers
        .map((bookingNumber) => ({ bookingNumber, registryId: bookingRegistryId(serviceDate, bookingNumber) }))
        .filter((reservation) => reservation.registryId)
        .map((reservation) => ({ ...reservation, ref: db.collection("booking_month_registry").doc(reservation.registryId) }));
      const reservationSnapshots = await Promise.all(reservations.map((reservation) => transaction.get(reservation.ref)));
      reservationSnapshots.forEach((reservationSnap, index) => {
        const reservation = reservations[index];
        const record = reservationSnap.data() || {};
        if (reservationSnap.exists && isOrderRegistrySource(record.source) && String(record.sourceId || "") === orderId) {
          transaction.delete(reservation.ref);
          releasedBookingNumbers.push(reservation.bookingNumber);
        }
      });
      activity.docs.forEach((doc) => transaction.delete(doc.ref));
      transaction.delete(ref);
      transaction.set(db.collection("audit_logs").doc(), {
        action: "order_deleted",
        orderId,
        orderSnapshot: currentOrder,
        releasedBookingNumbers,
        byUid: profile.uid,
        byRole: profile.role,
        byName: profile.name,
        createdAt: deletedAt
      });
    });
    if (permissionError) return Response.json({ ok: false, error: permissionError }, { status: 403 });
    return Response.json({ ok: true, data: { id: orderId, releasedBookingNumbers } });
  } catch (error) {
    return errorResponse(error);
  }
}
