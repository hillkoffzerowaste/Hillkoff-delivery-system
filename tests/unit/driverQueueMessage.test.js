import { describe, expect, it } from "vitest";
import { buildDriverQueueNotice, getDriverQueueOrdersForNotice } from "../../lib/driverQueueMessage";

const TODAY = "2026-08-21";
const queueOrder = (overrides = {}) => ({
  id: "DO-001",
  customerName: "ร้านกาแฟ",
  zone: "เมืองเชียงใหม่",
  boxes: 2,
  packageUnit: "box",
  status: "รอคนขับรับ",
  queueStatus: "queued",
  driverId: "",
  driverQueuePolicyVersion: 2,
  driverQueueDate: TODAY,
  queuedAt: "2026-08-21T01:00:00.000Z",
  ...overrides
});

describe("driver queue LINE notice", () => {
  it("includes only queue jobs drivers can still accept", () => {
    const pending = getDriverQueueOrdersForNotice([
      queueOrder(),
      queueOrder({ id: "ASSIGNED", driverId: "driver-1" }),
      queueOrder({ id: "EXPIRED", driverQueueDate: "2026-08-20" }),
      queueOrder({ id: "DELIVERING", status: "กำลังส่ง" })
    ], TODAY);

    expect(pending.map((order) => order.id)).toEqual(["DO-001"]);
  });

  it("builds a concise message that asks drivers to accept every listed job", () => {
    expect(buildDriverQueueNotice([queueOrder(), queueOrder({ id: "DO-002", customerName: "ร้านชา", packageUnit: "bag", boxes: 1 })])).toBe([
      "🚚 ออเดอร์รอคนขับกดรับ",
      "มีทั้งหมด 2 งาน",
      "1. DO-001 · ร้านกาแฟ · เมืองเชียงใหม่ · 2 กล่อง",
      "2. DO-002 · ร้านชา · เมืองเชียงใหม่ · 1 ถุง",
      "กรุณาเปิดระบบ Hillkoff Delivery แล้วกดรับออเดอร์ที่พร้อมวิ่ง"
    ].join("\n"));
  });
});
