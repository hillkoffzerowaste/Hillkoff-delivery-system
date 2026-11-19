import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ profile: null }));

vi.mock("../../lib/firebaseAdmin.js", () => ({
  getAdminAuth: () => ({ verifyIdToken: async () => ({ uid: "staff-1", email: "staff01@staff.hillkoff.local" }) }),
  getAdminDb: () => ({
    collection(name) {
      if (name === "users") return { doc: () => ({ get: async () => ({ exists: true, data: () => state.profile }) }) };
      if (name === "users_by_phone") return { where: () => ({ limit: () => ({ get: async () => ({ docs: [] }) }) }) };
      throw new Error(`unexpected collection ${name}`);
    }
  })
}));

async function validate() {
  const { POST } = await import("../../app/api/auth/validate/route.js");
  const response = await POST(new Request("http://localhost/api/auth/validate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ idToken: "test" })
  }));
  return response.json();
}

describe("auth validation for staff roles", () => {
  beforeEach(() => {
    state.profile = { uid: "staff-1", role: "pack", active: true, status: "approved", name: "พนักงาน 1" };
  });

  it.each(["store", "pack"])("recognizes an active %s staff session", async (role) => {
    state.profile.role = role;

    expect(await validate()).toMatchObject({ valid: true, data: { role, name: "พนักงาน 1" } });
  });

  it("refuses an existing storefront account like an unknown role", async () => {
    state.profile.role = "storefront";

    expect(await validate()).toMatchObject({ ok: true, valid: false, error: "PROFILE_NOT_FOUND" });
  });
});
