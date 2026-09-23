import { describe, expect, it } from "vitest";
import { getPackDriverQueueOrders, isPackDriverQueueOrder } from "../../lib/packDriverQueue";

const queuedOrder = (overrides = {}) => ({
  deliveryMethod: "company_driver",
  workflowType: "store_route",
  queueStatus: "queued",
  queuedAt: "2026-09-23T01:00:00.000Z",
  ...overrides
});

describe("Pack driver queue tracking", () => {
  it("shows only Chiang Mai company-driver orders already in the driver queue", () => {
    expect(isPackDriverQueueOrder(queuedOrder())).toBe(true);
    expect(isPackDriverQueueOrder(queuedOrder({ deliveryMethod: "outstation" }))).toBe(false);
    expect(isPackDriverQueueOrder(queuedOrder({ queueStatus: "preparing" }))).toBe(false);
    expect(isPackDriverQueueOrder(queuedOrder({ workflowType: "direct_pack", shippingCarrier: "Flash" }))).toBe(false);
  });

  it("keeps unassigned jobs before jobs already accepted by a driver", () => {
    const result = getPackDriverQueueOrders([
      queuedOrder({ id: "assigned", driverId: "D1", queuedAt: "2026-09-23T01:00:00.000Z" }),
      queuedOrder({ id: "waiting", queuedAt: "2026-09-23T02:00:00.000Z" })
    ]);
    expect(result.map((order) => order.id)).toEqual(["waiting", "assigned"]);
  });
});
