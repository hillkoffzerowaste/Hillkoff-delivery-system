import { requireProfile, errorResponse } from "../../../../lib/workflowAuth";
import { syncDeliveryOrderToSheet } from "../../../../lib/deliverySheetSync";

export const runtime = "nodejs";

const STORE_STATUSES = ["working", "checked", "partial", "waiting", "returned"];
const PACK_STATUSES = ["working", "checked", "partial", "waiting", "returned"];

export async function PATCH(request) {
  try {
    const { profile, db } = await requireProfile(request, ["sales", "store", "pack", "admin"]);
    const body = await request.json();
    const orderId = String(body?.orderId || "");
    const action = String(body?.action || "");
    if (!orderId) return Response.json({ ok: false, error: "Missing orderId" }, { status: 400 });
    const ref = db.collection("orders").doc(orderId);
    const snap = await ref.get();
    if (!snap.exists) return Response.json({ ok: false, error: "Order not found" }, { status: 404 });
    const order = snap.data();
    const now = new Date().toISOString();
    const history = { action, role: profile.role, name: profile.name, uid: profile.uid, at: now, note: String(body?.note || "") };
    const patch = { updatedAt: now, workflowHistory: [...(Array.isArray(order.workflowHistory) ? order.workflowHistory : []).slice(-99), history] };

    if (profile.role === "store" && action === "store_update") {
      if (!STORE_STATUSES.includes(body.storeStatus)) throw Object.assign(new Error("Invalid store status"), { status: 400 });
      if (["checked", "partial", "waiting"].includes(body.storeStatus) && !String(body.storeCheckerName || "").trim()) {
        throw Object.assign(new Error("กรุณาระบุชื่อผู้ตรวจสอบสโตร์"), { status: 400 });
      }
      patch.storeStatus = body.storeStatus; patch.storePackerName = String(body.storePackerName || profile.name); patch.storeCheckerName = String(body.storeCheckerName || ""); patch.missingItems = Array.isArray(body.missingItems) ? body.missingItems.slice(0, 20).map((item) => String(item || "").slice(0, 500)).filter(Boolean) : [];
      if (body.bookingNumber !== undefined) patch.bookingNumber = String(body.bookingNumber || "").trim().slice(0, 100);
      if (body.storeWorkDetails && typeof body.storeWorkDetails === "object") patch.storeWorkDetails = {
        detail: String(body.storeWorkDetails.detail || "").trim().slice(0, 2000),
        note: String(body.storeWorkDetails.note || "").trim().slice(0, 2000),
        photoLocal: Boolean(body.storeWorkDetails.photoLocal),
        localPhotoCount: Math.max(0, Math.min(5, Number(body.storeWorkDetails.localPhotoCount) || 0)),
        sharedToLine: Boolean(body.storeWorkDetails.sharedToLine),
        checklist: body.storeWorkDetails.checklist && typeof body.storeWorkDetails.checklist === "object" ? body.storeWorkDetails.checklist : {}, checkResult: String(body.storeWorkDetails.checkResult || "complete"),
        updatedAt: now
      };
      if (["checked", "partial"].includes(body.storeStatus) && !["working", "checked", "partial"].includes(order.packStatus)) patch.packStatus = "pending";
      else if (body.storeStatus === "waiting") patch.packStatus = "waiting";
    } else if (profile.role === "pack" && action === "pack_update") {
      if (!PACK_STATUSES.includes(body.packStatus)) throw Object.assign(new Error("Invalid pack status"), { status: 400 });
      const storeReady = order.deliveryMethod === "outstation" || order.workflowType === "direct_pack" || ["checked", "partial"].includes(order.storeStatus);
      if (!storeReady) throw Object.assign(new Error("ออเดอร์ยังไม่ได้รับการยืนยันจากสโตร์"), { status: 409 });
      if (["checked", "partial", "waiting"].includes(body.packStatus) && !String(body.packCheckerName || "").trim()) {
        throw Object.assign(new Error("กรุณาระบุชื่อผู้ตรวจสอบห้องแพ็ค"), { status: 400 });
      }
      patch.packStatus = body.packStatus; patch.packPackerName = String(body.packPackerName || profile.name); patch.packCheckerName = String(body.packCheckerName || ""); patch.missingItems = Array.isArray(body.missingItems) ? body.missingItems.slice(0, 20).map((item) => String(item || "").slice(0, 500)).filter(Boolean) : order.missingItems || []; patch.packPhotos = Array.isArray(body.packPhotos) ? body.packPhotos.slice(0, 20) : order.packPhotos || [];
      if (body.packWorkDetails && typeof body.packWorkDetails === "object") patch.packWorkDetails = {
        detail: String(body.packWorkDetails.detail || "").trim().slice(0, 2000),
        note: String(body.packWorkDetails.note || "").trim().slice(0, 2000),
        photoLocal: Boolean(body.packWorkDetails.photoLocal),
        localPhotoCount: Math.max(0, Math.min(5, Number(body.packWorkDetails.localPhotoCount) || 0)),
        sharedToLine: Boolean(body.packWorkDetails.sharedToLine),
        checklist: body.packWorkDetails.checklist && typeof body.packWorkDetails.checklist === "object" ? body.packWorkDetails.checklist : {}, checkResult: String(body.packWorkDetails.checkResult || "complete"),
        updatedAt: now
      };
      if (["checked", "partial"].includes(body.packStatus)) {
        patch.queueStatus = order.deliveryMethod === "grab_pickup" ? "grab_ready" : order.deliveryMethod === "outstation" ? "outstation_ready" : "ready";
        if (order.deliveryMethod === "outstation" && body.packStatus === "checked") {
          patch.storeStatus = "checked";
          patch.status = "พร้อมส่งขนส่ง";
          patch.outstationCompletedAt = now;
          patch.outstationCompletedBy = profile.name || profile.email;
        }
      }
      if (body.packStatus === "returned") {
        patch.storeStatus = "returned";
        patch.queueStatus = "preparing";
        patch.returnedToStoreAt = now;
        patch.returnedToStoreBy = profile.name || profile.email;
        patch.returnReason = String(body.returnReason || body.packWorkDetails?.note || "").trim().slice(0, 1000);
      }
    } else if (["sales", "admin"].includes(profile.role) && action === "grab_pickup") {
      if (order.deliveryMethod !== "grab_pickup" || order.queueStatus !== "grab_ready") {
        throw Object.assign(new Error("Grab pickup order is not ready"), { status: 409 });
      }
      patch.queueStatus = "grab_picked_up"; patch.status = "Grab รับสินค้าแล้ว"; patch.grabPickedUpAt = now; patch.grabPickedUpBy = profile.name || profile.email;
    } else if (["sales", "admin"].includes(profile.role) && action === "queue") {
      const storeOk = order.workflowType === "direct_pack" || ["checked", "partial"].includes(order.storeStatus);
      const packOk = ["checked", "partial"].includes(order.packStatus);
      if (!storeOk || !packOk) throw Object.assign(new Error("Order is not ready for driver queue"), { status: 409 });
      if (["grab_pickup", "outstation"].includes(order.deliveryMethod)) throw Object.assign(new Error("Grab pickup and outstation orders do not enter the driver queue"), { status: 409 });
      patch.queueStatus = "queued"; patch.status = "รอคนขับรับ"; patch.queuedAt = now; patch.queuedBy = profile.name || profile.email;
    } else {
      throw Object.assign(new Error("Action not allowed"), { status: 403 });
    }
    await ref.set(patch, { merge: true });
    await ref.collection("activity").doc().set(history);
    await syncDeliveryOrderToSheet(db, orderId, { ...order, ...patch });
    if (action === "queue") {
      try {
        const snap = await db.collection("push_tokens").where("role", "==", "driver").limit(500).get();
        const tokens = snap.docs.map((doc) => doc.id).filter(Boolean);
        if (tokens.length) {
          const admin = await import("firebase-admin");
          await admin.messaging().sendEachForMulticast({
            tokens,
            data: { type: "new_order", title: "มีออเดอร์พร้อมส่ง", body: `${order.customerName || orderId} พร้อมเข้าคิวคนขับ`, orderId },
            webpush: { headers: { Urgency: "high" }, fcmOptions: { link: "/" } }
          });
        }
      } catch (error) { console.warn("Queue push notification failed", error?.message || error); }
    }
    return Response.json({ ok: true, data: patch });
  } catch (error) { return errorResponse(error); }
}
