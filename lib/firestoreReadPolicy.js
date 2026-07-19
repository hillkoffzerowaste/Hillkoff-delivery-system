export const INITIAL_RECENT_ORDERS_LIMIT = 100;
export const DRIVER_RECENT_ORDERS_LIMIT = 200;
export const ORDERS_LOAD_MORE_STEP = 200;
export const MAX_RECENT_ORDERS_LIMIT = 600;

export const REPORT_REFRESH_INTERVALS = Object.freeze({
  issues: 300_000,
  kpi: 900_000,
  reports: 600_000
});

export function recentOrdersLimit(requestedLimit, role) {
  const minimum = role === "driver" ? DRIVER_RECENT_ORDERS_LIMIT : INITIAL_RECENT_ORDERS_LIMIT;
  const requested = Number.isFinite(Number(requestedLimit)) ? Math.trunc(Number(requestedLimit)) : minimum;
  return Math.min(MAX_RECENT_ORDERS_LIMIT, Math.max(minimum, requested));
}

export function nextOrdersLimit(currentLimit) {
  const current = Number.isFinite(Number(currentLimit)) ? Math.trunc(Number(currentLimit)) : 0;
  const next = current < ORDERS_LOAD_MORE_STEP ? ORDERS_LOAD_MORE_STEP : current + ORDERS_LOAD_MORE_STEP;
  return Math.min(MAX_RECENT_ORDERS_LIMIT, next);
}
