import { bangkokDateKey } from "./operationsReporting.js";

export const DRIVER_QUEUE_POLICY_VERSION = 2;

// คิวคนขับอยู่ได้ 3 วันนับรวมวันที่เข้าคิว (เดิมหมดอายุข้ามวันทันที) จึงหมดอายุตอนขึ้นวันที่ 4
export const DRIVER_QUEUE_ACTIVE_DAYS = 3;

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function daysBetweenDateKeys(fromKey, toKey) {
  const from = Date.parse(`${fromKey}T00:00:00+07:00`);
  const to = Date.parse(`${toKey}T00:00:00+07:00`);
  return Number.isFinite(from) && Number.isFinite(to) ? Math.round((to - from) / 86_400_000) : 0;
}

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
  if (!DATE_PATTERN.test(queueDate) || queueDate >= today) return false;
  return daysBetweenDateKeys(queueDate, today) >= DRIVER_QUEUE_ACTIVE_DAYS;
}

// วันสุดท้ายที่คนขับยังเห็นงานนี้ในคิว (วันเข้าคิวนับเป็นวันแรก)
export function driverQueueVisibleUntil(order = {}) {
  const queueDate = String(order.driverQueueDate || "");
  if (!DATE_PATTERN.test(queueDate)) return "";
  return bangkokDateKey(new Date(Date.parse(`${queueDate}T12:00:00+07:00`) + (DRIVER_QUEUE_ACTIVE_DAYS - 1) * 86_400_000));
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
