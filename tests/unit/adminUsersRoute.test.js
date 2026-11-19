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

function createAccount(role) {
  return import("../../app/api/admin/users/route.js").then(({ POST }) => POST(new Request("http://localhost/api/admin/users", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: "Bearer test" },
    body: JSON.stringify({ username: "staff01", password: "staff-pass", name: "พนักงาน 1", role })
  })));
}

describe("staff accounts", () => {
  beforeEach(() => {
    state.profiles = new Map();
    state.createdUsers = [];
  });

  it.each(["store", "pack"])("lets an admin create an active %s credential profile", async (role) => {
    const response = await createAccount(role);
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.data).toMatchObject({ uid: "front-1", username: "staff01", role });
    expect(state.createdUsers[0]).toMatchObject({ email: "staff01@staff.hillkoff.local", displayName: "พนักงาน 1" });
    expect(state.profiles.get("front-1")).toMatchObject({ role, active: true, status: "approved" });
  });

  it("refuses to create a storefront account because that role was retired", async () => {
    const response = await createAccount("storefront");

    expect(response.status).toBe(400);
    expect((await response.json()).error).toBe("Invalid role");
    expect(state.createdUsers).toHaveLength(0);
    expect(state.profiles.size).toBe(0);
  });
});
