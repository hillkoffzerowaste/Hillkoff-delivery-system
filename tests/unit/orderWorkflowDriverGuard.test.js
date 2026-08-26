import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ db: null, profile: null }));

vi.mock("../../lib/workflowAuth.js", () => ({
  requireProfile: async () => ({ profile: state.profile, db: state.db }),
  errorResponse: (error) => Response.json({ ok: false, error: error.message }, { status: error.status || 500 })
}));
vi.mock("../../lib/deliverySheetSync.js", () => ({ syncDeliveryOrderToSheet: vi.fn(async () => {}) }));
vi.mock("../../lib/firebaseAdmin.js", () => ({ getAdminMessaging: () => ({ sendEachForMulticast: vi.fn(async () => {}) }) }));
vi.mock("../../lib/operationsReporting.js", async (importOriginal) => ({
  ...(await importOriginal()),
  resolveDeliveryVehicleSnapshot: async () => ({})
}));

function createDb(initialOrders) {
  const orders = new Map(Object.entries(initialOrders));
  const refFor = (id) => ({
    id,
    kind: "order",
    get: async () => ({ exists: orders.has(id), updateTime: "test-update-time", data: () => orders.get(id) }),
    collection: () => ({ doc: () => ({ kind: "activity", orderId: id }) })
  });
  return {
    orders,
    collection(name) {
      if (name === "orders") return { doc: refFor };
      if (name === "push_tokens") return { where: () => ({ limit: () => ({ get: async () => ({ docs: [] }) }) }) };
      throw new Error(`unexpected collection ${name}`);
    },
    batch() {
      const writes = [];
      return {
        update: (ref, patch) => writes.push({ ref, patch }),
        set: () => {},
        commit: async () => writes.forEach((write) => orders.set(write.ref.id, { ...orders.get(write.ref.id), ...write.patch }))
      };
    }
  };
}

async function patchOrder(body) {
  const { PATCH } = await import("../../app/api/orders/workflow/route.js");
  return PATCH(new Request("http://localhost/api/orders/workflow", {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Authorization: "Bearer test" },
    body: JSON.stringify(body)
  }));
}

describe("driver workflow ownership guard", () => {
  beforeEach(() => {
    state.db = createDb({
      // งานที่ฝ่ายขายปิดเองผ่าน chiangmai-complete: สำเร็จแล้วและไม่มีคนขับถืออยู่
      SALES_CLOSED: { status: "ส่งสำเร็จ", queueStatus: "completed", driverId: "", deliveryMethod: "company_driver", salesCompletedBy: "ฝ่ายขายหนึ่ง", workflowHistory: [] },
      ASSIGNED: { status: "กำลังส่ง", queueStatus: "queued", driverId: "driver-1", deliveryMethod: "company_driver", workflowHistory: [] }
    });
  });

  it("rejects a driver whose profile has no driverId from completing an unassigned order", async () => {
    state.profile = { uid: "u-nodriverid", role: "driver", name: "คนขับไม่มีรหัส", email: "", driverId: "" };

    const response = await patchOrder({ orderId: "SALES_CLOSED", action: "driver_complete" });

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({ ok: false });
    expect(state.db.orders.get("SALES_CLOSED")).toMatchObject({
      status: "ส่งสำเร็จ",
      driverId: "",
      salesCompletedBy: "ฝ่ายขายหนึ่ง"
    });
    expect(state.db.orders.get("SALES_CLOSED").deliveryAttemptNumber).toBeUndefined();
  });

  it("rejects a driver acting on an order assigned to someone else", async () => {
    state.profile = { uid: "u-2", role: "driver", name: "คนขับสอง", email: "", driverId: "driver-2" };

    const response = await patchOrder({ orderId: "ASSIGNED", action: "driver_complete" });

    expect(response.status).toBe(403);
    expect(state.db.orders.get("ASSIGNED")).toMatchObject({ status: "กำลังส่ง" });
  });

  it("still lets the assigned driver complete their own order", async () => {
    state.profile = { uid: "u-1", role: "driver", name: "คนขับหนึ่ง", email: "", driverId: "driver-1" };

    const response = await patchOrder({ orderId: "ASSIGNED", action: "driver_complete", podPhotoCount: 2 });

    expect(response.status).toBe(200);
    expect(state.db.orders.get("ASSIGNED")).toMatchObject({
      status: "ส่งสำเร็จ",
      queueStatus: "completed",
      deliveryCompleteness: "complete",
      podPhotoCount: 2
    });
  });
});
