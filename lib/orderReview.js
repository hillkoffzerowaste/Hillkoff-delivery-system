export const ORDER_REVIEW_QR_PREFIX = "HKO2";
export const ORDER_REVIEW_PATH = "/order-review";
export const MAX_ORDER_REVIEW_FEEDBACK_LENGTH = 2000;

const ORDER_ID_PATTERN = /^[A-Za-z0-9._-]{1,120}$/;
const ORDER_REVIEW_PAYLOAD_PATTERN = /^HKO2\|([^|/\s]{1,120})$/;

function cleanText(value, max = MAX_ORDER_REVIEW_FEEDBACK_LENGTH) {
  return String(value || "").trim().slice(0, max);
}

export function isValidOrderReviewOrderId(value) {
  return ORDER_ID_PATTERN.test(String(value || "").trim());
}

export function createOrderReviewPayload(orderId) {
  const normalized = String(orderId || "").trim();
  if (!isValidOrderReviewOrderId(normalized)) throw new Error("Invalid order ID");
  return `${ORDER_REVIEW_QR_PREFIX}|${normalized}`;
}

export function createOrderReviewUrl(origin, orderId) {
  const url = new URL(ORDER_REVIEW_PATH, String(origin));
  url.searchParams.set("t", createOrderReviewPayload(orderId));
  return url.toString();
}

function extractOrderReviewPayload(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  try {
    const url = new URL(raw);
    return url.searchParams.get("t") || "";
  } catch {
    return raw;
  }
}

export function parseOrderReviewPayload(value) {
  const payload = extractOrderReviewPayload(value);
  const match = payload.match(ORDER_REVIEW_PAYLOAD_PATTERN);
  if (!match || !isValidOrderReviewOrderId(match[1])) throw new Error("Invalid order review QR payload");
  return { orderId: match[1] };
}

export function normalizeOrderReviewInput({ rating, feedback } = {}) {
  const normalizedRating = Number(rating);
  if (!Number.isInteger(normalizedRating) || normalizedRating < 1 || normalizedRating > 5) {
    throw new Error("Rating must be an integer from 1 to 5");
  }
  return {
    rating: normalizedRating,
    feedback: cleanText(feedback)
  };
}

export function latestDeliveryIdentity(order = {}) {
  const driverId = cleanText(order.lastDeliveryDriverId || order.driverId, 120);
  const driverName = cleanText(order.lastDeliveryDriverName || order.driverName, 200);
  return { driverId, driverName };
}

export function canReviewOrder(order = {}) {
  const identity = latestDeliveryIdentity(order);
  const deliveryAttemptAt = order.lastDeliveryAt || order.deliveredAt;
  const isReviewableStatus = order.status === "ส่งสำเร็จ" || order.deliveryCompleteness === "incomplete";
  return Boolean(identity.driverId && deliveryAttemptAt && isReviewableStatus && order.status !== "ยกเลิก");
}

export function getLatestOrderReview(order = {}) {
  if (order.latestDeliveryReview && typeof order.latestDeliveryReview === "object") {
    return order.latestDeliveryReview;
  }
  if (!Number.isInteger(Number(order.deliveryReviewRating))) return null;
  return {
    rating: Number(order.deliveryReviewRating),
    feedback: cleanText(order.deliveryReviewFeedback),
    driverId: cleanText(order.deliveryReviewDriverId, 120),
    driverName: cleanText(order.deliveryReviewDriverName, 200),
    attempt: Number(order.deliveryReviewAttempt) || 0,
    submittedAt: order.deliveryReviewSubmittedAt || ""
  };
}

export function aggregateLatestDriverReviews(orders = []) {
  const grouped = new Map();
  for (const order of Array.isArray(orders) ? orders : []) {
    const review = getLatestOrderReview(order);
    if (!review || !Number.isInteger(Number(review.rating))) continue;
    const driverId = cleanText(review.driverId || latestDeliveryIdentity(order).driverId, 120);
    if (!driverId) continue;
    const current = grouped.get(driverId) || {
      id: driverId,
      name: cleanText(review.driverName || latestDeliveryIdentity(order).driverName, 200) || driverId,
      count: 0,
      total: 0,
      average: 0,
      latestFeedback: "",
      latestFeedbackAt: ""
    };
    current.count += 1;
    current.total += Number(review.rating);
    current.average = Math.round((current.total / current.count) * 10) / 10;
    const submittedAt = String(review.submittedAt || "");
    if (submittedAt >= String(current.latestFeedbackAt || "")) {
      current.latestFeedbackAt = submittedAt;
      current.latestFeedback = cleanText(review.feedback);
      current.name = cleanText(review.driverName || current.name, 200) || current.name;
    }
    grouped.set(driverId, current);
  }
  return [...grouped.values()].sort((a, b) => b.average - a.average || b.count - a.count || a.name.localeCompare(b.name));
}
