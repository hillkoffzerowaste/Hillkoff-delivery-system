import { isDriverQueueVisibleToDriver } from "./driverQueuePolicy";

export function getDriverQueueOrdersForNotice(orders = [], todayServiceDate) {
  return orders
    .filter((order) => order.status === "รอคนขับรับ"
      && order.queueStatus === "queued"
      && !order.driverId
      && isDriverQueueVisibleToDriver(order, todayServiceDate))
    .slice()
    .sort((left, right) => Date.parse(left.queuedAt || left.updatedAt || left.createdAt || 0) - Date.parse(right.queuedAt || right.updatedAt || right.createdAt || 0));
}

export function buildDriverQueueNotice(orders = []) {
  const lines = ["🚚 ออเดอร์รอคนขับกดรับ", `มีทั้งหมด ${orders.length} งาน`];
  orders.forEach((order, index) => {
    const detail = [order.id, order.customerName, order.zone].filter(Boolean).join(" · ");
    const quantity = order.boxes != null ? ` · ${order.boxes} ${order.packageUnit === "bag" ? "ถุง" : "กล่อง"}` : "";
    lines.push(`${index + 1}. ${detail || "ออเดอร์ใหม่"}${quantity}`);
  });
  lines.push("กรุณาเปิดระบบ Hillkoff Delivery แล้วกดรับออเดอร์ที่พร้อมวิ่ง");
  return lines.join("\n");
}
