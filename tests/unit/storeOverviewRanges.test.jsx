import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import StoreOverviewPanel, { barLabel, barTitle, overviewQuery } from "../../app/components/store/StoreOverviewPanel.jsx";
import StorePlanningPanel from "../../app/components/store/StorePlanningPanel.jsx";
import { buildStoreOverview, customRange, periodRange } from "../../lib/storeOverview.js";
import { validateStorePlan } from "../../lib/storePlan.js";

describe("dashboard ranges", () => {
  it("covers three months and the whole year up to the anchor date", () => {
    expect(periodRange("3m", "2026-10-29")).toMatchObject({ from: "2026-08-01", to: "2026-10-29", label: "1 ส.ค. – 29 ต.ค. 2569" });
    expect(periodRange("3m", "2026-01-15").from).toBe("2025-11-01");
    const year = periodRange("year", "2026-10-29");
    expect([year.from, year.to, year.dates.length]).toEqual(["2026-01-01", "2026-10-29", 302]);
  });

  it("accepts a custom range of up to 366 days", () => {
    expect(customRange("2026-09-15", "2026-10-02")).toMatchObject({ from: "2026-09-15", to: "2026-10-02", label: "15 ก.ย. – 2 ต.ค. 2569" });
    expect(customRange("2025-10-29", "2026-10-29").dates).toHaveLength(366);
    expect(customRange("2025-10-28", "2026-10-29")).toBeNull();
    expect(customRange("2026-10-02", "2026-09-15")).toBeNull();
    expect(customRange("2026-02-30", "2026-03-01")).toBeNull();
  });

  it("switches charts to one bar per month for long ranges and keeps daily bars for short ones", () => {
    const transfers = [
      { id: "t1", serviceDate: "2026-08-03", receipt: "complete" },
      { id: "t2", serviceDate: "2026-10-01", receipt: "incomplete", issueState: "open" },
      { id: "t3", serviceDate: "2026-10-02", receipt: "complete" }
    ];
    const audits = [{ id: "a1", serviceDate: "2026-08-10", total: 10, mismatch: 1 }, { id: "a2", serviceDate: "2026-10-10", total: 30, mismatch: 0 }];
    const reports = [{ id: "r1", type: "booking", status: "saved", createdAt: "2026-09-05T03:00:00.000Z" }];
    const long = buildStoreOverview({ period: "3m", anchorDate: "2026-10-29", transfers, audits, reports });
    expect(long.granularity).toBe("month");
    expect(long.transfers.daily).toEqual([{ date: "2026-08", complete: 1, incomplete: 0, open: 0 }, { date: "2026-09", complete: 0, incomplete: 0, open: 0 }, { date: "2026-10", complete: 1, incomplete: 1, open: 1 }]);
    expect(long.audits.daily.map((bar) => bar.total)).toEqual([10, 0, 30]);
    expect(long.audits.chartAvg).toBe(20);
    expect(long.reportCharts.daily[1]).toMatchObject({ date: "2026-09", booking: 1 });
    const short = buildStoreOverview({ period: "custom", from: "2026-10-01", to: "2026-10-02", transfers });
    expect(short.granularity).toBe("day");
    expect(short.transfers.daily).toEqual([{ date: "2026-10-01", complete: 0, incomplete: 1, open: 1 }, { date: "2026-10-02", complete: 1, incomplete: 0, open: 0 }]);
  });

  it("adds per-person totals and the latest work logs to the dashboard", () => {
    const roster = [{ uid: "staff_a", name: "ณัฐ" }];
    const reports = [{ id: "r1", type: "online", status: "saved", createdAt: "2026-10-28T03:00:00.000Z", confirmedAt: "x", storeCheckerName: "ณัฐ" }];
    const workLogs = [
      { id: "w1", date: "2026-10-27", staffId: "staff_a", staffName: "ณัฐ", start: "09:00", activity: "นับสต็อก" },
      { id: "w2", date: "2026-10-28", staffId: "staff_a", staffName: "ณัฐ", start: "08:00", activity: "จัดชั้น" },
      { id: "w3", date: "2026-10-28", staffId: "staff_a", staffName: "ณัฐ", start: "08:30", activity: "ลบแล้ว", deletedAt: "x" }
    ];
    const out = buildStoreOverview({ period: "7d", anchorDate: "2026-10-28", reports, roster, workLogs });
    expect(out.staff).toEqual([expect.objectContaining({ uid: "staff_a", online: 1, logs: 2, days: 2 })]);
    expect(out.workLogs.map((log) => log.id)).toEqual(["w2", "w1"]);
  });
});

describe("dashboard and calendar screens", () => {
  it("labels month bars by Thai month and builds the custom range query", () => {
    expect(barLabel("2026-10", "month")).toBe("ต.ค. 69");
    expect(barLabel("2026-10-05", "day")).toBe("5");
    expect(barTitle("2026-10", "month")).toBe("ต.ค. 2569");
    expect(overviewQuery("custom", { from: "2026-01-01", to: "2026-03-31" })).toBe("period=custom&from=2026-01-01&to=2026-03-31");
    expect(overviewQuery("year", {})).toBe("period=year");
  });

  it("offers every range and keeps all modules on one page", () => {
    const html = renderToStaticMarkup(<StoreOverviewPanel apiFetch={async () => new Response("{}")} settings={{ modules: [] }} />);
    ["วันนี้", "7 วัน", "เดือนนี้", "3 เดือน", "ทั้งปี", "กำหนดช่วงเอง"].forEach((label) => expect(html).toContain(`>${label}</button>`));
    ["ใบโอนสินค้ารายวัน", "ใบสั่งจองและใบขายออนไลน์รายวัน", "จำนวนตรวจนับรายวัน", "ผลงานรายบุคคล", "บันทึกงานพนักงานล่าสุด"].forEach((text) => expect(html).toContain(text));
  });

  it("lets the team calendar assign an owner and the personal calendar show one person", () => {
    const team = renderToStaticMarkup(<StorePlanningPanel apiFetch={async () => new Response("{}")} staff={[{ id: "staff_a", name: "ณัฐ" }]} />);
    expect(team).toContain("ผู้รับผิดชอบ");
    expect(team).toContain('aria-label="ดูแผนของ"');
    const personal = renderToStaticMarkup(<StorePlanningPanel apiFetch={async () => new Response("{}")} owner={{ id: "staff_a", name: "ณัฐ" }} date="2026-10-29" onSelectDate={() => {}} />);
    expect(personal).toContain("ปฏิทินส่วนตัว · ณัฐ");
    expect(personal).not.toContain("ทั้งทีม (แผนทีม)");
    expect(personal).toContain('value="2026-10"');
  });

  it("keeps the plan owner id so the route can resolve the name", () => {
    expect(validateStorePlan({ title: "ตรวจชั้น", scope: "daily", date: "2026-10-29", ownerId: "staff_a" }).value.ownerId).toBe("staff_a");
    expect(validateStorePlan({ title: "ตรวจชั้น", scope: "daily", date: "2026-10-29" }).value.ownerId).toBe("");
    expect(validateStorePlan({ title: "x", scope: "daily", date: "2026-10-29", ownerId: "a/b" }).ok).toBe(false);
  });
});
