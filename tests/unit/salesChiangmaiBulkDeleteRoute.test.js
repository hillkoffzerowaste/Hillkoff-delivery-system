import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ db: null }));

vi.mock("../../lib/workflowAuth.js", () => ({
  requireProfile: async (_request, roles) => {
    if (!roles.includes("sales") || !roles.includes("admin")) throw new Error("role contract missing");
    return { profile: { uid: "sales-1", role: "sales", name: "ฝ่ายขายหนึ่ง" }, db: state.db };
  },
  errorResponse: (error) => Response.json({ ok: false, error: error.message }, { status: error.status || 500 })
}));

function createDb(initialOrders) {
  const orders = new Map(Object.entries(initialOrders));
  const activities = new Map([...orders.keys()].map((id) => [id, [{ id: `activity-${id}`, value: { action: "created" } }]]));
  const audits = [];
  const orderRef = (id) => ({
    kind: "order",
    id,
    collection: () => ({
      limit: () => ({ get: async () => ({ docs: (activities.get(id) || []).map((item) => ({ ref: { kind: "activity", orderId: id, id: item.id } })) }) })
    })
  });
  const db = {
    orders,
    activities,
    audits,
    collection(name) {
      if (name === "orders") return { doc: orderRef };
      if (name === "booking_month_registry") return { doc: (id) => ({ kind: "registry", id }) };
      if (name === "audit_logs") return { doc: () => ({ kind: "audit", id: `audit-${audits.length + 1}` }) };
      throw new Error(`unexpected collection ${name}`);
    },
    async runTransaction(callback) {
      if (db.retryOnce) {
        await callback({
          get: async (ref) => ref.kind === "order"
            ? { exists: orders.has(ref.id), id: ref.id, ref, data: () => orders.get(ref.id) }
            : { exists: false, id: ref.id, ref, data: () => undefined },
          delete: () => {},
          set: () => {}
        });
        db.retryOnce = false;
      }
      const writes = [];
      await callback({
        get: async (ref) => {
          if (ref.kind === "order") return { exists: orders.has(ref.id), id: ref.id, ref, data: () => orders.get(ref.id) };
          return { exists: false, id: ref.id, ref, data: () => undefined };
        },
        delete: (ref) => writes.push({ type: "delete", ref }),
        set: (ref, value) => writes.push({ type: "set", ref, value })
      });
      writes.forEach(({ type, ref, value }) => {
        if (type === "set" && ref.kind === "audit") audits.push(value);
        if (type === "delete" && ref.kind === "order") orders.delete(ref.id);
        if (type === "delete" && ref.kind === "activity") activities.set(ref.orderId, (activities.get(ref.orderId) || []).filter((item) => item.id !== ref.id));
      });
    }
  };
  return db;
}

async function post(selectedIds) {
  const route = await import("../../app/api/orders/chiangmai-delete-bulk/route.js").catch(() => ({}));
  if (typeof route.POST !== "function") return undefined;
  return route.POST(new Request("http://localhost/api/orders/chiangmai-delete-bulk", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: "Bearer test" },
    body: JSON.stringify({ selectedIds })
  }));
}

describe("sales Chiang Mai bulk delete route", () => {
  beforeEach(() => {
    state.db = createDb({
      A: { deliveryMethod: "company_driver", workflowType: "store_route", queueStatus: "ready", driverId: "", status: "พร้อมส่งคนขับ", customerName: "A" },
      B: { deliveryMethod: "company_driver", workflowType: "store_route", queueStatus: "preparing", driverId: "", status: "รอห้องแพ็ค", customerName: "B" }
    });
  });

  it("deletes several eligible orders and their activity in one audited transaction", async () => {
    const response = await post(["A", "B"]);
    expect(response?.status).toBe(200);
    expect(await response.json()).toMatchObject({ ok: true, data: { count: 2, deletedIds: ["A", "B"] } });
    expect([...state.db.orders.keys()]).toEqual([]);
    expect(state.db.activities.get("A")).toEqual([]);
    expect(state.db.audits).toHaveLength(2);
    expect(state.db.audits[0]).toMatchObject({ action: "order_deleted_bulk", orderId: "A", orderSnapshot: { customerName: "A" } });
  });

  it("rejects the whole selection when one order has entered the driver queue", async () => {
    state.db.orders.set("B", { ...state.db.orders.get("B"), queueStatus: "queued", status: "รอคนขับรับ" });
    const response = await post(["A", "B"]);
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ ok: false, blockingOrderIds: ["B"] });
    expect([...state.db.orders.keys()]).toEqual(["A", "B"]);
    expect(state.db.audits).toHaveLength(0);
  });

  it("returns unique deletion results when Firestore retries the transaction callback", async () => {
    state.db.retryOnce = true;
    const response = await post(["A", "B"]);
    expect(await response.json()).toMatchObject({ ok: true, data: { count: 2, deletedIds: ["A", "B"] } });
  });
});
