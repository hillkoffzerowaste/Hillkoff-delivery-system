import { bangkokDateKey } from "./operationsReporting.js";

export const DRIVER_QUEUE_POLICY_VERSION = 2;

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function assertDateKey(dateKey) {
  if (!DATE_PATTERN.test(String(dateKey || ""))) {
    throw new Error("Driver queue date must use YYYY-MM-DD");
  }
}

function isVersionedQueue(order = {}) {
  return order.driverQueuePolicyVersion === DRIVER_QUEUE_POLICY_VERSION;
}

function isUnassignedWaitingQueue(order = {}) {
  return !order.driverId
    && order.queueStatus === "queued"
    && order.status === "รอคนขับรับ";
}

function hasExpiredQueueDate(order = {}, today) {
  const queueDate = String(order.driverQueueDate || "");
  return DATE_PATTERN.test(queueDate) && queueDate < today;
}

export function buildDriverQueuePolicyPatch(now) {
  const queuedAt = typeof now === "string" ? now : now?.toISOString?.();
  const driverQueueDate = bangkokDateKey(now);
  if (!queuedAt || !driverQueueDate) throw new Error("Invalid driver queue timestamp");
  return {
    driverQueuePolicyVersion: DRIVER_QUEUE_POLICY_VERSION,
    driverQueueDate,
    queuedAt,
    queueStatus: "queued",
    status: "รอคนขับรับ"
  };
}

export function isDriverQueueVisibleToDriver(order = {}, today) {
  assertDateKey(today);
  if (!isVersionedQueue(order) || !isUnassignedWaitingQueue(order)) return true;
  return !hasExpiredQueueDate(order, today);
}

export function isExpiredDriverQueueForSales(order = {}, today) {
  assertDateKey(today);
  return isVersionedQueue(order)
    && isUnassignedWaitingQueue(order)
    && hasExpiredQueueDate(order, today);
}

export function refreshVersionedDriverQueuePatch(order = {}, now) {
  if (!isVersionedQueue(order)) return {};
  return buildDriverQueuePolicyPatch(now);
}
