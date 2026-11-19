import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildWarehouseDashboard, percent } from "../../lib/storeWarehouseDashboard.js";
import StoreWarehouseDashboard, { bucketDays, rangePresets, rangeTitle, shortDate, WAREHOUSE_TABS } from "../../app/components/store/StoreWarehouseDashboard.jsx";
import StoreOverviewPanel from "../../app/components/store/StoreOverviewPanel.jsx";

const state = vi.hoisted(() => ({ db: null, role: "store" }));

vi.mock("../../lib/workflowAuth.js", () => ({
  requireProfile: async (_req, roles) => {
    if (!roles.includes(state.role)) throw Object.assign(new Error("Forbidden"), { status: 403 });
    return { profile: { uid: `${state.role}-1`, role: state.role, name: "สโตร์หนึ่ง" }, db: state.db };
  },
  errorResponse: (error) => Response.json({ ok: false, error: error.message }, { status: error.status || 500 })
}));

const branchList = [{ code: "CP", name: "ช้างเผือก" }, { code: "HQ", name: "สำนักงานใหญ่" }, { code: "MH", name: "มหิดล" }];
const transfers = [
  { id: "t1", serviceDate: "2026-11-02", fromBranchCode: "CP", toBranchCode: "MH", receipt: "incomplete", issueState: "open", itemCount: 3, preparerUid: "u1", preparerName: "ธนพล", transferNumber: "TRF-1", note: "ขาด 1 ลัง" },
  { id: "t2", serviceDate: "2026-11-02", fromBranchCode: "CP", toBranchCode: "HQ", receipt: "complete", itemCount: 5, preparerUid: "u1", preparerName: "ธนพล", transferNumber: "TRF-2" },
  { id: "t3", serviceDate: "2026-11-03", fromBranchCode: "CP", toBranchCode: "HQ", receipt: "incomplete", issueState: "resolved", itemCount: 2, preparerUid: "u2", preparerName: "โจ้", transferNumber: "TRF-3", resolution: { text: "ส่งเพิ่มแล้ว" } },
  { id: "t4", serviceDate: "2026-11-03", fromBranchCode: "HQ", toBranchCode: "CP", receipt: "complete", itemCount: 1, transferNumber: "TRF-4" },
  { id: "t5", serviceDate: "2026-11-03", fromBranchCode: "HQ", toBranchCode: "CP", receipt: "complete", transferNumber: "TRF-5", deletedAt: "2026-11-03T05:00:00.000Z" },
  { id: "t6", serviceDate: "2026-10-31", fromBranchCode: "HQ", toBranchCode: "CP", receipt: "incomplete", issueState: "open", transferNumber: "TRF-OLD" }
];
const audits = [
  { id: "a1", serviceDate: "2026-11-02", branchCode: "HQ", zone: "EQ-GW", total: 100, match: 90, mismatch: 10, documentNumber: "AU-1", checkerName: "ณัฐ" },
  { id: "a2", serviceDate: "2026-11-03", branchCode: "HQ", zone: "RF-DR", total: 20, match: 20, mismatch: 0, documentNumber: "AU-2" },
  { id: "a3", serviceDate: "2026-11-03", branchCode: "MH", zone: "PK", total: 50, match: 49, mismatch: 1, documentNumber: "AU-3", deletedAt: "x" }
];
const reports = [
  { id: "r1", type: "booking", status: "saved", packStatus: "checked", serviceDate: "2026-11-02", createdAt: "2026-11-02T02:00:00.000Z", confirmedAt: "x", storeCheckerName: "เล็ก" },
  { id: "r2", type: "online", status: "waiting", packStatus: "returned", serviceDate: "2026-11-02", createdAt: "2026-11-02T02:00:00.000Z", confirmedAt: "x", storeCheckerName: "เล็ก" },
  { id: "r3", type: "online", status: "partial", packStatus: "pending", serviceDate: "2026-11-03", createdAt: "2026-11-03T02:00:00.000Z", confirmedAt: "x", storeCheckerName: "สุภาพ" },
  { id: "r4", type: "booking", status: "draft", packStatus: "blocked", serviceDate: "2026-11-03", createdAt: "2026-11-03T02:00:00.000Z" },
  { id: "r5", type: "booking", status: "saved", packStatus: "pending", serviceDate: "2026-11-03", createdAt: "2026-11-03T02:00:00.000Z", deletedAt: "2026-11-03T03:00:00.000Z" }
];
const cases = [
  { id: "c1", sourceType: "transfer", sourceId: "t1", sourceNumber: "TRF-1", branchCode: "MH", status: "open", createdAt: "2026-10-20T03:00:00.000Z", cause: "SUP ส่งไม่ครบ", lines: [
    { id: "l1", sku: "SY-DV-0008", name: "Davinci Vanilla", unit: "ขวด", required: 10, received: 4, cancelled: 0, trackingStatus: "ordered", allocations: [{ quantity: 6, kind: "supplier", supplier: "Davinci", po: "PO-1", eta: "2026-11-01" }] },
    { id: "l2", sku: "IG-1", name: "ครบแล้ว", unit: "ชิ้น", required: 2, received: 2, cancelled: 0 }
  ] },
  { id: "c2", sourceType: "audit", sourceId: "a1", sourceNumber: "AU-1", branchCode: "HQ", status: "working", createdAt: "2026-11-02T03:00:00.000Z", lines: [] },
  { id: "c3", sourceType: "booking", sourceId: "r9", status: "closed", closure: "fulfilled", createdAt: "2026-11-02T03:00:00.000Z", lines: [{ id: "x", name: "a", unit: "u", required: 1, received: 0, cancelled: 0 }] },
  { id: "c4", sourceType: "online", sourceId: "r2", sourceNumber: "ON-2", status: "open", createdAt: "2026-11-02T03:00:00.000Z", lines: [{ id: "y", sku: "SY-LN-0015", name: "Lin Caramel", unit: "ขวด", required: 3, received: 0, cancelled: 0 }] }
];
const roster = [{ uid: "u1", name: "ธนพล" }, { uid: "u2", name: "โจ้" }, { uid: "u3", name: "เล็ก" }];

const build = (extra = {}) => buildWarehouseDashboard({ from: "2026-11-01", to: "2026-11-05", today: "2026-11-05", branchList, roster, reports, transfers, audits, cases, ...extra });
const branch = (data, code) => data.branches.find((b) => b.code === code);

describe("buildWarehouseDashboard", () => {
  it("counts live transfers at the source branch and receipts at the destination", () => {
    const data = build();
    const cp = branch(data, "CP");
    expect(cp.transfers).toMatchObject({ total: 3, items: 10, incomplete: 2, open: 1, resolved: 1 });
    expect(cp.transfers.daily).toEqual([0, 2, 1, 0, 0]);
    expect(cp.transfers.dailyIncomplete).toEqual([0, 1, 1, 0, 0]);
    expect(cp.transfers.errors.map((e) => [e.date, e.to, e.state])).toEqual([["2026-11-02", "MH", "open"], ["2026-11-03", "HQ", "resolved"]]);
    expect(cp.transfers.staff.map(({ name, docs, items }) => ({ name, docs, items }))).toEqual([{ name: "โจ้", docs: 1, items: 2 }, { name: "ธนพล", docs: 1, items: 3 }]);
    expect(branch(data, "HQ").transfers).toMatchObject({ total: 1, incomplete: 0, received: 2, receivedIncomplete: 1 });
    expect(branch(data, "MH").transfers).toMatchObject({ total: 0, received: 1, receivedIncomplete: 1 });
  });

  it("keeps audits per branch with accuracy and skips deleted documents", () => {
    const data = build();
    expect(branch(data, "HQ").audits).toMatchObject({ docs: 2, total: 120, match: 110, mismatch: 10, accuracy: 91.7 });
    expect(branch(data, "MH").audits).toMatchObject({ docs: 0, total: 0, accuracy: null });
  });

  it("summarises booking/online work at store level without drafts", () => {
    const { reports: r } = build();
    expect(r).toMatchObject({ total: 3, booking: 1, online: 2, removed: 1, activeDays: 2, perDay: 2 });
    expect(Object.fromEntries(r.statuses.map((s) => [s.id, s.count]))).toEqual({ pending: 0, checked: 1, shortage: 1, returned: 1 });
    expect(r.checkers[0]).toEqual({ name: "เล็ก", booking: 1, online: 1 });
  });

  it("lists outstanding case lines with age, ETA and overdue flags from open cases only", () => {
    const data = build();
    expect(data.cases.open).toBe(3);
    expect(data.cases.withoutLines).toBe(1);
    expect(data.cases.shortages).toHaveLength(2);
    expect(data.cases.shortages[0]).toMatchObject({ sku: "SY-DV-0008", remaining: 6, po: "PO-1", supplier: "Davinci", eta: "2026-11-01", overdue: true, branchCode: "MH", opened: "2026-10-20", days: 16, note: "SUP ส่งไม่ครบ" });
    expect(branch(data, "MH").cases).toEqual({ open: 1, shortageLines: 1 });
    expect(branch(data, "HQ").cases).toEqual({ open: 1, shortageLines: 0 });
  });

  it("keeps booking/online cases at store level instead of inventing an unknown branch", () => {
    const data = build();
    expect(data.cases).toMatchObject({ storeOpen: 1, storeLines: 1 });
    expect(data.branches.map((b) => b.code)).not.toContain("ไม่ระบุ");
    expect(data.cases.shortages.find((s) => s.sku === "SY-LN-0015")).toMatchObject({ storeLevel: true, branchCode: "", sourceType: "online" });
  });

  it("judges the audit KPI on the unrounded share", () => {
    const data = build({ audits: [{ id: "k", serviceDate: "2026-11-02", branchCode: "CP", total: 10000, match: 9496, mismatch: 504 }] });
    expect(branch(data, "CP").audits).toMatchObject({ accuracy: 95, pass: false });
    expect(branch(build(), "HQ").audits.pass).toBe(false);
    expect(branch(build({ audits: [{ id: "k", serviceDate: "2026-11-02", branchCode: "CP", total: 100, match: 95, mismatch: 5 }] }), "CP").audits.pass).toBe(true);
  });

  it("names inactive branches that still carry data and caps the range at 92 days", () => {
    const data = build({ branchNames: { OLD: "สาขาเก่า" }, transfers: [{ id: "z", serviceDate: "2026-11-04", fromBranchCode: "OLD", toBranchCode: "CP", receipt: "complete" }] });
    expect(branch(data, "OLD").name).toBe("สาขาเก่า");
    expect(buildWarehouseDashboard({ from: "2026-08-01", to: "2026-10-31" })).not.toBeNull();
    expect(buildWarehouseDashboard({ from: "2026-08-01", to: "2026-11-01" })).toBeNull();
  });

  it("keeps settings branch order, names them, and adds unknown codes only when they carry data", () => {
    const data = build({ transfers: [...transfers, { id: "z", serviceDate: "2026-11-04", fromBranchCode: "OLD", toBranchCode: "CP", receipt: "complete" }] });
    expect(data.branches.map((b) => b.code)).toEqual(["CP", "HQ", "MH", "OLD"]);
    expect(branch(data, "CP").name).toBe("ช้างเผือก");
    expect(build({ branchList: branchList.slice(0, 1), transfers: [], audits: [], cases: [] }).branches.map((b) => b.code)).toEqual(["CP"]);
  });

  it("returns staff rows from the shared range report and rejects bad ranges", () => {
    const data = build();
    expect(data.staff.find((p) => p.uid === "u1")).toMatchObject({ transfer: 2, issues: 1 });
    expect(buildWarehouseDashboard({ from: "2026-11-05", to: "2026-11-01" })).toBeNull();
    expect(percent(1, 3)).toBe(33.3);
    expect(percent(1, 0)).toBeNull();
  });
});

describe("StoreWarehouseDashboard helpers", () => {
  it("builds date presets and labels", () => {
    const presets = rangePresets("2026-11-19");
    expect(presets.map(([id, , from, to]) => [id, from, to])).toEqual([
      ["today", "2026-11-19", "2026-11-19"], ["7d", "2026-11-13", "2026-11-19"], ["month", "2026-11-01", "2026-11-19"], ["lastMonth", "2026-10-01", "2026-10-31"], ["3m", "2026-08-22", "2026-11-19"]
    ]);
    expect(shortDate("2026-11-19")).toBe("19 พ.ย. 69");
    expect(rangeTitle("2026-11-01", "2026-11-19")).toBe("1 พ.ย. 69 – 19 พ.ย. 69");
  });

  it("groups long ranges by month", () => {
    const short = bucketDays(["2026-11-01", "2026-11-02"], { a: [1, 2] });
    expect(short.map((b) => [b.label, b.values.a])).toEqual([["1", 1], ["2", 2]]);
    const dates = Array.from({ length: 70 }, (_, i) => new Date(Date.UTC(2026, 8, 1 + i)).toISOString().slice(0, 10));
    const long = bucketDays(dates, { a: dates.map(() => 1) });
    expect(long.map((b) => [b.key, b.values.a])).toEqual([["2026-09", 30], ["2026-10", 31], ["2026-11", 9]]);
  });

  it("renders the new dashboard by default with branch chips, tabs and a loading state", () => {
    const html = renderToStaticMarkup(<StoreOverviewPanel apiFetch={async () => new Response("{}")} settings={{ modules: [] }} />);
    expect(html).toContain("Hillkoff Store Dashboard");
    WAREHOUSE_TABS.forEach(([, label]) => expect(html).toContain(label));
    expect(html).toContain("ทุกสาขา");
    expect(html).toContain("กำลังรวบรวมข้อมูล");
    const direct = renderToStaticMarkup(<StoreWarehouseDashboard apiFetch={async () => new Response("{}")} settings={{}} />);
    expect(direct).toContain('aria-label="ช่วงเวลาสำเร็จรูป"');
  });
});

function createDb(collections, calls = []) {
  return {
    calls,
    collection(name) {
      if (name === "store_settings") return { doc: () => ({ get: async () => ({ exists: true, data: () => ({ branches: [{ code: "CP", name: "ช้างเผือก", type: "สาขา", active: true }, { code: "HQ", name: "สำนักงานใหญ่", type: "สาขา", active: true }] }) }) }) };
      const filters = [];
      const query = {
        where(field, op, value) { filters.push({ field, op, value }); return query; },
        orderBy() { return query; },
        select() { return query; },
        limit(count) { query.max = count; return query; },
        async get() {
          calls.push({ name, filters: [...filters] });
          const rows = (collections[name] || []).filter(({ data }) => filters.every(({ field, op, value }) => {
            const v = data[field];
            if (op === "==") return v === value;
            if (op === ">=") return v >= value;
            if (op === "<=") return v <= value;
            if (op === "<") return v < value;
            return false;
          }));
          const docs = rows.slice(0, query.max).map(({ id, data }) => ({ id, data: () => data }));
          return { docs, size: docs.length };
        }
      };
      return query;
    }
  };
}

describe("GET /api/store/warehouse", () => {
  const request = (query = "") => new Request(`http://localhost/api/store/warehouse${query}`);
  beforeEach(() => {
    state.role = "store";
    state.db = createDb({
      store_transfers: transfers.map((data) => ({ id: data.id, data })),
      store_audits: audits.map((data) => ({ id: data.id, data })),
      store_reports: reports.map((data) => ({ id: data.id, data })),
      store_work_logs: []
    });
  });

  it("returns per-branch data for the requested range using settings branches", async () => {
    const { GET } = await import("../../app/api/store/warehouse/route.js");
    const res = await GET(request("?from=2026-11-01&to=2026-11-05"));
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.data.branches.map((b) => b.code)).toEqual(["CP", "HQ", "MH"]);
    expect(json.data.branches[0].transfers.total).toBe(3);
    expect(json.data.reports.total).toBe(3);
    const transferCall = state.db.calls.find((c) => c.name === "store_transfers" && c.filters.some((f) => f.field === "serviceDate"));
    expect(transferCall.filters).toEqual([{ field: "serviceDate", op: ">=", value: "2026-11-01" }, { field: "serviceDate", op: "<=", value: "2026-11-05" }]);
  });

  it("rejects invalid ranges and other roles", async () => {
    const { GET } = await import("../../app/api/store/warehouse/route.js");
    expect((await GET(request("?from=2026-11-05&to=2026-11-01"))).status).toBe(400);
    expect((await GET(request("?from=2026-01-01&to=2026-11-01"))).status).toBe(400);
    state.role = "pack";
    expect((await GET(request())).status).toBe(403);
  });
});
