import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ db: null, role: "store" }));

vi.mock("../../lib/workflowAuth.js", () => ({
  requireProfile: async (_request, roles) => {
    if (!roles.includes(state.role)) throw Object.assign(new Error("Forbidden"), { status: 403 });
    return { profile: { uid: `${state.role}-1`, role: state.role }, db: state.db };
  },
  errorResponse: (error) => Response.json({ ok: false, error: error.message }, { status: error.status || 500 })
}));

function usersDb(users) {
  const calls = [];
  return {
    calls,
    collection: (name) => ({
      where: (field, op, value) => ({
        limit: (n) => ({
          get: async () => {
            calls.push({ name, field, op, value, limit: n });
            const rows = Object.entries(users).filter(([, data]) => data[field] === value).slice(0, n);
            return { docs: rows.map(([id, data]) => ({ id, data: () => data })) };
          }
        })
      })
    })
  };
}

const user = (overrides) => ({ role: "store", email: "x@hillkoff.com", phone: "0812345678", phoneDigits: "0812345678", status: "approved", ...overrides });

let route;
const get = () => route.GET(new Request("http://localhost/api/store/staff", { headers: { Authorization: "Bearer test" } }));

describe("store staff route", () => {
  beforeEach(async () => {
    state.role = "store";
    state.db = usersDb({
      u2: user({ name: "สโตร์สอง" }),
      u1: user({ name: "สโตร์หนึ่ง" }),
      u3: user({ name: "ปิดใช้งาน", active: false }),
      u4: user({ name: "ถูกปฏิเสธ", status: "rejected" }),
      u5: user({ name: "", email: "noname@hillkoff.com" }),
      u6: user({ role: "pack", name: "ห้องแพ็ค" })
    });
    route = await import("../../app/api/store/staff/route.js");
  });

  it("returns only active store users as uid and name, sorted by name", async () => {
    const response = await get();
    expect(response.status).toBe(200);
    const { data } = await response.json();
    // a user without a name falls back to the part of the email before "@" (its sort position depends on ICU collation)
    expect(data).toContainEqual({ uid: "u5", name: "noname" });
    expect(data.filter((person) => person.uid !== "u5")).toEqual([{ uid: "u2", name: "สโตร์สอง" }, { uid: "u1", name: "สโตร์หนึ่ง" }]);
    expect(data).toHaveLength(3);
    expect(state.db.calls).toEqual([{ name: "users", field: "role", op: "==", value: "store", limit: 101 }]);
  });

  it("never leaks email, phone or any other field", async () => {
    const text = await (await get()).text();
    expect(text).not.toContain("hillkoff.com");
    expect(text).not.toContain("0812345678");
    expect(text).not.toContain("status");
  });

  it("allows admin and rejects other roles", async () => {
    state.role = "admin";
    expect((await get()).status).toBe(200);
    for (const role of ["pack", "sales", "driver"]) {
      state.role = role;
      expect((await get()).status).toBe(403);
    }
  });

  it("answers 422 when there are more store users than the cap", async () => {
    state.db = usersDb(Object.fromEntries(Array.from({ length: 101 }, (_, i) => [`u${i}`, user({ name: `คน ${i}` })])));
    expect((await get()).status).toBe(422);
  });
});
