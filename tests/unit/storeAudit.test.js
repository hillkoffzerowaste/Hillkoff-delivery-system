import { describe, expect, it } from "vitest";
import { buildAuditDaily, computeAuditCounts, nextAuditSequence, summarizeAuditDay, validateAuditInput } from "../../lib/storeAudit.js";
import { normalizeStoreSettings } from "../../lib/storeSettings.js";

const settings = normalizeStoreSettings({
  branches: [
    { code: "WH", name: "คลังหลัก", type: "คลังสินค้า" },
    { code: "BR01", name: "สาขา 01", type: "สาขา", active: false }
  ]
});
const profile = { uid: "store-1", name: "สโตร์หนึ่ง" };
const valid = { documentNumber: "", branchCode: "WH", zone: "หมวด A", checkerName: "สโตร์ 2", total: 120, match: 117, note: "ไซรัปนับขาด" };
const check = (patch, opts = {}) => validateAuditInput({ ...valid, ...patch }, { settings, profile, ...opts });

describe("computeAuditCounts", () => {
  it("computes mismatch and accuracy as a percentage", () => {
    expect(computeAuditCounts({ total: 200, match: 190 })).toEqual({ mismatch: 10, accuracy: 95 });
  });

  it("returns null accuracy when nothing was counted", () => {
    expect(computeAuditCounts({ total: 0, match: 0 })).toEqual({ mismatch: 0, accuracy: null });
  });
});

describe("validateAuditInput", () => {
  it("accepts a valid row and computes mismatch itself", () => {
    const result = check({ mismatch: 99 });
    expect(result).toMatchObject({ ok: true, value: { branchCode: "WH", branchName: "คลังหลัก", total: 120, match: 117, mismatch: 3, checkerName: "สโตร์ 2" } });
  });

  it("accepts numeric strings from the form", () => {
    expect(check({ total: "85", match: "85", note: "" })).toMatchObject({ ok: true, value: { total: 85, match: 85, mismatch: 0 } });
  });

  it.each([
    [{ total: 0 }, "จำนวนตรวจนับทั้งหมดต้องเป็นจำนวนเต็มมากกว่า 0", "total zero"],
    [{ total: 1.5 }, "จำนวนตรวจนับทั้งหมดต้องเป็นจำนวนเต็มมากกว่า 0", "total decimal"],
    [{ total: -3 }, "จำนวนตรวจนับทั้งหมดต้องเป็นจำนวนเต็มมากกว่า 0", "total negative"],
    [{ total: "" }, "จำนวนตรวจนับทั้งหมดต้องเป็นจำนวนเต็มมากกว่า 0", "total blank"],
    [{ match: -1 }, "จำนวนสินค้าตรงต้องเป็นจำนวนเต็มตั้งแต่ 0", "match negative"],
    [{ match: 2.5 }, "จำนวนสินค้าตรงต้องเป็นจำนวนเต็มตั้งแต่ 0", "match decimal"],
    [{ match: "" }, "จำนวนสินค้าตรงต้องเป็นจำนวนเต็มตั้งแต่ 0", "match blank"],
    [{ match: 121 }, "สินค้าตรงมากกว่าจำนวนตรวจนับทั้งหมดไม่ได้", "match above total"],
    [{ note: "  " }, "มีสินค้าไม่ตรง กรุณาระบุรายการที่ไม่ตรง", "mismatch without note"],
    [{ checkerName: " " }, "กรุณาระบุผู้ตรวจนับ", "checker blank"],
    [{ branchCode: "" }, "กรุณาเลือกสาขา / คลัง", "branch missing"],
    [{ branchCode: "BR01" }, "สาขาไม่ถูกต้องหรือถูกปิดใช้งาน", "branch inactive"],
    [{ branchCode: "ZZ" }, "สาขาไม่ถูกต้องหรือถูกปิดใช้งาน", "branch unknown"],
    [{ documentNumber: "XX-1" }, "เลขที่เอกสารต้องอยู่ในรูปแบบ AU-0418", "number pattern"]
  ])("rejects %j with the Thai message (%s)", (patch, error) => {
    expect(check(patch)).toEqual({ ok: false, error, status: 400 });
  });

  it("allows a full match without a note and normalizes a typed number", () => {
    expect(check({ match: 120, note: "", documentNumber: " au-0007 " })).toMatchObject({ ok: true, value: { documentNumber: "AU-0007", mismatch: 0 } });
  });

  it("falls back to the logged-in name when the checker field is hidden or empty but optional", () => {
    const relaxed = normalizeStoreSettings({
      branches: settings.branches,
      documents: { audit: { fields: [{ id: "checker", label: "ผู้ตรวจนับ", show: true, required: false }] } }
    });
    expect(validateAuditInput({ ...valid, checkerName: "" }, { settings: relaxed, profile })).toMatchObject({ ok: true, value: { checkerName: "สโตร์หนึ่ง" } });
  });

  it("ignores hidden zone and note fields and never demands a hidden note", () => {
    const hidden = normalizeStoreSettings({
      branches: settings.branches,
      documents: { audit: { fields: [{ id: "zone", show: false }, { id: "note", show: false }] } }
    });
    expect(validateAuditInput({ ...valid, note: "" }, { settings: hidden, profile })).toMatchObject({ ok: true, value: { zone: "", note: "" } });
  });

  it("demands a required zone using its configured label", () => {
    const strict = normalizeStoreSettings({
      branches: settings.branches,
      documents: { audit: { fields: [{ id: "zone", label: "โซน", show: true, required: true }] } }
    });
    expect(validateAuditInput({ ...valid, zone: "" }, { settings: strict, profile })).toEqual({ ok: false, error: "กรุณาระบุโซน", status: 400 });
  });
});

describe("summarizeAuditDay", () => {
  it("sums live documents and skips deleted ones", () => {
    const summary = summarizeAuditDay([
      { total: 120, match: 117 },
      { total: 80, match: 80 },
      { total: 999, match: 1, deletedAt: "2026-10-28T01:00:00.000Z" }
    ]);
    expect(summary).toEqual({ docs: 2, total: 200, match: 197, mismatch: 3, accuracy: 98.5 });
  });

  it("is all zero with null accuracy for an empty day", () => {
    expect(summarizeAuditDay([])).toEqual({ docs: 0, total: 0, match: 0, mismatch: 0, accuracy: null });
  });
});

describe("buildAuditDaily", () => {
  const dates = ["2026-10-22", "2026-10-23", "2026-10-24", "2026-10-25", "2026-10-26", "2026-10-27", "2026-10-28"];
  const audits = [
    { serviceDate: "2026-10-22", total: 100, match: 90 },
    { serviceDate: "2026-10-22", total: 40, match: 40 },
    { serviceDate: "2026-10-23", total: 200, match: 190 },
    { serviceDate: "2026-10-24", total: 150, match: 150 },
    { serviceDate: "2026-10-26", total: 300, match: 270 },
    { serviceDate: "2026-10-28", total: 210, match: 200 },
    { serviceDate: "2026-10-27", total: 5000, match: 0, deletedAt: "2026-10-27T05:00:00.000Z" }
  ];

  it("divides by the days that had audits by default", () => {
    const daily = buildAuditDaily({ audits, dates });
    expect(daily.days).toHaveLength(7);
    expect(daily.activeDays).toBe(5);
    expect(daily.basis).toBe(5);
    expect(daily.totals).toMatchObject({ docs: 6, total: 1000, match: 940, mismatch: 60 });
    expect(daily.avg.total).toBe(200);
    expect(daily.avg.mismatch).toBe(12);
  });

  it("divides by calendar days when asked", () => {
    const daily = buildAuditDaily({ audits, dates, mode: "calendar" });
    expect(daily.basis).toBe(7);
    expect(daily.avg.total).toBeCloseTo(1000 / 7);
  });

  it("marks a day active only when it has counted items and ignores deleted documents", () => {
    const daily = buildAuditDaily({ audits, dates });
    const byDate = Object.fromEntries(daily.days.map((day) => [day.date, day]));
    expect(byDate["2026-10-25"]).toMatchObject({ docs: 0, total: 0, active: false });
    expect(byDate["2026-10-27"]).toMatchObject({ docs: 0, total: 0, active: false });
    expect(byDate["2026-10-22"]).toMatchObject({ docs: 2, total: 140, match: 130, mismatch: 10, active: true });
  });

  it("does not divide by zero when nothing was audited", () => {
    const daily = buildAuditDaily({ audits: [], dates });
    expect(daily.basis).toBe(1);
    expect(daily.avg).toEqual({ docs: 0, total: 0, match: 0, mismatch: 0 });
    expect(daily.totals.accuracy).toBeNull();
  });

  it("does not count a document whose total is 0 as an active day", () => {
    const daily = buildAuditDaily({ audits: [{ serviceDate: "2026-10-28", total: 0, match: 0 }], dates });
    expect(daily.days[6]).toMatchObject({ docs: 1, active: false });
    expect(daily.activeDays).toBe(0);
  });

  it("ignores documents outside the requested dates", () => {
    const daily = buildAuditDaily({ audits: [{ serviceDate: "2026-09-01", total: 500, match: 500 }], dates });
    expect(daily.totals.total).toBe(0);
  });
});

describe("nextAuditSequence", () => {
  it("returns last + 1 when it is free", () => {
    expect(nextAuditSequence(0, new Set())).toBe(1);
    expect(nextAuditSequence(41, new Set())).toBe(42);
  });

  it("skips taken sequences", () => {
    expect(nextAuditSequence(5, new Set([6, 7]))).toBe(8);
  });

  it("gives up after 20 attempts", () => {
    const taken = new Set(Array.from({ length: 20 }, (_, index) => index + 1));
    expect(nextAuditSequence(0, taken)).toBeNull();
  });
});
