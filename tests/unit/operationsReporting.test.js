import { describe, expect, it } from "vitest";
import {
  bangkokDateKey,
  classifyOrderArea,
  dailyOrdersReadPlan,
  isChiangmaiBacklogForDate,
  isChiangmaiWaitingForDate,
  isOutstationWaitingForDate,
  orderCreatedDateKey,
  orderDeliveryDateKey,
  resolveDeliveryVehicleSnapshotFromEvents,
  vehicleReportReadPlan
} from "../../lib/operationsReporting.js";

describe("operations reporting policies", () => {
  it("uses Bangkok business dates for created and delivered orders", () => {
    expect(bangkokDateKey("2026-07-25T18:30:00.000Z")).toBe("2026-07-26");
    expect(orderCreatedDateKey({ createdAt: "2026-07-25T18:30:00.000Z" })).toBe("2026-07-26");
    expect(orderDeliveryDateKey({ deliveryServiceDate: "2026-07-26" })).toBe("2026-07-26");
    expect(orderDeliveryDateKey({ deliveredAt: "26/7/2569 10:30:00" })).toBe("2026-07-26");
  });

  it("calculates the three dispatch cards from creation date and open state", () => {
    const cityToday = { createdAt: "2026-07-26T02:00:00.000Z", deliveryMethod: "company_driver", queueStatus: "preparing" };
    const cityOld = { createdAt: "2026-07-25T02:00:00.000Z", deliveryMethod: "company_driver", queueStatus: "queued" };
    const outstation = { createdAt: "2026-07-26T02:00:00.000Z", deliveryMethod: "outstation", queueStatus: "preparing" };
    expect(classifyOrderArea(cityToday)).toBe("city");
    expect(classifyOrderArea(outstation)).toBe("outstation");
    expect(isChiangmaiWaitingForDate(cityToday, "2026-07-26")).toBe(true);
    expect(isChiangmaiBacklogForDate(cityOld, "2026-07-26")).toBe(true);
    expect(isOutstationWaitingForDate(outstation, "2026-07-26")).toBe(true);
    expect(isChiangmaiWaitingForDate({ ...cityToday, queueStatus: "completed" }, "2026-07-26")).toBe(false);
  });

  it("excludes Grab and customer pickup from Chiang Mai delivery cards", () => {
    const grabToday = { createdAt: "2026-07-26T02:00:00.000Z", deliveryMethod: "grab_pickup", queueStatus: "grab_ready" };
    const pickupOld = { createdAt: "2026-07-25T02:00:00.000Z", deliveryMethod: "customer_pickup", queueStatus: "grab_ready" };
    expect(isChiangmaiWaitingForDate(grabToday, "2026-07-26")).toBe(false);
    expect(isChiangmaiBacklogForDate(pickupOld, "2026-07-26")).toBe(false);
  });

  it("never guesses a vehicle when a driver used more than one vehicle", () => {
    const exact = resolveDeliveryVehicleSnapshotFromEvents([
      { vehicleId: "V1", plate: "กข 1", serviceDate: "2026-07-26" },
      { vehicleId: "V1", plate: "กข 1", serviceDate: "2026-07-26" }
    ], "2026-07-26");
    const ambiguous = resolveDeliveryVehicleSnapshotFromEvents([
      { vehicleId: "V1", serviceDate: "2026-07-26" },
      { vehicleId: "V2", serviceDate: "2026-07-26" }
    ], "2026-07-26");
    expect(exact).toMatchObject({ deliveryVehicleId: "V1", deliveryVehicleSource: "driver-usage-exact" });
    expect(ambiguous).toMatchObject({ deliveryVehicleId: "", deliveryVehicleSource: "unresolved" });
  });

  it("scopes vehicle report reads to the selected Bangkok date range", () => {
    expect(vehicleReportReadPlan({ from: "2026-07-01", to: "2026-07-31" })).toEqual([
      { collection: "vehicle_usage_events", field: "serviceDate", from: "2026-07-01", to: "2026-07-31" },
      { collection: "fuel_bills", field: "serviceDate", from: "2026-07-01", to: "2026-07-31" },
      { collection: "driver_daily_assessments", field: "serviceDate", from: "2026-07-01", to: "2026-07-31" },
      { collection: "orders", field: "serviceDate", from: "2026-07-01", to: "2026-07-31" },
      { collection: "orders", field: "deliveryServiceDate", from: "2026-07-01", to: "2026-07-31" },
      {
        collection: "orders",
        field: "updatedAt",
        from: "2026-06-30T17:00:00.000Z",
        toExclusive: "2026-07-31T17:00:00.000Z"
      }
    ]);
  });

  it("scopes the daily report read to a single serviceDate range on orders", () => {
    expect(dailyOrdersReadPlan({ from: "2026-07-01", to: "2026-07-31" })).toEqual([
      { collection: "orders", field: "serviceDate", from: "2026-07-01", to: "2026-07-31" }
    ]);
    expect(() => dailyOrdersReadPlan({ from: "2026-07-31", to: "2026-07-01" })).toThrow("Invalid report date range");
    expect(() => dailyOrdersReadPlan({ from: "bad", to: "2026-07-31" })).toThrow("Invalid report date range");
  });
});
