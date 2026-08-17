import { bangkokDateKey } from "./operationsReporting.js";
import { buildDriverQueuePolicyPatch, isExpiredDriverQueueForSales } from "./driverQueuePolicy.js";

// งานที่ไม่มีใครปิดจะค้างอยู่เงียบๆ ไปเรื่อยๆ ไฟล์นี้กำหนดว่า "ค้าง" มีกี่แบบ
// และแต่ละแบบทำอะไรได้ โดยยังตรวจย้อนหลังได้ว่าใครทำและเพราะอะไร
//
// ค้างมีสองแบบที่ต่างกันโดยสิ้นเชิง:
//   in_flight     — คนขับรับไปแล้วแต่ไม่ได้กดปิดงาน
//   expired_queue — เข้าคิวไว้แต่ไม่มีคนขับรับ และคิวหมดอายุแล้วจึงถูกซ่อนจากคนขับ
//                   (isDriverQueueVisibleToDriver ซ่อนไว้) ถ้าฝ่ายขายไม่แตะ จะไม่มีใครเห็นมันอีก

export const STRANDED_DELIVERY_STATUSES = Object.freeze(["กำลังส่ง", "กำลังจัดส่ง"]);
export const EXPIRED_QUEUE_STATUS = "รอคนขับรับ";
export const STRANDED_SCAN_STATUSES = Object.freeze([...STRANDED_DELIVERY_STATUSES, EXPIRED_QUEUE_STATUS]);

export const STRANDED_ACTIONS = Object.freeze(["complete", "requeue", "cancel"]);

export function orderServiceDateKey(order = {}) {
  const explicit = String(order.serviceDate || "").slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(explicit) ? explicit : bangkokDateKey(order.createdAt);
}

export function isStrandedDeliveryOrder(order = {}, todayKey = bangkokDateKey()) {
  if (!STRANDED_DELIVERY_STATUSES.includes(String(order?.status || ""))) return false;
  if (String(order?.queueStatus || "") === "completed") return false;
  const serviceDate = orderServiceDateKey(order);
  return Boolean(serviceDate) && Boolean(todayKey) && serviceDate < todayKey;
}

export function isExpiredQueueOrder(order = {}, todayKey = bangkokDateKey()) {
  if (!todayKey) return false;
  try {
    return isExpiredDriverQueueForSales(order, todayKey);
  } catch {
    return false;
  }
}

export function strandedCategory(order = {}, todayKey = bangkokDateKey()) {
  if (isStrandedDeliveryOrder(order, todayKey)) return "in_flight";
  if (isExpiredQueueOrder(order, todayKey)) return "expired_queue";
  return "";
}

// คิวที่หมดอายุยังส่งกลับเข้าคิวได้เพราะไม่มีคนขับถืออยู่ ส่วนงานที่คนขับถือแล้วไม่ให้ requeue
// ที่นี่ เพราะการดึงงานคืนจากคนขับมีเส้นทาง reroute ของตัวเองที่จัดการ sequence ให้ครบ
export function allowedStrandedActions(category) {
  if (category === "in_flight") return ["complete", "cancel"];
  if (category === "expired_queue") return ["complete", "requeue", "cancel"];
  return [];
}

export function canApplyStrandedAction(order = {}, action = "", todayKey = bangkokDateKey()) {
  if (!STRANDED_ACTIONS.includes(action)) return false;
  return allowedStrandedActions(strandedCategory(order, todayKey)).includes(action);
}

export function strandedDeliveryReason(order = {}) {
  const status = String(order?.status || "");
  if (status === EXPIRED_QUEUE_STATUS) return "never_accepted";
  if (status === "กำลังส่ง") return "no_check_in";
  if (!(Number(order?.podPhotoCount) || 0) && !order?.photo) return "no_pod_photo";
  if (!order?.sharedToLine) return "line_share_incomplete";
  return "not_confirmed";
}

function actionMeta(order, actor, now, { reason, batchId }) {
  return {
    actorName: String(actor?.name || actor?.email || actor?.uid || "").trim().slice(0, 160),
    cleanReason: String(reason || "").trim().slice(0, 1000),
    cleanBatchId: String(batchId || "").trim().slice(0, 160),
    previousStatus: String(order?.status || ""),
    strandedReason: strandedDeliveryReason(order)
  };
}

function withHistory(order, patch, history) {
  return {
    patch: {
      ...patch,
      workflowHistory: [...(Array.isArray(order?.workflowHistory) ? order.workflowHistory : []).slice(-99), history]
    },
    history
  };
}

export function buildStrandedClosurePatch(order = {}, actor = {}, now = new Date().toISOString(), options = {}) {
  const meta = actionMeta(order, actor, now, options);
  // เก็บร่องรอยไว้ว่านี่คือการปิดย้อนหลังโดยฝ่ายขาย/แอดมิน ไม่ใช่คนขับกดยืนยันเอง
  // ถ้าไม่แยกไว้ รายงาน KPI จะอ่านไม่ออกว่างานไหนมีหลักฐานการส่งจริง
  const history = {
    action: "stranded_closed",
    result: "completed_by_ops",
    role: String(actor?.role || "").slice(0, 40),
    name: meta.actorName,
    uid: String(actor?.uid || "").slice(0, 160),
    at: now,
    reason: meta.cleanReason,
    strandedReason: meta.strandedReason,
    previousStatus: meta.previousStatus,
    batchId: meta.cleanBatchId
  };
  return withHistory(order, {
    status: "ส่งสำเร็จ",
    queueStatus: "completed",
    deliveryCompleteness: order?.deliveryCompleteness || "complete",
    deliveredAt: order?.deliveredAt || now,
    strandedClosedAt: now,
    strandedClosedBy: meta.actorName,
    strandedClosedByUid: String(actor?.uid || "").slice(0, 160),
    strandedClosureReason: meta.cleanReason,
    strandedClosureBatchId: meta.cleanBatchId,
    strandedPreviousStatus: meta.previousStatus,
    driverConfirmed: false,
    updatedAt: now
  }, history);
}

export function buildStrandedRequeuePatch(order = {}, actor = {}, now = new Date().toISOString(), options = {}) {
  const meta = actionMeta(order, actor, now, options);
  const history = {
    action: "stranded_requeued",
    result: "returned_to_queue",
    role: String(actor?.role || "").slice(0, 40),
    name: meta.actorName,
    uid: String(actor?.uid || "").slice(0, 160),
    at: now,
    reason: meta.cleanReason,
    previousStatus: meta.previousStatus,
    batchId: meta.cleanBatchId
  };
  // buildDriverQueuePolicyPatch ตั้ง driverQueueDate เป็นวันนี้ คนขับจึงเห็นงานนี้อีกครั้ง
  return withHistory(order, {
    ...buildDriverQueuePolicyPatch(now),
    strandedRequeuedAt: now,
    strandedRequeuedBy: meta.actorName,
    strandedRequeueReason: meta.cleanReason,
    strandedClosureBatchId: meta.cleanBatchId,
    updatedAt: now
  }, history);
}

export function buildStrandedCancelPatch(order = {}, actor = {}, now = new Date().toISOString(), options = {}) {
  const meta = actionMeta(order, actor, now, options);
  const history = {
    action: "stranded_cancelled",
    result: "cancelled_by_ops",
    role: String(actor?.role || "").slice(0, 40),
    name: meta.actorName,
    uid: String(actor?.uid || "").slice(0, 160),
    at: now,
    reason: meta.cleanReason,
    strandedReason: meta.strandedReason,
    previousStatus: meta.previousStatus,
    batchId: meta.cleanBatchId
  };
  // "cancelled" อยู่ใน TERMINAL_QUEUE_STATUSES แล้ว งานจึงหลุดจากทุกคิวและรายงานงานค้าง
  return withHistory(order, {
    status: "ยกเลิก",
    queueStatus: "cancelled",
    driverId: "",
    driverName: "",
    strandedCancelledAt: now,
    strandedCancelledBy: meta.actorName,
    strandedCancelReason: meta.cleanReason,
    strandedClosureBatchId: meta.cleanBatchId,
    strandedPreviousStatus: meta.previousStatus,
    updatedAt: now
  }, history);
}

export function buildStrandedActionPatch(order = {}, action = "", actor = {}, now = new Date().toISOString(), options = {}) {
  if (action === "complete") return buildStrandedClosurePatch(order, actor, now, options);
  if (action === "requeue") return buildStrandedRequeuePatch(order, actor, now, options);
  if (action === "cancel") return buildStrandedCancelPatch(order, actor, now, options);
  throw new Error(`Unknown stranded action: ${action}`);
}
