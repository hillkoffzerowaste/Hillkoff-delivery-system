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

export function driverReworkPatch(order = {}, actor = {}, note, now = new Date().toISOString()) {
  const reworkNote = String(note || "").trim().slice(0, 2000);
  if (!reworkNote) throw new Error("Driver rework note is required");
  const reworkRoute = resolveDriverReworkRoute(order);
  const reportedBy = String(actor?.name || actor?.driverId || "driver").trim().slice(0, 160);
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
