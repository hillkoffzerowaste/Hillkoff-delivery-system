import { isOrderRegistrySource } from "../../../../lib/bookingRegistry";
import { errorResponse, requireProfile } from "../../../../lib/workflowAuth";

export const runtime = "nodejs";

const REQUIRED_CONFIRMATION = "YES_DELETE_ALL_ORDERS";

// ลบออเดอร์ทิ้งทั้งหมดแล้วต้องปล่อยการจองเลขใบสั่งจองที่ออเดอร์ถืออยู่ด้วย ไม่งั้นเลขทุกเลข
// จะล็อกค้างทั้งเดือนโดยไม่มีเจ้าของ ส่วนการจองของรายงานสโตร์ยังเก็บไว้ แต่ล้างรายชื่อออเดอร์
// ที่ยืมอยู่ออก เพราะออเดอร์เหล่านั้นไม่มีอยู่แล้ว
async function releaseOrderBookingReservations(db) {
  const snap = await db.collection("booking_month_registry").get();
  let released = 0;
  let cleared = 0;
  let batch = db.batch();
  let pending = 0;
  for (const doc of snap.docs) {
    const registry = doc.data() || {};
    if (isOrderRegistrySource(registry.source)) {
      batch.delete(doc.ref);
      released++;
      pending++;
    } else if (Array.isArray(registry.sharedWithOrderIds) && registry.sharedWithOrderIds.length) {
      batch.update(doc.ref, { sharedWithOrderIds: [] });
      cleared++;
      pending++;
    }
    if (pending >= 400) {
      await batch.commit();
      batch = db.batch();
      pending = 0;
    }
  }
  if (pending) await batch.commit();
  return { released, cleared };
}

export async function POST(request) {
  try {
    const { db } = await requireProfile(request, ["admin"]);
    const body = await request.json().catch(() => ({}));
    if (body?.confirm !== REQUIRED_CONFIRMATION) {
      return Response.json({ ok: false, error: `Reset requires confirm='${REQUIRED_CONFIRMATION}'` }, { status: 400 });
    }
    const before = await db.collection("orders").count().get();
    const deleted = Number(before.data().count || 0);
    await db.recursiveDelete(db.collection("orders"));
    const bookings = await releaseOrderBookingReservations(db);
    return Response.json({ ok: true, deleted, releasedBookingNumbers: bookings.released, clearedSharedLinks: bookings.cleared });
  } catch (error) { return errorResponse(error); }
}
