import { bangkokDateKey } from "./operationsReporting.js";

function occursOnDate(value, dateKey) {
  const raw = String(value || "").trim();
  if (!raw) return false;
  return (/^\d{4}-\d{2}-\d{2}$/.test(raw) ? raw : bangkokDateKey(raw)) === dateKey;
}

export function isSalesDispatchActivityOnDate(order = {}, dateKey) {
  const status = String(order.status || "");
  if (status === "รอคนขับรับ") {
    return order.queueStatus === "queued"
      && (occursOnDate(order.driverQueueDate, dateKey) || occursOnDate(order.queuedAt, dateKey));
  }
  if (["กำลังส่ง", "กำลังจัดส่ง"].includes(status)) {
    return occursOnDate(order.acceptedAt, dateKey) || occursOnDate(order.driverQueueDate, dateKey);
  }
  if (status === "ส่งสำเร็จ") {
    return occursOnDate(order.deliveredAt, dateKey) || occursOnDate(order.lastDeliveryAt, dateKey);
  }
  return false;
}
