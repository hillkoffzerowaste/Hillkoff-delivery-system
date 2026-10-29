import { describe, expect, it } from "vitest";
import { bangkokDateOf, buildStoreOverview, periodRange } from "../../lib/storeOverview.js";

const base = { period: "7d", anchorDate: "2026-10-28" };

function transfer(over = {}) {
  return {
    id: "t", transferNumber: "TR-0001", fromBranchCode: "WH", fromBranchName: "คลังหลัก", toBranchCode: "B1", toBranchName: "สาขา 01",
    receipt: "complete", issueState: "", resolution: null, note: "", serviceDate: "2026-10-28", createdAt: "2026-10-28T03:00:00.000Z", ...over
  };
}

function audit(over = {}) {
  return { id: "a", documentNumber: "AU-0001", branchName: "คลังหลัก", zone: "A", total: 100, match: 100, mismatch: 0, note: "", serviceDate: "2026-10-28", createdAt: "2026-10-28T03:00:00.000Z", ...over };
}

describe("periodRange", () => {
  it("returns the single anchor day for today", () => {
    expect(periodRange("today", "2026-10-28")).toEqual({ from: "2026-10-28", to: "2026-10-28", dates: ["2026-10-28"], label: "28 ต.ค. 2569" });
  });

  it("returns the 7 days ending on the anchor", () => {
    const range = periodRange("7d", "2026-10-28");
    expect(range.dates).toHaveLength(7);
    expect([range.from, range.to]).toEqual(["2026-10-22", "2026-10-28"]);
    expect(range.label).toBe("22–28 ต.ค. 2569");
  });

  it("crosses a month boundary for 7d", () => {
    const range = periodRange("7d", "2026-11-03");
    expect(range.from).toBe("2026-10-28");
    expect(range.label).toBe("28 ต.ค. – 3 พ.ย. 2569");
  });

  it("crosses a year boundary for 7d", () => {
    expect(periodRange("7d", "2027-01-02").label).toBe("27 ธ.ค. 2569 – 2 ม.ค. 2570");
  });

  it("runs from day 1 of the month to the anchor", () => {
    const range = periodRange("month", "2026-10-28");
    expect(range.dates).toHaveLength(28);
    expect(range.from).toBe("2026-10-01");
    expect(range.label).toBe("1–28 ต.ค. 2569");
    expect(periodRange("month", "2026-10-01").dates).toEqual(["2026-10-01"]);
  });

  it("returns null for an unknown period or invalid date", () => {
    expect(periodRange("decade", "2026-10-28")).toBeNull();
    expect(periodRange("7d", "2026-13-01")).toBeNull();
    expect(periodRange("7d", "")).toBeNull();
  });
});

describe("bangkokDateOf", () => {
  it("shifts UTC evening into the next Bangkok day", () => {
    expect(bangkokDateOf("2026-10-27T17:00:00.000Z")).toBe("2026-10-28");
    expect(bangkokDateOf("2026-10-27T16:59:59.000Z")).toBe("2026-10-27");
    expect(bangkokDateOf("")).toBe("");
  });
});

describe("buildStoreOverview transfers", () => {
  it("returns null for an invalid period", () => {
    expect(buildStoreOverview({ period: "x", anchorDate: "2026-10-28" })).toBeNull();
  });

  it("counts complete, incomplete, resolved and open and ignores deleted", () => {
    const { transfers } = buildStoreOverview({
      ...base,
      transfers: [
        transfer({ id: "1" }),
        transfer({ id: "2", receipt: "incomplete", issueState: "open" }),
        transfer({ id: "3", receipt: "incomplete", issueState: "resolved", resolution: { at: "2026-10-28T05:00:00.000Z" } }),
        transfer({ id: "4", receipt: "incomplete", issueState: "open", deletedAt: "2026-10-28T06:00:00.000Z" })
      ]
    });
    expect(transfers).toMatchObject({ total: 3, complete: 1, incomplete: 2, resolved: 1, open: 1 });
  });

  it("gives a null resolve rate when nothing is incomplete", () => {
    const { transfers } = buildStoreOverview({ ...base, transfers: [transfer()] });
    expect(transfers.resolveRate).toBeNull();
    expect(transfers.avgResolveHours).toBeNull();
    expect(transfers.byDestination).toEqual([]);
  });

  it("computes the resolve rate and average resolve hours", () => {
    const { transfers } = buildStoreOverview({
      ...base,
      transfers: [
        transfer({ id: "1", receipt: "incomplete", issueState: "resolved", createdAt: "2026-10-28T03:00:00.000Z", resolution: { at: "2026-10-28T05:00:00.000Z" } }),
        transfer({ id: "2", receipt: "incomplete", issueState: "resolved", createdAt: "2026-10-28T03:00:00.000Z", resolution: { at: "2026-10-28T04:00:00.000Z" } }),
        transfer({ id: "3", receipt: "incomplete", issueState: "open" }),
        transfer({ id: "4", receipt: "incomplete", issueState: "open" })
      ]
    });
    expect(transfers.resolveRate).toBeCloseTo(0.5);
    expect(transfers.avgResolveHours).toBeCloseTo(1.5);
  });

  it("groups incomplete transfers by destination branch, busiest first", () => {
    const { transfers } = buildStoreOverview({
      ...base,
      transfers: [
        transfer({ id: "1", receipt: "incomplete", issueState: "open", toBranchCode: "B2", toBranchName: "สาขา 02" }),
        transfer({ id: "2", receipt: "incomplete", issueState: "resolved", toBranchCode: "B1" }),
        transfer({ id: "3", receipt: "incomplete", issueState: "open", toBranchCode: "B1" }),
        transfer({ id: "4", receipt: "complete", toBranchCode: "B3", toBranchName: "สาขา 03" })
      ]
    });
    expect(transfers.byDestination).toEqual([
      { code: "B1", name: "สาขา 01", resolved: 1, open: 1 },
      { code: "B2", name: "สาขา 02", resolved: 0, open: 1 }
    ]);
  });

  it("lists open transfers across days, oldest first, capped at 20", () => {
    const openTransfers = Array.from({ length: 25 }, (_, i) => transfer({
      id: `o${i}`, transferNumber: `TR-${i}`, receipt: "incomplete", issueState: "open", createdAt: new Date(Date.UTC(2026, 9, 1, 0, i)).toISOString()
    }));
    openTransfers.push(transfer({ id: "gone", issueState: "open", deletedAt: "2026-10-02T00:00:00.000Z", createdAt: "2026-09-01T00:00:00.000Z" }));
    const { transfers } = buildStoreOverview({ ...base, openTransfers: openTransfers.reverse() });
    expect(transfers.openList).toHaveLength(20);
    expect(transfers.openList[0].id).toBe("o0");
    expect(transfers.openList[19].id).toBe("o19");
    expect(Object.keys(transfers.openList[0]).sort()).toEqual(["createdAt", "fromBranchName", "id", "note", "toBranchName", "transferNumber"]);
  });
});

describe("buildStoreOverview audits", () => {
  it("averages over days that have audits, rounded, with activeDays", () => {
    const { audits } = buildStoreOverview({
      ...base,
      audits: [
        audit({ id: "1", serviceDate: "2026-10-28", total: 100, match: 97, mismatch: 3 }),
        audit({ id: "2", serviceDate: "2026-10-28", total: 51, match: 51, mismatch: 0 }),
        audit({ id: "3", serviceDate: "2026-10-26", total: 100, match: 100, mismatch: 0 })
      ]
    });
    expect(audits).toMatchObject({ docs: 3, total: 251, match: 248, mismatch: 3, activeDays: 2, avg: 126 });
    expect(audits.accuracy).toBeCloseTo(248 / 251);
    expect(audits.daily).toHaveLength(7);
    expect(audits.daily.at(-1)).toEqual({ date: "2026-10-28", docs: 2, total: 151, match: 148, mismatch: 3 });
    expect(audits.daily[0]).toEqual({ date: "2026-10-22", docs: 0, total: 0, match: 0, mismatch: 0 });
  });

  it("handles no audits without dividing by zero", () => {
    const { audits } = buildStoreOverview({ ...base });
    expect(audits).toMatchObject({ docs: 0, total: 0, accuracy: null, activeDays: 0, avg: 0, latestMismatched: [] });
  });

  it("excludes deleted audits and audits outside the period", () => {
    const { audits } = buildStoreOverview({
      ...base,
      audits: [
        audit({ id: "1", deletedAt: "2026-10-28T09:00:00.000Z" }),
        audit({ id: "2", serviceDate: "2026-10-01" })
      ]
    });
    expect(audits.docs).toBe(0);
  });

  it("lists the latest mismatched audits newest first, up to 10", () => {
    const audits = Array.from({ length: 12 }, (_, i) => audit({
      id: `a${i}`, documentNumber: `AU-${i}`, total: 10, match: 8, mismatch: 2, createdAt: new Date(Date.UTC(2026, 9, 28, 0, i)).toISOString()
    }));
    audits.push(audit({ id: "clean", createdAt: "2026-10-28T23:00:00.000Z" }));
    const result = buildStoreOverview({ ...base, audits }).audits.latestMismatched;
    expect(result).toHaveLength(10);
    expect(result[0].id).toBe("a11");
    expect(result[9].id).toBe("a2");
    expect(result[0]).toMatchObject({ documentNumber: "AU-11", mismatch: 2, total: 10 });
  });
});

describe("buildStoreOverview booking and online", () => {
  const report = (over) => ({ id: "r", type: "booking", status: "saved", packStatus: "", createdAt: "2026-10-28T03:00:00.000Z", workflowHistory: [], ...over });

  it("counts docs, open problems and historical pack problems per type", () => {
    const { modules } = buildStoreOverview({
      ...base,
      reports: [
        report({ id: "1" }),
        report({ id: "2", status: "waiting" }),
        report({ id: "3", status: "partial" }),
        report({ id: "4", type: "online" }),
        report({ id: "5", type: "online", packStatus: "returned" }),
        report({ id: "6", type: "online", packStatus: "partial" }),
        report({ id: "7", type: "online", workflowHistory: [{ action: "pack_returned" }] }),
        report({ id: "8", packStatus: "returned" })
      ]
    });
    expect(modules.booking).toEqual({ docs: 4, problems: 3, open: 3 });
    expect(modules.online).toEqual({ docs: 4, problems: 3, open: 2 });
  });

  it("ignores deleted, draft and out of period reports", () => {
    const { modules } = buildStoreOverview({
      ...base,
      reports: [
        report({ id: "1", deletedAt: "2026-10-28T05:00:00.000Z", status: "waiting" }),
        report({ id: "2", status: "draft" }),
        report({ id: "3", createdAt: "2026-10-01T03:00:00.000Z" }),
        report({ id: "4", createdAt: "2026-10-27T17:00:00.000Z" })
      ]
    });
    expect(modules.booking).toEqual({ docs: 1, problems: 0, open: 0 });
  });

  it("puts a report created at 00:30 Bangkok on that Bangkok day", () => {
    const { modules } = buildStoreOverview({ period: "today", anchorDate: "2026-10-28", reports: [report({ createdAt: "2026-10-27T17:30:00.000Z" })] });
    expect(modules.booking.docs).toBe(1);
  });
});
