const PICKUP_DELIVERY_METHODS = new Set(["grab_pickup", "customer_pickup"]);
const READY_PACK_STATUSES = new Set(["checked", "partial"]);

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
