import { errorResponse, requireProfile } from "../../../../lib/workflowAuth";
import { getAdminMessaging } from "../../../../lib/firebaseAdmin";
import { pushLineText } from "../../../../lib/lineOa";
import { syncDeliveryOrderToSheet } from "../../../../lib/deliverySheetSync";
import { customerSearchRecord } from "../../../../lib/customerSearchIndex";

export const runtime = "nodejs";

const BOOKING_NUMBER_PATTERN = /^[^-\s]{1,20}-\d{4}$/;

function normalizePhoneDigits(raw) {
  return String(raw || "").replace(/\D/g, "");
}

function clean(value, max = 500) {
  return String(value || "").trim().slice(0, max);
}

function validDateKey(value) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

function safeHttpUrl(value) {
  const input = clean(value, 1500);
  if (!input) return "";
  try {
    const url = new URL(input);
    return ["http:", "https:"].includes(url.protocol) ? input : "";
  } catch {
    return "";
  }
}

function finiteNumber(value, { min = 0, max = Number.MAX_SAFE_INTEGER, integer = false } = {}) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < min || number > max) return null;
  return integer ? Math.trunc(number) : number;
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

  const order = payload?.order && typeof payload.order === "object" ? payload.order : null;

  const orderId = clean(order?.id, 120);
  if (!/^[A-Za-z0-9._-]{1,120}$/.test(orderId)) return Response.json({ ok: false, error: "Invalid order id" }, { status: 400 });

  try {
    const { profile, db, decoded } = await requireProfile(request, ["sales", "admin"]);
    const bookingNumber = String(order.bookingNumber || "").trim();
    if (bookingNumber.length > 100 || (bookingNumber && !BOOKING_NUMBER_PATTERN.test(bookingNumber))) {
      return Response.json({ ok: false, error: "Booking number must use PREFIX-1234 format" }, { status: 400 });
    }
    const customerId = clean(order.customerId, 120);
    if (!/^[A-Za-z0-9._-]{1,120}$/.test(customerId)) return Response.json({ ok: false, error: "A valid customer is required" }, { status: 400 });
    const customerSnap = await db.collection("customers").doc(customerId).get();
    if (!customerSnap.exists) return Response.json({ ok: false, error: "Customer not found" }, { status: 404 });
    const customer = customerSnap.data() || {};
    const customerName = clean(customer.name, 200);
    if (!customerName) return Response.json({ ok: false, error: "Customer profile is incomplete" }, { status: 409 });
    const boxes = finiteNumber(order.boxes || 0, { min: 0, max: 10000, integer: true });
    const cod = finiteNumber(order.cod || 0, { min: 0, max: 1_000_000_000 });
    if (boxes === null || cod === null) return Response.json({ ok: false, error: "Invalid order amounts" }, { status: 400 });
    const now = new Date().toISOString();
    const requestedServiceDate = clean(order.serviceDate, 10);
    const serviceDate = requestedServiceDate || toServiceDateKey(now);
    if (!validDateKey(serviceDate)) return Response.json({ ok: false, error: "Invalid serviceDate" }, { status: 400 });
    const orderRef = db.collection("orders").doc(orderId);
    const deliveryMethod = ["grab_pickup", "customer_pickup", "outstation"].includes(order.deliveryMethod) ? order.deliveryMethod : "company_driver";
    const workflowType = deliveryMethod === "outstation" ? "direct_pack" : order.workflowType === "direct_pack" ? "direct_pack" : "store_route";

    const next = {
      customerId,
      customerName,
      customerPhone: clean(customer.phone, 40),
      customerPhoneDigits: normalizePhoneDigits(customer.phoneDigits || customer.phone || ""),
      zone: clean(customer.zone, 200),
      address: clean(customer.address, 1500),
      mapUrl: safeHttpUrl(customer.mapUrl),
      window: clean(order.window, 100),
      boxes,
      packageUnit: order.packageUnit === "bag" ? "bag" : "box",
      paymentType: clean(order.paymentType || "COD", 50),
      cod,
      driverId: clean(order.driverId, 120),
      driverName: clean(order.driverName, 200),
      salesName: clean(profile.name || profile.email, 200),
      salesPhone: clean(profile.phone, 40),
      status: "รอจัดเตรียมสินค้า",
      workflowType,
      deliveryMethod,
      bookingNumber: bookingNumber.slice(0, 100),
      shippingCarrier: String(order.shippingCarrier || "").trim().slice(0, 100),
      storeStatus: workflowType === "direct_pack" ? "skipped" : "pending",
      packStatus: workflowType === "direct_pack" ? "pending" : "blocked",
      queueStatus: "preparing",
      storePackerName: "",
      storeCheckerName: "",
      packPackerName: "",
      packCheckerName: "",
      packPhotos: [],
      missingItems: [],
      workflowHistory: [{ action: "created", role: profile.role, uid: decoded.uid, at: now }],
      photo: "",
      checkInAt: "",
      deliveredAt: "",
      complaint: "",
      salesNote: clean(order.salesNote, 3000),
      driverNote: "",
      serviceDate,
      createdAt: now,
      updatedAt: now,
      createdByUid: decoded.uid
    };

    const batch = db.batch();
    batch.create(orderRef, next);
    batch.set(orderRef.collection("activity").doc(), next.workflowHistory[0]);
    batch.set(db.collection("customer_search").doc(next.customerId), customerSearchRecord({ name: next.customerName, phone: next.customerPhone, zone: next.zone, address: next.address, mapUrl: next.mapUrl }), { merge: true });
    try {
      await batch.commit();
    } catch (error) {
      if (error?.code === 6 || error?.code === "already-exists") {
        return Response.json({ ok: false, error: "Order id already exists" }, { status: 409 });
      }
      throw error;
    }
    await syncDeliveryOrderToSheet(db, orderId, next);

    // New orders stay out of the driver queue until sales explicitly queues them.
    if (next.queueStatus === "queued") try {
      const snap = await db.collection("push_tokens").where("role", "==", "driver").limit(500).get();
      const tokens = snap.docs.map((d) => d.id).filter(Boolean);
      if (tokens.length) {
        const response = await getAdminMessaging().sendEachForMulticast({
          tokens,
          data: {
            type: "new_order",
            title: "มีออเดอร์ใหม่",
            body: "มีงานใหม่เพิ่มในคิวคนขับ",
            orderId,
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
      const text = buildLineMessage(orderId, next);
      const lineResult = await pushLineText({
        text,
        metadata: { orderId: String(order.id), source: "orders.create" }
      });
      await db.collection("notifications").add({
        channel: "line",
        type: "new_order",
        orderId,
        text,
        result: lineResult,
        createdByUid: decoded.uid,
        createdAt: new Date().toISOString()
      });
    } catch (e) {
      console.warn("LINE OA notification failed", e?.message || e);
    }

    return Response.json({ ok: true, data: { id: orderId } });
  } catch (error) { return errorResponse(error); }
}
