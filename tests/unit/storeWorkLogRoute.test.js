import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ role: "store", db: null }));
vi.mock("../../lib/workflowAuth.js", () => ({
  requireProfile: async (_request, roles) => {
    if (!roles.includes(state.role)) throw Object.assign(new Error("Forbidden"), { status: 403 });
    return { profile: { uid: "shared", name: "store", role: state.role }, db: state.db };
  },
  errorResponse: (e) => Response.json({ ok: false, error: e.message }, { status: e.status || 500 })
}));

// In-memory Firestore with the calls the roster and work-log routes use.
function makeDb() {
  const logs = new Map();
  let next = 0;
  const users = [{ id: "shared", data: { role: "store", name: "store" } }];
  const settings = { staff: [{ id: "staff_a", name: "ณัฐ", active: true }, { id: "staff_old", name: "เก่า", active: false }] };
  const ref = (id) => ({ id, set: async (value) => logs.set(id, value) });
  const query = (rows) => {
    const filters = [];
    const q = { where: (f, op, v) => { filters.push([f, op, v]); return q; }, orderBy: () => q, limit: () => q, get: async () => ({ docs: rows().filter(({ data }) => filters.every(([f, op, v]) => (op === "==" ? data[f] === v : op === ">=" ? data[f] >= v : data[f] <= v))).map(({ id, data }) => ({ id, data: () => data })) }) };
    return q;
  };
  return {
    logs,
    collection(name) {
      if (name === "users") return query(() => users);
      if (name === "store_settings") return { doc: () => ({ get: async () => ({ exists: true, data: () => settings }) }) };
      return { doc: (id) => ref(id || `log${++next}`), ...query(() => [...logs].map(([id, data]) => ({ id, data }))) };
    },
    runTransaction: async (fn) => {
      const ops = [];
      const result = await fn({ get: async (r) => ({ exists: logs.has(r.id), data: () => logs.get(r.id) }), update: (r, v) => ops.push(() => logs.set(r.id, { ...logs.get(r.id), ...v })) });
      ops.forEach((op) => op());
      return result;
    }
  };
}

const call = async (method, body, query = "") => {
  const route = await import("../../app/api/store/work-logs/route.js");
  return route[method](new Request(`http://localhost/api/store/work-logs${query}`, { method, headers: { "Content-Type": "application/json" }, ...(body ? { body: JSON.stringify(body) } : {}) }));
};
const entry = { date: "2026-10-29", staffId: "staff_a", start: "09:00", end: "10:00", activity: "จัดชั้น", location: "คลัง WH", detail: "ตาม FEFO" };

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-10-29T08:00:00.000Z"));
  state.role = "store";
  state.db = makeDb();
});
afterEach(() => vi.useRealTimers());

describe("store work logs route", () => {
  it("creates an entry under the roster name, not a name sent by the client", async () => {
    const res = await call("POST", { ...entry, staffName: "ปลอม" });
    expect(res.status).toBe(200);
    const created = (await res.json()).data;
    expect(created).toMatchObject({ staffId: "staff_a", staffName: "ณัฐ", activity: "จัดชั้น", location: "คลัง WH" });
    expect(state.db.logs.get(created.id)).toMatchObject({ createdByUid: "shared", staffName: "ณัฐ" });
    const list = (await (await call("GET", null, "?date=2026-10-29")).json()).data.items;
    expect(list.map((x) => x.id)).toEqual([created.id]);
    expect(list[0]).not.toHaveProperty("createdByUid");
  });

  it("rejects the shared account, inactive staff, unknown people and future dates", async () => {
    expect((await call("POST", { ...entry, staffId: "shared" })).status).toBe(400);
    expect((await call("POST", { ...entry, staffId: "staff_old" })).status).toBe(400);
    expect((await call("POST", { ...entry, staffId: "staff_x" })).status).toBe(400);
    const future = await call("POST", { ...entry, date: "2026-10-30" });
    expect(future.status).toBe(400);
    expect((await future.json()).error).toContain("ถึงวันนี้");
    expect(state.db.logs.size).toBe(0);
  });

  it("edits with a stale check, keeps the owner and soft deletes", async () => {
    const created = (await (await call("POST", entry)).json()).data;
    expect((await call("PATCH", { ...entry, id: created.id, baseUpdatedAt: "old", activity: "นับสต็อก" })).status).toBe(409);
    const edited = await call("PATCH", { ...entry, staffId: "staff_b", id: created.id, baseUpdatedAt: created.updatedAt, activity: "นับสต็อก" });
    expect(edited.status).toBe(200);
    const latest = (await edited.json()).data;
    expect(latest).toMatchObject({ activity: "นับสต็อก", staffId: "staff_a" });
    expect((await call("DELETE", { id: created.id, baseUpdatedAt: latest.updatedAt })).status).toBe(200);
    expect(state.db.logs.get(created.id).deletedAt).toBeTruthy();
    expect((await (await call("GET", null, "?month=2026-10")).json()).data.items).toEqual([]);
  });

  it("filters a month by person and limits writes to the store role", async () => {
    await call("POST", entry);
    expect((await (await call("GET", null, "?month=2026-10&staffId=staff_a")).json()).data.items).toHaveLength(1);
    expect((await (await call("GET", null, "?month=2026-10&staffId=staff_b")).json()).data.items).toHaveLength(0);
    expect((await call("GET", null, "?month=2026-13")).status).toBe(400);
    state.role = "admin";
    expect((await call("GET", null, "?date=2026-10-29")).status).toBe(200);
    expect((await call("POST", entry)).status).toBe(403);
    state.role = "pack";
    expect((await call("GET", null, "?date=2026-10-29")).status).toBe(403);
  });
});
