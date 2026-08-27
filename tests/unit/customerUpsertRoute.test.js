import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ db: null }));

vi.mock("../../lib/workflowAuth.js", () => ({
  requireProfile: async (_request, roles) => {
    if (!roles.includes("sales")) throw new Error("role contract missing");
    return { profile: { uid: "sales-1", role: "sales", name: "ฝ่ายขายหนึ่ง", email: "sales@hillkoff.com" }, db: state.db };
  },
  errorResponse: (error) => Response.json({ ok: false, error: error.message }, { status: error.status || 500 })
}));
vi.mock("../../lib/customerSearchCache.js", () => ({ bumpCustomerSearchIndexVersion: vi.fn(async () => {}) }));

function createDb(initialCustomers) {
  const customers = new Map(Object.entries(initialCustomers));
  const search = new Map(Object.entries(initialCustomers).map(([id, customer]) => [id, {
    nameKey: String(customer.name || "").toLowerCase().replace(/\s+/g, ""),
    phoneDigits: String(customer.phone || "").replace(/\D/g, ""),
    terms: []
  }]));
  const store = (name) => (name === "customers" ? customers : search);
  const collection = (name) => ({
    doc: (id) => ({ kind: name, id }),
    where: (field, _op, value) => ({ limit: () => ({ kind: "query", collection: name, field, value }) })
  });
  return {
    customers,
    search,
    collection,
    async runTransaction(callback) {
      const writes = [];
      await callback({
        get: async (target) => {
          if (target.kind === "query") {
            const rows = Array.from(store(target.collection).entries())
              .filter(([, data]) => (target.field === "terms"
                ? (data.terms || []).includes(target.value)
                : data[target.field] === target.value));
            return { docs: rows.map(([id]) => ({ id })) };
          }
          const data = store(target.kind).get(target.id);
          return { exists: data !== undefined, id: target.id, data: () => data };
        },
        set: (ref, value) => writes.push({ ref, value })
      });
      writes.forEach(({ ref, value }) => store(ref.kind).set(ref.id, { ...store(ref.kind).get(ref.id), ...value }));
    }
  };
}

async function post(customer) {
  const route = await import("../../app/api/customers/upsert/route.js");
  return route.POST(new Request("http://localhost/api/customers/upsert", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: "Bearer test" },
    body: JSON.stringify({ customer })
  }));
}

describe("customer upsert route", () => {
  beforeEach(() => {
    state.db = createDb({
      "cus-1": { name: "ร้านกาแฟดอย", phone: "0812345678", address: "เดิม" },
      "cus-legacy": { name: "ร้านกาแฟดอย", phone: "0812345678", address: "ซ้ำค้างระบบ" },
      "cus-2": { name: "ร้านชาเขียว", phone: "0899999999", address: "อีกร้าน" }
    });
  });

  it("saves an edit to a customer that already has a duplicate left in the database", async () => {
    const response = await post({ id: "cus-1", name: "ร้านกาแฟดอย", phone: "0812345678", address: "ที่อยู่ใหม่" });
    expect(response.status).toBe(200);
    expect(state.db.customers.get("cus-1")).toMatchObject({ address: "ที่อยู่ใหม่", updatedByUid: "sales-1" });
  });

  it("still blocks an edit that renames a customer onto another existing customer", async () => {
    const response = await post({ id: "cus-1", name: "ร้านชาเขียว", phone: "0812345678", address: "เดิม" });
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ ok: false, data: { duplicateId: "cus-2", duplicateField: "ชื่อลูกค้า" } });
    expect(state.db.customers.get("cus-1").name).toBe("ร้านกาแฟดอย");
  });

  it("blocks a brand new customer that reuses an existing phone number", async () => {
    const response = await post({ id: "cus-new", name: "ร้านใหม่", phone: "0899999999" });
    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({ data: { duplicateId: "cus-2", duplicateField: "เบอร์โทร" } });
  });
});
