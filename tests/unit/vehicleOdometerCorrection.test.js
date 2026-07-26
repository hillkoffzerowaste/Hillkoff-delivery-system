import { describe, expect, it } from "vitest";
import {
  buildOdometerCorrection,
  canCorrectVehicleOdometer
} from "../../lib/vehicleOdometerCorrection.js";

describe("vehicle odometer correction policy", () => {
  it("allows only admin and the approved accounting email", () => {
    expect(canCorrectVehicleOdometer({ role: "admin", email: "admin@hillkoff.com" })).toBe(true);
    expect(canCorrectVehicleOdometer({ role: "accounting", email: "ACC.AP@HILLKOFF.COM" })).toBe(true);
    expect(canCorrectVehicleOdometer({ role: "sales", email: "sales@hillkoff.com" })).toBe(false);
    expect(canCorrectVehicleOdometer({ role: "accounting", email: "other@hillkoff.com" })).toBe(false);
    expect(canCorrectVehicleOdometer({ role: "accounting", email: "acc.ap@gmail.com" })).toBe(false);
  });

  it("builds a bounded event patch and complete audit record", () => {
    const result = buildOdometerCorrection({
      event: { id: "E1", odometer: 1000, eventType: "end", serviceDate: "2026-07-26", vehicleId: "V1", driverId: "D1" },
      odometer: 1100,
      minimumOdometer: 900,
      reason: "คนขับกรอกเลขไมล์ผิด",
      actor: { uid: "U1", email: "acc.ap@hillkoff.com", role: "accounting" },
      now: "2026-07-26T12:00:00.000Z"
    });
    expect(result.eventPatch).toMatchObject({
      odometer: 1100,
      odometerCorrectedAt: "2026-07-26T12:00:00.000Z",
      odometerCorrectedBy: "acc.ap@hillkoff.com",
      odometerCorrectionReason: "คนขับกรอกเลขไมล์ผิด"
    });
    expect(result.auditRecord).toMatchObject({
      eventId: "E1",
      previousOdometer: 1000,
      nextOdometer: 1100,
      reason: "คนขับกรอกเลขไมล์ผิด",
      correctedByUid: "U1",
      correctedByEmail: "acc.ap@hillkoff.com",
      correctedByRole: "accounting"
    });
  });

  it("rejects invalid values, empty reasons and end mileage below its start", () => {
    const event = { id: "E1", odometer: 1000, eventType: "end" };
    expect(() => buildOdometerCorrection({ event, odometer: 0, reason: "แก้", actor: {} })).toThrow(/odometer/i);
    expect(() => buildOdometerCorrection({ event, odometer: 1100, reason: "", actor: {} })).toThrow(/reason/i);
    expect(() => buildOdometerCorrection({ event, odometer: 800, minimumOdometer: 900, reason: "แก้", actor: {} })).toThrow(/start/i);
    expect(() => buildOdometerCorrection({ event: { ...event, eventType: "start" }, odometer: 1200, maximumOdometer: 1100, reason: "แก้", actor: {} })).toThrow(/end/i);
  });
});
