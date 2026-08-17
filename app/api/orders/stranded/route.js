import {
  STRANDED_DELIVERY_STATUSES,
  buildStrandedClosurePatch,
  isStrandedDeliveryOrder,
  orderServiceDateKey,
  strandedDeliveryReason
} from "../../../../lib/strandedDeliveries";
import { bangkokDateKey } from "../../../../lib/operationsReporting";
import { syncDeliveryOrderToSheet } from "../../../../lib/deliverySheetSync";
import { errorResponse, requireProfile } from "../../../../lib/workflowAuth";

export const runtime = "nodejs";

// สถานะกำลังส่งมีจำนวนไม่มากโดยธรรมชาติ (เท่าที่ค้างจริงคือหลักสิบ) เพดานนี้กันกรณีผิดปกติ
const SCAN_LIMIT = 500;
const MAX_CLOSE_PER_BATCH = 100;

function publicRow(id, order, todayKey) {
  return {
    id,
    serviceDate: orderServiceDateKey(order),
    status: order.status || "",
    queueStatus: order.queueStatus || "",
    customerName: order.customerName || "",
    zone: order.zone || "",
    driverId: order.driverId || "",
    driverName: order.driverName || "",
    cod: Number(order.cod) || 0,
    podPhotoCount: Number(order.podPhotoCount) || 0,
    sharedToLine: Boolean(order.sharedToLine),
    updatedAt: order.updatedAt || "",
    strandedReason: strandedDeliveryReason(order),
    daysStranded: (() => {
      const from = Date.parse(`${orderServiceDateKey(order)}T00:00:00+07:00`);
      const to = Date.parse(`${todayKey}T00:00:00+07:00`);
      return Number.isFinite(from) && Number.isFinite(to) ? Math.round((to - from) / 86_400_000) : 0;
    })()
  };
}

export async function GET(request) {
  try {
    const { db } = await requireProfile(request, ["sales", "admin"]);
    const todayKey = bangkokDateKey();
    const snap = await db.collection("orders").where("status", "in", STRANDED_DELIVERY_STATUSES).limit(SCAN_LIMIT).get();
    const rows = snap.docs
      .filter((doc) => isStrandedDeliveryOrder(doc.data() || {}, todayKey))
      .map((doc) => publicRow(doc.id, doc.data() || {}, todayKey))
      .sort((a, b) => a.serviceDate.localeCompare(b.serviceDate));
    return Response.json({ ok: true, data: { today: todayKey, count: rows.length, scanned: snap.size, orders: rows } });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request) {
  try {
    const { profile, db } = await requireProfile(request, ["sales", "admin"]);
    const body = await request.json();
    const reason = String(body?.reason || "").trim();
    const selectedIds = Array.isArray(body?.selectedIds)
      ? [...new Set(body.selectedIds.map((id) => String(id || "").trim()).filter(Boolean))]
      : [];
    if (!selectedIds.length) return Response.json({ ok: false, error: "ยังไม่ได้เลือกงานค้าง" }, { status: 400 });
    if (selectedIds.length > MAX_CLOSE_PER_BATCH) return Response.json({ ok: false, error: `ปิดได้ไม่เกิน ${MAX_CLOSE_PER_BATCH} งานต่อครั้ง` }, { status: 409 });
    if (selectedIds.some((id) => id.length > 120 || id.includes("/"))) return Response.json({ ok: false, error: "Invalid order id" }, { status: 400 });
    // ปิดงานย้อนหลังคือการยืนยันแทนคนขับ ต้องมีเหตุผลติดไว้กับทุกใบเสมอ
    if (reason.length < 5) return Response.json({ ok: false, error: "กรุณาระบุเหตุผลที่ปิดงานย้อนหลัง อย่างน้อย 5 ตัวอักษร" }, { status: 400 });

    const todayKey = bangkokDateKey();
    const refs = selectedIds.map((id) => db.collection("orders").doc(id));
    const auditRef = db.collection("audit_logs").doc();
    const now = new Date().toISOString();
    const batchId = `stranded_close_${now.replace(/[^0-9]/g, "").slice(0, 14)}`;
    const closedOrders = [];

    await db.runTransaction(async (transaction) => {
      closedOrders.length = 0;
      const snapshots = await Promise.all(refs.map((ref) => transaction.get(ref)));
      const blockingOrderIds = snapshots
        .filter((snapshot) => !snapshot.exists || !isStrandedDeliveryOrder(snapshot.data() || {}, todayKey))
        .map((snapshot) => snapshot.id);
      if (blockingOrderIds.length) {
        throw Object.assign(new Error("บางงานไม่เข้าเงื่อนไขงานค้างแล้ว (อาจถูกปิดไปก่อนหน้า)"), { status: 409, blockingOrderIds });
      }
      snapshots.forEach((snapshot) => {
        const order = snapshot.data() || {};
        const { patch, history } = buildStrandedClosurePatch(order, profile, now, { reason, batchId });
        transaction.set(snapshot.ref, patch, { merge: true });
        transaction.set(snapshot.ref.collection("activity").doc(), history);
        closedOrders.push({ id: snapshot.id, ...order, ...patch });
      });
      transaction.set(auditRef, {
        action: "stranded_close_bulk",
        batchId,
        count: selectedIds.length,
        orderIds: selectedIds,
        reason,
        uid: profile.uid,
        role: profile.role,
        name: profile.name || profile.email || "",
        createdAt: now
      });
    });

    const syncResults = await Promise.allSettled(closedOrders.map((order) => syncDeliveryOrderToSheet(db, order.id, order)));
    if (syncResults.some((result) => result.status === "rejected")) {
      console.warn("Delivery sheet sync failed after stranded closure", { batchId });
    }

    return Response.json({ ok: true, data: { batchId, count: selectedIds.length, closedIds: selectedIds } });
  } catch (error) {
    if (error?.status === 409 && Array.isArray(error.blockingOrderIds)) {
      return Response.json({ ok: false, error: error.message, blockingOrderIds: error.blockingOrderIds }, { status: 409 });
    }
    return errorResponse(error);
  }
}
