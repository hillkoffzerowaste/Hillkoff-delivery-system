import { describe, expect, it } from "vitest";
import { buildVehicleReport } from "../../lib/vehicleReport.js";

describe("vehicle report aggregation", () => {
  it("summarizes daily mileage, fuel, inspections and delivered order zones", () => {
    const report = buildVehicleReport({
      from: "2026-07-26",
      to: "2026-07-26",
      usageEvents: [
        { id: "s", serviceDate: "2026-07-26", eventType: "start", driverId: "D1", driverName: "Driver", vehicleId: "V1", plate: "กข 1", odometer: 100 },
        { id: "e", serviceDate: "2026-07-26", eventType: "end", driverId: "D1", driverName: "Driver", vehicleId: "V1", plate: "กข 1", odometer: 150 }
      ],
      fuelBills: [{ serviceDate: "2026-07-26", driverId: "D1", vehicleId: "V1", liters: 20, amount: 700 }],
      assessments: [{ serviceDate: "2026-07-26", driverId: "D1", vehicleId: "V1" }],
      orders: [
        { id: "O1", deliveryServiceDate: "2026-07-26", driverId: "D1", deliveryVehicleId: "V1", deliveryMethod: "company_driver", queueStatus: "completed" },
        { id: "O2", deliveryServiceDate: "2026-07-26", driverId: "D1", deliveryVehicleId: "V1", deliveryMethod: "outstation", queueStatus: "completed" }
      ]
    });
    expect(report.rows[0]).toMatchObject({
      serviceDate: "2026-07-26",
      distanceKm: 50,
      fuelLiters: 20,
      fuelAmount: 700,
      deliveredOrders: 2,
      cityOrders: 1,
      outstationOrders: 1,
      inspectionStatus: "completed",
      odometerStartEventId: "s",
      odometerEndEventId: "e"
    });
    expect(report.summary).toMatchObject({ distanceKm: 50, deliveredOrders: 2, fuelLiters: 20 });
  });

  it("keeps ambiguous historical orders visible without assigning them to a vehicle", () => {
    const report = buildVehicleReport({
      from: "2026-07-26",
      to: "2026-07-26",
      usageEvents: [
        { serviceDate: "2026-07-26", eventType: "start", driverId: "D1", vehicleId: "V1", odometer: 1 },
        { serviceDate: "2026-07-26", eventType: "start", driverId: "D1", vehicleId: "V2", odometer: 1 }
      ],
      orders: [{ id: "O1", deliveryServiceDate: "2026-07-26", driverId: "D1", queueStatus: "completed" }]
    });
    expect(report.dataQuality.ambiguousOrders).toBe(1);
  });

  it("does not count active or cancelled orders as delivered vehicle work", () => {
    const report = buildVehicleReport({
      from: "2026-07-26",
      to: "2026-07-26",
      usageEvents: [{ serviceDate: "2026-07-26", eventType: "start", driverId: "D1", vehicleId: "V1", odometer: 10 }],
      orders: [
        { id: "ACTIVE", serviceDate: "2026-07-26", driverId: "D1", queueStatus: "queued" },
        { id: "CANCELLED", serviceDate: "2026-07-26", driverId: "D1", queueStatus: "cancelled" }
      ]
    });
    expect(report.summary.deliveredOrders).toBe(0);
    expect(report.dataQuality).toEqual({ ambiguousOrders: 0, unallocatedOrders: 0 });
  });
});
