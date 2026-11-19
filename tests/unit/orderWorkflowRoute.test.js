import { beforeEach, describe, expect, it, vi } from "vitest";
import { driverReworkPatch } from "../../lib/preparationWorkflow.js";

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

describe("pack confirmation driver queue workflow", () => {
  beforeEach(() => {
    state.role = "pack";
    state.name = "ผู้แพ็คหนึ่ง";
    state.db = createDb({
      DRIVER: { deliveryMethod: "company_driver", workflowType: "direct_pack", packStatus: "pending", queueStatus: "preparing", status: "รอจัดเตรียมสินค้า", workflowHistory: [] },
      ROUND: { deliveryMethod: "company_driver", workflowType: "direct_pack", packStatus: "pending", queueStatus: "preparing", chiangmaiRoundCode: "tuesday", workflowHistory: [] },
      STORE_PENDING: { deliveryMethod: "company_driver", workflowType: "store_route", storeStatus: "working", packStatus: "blocked", queueStatus: "preparing", status: "กำลังตรวจสินค้า", workflowHistory: [] },
      LEGACY_REWORK: {
        deliveryMethod: "company_driver", workflowType: "store_route", storeStatus: "checked", packStatus: "checked", queueStatus: "queued", status: "กำลังส่ง", driverId: "d1",
        ...driverReworkPatch({ workflowType: "store_route", driverId: "d1" }, { name: "คนขับ", driverId: "d1" }, "ของไม่ครบ"), workflowHistory: []
      },
      DIRECT_REWORK: {
        deliveryMethod: "company_driver", workflowType: "direct_pack", storeStatus: "skipped", packStatus: "checked", queueStatus: "queued", status: "กำลังส่ง", driverId: "d1",
        ...driverReworkPatch({ workflowType: "direct_pack", driverId: "d1" }, { name: "คนขับ", driverId: "d1" }, "ของไม่ครบ"), workflowHistory: []
      }
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

  it.each(["grab_pickup", "grab_pickup_legacy_close", "storefront_legacy_close"])("no longer supports the retired %s action", async (action) => {
    state.role = "sales";
    state.db = createDb({ OLD: { deliveryMethod: "grab_pickup", packStatus: "checked", queueStatus: "grab_ready", workflowHistory: [] } });
    const { PATCH } = await import("../../app/api/orders/workflow/route.js");
    const response = await PATCH(new Request("http://localhost/api/orders/workflow", {
      method: "PATCH",
      headers: { "Content-Type": "application/json", Authorization: "Bearer test" },
      body: JSON.stringify({ orderId: "OLD", action })
    }));

    expect(response.status).toBe(403);
    expect(state.db.orders.get("OLD").queueStatus).toBe("grab_ready");
  });

  it.each(["DRIVER", "STORE_PENDING"])("rejects sending %s back to the store", async (orderId) => {
    const before = state.db.orders.get(orderId);
    const response = await patchOrder(orderId, { packStatus: "returned", packCheckerName: "ผู้แพ็คหนึ่ง", packFromStore: true });

    expect(response.status).toBe(409);
    expect((await response.json()).error).toContain("ส่งกลับสโตร์ไม่ได้");
    expect(state.db.orders.get(orderId)).toBe(before);
  });

  it.each(["LEGACY_REWORK", "DIRECT_REWORK"])("lets Pack finish a reworked order (%s) as direct_pack", async (orderId) => {
    expect(state.db.orders.get(orderId).workflowType).toBe("direct_pack");

    const response = await patchOrder(orderId, { packStatus: "checked", packCheckerName: "ผู้แพ็คหนึ่ง" });

    expect(response.status).toBe(200);
    expect(state.db.orders.get(orderId)).toMatchObject({ reworkRequired: false, reworkStatus: "resolved", packStatus: "checked", queueStatus: "queued", status: "รอคนขับรับ" });
  });
});

describe("store_update after the store route was retired", () => {
  beforeEach(() => {
    state.role = "store";
    state.name = "สโตร์หนึ่ง";
    state.db = createDb({
      DIRECT: { deliveryMethod: "company_driver", workflowType: "direct_pack", storeStatus: "skipped", packStatus: "pending", queueStatus: "preparing", workflowHistory: [] },
      DRIVER_ONLY: { deliveryMethod: "company_driver", workflowType: "direct_driver", storeStatus: "skipped", packStatus: "skipped", queueStatus: "queued", workflowHistory: [] },
      LEGACY: { deliveryMethod: "company_driver", workflowType: "store_route", storeStatus: "working", packStatus: "blocked", queueStatus: "preparing", workflowHistory: [] }
    });
  });

  it.each(["DIRECT", "DRIVER_ONLY"])("rejects a store check on %s with 409", async (orderId) => {
    const before = state.db.orders.get(orderId);
    const response = await patchOrder(orderId, { action: "store_update", storeStatus: "checked", storeCheckerName: "สโตร์หนึ่ง" });

    expect(response.status).toBe(409);
    expect((await response.json()).error).toBe("ออเดอร์นี้ส่งตรงห้องแพ็ค สโตร์ไม่ต้องตรวจ");
    expect(state.db.orders.get(orderId)).toBe(before);
  });

  it("still lets the store finish a legacy store_route order", async () => {
    const response = await patchOrder("LEGACY", { action: "store_update", storeStatus: "checked", storeCheckerName: "สโตร์หนึ่ง" });

    expect(response.status).toBe(200);
    expect(state.db.orders.get("LEGACY")).toMatchObject({ storeStatus: "checked", packStatus: "pending" });
  });
});
