import { describe, expect, it } from "vitest";
import { buildDispatchDashboard } from "../../lib/dispatchDashboard.js";

describe("sales dispatch dashboard", () => {
  it("filters by order creation date and returns eight cards plus daily driver loads", () => {
    const result = buildDispatchDashboard([
      { id: "A", createdAt: "2026-07-26T01:00:00.000Z", deliveryMethod: "company_driver", queueStatus: "queued", driverId: "D1", driverName: "One" },
      { id: "B", createdAt: "2026-07-25T01:00:00.000Z", deliveryMethod: "company_driver", queueStatus: "preparing" },
      { id: "C", createdAt: "2026-07-26T02:00:00.000Z", deliveryMethod: "outstation", queueStatus: "preparing" }
    ], "2026-07-26");
    expect(Object.keys(result.cards)).toHaveLength(8);
    expect(result.cards.chiangmaiWaiting).toBe(1);
    expect(result.cards.chiangmaiBacklog).toBe(1);
    expect(result.cards.outstationWaiting).toBe(1);
    expect(result.orders.map((order) => order.id)).toContain("A");
    expect(result.driverLoads[0]).toMatchObject({ driverId: "D1", total: 1 });
  });

  it("removes outstation work after pack marks it ready for dispatch", () => {
    const result = buildDispatchDashboard([
      { id: "READY", createdAt: "2026-07-25T01:00:00.000Z", deliveryMethod: "outstation", queueStatus: "outstation_ready" }
    ], "2026-07-26");
    expect(result.cards.outstationWaiting).toBe(0);
  });
});
