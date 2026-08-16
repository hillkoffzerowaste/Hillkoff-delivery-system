import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ db: null }));

vi.mock("../../lib/workflowAuth.js", () => ({
  requireProfile: async (_request, roles) => {
    if (!roles.includes("sales") || !roles.includes("admin")) throw new Error("role contract missing");
    return { profile: { uid: "sales-1", role: "sales", name: "ฝ่ายขายหนึ่ง", email: "sales@hillkoff.com" }, db: state.db };
  },
  errorResponse: (error) => Response.json({ ok: false, error: error.message }, { status: error.status || 500 })
}));
vi.mock("../../lib/deliverySheetSync.js", () => ({ syncDeliveryOrderToSheet: vi.fn(async () => {}) }));

function createDb(initialOrders) {
  const orders = new Map(Object.entries(initialOrders));
  const activity = [];
  const audits = [];
  const refFor = (id) => ({ id, collection: () => ({ doc: () => ({ kind: "activity", orderId: id }) }) });
  return {
    orders,
    activity,
    audits,
    collection(name) {
      if (name === "orders") return { doc: refFor };
      if (name === "audit_logs") return {
        doc: () => ({ kind: "audit" }),
        add: async () => { throw new Error("audit must be part of the order transaction"); }
      };
      throw new Error(`unexpected collection ${name}`);
    },
    async runTransaction(callback) {
      const writes = [];
      await callback({
        get: async (ref) => ({ exists: orders.has(ref.id), id: ref.id, ref, data: () => orders.get(ref.id) }),
        set: (ref, value) => writes.push({ ref, value })
      });
      writes.forEach(({ ref, value }) => {
        if (ref.kind === "activity") activity.push({ orderId: ref.orderId, ...value });
        else if (ref.kind === "audit") audits.push(value);
        else orders.set(ref.id, { ...orders.get(ref.id), ...value });
      });
    }
  };
}

async function post(selectedIds) {
  const route = await import("../../app/api/orders/chiangmai-complete/route.js").catch(() => ({}));
  if (typeof route.POST !== "function") return undefined;
  return route.POST(new Request("http://localhost/api/orders/chiangmai-complete", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: "Bearer test" },
    body: JSON.stringify({ selectedIds })
  }));
}

describe("sales Chiang Mai bulk completion route", () => {
  beforeEach(() => {
    state.db = createDb({
      A: { deliveryMethod: "company_driver", workflowType: "store_route", storeStatus: "checked", packStatus: "checked", queueStatus: "ready", driverId: "" },
      B: { deliveryMethod: "company_driver", workflowType: "store_route", storeStatus: "checked", packStatus: "checked", queueStatus: "preparing", driverId: "" }
    });
  });

  it("completes several checked and unqueued orders as one audited batch", async () => {
    const response = await post(["A", "B"]);
    expect(response?.status).toBe(200);
    expect(await response.json()).toMatchObject({ ok: true, data: { count: 2, completedIds: ["A", "B"] } });
    expect(state.db.orders.get("A")).toMatchObject({ status: "ส่งสำเร็จ", queueStatus: "completed", salesCompletedBy: "ฝ่ายขายหนึ่ง" });
    expect(state.db.activity).toHaveLength(2);
    expect(state.db.audits).toHaveLength(1);
  });

  it("rejects the whole selection when any order is no longer eligible", async () => {
    state.db.orders.set("B", { ...state.db.orders.get("B"), queueStatus: "queued" });
    const response = await post(["A", "B"]);
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ ok: false, blockingOrderIds: ["B"] });
    expect(state.db.orders.get("A").queueStatus).toBe("ready");
  });
});
