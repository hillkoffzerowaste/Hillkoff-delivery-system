import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ db: null, role: "store" }));

vi.mock("../../lib/workflowAuth.js", () => ({
  requireProfile: async (_req, roles) => {
    if (!roles.includes(state.role)) throw Object.assign(new Error("Forbidden"), { status: 403 });
    return { profile: { uid: `${state.role}-1`, role: state.role, name: "สโตร์หนึ่ง", email: "s@hillkoff.com" }, db: state.db };
  },
  errorResponse: (error) => Response.json({ ok: false, error: error.message }, { status: error.status || 500 })
}));

// fake Firestore ที่กรองจริงตาม where เพื่อยืนยันว่า query ช่วงวันถูกส่งออกไปครบ และจดคำสั่งไว้ตรวจ single-field
function createDb(collections, calls = []) {
  return {
    calls,
    collection(name) {
      const filters = [];
      let order = null;
      const query = {
        where(field, op, value) { filters.push({ field, op, value }); return query; },
        orderBy(field) { order = field; return query; },
        select() { return query; },
        limit(count) { query.max = count; return query; },
        async get() {
          calls.push({ name, filters: [...filters], order, limit: query.max });
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

const row = (id, data) => ({ id, data });
const request = (query = "") => new Request(`http://localhost/api/store/overview${query}`, { headers: { Authorization: "Bearer test" } });

describe("GET /api/store/overview", () => {
  beforeEach(() => {
    state.role = "store";
    state.db = createDb({
      store_transfers: [
        row("t1", { serviceDate: "2026-10-28", receipt: "incomplete", issueState: "open", toBranchCode: "B1", toBranchName: "สาขา 01", createdAt: "2026-10-28T03:00:00.000Z", transferNumber: "TR-1" }),
        row("t2", { serviceDate: "2026-10-27", receipt: "complete", issueState: "", createdAt: "2026-10-27T03:00:00.000Z" }),
        row("t3", { serviceDate: "2026-09-01", receipt: "incomplete", issueState: "open", toBranchCode: "B1", createdAt: "2026-09-01T03:00:00.000Z", transferNumber: "TR-0" })
      ],
      store_audits: [row("a1", { serviceDate: "2026-10-28", total: 100, match: 96, mismatch: 4, createdAt: "2026-10-28T04:00:00.000Z", documentNumber: "AU-1" })],
      store_reports: [
        row("r1", { type: "booking", status: "waiting", createdAt: "2026-10-28T02:00:00.000Z" }),
        row("r2", { type: "online", status: "saved", createdAt: "2026-10-28T02:00:00.000Z" }),
        row("r3", { type: "online", status: "saved", createdAt: "2026-09-01T02:00:00.000Z" })
      ]
    });
  });

  it("returns the overview for store and admin", async () => {
    const { GET } = await import("../../app/api/store/overview/route.js");
    for (const role of ["store", "admin"]) {
      state.role = role;
      const res = await GET(request("?period=7d&date=2026-10-28"));
      expect(res.status).toBe(200);
      const { ok, data } = await res.json();
      expect(ok).toBe(true);
      expect(data).toMatchObject({ period: "7d", from: "2026-10-22", to: "2026-10-28", rangeLabel: "22–28 ต.ค. 2569" });
      expect(data.transfers).toMatchObject({ total: 2, incomplete: 1, open: 1 });
      expect(data.transfers.openList.map((item) => item.transferNumber)).toEqual(["TR-0", "TR-1"]);
      expect(data.audits).toMatchObject({ docs: 1, total: 100, mismatch: 4 });
      expect(data.modules).toEqual({ booking: { docs: 1, problems: 1, open: 1 }, online: { docs: 1, problems: 0, open: 0 } });
    }
  });

  it("defaults to 7d and queries single-field ranges with the right bounds", async () => {
    const { GET } = await import("../../app/api/store/overview/route.js");
    const res = await GET(request("?date=2026-10-28"));
    expect((await res.json()).data.period).toBe("7d");
    const calls = state.db.calls;
    const transfers = calls.find((call) => call.name === "store_transfers" && call.filters[0].field === "serviceDate");
    expect(transfers.filters).toEqual([{ field: "serviceDate", op: ">=", value: "2026-10-22" }, { field: "serviceDate", op: "<=", value: "2026-10-28" }]);
    expect(transfers.order).toBe("serviceDate");
    expect(transfers.limit).toBe(3001);
    const reports = calls.find((call) => call.name === "store_reports");
    expect(reports.filters).toEqual([
      { field: "createdAt", op: ">=", value: "2026-10-21T17:00:00.000Z" },
      { field: "createdAt", op: "<", value: "2026-10-28T17:00:00.000Z" }
    ]);
    expect(reports.order).toBe("createdAt");
    expect(reports.limit).toBe(6001);
    const open = calls.find((call) => call.filters[0]?.field === "issueState");
    expect(open.filters).toEqual([{ field: "issueState", op: "==", value: "open" }]);
    expect(open.order).toBeNull();
    // ไม่มี query ใดผสม == กับ orderBy
    calls.forEach((call) => expect(call.filters.some((f) => f.op === "==") && call.order).toBeFalsy());
  });

  it("rejects pack with 403", async () => {
    state.role = "pack";
    const { GET } = await import("../../app/api/store/overview/route.js");
    expect((await GET(request("?period=today"))).status).toBe(403);
  });

  it("rejects a bad period and a bad date with 400", async () => {
    const { GET } = await import("../../app/api/store/overview/route.js");
    const bad = await GET(request("?period=year"));
    expect(bad.status).toBe(400);
    expect(await bad.json()).toMatchObject({ ok: false, error: "ช่วงเวลาไม่ถูกต้อง" });
    expect((await GET(request("?period=today&date=2026-02-31"))).status).toBe(400);
  });

  it("keeps the overview available and marks a capped open transfer list", async () => {
    state.db = createDb({ store_transfers: Array.from({ length: 501 }, (_, i) => row(`t${i}`, { serviceDate: "2026-01-01", issueState: "open", receipt: "incomplete" })) });
    const { GET } = await import("../../app/api/store/overview/route.js");
    const response = await GET(request("?period=7d&date=2026-10-28"));
    expect(response.status).toBe(200);
    expect((await response.json()).data.openTransfersCapped).toBe(true);
  });

  it("returns 422 instead of truncating when a collection exceeds its cap", async () => {
    const many = Array.from({ length: 3001 }, (_, i) => row(`a${i}`, { serviceDate: "2026-10-28", total: 1, mismatch: 0 }));
    state.db = createDb({ store_audits: many });
    const { GET } = await import("../../app/api/store/overview/route.js");
    const res = await GET(request("?period=7d&date=2026-10-28"));
    expect(res.status).toBe(422);
    expect(await res.json()).toMatchObject({ ok: false, error: "ข้อมูลมากเกินขีดจำกัด กรุณาเลือกช่วงให้สั้นลง" });
  });
});
