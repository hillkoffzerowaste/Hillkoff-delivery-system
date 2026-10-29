import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ db: null, role: "store", uid: "" }));

vi.mock("../../lib/workflowAuth.js", () => ({
  requireProfile: async (_request, roles) => {
    if (!roles.includes(state.role)) throw Object.assign(new Error("Forbidden"), { status: 403 });
    return { profile: { uid: state.uid || `${state.role}-1`, role: state.role, name: "สโตร์หนึ่ง", email: "s@hillkoff.com" }, db: state.db };
  },
  errorResponse: (error) => Response.json({ ok: false, error: error.message }, { status: error.status || 500 })
}));

// In-memory Firestore double with optimistic transactions: a commit whose reads went stale is retried,
// so two overlapping saves can only both succeed by taking different numbers.
function createDb(seed = {}) {
  const docs = new Map(Object.entries(seed));
  const versions = new Map();
  let autoId = 0;
  const bump = (path) => versions.set(path, (versions.get(path) || 0) + 1);
  const ref = (path) => ({
    path,
    id: path.split("/").pop(),
    collection: (name) => collection(`${path}/${name}`),
    get: async () => snapshot(path)
  });
  const snapshot = (path) => ({ exists: docs.has(path), id: path.split("/").pop(), ref: ref(path), data: () => docs.get(path) });
  const collection = (name) => {
    const filters = [];
    let order = "";
    let max = Infinity;
    const query = {
      doc: (id = `auto-${(autoId += 1)}`) => ref(`${name}/${id}`),
      where(field, op, value) { filters.push({ field, op, value }); return query; },
      orderBy(field) { order = field; return query; },
      limit(count) { max = count; return query; },
      async get() {
        const rows = [...docs.entries()]
          .filter(([path]) => path.startsWith(`${name}/`) && !path.slice(name.length + 1).includes("/"))
          .filter(([, data]) => filters.every(({ field, op, value }) => (op === ">=" ? data[field] >= value : op === "<=" ? data[field] <= value : data[field] === value)))
          .sort(([, a], [, b]) => (order ? String(a[order]).localeCompare(String(b[order])) : 0))
          .slice(0, max)
          .map(([path]) => snapshot(path));
        return { docs: rows };
      }
    };
    return query;
  };
  return {
    docs,
    collection,
    async runTransaction(callback) {
      for (let attempt = 0; attempt < 5; attempt += 1) {
        const reads = new Map();
        const writes = [];
        const transaction = {
          get: async (target) => {
            reads.set(target.path, versions.get(target.path) || 0);
            await Promise.resolve();
            return snapshot(target.path);
          },
          set: (target, value, options) => writes.push({ op: "set", path: target.path, value, merge: options?.merge }),
          create: (target, value) => writes.push({ op: "create", path: target.path, value }),
          delete: (target) => writes.push({ op: "delete", path: target.path })
        };
        await callback(transaction);
        const stale = [...reads].some(([path, version]) => (versions.get(path) || 0) !== version);
        if (stale) continue;
        if (writes.some((write) => write.op === "create" && docs.has(write.path))) throw Object.assign(new Error("ALREADY_EXISTS"), { status: 500 });
        for (const write of writes) {
          if (write.op === "delete") docs.delete(write.path);
          else docs.set(write.path, write.merge ? { ...docs.get(write.path), ...write.value } : write.value);
          bump(write.path);
        }
        return;
      }
      throw new Error("transaction retries exhausted");
    }
  };
}

const settingsPath = "store_settings/default";
const branches = [
  { code: "WH", name: "คลังหลัก", type: "คลังสินค้า", active: true },
  { code: "BR01", name: "สาขา 01", type: "สาขา", active: true }
];
const seedSettings = (audit = {}) => ({ [settingsPath]: { branches, documents: { audit: { prefix: "AU", pattern: "dash", digits: 4, reset: "none", ...audit } } } });
const goodBody = { branchCode: "WH", zone: "หมวด A", checkerName: "สโตร์ 1", total: 120, match: 117, note: "ไซรัปนับขาด" };

const call = async (method, search = "", body) => {
  const route = await import("../../app/api/store/audits/route.js");
  return route[method](new Request(`http://localhost/api/store/audits${search}`, {
    method,
    headers: { "Content-Type": "application/json", Authorization: "Bearer test" },
    body: body === undefined ? undefined : JSON.stringify(body)
  }));
};
const post = (body) => call("POST", "", body);
const auditDocs = () => [...state.db.docs.entries()].filter(([path]) => /^store_audits\/[^/]+$/.test(path));
const registryIds = () => [...state.db.docs.keys()].filter((path) => path.startsWith("store_document_registry/")).sort();

describe("store audits route", () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-28T03:00:00.000Z"));
    state.role = "store";
    state.uid = "";
    state.db = createDb(seedSettings());
  });
  afterEach(() => vi.useRealTimers());

  describe("roles", () => {
    it("lets store write and store/admin read, and blocks everyone else", async () => {
      expect((await post(goodBody)).status).toBe(200);
      state.role = "admin";
      expect((await call("GET", "?from=2026-10-22&to=2026-10-28")).status).toBe(200);
      expect((await post(goodBody)).status).toBe(403);
      state.role = "pack";
      expect((await post(goodBody)).status).toBe(403);
      expect((await call("GET", "?from=2026-10-22&to=2026-10-28")).status).toBe(403);
      expect((await call("DELETE", "", { id: "x", reason: "r" })).status).toBe(403);
      expect(auditDocs()).toHaveLength(1);
    });
  });

  it("rejects a manually repeated yymm number across service months", async () => {
    state.db = createDb(seedSettings({ pattern: "yymm", reset: "month" }));
    vi.setSystemTime(new Date("2026-09-30T03:00:00Z"));
    expect((await post({ ...goodBody, documentNumber: "AU6909-0418" })).status).toBe(200);
    vi.setSystemTime(new Date("2026-10-01T03:00:00Z"));
    expect((await post({ ...goodBody, documentNumber: "AU6909-0418" })).status).toBe(409);
  });

  describe("POST numbering", () => {
    it("issues AU-0001 then AU-0002 and records doc, history, registry and counter", async () => {
      const first = await (await post(goodBody)).json();
      const second = await (await post({ ...goodBody, total: 10, match: 10, note: "" })).json();
      expect(first.data).toMatchObject({ documentNumber: "AU-0001", serviceDate: "2026-10-28", mismatch: 3, branchName: "คลังหลัก", createdByUid: "store-1", registryId: "audit__all__AU-0001" });
      expect(second.data.documentNumber).toBe("AU-0002");
      expect(registryIds()).toEqual(["store_document_registry/audit__all__AU-0001", "store_document_registry/audit__all__AU-0002"]);
      expect(state.db.docs.get("store_document_registry/audit__all__AU-0001")).toMatchObject({ kind: "audit", number: "AU-0001", sourceId: first.data.id });
      expect(state.db.docs.get("store_document_counters/audit__all")).toMatchObject({ kind: "audit", last: 2 });
      const history = [...state.db.docs.entries()].filter(([path]) => path.startsWith(`store_audits/${first.data.id}/history/`));
      expect(history).toHaveLength(1);
      expect(history[0][1]).toMatchObject({ event: "created", byUid: "store-1" });
    });

    it("gives two overlapping saves different numbers", async () => {
      const [a, b] = await Promise.all([post(goodBody), post({ ...goodBody, total: 50, match: 50, note: "" })]);
      const numbers = [(await a.json()).data.documentNumber, (await b.json()).data.documentNumber].sort();
      expect(numbers).toEqual(["AU-0001", "AU-0002"]);
      expect(state.db.docs.get("store_document_counters/audit__all").last).toBe(2);
    });

    it("restarts at 1 in a new month when reset is month, with separate registry and counter ids", async () => {
      state.db = createDb(seedSettings({ reset: "month" }));
      expect((await (await post(goodBody)).json()).data.documentNumber).toBe("AU-0001");
      vi.setSystemTime(new Date("2026-11-02T03:00:00.000Z"));
      expect((await (await post(goodBody)).json()).data.documentNumber).toBe("AU-0001");
      expect(registryIds()).toEqual(["store_document_registry/audit__2026-10__AU-0001", "store_document_registry/audit__2026-11__AU-0001"]);
      expect(state.db.docs.get("store_document_counters/audit__2026-11").last).toBe(1);
    });

    it("embeds the branch code for the branch pattern", async () => {
      state.db = createDb(seedSettings({ pattern: "branch" }));
      expect((await (await post({ ...goodBody, branchCode: "BR01" })).json()).data.documentNumber).toBe("AU-BR01-0001");
      expect((await (await post(goodBody)).json()).data.documentNumber).toBe("AU-WH-0002");
    });

    it("recomputes mismatch on the server even if the client sends another value", async () => {
      const response = await post({ ...goodBody, total: 10, match: 7, mismatch: 0 });
      expect((await response.json()).data).toMatchObject({ total: 10, match: 7, mismatch: 3 });
      expect(auditDocs()[0][1].mismatch).toBe(3);
    });
  });

  describe("POST user-edited numbers", () => {
    it("returns 409 for a duplicate manual number and writes nothing", async () => {
      expect((await post({ ...goodBody, documentNumber: "AU-0005" })).status).toBe(200);
      const before = state.db.docs.size;
      const response = await post({ ...goodBody, documentNumber: "au-0005" });
      expect(response.status).toBe(409);
      expect(await response.json()).toEqual({ ok: false, error: "เลขที่เอกสาร AU-0005 ถูกบันทึกแล้ว" });
      expect(state.db.docs.size).toBe(before);
    });

    it("raises the counter when the manual sequence is higher, and never lowers it", async () => {
      await post({ ...goodBody, documentNumber: "AU-0050" });
      expect(state.db.docs.get("store_document_counters/audit__all").last).toBe(50);
      await post({ ...goodBody, documentNumber: "AU-0003" });
      expect(state.db.docs.get("store_document_counters/audit__all").last).toBe(50);
      expect((await (await post(goodBody)).json()).data.documentNumber).toBe("AU-0051");
    });

    it("rejects a number that does not match the configured pattern", async () => {
      const response = await post({ ...goodBody, documentNumber: "ZZ-1" });
      expect(response.status).toBe(400);
      expect((await response.json()).error).toBe("เลขที่เอกสารต้องอยู่ในรูปแบบ AU-0418");
      expect(auditDocs()).toHaveLength(0);
    });

    it("re-issues the next number when a pre-filled (auto) number was taken meanwhile", async () => {
      await post({ ...goodBody, documentNumber: "AU-0001" });
      const response = await post({ ...goodBody, documentNumber: "AU-0001", numberAuto: true });
      expect(response.status).toBe(200);
      expect((await response.json()).data.documentNumber).toBe("AU-0002");
    });

    it("keeps a free pre-filled number as typed", async () => {
      const response = await post({ ...goodBody, documentNumber: "AU-0001", numberAuto: true });
      expect((await response.json()).data.documentNumber).toBe("AU-0001");
      expect(state.db.docs.get("store_document_counters/audit__all").last).toBe(1);
    });
  });

  describe("POST validation", () => {
    it.each([
      [{ total: 0 }, "จำนวนตรวจนับทั้งหมดต้องเป็นจำนวนเต็มมากกว่า 0"],
      [{ match: 121 }, "สินค้าตรงมากกว่าจำนวนตรวจนับทั้งหมดไม่ได้"],
      [{ note: "" }, "มีสินค้าไม่ตรง กรุณาระบุรายการที่ไม่ตรง"],
      [{ branchCode: "NOPE" }, "สาขาไม่ถูกต้องหรือถูกปิดใช้งาน"]
    ])("rejects %j with 400 and writes nothing", async (patch, error) => {
      const response = await post({ ...goodBody, ...patch });
      expect(response.status).toBe(400);
      expect((await response.json()).error).toBe(error);
      expect(auditDocs()).toHaveLength(0);
      expect(registryIds()).toHaveLength(0);
    });

    it("answers 400 for a body that is not JSON", async () => {
      const route = await import("../../app/api/store/audits/route.js");
      const response = await route.POST(new Request("http://localhost/api/store/audits", { method: "POST", body: "not json" }));
      expect(response.status).toBe(400);
    });
  });

  describe("GET ?next=true", () => {
    it("returns the next number without writing anything", async () => {
      const before = state.db.docs.size;
      expect(await (await call("GET", "?next=true")).json()).toEqual({ ok: true, data: { documentNumber: "AU-0001" } });
      expect(await (await call("GET", "?next=true")).json()).toEqual({ ok: true, data: { documentNumber: "AU-0001" } });
      expect(state.db.docs.size).toBe(before);
    });

    it("moves on after a save and skips a manually used number", async () => {
      await post(goodBody);
      await post({ ...goodBody, documentNumber: "AU-0002" });
      expect((await (await call("GET", "?next=true")).json()).data.documentNumber).toBe("AU-0003");
    });

    it("runs each extra head on its own sequence and falls back to the default head", async () => {
      state.db = createDb(seedSettings({ extraPrefixes: ["AX"] }));
      await post(goodBody);
      expect((await (await call("GET", "?next=true&prefix=AX")).json()).data.documentNumber).toBe("AX-0001");
      expect((await (await call("GET", "?next=true&prefix=ZZ")).json()).data.documentNumber).toBe("AU-0002");
      const issued = await (await post({ ...goodBody, numberPrefix: "AX" })).json();
      expect(issued.data.documentNumber).toBe("AX-0001");
      expect(state.db.docs.get("store_document_counters/audit__all__AX")).toMatchObject({ last: 1 });
      expect(state.db.docs.get("store_document_counters/audit__all")).toMatchObject({ last: 1 });
      expect((await (await post({ ...goodBody, documentNumber: "AX-0002" })).json()).data.documentNumber).toBe("AX-0002");
      expect(state.db.docs.get("store_document_counters/audit__all__AX")).toMatchObject({ last: 2 });
      expect((await post({ ...goodBody, documentNumber: "ZZ-0001" })).status).toBe(400);
    });

    it("uses the requested branch for the branch pattern and rejects an unknown one", async () => {
      state.db = createDb(seedSettings({ pattern: "branch" }));
      expect((await (await call("GET", "?next=true&branchCode=BR01")).json()).data.documentNumber).toBe("AU-BR01-0001");
      expect((await call("GET", "?next=true&branchCode=ZZ")).status).toBe(400);
    });
  });

  describe("GET range", () => {
    const row = (serviceDate, extra = {}) => ({ serviceDate, createdAt: `${serviceDate}T03:00:00.000Z`, total: 1, match: 1, ...extra });

    it("returns audits inside the range, oldest first, without deleted ones", async () => {
      state.db = createDb({
        ...seedSettings(),
        "store_audits/a": row("2026-10-27"),
        "store_audits/b": row("2026-10-22"),
        "store_audits/c": row("2026-10-28", { deletedAt: "x" }),
        "store_audits/d": row("2026-10-01")
      });
      const json = await (await call("GET", "?from=2026-10-22&to=2026-10-28")).json();
      expect(json.data.from).toBe("2026-10-22");
      expect(json.data.items.map((item) => item.id)).toEqual(["b", "a"]);
      const all = await (await call("GET", "?from=2026-10-22&to=2026-10-28&includeDeleted=true")).json();
      expect(all.data.items.map((item) => item.id)).toEqual(["b", "a", "c"]);
    });

    it.each([
      ["", "missing range"],
      ["?from=2026-10-28&to=2026-10-22", "from after to"],
      ["?from=2026-10-xx&to=2026-10-28", "malformed date"],
      ["?from=2026-08-01&to=2026-10-28", "more than 62 days"]
    ])("rejects %s with 400 (%s)", async (search) => {
      const response = await call("GET", search);
      expect(response.status).toBe(400);
      expect((await response.json()).error).toBe("ช่วงวันที่ไม่ถูกต้อง");
    });

    it("accepts exactly 62 days", async () => {
      expect((await call("GET", "?from=2026-08-28&to=2026-10-28")).status).toBe(200);
    });

    it("answers 422 when the range holds more than 2000 audits", async () => {
      const seed = seedSettings();
      for (let index = 0; index < 2001; index += 1) seed[`store_audits/bulk-${index}`] = row("2026-10-28");
      state.db = createDb(seed);
      expect((await call("GET", "?from=2026-10-22&to=2026-10-28")).status).toBe(422);
    });
  });

  describe("DELETE", () => {
    it("soft-deletes, records history and releases the number so it can be typed again", async () => {
      const created = (await (await post({ ...goodBody, documentNumber: "AU-0009" })).json()).data;
      const response = await call("DELETE", "", { id: created.id, reason: "บันทึกผิดสาขา" });
      expect(response.status).toBe(200);
      expect((await response.json()).data).toMatchObject({ id: created.id, deletedBy: "สโตร์หนึ่ง", deleteReason: "บันทึกผิดสาขา" });
      expect(state.db.docs.get(`store_audits/${created.id}`)).toMatchObject({ deletedAt: expect.any(String), documentNumber: "AU-0009" });
      expect(registryIds()).toEqual([]);
      expect([...state.db.docs.values()].some((doc) => doc.event === "deleted" && doc.reason === "บันทึกผิดสาขา")).toBe(true);
      expect((await post({ ...goodBody, documentNumber: "AU-0009" })).status).toBe(200);
    });

    it("requires a reason, the creator, and an existing live document", async () => {
      const created = (await (await post(goodBody)).json()).data;
      expect((await call("DELETE", "", { id: created.id, reason: " " })).status).toBe(400);
      state.uid = "store-2";
      const other = await call("DELETE", "", { id: created.id, reason: "ลอง" });
      expect(other.status).toBe(403);
      expect(state.db.docs.get(`store_audits/${created.id}`).deletedAt).toBeUndefined();
      state.uid = "";
      expect((await call("DELETE", "", { id: "missing", reason: "ลอง" })).status).toBe(404);
      expect((await call("DELETE", "", { id: created.id, reason: "ลบ" })).status).toBe(200);
      expect((await call("DELETE", "", { id: created.id, reason: "ลบอีก" })).status).toBe(409);
    });
  });
});
