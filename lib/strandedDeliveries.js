import { bangkokDateKey } from "./operationsReporting.js";

// งานที่คนขับรับไปแล้วแต่ไม่เคยถูกปิด จะค้างอยู่ในรายการของคนขับไปเรื่อยๆ เพราะไม่มีอะไรมาปิดให้
// ไฟล์นี้กำหนดว่า "ค้าง" คืออะไร และปิดงานค้างอย่างไรให้ยังตรวจย้อนหลังได้ว่าใครปิดและเพราะอะไร

// จำกัดไว้แค่สองสถานะที่มีคนขับถืองานอยู่จริง งานที่ยัง "รอคนขับรับ" ไม่เคยออกวิ่ง
// จึงไม่ควรถูกปิดเป็น "ส่งสำเร็จ" ย้อนหลัง
export const STRANDED_DELIVERY_STATUSES = Object.freeze(["กำลังส่ง", "กำลังจัดส่ง"]);

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

export function strandedDeliveryReason(order = {}) {
  const photos = Number(order?.podPhotoCount) || 0;
  if (String(order?.status || "") === "กำลังส่ง") return "no_check_in";
  if (!photos && !order?.photo) return "no_pod_photo";
  if (!order?.sharedToLine) return "line_share_incomplete";
  return "not_confirmed";
}

export function buildStrandedClosurePatch(order = {}, actor = {}, now = new Date().toISOString(), { reason = "", batchId = "" } = {}) {
  const actorName = String(actor?.name || actor?.email || actor?.uid || "").trim().slice(0, 160);
  const closureReason = String(reason || "").trim().slice(0, 1000);
  const closureBatchId = String(batchId || "").trim().slice(0, 160);
  // เก็บร่องรอยไว้ว่านี่คือการปิดย้อนหลังโดยฝ่ายขาย/แอดมิน ไม่ใช่คนขับกดยืนยันเอง
  // ถ้าไม่แยกไว้ รายงาน KPI จะอ่านไม่ออกว่างานไหนมีหลักฐานการส่งจริง
  const history = {
    action: "stranded_closed",
    result: "completed_by_ops",
    role: String(actor?.role || "").slice(0, 40),
    name: actorName,
    uid: String(actor?.uid || "").slice(0, 160),
    at: now,
    reason: closureReason,
    strandedReason: strandedDeliveryReason(order),
    previousStatus: String(order?.status || ""),
    batchId: closureBatchId
  };
  return {
    patch: {
      status: "ส่งสำเร็จ",
      queueStatus: "completed",
      deliveryCompleteness: order?.deliveryCompleteness || "complete",
      deliveredAt: order?.deliveredAt || now,
      strandedClosedAt: now,
      strandedClosedBy: actorName,
      strandedClosedByUid: String(actor?.uid || "").slice(0, 160),
      strandedClosureReason: closureReason,
      strandedClosureBatchId: closureBatchId,
      strandedPreviousStatus: String(order?.status || ""),
      driverConfirmed: false,
      workflowHistory: [...(Array.isArray(order?.workflowHistory) ? order.workflowHistory : []).slice(-99), history],
      updatedAt: now
    },
    history
  };
}
