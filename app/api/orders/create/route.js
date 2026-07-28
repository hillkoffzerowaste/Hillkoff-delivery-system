import { errorResponse, requireProfile } from "../../../../lib/workflowAuth";
import { getAdminMessaging } from "../../../../lib/firebaseAdmin";
import { pushLineText } from "../../../../lib/lineOa";
import { syncDeliveryOrderToSheet } from "../../../../lib/deliverySheetSync";
import { customerSearchRecord, resolveCustomerRecord } from "../../../../lib/customerSearchIndex";
import { BOOKING_NUMBER_PATTERN, bookingConflictMessage, bookingRegistryId, bookingRegistryRecord, normalizeBookingNumber } from "../../../../lib/bookingRegistry";
import { initialPreparationStatuses, resolveNextRoundDate, resolveOptionalChiangmaiRound } from "../../../../lib/preparationWorkflow";

export const runtime = "nodejs";

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
    const { profile, db, decoded } = await requireProfile(request, ["sales", "admin", "store"]);
    const bookingNumbers = [...new Set((Array.isArray(order.bookingNumbers) ? order.bookingNumbers : [order.bookingNumber]).map(normalizeBookingNumber).filter(Boolean))].slice(0, 20);
    if (bookingNumbers.some((value) => !BOOKING_NUMBER_PATTERN.test(value))) {
      return Response.json({ ok: false, error: "กรุณากรอกเลขที่ใบสั่งจองรูปแบบ PREFIX-1234" }, { status: 400 });
    }
    const bookingNumber = bookingNumbers[0] || "";
    const customerId = clean(order.customerId, 120);
    if (!/^[A-Za-z0-9._-]{1,120}$/.test(customerId)) return Response.json({ ok: false, error: "A valid customer is required" }, { status: 400 });
    const customerSnap = await db.collection("customers").doc(customerId).get();
    const indexedCustomerSnap = customerSnap.exists ? null : await db.collection("customer_search").doc(customerId).get();
    const customer = resolveCustomerRecord(
      customerSnap.exists ? customerSnap.data() || {} : null,
      indexedCustomerSnap?.exists ? indexedCustomerSnap.data() || {} : null
    );
    if (!customer) return Response.json({ ok: false, error: "Customer not found" }, { status: 404 });
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
    const bookingRefs = bookingNumbers.map((value) => ({ bookingNumber: value, ref: db.collection("booking_month_registry").doc(bookingRegistryId(serviceDate, value)) }));
    const deliveryMethod = ["grab_pickup", "customer_pickup", "outstation"].includes(order.deliveryMethod) ? order.deliveryMethod : "company_driver";
    const preparation = initialPreparationStatuses(deliveryMethod, order.workflowType);
    const workflowType = preparation.workflowType;
    const storeAssistEntry = profile.role === "store";
    const createdByName = clean(profile.name || profile.email, 200);
    const requestedRoundCode = clean(order.chiangmaiRoundCode, 20);
    const roundCode = resolveOptionalChiangmaiRound({ deliveryMethod, queueStatus: preparation.queueStatus }, requestedRoundCode);
    const roundDate = roundCode ? resolveNextRoundDate(toServiceDateKey(now), roundCode) : "";

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
      salesName: createdByName,
      salesPhone: clean(profile.phone, 40),
      orderEntrySource: storeAssistEntry ? "store_assist" : "sales",
      createdByRole: profile.role,
      createdByName,
      storeAssistEntryAt: storeAssistEntry ? now : "",
      storeAssistEntryNote: storeAssistEntry ? `สโตร์ช่วยคีย์ออเดอร์เร่งด่วนโดย ${createdByName || "สโตร์"}` : "",
      status: preparation.status,
      workflowType,
      deliveryMethod,
      bookingNumber: bookingNumber.slice(0, 100),
      bookingNumbers,
      bookingMonthKey: serviceDate.slice(0, 7),
      bookingNumberMissing: bookingNumbers.length === 0,
      bookingNumberNotice: bookingNumbers.length === 0 ? (storeAssistEntry ? "สโตร์ช่วยเปิดออเดอร์โดยยังไม่มีเลขใบสั่งจอง" : "ฝ่ายขายเปิดออเดอร์โดยยังไม่มีเลขใบสั่งจอง") : "",
      shippingCarrier: deliveryMethod === "outstation" ? String(order.shippingCarrier || "").trim().slice(0, 100) : "",
      storeStatus: preparation.storeStatus,
      packStatus: preparation.packStatus,
      queueStatus: preparation.queueStatus,
      urgentDelivery: preparation.urgentDelivery,
      storePackerName: "",
      storeCheckerName: "",
      packPackerName: "",
      packCheckerName: "",
      packPhotos: [],
      missingItems: [],
      workflowHistory: [{ action: "created", role: profile.role, uid: decoded.uid, at: now, note: storeAssistEntry ? `สโตร์ช่วยคีย์ออเดอร์เร่งด่วนโดย ${createdByName || "สโตร์"}` : "" }],
      photo: "",
      checkInAt: "",
      deliveredAt: "",
      deliveryAttemptNumber: 0,
      lastDeliveryDriverId: "",
      lastDeliveryDriverName: "",
      lastDeliveryAt: "",
      complaint: "",
      salesNote: clean(order.salesNote, 3000),
      driverNote: "",
      serviceDate,
      createdAt: now,
      updatedAt: now,
      createdByUid: decoded.uid
    };
    if (roundCode) Object.assign(next, {
      chiangmaiRoundCode: roundCode,
      chiangmaiRoundDate: roundDate,
      chiangmaiRoundAssignedAt: now,
      chiangmaiRoundAssignedBy: createdByName
    });

    try {
      const transactionResult = await db.runTransaction(async (transaction) => {
        const orderSnap = await transaction.get(orderRef);
        if (orderSnap.exists) {
          const existing = orderSnap.data() || {};
          const sameRequest = String(existing.createdByUid || "") === String(decoded.uid || "")
            && String(existing.customerId || "") === customerId
            && normalizeBookingNumber(existing.bookingNumber || "") === bookingNumber;
          if (sameRequest) return { alreadyExists: true };
          throw Object.assign(new Error("Order id already exists"), { status: 409 });
        }
        for (const reservation of bookingRefs) {
          const bookingSnap = await transaction.get(reservation.ref);
          if (bookingSnap.exists) throw Object.assign(new Error(bookingConflictMessage(bookingSnap.data())), { status: 409 });
        }
        transaction.create(orderRef, next);
        transaction.set(orderRef.collection("activity").doc(), next.workflowHistory[0]);
        transaction.set(db.collection("customer_search").doc(next.customerId), customerSearchRecord({ name: next.customerName, phone: next.customerPhone, zone: next.zone, address: next.address, mapUrl: next.mapUrl }), { merge: true });
        for (const reservation of bookingRefs) transaction.create(reservation.ref, bookingRegistryRecord({ serviceDate, bookingNumber: reservation.bookingNumber, source: "orders", sourceId: orderId, customerName: next.customerName, createdAt: now, createdBy: next.salesName }));
        return { alreadyExists: false };
      });
      if (transactionResult?.alreadyExists) return Response.json({ ok: true, data: { id: orderId, alreadyExists: true } });
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
