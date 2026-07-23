import { requireProfile, errorResponse } from "../../../../lib/workflowAuth";
import { syncDeliveryOrderToSheet } from "../../../../lib/deliverySheetSync";
import { getAdminMessaging } from "../../../../lib/firebaseAdmin";
import { BOOKING_NUMBER_PATTERN, bookingConflictMessage, bookingRegistryId, bookingRegistryRecord, normalizeBookingNumber } from "../../../../lib/bookingRegistry";

export const runtime = "nodejs";

const STORE_STATUSES = ["working", "checked", "partial", "waiting", "returned"];
const PACK_STATUSES = ["working", "checked", "partial", "waiting", "returned"];

export async function PATCH(request) {
  try {
    const { profile, db } = await requireProfile(request, ["sales", "store", "pack", "driver", "admin"]);
    const body = await request.json();
    const orderId = String(body?.orderId || "");
    const action = String(body?.action || "");
    if (!orderId) return Response.json({ ok: false, error: "Missing orderId" }, { status: 400 });
    if (orderId.length > 120 || orderId.includes("/")) return Response.json({ ok: false, error: "Invalid orderId" }, { status: 400 });
    const ref = db.collection("orders").doc(orderId);
    const snap = await ref.get();
    if (!snap.exists) return Response.json({ ok: false, error: "Order not found" }, { status: 404 });
    const order = snap.data();
    const now = new Date().toISOString();
    const history = { action, role: profile.role, name: profile.name, uid: profile.uid, at: now, note: String(body?.note || "").trim().slice(0, 1000) };
    const patch = { updatedAt: now, workflowHistory: [...(Array.isArray(order.workflowHistory) ? order.workflowHistory : []).slice(-99), history] };
    let bookingReservation = null;
    let previousBookingReservationRef = null;

    if (profile.role === "driver" && ["driver_cancel", "driver_complete"].includes(action)) {
      if (String(order.driverId || "") !== String(profile.driverId || "")) {
        throw Object.assign(new Error("Driver can update only an assigned order"), { status: 403 });
      }
      if (action === "driver_cancel") {
        if (!["กำลังส่ง", "กำลังจัดส่ง"].includes(String(order.status || ""))) {
          throw Object.assign(new Error("Order is not in an active delivery state"), { status: 409 });
        }
        const reason = String(body.reason || "").trim().slice(0, 1000);
        if (!reason) throw Object.assign(new Error("Cancellation reason is required"), { status: 400 });
        patch.driverId = "";
        patch.driverName = "";
        patch.status = "รอคนขับรับ";
        patch.queueStatus = "queued";
        patch.complaint = reason;
        patch.sharedToLine = false;
        patch.acceptedAt = "";
        patch.driverSequence = 0;
        patch.driverSequenceServiceDate = "";
        patch.driverSequenceUpdatedAt = "";
        patch.driverSequenceUpdatedBy = "";
        Object.assign(history, { result: "returned_to_queue", reason });
      } else {
        if (!["กำลังส่ง", "กำลังจัดส่ง", "ส่งสำเร็จ"].includes(String(order.status || ""))) {
          throw Object.assign(new Error("Order is not in a delivery state"), { status: 409 });
        }
        const deliveredAt = String(body.deliveredAt || now).trim().slice(0, 80) || now;
        const driverNote = String(body.driverNote || "").trim().slice(0, 2000);
        patch.status = "ส่งสำเร็จ";
        patch.queueStatus = "completed";
        patch.deliveredAt = deliveredAt;
        patch.driverNote = driverNote;
        patch.sharedToLine = true;
        const podPhotoCount = Number(body.podPhotoCount);
        patch.podPhotoCount = Number.isFinite(podPhotoCount) ? Math.max(0, Math.min(5, podPhotoCount)) : Math.max(0, Math.min(5, Number(order.podPhotoCount) || 0));
        Object.assign(history, { result: "delivered", podPhotoCount: patch.podPhotoCount });
      }
    } else if (profile.role === "pack" && action === "pack_archive") {
      const reason = String(body.reason || "").trim().slice(0, 1000);
      if (!reason) throw Object.assign(new Error("กรุณาระบุเหตุผลที่นำออเดอร์ออกจากคิว"), { status: 400 });
      if (["queued", "completed"].includes(String(order.queueStatus || "")) || order.driverId) {
        throw Object.assign(new Error("ออเดอร์นี้เข้าคิวคนขับแล้ว ไม่สามารถนำออกจากห้องแพ็คได้"), { status: 409 });
      }
      patch.queueStatus = "pack_archived";
      patch.status = "นำออกจากคิวห้องแพ็ค";
      patch.packArchivedAt = now;
      patch.packArchivedBy = profile.name || profile.email;
      patch.packArchiveReason = reason;
      Object.assign(history, { result: "archived", reason });
    } else if (profile.role === "store" && action === "store_update") {
      if (!STORE_STATUSES.includes(body.storeStatus)) throw Object.assign(new Error("Invalid store status"), { status: 400 });
      if (["checked", "partial", "waiting"].includes(body.storeStatus) && !String(body.storeCheckerName || "").trim()) {
        throw Object.assign(new Error("กรุณาระบุชื่อผู้ตรวจสอบสโตร์"), { status: 400 });
      }
      patch.storeStatus = body.storeStatus; patch.storePackerName = String(body.storePackerName || profile.name).slice(0, 160); patch.storeCheckerName = String(body.storeCheckerName || "").slice(0, 160); patch.missingItems = Array.isArray(body.missingItems) ? body.missingItems.slice(0, 20).map((item) => String(item || "").slice(0, 500)).filter(Boolean) : [];
      Object.assign(history, { fromStatus: order.storeStatus || "pending", toStatus: body.storeStatus, result: body.storeWorkDetails?.checkResult || "", packerName: patch.storePackerName, checkerName: patch.storeCheckerName, missingItems: patch.missingItems });
      if (body.bookingNumber !== undefined) {
        const bookingNumber = normalizeBookingNumber(body.bookingNumber).slice(0, 100);
        if (!BOOKING_NUMBER_PATTERN.test(bookingNumber)) throw Object.assign(new Error("Booking number must use PREFIX-1234 format"), { status: 400 });
        const existingNumbers = [...new Set((Array.isArray(order.bookingNumbers) ? order.bookingNumbers : [order.bookingNumber]).map(normalizeBookingNumber).filter((value) => BOOKING_NUMBER_PATTERN.test(value)))];
        const previousPrimaryNumber = existingNumbers[0] || "";
        const serviceDate = String(order.serviceDate || order.createdAt || now).slice(0, 10);
        const registryId = bookingRegistryId(serviceDate, bookingNumber);
        if (!registryId) throw Object.assign(new Error("Invalid booking month"), { status: 400 });
        const reservationRef = db.collection("booking_month_registry").doc(registryId);
        const reservationSnap = await reservationRef.get();
        if (reservationSnap.exists && reservationSnap.data()?.sourceId !== orderId) {
          throw Object.assign(new Error(bookingConflictMessage(reservationSnap.data())), { status: 409 });
        }
        patch.bookingNumber = bookingNumber;
        patch.bookingNumbers = [bookingNumber, ...existingNumbers.filter((value) => value !== previousPrimaryNumber && value !== bookingNumber)];
        if (!reservationSnap.exists) bookingReservation = { ref: reservationRef, data: bookingRegistryRecord({ serviceDate, bookingNumber, source: "order", sourceId: orderId, customerName: order.customerName, createdAt: now, createdBy: profile.name || profile.uid }) };
        if (previousPrimaryNumber && previousPrimaryNumber !== bookingNumber) {
          const previousRegistryId = bookingRegistryId(serviceDate, previousPrimaryNumber);
          if (previousRegistryId) {
            const previousRef = db.collection("booking_month_registry").doc(previousRegistryId);
            const previousSnap = await previousRef.get();
            if (previousSnap.exists && previousSnap.data()?.sourceId === orderId) previousBookingReservationRef = previousRef;
          }
          Object.assign(history, { bookingNumberFrom: previousPrimaryNumber, bookingNumberTo: bookingNumber });
        }
      }
      if (body.storeWorkDetails && typeof body.storeWorkDetails === "object") patch.storeWorkDetails = {
        detail: String(body.storeWorkDetails.detail || "").trim().slice(0, 2000),
        note: String(body.storeWorkDetails.note || "").trim().slice(0, 2000),
        photoLocal: Boolean(body.storeWorkDetails.photoLocal),
        localPhotoCount: Math.max(0, Math.min(5, Number(body.storeWorkDetails.localPhotoCount) || 0)),
        sharedToLine: Boolean(body.storeWorkDetails.sharedToLine),
        checklist: { verified: body.storeWorkDetails.checklist?.verified === true }, checkResult: String(body.storeWorkDetails.checkResult || "complete").slice(0, 40),
        updatedAt: now
      };
      if (["checked", "partial"].includes(body.storeStatus) && !["working", "checked", "partial"].includes(order.packStatus)) patch.packStatus = "pending";
      else if (body.storeStatus === "waiting") patch.packStatus = "waiting";
      if (order.storeStatus === "returned" && ["checked", "partial"].includes(body.storeStatus)) {
        patch.queueStatus = "preparing";
        patch.status = "สโตร์แก้ไขแล้ว · รอห้องแพ็คตรวจซ้ำ";
        patch.returnResolvedAt = now;
        patch.returnResolvedBy = profile.name || profile.email;
        patch.returnResolutionNote = String(body.storeWorkDetails?.note || body.storeWorkDetails?.detail || "").trim().slice(0, 1000);
        Object.assign(history, { result: "return_resolved", returnResolvedAt: now, returnResolutionNote: patch.returnResolutionNote });
      }
    } else if (profile.role === "pack" && action === "pack_update") {
      if (!PACK_STATUSES.includes(body.packStatus)) throw Object.assign(new Error("Invalid pack status"), { status: 400 });
      const storeReady = order.workflowType === "direct_pack" || ["checked", "partial"].includes(order.storeStatus);
      if (!storeReady) throw Object.assign(new Error("ออเดอร์ยังไม่ได้รับการยืนยันจากสโตร์"), { status: 409 });
      if (["checked", "partial", "waiting"].includes(body.packStatus) && !String(body.packCheckerName || "").trim()) {
        throw Object.assign(new Error("กรุณาระบุชื่อผู้ตรวจสอบห้องแพ็ค"), { status: 400 });
      }
      patch.packStatus = body.packStatus; patch.packPackerName = String(body.packPackerName || profile.name).slice(0, 160); patch.packCheckerName = String(body.packCheckerName || "").slice(0, 160); patch.missingItems = Array.isArray(body.missingItems) ? body.missingItems.slice(0, 20).map((item) => String(item || "").slice(0, 500)).filter(Boolean) : order.missingItems || [];
      Object.assign(history, { fromStatus: order.packStatus || "pending", toStatus: body.packStatus, result: body.packWorkDetails?.checkResult || "", packerName: patch.packPackerName, checkerName: patch.packCheckerName, missingItems: patch.missingItems });
      if (body.packWorkDetails && typeof body.packWorkDetails === "object") patch.packWorkDetails = {
        detail: String(body.packWorkDetails.detail || "").trim().slice(0, 2000),
        note: String(body.packWorkDetails.note || "").trim().slice(0, 2000),
        photoLocal: Boolean(body.packWorkDetails.photoLocal),
        localPhotoCount: Math.max(0, Math.min(5, Number(body.packWorkDetails.localPhotoCount) || 0)),
        sharedToLine: Boolean(body.packWorkDetails.sharedToLine),
        checklist: { verified: body.packWorkDetails.checklist?.verified === true }, checkResult: String(body.packWorkDetails.checkResult || "complete").slice(0, 40),
        updatedAt: now
      };
      if (["checked", "partial"].includes(body.packStatus)) {
        patch.queueStatus = ["grab_pickup", "customer_pickup"].includes(order.deliveryMethod) ? "grab_ready" : order.deliveryMethod === "outstation" ? "outstation_ready" : "ready";
        if (["grab_pickup", "customer_pickup"].includes(order.deliveryMethod) && body.packStatus === "checked") {
          patch.status = order.deliveryMethod === "customer_pickup" ? "แพ็คเสร็จ · รอลูกค้ารับหน้าร้าน" : "แพ็คเสร็จ · รอ Grab รับสินค้า";
          patch.grabReadyAt = now;
          patch.grabReadyBy = profile.name || profile.email;
        }
        if (order.deliveryMethod === "outstation" && body.packStatus === "checked") {
          patch.storeStatus = "checked";
          patch.status = "พร้อมส่งขนส่ง";
          patch.outstationCompletedAt = now;
          patch.outstationCompletedBy = profile.name || profile.email;
        }
      }
      if (body.packStatus === "returned") {
        if (order.workflowType === "direct_pack" || order.deliveryMethod === "outstation") {
          throw Object.assign(new Error("ออเดอร์ส่งตรงห้องแพ็ค ไม่สามารถส่งกลับสโตร์ได้"), { status: 409 });
        }
        patch.storeStatus = "returned";
        patch.queueStatus = "preparing";
        patch.status = "ส่งกลับสโตร์ตรวจสอบ";
        patch.returnedToStoreAt = now;
        patch.returnedToStoreBy = profile.name || profile.email;
        patch.returnReason = String(body.returnReason || body.packWorkDetails?.note || "").trim().slice(0, 1000);
        Object.assign(history, { result: "returned", reason: patch.returnReason, storePackerName: order.storePackerName || "", storeCheckerName: order.storeCheckerName || "" });
      }
    } else if (["sales", "admin"].includes(profile.role) && action === "grab_pickup") {
      if (!["grab_pickup", "customer_pickup"].includes(order.deliveryMethod) || order.queueStatus !== "grab_ready") {
        throw Object.assign(new Error("Grab pickup order is not ready"), { status: 409 });
      }
      patch.queueStatus = "grab_picked_up"; patch.status = order.deliveryMethod === "customer_pickup" ? "ลูกค้ารับสินค้าแล้ว" : "Grab รับสินค้าแล้ว"; patch.grabPickedUpAt = now; patch.grabPickedUpBy = profile.name || profile.email;
    } else if (["sales", "admin"].includes(profile.role) && action === "queue") {
      const storeOk = order.workflowType === "direct_pack" || ["checked", "partial"].includes(order.storeStatus);
      const packOk = ["checked", "partial"].includes(order.packStatus);
      if (!storeOk || !packOk) throw Object.assign(new Error("Order is not ready for driver queue"), { status: 409 });
      if (["grab_pickup", "customer_pickup", "outstation"].includes(order.deliveryMethod)) throw Object.assign(new Error("Pickup and outstation orders do not enter the driver queue"), { status: 409 });
      patch.queueStatus = "queued"; patch.status = "รอคนขับรับ"; patch.queuedAt = now; patch.queuedBy = profile.name || profile.email;
    } else {
      throw Object.assign(new Error("Action not allowed"), { status: 403 });
    }
    const batch = db.batch();
    batch.update(ref, patch, { lastUpdateTime: snap.updateTime });
    batch.set(ref.collection("activity").doc(), history);
    if (bookingReservation) batch.create(bookingReservation.ref, bookingReservation.data);
    if (previousBookingReservationRef) batch.delete(previousBookingReservationRef);
    await batch.commit();
    try {
      await syncDeliveryOrderToSheet(db, orderId, { ...order, ...patch });
    } catch (syncError) {
      console.warn("Delivery sheet sync failed after workflow update", syncError?.message || syncError);
    }
    if (action === "queue") {
      try {
        const snap = await db.collection("push_tokens").where("role", "==", "driver").limit(500).get();
        const tokens = snap.docs.map((doc) => doc.id).filter(Boolean);
        if (tokens.length) {
          await getAdminMessaging().sendEachForMulticast({
            tokens,
            data: { type: "new_order", title: "มีออเดอร์พร้อมส่ง", body: `${order.customerName || orderId} พร้อมเข้าคิวคนขับ`, orderId },
            webpush: { headers: { Urgency: "high" }, fcmOptions: { link: "/" } }
          });
        }
      } catch (error) { console.warn("Queue push notification failed", error?.message || error); }
    }
    return Response.json({ ok: true, data: patch });
  } catch (error) {
    if ([9, 10].includes(Number(error?.code))) {
      return Response.json({ ok: false, error: "Order changed concurrently; refresh and try again" }, { status: 409 });
    }
    return errorResponse(error);
  }
}
