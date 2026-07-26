import { describe, expect, it } from "vitest";
import { vehicleReportToCsv } from "../../lib/vehicleReportCsv.js";

describe("vehicle report CSV", () => {
  it("exports UTF-8 BOM and protects spreadsheet formulas", () => {
    const csv = vehicleReportToCsv([{ serviceDate: "2026-07-26", plate: "=HYPERLINK(\"bad\")", driverName: "Driver", distanceKm: 12 }]);
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    expect(csv).toContain("'=HYPERLINK");
    expect(csv).toContain("2026-07-26");
  });
});
