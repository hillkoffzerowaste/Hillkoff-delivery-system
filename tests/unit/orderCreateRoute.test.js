import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ db: null, role: "pack", now: "2026-10-09T03:00:00.000Z" }));

vi.mock("../../lib/workflowAuth.js", () => ({
  requireProfile: async () => ({
    profile: { uid: "pack-1", role: state.role, name: "ห้องแพ็คหนึ่ง", email: "pack@hillkoff.com", phone: "0812345678" },
    decoded: { uid: "pack-1" },
    db: state.db
  }),
  errorResponse: (error) => Response.json({ ok: false, error: error.message }, { status: error.status || 500 })
}));
vi.mock("../../lib/firebaseAdmin.js", () => ({ getAdminMessaging: () => ({ sendEachForMulticast: vi.fn(async () => ({ responses: [] })) }) }));
vi.mock("../../lib/lineOa.js", () => ({ pushLineText: vi.fn(async () => ({ ok: true })) }));
vi.mock("../../lib/deliverySheetSync.js", () => ({ scheduleDeliveryOrderSheetSync: vi.fn(() => Promise.resolve()) }));
vi.mock("../../lib/customerSearchCache.js", () => ({ bumpCustomerSearchIndexVersion: vi.fn(async () => {}) }));
vi.mock("../../lib/customerSearchIndex.js", () => ({
  customerSearchRecord: (customer) => ({ ...customer }),
  resolveCustomerRecord: (customer, indexed) => customer || indexed || null
}));

function createDb({ orders = {}, customers = {}, registries = {} } = {}) {
  const orderMap = new Map(Object.entries(orders));
  const customerMap = new Map(Object.entries(customers));
  const registryMap = new Map(Object.entries(registries));
  const searchMap = new Map();
  const activities = [];
  const notifications = [];

  const refFor = (kind, id) => ({
    kind,
    id,
    get: async () => {
      const source = kind === "order" ? orderMap : kind === "customer" ? customerMap : kind === "booking" ? registryMap : searchMap;
      return { exists: source.has(id), data: () => source.get(id), docs: [] };
    },
    collection: (name) => ({ doc: (childId = `activity-${activities.length + 1}`) => ({ kind: name === "activity" ? "activity" : name, id: childId, orderId: id }) })
  });

  const queryFor = (kind, field, value) => ({
    kind: "query",
    get: async () => {
      const source = kind === "orders" ? orderMap : kind === "push_tokens" ? new Map() : searchMap;
      const docs = [...source.entries()]
        .filter(([, item]) => field ? String(item?.[field] || "") === String(value || "") : true)
        .map(([id, item]) => ({ id, data: () => item }));
      return { docs, empty: docs.length === 0 };
    }
  });

  const readTarget = async (target) => target.kind === "query" ? target.get() : target.get();
  const applyPatch = (target, patch) => {
    const source = target.kind === "order" ? orderMap : target.kind === "booking" ? registryMap : searchMap;
    source.set(target.id, { ...(source.get(target.id) || {}), ...patch });
  };
  const db = {
    orders: orderMap,
    customers: customerMap,
    registries: registryMap,
    activities,
    notifications,
    collection(name) {
      if (name === "orders") return { doc: (id) => refFor("order", id), where: (field, _operator, value) => queryFor("orders", field, value) };
      if (name === "customers") return { doc: (id) => refFor("customer", id) };
      if (name === "customer_search") return { doc: (id) => refFor("search", id) };
      if (name === "booking_month_registry") return { doc: (id) => refFor("booking", id) };
      if (name === "push_tokens") return { where: () => ({ limit: () => ({ get: async () => ({ docs: [] }) }) }) };
      if (name === "notifications") return { add: async (data) => notifications.push(data) };
      throw new Error(`unexpected collection ${name}`);
    },
    async runTransaction(callback) {
      const writes = [];
      const transaction = {
        get: readTarget,
        create: (ref, data) => writes.push({ type: "create", ref, data }),
        set: (ref, data) => writes.push({ type: "set", ref, data }),
        update: (ref, patch) => writes.push({ type: "update", ref, patch }),
        delete: (ref) => writes.push({ type: "delete", ref })
      };
      const result = await callback(transaction);
      for (const write of writes) {
        if (write.ref.kind === "activity") {
          activities.push({ orderId: write.ref.orderId, ...write.data });
        } else if (write.type === "delete") {
          const source = write.ref.kind === "order" ? orderMap : registryMap;
          source.delete(write.ref.id);
        } else if (write.type === "create") {
          const source = write.ref.kind === "order" ? orderMap : registryMap;
          if (source.has(write.ref.id)) throw Object.assign(new Error("already exists"), { code: 6 });
          source.set(write.ref.id, write.data);
        } else if (write.ref.kind === "search") {
          searchMap.set(write.ref.id, { ...(searchMap.get(write.ref.id) || {}), ...write.data });
        } else {
          applyPatch(write.ref, write.type === "set" ? write.data : write.patch);
        }
      }
      return result;
    }
  };
  return db;
}

const customer = { name: "ร้านกาแฟเดิม", phone: "0800000000", zone: "เมืองเชียงใหม่", address: "ที่อยู่เดิม", mapUrl: "" };
const existingOrder = {
  id: "OLD-1",
  customerId: "customer-1",
  customerName: customer.name,
  serviceDate: "2026-10-09",
  createdAt: "2026-10-09T00:00:00.000Z",
  updatedAt: "2026-10-09T01:00:00.000Z",
  queueStatus: "queued",
  status: "รอคนขับรับ",
  packStatus: "pending",
  deliveryMethod: "company_driver",
  workflowType: "direct_pack",
  bookingNumber: "CSP-1111",
  bookingNumbers: ["CSP-1111"],
  bookingMonthKey: "2026-10",
  workflowHistory: [{ action: "created" }]
};

function orderInput(overrides = {}) {
  return {
    id: "NEW-1",
    serviceDate: "2026-10-09",
    customerId: "customer-1",
    boxes: 2,
    packageUnit: "box",
    paymentType: "COD",
    cod: 500,
    window: "รอจัดเตรียม 5 นาที",
    deliveryMethod: "company_driver",
    workflowType: "direct_pack",
    bookingNumbers: [],
    bookingMonthKey: "2026-10",
    salesNote: "งานใหม่",
    ...overrides
  };
}

async function postOrder(order) {
  const { POST } = await import("../../app/api/orders/create/route.js");
  return POST(new Request("http://localhost/api/orders/create", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: "Bearer test" },
    body: JSON.stringify({ order })
  }));
}

describe("pack duplicate handling in order creation", () => {
  beforeEach(() => {
    state.role = "pack";
    state.db = createDb({ customers: { "customer-1": customer } });
  });

  it("updates the eligible same-day order, requeues it, and returns the patch", async () => {
    state.db = createDb({
      customers: { "customer-1": customer },
      orders: { "OLD-1": existingOrder },
      registries: { "2026-10__CSP-1111": { source: "orders", sourceId: "OLD-1", bookingNumber: "CSP-1111" } }
    });
    const response = await postOrder(orderInput({ boxes: 7, bookingNumbers: ["CSP-2222"], salesNote: "แก้ไขล่าสุด" }));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json).toMatchObject({ ok: true, data: { id: "OLD-1", updatedExisting: true, boxes: 7, packStatus: "checked", queueStatus: "queued", status: "รอคนขับรับ", driverQueueDate: "2026-10-09" } });
    expect(state.db.orders.get("OLD-1")).toMatchObject({ id: "OLD-1", createdAt: existingOrder.createdAt, boxes: 7, salesNote: "แก้ไขล่าสุด", bookingNumber: "CSP-2222", packStatus: "checked", queueStatus: "queued", status: "รอคนขับรับ" });
    expect(state.db.registries.has("2026-10__CSP-1111")).toBe(false);
    expect(state.db.registries.get("2026-10__CSP-2222")).toMatchObject({ source: "orders", sourceId: "OLD-1" });
    expect(state.db.activities).toContainEqual(expect.objectContaining({ orderId: "OLD-1", action: "pack_assist_update", updatedExisting: true }));
  });

  it("rejects an accepted duplicate without changing the order or booking registry", async () => {
    const accepted = { ...existingOrder, driverId: "driver-1", acceptedAt: "2026-10-09T02:00:00.000Z", status: "กำลังส่ง" };
    state.db = createDb({
      customers: { "customer-1": customer },
      orders: { "OLD-1": accepted },
      registries: { "2026-10__CSP-1111": { source: "orders", sourceId: "OLD-1", bookingNumber: "CSP-1111" } }
    });
    const before = structuredClone(accepted);
    const beforeRegistry = structuredClone(state.db.registries.get("2026-10__CSP-1111"));
    const response = await postOrder(orderInput({ bookingNumbers: ["CSP-9999"] }));
    const json = await response.json();

    expect(response.status).toBe(409);
    expect(json.error).toMatch(/ออเดอร์ซ้ำ.*คนขับรับ/);
    expect(state.db.orders.get("OLD-1")).toEqual(before);
    expect(state.db.registries.get("2026-10__CSP-1111")).toEqual(beforeRegistry);
    expect(state.db.registries.has("2026-10__CSP-9999")).toBe(false);
  });

  it("creates a new order when the existing order is from another service date", async () => {
    state.db = createDb({ customers: { "customer-1": customer }, orders: { "OLD-1": { ...existingOrder, serviceDate: "2026-10-08" } } });
    const response = await postOrder(orderInput({ id: "NEW-2", serviceDate: "2026-10-09" }));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json).toMatchObject({ ok: true, data: { id: "NEW-2" } });
    expect(state.db.orders.has("OLD-1")).toBe(true);
    expect(state.db.orders.get("NEW-2")).toMatchObject({ serviceDate: "2026-10-09", customerId: "customer-1" });
  });

  it("does not partially update an existing duplicate when its new booking is already owned", async () => {
    state.db = createDb({
      customers: { "customer-1": customer },
      orders: { "OLD-1": existingOrder, "OTHER": { id: "OTHER", customerId: "customer-2" } },
      registries: { "2026-10__CSP-3333": { source: "orders", sourceId: "OTHER", bookingNumber: "CSP-3333" } }
    });
    const before = structuredClone(existingOrder);
    const response = await postOrder(orderInput({ boxes: 9, bookingNumbers: ["CSP-3333"] }));

    expect(response.status).toBe(409);
    expect((await response.json()).error).toMatch(/เลขที่ใบสั่งจอง/);
    expect(state.db.orders.get("OLD-1")).toEqual(before);
  });

  it("keeps the normal Pack direct-order create path", async () => {
    const response = await postOrder(orderInput({ id: "PACK-NEW", customerId: "customer-1", serviceDate: "2026-10-09" }));

    expect(response.status).toBe(200);
    expect((await response.json()).data).toMatchObject({ id: "PACK-NEW" });
    expect(state.db.orders.get("PACK-NEW")).toMatchObject({ orderEntrySource: "pack_assist", workflowType: "direct_pack" });
  });
});
