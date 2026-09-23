import { describe, expect, it } from "vitest";
import { getPackDriverQueueOrders, isPackDriverQueueOrder } from "../../lib/packDriverQueue";

const queuedOrder = (overrides = {}) => ({
  deliveryMethod: "company_driver",
  workflowType: "store_route",
  queueStatus: "queued",
  status: "รอคนขับรับ",
  driverQueueDate: "2026-09-23",
  queuedAt: "2026-09-23T01:00:00.000Z",
  ...overrides
});

describe("Pack driver queue tracking", () => {
  it("shows only Chiang Mai company-driver orders already in the driver queue", () => {
    expect(isPackDriverQueueOrder(queuedOrder(), "2026-09-23")).toBe(true);
    expect(isPackDriverQueueOrder(queuedOrder({ deliveryMethod: "outstation" }), "2026-09-23")).toBe(false);
    expect(isPackDriverQueueOrder(queuedOrder({ queueStatus: "preparing" }), "2026-09-23")).toBe(false);
    expect(isPackDriverQueueOrder(queuedOrder({ workflowType: "direct_pack", shippingCarrier: "Flash" }), "2026-09-23")).toBe(false);
    expect(isPackDriverQueueOrder(queuedOrder({ driverId: "D1" }), "2026-09-23")).toBe(false);
    expect(isPackDriverQueueOrder(queuedOrder({ driverQueueDate: "2026-09-22" }), "2026-09-23")).toBe(false);
  });

  it("keeps only today's unassigned jobs in queue order", () => {
    const result = getPackDriverQueueOrders([
      queuedOrder({ id: "assigned", driverId: "D1", queuedAt: "2026-09-23T01:00:00.000Z" }),
      queuedOrder({ id: "waiting-late", queuedAt: "2026-09-23T02:00:00.000Z" }),
      queuedOrder({ id: "yesterday", driverQueueDate: "2026-09-22" }),
      queuedOrder({ id: "already-delivering", status: "กำลังส่ง" })
    ], "2026-09-23");
    expect(result.map((order) => order.id)).toEqual(["waiting-late"]);
  });
});
