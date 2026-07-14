import { getAdminDb, getAdminAuth } from "../../../../lib/firebaseAdmin";
import { pushLineText } from "../../../../lib/lineOa";
import { syncDeliveryOrderToSheet } from "../../../../lib/deliverySheetSync";
import { customerSearchRecord } from "../../../../lib/customerSearchIndex";

export const runtime = "nodejs";

function normalizePhoneDigits(raw) {
  return String(raw || "").replace(/\D/g, "");
}

function toServiceDateKey(dateLike) {
  const date = dateLike ? new Date(dateLike) : new Date();
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Bangkok",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(date);
  const y = parts.find((p) => p.type === "year")?.value || "1970";
  const m = parts.find((p) => p.type === "month")?.value || "01";
  const d = parts.find((p) => p.type === "day")?.value || "01";
  return `${y}-${m}-${d}`;
}

function buildLineMessage(orderId, order) {
  const customerName = String(order?.customerName || "").trim() || "ลูกค้า";
  return [
    "Hillkoff Delivery",
    "มีงานใหม่เพิ่มในคิวคนขับ",
    `ลูกค้า: ${customerName}`,
    `งาน: ${orderId}`,
    "เปิดระบบเพื่อดูรายละเอียดและรับงาน"
  ].join("\n");
}

export async function POST(request) {
  let payload;
  try {
    payload = await request.json();
  } catch {
    return Response.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  const idToken = String(payload?.idToken || "").trim();
  const order = payload?.order && typeof payload.order === "object" ? payload.order : null;

  if (!idToken) return Response.json({ ok: false, error: "Missing idToken" }, { status: 400 });
  if (!order?.id) return Response.json({ ok: false, error: "Missing order" }, { status: 400 });

  try {
    const auth = getAdminAuth();
    const decoded = await auth.verifyIdToken(idToken, true);
    const db = getAdminDb();

    const next = {
      customerId: String(order.customerId || ""),
      customerName: String(order.customerName || ""),
      customerPhone: String(order.customerPhone || ""),
      customerPhoneDigits: normalizePhoneDigits(order.customerPhone || ""),
      zone: String(order.zone || ""),
      address: String(order.address || ""),
      mapUrl: String(order.mapUrl || ""),
      window: String(order.window || ""),
      boxes: Number(order.boxes || 0),
      paymentType: String(order.paymentType || "COD"),
      cod: Number(order.cod || 0),
      driverId: String(order.driverId || ""),
      driverName: String(order.driverName || ""),
      salesName: String(order.salesName || ""),
      salesPhone: String(order.salesPhone || ""),
      status: "รอจัดเตรียมสินค้า",
      workflowType: order.deliveryMethod === "outstation" ? "store_route" : order.workflowType === "direct_pack" ? "direct_pack" : "store_route",
      deliveryMethod: ["grab_pickup", "outstation"].includes(order.deliveryMethod) ? order.deliveryMethod : "company_driver",
      bookingNumber: String(order.bookingNumber || "").trim().slice(0, 100),
      shippingCarrier: String(order.shippingCarrier || "").trim().slice(0, 100),
      storeStatus: order.workflowType === "direct_pack" ? "skipped" : "pending",
      packStatus: order.workflowType === "direct_pack" ? "pending" : "blocked",
      queueStatus: "preparing",
      storePackerName: "",
      storeCheckerName: "",
      packPackerName: "",
      packCheckerName: "",
      packPhotos: [],
      missingItems: [],
      workflowHistory: [{ action: "created", role: "sales", uid: decoded.uid, at: new Date().toISOString() }],
      photo: String(order.photo || ""),
      checkInAt: String(order.checkInAt || ""),
      deliveredAt: String(order.deliveredAt || ""),
      complaint: String(order.complaint || ""),
      salesNote: String(order.salesNote || ""),
      driverNote: String(order.driverNote || ""),
      serviceDate: String(order.serviceDate || toServiceDateKey(order.createdAt)),
      createdAt: String(order.createdAt || new Date().toISOString()),
      updatedAt: new Date().toISOString(),
      createdByUid: decoded.uid
    };

    await db.collection("orders").doc(String(order.id)).set(next, { merge: true });
    await db.collection("orders").doc(String(order.id)).collection("activity").doc().set(next.workflowHistory[0]);
    await db.collection("customer_search").doc(String(next.customerId || `legacy-${order.id}`)).set(customerSearchRecord({ name: next.customerName, phone: next.customerPhone, zone: next.zone, address: next.address, mapUrl: next.mapUrl }), { merge: true });
    await syncDeliveryOrderToSheet(db, order.id, next);

    // New orders stay out of the driver queue until sales explicitly queues them.
    if (next.queueStatus === "queued") try {
      const snap = await db.collection("push_tokens").where("role", "==", "driver").limit(500).get();
      const tokens = snap.docs.map((d) => d.id).filter(Boolean);
      if (tokens.length) {
        const admin = await import("firebase-admin");
        const response = await admin.messaging().sendEachForMulticast({
          tokens,
          data: {
            type: "new_order",
            title: "มีออเดอร์ใหม่",
            body: "มีงานใหม่เพิ่มในคิวคนขับ",
            orderId: String(order.id),
            customerName: String(next.customerName || ""),
            zone: String(next.zone || "")
          },
          webpush: {
            headers: { Urgency: "high" },
            fcmOptions: { link: "/" }
          }
        });

        const staleTokenDeletes = [];
        response.responses.forEach((result, index) => {
          const code = result.error?.code || "";
          if (code.includes("registration-token-not-registered") || code.includes("invalid-registration-token")) {
            staleTokenDeletes.push(db.collection("push_tokens").doc(tokens[index]).delete());
          }
        });
        if (staleTokenDeletes.length) await Promise.allSettled(staleTokenDeletes);
      }
    } catch (e) {
      console.warn("Push notification failed", e?.message || e);
    }

    try {
      const text = buildLineMessage(String(order.id), next);
      const lineResult = await pushLineText({
        text,
        metadata: { orderId: String(order.id), source: "orders.create" }
      });
      await db.collection("notifications").add({
        channel: "line",
        type: "new_order",
        orderId: String(order.id),
        text,
        result: lineResult,
        createdByUid: decoded.uid,
        createdAt: new Date().toISOString()
      });
    } catch (e) {
      console.warn("LINE OA notification failed", e?.message || e);
    }

    return Response.json({ ok: true, data: { id: String(order.id) } });
  } catch (e) {
    return Response.json({ ok: false, error: e?.message || String(e) }, { status: 401 });
  }
}
