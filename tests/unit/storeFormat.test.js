import { describe, expect, it } from "vitest";
import {
  addDaysToDateKey,
  bangkokDayRange,
  bangkokMonthRange,
  bangkokRangeIso,
  bangkokTimeHHmm,
  fmt,
  lastNDates,
  one,
  pct,
  thaiBuddhistYY,
  thaiDateLabel,
  thaiMonthLabel
} from "../../lib/storeFormat.js";

describe("storeFormat numbers", () => {
  it("formats percentages with one decimal and a dash for zero total", () => {
    expect(pct(1, 4)).toBe("25.0%");
    expect(pct(5, 0)).toBe("—");
  });

  it("formats numbers for th-TH", () => {
    expect(fmt(1234)).toBe("1,234");
    expect(one(2.345)).toBe("2.3");
  });
});

describe("storeFormat Bangkok dates", () => {
  it("returns the UTC range of a Bangkok day", () => {
    expect(bangkokDayRange("2026-10-28")).toEqual({
      start: "2026-10-27T17:00:00.000Z",
      end: "2026-10-28T16:59:59.999Z"
    });
    expect(bangkokDayRange("2026-02-30")).toBeNull();
    expect(bangkokDayRange("nope")).toBeNull();
  });

  it("returns a multi-day half-open range", () => {
    expect(bangkokRangeIso("2026-10-01", "2026-10-02")).toEqual({
      start: "2026-09-30T17:00:00.000Z",
      endExclusive: "2026-10-02T17:00:00.000Z"
    });
    expect(bangkokRangeIso("2026-10-03", "2026-10-02")).toBeNull();
    expect(bangkokRangeIso("x", "2026-10-02")).toBeNull();
  });

  it("returns month ranges", () => {
    expect(bangkokMonthRange("2026-02")).toEqual({ from: "2026-02-01", to: "2026-02-28" });
    expect(bangkokMonthRange("2026-10")).toEqual({ from: "2026-10-01", to: "2026-10-31" });
    expect(bangkokMonthRange("2026-13")).toBeNull();
  });

  it("adds days and lists the last N dates", () => {
    expect(addDaysToDateKey("2026-10-31", 1)).toBe("2026-11-01");
    expect(addDaysToDateKey("2026-03-01", -1)).toBe("2026-02-28");
    expect(lastNDates("2026-10-28", 3)).toEqual(["2026-10-26", "2026-10-27", "2026-10-28"]);
    expect(lastNDates("2026-10-28", 0)).toEqual([]);
  });

  it("formats Bangkok time", () => {
    expect(bangkokTimeHHmm("2026-10-28T02:12:00.000Z")).toBe("09:12");
    expect(bangkokTimeHHmm("2026-10-27T17:05:00.000Z")).toBe("00:05");
    expect(bangkokTimeHHmm("bad")).toBe("");
  });
});

describe("storeFormat Thai labels", () => {
  it("labels dates in the Buddhist era", () => {
    expect(thaiDateLabel("2026-10-28")).toBe("พ. 28 ต.ค. 2569");
    expect(thaiDateLabel("2026-10-25")).toBe("อา. 25 ต.ค. 2569");
    expect(thaiDateLabel("2026-10-29")).toBe("พฤ. 29 ต.ค. 2569");
    expect(thaiDateLabel("bad")).toBe("");
  });

  it("labels months with an optional day range", () => {
    expect(thaiMonthLabel("2026-10", { endDay: 28 })).toBe("ต.ค. 2569 (1–28)");
    expect(thaiMonthLabel("2026-10")).toBe("ต.ค. 2569");
  });

  it("returns the two-digit Buddhist year", () => {
    expect(thaiBuddhistYY("2026-10-28")).toBe("69");
  });
});
