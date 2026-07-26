import { classifyOrderArea, orderDeliveryDateKey } from "./operationsReporting.js";

const keyOf = (date, vehicleId, driverId) => `${date}|${vehicleId || "unallocated"}|${driverId || "unknown"}`;
const inRange = (date, from, to) => Boolean(date) && (!from || date >= from) && (!to || date <= to);
const isDelivered = (order) => {
  const queueStatus = String(order.queueStatus || "");
  const status = String(order.status || "").toLowerCase();
  return queueStatus === "completed"
    || order.deliveryCompleteness === "complete"
    || status === "delivered"
    || status.includes("ส่งสำเร็จ");
};

export function buildVehicleReport({
  from = "", to = "", vehicleId = "", driverId = "",
  usageEvents = [], fuelBills = [], assessments = [], orders = [], vehicles = []
} = {}) {
  const rows = new Map();
  const ensure = (date, vehicle, driver, source = {}) => {
    const key = keyOf(date, vehicle, driver);
    if (!rows.has(key)) rows.set(key, {
      id: key, serviceDate: date, vehicleId: vehicle || "", assetCode: source.assetCode || vehicle || "",
      plate: source.plate || "", responsiblePerson: source.responsiblePerson || "", driverId: driver || "",
      driverName: source.driverName || "", odometerStart: null, odometerEnd: null, distanceKm: 0,
      inspectionStatus: "missing", usageEventCount: 0, autoClosed: false, fuelLiters: 0, fuelAmount: 0,
      deliveredOrders: 0, cityOrders: 0, outstationOrders: 0, vehicleLinkStatus: vehicle ? "exact" : "unallocated"
    });
    return rows.get(key);
  };

  for (const event of usageEvents) {
    const date = String(event.serviceDate || "");
    if (!inRange(date, from, to)) continue;
    const row = ensure(date, event.vehicleId, event.driverId, event);
    row.usageEventCount += 1;
    row.autoClosed ||= event.autoClosed === true;
    row.driverName ||= event.driverName || "";
    row.plate ||= event.plate || "";
    const odo = Number(event.odometer);
    if (Number.isFinite(odo)) {
      if (event.eventType === "start") row.odometerStart = row.odometerStart == null ? odo : Math.min(row.odometerStart, odo);
      if (event.eventType === "end") row.odometerEnd = row.odometerEnd == null ? odo : Math.max(row.odometerEnd, odo);
    }
  }
  for (const row of rows.values()) {
    if (row.odometerStart != null && row.odometerEnd != null) row.distanceKm = Math.max(0, row.odometerEnd - row.odometerStart);
  }
  for (const bill of fuelBills) {
    const date = String(bill.serviceDate || "");
    if (!inRange(date, from, to)) continue;
    const row = ensure(date, bill.vehicleId, bill.driverId, bill);
    row.fuelLiters += Number(bill.liters) || 0;
    row.fuelAmount += Number(bill.amount) || 0;
  }
  for (const assessment of assessments) {
    const date = String(assessment.serviceDate || "");
    if (!inRange(date, from, to)) continue;
    ensure(date, assessment.vehicleId, assessment.driverId, assessment).inspectionStatus = "completed";
  }

  let ambiguousOrders = 0;
  let unallocatedOrders = 0;
  for (const order of orders) {
    if (!isDelivered(order)) continue;
    const date = orderDeliveryDateKey(order);
    if (!inRange(date, from, to)) continue;
    let linkedVehicleId = String(order.deliveryVehicleId || "");
    let linkStatus = linkedVehicleId ? "exact" : "unallocated";
    if (!linkedVehicleId) {
      const candidates = [...new Set(usageEvents
        .filter((event) => event.driverId === order.driverId && event.serviceDate === date && event.vehicleId)
        .map((event) => event.vehicleId))];
      if (candidates.length === 1) {
        [linkedVehicleId] = candidates;
        linkStatus = "historical-single-vehicle";
      } else if (candidates.length > 1) {
        ambiguousOrders += 1;
        continue;
      } else {
        unallocatedOrders += 1;
        continue;
      }
    }
    const source = usageEvents.find((event) => event.vehicleId === linkedVehicleId && event.driverId === order.driverId && event.serviceDate === date) || {};
    const row = ensure(date, linkedVehicleId, order.driverId, source);
    row.vehicleLinkStatus = linkStatus;
    row.deliveredOrders += 1;
    row[`${classifyOrderArea(order)}Orders`] += 1;
  }

  const filteredRows = [...rows.values()]
    .filter((row) => (!vehicleId || row.vehicleId === vehicleId) && (!driverId || row.driverId === driverId))
    .sort((a, b) => b.serviceDate.localeCompare(a.serviceDate) || a.plate.localeCompare(b.plate));
  const summary = filteredRows.reduce((sum, row) => ({
    vehicles: sum.vehicleIds.add(row.vehicleId),
    vehicleIds: sum.vehicleIds,
    distanceKm: sum.distanceKm + row.distanceKm,
    fuelLiters: sum.fuelLiters + row.fuelLiters,
    fuelAmount: sum.fuelAmount + row.fuelAmount,
    deliveredOrders: sum.deliveredOrders + row.deliveredOrders,
    cityOrders: sum.cityOrders + row.cityOrders,
    outstationOrders: sum.outstationOrders + row.outstationOrders
  }), { vehicleIds: new Set(), distanceKm: 0, fuelLiters: 0, fuelAmount: 0, deliveredOrders: 0, cityOrders: 0, outstationOrders: 0 });
  summary.vehicles = summary.vehicleIds.size;
  delete summary.vehicleIds;
  return { rows: filteredRows, summary, dataQuality: { ambiguousOrders, unallocatedOrders }, vehicles };
}
