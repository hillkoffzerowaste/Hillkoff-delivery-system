export const INITIAL_RECENT_ORDERS_LIMIT = 100;
export const DRIVER_RECENT_ORDERS_LIMIT = 200;
export const ORDERS_LOAD_MORE_STEP = 200;
export const MAX_RECENT_ORDERS_LIMIT = 600;
export const INITIAL_CUSTOMER_RESULTS_LIMIT = 200;
export const CUSTOMER_SEARCH_DEBOUNCE_MS = 500;

const REALTIME_ORDER_TABS = new Set([
  "sales",
  "sales-outstation",
  "dispatch",
  "driver",
  "driver-prep",
  "driver-ratings",
  "store-work",
  "store-pickup",
  "store-booking",
  "store-online",
  "pack-work",
  "pack-pickup",
  "pack-outstation",
  "pack-booking",
  "pack-online",
  "chiangmai",
  "reports"
]);

const SNAPSHOT_ORDER_TABS = new Set(["store-dashboard", "pack-dashboard"]);

export function getOrdersSyncMode(displayTab) {
  const tab = String(displayTab || "");
  if (REALTIME_ORDER_TABS.has(tab)) return "realtime";
  if (SNAPSHOT_ORDER_TABS.has(tab)) return "snapshot";
  return "none";
}

export function shouldPauseFirestoreSync({ isVisible, role } = {}) {
  return isVisible === false && role !== "driver";
}

export const REPORT_REFRESH_INTERVALS = Object.freeze({
  // Keep background reads bounded; manual refresh remains available.
  issues: 900_000,
  kpi: 900_000,
  reports: 900_000
});

export function recentOrdersLimit(requestedLimit, role) {
  const minimum = role === "driver" ? DRIVER_RECENT_ORDERS_LIMIT : INITIAL_RECENT_ORDERS_LIMIT;
  const requested = Number.isFinite(Number(requestedLimit)) ? Math.trunc(Number(requestedLimit)) : minimum;
  return Math.min(MAX_RECENT_ORDERS_LIMIT, Math.max(minimum, requested));
}

const NO_ACTIVE_ORDERS_TABS = new Set(["store-dashboard", "pack-dashboard", "reports"]);

export function needsActiveOrdersQuery(tab) {
  return !NO_ACTIVE_ORDERS_TABS.has(String(tab || ""));
}

export function nextOrdersLimit(currentLimit) {
  const current = Number.isFinite(Number(currentLimit)) ? Math.trunc(Number(currentLimit)) : 0;
  const next = current < ORDERS_LOAD_MORE_STEP ? ORDERS_LOAD_MORE_STEP : current + ORDERS_LOAD_MORE_STEP;
  return Math.min(MAX_RECENT_ORDERS_LIMIT, next);
}
