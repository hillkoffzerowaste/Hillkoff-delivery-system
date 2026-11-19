import { describe, expect, it } from "vitest";
import { buildDailyReport, teamText } from "../../lib/storeDailyReport.js";
import { buildWarehouseDashboard } from "../../lib/storeWarehouseDashboard.js";
import { packProblemEvents, summarizePackQuality, summarizeReportDays } from "../../lib/storeReportStats.js";

const date = "2026-11-19";
const problem = { action: "pack_partial", at: `${date}T03:00:00.000Z`, checkerName: "แพ็ค", reason: "ขาด 2 ชิ้น" };
const report = { id: "r1", type: "booking", bookingNumber: "CSP1023", status: "saved", packStatus: "checked", createdAt: `${date}T02:00:00.000Z`, serviceDate: date, confirmedAt: `${date}T02:00:00.000Z`, storeCheckerName: "สโตร์", packIssueHistory: [problem], workflowHistory: [{ action: "updated" }] };

describe("historical pack quality", () => {
  it("keeps corrections and the document number in the copyable daily report", () => {
    const quality = summarizePackQuality([{ ...report, packStatus: "pending" }]);
    const text = teamText({ dateKey: date, rows: [], packQuality: quality });
    expect(text).toContain("CSP1023");
    expect(text).toContain("รอห้องแพ็คตรวจซ้ำ");
    expect(text).toContain("ขาด 2 ชิ้น");
    expect(text).not.toContain("วันหยุด · ไม่มีการบันทึกงาน");
  });
  it("keeps the original checker from confirmation rather than assigning a correction to that person", () => {
    const events = packProblemEvents({ ...report, storeCheckerName: "ผู้แก้", packIssueHistory: [], workflowHistory: [
      { action: "confirmed", at: `${date}T02:00:00.000Z`, checkerName: "ผู้จัดเดิม" },
      problem,
      { action: "store_resubmitted", at: `${date}T04:00:00.000Z`, checkerName: "ผู้แก้" }
    ] });
    expect(events[0].storeCheckerName).toBe("ผู้จัดเดิม");
  });
  it("orders a partial durable projection and rolling history chronologically", () => {
    const first = { ...problem, at: `${date}T03:00:00.000Z` };
    const middle = { ...problem, at: `${date}T04:00:00.000Z` };
    const last = { ...problem, at: `${date}T05:00:00.000Z` };
    expect(packProblemEvents({ packIssueHistory: [first, last], workflowHistory: [first, middle, last] }).map(e => e.at)).toEqual([first.at, middle.at, last.at]);
  });
  it("includes an older document when its inspection or correction occurred on the selected day", () => {
    const older = { ...report, serviceDate: "2026-11-01", packStatus: "pending", workflowHistory: [{ action: "store_resubmitted", at: `${date}T04:00:00.000Z`, checkerName: "ผู้แก้" }] };
    expect(summarizePackQuality([older], { date }).documents).toBe(1);
    expect(summarizePackQuality([older], { date: "2026-11-20" }).documents).toBe(0);
  });
  it("keeps a resolved document in quality counts after rolling history no longer contains the issue", () => {
    expect(summarizeReportDays([report], [date])[0]).toMatchObject({ bookingProblems: 1, bookingResolved: 1 });
  });
  it("shows document evidence and separates current state from historical problems on the dashboard", () => {
    const data = buildWarehouseDashboard({ from: date, to: date, reports: [report, { ...report, id: "r2", bookingNumber: "CSP1024", packStatus: "pending" }] });
    expect(data.reports.quality).toMatchObject({ documents: 2, resolved: 1, awaitingRecheck: 1, open: 0 });
    expect(data.reports.quality.items[0]).toMatchObject({ number: "CSP1023", state: "resolved", events: [problem] });
  });
  it("includes resolved pack problems and document details in the daily report", () => {
    const data = buildDailyReport({ date, today: date, roster: [], reports: [report] });
    expect(data.packQuality).toMatchObject({ documents: 1, resolved: 1 });
    expect(data.packQuality.items[0]).toMatchObject({ number: "CSP1023", events: [problem] });
  });
  it("deduplicates durable evidence and rolling history, while keeping unknown legacy evidence unknown", () => {
    const data = buildWarehouseDashboard({ from: date, to: date, reports: [{ ...report, workflowHistory: [problem] }, { ...report, id: "old", packIssueHistory: [], workflowHistory: [], packStatus: "partial" }] });
    expect(data.reports.quality).toMatchObject({ documents: 2, open: 1, resolved: 1 });
    expect(data.reports.quality.items.map((item) => item.events.length)).toEqual([1, 1]);
    expect(data.reports.quality.items[1].events[0]).toMatchObject({ at: "", checkerName: "", storeCheckerName: "" });
  });
});
