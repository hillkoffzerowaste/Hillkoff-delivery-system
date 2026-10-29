import { describe, expect, it } from "vitest";
import {
  DAILY_REPORT_LIMITS,
  buildDailyReport,
  buildMonthReport,
  groupReportRuns,
  hoursOf,
  jobsOf,
  monthText,
  personText,
  sumDay,
  teamText
} from "../../lib/storeDailyReport.js";

const at = (date, hhmm) => new Date(`${date}T${hhmm}:00+07:00`).toISOString();
const TODAY = "2026-10-28";
const YESTERDAY = "2026-10-27";

// Person rows copied from the approved Daily.dc.html preview (TODAY sample).
const person = (name, p) => ({ uid: name, name, orderChecks: 0, ...p });
const PREVIEW_ROWS = [
  person("สโตร์ 1", { booking: 6, online: 4, transfer: 2, issues: 0, resolved: 0, openIssues: 0, auditDocs: 2, auditItems: 184, mismatch: 7, start: "08:32", end: "15:30", timeline: [
    ["08:32", "ใบสั่งจอง", "บันทึก 3 ใบ (SO-2241 ถึง SO-2243)"],
    ["09:12", "ใบโอน", "TR-0412 สาขา 01 → สาขา 03 · สินค้าครบ"],
    ["09:20", "ตรวจออเดอร์", "ร้านก · ตรวจครบแล้ว"],
    ["09:40", "Audit", "AU-0201 คลังหลัก หมวด A · ตรวจนับ 120 รายการ · ไม่ตรง 3"]
  ] }),
  person("สโตร์ 2", { booking: 3, online: 2, transfer: 2, issues: 2, resolved: 1, openIssues: 2, auditDocs: 1, auditItems: 85, mismatch: 0, start: "08:45", end: "14:02", timeline: [] }),
  person("สโตร์ 3", { booking: 2, online: 1, transfer: 1, issues: 1, resolved: 0, openIssues: 0, auditDocs: 0, auditItems: 0, mismatch: 0, start: "09:10", end: "11:50", timeline: [] })
];
const PREVIEW_OPEN = [
  { no: "TR-0413", note: "แก้ว 16 oz ขาด 100 ใบ", owner: "สโตร์ 2" },
  { no: "TR-0416", note: "ฉลากล็อตไม่ตรงกับใบโอน", owner: "สโตร์ 2" }
];

describe("daily report helpers", () => {
  it("jobsOf counts booking, online, transfers and audit documents only", () => {
    expect(jobsOf({ booking: 6, online: 4, transfer: 2, auditDocs: 2, auditItems: 184, resolved: 3, orderChecks: 9 })).toBe(14);
  });

  it("hoursOf formats the working window or says there was no work", () => {
    expect(hoursOf({ start: "08:32", end: "15:30" })).toBe("08:32–15:30 น.");
    expect(hoursOf({ start: "", end: "" })).toBe("ไม่มีงาน");
  });

  it("sumDay totals every counter and counts people with jobs", () => {
    expect(sumDay(PREVIEW_ROWS)).toEqual({ booking: 11, online: 7, transfer: 5, issues: 3, resolved: 1, openIssues: 2, auditDocs: 3, auditItems: 269, mismatch: 7, people: 3 });
    expect(sumDay([]).people).toBe(0);
  });

  it("exposes the read caps from the plan", () => {
    expect(DAILY_REPORT_LIMITS).toEqual({ reports: 1500, orders: 800, transfers: 1000, audits: 1000, monthReports: 6000, monthTransfers: 3000, monthAudits: 3000, openIssues: 200 });
  });
});

describe("groupReportRuns", () => {
  const row = (type, hhmm, bookingNumber) => ({ type, createdAt: at(TODAY, hhmm), bookingNumber });

  it("merges same-type reports within the gap and splits beyond it", () => {
    const runs = groupReportRuns([row("booking", "08:00", "A1"), row("booking", "08:30", "A2"), row("booking", "09:01", "A3")]);
    expect(runs).toEqual([
      { type: "booking", at: at(TODAY, "08:00"), count: 2, numbers: ["A1", "A2"] },
      { type: "booking", at: at(TODAY, "09:01"), count: 1, numbers: ["A3"] }
    ]);
  });

  it("chains the gap from the previous report and keeps types apart", () => {
    const runs = groupReportRuns([row("booking", "08:00", "A1"), row("online", "08:10", ""), row("booking", "08:25", "A2"), row("booking", "08:50", "A3")], { gapMinutes: 30 });
    expect(runs.map((r) => [r.type, r.count, r.numbers])).toEqual([["booking", 3, ["A1", "A2", "A3"]], ["online", 1, []]]);
  });

  it("honours a custom gap and sorts unsorted input", () => {
    const runs = groupReportRuns([row("online", "08:20"), row("online", "08:00")], { gapMinutes: 10 });
    expect(runs.map((r) => r.count)).toEqual([1, 1]);
    expect(runs[0].at).toBe(at(TODAY, "08:00"));
  });
});

describe("LINE text builders (full-string equality)", () => {
  it("builds the team text with open issues", () => {
    expect(teamText({ dateKey: TODAY, rows: PREVIEW_ROWS, openIssues: PREVIEW_OPEN })).toBe([
      "📋 รายงานการขับเคลื่อนประจำวัน · สโตร์ WH",
      "วันที่ พ. 28 ต.ค. 2569",
      "",
      "ภาพรวมทีม",
      "• งานรวม 26 รายการ จาก 3 คน",
      "• ใบสั่งจอง 11 ใบ · ใบขายออนไลน์ 7 ใบ",
      "• ใบโอนสินค้า 5 ใบ (ไม่ครบ 3 · แก้ไขแล้ว 1 · ค้าง 2)",
      "• Internal Audit 3 เอกสาร · ตรวจนับ 269 รายการ · ตรง 97.4%",
      "",
      "รายบุคคล",
      "1) สโตร์ 1 · 14 งาน · 08:32–15:30 น.",
      "   ใบสั่งจอง 6 · ออนไลน์ 4 · ใบโอน 2 · Audit 2 (184 รายการ)",
      "2) สโตร์ 2 · 8 งาน · 08:45–14:02 น.",
      "   ใบสั่งจอง 3 · ออนไลน์ 2 · ใบโอน 2 · Audit 1 (85 รายการ)",
      "3) สโตร์ 3 · 4 งาน · 09:10–11:50 น.",
      "   ใบสั่งจอง 2 · ออนไลน์ 1 · ใบโอน 1 · Audit 0 (0 รายการ)",
      "",
      "งานค้างติดตาม",
      "• TR-0413 แก้ว 16 oz ขาด 100 ใบ (สโตร์ 2)",
      "• TR-0416 ฉลากล็อตไม่ตรงกับใบโอน (สโตร์ 2)"
    ].join("\n"));
  });

  it("prints • ไม่มี when there are no open issues and honours storeLabel", () => {
    const text = teamText({ dateKey: TODAY, rows: [PREVIEW_ROWS[2]], storeLabel: "สโตร์ ทดสอบ" });
    expect(text).toBe([
      "📋 รายงานการขับเคลื่อนประจำวัน · สโตร์ ทดสอบ",
      "วันที่ พ. 28 ต.ค. 2569",
      "",
      "ภาพรวมทีม",
      "• งานรวม 4 รายการ จาก 1 คน",
      "• ใบสั่งจอง 2 ใบ · ใบขายออนไลน์ 1 ใบ",
      "• ใบโอนสินค้า 1 ใบ (ไม่ครบ 1 · แก้ไขแล้ว 0 · ค้าง 0)",
      "• Internal Audit 0 เอกสาร · ตรวจนับ 0 รายการ · ตรง —",
      "",
      "รายบุคคล",
      "1) สโตร์ 3 · 4 งาน · 09:10–11:50 น.",
      "   ใบสั่งจอง 2 · ออนไลน์ 1 · ใบโอน 1 · Audit 0 (0 รายการ)",
      "",
      "งานค้างติดตาม",
      "• ไม่มี"
    ].join("\n"));
  });

  it("says holiday when nobody recorded work", () => {
    const idle = ["สโตร์ 1", "สโตร์ 2"].map((name) => person(name, { booking: 0, online: 0, transfer: 0, issues: 0, resolved: 0, openIssues: 0, auditDocs: 0, auditItems: 0, mismatch: 0, start: "", end: "", timeline: [] }));
    expect(teamText({ dateKey: "2026-10-25", rows: idle })).toBe([
      "📋 รายงานการขับเคลื่อนประจำวัน · สโตร์ WH",
      "วันที่ อา. 25 ต.ค. 2569",
      "",
      "วันหยุด · ไม่มีการบันทึกงาน"
    ].join("\n"));
  });

  it("builds the person text with a timeline but leaves order checks out", () => {
    expect(personText({ dateKey: TODAY, person: PREVIEW_ROWS[0] })).toBe([
      "📋 รายงานประจำวันรายบุคคล · สโตร์ WH",
      "สโตร์ 1 · พ. 28 ต.ค. 2569",
      "",
      "ช่วงเวลาเอกสารในระบบ 08:32–15:30 น.",
      "• งานรวม 14 รายการ",
      "• ใบสั่งจอง 6 · ใบขายออนไลน์ 4",
      "• ใบโอนที่จัด 2 (ไม่ครบ 0 · ค้าง 0) · แก้ไขปัญหา 0 ครั้ง",
      "• Audit 2 เอกสาร · 184 รายการ · ตรง 96.2%",
      "",
      "ไทม์ไลน์",
      "08:32 ใบสั่งจอง · บันทึก 3 ใบ (SO-2241 ถึง SO-2243)",
      "09:12 ใบโอน · TR-0412 สาขา 01 → สาขา 03 · สินค้าครบ",
      "09:40 Audit · AU-0201 คลังหลัก หมวด A · ตรวจนับ 120 รายการ · ไม่ตรง 3"
    ].join("\n"));
  });

  it("omits the timeline block when the person only has order checks", () => {
    const p = person("สโตร์ 2", { booking: 1, online: 0, transfer: 0, issues: 0, resolved: 0, openIssues: 0, auditDocs: 0, auditItems: 0, mismatch: 0, start: "09:00", end: "09:00", timeline: [["09:00", "ตรวจออเดอร์", "ร้านก · ตรวจครบแล้ว"]] });
    expect(personText({ dateKey: TODAY, person: p })).not.toContain("ไทม์ไลน์");
  });

  it("says no work for a person with nothing recorded", () => {
    const p = person("สโตร์ 3", { booking: 0, online: 0, transfer: 0, issues: 0, resolved: 0, openIssues: 0, auditDocs: 0, auditItems: 0, mismatch: 0, start: "", end: "", timeline: [] });
    expect(personText({ dateKey: "2026-10-25", person: p })).toBe([
      "📋 รายงานประจำวันรายบุคคล · สโตร์ WH",
      "สโตร์ 3 · อา. 25 ต.ค. 2569",
      "",
      "ไม่มีการบันทึกงาน"
    ].join("\n"));
  });

  it("still reports a person whose only work was resolving an earlier transfer", () => {
    const p = person("สโตร์ 3", { booking: 0, online: 0, transfer: 0, issues: 0, resolved: 1, openIssues: 0, auditDocs: 0, auditItems: 0, mismatch: 0, start: "10:00", end: "10:00", timeline: [["10:00", "แก้ไขปัญหา", "TR-0001 ส่งเพิ่มแล้ว"]] });
    expect(personText({ dateKey: TODAY, person: p })).toBe([
      "📋 รายงานประจำวันรายบุคคล · สโตร์ WH",
      "สโตร์ 3 · พ. 28 ต.ค. 2569",
      "",
      "ช่วงเวลาเอกสารในระบบ 10:00–10:00 น.",
      "• งานรวม 0 รายการ",
      "• ใบสั่งจอง 0 · ใบขายออนไลน์ 0",
      "• ใบโอนที่จัด 0 (ไม่ครบ 0 · ค้าง 0) · แก้ไขปัญหา 1 ครั้ง",
      "• Audit 0 เอกสาร · 0 รายการ · ตรง —",
      "",
      "ไทม์ไลน์",
      "10:00 แก้ไขปัญหา · TR-0001 ส่งเพิ่มแล้ว"
    ].join("\n"));
  });

  it("builds the month text and avoids NaN when a person has zero working days", () => {
    const rows = [
      { name: "สโตร์ 1", days: 24, booking: 121, online: 79, transfer: 68, issues: 9, resolved: 9, auditDocs: 34, auditItems: 2900, mismatch: 70 },
      { name: "สโตร์ 2", days: 23, booking: 94, online: 62, transfer: 53, issues: 9, resolved: 7, auditDocs: 22, auditItems: 1900, mismatch: 40 },
      { name: "สโตร์ 3", days: 21, booking: 53, online: 35, transfer: 31, issues: 6, resolved: 6, auditDocs: 12, auditItems: 960, mismatch: 21 },
      { name: "สโตร์ 4", days: 0, booking: 0, online: 0, transfer: 0, issues: 0, resolved: 0, auditDocs: 0, auditItems: 0, mismatch: 0 }
    ];
    expect(monthText({ rangeLabel: "ต.ค. 2569 (1–28)", rows })).toBe([
      "📋 สรุปผลรายเดือน · สโตร์ WH",
      "ต.ค. 2569 (1–28)",
      "",
      "1) สโตร์ 1 · 24 วัน · งานรวม 302 (เฉลี่ย 12.6/วัน)",
      "   ใบสั่งจอง 121 · ออนไลน์ 79 · ใบโอน 68 · Audit 34",
      "   ใบโอนครบ 86.8% · ปิดปัญหา 9/9 · ตรวจนับตรง 97.6%",
      "2) สโตร์ 2 · 23 วัน · งานรวม 231 (เฉลี่ย 10.0/วัน)",
      "   ใบสั่งจอง 94 · ออนไลน์ 62 · ใบโอน 53 · Audit 22",
      "   ใบโอนครบ 83.0% · ปิดปัญหา 7/9 · ตรวจนับตรง 97.9%",
      "3) สโตร์ 3 · 21 วัน · งานรวม 131 (เฉลี่ย 6.2/วัน)",
      "   ใบสั่งจอง 53 · ออนไลน์ 35 · ใบโอน 31 · Audit 12",
      "   ใบโอนครบ 80.6% · ปิดปัญหา 6/6 · ตรวจนับตรง 97.8%",
      "4) สโตร์ 4 · 0 วัน · งานรวม 0 (เฉลี่ย 0.0/วัน)",
      "   ใบสั่งจอง 0 · ออนไลน์ 0 · ใบโอน 0 · Audit 0",
      "   ใบโอนครบ — · ปิดปัญหา 0/0 · ตรวจนับตรง —"
    ].join("\n"));
  });
});

describe("buildDailyReport", () => {
  const roster = [
    { uid: "u1", name: "สโตร์ 1" },
    { uid: "u2", name: "สโตร์ 2" },
    { uid: "u3", name: "สโตร์ 3" },
    { uid: "u4", name: "สโตร์ 4" }
  ];
  const report = (id, uid, type, hhmm, extra = {}) => ({ id, type, createdByUid: uid, createdBy: uid, storeCheckerName: roster.find((r) => r.uid === uid)?.name || "คนนอก", serviceDate: TODAY, createdAt: at(TODAY, hhmm), confirmedAt: at(TODAY, hhmm), bookingNumber: "", ...extra });
  const transfer = (id, uid, hhmm, extra = {}) => ({ id, preparerUid: uid, preparerName: roster.find((r) => r.uid === uid)?.name || "", transferNumber: id.toUpperCase(), fromBranchName: "คลังหลัก", toBranchName: "สาขา 02", receipt: "complete", note: "", issueState: "", resolution: null, resolvedServiceDate: "", serviceDate: TODAY, createdAt: at(TODAY, hhmm), ...extra });
  const audit = (id, uid, hhmm, extra = {}) => ({ id, documentNumber: id.toUpperCase(), createdByUid: uid, createdBy: uid, branchName: "คลังหลัก", zone: "", total: 10, match: 10, mismatch: 0, serviceDate: TODAY, createdAt: at(TODAY, hhmm), ...extra });

  const reports = [
    report("r1", "u1", "booking", "08:32", { bookingNumber: "SO-2241" }),
    report("r2", "u1", "booking", "08:40", { bookingNumber: "SO-2242" }),
    report("r3", "u1", "booking", "08:50", { bookingNumber: "SO-2243" }),
    report("r4", "u1", "booking", "15:30"),
    report("r5", "u1", "online", "10:20", { bookingNumber: "SO-9" }),
    report("r6", "u1", "booking", "10:30", { deletedAt: at(TODAY, "11:00") }),
    report("r7", "u1", "booking", "10:40", { confirmedAt: "" }),
    report("r8", "u2", "booking", "09:00", { serviceDate: YESTERDAY, createdAt: at(YESTERDAY, "09:00"), confirmedAt: at(YESTERDAY, "09:00") }),
    report("r9", "u9", "booking", "11:00", { createdBy: "คนนอก" })
  ];
  const transfers = [
    transfer("tr-0412", "u2", "09:12"),
    transfer("tr-0413", "u2", "10:05", { receipt: "incomplete", note: "แก้วขาด 100 ใบ", issueState: "open" }),
    transfer("tr-0414", "u3", "10:48", { receipt: "incomplete", note: "นมโอ๊ตขาด 2 กล่อง", issueState: "resolved", resolvedServiceDate: TODAY, resolution: { text: "ส่งเพิ่มรอบบ่าย", byUid: "u2", byName: "สโตร์ 2", at: at(TODAY, "13:40") } }),
    transfer("tr-0399", "u2", "16:00", { serviceDate: YESTERDAY, createdAt: at(YESTERDAY, "16:00"), receipt: "incomplete", note: "ฉลากผิด", issueState: "resolved", resolvedServiceDate: TODAY, resolution: { text: "เปลี่ยนฉลากแล้ว", byUid: "u1", byName: "สโตร์ 1", at: at(TODAY, "11:00") } }),
    transfer("tr-0500", "u1", "12:00", { deletedAt: at(TODAY, "12:30") })
  ];
  const audits = [
    audit("au-0201", "u1", "09:40", { zone: "หมวด A", total: 120, match: 117, mismatch: 3 }),
    audit("au-0203", "u1", "13:30", { total: 64 }),
    audit("au-0999", "u1", "14:00", { deletedAt: at(TODAY, "14:10") })
  ];
  const orders = [{
    id: "ORD1",
    customerName: "ร้านก",
    storeStatus: "checked",
    workflowHistory: [
      { role: "store", action: "store_update", uid: "u3", name: "สโตร์ 3", at: at(TODAY, "09:20") },
      { role: "store", action: "store_update", uid: "u3", name: "สโตร์ 3", at: at(YESTERDAY, "09:20") },
      { role: "sales", action: "store_update", uid: "u3", name: "สโตร์ 3", at: at(TODAY, "09:25") },
      { role: "store", action: "created", uid: "u3", name: "สโตร์ 3", at: at(TODAY, "09:26") }
    ]
  }];
  const openTransfers = [
    transfers[1],
    transfer("tr-0100", "u1", "10:00", { serviceDate: "2026-10-20", createdAt: at("2026-10-20", "10:00"), receipt: "incomplete", note: "ของเก่า", issueState: "open" }),
    transfer("tr-9999", "u1", "10:00", { serviceDate: "2026-10-29", receipt: "incomplete", note: "อนาคต", issueState: "open" })
  ];

  const result = buildDailyReport({
    date: TODAY, today: TODAY, roster, reports, orders,
    transfersCreated: transfers, transfersResolved: transfers.filter((t) => t.resolvedServiceDate === TODAY), openTransfers,
    audits, weekReports: reports, weekTransfers: transfers, weekAudits: audits
  });
  const byUid = Object.fromEntries(result.people.map((p) => [p.uid, p]));

  it("keeps roster order, includes idle members and appends outsiders with work", () => {
    expect(result.people.map((p) => p.uid)).toEqual(["u1", "u2", "u3", "u4", "name:คนนอก"]);
    expect(result.date).toBe(TODAY);
    expect(result.isToday).toBe(true);
    expect(byUid.u4).toMatchObject({ booking: 0, transfer: 0, start: "", end: "", timeline: [] });
    expect(byUid["name:คนนอก"]).toMatchObject({ name: "คนนอก", booking: 1 });
  });

  it("attributes reports to the checker and skips deleted, draft and other-day reports", () => {
    expect(byUid.u1).toMatchObject({ booking: 4, online: 1 });
    expect(byUid.u2.booking).toBe(0);
  });

  it("attributes transfers to the preparer and resolutions to the resolver", () => {
    expect(byUid.u2).toMatchObject({ transfer: 2, issues: 1, openIssues: 1, resolved: 1 });
    expect(byUid.u3).toMatchObject({ transfer: 1, issues: 1, openIssues: 0, resolved: 0 });
    expect(byUid.u1).toMatchObject({ transfer: 0, resolved: 1 });
  });

  it("attributes audits to the creator and ignores deleted ones", () => {
    expect(byUid.u1).toMatchObject({ auditDocs: 2, auditItems: 184, mismatch: 3 });
  });

  it("counts only store-role order check events of the day and keeps them out of jobs", () => {
    expect(byUid.u3.orderChecks).toBe(1);
    expect(jobsOf(byUid.u3)).toBe(1);
  });

  it("derives start and end from the first and last event", () => {
    expect([byUid.u1.start, byUid.u1.end]).toEqual(["08:32", "15:30"]);
    expect([byUid.u2.start, byUid.u2.end]).toEqual(["09:12", "13:40"]);
    expect([byUid.u3.start, byUid.u3.end]).toEqual(["09:20", "10:48"]);
  });

  it("builds a time-sorted timeline with the documented texts", () => {
    expect(byUid.u1.timeline).toEqual([
      ["08:32", "ใบสั่งจอง", "บันทึก 3 ใบ (SO-2241 ถึง SO-2243)"],
      ["09:40", "Audit", "AU-0201 คลังหลัก หมวด A · ตรวจนับ 120 รายการ · ไม่ตรง 3"],
      ["10:20", "ใบขายออนไลน์", "บันทึก 1 ใบ (SO-9)"],
      ["11:00", "แก้ไขปัญหา", "TR-0399 เปลี่ยนฉลากแล้ว"],
      ["13:30", "Audit", "AU-0203 คลังหลัก · ตรวจนับ 64 รายการ · ตรงทั้งหมด"],
      ["15:30", "ใบสั่งจอง", "บันทึก 1 ใบ"]
    ]);
    expect(byUid.u2.timeline).toEqual([
      ["09:12", "ใบโอน", "TR-0412 คลังหลัก → สาขา 02 · สินค้าครบ"],
      ["10:05", "ใบโอนไม่ครบ", "TR-0413 คลังหลัก → สาขา 02 · แก้วขาด 100 ใบ"],
      ["13:40", "แก้ไขปัญหา", "TR-0414 ส่งเพิ่มรอบบ่าย"]
    ]);
    expect(byUid.u3.timeline).toEqual([
      ["09:20", "ตรวจออเดอร์", "ร้านก · ตรวจครบแล้ว"],
      ["10:48", "ใบโอนไม่ครบ", "TR-0414 คลังหลัก → สาขา 02 · นมโอ๊ตขาด 2 กล่อง (สโตร์ 2 แก้ไขแล้ว)"]
    ]);
  });

  it("totals the team and counts people with jobs", () => {
    expect(result.team).toMatchObject({ booking: 5, online: 1, transfer: 3, issues: 2, resolved: 2, openIssues: 1, auditDocs: 2, people: 4 });
  });

  it("lists open issues up to the day, oldest first, with owner and note", () => {
    expect(result.openIssues).toEqual([
      { no: "TR-0100", note: "ของเก่า", owner: "สโตร์ 1" },
      { no: "TR-0413", note: "แก้วขาด 100 ใบ", owner: "สโตร์ 2" }
    ]);
  });

  it("builds seven week days ending on the date without order checks", () => {
    expect(result.week.map((d) => d.date)).toEqual(["2026-10-22", "2026-10-23", "2026-10-24", "2026-10-25", "2026-10-26", "2026-10-27", TODAY]);
    expect(result.week[5].byUid.u2).toMatchObject({ booking: 1, transfer: 1, jobs: 2, start: "09:00", end: "16:00" });
    expect(result.week[6].byUid.u1).toMatchObject({ booking: 4, online: 1, auditItems: 184, jobs: 7 });
    expect(result.week[6].byUid.u3.jobs).toBe(1);
    expect(result.week[0].byUid).toEqual({});
  });

  it("marks a past date as not today and produces a holiday-like empty day", () => {
    const past = buildDailyReport({ date: "2026-10-25", today: TODAY, roster, reports: [], orders: [], transfersCreated: [], transfersResolved: [], openTransfers: [], audits: [], weekReports: [], weekTransfers: [], weekAudits: [] });
    expect(past.isToday).toBe(false);
    expect(past.team.people).toBe(0);
    expect(past.people).toHaveLength(4);
  });
});

describe("buildMonthReport", () => {
  const roster = [{ uid: "u1", name: "สโตร์ 1" }, { uid: "u2", name: "สโตร์ 2" }];
  const rep = (id, type, date, extra = {}) => ({ id, type, createdByUid: "u1", createdBy: "u1", storeCheckerName: "สโตร์ 1", serviceDate: date, createdAt: at(date, "09:00"), confirmedAt: at(date, "09:00"), ...extra });
  const tr = (id, date, extra = {}) => ({ id, preparerUid: "u1", preparerName: "u1", serviceDate: date, createdAt: at(date, "10:00"), receipt: "complete", issueState: "", ...extra });
  const au = (id, date, extra = {}) => ({ id, createdByUid: "u1", createdBy: "u1", serviceDate: date, createdAt: at(date, "11:00"), total: 50, mismatch: 2, ...extra });

  const result = buildMonthReport({
    month: "2026-10",
    endDay: 28,
    roster,
    reports: [
      rep("r1", "booking", "2026-10-01"),
      rep("r2", "online", "2026-10-02"),
      rep("r3", "booking", "2026-10-29"),
      rep("r4", "booking", "2026-10-02", { deletedAt: at("2026-10-02", "12:00") }),
      rep("r5", "booking", "2026-10-02", { confirmedAt: "" }),
      rep("r6", "booking", "2026-09-30")
    ],
    transfers: [
      tr("t1", "2026-10-02"),
      tr("t2", "2026-10-03", { receipt: "incomplete", issueState: "resolved" }),
      tr("t3", "2026-10-03", { receipt: "incomplete", issueState: "open" }),
      tr("t4", "2026-10-03", { deletedAt: at("2026-10-03", "12:00") })
    ],
    audits: [au("a1", "2026-10-03"), au("a2", "2026-10-03"), au("a3", "2026-10-03", { deletedAt: at("2026-10-03", "12:00") })]
  });

  it("builds per-person month rows with working days and closed issues", () => {
    expect(result.rangeLabel).toBe("ต.ค. 2569 (1–28)");
    expect(result.people[0]).toEqual({ uid: "u1", name: "สโตร์ 1", days: 3, booking: 1, online: 1, transfer: 3, issues: 2, resolved: 1, auditDocs: 2, auditItems: 100, mismatch: 4 });
  });

  it("keeps roster members without work at zero days", () => {
    expect(result.people[1]).toMatchObject({ uid: "u2", days: 0, booking: 0, transfer: 0 });
  });

  it("renders the month text from the built rows", () => {
    expect(monthText({ rangeLabel: result.rangeLabel, rows: result.people })).toBe([
      "📋 สรุปผลรายเดือน · สโตร์ WH",
      "ต.ค. 2569 (1–28)",
      "",
      "1) สโตร์ 1 · 3 วัน · งานรวม 7 (เฉลี่ย 2.3/วัน)",
      "   ใบสั่งจอง 1 · ออนไลน์ 1 · ใบโอน 3 · Audit 2",
      "   ใบโอนครบ 33.3% · ปิดปัญหา 1/2 · ตรวจนับตรง 96.0%",
      "2) สโตร์ 2 · 0 วัน · งานรวม 0 (เฉลี่ย 0.0/วัน)",
      "   ใบสั่งจอง 0 · ออนไลน์ 0 · ใบโอน 0 · Audit 0",
      "   ใบโอนครบ — · ปิดปัญหา 0/0 · ตรวจนับตรง —"
    ].join("\n"));
  });
});
