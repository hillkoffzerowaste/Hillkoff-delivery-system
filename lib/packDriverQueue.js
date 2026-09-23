import { isOutstationOrder } from "./preparationWorkflow";

export function isPackDriverQueueOrder(order = {}) {
  return order.deliveryMethod === "company_driver"
    && Boolean(order.workflowType)
    && !isOutstationOrder(order)
    && order.queueStatus === "queued";
}

export function getPackDriverQueueOrders(orders = []) {
  return orders.filter(isPackDriverQueueOrder).slice().sort((left, right) => {
    const leftAssigned = Boolean(left.driverId);
    const rightAssigned = Boolean(right.driverId);
    if (leftAssigned !== rightAssigned) return Number(leftAssigned) - Number(rightAssigned);
    const leftAt = Date.parse(left.queuedAt || left.updatedAt || left.createdAt || 0) || 0;
    const rightAt = Date.parse(right.queuedAt || right.updatedAt || right.createdAt || 0) || 0;
    return leftAt - rightAt;
  });
}
