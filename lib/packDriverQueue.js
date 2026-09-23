import { isOutstationOrder } from "./preparationWorkflow";

export function isPackDriverQueueOrder(order = {}, todayServiceDate = "") {
  return order.deliveryMethod === "company_driver"
    && Boolean(order.workflowType)
    && !isOutstationOrder(order)
    && order.queueStatus === "queued"
    && order.status === "รอคนขับรับ"
    && !order.driverId
    && String(order.driverQueueDate || "") === String(todayServiceDate || "");
}

export function getPackDriverQueueOrders(orders = [], todayServiceDate = "") {
  return orders.filter((order) => isPackDriverQueueOrder(order, todayServiceDate)).slice().sort((left, right) => {
    const leftAt = Date.parse(left.queuedAt || left.updatedAt || left.createdAt || 0) || 0;
    const rightAt = Date.parse(right.queuedAt || right.updatedAt || right.createdAt || 0) || 0;
    return leftAt - rightAt;
  });
}
