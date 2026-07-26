import {
  classifyOrderArea,
  isChiangmaiBacklogForDate,
  isChiangmaiWaitingForDate,
  isOutstationWaitingForDate,
  isTerminalDeliveryOrder,
  orderCreatedDateKey
} from "./operationsReporting.js";

export function dispatchDashboardReadPlan(selectedDate) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(selectedDate || ""))) throw new Error("Invalid selected date");
  return [
    { collection: "orders", field: "serviceDate", op: "==", value: selectedDate },
    { collection: "orders", field: "queueStatus", op: "in", value: ["preparing", "ready", "queued", "grab_ready"] }
  ];
}

export function buildDispatchDashboard(orders = [], selectedDate) {
  const dates = [...new Set(orders.map(orderCreatedDateKey).filter(Boolean))].sort().reverse().slice(0, 120);
  const selected = selectedDate || dates[0] || "";
  const selectedOrders = orders.filter((order) => orderCreatedDateKey(order) === selected);
  const driverMap = new Map();
  for (const order of selectedOrders) {
    if (!order.driverId) continue;
    const current = driverMap.get(order.driverId) || {
      driverId: order.driverId, driverName: order.driverName || "", plate: order.deliveryVehiclePlate || "",
      total: 0, waiting: 0, active: 0, delivered: 0, city: 0, outstation: 0
    };
    current.total += 1;
    current[classifyOrderArea(order)] += 1;
    if (isTerminalDeliveryOrder(order)) current.delivered += 1;
    else if (String(order.status || "").includes("กำลัง")) current.active += 1;
    else current.waiting += 1;
    driverMap.set(order.driverId, current);
  }
  return {
    selectedDate: selected,
    availableDates: dates,
    cards: {
      created: selectedOrders.length,
      waitingDriver: selectedOrders.filter((order) => !order.driverId && !isTerminalDeliveryOrder(order)).length,
      activeDelivery: selectedOrders.filter((order) => order.driverId && !isTerminalDeliveryOrder(order)).length,
      delivered: selectedOrders.filter(isTerminalDeliveryOrder).length,
      routeTasks: selectedOrders.filter((order) => Boolean(order.routeTaskId)).length,
      chiangmaiWaiting: orders.filter((order) => isChiangmaiWaitingForDate(order, selected)).length,
      chiangmaiBacklog: orders.filter((order) => isChiangmaiBacklogForDate(order, selected)).length,
      outstationWaiting: orders.filter((order) => isOutstationWaitingForDate(order, selected)).length
    },
    orders: selectedOrders.map((order) => ({ ...order, createdDate: orderCreatedDateKey(order) })),
    driverLoads: [...driverMap.values()].sort((a, b) => b.total - a.total)
  };
}
