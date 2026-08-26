import { isOutstationOrder } from "./preparationWorkflow.js";
import { vehicleDisplayName } from "./vehicleMaster.js";

export const TERMINAL_QUEUE_STATUSES = new Set([
  "completed", "outstation_ready", "grab_completed", "grab_picked_up", "pack_archived", "driver_archived", "cancelled"
]);

function dateValue(value) {
  if (!value) return null;
  if (typeof value.toDate === "function") return value.toDate();
  if (typeof value.toMillis === "function") return new Date(value.toMillis());
  if (typeof value === "object" && Number.isFinite(value.seconds)) return new Date(value.seconds * 1000);
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function bangkokDateKey(value = new Date()) {
  const date = dateValue(value);
  if (!date) return "";
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Bangkok", year: "numeric", month: "2-digit", day: "2-digit"
  }).formatToParts(date);
  const part = (type) => parts.find((item) => item.type === type)?.value || "";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

function bangkokUtcBoundary(dateKey, daysToAdd = 0) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(dateKey || ""))) throw new Error("Invalid report date");
  const [year, month, day] = String(dateKey).split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day + daysToAdd, -7)).toISOString();
}

export function vehicleReportReadPlan({ from, to } = {}) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(from || ""))
    || !/^\d{4}-\d{2}-\d{2}$/.test(String(to || ""))
    || from > to) {
    throw new Error("Invalid report date range");
  }
  return [
    { collection: "vehicle_usage_events", field: "serviceDate", from, to },
    { collection: "fuel_bills", field: "serviceDate", from, to },
    { collection: "driver_daily_assessments", field: "serviceDate", from, to },
    { collection: "orders", field: "serviceDate", from, to },
    { collection: "orders", field: "deliveryServiceDate", from, to },
    {
      collection: "orders",
      field: "updatedAt",
      from: bangkokUtcBoundary(from),
      toExclusive: bangkokUtcBoundary(to, 1)
    }
  ];
}

export function dailyOrdersReadPlan({ from, to } = {}) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(from || ""))
    || !/^\d{4}-\d{2}-\d{2}$/.test(String(to || ""))
    || from > to) {
    throw new Error("Invalid report date range");
  }
  return [{ collection: "orders", field: "serviceDate", from, to }];
}

export function orderCreatedDateKey(order = {}) {
  const explicit = String(order.createdServiceDate || "").slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(explicit) ? explicit : bangkokDateKey(order.createdAt || order.serviceDate);
}

function parseLegacyDeliveredAt(value) {
  const match = String(value || "").match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (!match) return "";
  const year = Number(match[3]) > 2400 ? Number(match[3]) - 543 : Number(match[3]);
  return `${year}-${String(match[2]).padStart(2, "0")}-${String(match[1]).padStart(2, "0")}`;
}

export function orderDeliveryDateKey(order = {}) {
  const explicit = String(order.deliveryServiceDate || "").slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}$/.test(explicit)) return explicit;
  const legacy = parseLegacyDeliveredAt(order.deliveredAt);
  if (legacy) return legacy;
  return bangkokDateKey(order.deliveredAt || order.serviceDate || order.updatedAt);
}

export function isTerminalDeliveryOrder(order = {}) {
  const queueStatus = String(order.queueStatus || "");
  const status = String(order.status || "").toLowerCase();
  return TERMINAL_QUEUE_STATUSES.has(queueStatus)
    || status.includes("ยกเลิก")
    || status.includes("สำเร็จ")
    || status === "cancelled"
    || status === "delivered";
}

export function classifyOrderArea(order = {}) {
  return isOutstationOrder(order) || String(order.areaType || "").toLowerCase() === "outstation"
    ? "outstation"
    : "city";
}

function isOpen(order) {
  return !isTerminalDeliveryOrder(order);
}

function isChiangmaiCompanyDriverOrder(order) {
  return order?.deliveryMethod === "company_driver" && classifyOrderArea(order) === "city";
}

export function isChiangmaiWaitingForDate(order, selectedDate) {
  return isChiangmaiCompanyDriverOrder(order) && isOpen(order) && orderCreatedDateKey(order) === selectedDate;
}

export function isChiangmaiBacklogForDate(order, selectedDate) {
  const created = orderCreatedDateKey(order);
  return isChiangmaiCompanyDriverOrder(order) && isOpen(order) && Boolean(created) && created < selectedDate;
}

export function isOutstationWaitingForDate(order, selectedDate) {
  return classifyOrderArea(order) === "outstation" && isOpen(order) && orderCreatedDateKey(order) <= selectedDate;
}

export function resolveDeliveryVehicleSnapshotFromEvents(events = [], serviceDate) {
  const matching = events.filter((event) => String(event.serviceDate || "") === serviceDate && event.vehicleId);
  const ids = [...new Set(matching.map((event) => String(event.vehicleId)))];
  if (ids.length !== 1) {
    return {
      deliveryServiceDate: serviceDate,
      deliveryVehicleId: "",
      deliveryVehiclePlate: "",
      deliveryVehicleName: "",
      deliveryVehicleSource: "unresolved"
    };
  }
  const event = matching.find((item) => String(item.vehicleId) === ids[0]) || {};
  return {
    deliveryServiceDate: serviceDate,
    deliveryVehicleId: ids[0],
    deliveryVehiclePlate: String(event.plate || ""),
    deliveryVehicleName: String(event.vehicleName || vehicleDisplayName(event)),
    deliveryVehicleSource: "driver-usage-exact"
  };
}

// กรอง serviceDate ที่ฝั่งเซิร์ฟเวอร์ ไม่ใช่ดึงมา 200 รายการแล้วกรองในหน่วยความจำ: limit ไม่มี
// orderBy จึงได้เอกสารตามลำดับ key พอคนขับสะสม event เกิน 200 งานของวันนี้อาจไม่ติดมาใน 200 แรก
// แล้วรถที่ใช้ส่งจะกลายเป็น "unresolved" เงียบๆ (คนขับที่ใช้งานมากที่สุดอยู่ที่ 122 event แล้ว)
// สองเงื่อนไขนี้เป็น equality ทั้งคู่ Firestore รวม single-field index ให้ได้ ไม่ต้องเพิ่ม composite index
export async function resolveDeliveryVehicleSnapshot(db, { driverId, deliveryServiceDate }) {
  const snap = await db.collection("vehicle_usage_events")
    .where("driverId", "==", driverId)
    .where("serviceDate", "==", deliveryServiceDate)
    .limit(200)
    .get();
  return resolveDeliveryVehicleSnapshotFromEvents(snap.docs.map((doc) => ({ id: doc.id, ...doc.data() })), deliveryServiceDate);
}
