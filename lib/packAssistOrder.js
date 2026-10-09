import { buildDriverQueuePolicyPatch } from "./driverQueuePolicy.js";

const TERMINAL_QUEUE_STATUSES = new Set(["completed", "cancelled", "pack_archived", "driver_archived"]);
const TERMINAL_ORDER_STATUSES = new Set(["ส่งสำเร็จ", "ยกเลิก", "นำออกจากคิวห้องแพ็ค"]);
const DRIVER_ACCEPTED_STATUSES = new Set(["กำลังส่ง", "กำลังจัดส่ง"]);
const PACK_ASSIST_EDITABLE_FIELDS = [
  "customerId", "customerName", "customerPhone", "zone", "address", "mapUrl", "window", "boxes", "packageUnit",
  "paymentType", "cod", "deliveryMethod", "workflowType", "bookingNumber", "bookingNumbers", "bookingMonthKey",
  "bookingNumberMissing", "bookingNumberNotice", "shippingCarrier", "storeStatus", "urgentDelivery", "salesNote",
  "chiangmaiRoundCode"
];

function orderTimestampValue(order = {}) {
  const value = order.updatedAt || order.queuedAt || order.createdAt;
  if (value?.toMillis) return value.toMillis();
  if (value?.toDate) return value.toDate().getTime();
  const parsed = Date.parse(String(value || ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

function isDriverAcceptedOrder(order = {}) {
  return Boolean(order.driverId || order.acceptedAt || DRIVER_ACCEPTED_STATUSES.has(String(order.status || "")));
}

export function classifyPackAssistDuplicate(orders = [], { customerId, todayServiceDate } = {}) {
  const sameDayOrders = (Array.isArray(orders) ? orders : [])
    .filter(order => String(order?.customerId || "") === String(customerId || ""))
    .filter(order => String(order?.serviceDate || "") === String(todayServiceDate || ""));

  const accepted = sameDayOrders.filter(isDriverAcceptedOrder).sort((left, right) => orderTimestampValue(right) - orderTimestampValue(left));
  if (accepted.length) return { type: "driver_accepted", order: accepted[0] };

  const eligible = sameDayOrders
    .filter(order => !TERMINAL_QUEUE_STATUSES.has(String(order.queueStatus || "")))
    .filter(order => !TERMINAL_ORDER_STATUSES.has(String(order.status || "")))
    .sort((left, right) => orderTimestampValue(right) - orderTimestampValue(left));
  return eligible.length
    ? { type: "updatable", order: eligible[0] }
    : { type: "none", order: null };
}

export function buildPackAssistExistingOrderPatch(existing = {}, latest = {}, actor = {}, now) {
  const history = {
    action: "pack_assist_duplicate_requeue",
    result: "updated_existing_and_requeued",
    orderId: String(existing.id || ""),
    uid: String(actor.uid || ""),
    role: String(actor.role || "pack"),
    name: String(actor.name || actor.email || "ห้องแพ็ค"),
    at: now
  };
  const keyedFields = Object.fromEntries(
    PACK_ASSIST_EDITABLE_FIELDS
      .filter(field => Object.prototype.hasOwnProperty.call(latest, field) && latest[field] !== undefined)
      .map(field => [field, latest[field]])
  );
  const workflowHistory = [...(Array.isArray(existing.workflowHistory) ? existing.workflowHistory : []).slice(-99), history];
  const patch = {
    ...keyedFields,
    ...buildDriverQueuePolicyPatch(now),
    packStatus: "checked",
    queuedBy: String(actor.uid || actor.name || actor.email || "pack"),
    queuedByName: String(actor.name || actor.email || "ห้องแพ็ค"),
    workflowHistory,
    updatedAt: now
  };
  return { patch, history };
}

export function validatePackAssistOrder(order = {}) {
  if (order.deliveryMethod !== "company_driver" || order.workflowType !== "direct_pack") {
    throw new Error("ห้องแพ็คเปิดออเดอร์ด่วนได้เฉพาะคนขับบริษัทแบบส่งตรงห้องแพ็ค");
  }
}

export function isBlockingPackAssistOrder(order = {}, customerId) {
  return String(order.customerId || "") === String(customerId || "")
    && !TERMINAL_QUEUE_STATUSES.has(String(order.queueStatus || ""))
    && !TERMINAL_ORDER_STATUSES.has(String(order.status || ""));
}

// ห้องแพ็คช่วยคีย์งานด่วนจากใบสั่งจองที่สโตร์คีย์เข้าระบบไว้ก่อนแล้ว จึงใช้เลขเดิมต่อได้ ไม่นับเป็นเลขซ้ำ
export function canPackAssistShareBooking(registry = {}) {
  return String(registry?.source || "") === "store_reports";
}

export function packAssistDuplicateMessage(order = {}) {
  const isStillAtStore = order.workflowType === "store_route"
    && !["checked", "partial", "skipped"].includes(String(order.storeStatus || ""));
  return isStillAtStore
    ? "พบออเดอร์ของลูกค้านี้ที่สโตร์กำลังตรวจอยู่และยังไม่ส่งเข้าห้องแพ็ค กรุณารอ ห้ามสร้างซ้ำ"
    : "พบออเดอร์ของลูกค้านี้ที่ยังดำเนินการอยู่ กรุณารอให้ออเดอร์เดิมจบก่อน ห้ามสร้างซ้ำ";
}
