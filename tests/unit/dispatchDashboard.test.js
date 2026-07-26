import { describe, expect, it } from "vitest";
import { buildDispatchDashboard, dispatchDashboardReadPlan } from "../../lib/dispatchDashboard.js";

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

  it("keeps Chiang Mai waiting and backlog cards limited to company-driver orders", () => {
    const result = buildDispatchDashboard([
      { id: "TODAY", createdAt: "2026-07-26T01:00:00.000Z", deliveryMethod: "company_driver", queueStatus: "preparing" },
      { id: "OLD", createdAt: "2026-07-25T01:00:00.000Z", deliveryMethod: "company_driver", queueStatus: "queued" },
      { id: "GRAB", createdAt: "2026-07-26T02:00:00.000Z", deliveryMethod: "grab_pickup", queueStatus: "grab_ready" },
      { id: "PICKUP", createdAt: "2026-07-25T02:00:00.000Z", deliveryMethod: "customer_pickup", queueStatus: "grab_ready" }
    ], "2026-07-26");
    expect(result.cards.chiangmaiWaiting).toBe(1);
    expect(result.cards.chiangmaiBacklog).toBe(1);
  });

  it("reads only the selected date and open delivery queues", () => {
    expect(dispatchDashboardReadPlan("2026-07-26")).toEqual([
      { collection: "orders", field: "serviceDate", op: "==", value: "2026-07-26" },
      { collection: "orders", field: "queueStatus", op: "in", value: ["preparing", "ready", "queued"] }
    ]);
  });
});
