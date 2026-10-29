import { describe, expect, it } from "vitest";
import { addDaysToDateKey } from "../../lib/storeFormat.js";
import { buildStoreOverview } from "../../lib/storeOverview.js";
import { fromStoredDay, summarizeReportDays, toStoredDay } from "../../lib/storeReportStats.js";
import { liveWindowStart, readReportDayStats } from "../../lib/storeReportStatsStore.js";
import { autoRefreshes } from "../../app/components/store/StoreOverviewPanel.jsx";

const TODAY = "2026-10-29";
const at = (date, hh = 9) => new Date(`${date}T${String(hh).padStart(2, "0")}:00:00+07:00`).toISOString();
const roster = [{ uid: "a", name: "ณัฐ" }, { uid: "b", name: "เล็ก" }];

// Deterministic sample: mixes problems, resolved, drafts, deletions, unnamed and legacy reports.
function sampleReports(days = 150) {
  const rows = [];
  for (let d = 0; d < days; d += 1) {
    const date = addDaysToDateKey(TODAY, -d);
    for (let i = 0; i < (d % 4) + 1; i += 1) {
      const n = rows.length;
      const kind = n % 9;
      rows.push({
        id: `r${n}`,
        type: n % 3 ? "booking" : "online",
        status: kind === 0 ? "waiting" : kind === 1 ? "draft" : "saved",
        packStatus: kind === 2 ? "returned" : kind === 3 ? "checked" : "pending",
        workflowHistory: kind === 3 ? [{ action: "pack_partial" }, { action: "pack_checked" }] : kind === 2 ? [{ action: "pack_returned", reason: "ขาดของ" }] : [],
        createdAt: at(date, 8 + i),
        updatedAt: at(date, 8 + i),
        serviceDate: date,
        confirmedAt: kind === 1 ? "" : at(date, 8 + i),
        storeCheckerName: kind === 4 ? "" : n % 2 ? "ณัฐ" : "เล็ก",
        deletedAt: kind === 5 && n % 2 ? at(date) : "",
        bookingNumber: `CSP-${1000 + n}`
      });
    }
  }
  return rows;
}

describe("daily report summaries", () => {
  it("counts charts, problems, resolutions and checkers per day and survives storage", () => {
    const date = "2026-10-01";
    const [day] = summarizeReportDays([
      { type: "booking", status: "saved", packStatus: "checked", createdAt: at(date), confirmedAt: "x", storeCheckerName: "ณัฐ", workflowHistory: [{ action: "pack_partial" }] },
      { type: "online", status: "waiting", createdAt: at(date), confirmedAt: "x", storeCheckerName: "" },
      { type: "online", status: "draft", createdAt: at(date) },
      { type: "booking", status: "saved", createdAt: at(date), deletedAt: "x", confirmedAt: "x", storeCheckerName: "ณัฐ" },
      { type: "booking", status: "saved", createdAt: at("2026-10-02"), confirmedAt: "x" }
    ], [date]);
    expect(day).toEqual({ date, booking: 1, online: 1, bookingProblems: 1, onlineProblems: 1, bookingResolved: 1, onlineResolved: 0, problems: 2, checkers: { ณัฐ: { booking: 1, online: 0 }, "": { booking: 0, online: 1 } } });
    expect(toStoredDay(day).checkers).toEqual({ ณัฐ: { booking: 1, online: 0 }, "-": { booking: 0, online: 1 } });
    expect(fromStoredDay(toStoredDay(day))).toEqual(day);
  });

  it("gives the dashboard exactly the same numbers from stored summaries as from every report", () => {
    const reports = sampleReports();
    const liveStart = liveWindowStart(TODAY);
    const full = buildStoreOverview({ period: "year", anchorDate: TODAY, reports, roster });
    const storedTo = addDaysToDateKey(liveStart, -1);
    const dates = [];
    for (let d = "2026-01-01"; d <= storedTo; d = addDaysToDateKey(d, 1)) dates.push(d);
    const dayStats = summarizeReportDays(reports, dates).map((day) => fromStoredDay(toStoredDay(day)));
    const live = reports.filter((r) => r.createdAt >= at(liveStart, 0));
    const cached = buildStoreOverview({ period: "year", anchorDate: TODAY, reports: live, roster, dayStats, openReports: reports });
    expect(cached.reportCharts).toEqual(full.reportCharts);
    expect(cached.modules).toEqual(full.modules);
    expect(cached.staff).toEqual(full.staff);
  });
});

// In-memory Firestore covering the calls the stats store makes.
function makeDb(collections) {
  const log = [];
  const writes = [];
  const ops = { ">=": (a, b) => a >= b, "<=": (a, b) => a <= b, "<": (a, b) => a < b, ">": (a, b) => a > b };
  const query = (name, filters = [], max = Infinity) => ({
    where: (f, op, v) => query(name, [...filters, [f, op, v]], max),
    orderBy: () => query(name, filters, max),
    select: () => query(name, filters, max),
    limit: (n) => query(name, filters, n),
    get: async () => {
      log.push({ name, filters });
      const rows = [...(collections[name] || new Map())].filter(([, data]) => filters.every(([f, op, v]) => data[f] !== undefined && ops[op](data[f], v))).slice(0, max);
      return { docs: rows.map(([id, data]) => ({ id, data: () => data })) };
    },
    doc: (id) => ({ id, name, get: async () => ({ exists: Boolean(collections[name]?.has(id)), data: () => collections[name]?.get(id) }) })
  });
  return {
    log,
    writes,
    collection: (name) => query(name),
    batch: () => {
      const pending = [];
      return {
        set: (ref, data) => pending.push([ref, data]),
        commit: async () => pending.forEach(([ref, data]) => {
          writes.push(ref.id);
          collections[ref.name] ||= new Map();
          collections[ref.name].set(ref.id, { ...(collections[ref.name].get(ref.id) || {}), ...data });
        })
      };
    }
  };
}

describe("stored summary freshness", () => {
  it("builds missing days once, then reads them back without touching reports", async () => {
    const reports = new Map(sampleReports(120).map((r) => [r.id, r]));
    const collections = { store_reports: reports };
    const liveStart = liveWindowStart(TODAY);
    const to = addDaysToDateKey(liveStart, -1);
    const db = makeDb(collections);
    const first = await readReportDayStats(db, "2026-07-01", to, { liveStart, now: new Date(at(TODAY, 10)) });
    expect(first[0]).toEqual(summarizeReportDays([...reports.values()], ["2026-07-01"])[0]);
    expect(collections.store_report_daily_stats.get("_meta")).toMatchObject({ checkedThrough: at(TODAY, 10) });

    const again = makeDb(collections);
    const second = await readReportDayStats(again, "2026-07-01", to, { liveStart, now: new Date(at(TODAY, 11)) });
    expect(second).toEqual(first);
    expect(again.log.filter((q) => q.name === "store_reports" && q.filters[0][0] === "createdAt")).toHaveLength(0);
    expect(again.writes).toEqual(["_meta"]);
  });

  it("rebuilds a day whose report was edited and flags edited days outside the range", async () => {
    const reports = new Map(sampleReports(120).map((r) => [r.id, r]));
    const collections = { store_reports: reports };
    const liveStart = liveWindowStart(TODAY);
    const to = addDaysToDateKey(liveStart, -1);
    await readReportDayStats(makeDb(collections), "2026-08-01", to, { liveStart, now: new Date(at(TODAY, 10)) });
    const inRange = [...reports.values()].find((r) => r.serviceDate === "2026-08-05" && !r.deletedAt && r.status === "saved");
    reports.set(inRange.id, { ...inRange, deletedAt: at(TODAY, 10), updatedAt: at(TODAY, 10) + "1" });
    const outside = [...reports.values()].find((r) => r.serviceDate === "2026-07-10");
    reports.set(outside.id, { ...outside, updatedAt: at(TODAY, 10) + "1" });
    const before = collections.store_report_daily_stats.get("2026-08-05");
    const db = makeDb(collections);
    const after = await readReportDayStats(db, "2026-08-01", to, { liveStart, now: new Date(at(TODAY, 12)) });
    const day = after.find((d) => d.date === "2026-08-05");
    expect(day.booking + day.online).toBe(before.booking + before.online - 1);
    expect(db.writes).toEqual(expect.arrayContaining(["2026-08-05", "2026-07-10", "_meta"]));
    expect(collections.store_report_daily_stats.get("2026-07-10")).toMatchObject({ stale: true });
  });
});

describe("dashboard auto refresh", () => {
  it("refreshes short ranges only", () => {
    expect(autoRefreshes("7d")).toBe(true);
    expect(autoRefreshes("month")).toBe(true);
    expect(autoRefreshes("3m")).toBe(false);
    expect(autoRefreshes("year")).toBe(false);
    expect(autoRefreshes("custom", { from: "2026-10-01", to: "2026-10-29" })).toBe(true);
    expect(autoRefreshes("custom", { from: "2026-01-01", to: "2026-10-29" })).toBe(false);
  });
});
