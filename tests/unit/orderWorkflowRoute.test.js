import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ db: null, role: "pack", name: "ผู้แพ็คหนึ่ง" }));

vi.mock("../../lib/workflowAuth.js", () => ({
  requireProfile: async (_request, roles) => {
    if (!roles.includes(state.role)) throw Object.assign(new Error("Forbidden"), { status: 403 });
    return { profile: { uid: "staff-1", role: state.role, name: state.name, email: "staff@hillkoff.com" }, db: state.db };
  },
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

async function handOver(orderId) {
  const { PATCH } = await import("../../app/api/orders/workflow/route.js");
  return PATCH(new Request("http://localhost/api/orders/workflow", {
    method: "PATCH",
    headers: { "Content-Type": "application/json", Authorization: "Bearer test" },
    body: JSON.stringify({ orderId, action: "grab_pickup" })
  }));
}

describe("pack confirmation driver queue workflow", () => {
  beforeEach(() => {
    state.role = "pack";
    state.name = "ผู้แพ็คหนึ่ง";
    state.db = createDb({
      DRIVER: { deliveryMethod: "company_driver", workflowType: "direct_pack", packStatus: "pending", queueStatus: "preparing", status: "รอจัดเตรียมสินค้า", workflowHistory: [] },
      ROUND: { deliveryMethod: "company_driver", workflowType: "direct_pack", packStatus: "pending", queueStatus: "preparing", chiangmaiRoundCode: "tuesday", workflowHistory: [] },
      STORE_PENDING: { deliveryMethod: "company_driver", workflowType: "store_route", storeStatus: "working", packStatus: "blocked", queueStatus: "preparing", status: "กำลังตรวจสินค้า", workflowHistory: [] },
      READY_PICKUP: { deliveryMethod: "grab_pickup", packStatus: "checked", queueStatus: "grab_ready", status: "แพ็คเสร็จ · รอ Grab รับสินค้า", workflowHistory: [] },
      PACK_WORKING: { deliveryMethod: "grab_pickup", packStatus: "working", queueStatus: "grab_ready", status: "กำลังแพ็ค", workflowHistory: [] },
      DRIVER_PICKUP: { deliveryMethod: "company_driver", packStatus: "checked", queueStatus: "grab_ready", status: "ห้ามมอบ", workflowHistory: [] }
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

  it("queues a scheduled Chiang Mai company-driver order as soon as Pack confirms it", async () => {
    const response = await patchOrder("ROUND", { packStatus: "checked", packCheckerName: "ผู้แพ็คหนึ่ง" });

    expect(response.status).toBe(200);
    expect(state.db.orders.get("ROUND")).toMatchObject({
      packStatus: "checked",
      queueStatus: "queued",
      status: "รอคนขับรับ",
      driverQueuePolicyVersion: 2
    });
  });

  it("lets Pack take over an unfinished Store check and queue the order after confirming it", async () => {
    const response = await patchOrder("STORE_PENDING", { packStatus: "checked", packCheckerName: "ผู้แพ็คหนึ่ง", packFromStore: true });

    expect(response.status).toBe(200);
    expect(state.db.orders.get("STORE_PENDING")).toMatchObject({
      storeStatus: "checked",
      storeCheckerName: "ผู้แพ็คหนึ่ง",
      storeCheckTakenOverBy: "ผู้แพ็คหนึ่ง",
      packStatus: "checked",
      queueStatus: "queued",
      status: "รอคนขับรับ"
    });
    expect(state.db.activity).toContainEqual(expect.objectContaining({ action: "pack_update", storeCheck: "taken_over_by_pack" }));
  });

  it("keeps the Store gate when Pack does not explicitly take over the check", async () => {
    const response = await patchOrder("STORE_PENDING", { packStatus: "checked", packCheckerName: "ผู้แพ็คหนึ่ง" });

    expect(response.status).toBe(409);
    expect(state.db.orders.get("STORE_PENDING").packStatus).toBe("blocked");
  });

  it("lets storefront staff hand over only a pack-ready pickup order", async () => {
    state.role = "storefront";
    state.name = "หน้าร้านหนึ่ง";

    const response = await handOver("READY_PICKUP");

    expect(response.status).toBe(200);
    expect(state.db.orders.get("READY_PICKUP")).toMatchObject({
      queueStatus: "grab_picked_up",
      status: "Grab รับสินค้าแล้ว",
      grabPickedUpBy: "หน้าร้านหนึ่ง"
    });
    expect(state.db.activity).toContainEqual(expect.objectContaining({ action: "grab_pickup", role: "storefront" }));
  });

  it.each(["PACK_WORKING", "DRIVER_PICKUP"])("rejects storefront handover when %s is not eligible", async (orderId) => {
    state.role = "storefront";

    const response = await handOver(orderId);

    expect(response.status).toBe(409);
    expect(state.db.orders.get(orderId).queueStatus).toBe("grab_ready");
  });
});
