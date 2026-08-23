import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ db: null }));

vi.mock("../../lib/workflowAuth.js", () => ({
  requireProfile: async (_request, roles) => {
    if (!roles.includes("sales") || !roles.includes("admin")) throw new Error("role contract missing");
    return { profile: { uid: "sales-1", role: "sales", name: "ฝ่ายขายหนึ่ง" }, db: state.db };
  },
  errorResponse: (error) => Response.json({ ok: false, error: error.message, blockingOrderIds: error.blockingOrderIds }, { status: error.status || 500 })
}));
vi.mock("../../lib/deliverySheetSync.js", () => ({ syncDeliveryOrderToSheet: vi.fn(async () => {}) }));

function createDb(initialOrders) {
  const orders = new Map(Object.entries(initialOrders));
  const activities = [];
  const audits = [];
  const drivers = [
    { driverId: "driver-a", name: "คนขับเอ", role: "driver", active: true },
    { driverId: "driver-b", name: "คนขับบี", role: "driver", active: true }
  ];
  const orderRef = (id) => ({ id, kind: "order", collection: () => ({ doc: () => ({ kind: "activity", orderId: id }) }) });
  return {
    orders,
    activities,
    audits,
    collection(name) {
      if (name === "orders") return { doc: orderRef };
      if (name === "audit_logs") return { doc: () => ({ kind: "audit" }) };
      if (name === "users_by_phone") return { where: () => ({ get: async () => ({ docs: drivers.map((data, index) => ({ id: `driver-${index}`, data: () => data })) }) }) };
      throw new Error(`unexpected collection ${name}`);
    },
    async runTransaction(callback) {
      const writes = [];
      await callback({
        get: async (ref) => ({ exists: orders.has(ref.id), id: ref.id, ref, data: () => orders.get(ref.id) }),
        set: (ref, value) => writes.push({ ref, value })
      });
      writes.forEach(({ ref, value }) => {
        if (ref.kind === "activity") activities.push({ orderId: ref.orderId, ...value });
        else if (ref.kind === "audit") audits.push(value);
        else orders.set(ref.id, { ...orders.get(ref.id), ...value });
      });
    }
  };
}

async function post(items, reason = "ยืนยันกับคนขับแล้วว่าส่งถึงลูกค้า") {
  const route = await import("../../app/api/orders/manual-delivery-complete/route.js").catch(() => ({}));
  if (typeof route.POST !== "function") return undefined;
  return route.POST(new Request("http://localhost/api/orders/manual-delivery-complete", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: "Bearer test" },
    body: JSON.stringify({ items, reason })
  }));
}

describe("sales manual delivery completion route", () => {
  beforeEach(() => {
    state.db = createDb({
      A: { status: "กำลังส่ง", queueStatus: "queued", driverId: "driver-old", driverName: "คนขับเดิม" },
      B: { status: "กำลังจัดส่ง", queueStatus: "queued", driverId: "driver-old", driverName: "คนขับเดิม" }
    });
  });

  it("closes active deliveries in one audited transaction with each selected actual driver", async () => {
    const response = await post([{ orderId: "A", driverId: "driver-a" }, { orderId: "B", driverId: "driver-b" }]);

    expect(response?.status).toBe(200);
    expect(await response.json()).toMatchObject({ ok: true, data: { count: 2, completedIds: ["A", "B"] } });
    expect(state.db.orders.get("A")).toMatchObject({ status: "ส่งสำเร็จ", queueStatus: "completed", driverId: "driver-a", driverName: "คนขับเอ", previousDriverId: "driver-old" });
    expect(state.db.orders.get("B")).toMatchObject({ driverId: "driver-b", driverName: "คนขับบี" });
    expect(state.db.activities).toHaveLength(2);
    expect(state.db.audits).toHaveLength(1);
  });

  it("does not partially close jobs when one selected order was already completed", async () => {
    state.db.orders.set("B", { status: "ส่งสำเร็จ", queueStatus: "completed" });

    const response = await post([{ orderId: "A", driverId: "driver-a" }, { orderId: "B", driverId: "driver-b" }]);

    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ ok: false, blockingOrderIds: ["B"] });
    expect(state.db.orders.get("A")).toMatchObject({ status: "กำลังส่ง", queueStatus: "queued", driverId: "driver-old" });
    expect(state.db.activities).toHaveLength(0);
  });
});
