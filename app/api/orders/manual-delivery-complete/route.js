import { syncDeliveryOrderToSheet } from "../../../../lib/deliverySheetSync";
import { buildSalesManualDeliveryCompletionPatch } from "../../../../lib/manualDeliveryCompletion";
import { errorResponse, requireProfile } from "../../../../lib/workflowAuth";

export const runtime = "nodejs";

const MAX_PER_BATCH = 100;
const ACTIVE_DELIVERY_STATUSES = new Set(["กำลังส่ง", "กำลังจัดส่ง"]);

function cleanId(value) {
  return String(value || "").trim();
}

function isActiveDriver(data = {}) {
  return data.role === "driver" && data.active !== false && !["disabled", "rejected"].includes(String(data.status || ""));
}

function driverRecord(doc) {
  const data = doc.data() || {};
  const profile = data.driverProfile || {};
  return {
    id: cleanId(data.driverId || `driver_${data.phoneDigits || doc.id}`),
    name: cleanId(data.name || [profile.firstName, profile.lastName].filter(Boolean).join(" ") || data.phone || doc.id)
  };
}

export async function POST(request) {
  try {
    const { profile, db } = await requireProfile(request, ["sales", "admin"]);
    const body = await request.json();
    const reason = String(body?.reason || "").trim();
    const rawItems = Array.isArray(body?.items) ? body.items : [];
    const byOrderId = new Map();
    for (const item of rawItems) {
      const orderId = cleanId(item?.orderId);
      const driverId = cleanId(item?.driverId);
      if (!orderId || !driverId || orderId.length > 120 || driverId.length > 160 || orderId.includes("/")) {
        return Response.json({ ok: false, error: "ข้อมูลออเดอร์หรือคนขับไม่ถูกต้อง" }, { status: 400 });
      }
      if (byOrderId.has(orderId)) return Response.json({ ok: false, error: "เลือกออเดอร์ซ้ำ" }, { status: 400 });
      byOrderId.set(orderId, { orderId, driverId });
    }
    const items = [...byOrderId.values()];
    if (!items.length) return Response.json({ ok: false, error: "ยังไม่ได้เลือกงานที่ต้องการจบ" }, { status: 400 });
    if (items.length > MAX_PER_BATCH) return Response.json({ ok: false, error: `ทำได้ไม่เกิน ${MAX_PER_BATCH} งานต่อครั้ง` }, { status: 409 });
    if (reason.length < 5) return Response.json({ ok: false, error: "กรุณาระบุเหตุผล อย่างน้อย 5 ตัวอักษร" }, { status: 400 });

    const driversSnap = await db.collection("users_by_phone").where("role", "==", "driver").get();
    const driversById = new Map(driversSnap.docs
      .filter((doc) => isActiveDriver(doc.data() || {}))
      .map((doc) => {
        const driver = driverRecord(doc);
        return [driver.id, driver];
      })
      .filter(([id]) => Boolean(id)));
    const unknownDriverIds = [...new Set(items.map((item) => item.driverId).filter((id) => !driversById.has(id)))];
    if (unknownDriverIds.length) {
      return Response.json({ ok: false, error: "พบคนขับที่ไม่อยู่ในรายชื่อหรือปิดใช้งานแล้ว", unknownDriverIds }, { status: 400 });
    }

    const now = new Date().toISOString();
    const batchId = `sales_manual_delivery_${now.replace(/[^0-9]/g, "").slice(0, 14)}`;
    const refs = items.map(({ orderId }) => db.collection("orders").doc(orderId));
    const auditRef = db.collection("audit_logs").doc();
    const touchedOrders = [];

    await db.runTransaction(async (transaction) => {
      touchedOrders.length = 0;
      const snapshots = await Promise.all(refs.map((ref) => transaction.get(ref)));
      const blockingOrderIds = snapshots
        .filter((snapshot) => {
          const order = snapshot.data() || {};
          return !snapshot.exists || !ACTIVE_DELIVERY_STATUSES.has(String(order.status || "")) || String(order.queueStatus || "") === "completed";
        })
        .map((snapshot) => snapshot.id);
      if (blockingOrderIds.length) {
        throw Object.assign(new Error("บางงานทำรายการนี้ไม่ได้แล้ว (อาจถูกปิดไปก่อนหน้า หรือไม่ได้อยู่ระหว่างจัดส่ง)"), { status: 409, blockingOrderIds });
      }
      snapshots.forEach((snapshot, index) => {
        const order = snapshot.data() || {};
        const driver = driversById.get(items[index].driverId);
        const { patch, history } = buildSalesManualDeliveryCompletionPatch(order, profile, driver, now, { reason });
        transaction.set(snapshot.ref, patch, { merge: true });
        transaction.set(snapshot.ref.collection("activity").doc(), history);
        touchedOrders.push({ id: snapshot.id, ...order, ...patch });
      });
      transaction.set(auditRef, {
        action: "sales_manual_delivery_complete_bulk",
        batchId,
        count: items.length,
        items,
        reason,
        uid: profile.uid,
        role: profile.role,
        name: profile.name || profile.email || "",
        createdAt: now
      });
    });

    const syncResults = await Promise.allSettled(touchedOrders.map((order) => syncDeliveryOrderToSheet(db, order.id, order)));
    if (syncResults.some((result) => result.status === "rejected")) {
      console.warn("Delivery sheet sync failed after sales manual delivery completion", { batchId });
    }
    return Response.json({ ok: true, data: { batchId, count: items.length, completedIds: items.map((item) => item.orderId) } });
  } catch (error) {
    if (error?.status === 409 && Array.isArray(error.blockingOrderIds)) {
      return Response.json({ ok: false, error: error.message, blockingOrderIds: error.blockingOrderIds }, { status: 409 });
    }
    return errorResponse(error);
  }
}
