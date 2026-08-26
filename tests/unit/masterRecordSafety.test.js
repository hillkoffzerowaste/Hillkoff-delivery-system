import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ db: null, role: "sales" }));

vi.mock("../../lib/workflowAuth.js", () => ({
  requireProfile: async () => ({ profile: { uid: "u-1", role: state.role, email: "sales@hillkoff.com" }, db: state.db }),
  errorResponse: (error) => Response.json({ ok: false, error: error.message }, { status: error.status || 500 })
}));

const CREDENTIAL_FIELDS = ["passwordHash", "passwordSalt", "passwordHashVersion", "pinHash", "pinSalt", "trustedDeviceHashes", "trustedDevices"];

const DISABLED_DRIVER = {
  role: "driver",
  name: "คนขับหนึ่ง",
  phone: "0812345678",
  phoneDigits: "0812345678",
  driverId: "driver_0812345678",
  active: false,
  status: "disabled",
  passwordHash: "a".repeat(64),
  passwordSalt: "b".repeat(32),
  passwordHashVersion: "scrypt-v1",
  trustedDeviceHashes: ["c".repeat(64)],
  trustedDevices: []
};

function createDb(seed) {
  const docs = new Map(Object.entries(seed));
  const audits = [];
  return {
    docs,
    audits,
    collection: (name) => ({
      where: () => ({ limit: () => ({ get: async () => ({
        size: docs.size,
        docs: [...docs.entries()].map(([id, data]) => ({ id, data: () => data }))
      }) }) }),
      doc: (id) => ({
        get: async () => ({ exists: docs.has(id), data: () => docs.get(id) }),
        set: async (patch) => docs.set(id, { ...docs.get(id), ...patch })
      }),
      add: async (row) => { audits.push({ name, row }); }
    })
  };
}

async function call(method, body) {
  const mod = await import("../../app/api/driver-master/route.js");
  const request = new Request("http://localhost/api/driver-master", {
    method: method === "GET" ? "GET" : method,
    headers: { "Content-Type": "application/json", Authorization: "Bearer test" },
    ...(method === "GET" ? {} : { body: JSON.stringify(body) })
  });
  return mod[method](request);
}

describe("driver master record safety", () => {
  beforeEach(() => {
    state.role = "sales";
    state.db = createDb({ "0812345678": { ...DISABLED_DRIVER } });
  });

  it("never returns password hashes or trusted device hashes to sales/accounting", async () => {
    const response = await call("GET");
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json.data).toHaveLength(1);
    const serialized = JSON.stringify(json.data);
    for (const field of CREDENTIAL_FIELDS) {
      expect(json.data[0]).not.toHaveProperty(field);
      expect(serialized).not.toContain(field);
    }
    // ค่าแฮชจริงต้องไม่รั่วออกไปในรูปแบบใดเลย
    expect(serialized).not.toContain("a".repeat(64));
    expect(serialized).not.toContain("b".repeat(32));
  });

  it("still returns the fields the master screen needs", async () => {
    const json = await (await call("GET")).json();
    expect(json.data[0]).toMatchObject({
      id: "0812345678",
      name: "คนขับหนึ่ง",
      phoneDigits: "0812345678",
      driverId: "driver_0812345678",
      active: false,
      status: "disabled"
    });
  });

  it("does not re-enable a disabled driver when a PATCH omits active", async () => {
    const response = await call("PATCH", { phoneDigits: "0812345678", name: "คนขับหนึ่ง แก้ชื่อ" });

    expect(response.status).toBe(200);
    const stored = state.db.docs.get("0812345678");
    expect(stored.name).toBe("คนขับหนึ่ง แก้ชื่อ");
    expect(stored.active).toBe(false);
    expect(stored.status).toBe("disabled");
  });

  it("re-enables only when active is explicitly true", async () => {
    await call("PATCH", { phoneDigits: "0812345678", name: "คนขับหนึ่ง", active: true });
    expect(state.db.docs.get("0812345678")).toMatchObject({ active: true, status: "active" });
  });

  it("disables when active is explicitly false", async () => {
    state.db = createDb({ "0812345678": { ...DISABLED_DRIVER, active: true, status: "active" } });
    await call("PATCH", { phoneDigits: "0812345678", name: "คนขับหนึ่ง", active: false });
    expect(state.db.docs.get("0812345678")).toMatchObject({ active: false, status: "disabled" });
  });

  it("defaults a brand new driver to active", async () => {
    state.db = createDb({});
    await call("POST", { phoneDigits: "0899999999", phone: "0899999999", name: "คนขับใหม่" });
    expect(state.db.docs.get("0899999999")).toMatchObject({ active: true, status: "active" });
  });
});
