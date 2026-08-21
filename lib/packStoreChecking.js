import { isChiangmaiPreparationOrder } from "./preparationWorkflow";

// Store marks both checked and partial orders as ready for Pack, so neither belongs in this strip.
const STORE_CHECKING_STATUSES = new Set(["pending", "working", "waiting", "returned"]);
const STATUS_PRIORITY = { working: 0, returned: 1, waiting: 2, pending: 3 };

export function isStoreCheckingForPack(order = {}) {
  return order.workflowType === "store_route"
    && isChiangmaiPreparationOrder(order)
    && STORE_CHECKING_STATUSES.has(String(order.storeStatus || "pending"));
}

export function getPackStoreCheckingOrders(orders = []) {
  return orders.filter(isStoreCheckingForPack).slice().sort((left, right) => {
    const leftStatus = String(left.storeStatus || "pending");
    const rightStatus = String(right.storeStatus || "pending");
    const statusDifference = (STATUS_PRIORITY[leftStatus] ?? 99) - (STATUS_PRIORITY[rightStatus] ?? 99);
    if (statusDifference) return statusDifference;
    return Date.parse(left.updatedAt || left.createdAt || 0) - Date.parse(right.updatedAt || right.createdAt || 0);
  });
}
