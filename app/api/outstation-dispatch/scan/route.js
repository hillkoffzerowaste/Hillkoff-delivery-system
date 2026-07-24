import { requireProfile, errorResponse } from "../../../../lib/workflowAuth";
import { syncDeliveryOrderToSheet } from "../../../../lib/deliverySheetSync";
import {
  applyOutstationBoxScan,
  parseOutstationQrPayload,
  validateOutstationDispatchOrder
} from "../../../../lib/outstationDispatch";

export const runtime = "nodejs";

export async function POST(request) {
  try {
    const { profile, db } = await requireProfile(request, ["sales", "pack", "admin"]);
    const payload = parseOutstationQrPayload((await request.json())?.qrPayload);
    const ref = db.collection("orders").doc(payload.orderId);
    let response;

    await db.runTransaction(async transaction => {
      const snap = await transaction.get(ref);
      if (!snap.exists) throw Object.assign(new Error("ไม่พบออเดอร์จาก QR นี้"), { status: 404 });
      const order = { id: snap.id, ...(snap.data() || {}) };
      if (!validateOutstationDispatchOrder(order)) {
        throw Object.assign(new Error("ออเดอร์นี้ยังไม่พร้อมส่งขนส่ง หรือปิดงานแล้ว"), { status: 409 });
      }
      const now = new Date().toISOString();
      const result = applyOutstationBoxScan(order, payload, profile, now);
      transaction.update(ref, result.patch);
      if (!result.duplicate) {
        transaction.set(ref.collection("activity").doc(), {
          action: "outstation_dispatch_scan",
          role: profile.role,
          name: profile.name || profile.email || "",
          uid: profile.uid || "",
          at: now,
          boxLabel: `${payload.boxIndex}/${result.expectedCount}`,
          result: result.complete ? "completed" : "scanned"
        });
      }
      response = {
        order: { ...order, ...result.patch },
        duplicate: result.duplicate,
        complete: result.complete,
        scannedCount: result.scannedCount,
        expectedCount: result.expectedCount
      };
    });

    try {
      await syncDeliveryOrderToSheet(db, payload.orderId, response.order);
    } catch (syncError) {
      console.warn("Delivery sheet sync failed after outstation QR scan", syncError?.message || syncError);
    }
    return Response.json({ ok: true, data: response });
  } catch (error) {
    return errorResponse(error);
  }
}
