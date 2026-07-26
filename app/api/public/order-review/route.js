import { getAdminDb } from "../../../../lib/firebaseAdmin";
import {
  canReviewOrder,
  latestDeliveryIdentity,
  normalizeOrderReviewInput,
  parseOrderReviewPayload
} from "../../../../lib/orderReview";

export const runtime = "nodejs";

function publicReview(review) {
  if (!review || typeof review !== "object") return null;
  return {
    rating: Number(review.rating) || 0,
    feedback: String(review.feedback || ""),
    driverName: String(review.driverName || ""),
    attempt: Number(review.attempt) || 0,
    submittedAt: String(review.submittedAt || "")
  };
}

function serializeOrder(order) {
  const identity = latestDeliveryIdentity(order);
  return {
    orderId: String(order.id || ""),
    customerName: String(order.customerName || "ลูกค้า"),
    driverName: identity.driverName || "คนขับ",
    status: String(order.status || ""),
    deliveryCompleteness: String(order.deliveryCompleteness || ""),
    latestReview: publicReview(order.latestDeliveryReview)
  };
}

function noStore(response) {
  response.headers.set("Cache-Control", "no-store");
  return response;
}

export async function GET(request) {
  try {
    const token = new URL(request.url).searchParams.get("t") || "";
    const { orderId } = parseOrderReviewPayload(token);
    const snap = await getAdminDb().collection("orders").doc(orderId).get();
    if (!snap.exists) return noStore(Response.json({ ok: false, error: "ไม่พบออเดอร์นี้" }, { status: 404 }));
    const order = { id: snap.id, ...(snap.data() || {}) };
    if (!canReviewOrder(order)) {
      return noStore(Response.json({ ok: false, error: "ออเดอร์นี้ยังไม่เปิดให้รีวิว" }, { status: 409 }));
    }
    return noStore(Response.json({ ok: true, data: serializeOrder(order) }));
  } catch (error) {
    const status = String(error?.message || "").startsWith("Invalid order review") ? 400 : 500;
    return noStore(Response.json({ ok: false, error: status === 400 ? "QR รีวิวไม่ถูกต้อง" : "ระบบรีวิวขัดข้องชั่วคราว" }, { status }));
  }
}

export async function POST(request) {
  let body;
  try {
    body = await request.json();
  } catch {
    return noStore(Response.json({ ok: false, error: "ข้อมูลไม่ถูกต้อง" }, { status: 400 }));
  }

  try {
    const { orderId } = parseOrderReviewPayload(body?.token);
    const { rating, feedback } = normalizeOrderReviewInput({ rating: body?.rating, feedback: body?.feedback });
    const db = getAdminDb();
    const orderRef = db.collection("orders").doc(orderId);
    const reviewRef = orderRef.collection("delivery_reviews").doc();
    const submittedAt = new Date().toISOString();
    let result = null;

    await db.runTransaction(async (transaction) => {
      const snap = await transaction.get(orderRef);
      if (!snap.exists) throw Object.assign(new Error("Order not found"), { status: 404 });
      const order = { id: snap.id, ...(snap.data() || {}) };
      if (!canReviewOrder(order)) throw Object.assign(new Error("Order is not reviewable"), { status: 409 });
      const identity = latestDeliveryIdentity(order);
      const attempt = Math.max(1, Number(order.deliveryAttemptNumber) || 1);
      const review = {
        orderId,
        rating,
        feedback,
        driverId: identity.driverId,
        driverName: identity.driverName,
        attempt,
        source: "order_qr",
        submittedAt
      };
      const reviewCount = (Number(order.deliveryReviewCount) || 0) + 1;
      transaction.create(reviewRef, review);
      transaction.set(orderRef, {
        latestDeliveryReview: review,
        deliveryReviewRating: rating,
        deliveryReviewFeedback: feedback,
        deliveryReviewDriverId: identity.driverId,
        deliveryReviewDriverName: identity.driverName,
        deliveryReviewAttempt: attempt,
        deliveryReviewSubmittedAt: submittedAt,
        deliveryReviewCount: reviewCount,
        updatedAt: submittedAt
      }, { merge: true });
      result = { orderId, driverName: identity.driverName, latestReview: publicReview(review) };
    });

    return noStore(Response.json({ ok: true, data: result }));
  } catch (error) {
    const message = String(error?.message || "");
    const status = Number(error?.status) || (message.startsWith("Invalid order review") || message.startsWith("Rating must") ? 400 : 500);
    const errorText = status === 400
      ? (message.startsWith("Rating") ? "กรุณาเลือกคะแนน 1–5 ดาว" : "QR รีวิวหรือข้อมูลรีวิวไม่ถูกต้อง")
      : status === 404 ? "ไม่พบออเดอร์นี้"
        : status === 409 ? "ออเดอร์นี้ยังไม่เปิดให้รีวิว"
          : "บันทึกรีวิวไม่สำเร็จ กรุณาลองใหม่";
    return noStore(Response.json({ ok: false, error: errorText }, { status }));
  }
}
