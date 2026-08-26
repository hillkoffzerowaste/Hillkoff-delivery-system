import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ db: null }));

vi.mock("../../lib/workflowAuth.js", () => ({
  requireProfile: async () => ({ profile: { uid: "admin-1", role: "admin" }, db: state.db }),
  errorResponse: (error) => Response.json({ ok: false, error: error.message }, { status: error.status || 500 })
}));

function createDb(registry) {
  const docs = new Map(Object.entries(registry));
  const deleted = [];
  const recursiveDeletes = [];
  return {
    docs,
    deleted,
    recursiveDeletes,
    collection: (name) => ({
      name,
      count: () => ({ get: async () => ({ data: () => ({ count: 3 }) }) }),
      get: async () => ({
        docs: [...docs.entries()].map(([id, data]) => ({ id, ref: { id, name }, data: () => data }))
      })
    }),
    recursiveDelete: async (ref) => { recursiveDeletes.push(ref.name); },
    batch: () => {
      const ops = [];
      return {
        delete: (ref) => ops.push({ type: "delete", id: ref.id }),
        update: (ref, patch) => ops.push({ type: "update", id: ref.id, patch }),
        commit: async () => ops.forEach((op) => {
          if (op.type === "delete") { docs.delete(op.id); deleted.push(op.id); }
          else docs.set(op.id, { ...docs.get(op.id), ...op.patch });
        })
      };
    }
  };
}

async function reset(body) {
  const { POST } = await import("../../app/api/admin/reset-orders/route.js");
  return POST(new Request("http://localhost/api/admin/reset-orders", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: "Bearer test" },
    body: JSON.stringify(body)
  }));
}

describe("admin reset-orders booking cleanup", () => {
  beforeEach(() => {
    state.db = createDb({
      "2026-08__CSP-0001": { source: "orders", sourceId: "DO-1", bookingNumber: "CSP-0001" },
      "2026-08__CSP-0002": { source: "order", sourceId: "DO-2", bookingNumber: "CSP-0002" },
      "2026-08__CSP-0003": { source: "store_reports", sourceId: "rep-1", bookingNumber: "CSP-0003", sharedWithOrderIds: ["DO-3"] },
      "2026-08__CSP-0004": { source: "store_reports", sourceId: "rep-2", bookingNumber: "CSP-0004", sharedWithOrderIds: [] }
    });
  });

  it("requires the confirmation phrase and changes nothing without it", async () => {
    const response = await reset({});
    expect(response.status).toBe(400);
    expect(state.db.recursiveDeletes).toHaveLength(0);
    expect(state.db.docs.size).toBe(4);
  });

  it("releases order-owned reservations, including the legacy singular source", async () => {
    const response = await reset({ confirm: "YES_DELETE_ALL_ORDERS" });
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(state.db.recursiveDeletes).toEqual(["orders"]);
    expect(json).toMatchObject({ ok: true, releasedBookingNumbers: 2, clearedSharedLinks: 1 });
    expect(state.db.docs.has("2026-08__CSP-0001")).toBe(false);
    expect(state.db.docs.has("2026-08__CSP-0002")).toBe(false);
  });

  it("keeps store report reservations but drops borrow links to now-deleted orders", async () => {
    await reset({ confirm: "YES_DELETE_ALL_ORDERS" });

    expect(state.db.docs.get("2026-08__CSP-0003")).toMatchObject({ source: "store_reports", sharedWithOrderIds: [] });
    expect(state.db.docs.get("2026-08__CSP-0004")).toMatchObject({ source: "store_reports", sharedWithOrderIds: [] });
  });
});
