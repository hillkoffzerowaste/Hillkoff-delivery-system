import { describe, expect, it } from "vitest";
import { buildDailyReport, buildMonthReport, monthText, teamText } from "../../lib/storeDailyReport.js";

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
});
