import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ db: null, authUpdates: [] }));

vi.mock("../../lib/workflowAuth.js", () => ({
  requireProfile: async () => ({ profile: { uid: "admin-1", role: "admin", email: "online_marketing@hillkoff.com" }, db: state.db }),
  errorResponse: (error) => Response.json({ ok: false, error: error.message }, { status: error.status || 500 })
}));
vi.mock("../../lib/firebaseAdmin.js", () => ({
  getAdminAuth: () => ({
    updateUser: async (uid, update) => { state.authUpdates.push({ uid, update }); }
  })
}));

function createDb(initial) {
  const docs = new Map(Object.entries(initial));
  return {
    docs,
    collection: () => ({
      doc: (id) => ({
        set: async (patch) => docs.set(id, { ...docs.get(id), ...patch })
      })
    })
  };
}

async function patchUser(body) {
  const { PATCH } = await import("../../app/api/admin/users/route.js");
  return PATCH(new Request("http://localhost/api/admin/users", {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Authorization: "Bearer test" },
    body: JSON.stringify(body)
  }));
}

describe("admin staff account PATCH", () => {
  beforeEach(() => {
    state.authUpdates = [];
    state.db = createDb({ "staff-1": { role: "store", name: "สโตร์หนึ่ง", active: false } });
  });

  it("does not re-enable a disabled account when only the name is edited", async () => {
    const response = await patchUser({ uid: "staff-1", name: "สโตร์หนึ่ง แก้ชื่อ" });

    expect(response.status).toBe(200);
    // Firestore ยังปิดอยู่
    expect(state.db.docs.get("staff-1").active).toBe(false);
    // และต้องไม่มีการส่ง disabled: false ไปปลดแบนใน Firebase Auth
    expect(state.authUpdates).toHaveLength(1);
    expect(state.authUpdates[0].update).toEqual({ displayName: "สโตร์หนึ่ง แก้ชื่อ" });
    expect(state.authUpdates[0].update).not.toHaveProperty("disabled");
  });

  it("disables the auth account when active is explicitly set to false", async () => {
    const response = await patchUser({ uid: "staff-1", active: false });

    expect(response.status).toBe(200);
    expect(state.authUpdates[0].update).toEqual({ disabled: true });
  });

  it("re-enables the auth account when active is explicitly set to true", async () => {
    const response = await patchUser({ uid: "staff-1", active: true });

    expect(response.status).toBe(200);
    expect(state.db.docs.get("staff-1").active).toBe(true);
    expect(state.authUpdates[0].update).toEqual({ disabled: false });
  });

  it("skips the auth write entirely when neither name nor active changed", async () => {
    const response = await patchUser({ uid: "staff-1" });

    expect(response.status).toBe(200);
    expect(state.authUpdates).toHaveLength(0);
  });

  it("rejects a request with no uid", async () => {
    const response = await patchUser({ name: "x" });

    expect(response.status).toBe(400);
    expect(state.authUpdates).toHaveLength(0);
  });
});
