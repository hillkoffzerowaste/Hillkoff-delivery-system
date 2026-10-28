import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getDefaultStoreSettings } from "../../lib/storeSettings.js";

const state = vi.hoisted(() => ({ db: null, role: "store" }));

vi.mock("../../lib/workflowAuth.js", () => ({
  requireProfile: async (_request, roles) => {
    if (!roles.includes(state.role)) throw Object.assign(new Error("Forbidden"), { status: 403 });
    return { profile: { uid: `${state.role}-1`, role: state.role, name: "สโตร์หนึ่ง", email: "s@hillkoff.com" }, db: state.db };
  },
  errorResponse: (error) => Response.json({ ok: false, error: error.message }, { status: error.status || 500 })
}));

function createDb({ settings, transfers = [], audits = [] } = {}) {
  const docs = new Map();
  if (settings) docs.set("store_settings/default", settings);
  const rows = { store_transfers: transfers, store_audits: audits };
  const writes = [];
  const db = {
    docs,
    writes,
    collection: (name) => ({
      doc: (id) => ({ kind: "doc", path: `${name}/${id}`, get: async () => ({ exists: docs.has(`${name}/${id}`), data: () => docs.get(`${name}/${id}`) }) }),
      where: (field, _op, value) => ({ limit: (max) => ({ kind: "query", collection: name, field, value, max }) })
    }),
    async runTransaction(callback) {
      const pending = [];
      const result = await callback({
        get: async (target) => {
          if (target.kind === "query") {
            const matches = rows[target.collection].filter((row) => row[target.field] === target.value).slice(0, target.max);
            return { docs: matches.map((data) => ({ data: () => data })) };
          }
          return { exists: docs.has(target.path), data: () => docs.get(target.path) };
        },
        set: (ref, value) => pending.push({ path: ref.path, value })
      });
      pending.forEach(({ path, value }) => {
        docs.set(path, value);
        writes.push(path);
      });
      return result;
    }
  };
  return db;
}

const savedSettings = (overrides = {}) => ({
  ...getDefaultStoreSettings(),
  branches: [{ code: "WH", name: "คลังหลัก", type: "คลังสินค้า", active: true }],
  updatedAt: "2026-10-27T01:00:00.000Z",
  updatedBy: "คนเดิม",
  updatedByUid: "store-9",
  ...overrides
});

async function call(method, body) {
  const route = await import("../../app/api/store/settings/route.js");
  const init = { method, headers: { "Content-Type": "application/json", Authorization: "Bearer test" } };
  if (body !== undefined) init.body = JSON.stringify(body);
  return route[method](new Request("http://localhost/api/store/settings", init));
}

const draftFrom = (settings) => {
  const { updatedAt, updatedBy, updatedByUid, ...rest } = settings;
  void updatedAt; void updatedBy; void updatedByUid;
  return structuredClone(rest);
};

describe("store settings route", () => {
  beforeEach(() => {
    vi.resetModules();
    state.role = "store";
    state.db = createDb({ settings: savedSettings() });
  });
  afterEach(() => vi.unstubAllEnvs());

  describe("GET", () => {
    it("returns defaults with empty updatedAt when no document exists", async () => {
      state.db = createDb();
      const response = await call("GET");
      expect(response.status).toBe(200);
      const json = await response.json();
      expect(json.ok).toBe(true);
      expect(json.data.updatedAt).toBe("");
      expect(json.data.settings.modules.map((m) => m.id)).toHaveLength(6);
      expect(json.data.settings.branches).toEqual([]);
    });

    it("returns the stored settings with updatedAt", async () => {
      const json = await (await call("GET")).json();
      expect(json.data.updatedAt).toBe("2026-10-27T01:00:00.000Z");
      expect(json.data.settings.branches[0].code).toBe("WH");
    });

    it.each(["store", "pack", "admin"])("allows role %s", async (role) => {
      state.role = role;
      expect((await call("GET")).status).toBe(200);
    });

    it("rejects other roles", async () => {
      state.role = "sales";
      expect((await call("GET")).status).toBe(403);
    });
  });

  describe("POST unlock", () => {
    it("accepts the right PIN", async () => {
      const response = await call("POST", { pin: "2532" });
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({ ok: true });
    });

    it("rejects a wrong PIN with 403", async () => {
      const response = await call("POST", { pin: "0000" });
      expect(response.status).toBe(403);
      expect((await response.json()).error).toBe("รหัส PIN ไม่ถูกต้อง");
    });

    it("rejects a missing PIN with 403", async () => {
      expect((await call("POST", {})).status).toBe(403);
    });

    it("rejects pack with 403", async () => {
      state.role = "pack";
      expect((await call("POST", { pin: "2532" })).status).toBe(403);
    });

    it("answers 429 once the PIN was wrong too many times, even for the right PIN", async () => {
      const statuses = [];
      for (let i = 0; i < 5; i += 1) statuses.push((await call("POST", { pin: "1111" })).status);
      expect(statuses.slice(0, 4)).toEqual([403, 403, 403, 403]);
      expect(statuses[4]).toBe(429);
      const locked = await call("POST", { pin: "2532" });
      expect(locked.status).toBe(429);
      expect((await locked.json()).error).toBe("ใส่รหัส PIN ผิดหลายครั้ง กรุณารอสักครู่แล้วลองใหม่");
    });

    it("uses STORE_SETTINGS_PIN when it is set", async () => {
      vi.stubEnv("STORE_SETTINGS_PIN", "9876");
      expect((await call("POST", { pin: "2532" })).status).toBe(403);
      expect((await call("POST", { pin: "9876" })).status).toBe(200);
    });
  });

  describe("PUT", () => {
    const body = (patch = {}) => {
      const settings = draftFrom(savedSettings());
      settings.header.company = "HILLKOFF สาขาใหม่";
      return { pin: "2532", baseUpdatedAt: "2026-10-27T01:00:00.000Z", settings, ...patch };
    };

    it("saves with the right PIN and stores audit fields but never the PIN", async () => {
      const response = await call("PUT", body());
      expect(response.status).toBe(200);
      const json = await response.json();
      const stored = state.db.docs.get("store_settings/default");
      expect(stored.header.company).toBe("HILLKOFF สาขาใหม่");
      expect(stored.updatedBy).toBe("สโตร์หนึ่ง");
      expect(stored.updatedByUid).toBe("store-1");
      expect(stored.updatedAt).toBe(json.data.updatedAt);
      expect(json.data.settings.header.company).toBe("HILLKOFF สาขาใหม่");
      expect(JSON.stringify(stored).toLowerCase()).not.toContain("pin");
      expect(JSON.stringify(json).toLowerCase()).not.toContain("pin");
    });

    it("saves the first time when no document exists and baseUpdatedAt is empty", async () => {
      state.db = createDb();
      const settings = draftFrom(getDefaultStoreSettings());
      const response = await call("PUT", { pin: "2532", baseUpdatedAt: "", settings });
      expect(response.status).toBe(200);
      expect(state.db.docs.has("store_settings/default")).toBe(true);
    });

    it("allows admin", async () => {
      state.role = "admin";
      expect((await call("PUT", body())).status).toBe(200);
    });

    it("rejects pack with 403 and writes nothing", async () => {
      state.role = "pack";
      expect((await call("PUT", body())).status).toBe(403);
      expect(state.db.writes).toEqual([]);
    });

    it("rejects a missing PIN with 403 and writes nothing", async () => {
      const payload = body();
      delete payload.pin;
      expect((await call("PUT", payload)).status).toBe(403);
      expect(state.db.writes).toEqual([]);
    });

    it("rejects a wrong PIN with 403 and writes nothing", async () => {
      const response = await call("PUT", body({ pin: "1234" }));
      expect(response.status).toBe(403);
      expect((await response.json()).error).toBe("รหัส PIN ไม่ถูกต้อง");
      expect(state.db.writes).toEqual([]);
      expect(state.db.docs.get("store_settings/default").header.company).toBe("HILLKOFF");
    });

    it("checks the PIN on every PUT, not only the first", async () => {
      expect((await call("PUT", body())).status).toBe(200);
      const next = body({ pin: "0000", baseUpdatedAt: state.db.docs.get("store_settings/default").updatedAt });
      expect((await call("PUT", next)).status).toBe(403);
    });

    it("answers 429 when throttled and writes nothing", async () => {
      for (let i = 0; i < 5; i += 1) await call("PUT", body({ pin: "1111" }));
      const response = await call("PUT", body());
      expect(response.status).toBe(429);
      expect(state.db.writes).toEqual([]);
    });

    it("uses STORE_SETTINGS_PIN when it is set", async () => {
      vi.stubEnv("STORE_SETTINGS_PIN", "9876");
      expect((await call("PUT", body())).status).toBe(403);
      expect((await call("PUT", body({ pin: "9876" }))).status).toBe(200);
    });

    it("answers 409 for a stale baseUpdatedAt and writes nothing", async () => {
      const response = await call("PUT", body({ baseUpdatedAt: "2026-10-26T00:00:00.000Z" }));
      expect(response.status).toBe(409);
      expect((await response.json()).error).toBe("มีผู้อื่นบันทึกการตั้งค่าไปก่อน กรุณาโหลดใหม่แล้วแก้อีกครั้ง");
      expect(state.db.writes).toEqual([]);
    });

    it("answers 400 with errors[] for invalid settings and writes nothing", async () => {
      const payload = body();
      payload.settings.branches.push({ code: "!", name: "", type: "สาขา", active: true });
      const response = await call("PUT", payload);
      expect(response.status).toBe(400);
      const json = await response.json();
      expect(json.ok).toBe(false);
      expect(json.errors.length).toBeGreaterThan(0);
      expect(json.errors[0]).toEqual({ path: expect.any(String), message: expect.any(String) });
      expect(json.error).toBe(json.errors[0].message);
      expect(state.db.writes).toEqual([]);
    });

    it("answers 400 when settings are missing", async () => {
      const response = await call("PUT", { pin: "2532", baseUpdatedAt: "2026-10-27T01:00:00.000Z" });
      expect(response.status).toBe(400);
    });

    it("answers 400 on invalid JSON", async () => {
      const route = await import("../../app/api/store/settings/route.js");
      const response = await route.PUT(new Request("http://localhost/api/store/settings", { method: "PUT", body: "{nope" }));
      expect(response.status).toBe(400);
    });

    it("keeps store-booking enabled even if the client turns it off", async () => {
      const payload = body();
      payload.settings.modules.find((m) => m.id === "store-booking").enabled = false;
      payload.settings.modules.find((m) => m.id === "store-audit").enabled = false;
      const json = await (await call("PUT", payload)).json();
      const modules = Object.fromEntries(json.data.settings.modules.map((m) => [m.id, m.enabled]));
      expect(modules["store-booking"]).toBe(true);
      expect(modules["store-audit"]).toBe(false);
      expect(state.db.docs.get("store_settings/default").modules.find((m) => m.id === "store-booking").enabled).toBe(true);
    });

    describe("deleting a branch", () => {
      const withoutWh = () => {
        const payload = body();
        payload.settings.branches = [];
        return payload;
      };

      it.each([
        ["a transfer source", { transfers: [{ fromBranchCode: "WH", toBranchCode: "BR1" }] }],
        ["a transfer destination", { transfers: [{ fromBranchCode: "BR1", toBranchCode: "WH" }] }],
        ["an audit", { audits: [{ branchCode: "WH" }] }]
      ])("answers 409 and writes nothing when %s references it", async (_label, refs) => {
        state.db = createDb({ settings: savedSettings(), ...refs });
        const response = await call("PUT", withoutWh());
        expect(response.status).toBe(409);
        expect((await response.json()).error).toBe("สาขา WH มีเอกสารอ้างอิงแล้ว ลบไม่ได้ ให้ปิดใช้งานแทน");
        expect(state.db.writes).toEqual([]);
        expect(state.db.docs.get("store_settings/default").branches).toHaveLength(1);
      });

      it("deletes a branch nothing references", async () => {
        state.db = createDb({ settings: savedSettings(), transfers: [{ fromBranchCode: "BR1", toBranchCode: "BR2" }] });
        const response = await call("PUT", withoutWh());
        expect(response.status).toBe(200);
        expect(state.db.docs.get("store_settings/default").branches).toEqual([]);
      });

      it("lets a referenced branch be deactivated instead", async () => {
        state.db = createDb({ settings: savedSettings(), audits: [{ branchCode: "WH" }] });
        const payload = body();
        payload.settings.branches[0].active = false;
        expect((await call("PUT", payload)).status).toBe(200);
        expect(state.db.docs.get("store_settings/default").branches[0].active).toBe(false);
      });
    });
  });
});
