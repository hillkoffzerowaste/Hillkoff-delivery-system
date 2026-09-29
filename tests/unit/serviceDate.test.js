import { describe, expect, it } from "vitest";
import { isValidServiceDate } from "../../lib/serviceDate";

describe("service date validation", () => {
  it("accepts real calendar dates, including leap day", () => {
    expect(isValidServiceDate("2024-02-29")).toBe(true);
    expect(isValidServiceDate("2026-09-29")).toBe(true);
  });

  it("rejects impossible calendar dates", () => {
    expect(isValidServiceDate("2026-02-29")).toBe(false);
    expect(isValidServiceDate("2026-13-01")).toBe(false);
    expect(isValidServiceDate("2026-00-10")).toBe(false);
  });
});
