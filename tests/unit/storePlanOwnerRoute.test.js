import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ db: null }));
vi.mock("../../lib/workflowAuth.js", () => ({
  requireProfile: async () => ({ profile: { uid: "shared", name: "store", role: "store" }, db: state.db }),
  errorResponse: (e) => Response.json({ ok: false, error: e.message }, { status: e.status || 500 })
}));

function makeDb() {
  const plans = new Map();
  let next = 0;
  const emptyQuery = { where: () => emptyQuery, limit: () => emptyQuery, get: async () => ({ docs: [] }) };
  return {
    plans,
    collection(name) {
      if (name === "users") return emptyQuery;
      if (name === "store_settings") return { doc: () => ({ get: async () => ({ exists: true, data: () => ({ staff: [{ id: "staff_a", name: "ณัฐ", active: true }] }) }) }) };
      return { doc: (id) => ({ id: id || `p${++next}` }) };
    },
    runTransaction: async (fn) => {
      const ops = [];
      const result = await fn({ get: async (r) => ({ exists: plans.has(r.id), data: () => plans.get(r.id) }), set: (r, v) => ops.push(() => plans.set(r.id, v)), update: (r, v) => ops.push(() => plans.set(r.id, { ...plans.get(r.id), ...v })) });
      ops.forEach((op) => op());
      return result;
    }
  };
}

const call = async (method, body) => {
  const route = await import("../../app/api/store/plans/route.js");
  return route[method](new Request("http://localhost/api/store/plans", { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }));
};

beforeEach(() => { state.db = makeDb(); });

describe("personal plans", () => {
  it("files a plan under the roster name of its owner", async () => {
    const res = await call("POST", { title: "ตรวจชั้น", scope: "daily", date: "2026-10-29", ownerId: "staff_a", ownerName: "ปลอม" });
    expect(res.status).toBe(200);
    expect((await res.json()).data).toMatchObject({ ownerId: "staff_a", ownerName: "ณัฐ" });
  });

  it("rejects an owner outside the roster and lets an edit move a plan back to the team", async () => {
    expect((await call("POST", { title: "x", scope: "daily", date: "2026-10-29", ownerId: "staff_x" })).status).toBe(400);
    const created = (await (await call("POST", { title: "x", scope: "daily", date: "2026-10-29", ownerId: "staff_a" })).json()).data;
    const edited = await call("PATCH", { id: created.id, baseUpdatedAt: created.updatedAt, title: "x", scope: "daily", date: "2026-10-29", ownerId: "" });
    expect(edited.status).toBe(200);
    expect((await edited.json()).data).toMatchObject({ ownerId: "", ownerName: "" });
  });
});
