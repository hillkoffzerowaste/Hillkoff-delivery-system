const PICKUP_DELIVERY_METHODS = new Set(["grab_pickup", "customer_pickup"]);
const READY_PACK_STATUSES = new Set(["checked", "partial"]);

export function storefrontOrderStatus(order) {
  if (String(order?.queueStatus || "") === "grab_picked_up" || order?.grabPickedUpAt) return "handed_over";
  if (isStorefrontPickupReady(order)) return "ready";
  return "preparing";
}

export function storefrontOrderDate(order) {
  return String(order?.serviceDate || order?.createdAt || order?.updatedAt || "").slice(0, 10);
}

export function filterStorefrontOrders(orders, { date = "", query = "", status = "all", history = false, today = "" } = {}) {
  const normalizedQuery = String(query || "").trim().toLowerCase();
  return (Array.isArray(orders) ? orders : []).filter((order) => {
    const orderDate = storefrontOrderDate(order);
    if (date && date !== "all" && orderDate !== date) return false;
    if (history && today && (!date || date === "all") && orderDate === today) return false;
    if (status !== "all" && storefrontOrderStatus(order) !== status) return false;
    if (normalizedQuery && ![order.id, order.bookingNumber, order.customerName].some((value) => String(value || "").toLowerCase().includes(normalizedQuery))) return false;
    return true;
  });
}

export function storefrontSelectableOrderIds(orders) {
  return (Array.isArray(orders) ? orders : []).filter((order) => isStorefrontPickupReady(order) && String(order?.queueStatus || "") !== "grab_picked_up").map((order) => String(order.id));
}

export function isStorefrontPickupOrder(order) {
  return PICKUP_DELIVERY_METHODS.has(String(order?.deliveryMethod || ""));
}

export function isStorefrontPickupReady(order) {
  return isStorefrontPickupOrder(order)
    && String(order?.queueStatus || "") === "grab_ready"
    && READY_PACK_STATUSES.has(String(order?.packStatus || ""));
}

export function toStorefrontPickupOrder(order) {
  return {
    id: String(order?.id || ""),
    customerName: String(order?.customerName || ""),
    deliveryMethod: String(order?.deliveryMethod || ""),
    bookingNumber: String(order?.bookingNumber || ""),
    serviceDate: String(order?.serviceDate || "").slice(0, 10),
    createdAt: order?.createdAt || "",
    updatedAt: order?.updatedAt || "",
    status: String(order?.status || ""),
    queueStatus: String(order?.queueStatus || ""),
    storeStatus: String(order?.storeStatus || ""),
    packStatus: String(order?.packStatus || ""),
    grabReadyAt: order?.grabReadyAt || "",
    grabReadyBy: String(order?.grabReadyBy || ""),
    grabPickedUpAt: order?.grabPickedUpAt || "",
    grabPickedUpBy: String(order?.grabPickedUpBy || "")
  };
}

export function storefrontPickupTimeline(order) {
  const storeComplete = ["checked", "partial"].includes(String(order?.storeStatus || ""));
  const packComplete = READY_PACK_STATUSES.has(String(order?.packStatus || ""));
  const customerPickup = String(order?.deliveryMethod || "") === "customer_pickup";
  const pickedUpBy = String(order?.grabPickedUpBy || "").trim();
  return [
    { id: "store", label: storeComplete ? "สโตร์ตรวจแล้ว" : "สโตร์กำลังตรวจ", complete: storeComplete },
    { id: "pack", label: packComplete ? "ห้องแพ็คตรวจแล้ว" : "ห้องแพ็คกำลังตรวจ", complete: packComplete },
    { id: "ready", label: customerPickup ? "พร้อมให้ลูกค้ารับหน้าร้าน" : "พร้อมให้ Grab รับสินค้า", complete: isStorefrontPickupReady(order) || String(order?.queueStatus || "") === "grab_picked_up" },
    { id: "handover", label: pickedUpBy ? `มอบสินค้าแล้ว · ${pickedUpBy}` : "รอยืนยันการมอบสินค้า", complete: Boolean(order?.grabPickedUpAt) }
  ];
}
