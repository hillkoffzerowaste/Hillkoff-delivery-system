import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ writes: [] }));
vi.mock("../../lib/workflowAuth.js", () => {
  const ref = (id) => ({ id, collection: () => ({ doc: () => ref("history") }) });
  const db = {
    collection: () => ({ doc: () => ref("r1") }),
    runTransaction: async (fn) => fn({ get: async () => ({ exists: false }), set: (r, data) => state.writes.push({ id: r.id, data }), create: () => {}, update: () => {} })
  };
  return {
    requireProfile: async () => ({ profile: { role: "store", uid: "shared", name: "store" }, db }),
    errorResponse: (e) => Response.json({ ok: false, error: e.message }, { status: e.status || 500 })
  };
});

const post = (body) => new Request("http://localhost/api/store/reports", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
const rows = [{ detail: "ออนไลน์ 1 กล่อง" }];

beforeEach(() => { state.writes = []; });

describe("creating store reports", () => {
  it("refuses confirmed reports without a store checker name so the shared account is never the only record", async () => {
    const { POST } = await import("../../app/api/store/reports/route.js");
    const res = await POST(post({ type: "online", rows }));
    expect(res.status).toBe(400);
    expect(state.writes).toEqual([]);
  });

  it("records the checker name on reports confirmed at creation", async () => {
    const { POST } = await import("../../app/api/store/reports/route.js");
    const res = await POST(post({ type: "online", rows, checkerName: "ณัฐ" }));
    expect(res.status).toBe(200);
    const report = state.writes.find((w) => w.id === "r1").data;
    expect(report).toMatchObject({ storeCheckerName: "ณัฐ", confirmedAt: expect.any(String) });
    expect(report.workflowHistory[0].checkerName).toBe("ณัฐ");
    expect(state.writes.find((w) => w.id === "history").data.checkerName).toBe("ณัฐ");
  });

  it("still lets drafts be saved without a name until they are confirmed", async () => {
    const { POST } = await import("../../app/api/store/reports/route.js");
    const res = await POST(post({ type: "online", rows, draft: true }));
    expect(res.status).toBe(200);
    expect(state.writes.find((w) => w.id === "r1").data).toMatchObject({ confirmedAt: "" });
    expect(state.writes.find((w) => w.id === "r1").data.storeCheckerName).toBeUndefined();
  });
});
