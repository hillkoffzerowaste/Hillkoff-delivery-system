import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ role: "storefront", orders: [] }));

vi.mock("../../lib/workflowAuth.js", () => ({
  requireProfile: async (_request, roles) => {
    if (!roles.includes(state.role)) throw Object.assign(new Error("Forbidden"), { status: 403 });
    return { profile: { uid: "front-1", role: state.role }, db: createDb(state.orders) };
  },
  errorResponse: (error) => Response.json({ ok: false, error: error.message }, { status: error.status || 500 })
}));

function createDb(orders) {
  return {
    collection(name) {
      if (name !== "orders") throw new Error(`unexpected collection ${name}`);
      const makeQuery = (rows) => ({
        where: (field, op, value) => makeQuery(op === "==" ? rows.filter((row) => row[field] === value) : rows),
        orderBy: () => makeQuery(rows),
        limit: (count) => ({
          get: async () => ({ docs: rows.slice(0, count).map((data) => ({ id: data.id, data: () => data })) })
        })
      });
      return makeQuery(orders);
    }
  };
}

describe("storefront order read route", () => {
  beforeEach(() => {
    state.role = "storefront";
    state.orders = [
      { id: "GRAB-1", deliveryMethod: "grab_pickup", queueStatus: "grab_ready", packStatus: "checked", customerName: "Grab ลูกค้า", internalNote: "secret" },
      { id: "PICKUP-1", deliveryMethod: "customer_pickup", queueStatus: "preparing", packStatus: "working", customerName: "รับหน้าร้าน" },
      { id: "DRIVER-1", deliveryMethod: "company_driver", queueStatus: "queued", customerName: "ห้ามเห็น" }
    ];
  });

  it("returns only the restricted pickup DTO for a storefront session", async () => {
    const { GET } = await import("../../app/api/orders/storefront/route.js");
    const response = await GET(new Request("http://localhost/api/orders/storefront", { headers: { Authorization: "Bearer test" } }));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.data).toHaveLength(2);
    expect(json.data.map((order) => order.id)).toEqual(["GRAB-1", "PICKUP-1"]);
    expect(json.data[0]).not.toHaveProperty("internalNote");
  });

  it("rejects a non-storefront caller", async () => {
    state.role = "sales";
    const { GET } = await import("../../app/api/orders/storefront/route.js");
    const response = await GET(new Request("http://localhost/api/orders/storefront", { headers: { Authorization: "Bearer test" } }));

    expect(response.status).toBe(403);
  });

  it("filters by service date and keeps more than the legacy 250-row ceiling visible", async () => {
    state.orders = Array.from({ length: 300 }, (_, index) => ({
      id: `TODAY-${index}`,
      deliveryMethod: "customer_pickup",
      serviceDate: "2026-09-29",
      queueStatus: "preparing"
    })).concat({ id: "OTHER-DAY", deliveryMethod: "customer_pickup", serviceDate: "2026-09-28", queueStatus: "preparing" });

    const { GET } = await import("../../app/api/orders/storefront/route.js");
    const response = await GET(new Request("http://localhost/api/orders/storefront?date=2026-09-29", { headers: { Authorization: "Bearer test" } }));
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.data).toHaveLength(300);
    expect(json.data.every((order) => order.serviceDate === "2026-09-29")).toBe(true);
    expect(json.hasMore).toBe(false);
  });
});
