const TERMINAL_QUEUE_STATUSES = new Set(["completed", "cancelled", "pack_archived", "driver_archived"]);
const TERMINAL_ORDER_STATUSES = new Set(["ส่งสำเร็จ", "ยกเลิก", "นำออกจากคิวห้องแพ็ค"]);

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
