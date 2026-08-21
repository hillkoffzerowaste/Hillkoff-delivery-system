import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ db: null }));

vi.mock("../../lib/workflowAuth.js", () => ({
  requireProfile: async () => ({ profile: { uid: "pack-1", role: "pack", name: "ผู้แพ็คหนึ่ง", email: "pack@hillkoff.com" }, db: state.db }),
  errorResponse: (error) => Response.json({ ok: false, error: error.message }, { status: error.status || 500 })
}));
vi.mock("../../lib/deliverySheetSync.js", () => ({ syncDeliveryOrderToSheet: vi.fn(async () => {}) }));
vi.mock("../../lib/firebaseAdmin.js", () => ({ getAdminMessaging: () => ({ sendEachForMulticast: vi.fn(async () => {}) }) }));

function createDb(initialOrders) {
  const orders = new Map(Object.entries(initialOrders));
  const activity = [];
  const refFor = (id) => ({
    id,
    kind: "order",
    get: async () => ({ exists: orders.has(id), updateTime: "test-update-time", data: () => orders.get(id) }),
    collection: () => ({ doc: () => ({ kind: "activity", orderId: id }) })
  });
  return {
    orders,
    activity,
    collection(name) {
      if (name === "orders") return { doc: refFor };
      if (name === "push_tokens") return { where: () => ({ limit: () => ({ get: async () => ({ docs: [] }) }) }) };
      throw new Error(`unexpected collection ${name}`);
    },
    batch() {
      const writes = [];
      return {
        update: (ref, patch) => writes.push({ type: "update", ref, patch }),
        set: (ref, data) => writes.push({ type: "set", ref, data }),
        commit: async () => writes.forEach((write) => {
          if (write.ref.kind === "activity") activity.push({ orderId: write.ref.orderId, ...write.data });
          else orders.set(write.ref.id, { ...orders.get(write.ref.id), ...write.patch });
        })
      };
    }
  };
}

async function patchOrder(orderId, body) {
  const { PATCH } = await import("../../app/api/orders/workflow/route.js");
  return PATCH(new Request("http://localhost/api/orders/workflow", {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Authorization: "Bearer test" },
    body: JSON.stringify({ orderId, action: "pack_update", ...body })
  }));
}

describe("pack confirmation driver queue workflow", () => {
  beforeEach(() => {
    state.db = createDb({
      DRIVER: { deliveryMethod: "company_driver", workflowType: "direct_pack", packStatus: "pending", queueStatus: "preparing", status: "รอจัดเตรียมสินค้า", workflowHistory: [] },
      ROUND: { deliveryMethod: "company_driver", workflowType: "direct_pack", packStatus: "pending", queueStatus: "preparing", chiangmaiRoundCode: "tuesday", workflowHistory: [] }
    });
  });

  it("queues a normal company-driver order as soon as Pack confirms it", async () => {
    const response = await patchOrder("DRIVER", { packStatus: "checked", packCheckerName: "ผู้แพ็คหนึ่ง" });

    expect(response.status).toBe(200);
    expect(state.db.orders.get("DRIVER")).toMatchObject({
      packStatus: "checked",
      queueStatus: "queued",
      status: "รอคนขับรับ",
      queuedBy: "ผู้แพ็คหนึ่ง",
      driverQueuePolicyVersion: 2
    });
    expect(state.db.activity).toContainEqual(expect.objectContaining({ action: "pack_update", driverQueue: "queued_automatically" }));
  });

  it("keeps scheduled Chiang Mai rounds out of the immediate driver queue", async () => {
    const response = await patchOrder("ROUND", { packStatus: "checked", packCheckerName: "ผู้แพ็คหนึ่ง" });

    expect(response.status).toBe(200);
    expect(state.db.orders.get("ROUND")).toMatchObject({ packStatus: "checked", queueStatus: "ready" });
  });
});
