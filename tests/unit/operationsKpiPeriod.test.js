import { describe, expect, it } from "vitest";
import { isInKpiPeriod, kpiDateKey, resolveKpiPeriod } from "../../lib/operationsKpiPeriod.js";

describe("operations KPI date periods", () => {
  it("supports a historical day, month, and whole year including leap day", () => {
    expect(resolveKpiPeriod({ mode: "daily", date: "2025-12-31" })).toMatchObject({ from: "2025-12-31", to: "2025-12-31", days: 1 });
    expect(resolveKpiPeriod({ mode: "monthly", month: "2024-02" })).toMatchObject({ from: "2024-02-01", to: "2024-02-29", days: 29 });
    expect(resolveKpiPeriod({ mode: "monthly", month: "2025-02" })?.days).toBe(28);
    expect(resolveKpiPeriod({ mode: "yearly", year: "2024" })).toMatchObject({ from: "2024-01-01", to: "2024-12-31", days: 366 });
    expect(resolveKpiPeriod({ mode: "yearly", year: "2025" })?.days).toBe(365);
  });

  it.each([
    { mode: "daily", date: "2025-02-29" },
    { mode: "daily", date: "2026-04-31" },
    { mode: "daily", date: "" },
    { mode: "monthly", month: "2026-13" },
    { mode: "yearly", year: "" },
    { mode: "range", from: "2026-02-02", to: "2026-02-01" },
    { mode: "range", from: "2025-01-01", to: "2026-01-02" },
    { mode: "range", from: "2026-01-01", to: "" }
  ])("rejects invalid dates and unsupported ranges: %j", (selection) => {
    expect(resolveKpiPeriod(selection)).toBeNull();
  });

  it("includes both boundary dates using Bangkok time, including across years", () => {
    const period = resolveKpiPeriod({ mode: "range", from: "2025-12-31", to: "2026-01-01" });
    expect(period.days).toBe(2);
    expect(isInKpiPeriod("2025-12-30T16:59:59.999Z", period)).toBe(false);
    expect(isInKpiPeriod("2025-12-30T17:00:00.000Z", period)).toBe(true);
    expect(isInKpiPeriod("2026-01-01T16:59:59.999Z", period)).toBe(true);
    expect(isInKpiPeriod("2026-01-01T17:00:00.000Z", period)).toBe(false);
    expect(isInKpiPeriod("2026-01-01", period)).toBe(true);
    expect(isInKpiPeriod("", period)).toBe(false);
    expect(kpiDateKey("invalid")).toBe("");
  });
});
