import { describe, expect, it } from "vitest";
import { buildDailyReport, buildMonthReport, monthText, teamText, unattributedText } from "../../lib/storeDailyReport.js";

const date = "2026-10-28";
const time = "2026-10-28T02:00:00.000Z";
const roster = [{ uid: "shared", name: "store" }, { uid: "a", name: "เอ" }, { uid: "b", name: "บี" }];
const report = (id, type, checker) => ({ id, type, serviceDate: date, createdAt: time, confirmedAt: time, createdByUid: "shared", createdBy: "store", storeCheckerName: checker });
const reports = [report("1", "booking", "เอ"), report("2", "online", "บี"), report("3", "booking", ""), report("4", "online", "อดีต")];
const transfers = [{ id: "t", serviceDate: date, createdAt: time, preparerUid: "a", preparerName: "เอ", receipt: "complete" }];
const audits = [{ id: "a", serviceDate: date, createdAt: time, createdByUid: "shared", createdBy: "store", total: 5 }];

describe("store attribution using recorded names", () => {
  it("separates checkers from the shared account and puts unknown records in notes", () => {
    const data = buildDailyReport({ date, today: date, roster, reports, transfersCreated: transfers, audits });
    expect(data.people).not.toEqual(expect.arrayContaining([expect.objectContaining({ name: "store" })]));
    expect(data.people).toContainEqual(expect.objectContaining({ uid: "a", booking: 1, transfer: 1 }));
    expect(data.people).toContainEqual(expect.objectContaining({ uid: "b", online: 1 }));
    expect(data.people).toContainEqual(expect.objectContaining({ name: "อดีต", online: 1 }));
    expect(data.unattributed).toMatchObject({ booking: 1, auditDocs: 1 });
    expect(data.team).toMatchObject({ booking: 2, online: 2, transfer: 1, auditDocs: 1, people: 3 });
    expect(data.week[6].byUid.a.booking).toBe(1);
    expect(teamText({ dateKey: date, rows: data.people, unattributed: data.unattributed })).toContain("หมายเหตุ");
  });
  it("shows separate types and unknowns for the month", () => {
    const data = buildMonthReport({ month: "2026-10", endDay: 28, roster, reports, transfers, audits });
    expect(data.people.find((p) => p.uid === "a")).toMatchObject({ booking: 1, transfer: 1 });
    expect(data.unattributed).toMatchObject({ booking: 1, auditDocs: 1 });
    const output = monthText({ rangeLabel: data.rangeLabel, rows: data.people, unattributed: data.unattributed });
    expect(output).toContain("ใบสั่งจอง 1 · ออนไลน์ 0 · ใบโอน 1");
    expect(output).toContain("หมายเหตุ");
  });
  it("does not guess between staff with the same recorded name", () => {
    const duplicateRoster = [...roster, { uid: "c", name: "เอ" }];
    const data = buildMonthReport({ month: "2026-10", endDay: 28, roster: duplicateRoster, reports: [reports[0]], transfers: [], audits: [] });
    expect(data.unattributed.booking).toBe(1);
    expect(data.people.find((p) => p.uid === "a").booking).toBe(0);
    expect(data.people.find((p) => p.uid === "c").booking).toBe(0);
  });
  it("explains reports from before checker names were recorded separately from other unknowns", () => {
    const legacyTime = "2026-07-15T03:00:00.000Z";
    const legacy = (id, type) => ({ id, type, serviceDate: "2026-07-15", createdAt: legacyTime, confirmedAt: legacyTime, createdBy: "store", confirmedBy: "store" });
    const july = [legacy("l1", "booking"), legacy("l2", "booking"), legacy("l3", "online"), { ...legacy("n1", "booking"), serviceDate: "2026-07-20", storeCheckerName: "" }];
    const month = buildMonthReport({ month: "2026-07", roster, reports: july, transfers: [], audits: [] });
    expect(month.unattributed).toMatchObject({ booking: 3, online: 1, legacyBooking: 2, legacyOnline: 1 });
    const note = monthText({ rangeLabel: month.rangeLabel, rows: month.people, unattributed: month.unattributed }).split("\n").filter((line) => line.startsWith("หมายเหตุ"));
    expect(note[0]).toContain("ใบสั่งจอง 2 · ใบขายออนไลน์ 1 ไม่มีชื่อผู้ตรวจ เพราะระบบเดิมก่อนอัปเกรด 18 ก.ค. 2569");
    expect(note[0]).toContain("ปัจจุบันแก้ไขแล้ว");
    expect(note[1]).toBe("หมายเหตุ: ไม่ระบุชื่อหรือชื่อซ้ำจนแยกบุคคลไม่ได้ · ใบสั่งจอง 1");
    const day = buildDailyReport({ date: "2026-07-15", today: date, roster, reports: july });
    expect(day.unattributed).toMatchObject({ booking: 2, online: 1, legacyBooking: 2, legacyOnline: 1 });
    expect(teamText({ dateKey: "2026-07-15", rows: day.people, unattributed: day.unattributed })).not.toContain("ชื่อซ้ำ");
  });
  it("treats the upgrade day as legacy, later days and duplicate names as ordinary unknowns", () => {
    const at = (serviceDate, storeCheckerName = "") => ({ id: serviceDate + storeCheckerName, type: "booking", serviceDate, createdAt: `${serviceDate}T03:00:00.000Z`, confirmedAt: `${serviceDate}T03:00:00.000Z`, storeCheckerName });
    const duplicateRoster = [...roster, { uid: "c", name: "เอ" }];
    const month = buildMonthReport({ month: "2026-07", roster: duplicateRoster, reports: [at("2026-07-18"), at("2026-07-19"), at("2026-07-15", "เอ")], transfers: [], audits: [] });
    expect(month.unattributed).toMatchObject({ booking: 3, legacyBooking: 1 });
    expect(unattributedText(month.unattributed).split("\n")[1]).toBe("หมายเหตุ: ไม่ระบุชื่อหรือชื่อซ้ำจนแยกบุคคลไม่ได้ · ใบสั่งจอง 2");
  });
});
