import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ profiles: new Map(), createdUsers: [] }));

vi.mock("../../lib/workflowAuth.js", async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    requireProfile: async () => ({ profile: { uid: "admin-1", role: "admin", email: "online_marketing@hillkoff.com" }, db: createDb() }),
    errorResponse: (error) => Response.json({ ok: false, error: error.message }, { status: error.status || 500 })
  };
});

vi.mock("../../lib/firebaseAdmin.js", () => ({
  getAdminAuth: () => ({
    createUser: async (input) => {
      state.createdUsers.push(input);
      return { uid: "front-1" };
    },
    getUserByEmail: async () => ({ uid: "front-1" }),
    updateUser: async () => {}
  }),
  getAdminDb: () => createDb()
}));

function createDb() {
  return {
    collection(name) {
      if (name !== "users") throw new Error(`unexpected collection ${name}`);
      return {
        doc(uid) {
          return {
            get: async () => ({ exists: state.profiles.has(uid), data: () => state.profiles.get(uid) }),
            set: async (patch) => state.profiles.set(uid, { ...(state.profiles.get(uid) || {}), ...patch })
          };
        }
      };
    }
  };
}

describe("storefront staff accounts", () => {
  beforeEach(() => {
    state.profiles = new Map();
    state.createdUsers = [];
  });

  it("lets an admin create an active storefront credential profile", async () => {
    const { POST } = await import("../../app/api/admin/users/route.js");
    const response = await POST(new Request("http://localhost/api/admin/users", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer test" },
      body: JSON.stringify({ username: "front01", password: "front-pass", name: "หน้าร้าน 1", role: "storefront" })
    }));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.data).toMatchObject({ uid: "front-1", username: "front01", role: "storefront" });
    expect(state.createdUsers[0]).toMatchObject({ email: "front01@staff.hillkoff.local", displayName: "หน้าร้าน 1" });
    expect(state.profiles.get("front-1")).toMatchObject({ role: "storefront", active: true, status: "approved" });
  });
});
