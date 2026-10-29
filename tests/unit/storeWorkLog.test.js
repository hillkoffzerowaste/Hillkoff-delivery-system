import { describe, expect, it } from "vitest";
import { buildDailyReport, buildMonthReport, personText, teamText } from "../../lib/storeDailyReport.js";
import { sortWorkLogs, validateWorkLog, workLogAt, workLogLine } from "../../lib/storeWorkLog.js";

const DATE = "2026-10-29";
const roster = [{ uid: "shared", name: "store" }, { uid: "staff_a", name: "ณัฐ" }, { uid: "staff_b", name: "เล็ก" }];
const log = (id, staffId, staffName, start, extra = {}) => ({ id, date: DATE, staffId, staffName, start, end: "", activity: "จัดชั้นสินค้า", location: "", detail: "", updatedAt: "u", ...extra });

describe("work log validation and text", () => {
  it("accepts what, where, when and how and trims the input", () => {
    expect(validateWorkLog({ date: DATE, staffId: " staff_a ", start: "09:00", end: "10:30", activity: " จัดชั้น ", location: "คลัง WH", detail: "เรียงตามวันหมดอายุ" })).toEqual({
      ok: true,
      value: { date: DATE, staffId: "staff_a", start: "09:00", end: "10:30", activity: "จัดชั้น", location: "คลัง WH", detail: "เรียงตามวันหมดอายุ" }
    });
  });

  it("rejects missing or impossible values", () => {
    const base = { date: DATE, staffId: "staff_a", start: "09:00", activity: "x" };
    expect(validateWorkLog({ ...base, date: "2026-02-30" }).ok).toBe(false);
    expect(validateWorkLog({ ...base, staffId: "" }).ok).toBe(false);
    expect(validateWorkLog({ ...base, staffId: "a/b" }).ok).toBe(false);
    expect(validateWorkLog({ ...base, start: "24:00" }).ok).toBe(false);
    expect(validateWorkLog({ ...base, end: "08:59" }).error).toBe("เวลาสิ้นสุดต้องไม่ก่อนเวลาเริ่ม");
    expect(validateWorkLog({ ...base, activity: "" }).ok).toBe(false);
    expect(validateWorkLog({ ...base, activity: "x".repeat(161) }).ok).toBe(false);
    expect(validateWorkLog({ ...base, location: "x".repeat(121) }).ok).toBe(false);
    expect(validateWorkLog({ ...base, detail: "x".repeat(1001) }).ok).toBe(false);
  });

  it("reads the start time as Bangkok time and formats one line per entry", () => {
    expect(workLogAt({ date: DATE, start: "09:15" })).toBe("2026-10-29T02:15:00.000Z");
    expect(workLogLine({ start: "09:00", end: "10:30", activity: "จัดชั้น", location: "คลัง", detail: "ตาม FEFO" })).toBe("09:00–10:30 จัดชั้น @ คลัง · ตาม FEFO");
    expect(workLogLine({ start: "13:00", end: "", activity: "นับสต็อก", location: "", detail: "" })).toBe("13:00 นับสต็อก");
    expect(sortWorkLogs([{ date: DATE, start: "13:00" }, { date: DATE, start: "08:00" }, { date: "2026-10-28", start: "15:00" }]).map((x) => x.start)).toEqual(["15:00", "08:00", "13:00"]);
  });
});

describe("work logs in the daily and month reports", () => {
  const workLogs = [
    log("l1", "staff_a", "ณัฐ", "13:00", { end: "14:00", location: "คลัง WH", detail: "นับมือ" }),
    log("l2", "staff_a", "ณัฐ", "08:30"),
    log("l3", "staff_b", "เล็ก", "10:00", { deletedAt: "x" }),
    log("l4", "staff_b", "เล็ก", "10:00", { date: "2026-10-27" })
  ];

  it("puts each person's entries in their timeline and the team LINE text", () => {
    const data = buildDailyReport({ date: DATE, today: DATE, roster, reports: [], transfersCreated: [], audits: [], workLogs });
    const nat = data.people.find((p) => p.uid === "staff_a");
    expect(nat.logCount).toBe(2);
    expect(nat.logs.map((x) => x.id)).toEqual(["l2", "l1"]);
    expect(nat.timeline).toEqual([["08:30", "บันทึกงาน", "จัดชั้นสินค้า"], ["13:00", "บันทึกงาน", "ถึง 14:00 · จัดชั้นสินค้า @ คลัง WH · นับมือ"]]);
    expect(data.people.find((p) => p.uid === "staff_b").logCount).toBe(0);
    expect(data.team.people).toBe(1);
    expect(data.week[4].byUid.staff_b).toMatchObject({ logs: 1, jobs: 0 });
    const text = teamText({ dateKey: DATE, rows: data.people, unattributed: data.unattributed });
    expect(text).not.toContain("วันหยุด");
    expect(text).toContain("   • 08:30 จัดชั้นสินค้า");
    expect(text).toContain("   • 13:00–14:00 จัดชั้นสินค้า @ คลัง WH · นับมือ");
    const mine = personText({ dateKey: DATE, person: nat });
    expect(mine).toContain("บันทึกงานประจำวัน 2 รายการ");
    expect(mine).toContain("13:00 บันทึกงาน · ถึง 14:00");
  });

  it("counts entries and working days per person over a month", () => {
    const month = buildMonthReport({ month: "2026-10", endDay: 29, roster, reports: [], transfers: [], audits: [], workLogs });
    expect(month.people.find((p) => p.uid === "staff_a")).toMatchObject({ logs: 2, days: 1 });
    expect(month.people.find((p) => p.uid === "staff_b")).toMatchObject({ logs: 1, days: 1 });
  });
});
