import {
  STRANDED_ACTIONS,
  STRANDED_SCAN_STATUSES,
  allowedStrandedActions,
  buildStrandedActionPatch,
  canApplyStrandedAction,
  orderServiceDateKey,
  strandedCategory,
  strandedDeliveryReason
} from "../../../../lib/strandedDeliveries";
import { bangkokDateKey } from "../../../../lib/operationsReporting";
import { syncDeliveryOrderToSheet } from "../../../../lib/deliverySheetSync";
import { errorResponse, requireProfile } from "../../../../lib/workflowAuth";

export const runtime = "nodejs";

// งานที่ยังไม่จบมีจำนวนไม่มากโดยธรรมชาติ เพดานนี้กันกรณีผิดปกติไม่ให้กวาดทั้ง collection
const SCAN_LIMIT = 1000;
const MAX_PER_BATCH = 100;

function daysBetween(fromKey, toKey) {
  const from = Date.parse(`${fromKey}T00:00:00+07:00`);
  const to = Date.parse(`${toKey}T00:00:00+07:00`);
  return Number.isFinite(from) && Number.isFinite(to) ? Math.round((to - from) / 86_400_000) : 0;
}

function publicRow(id, order, todayKey) {
  const category = strandedCategory(order, todayKey);
  const serviceDate = orderServiceDateKey(order);
  return {
    id,
    category,
    allowedActions: allowedStrandedActions(category),
    serviceDate,
    queueDate: String(order.driverQueueDate || ""),
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
    daysStranded: daysBetween(String(order.driverQueueDate || "") || serviceDate, todayKey)
  };
}

export async function GET(request) {
  try {
    const { db } = await requireProfile(request, ["sales", "admin"]);
    const todayKey = bangkokDateKey();
    const snap = await db.collection("orders").where("status", "in", STRANDED_SCAN_STATUSES).limit(SCAN_LIMIT).get();
    const rows = snap.docs
      .filter((doc) => strandedCategory(doc.data() || {}, todayKey))
      .map((doc) => publicRow(doc.id, doc.data() || {}, todayKey))
      .sort((a, b) => (a.queueDate || a.serviceDate).localeCompare(b.queueDate || b.serviceDate));
    return Response.json({
      ok: true,
      data: {
        today: todayKey,
        count: rows.length,
        scanned: snap.size,
        truncated: snap.size >= SCAN_LIMIT,
        inFlight: rows.filter((row) => row.category === "in_flight").length,
        expiredQueue: rows.filter((row) => row.category === "expired_queue").length,
        orders: rows
      }
    });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function POST(request) {
  try {
    const { profile, db } = await requireProfile(request, ["sales", "admin"]);
    const body = await request.json();
    const action = String(body?.action || "complete");
    const reason = String(body?.reason || "").trim();
    const selectedIds = Array.isArray(body?.selectedIds)
      ? [...new Set(body.selectedIds.map((id) => String(id || "").trim()).filter(Boolean))]
      : [];
    if (!STRANDED_ACTIONS.includes(action)) return Response.json({ ok: false, error: "การดำเนินการไม่ถูกต้อง" }, { status: 400 });
    if (!selectedIds.length) return Response.json({ ok: false, error: "ยังไม่ได้เลือกงานค้าง" }, { status: 400 });
    if (selectedIds.length > MAX_PER_BATCH) return Response.json({ ok: false, error: `ทำได้ไม่เกิน ${MAX_PER_BATCH} งานต่อครั้ง` }, { status: 409 });
    if (selectedIds.some((id) => id.length > 120 || id.includes("/"))) return Response.json({ ok: false, error: "Invalid order id" }, { status: 400 });
    // ทุกการดำเนินการย้อนหลังคือการตัดสินใจแทนคนขับ ต้องมีเหตุผลติดไว้กับทุกใบเสมอ
    if (reason.length < 5) return Response.json({ ok: false, error: "กรุณาระบุเหตุผล อย่างน้อย 5 ตัวอักษร" }, { status: 400 });

    const todayKey = bangkokDateKey();
    const refs = selectedIds.map((id) => db.collection("orders").doc(id));
    const auditRef = db.collection("audit_logs").doc();
    const now = new Date().toISOString();
    const batchId = `stranded_${action}_${now.replace(/[^0-9]/g, "").slice(0, 14)}`;
    const touchedOrders = [];

    await db.runTransaction(async (transaction) => {
      touchedOrders.length = 0;
      const snapshots = await Promise.all(refs.map((ref) => transaction.get(ref)));
      const blockingOrderIds = snapshots
        .filter((snapshot) => !snapshot.exists || !canApplyStrandedAction(snapshot.data() || {}, action, todayKey))
        .map((snapshot) => snapshot.id);
      if (blockingOrderIds.length) {
        throw Object.assign(
          new Error("บางงานทำรายการนี้ไม่ได้แล้ว (อาจถูกจัดการไปก่อนหน้า หรือไม่รองรับการดำเนินการนี้)"),
          { status: 409, blockingOrderIds }
        );
      }
      snapshots.forEach((snapshot) => {
        const order = snapshot.data() || {};
        const { patch, history } = buildStrandedActionPatch(order, action, profile, now, { reason, batchId });
        transaction.set(snapshot.ref, patch, { merge: true });
        transaction.set(snapshot.ref.collection("activity").doc(), history);
        touchedOrders.push({ id: snapshot.id, ...order, ...patch });
      });
      transaction.set(auditRef, {
        action: `stranded_${action}_bulk`,
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

    // งานที่ยกเลิกก็ต้องซิงก์ ไม่งั้นชีตจะยังโชว์ว่ารอส่งอยู่
    const syncResults = await Promise.allSettled(touchedOrders.map((order) => syncDeliveryOrderToSheet(db, order.id, order)));
    if (syncResults.some((result) => result.status === "rejected")) {
      console.warn("Delivery sheet sync failed after stranded action", { batchId, action });
    }

    return Response.json({ ok: true, data: { batchId, action, count: selectedIds.length, touchedIds: selectedIds } });
  } catch (error) {
    if (error?.status === 409 && Array.isArray(error.blockingOrderIds)) {
      return Response.json({ ok: false, error: error.message, blockingOrderIds: error.blockingOrderIds }, { status: 409 });
    }
    return errorResponse(error);
  }
}
