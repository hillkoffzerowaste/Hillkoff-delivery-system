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
  return order?.deliveryMethod === "company_driver"
    && Boolean(order?.workflowType)
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

// รอบส่งเชียงใหม่ประจำสัปดาห์ เดิมดึงมาจากแพ็กเกจ sales-workspace ที่เลิกใช้แล้ว
export const CHIANGMAI_ROUNDS = Object.freeze([
  ["tuesday", "รอบวันอังคาร"],
  ["wednesday", "รอบวันพุธ"],
  ["friday", "รอบวันศุกร์"]
]);
export const CHIANGMAI_ROUND_CODES = CHIANGMAI_ROUNDS.map(([code]) => code);
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

const REROUTABLE_DELIVERY_METHODS = new Set([
  "company_driver",
  "grab_pickup",
  "customer_pickup",
  "outstation"
]);
const REROUTABLE_QUEUE_STATUSES = new Set(["preparing", "ready", "grab_ready"]);
const REROUTE_BLOCKED_QUEUE_STATUSES = new Set([
  "queued",
  "completed",
  "grab_picked_up",
  "outstation_ready",
  "pack_archived",
  "driver_archived"
]);

function normalizeRerouteTarget(target = {}) {
  const deliveryMethod = String(target?.deliveryMethod || "").trim();
  if (!REROUTABLE_DELIVERY_METHODS.has(deliveryMethod)) throw new Error("Invalid reroute delivery method");

  let workflowType;
  if (deliveryMethod === "outstation") {
    workflowType = ["direct_pack", "store_route"].includes(String(target?.workflowType || ""))
      ? String(target.workflowType)
      : "direct_pack";
  } else if (deliveryMethod === "company_driver") {
    workflowType = ["direct_driver", "direct_pack", "store_route"].includes(String(target?.workflowType || ""))
      ? String(target.workflowType)
      : "store_route";
  } else {
    workflowType = "store_route";
  }

  if (deliveryMethod === "outstation" && !String(target?.shippingCarrier || "").trim()) {
    throw new Error("Outstation reroute requires a shipping carrier");
  }

  return {
    deliveryMethod,
    workflowType,
    shippingCarrier: deliveryMethod === "outstation" ? String(target.shippingCarrier).trim().slice(0, 100) : ""
  };
}

export function canRerouteOrder(order = {}, target = {}) {
  try {
    const hasTarget = target && typeof target === "object" && Object.keys(target).length > 0;
    const normalizedTarget = hasTarget ? normalizeRerouteTarget(target) : null;
    const queueStatus = String(order?.queueStatus || "preparing");
    if (!order?.workflowType) return { ok: false, reason: "Order is not in a preparation workflow" };
    if (order?.driverId) return { ok: false, reason: "Assigned driver work cannot be rerouted" };
    if (order?.reworkRequired === true) return { ok: false, reason: "Delivery rework must be resolved before rerouting" };
    if (REROUTE_BLOCKED_QUEUE_STATUSES.has(queueStatus)) return { ok: false, reason: "Order has passed the reroute cutoff" };
    if (!REROUTABLE_QUEUE_STATUSES.has(queueStatus)) return { ok: false, reason: "Order is not in an open reroute state" };
    if (Array.isArray(order?.outstationDispatchScans) && order.outstationDispatchScans.length > 0) {
      return { ok: false, reason: "Outstation QR scans cannot be rerouted" };
    }
    if (Number(order?.outstationDispatchScannedCount) > 0) return { ok: false, reason: "Outstation QR scans cannot be rerouted" };

    if (!normalizedTarget) return { ok: true };
    const sameCarrier = String(order?.shippingCarrier || "").trim() === normalizedTarget.shippingCarrier;
    if (String(order?.deliveryMethod || "") === normalizedTarget.deliveryMethod
      && String(order?.workflowType || "") === normalizedTarget.workflowType
      && sameCarrier) {
      return { ok: false, reason: "Reroute target is unchanged" };
    }
    return { ok: true, target: normalizedTarget };
  } catch (error) {
    return { ok: false, reason: error?.message || String(error) };
  }
}

export function buildReroutePatch(order = {}, target = {}, actor = {}, reason, now = new Date().toISOString()) {
  if (!target || typeof target !== "object" || Object.keys(target).length === 0) {
    throw new Error("Reroute target is required");
  }
  const validation = canRerouteOrder(order, target);
  if (!validation.ok) throw new Error(validation.reason);
  const normalizedTarget = validation.target;
  const preparation = initialPreparationStatuses(normalizedTarget.deliveryMethod, normalizedTarget.workflowType);
  const actorName = String(actor?.name || actor?.email || actor?.uid || "").trim().slice(0, 160);
  const rerouteReason = String(reason || "").trim().slice(0, 1000);
  if (!rerouteReason) throw new Error("Reroute reason is required");

  const labelInvalidated = order?.deliveryMethod === "outstation"
    && (normalizedTarget.deliveryMethod !== "outstation"
      || String(order?.shippingCarrier || "").trim() !== normalizedTarget.shippingCarrier);
  const priorInspection = {
    storeStatus: String(order?.storeStatus || ""),
    packStatus: String(order?.packStatus || ""),
    missingItems: Array.isArray(order?.missingItems) ? order.missingItems.slice(0, 20) : [],
    storeWorkDetails: order?.storeWorkDetails || {},
    packWorkDetails: order?.packWorkDetails || {}
  };
  const history = {
    action: "reroute",
    role: String(actor?.role || "").slice(0, 40),
    name: actorName,
    uid: String(actor?.uid || "").slice(0, 160),
    at: now,
    note: rerouteReason,
    result: "rerouted",
    fromDeliveryMethod: String(order?.deliveryMethod || ""),
    toDeliveryMethod: normalizedTarget.deliveryMethod,
    fromWorkflowType: String(order?.workflowType || ""),
    toWorkflowType: normalizedTarget.workflowType,
    fromQueueStatus: String(order?.queueStatus || ""),
    toQueueStatus: preparation.queueStatus,
    priorInspection,
    labelInvalidated
  };
  const patch = {
    deliveryMethod: normalizedTarget.deliveryMethod,
    workflowType: normalizedTarget.workflowType,
    shippingCarrier: normalizedTarget.shippingCarrier,
    outstationLabelRevision: normalizedTarget.deliveryMethod === "outstation" ? now : "",
    storeStatus: preparation.storeStatus,
    packStatus: preparation.packStatus,
    queueStatus: preparation.queueStatus,
    status: preparation.status,
    urgentDelivery: preparation.urgentDelivery,
    chiangmaiRoundCode: "",
    chiangmaiRoundDate: "",
    chiangmaiRoundAssignedAt: "",
    chiangmaiRoundAssignedBy: "",
    driverId: "",
    driverName: "",
    acceptedAt: "",
    driverSequence: 0,
    driverSequenceServiceDate: "",
    driverSequenceUpdatedAt: "",
    driverSequenceUpdatedBy: "",
    queuedAt: preparation.queueStatus === "queued" ? now : "",
    queuedBy: preparation.queueStatus === "queued" ? actorName : "",
    grabReadyAt: "",
    grabReadyBy: "",
    grabPickedUpAt: "",
    grabPickedUpBy: "",
    outstationCompletedAt: "",
    outstationCompletedBy: "",
    outstationDispatchedAt: "",
    outstationDispatchedBy: "",
    outstationDispatchBoxTotal: 0,
    outstationDispatchScans: [],
    outstationDispatchScannedCount: 0,
    outstationDispatchLastScannedAt: "",
    storePackerName: "",
    storeCheckerName: "",
    packPackerName: "",
    packCheckerName: "",
    packPhotos: [],
    missingItems: [],
    storeWorkDetails: {},
    packWorkDetails: {},
    reworkRequired: false,
    reworkRoute: "",
    reworkStatus: "",
    reworkNote: "",
    updatedAt: now
  };
  if (labelInvalidated) Object.assign(patch, {
    outstationLabelInvalidatedAt: now,
    outstationLabelInvalidatedBy: actorName,
    outstationLabelInvalidationReason: rerouteReason
  });
  return { patch, history };
}

export function isReadyOrderWaitingForDispatch(order) {
  const packReady = ["checked", "partial"].includes(String(order?.packStatus || ""));
  const waitingQueue = ["", "preparing", "ready"].includes(String(order?.queueStatus || ""));
  return !isOutstationOrder(order) && packReady && waitingQueue && !order?.driverId && order?.reworkRequired !== true;
}

export function canSalesCompleteChiangmaiOrder(order) {
  return order?.deliveryMethod === "company_driver"
    && order?.workflowType === "store_route"
    && order?.storeStatus === "checked"
    && order?.packStatus === "checked"
    && ["preparing", "ready"].includes(String(order?.queueStatus || ""))
    && !order?.driverId
    && order?.reworkRequired !== true;
}

export function canSalesDeleteChiangmaiOrder(order) {
  return order?.deliveryMethod === "company_driver"
    && Boolean(order?.workflowType)
    && !order?.driverId
    && ["preparing", "ready"].includes(String(order?.queueStatus || ""))
    && !["รอคนขับรับ", "กำลังส่ง", "กำลังจัดส่ง", "ส่งสำเร็จ"].includes(String(order?.status || ""));
}

export function buildSalesChiangmaiCompletionPatch(order = {}, actor = {}, now = new Date().toISOString(), batchId = "") {
  const actorName = String(actor?.name || actor?.email || actor?.uid || "").trim().slice(0, 160);
  const completionBatchId = String(batchId || "").trim().slice(0, 160);
  const history = {
    action: "sales_complete",
    result: "completed_by_sales",
    role: String(actor?.role || "").slice(0, 40),
    name: actorName,
    uid: String(actor?.uid || "").slice(0, 160),
    at: now,
    batchId: completionBatchId
  };
  return {
    patch: {
      status: "ส่งสำเร็จ",
      queueStatus: "completed",
      deliveryCompleteness: "complete",
      deliveredAt: now,
      salesCompletedAt: now,
      salesCompletedBy: actorName,
      salesCompletedByUid: String(actor?.uid || "").slice(0, 160),
      salesCompletionBatchId: completionBatchId,
      deliveryAttemptNumber: Number(order?.deliveryAttemptNumber) || 0,
      workflowHistory: [...(Array.isArray(order?.workflowHistory) ? order.workflowHistory : []).slice(-99), history],
      updatedAt: now
    },
    history
  };
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
