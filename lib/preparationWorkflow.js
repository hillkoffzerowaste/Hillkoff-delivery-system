const TRANSFERRED_QUEUE_STATUSES = new Set([
  "queued",
  "completed",
  "outstation_ready",
  "grab_completed",
  "grab_ready",
  "grab_picked_up",
  "pack_archived",
  "driver_archived"
]);

export function isOutstationOrder(order) {
  return order?.deliveryMethod === "outstation"
    || (order?.workflowType === "direct_pack" && Boolean(String(order?.shippingCarrier || "").trim()));
}

export function isChiangmaiPreparationOrder(order) {
  return Boolean(order?.workflowType)
    && !isOutstationOrder(order)
    && !TRANSFERRED_QUEUE_STATUSES.has(String(order?.queueStatus || ""));
}

export function isSalesWaitingAlert(order) {
  if (!order?.workflowType || isOutstationOrder(order) || order?.status === "ส่งสำเร็จ") return false;
  if (order?.reworkRequired === true) return true;
  if (TRANSFERRED_QUEUE_STATUSES.has(String(order?.queueStatus || "")) || order?.packStatus === "returned") return false;
  return ["waiting", "partial"].includes(order?.storeStatus)
    || ["waiting", "partial"].includes(order?.packStatus);
}

export function resolveDriverReworkRoute(order = {}) {
  return order?.workflowType === "store_route" ? "store_route" : "direct_pack";
}

export const CHIANGMAI_ROUND_CODES = ["tuesday", "wednesday", "friday"];
const ROUND_WEEKDAYS = { tuesday: 2, wednesday: 3, friday: 5 };

export function resolveNextRoundDate(createdDate, roundCode) {
  if (!CHIANGMAI_ROUND_CODES.includes(roundCode)) throw new Error("Invalid Chiang Mai round");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(createdDate || ""))) throw new Error("Invalid created date");
  const date = new Date(`${createdDate}T00:00:00.000Z`);
  const delta = (ROUND_WEEKDAYS[roundCode] - date.getUTCDay() + 7) % 7;
  date.setUTCDate(date.getUTCDate() + delta);
  return date.toISOString().slice(0, 10);
}

export function validateChiangmaiRound(order = {}, roundCode) {
  if (!CHIANGMAI_ROUND_CODES.includes(roundCode)) throw new Error("Invalid round");
  if (isOutstationOrder(order) || order.deliveryMethod !== "company_driver") {
    throw new Error("Round is available only for Chiang Mai company-driver orders");
  }
  if (TRANSFERRED_QUEUE_STATUSES.has(String(order.queueStatus || ""))) throw new Error("Order is already transferred");
  return roundCode;
}

export function resolveOptionalChiangmaiRound(order = {}, roundCode) {
  const code = String(roundCode || "").trim();
  return code ? validateChiangmaiRound(order, code) : "";
}

export function isNormalChiangmaiOrder(order = {}) {
  return !String(order.chiangmaiRoundCode || "").trim();
}

export function buildChiangmaiRoundGroups(orders = []) {
  const groups = new Map();
  for (const order of orders) {
    const roundCode = String(order?.chiangmaiRoundCode || "");
    const roundDate = String(order?.chiangmaiRoundDate || "");
    if (order?.deliveryMethod !== "company_driver" || !CHIANGMAI_ROUND_CODES.includes(roundCode) || !roundDate) continue;
    if (TRANSFERRED_QUEUE_STATUSES.has(String(order?.queueStatus || "")) || order?.driverId) continue;
    const key = `${roundCode}|${roundDate}`;
    if (!groups.has(key)) groups.set(key, { key, roundCode, roundDate, orders: [] });
    groups.get(key).orders.push(order);
  }
  return [...groups.values()]
    .map((group) => {
      const ordersInGroup = group.orders.slice().sort((a, b) => Date.parse(a.createdAt || 0) - Date.parse(b.createdAt || 0));
      const selectableIds = ordersInGroup.filter(isReadyOrderWaitingForDispatch).map((order) => order.id);
      return { ...group, orders: ordersInGroup, total: ordersInGroup.length, ready: selectableIds.length, selectableIds };
    })
    .sort((a, b) => a.roundDate.localeCompare(b.roundDate) || CHIANGMAI_ROUND_CODES.indexOf(a.roundCode) - CHIANGMAI_ROUND_CODES.indexOf(b.roundCode));
}

export function requiresDriverDeliveryNote(deliveryCompleteness) {
  return String(deliveryCompleteness || "") === "incomplete";
}

export function driverReworkPatch(order = {}, actor = {}, note, now = new Date().toISOString()) {
  const reworkNote = String(note || "").trim().slice(0, 2000);
  if (!reworkNote) throw new Error("Driver rework note is required");
  const reworkRoute = resolveDriverReworkRoute(order);
  const reportedBy = String(actor?.name || actor?.driverId || "driver").trim().slice(0, 160);
  const reportedDriverId = String(actor?.driverId || order?.driverId || "").trim().slice(0, 120);
  const previousAttempt = Number(order?.deliveryAttemptNumber) || 0;
  return {
    driverId: "",
    driverName: "",
    status: "ติดปัญหา",
    queueStatus: "preparing",
    sharedToLine: true,
    acceptedAt: "",
    driverSequence: 0,
    driverSequenceServiceDate: "",
    driverSequenceUpdatedAt: "",
    driverSequenceUpdatedBy: "",
    deliveryCompleteness: "incomplete",
    deliveryAttemptNumber: previousAttempt + 1,
    lastDeliveryDriverId: reportedDriverId,
    lastDeliveryDriverName: reportedBy,
    lastDeliveryAt: now,
    driverNote: reworkNote,
    reworkRequired: true,
    reworkRoute,
    reworkStatus: reworkRoute === "store_route" ? "waiting_store" : "waiting_pack",
    reworkNote,
    reworkReportedAt: now,
    reworkReportedBy: reportedBy,
    storeStatus: reworkRoute === "store_route" ? "returned" : "skipped",
    packStatus: reworkRoute === "store_route" ? "blocked" : "waiting"
  };
}

export function resolvePreparationRoute(deliveryMethod, workflowType) {
  if (deliveryMethod === "outstation") {
    return ["direct_pack", "store_route"].includes(workflowType) ? workflowType : "direct_pack";
  }
  if (deliveryMethod === "company_driver" && workflowType === "direct_driver") return "direct_driver";
  return workflowType === "direct_pack" ? "direct_pack" : "store_route";
}

export function initialPreparationStatuses(deliveryMethod, requestedWorkflowType) {
  const workflowType = resolvePreparationRoute(deliveryMethod, requestedWorkflowType);
  const directDriver = deliveryMethod === "company_driver" && workflowType === "direct_driver";
  return {
    workflowType,
    storeStatus: directDriver || workflowType === "direct_pack" ? "skipped" : "pending",
    packStatus: directDriver ? "skipped" : workflowType === "direct_pack" ? "pending" : "blocked",
    queueStatus: directDriver ? "queued" : "preparing",
    status: directDriver ? "รอคนขับรับ" : "รอจัดเตรียมสินค้า",
    urgentDelivery: directDriver
  };
}

export function isReadyOrderWaitingForDispatch(order) {
  const packReady = ["checked", "partial"].includes(String(order?.packStatus || ""));
  const waitingQueue = ["", "preparing", "ready"].includes(String(order?.queueStatus || ""));
  return !isOutstationOrder(order) && packReady && waitingQueue && !order?.driverId && order?.reworkRequired !== true;
}

export function isDriverDeliveryOrder(order, driverId) {
  return Boolean(driverId)
    && String(order?.driverId || "") === String(driverId)
    && ["กำลังส่ง", "กำลังจัดส่ง"].includes(String(order?.status || ""))
    && String(order?.queueStatus || "queued") !== "completed";
}

export function isStoreReportVisibleToRole(report, role, includeDeleted = false) {
  if (!report || !["store", "pack", "admin"].includes(String(role || ""))) return false;
  return includeDeleted || !report.deletedAt;
}
