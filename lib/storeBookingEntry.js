import { normalizeBookingNumberList, parseBookingNumberList } from "./bookingRegistry.js";

export function normalizeStoreBookingEntryStatus(value) {
  return value === "confirmed" ? "confirmed" : "draft";
}

export function prepareBookingNumberUpdate(currentValues, desiredValues) {
  const parsed = parseBookingNumberList(desiredValues);
  if (!parsed.ok) return { ok: false, error: parsed.error, current: null, items: null, primary: null, toAdd: null, toRemove: null };
  if (parsed.items.length === 0) {
    return { ok: false, error: "ต้องมีเลขใบสั่งจองอย่างน้อย 1 เลข", current: normalizeBookingNumberList(currentValues), items: null, primary: null, toAdd: null, toRemove: null };
  }
  const current = normalizeBookingNumberList(currentValues);
  const currentSet = new Set(current);
  const desiredSet = new Set(parsed.items);
  return {
    ok: true,
    error: null,
    current,
    items: parsed.items,
    primary: parsed.items[0],
    toAdd: parsed.items.filter((value) => !currentSet.has(value)),
    toRemove: current.filter((value) => !desiredSet.has(value)),
  };
}

export function isStoreBookingEntryOrder(order = {}) {
  return order.workflowType === "store_route"
    && !["grab_pickup", "customer_pickup", "outstation"].includes(order.deliveryMethod)
    && !["completed", "pack_archived", "report_archived"].includes(String(order.queueStatus || ""));
}
