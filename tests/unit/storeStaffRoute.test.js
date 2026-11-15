import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ db: null, role: "store" }));

vi.mock("../../lib/workflowAuth.js", () => ({
  requireProfile: async (_request, roles) => {
    if (!roles.includes(state.role)) throw Object.assign(new Error("Forbidden"), { status: 403 });
    return { profile: { uid: `${state.role}-1`, role: state.role }, db: state.db };
  },
  errorResponse: (error) => Response.json({ ok: false, error: error.message }, { status: error.status || 500 })
}));

function usersDb(settings = null) {
  const calls = [];
  return {
    calls,
    collection: (name) => ({
      doc: () => ({ get: async () => ({ exists: Boolean(settings), data: () => settings }) }),
      where: () => ({ limit: () => ({ get: async () => ({ docs: [] }) }) })
    })
  };
}

let route;
const get = () => route.GET(new Request("http://localhost/api/store/staff", { headers: { Authorization: "Bearer test" } }));

describe("store staff route", () => {
  beforeEach(async () => {
    state.role = "store";
    state.db = usersDb({ staff: [] });
    route = await import("../../app/api/store/staff/route.js");
  });

  it("returns only active staff configured in Store Settings, sorted by name", async () => {
    state.db = usersDb({ staff: [
      { id: "staff_2", name: "สโตร์สอง", active: true },
      { id: "staff_1", name: "สโตร์หนึ่ง", active: true },
      { id: "staff_3", name: "ปิดใช้งาน", active: false }
    ] });
    const response = await get();
    expect(response.status).toBe(200);
    const { data } = await response.json();
    expect(data).toEqual([{ uid: "staff_2", name: "สโตร์สอง" }, { uid: "staff_1", name: "สโตร์หนึ่ง" }]);
    expect(state.db.calls).toEqual([]);
  });

  it("omits inactive names", async () => {
    state.db = usersDb({ staff: [{ id: "staff_1", name: "สมชาย", active: true }, { id: "staff_2", name: "อดีต", active: false }] });
    expect((await (await get()).json()).data).toEqual([{ uid: "staff_1", name: "สมชาย" }]);
  });

  it("returns every configured name, including a name that resembles the shared account", async () => {
    state.db = usersDb({ staff: [{ id: "staff_1", name: "คนตรวจ", active: true }, { id: "staff_2", name: "store", active: true }] });
    const { data } = await (await get()).json();
    expect(data).toHaveLength(2);
    expect(data).toContainEqual({ uid: "staff_1", name: "คนตรวจ" });
    expect(data).toContainEqual({ uid: "staff_2", name: "store" });
  });

  it("returns only the configured uid and name", async () => {
    state.db = usersDb({ staff: [{ id: "staff_1", name: "คนตรวจ", active: true, email: "secret@hillkoff.com", phone: "0812345678" }] });
    const text = await (await get()).text();
    expect(text).not.toContain("hillkoff.com");
    expect(text).not.toContain("0812345678");
    expect(text).not.toContain("active");
  });

  it("allows admin and rejects other roles", async () => {
    state.role = "admin";
    expect((await get()).status).toBe(200);
    for (const role of ["pack", "sales", "driver"]) {
      state.role = role;
      expect((await get()).status).toBe(403);
    }
  });

});
