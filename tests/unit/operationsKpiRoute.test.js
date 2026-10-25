import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ db: null, role: "store", error: null }));
vi.mock("../../lib/workflowAuth", () => ({
  requireProfile: vi.fn(async (_request, roles) => {
    if (state.error) throw state.error;
    if (!roles.includes(state.role)) throw Object.assign(new Error("Forbidden"), { status: 403 });
    return { db: state.db, profile: { role: state.role } };
  }),
  errorResponse: (error) => Response.json({ ok: false, error: error.message }, { status: error.status || 500 })
}));
import { GET } from "../../app/api/operations-kpi/route.js";

function database(rows, overflow = false) {
  return { collection: (name) => {
    const clauses = [];
    let pageSize = Infinity;
    let cursorId = null;
    let sortField = "";
    const query = {
      where: (field, op, value) => { clauses.push([field, op, value]); return query; },
      select: () => query,
      orderBy: (field) => { sortField = field; return query; },
      limit: (size) => { pageSize = size; return query; },
      startAfter: (cursor) => { cursorId = cursor.id; return query; },
      get: async () => {
        const allRows = (rows[name] || []).filter((row) => clauses.every(([field, op, value]) => row[field] && (op === ">=" ? row[field] >= value : op === "<=" ? row[field] <= value : row[field] < value)))
          .sort((a, b) => String(a[sortField]).localeCompare(String(b[sortField])) || a.id.localeCompare(b.id));
        const offset = cursorId ? allRows.findIndex((row) => row.id === cursorId) + 1 : 0;
        const docs = allRows.slice(offset, offset + pageSize)
          .map((row) => ({ id: row.id, data: () => row }));
        return { size: overflow ? 50001 : docs.length, docs };
      }
    };
    return query;
  } };
}
const request = (from = "2026-01-01", to = "2026-12-31") => new Request(`http://localhost/api/operations-kpi?from=${from}&to=${to}`);

describe("operations KPI range API", () => {
  beforeEach(() => { state.role = "store"; state.error = null; state.db = database({}); });

  it("validates real dates and ranges before querying", async () => {
    expect((await GET(request("2026-02-30"))).status).toBe(400);
    expect((await GET(request("2027-01-01"))).status).toBe(400);
    expect((await GET(request("2024-01-01"))).status).toBe(400);
  });

  it("deduplicates queries and includes legacy dates, Bangkok boundaries and old jobs updated in range", async () => {
    state.db = database({ orders: [
      { id: "both", serviceDate: "2026-01-01", createdAt: "2025-12-31T17:00:00.000Z" },
      { id: "legacy", createdAt: "2026-12-31T16:59:59.999Z" },
      { id: "updated", serviceDate: "2025-01-01", updatedAt: "2026-02-01T00:00:00.000Z" },
      { id: "outside", createdAt: "2026-12-31T17:00:00.000Z" }
    ], store_reports: [
      { id: "booking", type: "booking", serviceDate: "2026-06-01", deletedAt: "2026-06-02" },
      { id: "other", type: "other", serviceDate: "2026-06-01" }
    ] });
    const response = await GET(request());
    expect(response.status).toBe(200);
    const json = await response.json();
    expect(json.orders.map((row) => row.id).sort()).toEqual(["both", "legacy", "updated"]);
    expect(json.reports.map((row) => row.id)).toEqual(["booking"]);
  });

  it("fails explicitly instead of returning an incomplete annual total", async () => {
    state.db = database({}, true);
    expect((await GET(request())).status).toBe(422);
  });

  it("reads beyond the first page, including when work dates are equal", async () => {
    state.db = database({ store_reports: Array.from({ length: 2205 }, (_, index) => ({ id: `report-${String(index).padStart(5, "0")}`, type: "booking", serviceDate: "2026-06-01", createdAt: "2026-06-01T03:00:00.000Z" })) });
    const response = await GET(request());
    expect(response.status).toBe(200);
    const json = await response.json();
    expect(json.reports).toHaveLength(2205);
    expect(new Set(json.reports.map((row) => row.id)).size).toBe(2205);
  });

  it("allows packing and denies unrelated roles and unauthenticated requests", async () => {
    state.role = "pack";
    expect((await GET(request())).status).toBe(200);
    state.role = "driver";
    expect((await GET(request())).status).toBe(403);
    state.error = Object.assign(new Error("Missing authorization token"), { status: 401 });
    expect((await GET(request())).status).toBe(401);
  });
});
