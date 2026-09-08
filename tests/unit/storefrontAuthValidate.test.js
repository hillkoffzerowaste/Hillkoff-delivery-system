import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ profile: null }));

vi.mock("../../lib/firebaseAdmin.js", () => ({
  getAdminAuth: () => ({ verifyIdToken: async () => ({ uid: "front-1", email: "front01@staff.hillkoff.local" }) }),
  getAdminDb: () => ({
    collection(name) {
      if (name === "users") return { doc: () => ({ get: async () => ({ exists: true, data: () => state.profile }) }) };
      if (name === "users_by_phone") return { where: () => ({ limit: () => ({ get: async () => ({ docs: [] }) }) }) };
      throw new Error(`unexpected collection ${name}`);
    }
  })
}));

describe("storefront auth validation", () => {
  beforeEach(() => {
    state.profile = { uid: "front-1", role: "storefront", active: true, status: "approved", name: "หน้าร้าน 1" };
  });

  it("recognizes an active storefront staff session", async () => {
    const { POST } = await import("../../app/api/auth/validate/route.js");
    const response = await POST(new Request("http://localhost/api/auth/validate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ idToken: "test" })
    }));
    const json = await response.json();

    expect(json).toMatchObject({ valid: true, data: { role: "storefront", name: "หน้าร้าน 1" } });
  });
});
