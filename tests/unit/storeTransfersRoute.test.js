import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ db: null, role: "store", uid: "store-1" }));

vi.mock("../../lib/workflowAuth.js", () => ({
  requireProfile: async (_request, roles) => {
    if (!roles.includes(state.role)) throw Object.assign(new Error("Forbidden"), { status: 403 });
    return { profile: { uid: state.uid, role: state.role, name: "สโตร์หนึ่ง", email: "s@hillkoff.com" }, db: state.db };
  },
  errorResponse: (error) => Response.json({ ok: false, error: error.message }, { status: error.status || 500 })
}));

// In-memory Firestore double: documents keyed by full path, writes inside a transaction are
// buffered and only applied when the callback resolves (so a thrown error writes nothing).
function createDb(seed = {}) {
  const docs = new Map(Object.entries(seed));
  let counter = 0;
  const segments = (path) => path.split("/");
  const makeRef = (path) => ({
    path,
    id: segments(path).at(-1),
    collection: (name) => makeCollection(`${path}/${name}`),
    async get() { return snap(path); }
  });
  const snap = (path) => ({ exists: docs.has(path), id: segments(path).at(-1), ref: makeRef(path), data: () => docs.get(path) });
  function makeCollection(path) {
    const query = (rows) => {
      const q = {
        where: (field, op, value) => { if (op !== "==") throw new Error("unsupported op"); return query(rows.filter(([, data]) => data[field] === value)); },
        orderBy: (field, dir = "asc") => query([...rows].sort(([, a], [, b]) => (dir === "desc" ? -1 : 1) * String(a[field] || "").localeCompare(String(b[field] || "")))),
        limit: (n) => query(rows.slice(0, n)),
        get: async () => ({ docs: rows.map(([p]) => snap(p)), size: rows.length })
      };
      return q;
    };
    const rowsOf = () => [...docs.entries()].filter(([p]) => p.startsWith(`${path}/`) && segments(p).length === segments(path).length + 1);
    return { ...query(rowsOf()), doc: (id) => makeRef(`${path}/${id ?? `auto${++counter}`}`) };
  }
  return {
    docs,
    collection: makeCollection,
    async runTransaction(callback) {
      const writes = [];
      await callback({
        get: async (target) => {
          if (writes.length) throw new Error("Firestore transactions require all reads before writes");
          return target.get();
        },
        set: (ref, value, options) => writes.push(() => docs.set(ref.path, options?.merge ? { ...docs.get(ref.path), ...value } : value)),
        update: (ref, value) => writes.push(() => docs.set(ref.path, { ...docs.get(ref.path), ...value })),
        create: (ref, value) => writes.push(() => { if (docs.has(ref.path)) throw new Error("ALREADY_EXISTS"); docs.set(ref.path, value); }),
        delete: (ref) => writes.push(() => docs.delete(ref.path))
      });
      writes.forEach((apply) => apply());
    }
  };
}

const settingsDoc = {
  branches: [
    { code: "WH", name: "คลังหลัก", type: "คลังสินค้า", active: true },
    { code: "BR01", name: "สาขา 01", type: "สาขา", active: true }
  ]
};
const row = (overrides = {}) => ({
  transferNumber: "TR-0418", requestRef: "RQ-0395", fromBranchCode: "WH", toBranchCode: "BR01",
  preparerUid: "store-2", preparerName: "สโตร์สอง", receipt: "complete", note: "", ...overrides
});

let route;
const call = (method, body, query = "") => route[method](new Request(`http://localhost/api/store/transfers${query}`, {
  method,
  headers: { "Content-Type": "application/json", Authorization: "Bearer test" },
  ...(body === undefined ? {} : { body: JSON.stringify(body) })
}));
const transferPaths = (db) => [...db.docs.keys()].filter((p) => /^store_transfers\/[^/]+$/.test(p));
const registryPaths = (db) => [...db.docs.keys()].filter((p) => p.startsWith("store_document_registry/"));
const historyPaths = (db) => [...db.docs.keys()].filter((p) => p.includes("/history/"));

async function postOne(overrides) {
  const response = await call("POST", { rows: [row(overrides)] });
  expect(response.status).toBe(200);
  return (await response.json()).data[0];
}

describe("store transfers route", () => {
  beforeEach(async () => {
    state.role = "store";
    state.uid = "store-1";
    state.db = createDb({ "store_settings/default": settingsDoc, "users/store-2": { role: "store", name: "สโตร์สอง", active: true } });
    route = await import("../../app/api/store/transfers/route.js");
  });

  describe("permissions", () => {
    it("lets only the store role write, while admin may read", async () => {
      for (const role of ["pack", "admin", "sales"]) {
        state.role = role;
        for (const method of ["POST", "PATCH", "PUT", "DELETE"]) {
          expect((await call(method, { rows: [row()], id: "x", action: "resolve" })).status).toBe(403);
        }
      }
      expect(transferPaths(state.db)).toHaveLength(0);
      state.role = "admin";
      expect((await call("GET", undefined, "?date=2026-10-28")).status).toBe(200);
      state.role = "pack";
      expect((await call("GET", undefined, "?date=2026-10-28")).status).toBe(403);
    });
  });

  describe("review regressions", () => {
    it("accepts a configured staff name and rejects names removed from the roster", async () => {
      state.db.docs.set("store_settings/default", { ...settingsDoc, staff: [{ id: "staff_123", name: "สมชาย", active: true }] });
      const saved = await postOne({ preparerUid: "staff_123", preparerName: "ชื่อปลอม" });
      expect(saved.preparerName).toBe("สมชาย");
      state.db.docs.set("store_settings/default", { ...settingsDoc, staff: [{ id: "staff_123", name: "สมชาย", active: false }] });
      expect((await call("POST", { rows: [row({ transferNumber: "TR-0419", preparerUid: "staff_123" })] })).status).toBe(400);
    });
    it("rejects a repeated yymm transfer number across service months", async () => {
      vi.useFakeTimers({ toFake: ["Date"] });
      try {
        state.db.docs.set("store_settings/default", { ...settingsDoc, documents: { transfer: { prefix: "TR", pattern: "yymm", digits: 4, reset: "month" } } });
        vi.setSystemTime(new Date("2026-09-30T03:00:00Z"));
        expect((await call("POST", { rows: [row({ transferNumber: "TR6909-0418" })] })).status).toBe(200);
        vi.setSystemTime(new Date("2026-10-01T03:00:00Z"));
        expect((await call("POST", { rows: [row({ transferNumber: "TR6909-0418" })] })).status).toBe(409);
      } finally { vi.useRealTimers(); }
    });

    it("stores the transferred item count and lets an edit change it", async () => {
      const saved = await postOne({ itemCount: "12" });
      expect(saved.itemCount).toBe(12);
      const response = await call("PUT", { id: saved.id, ...row({ itemCount: "15" }), reason: "นับใหม่" });
      expect(response.status).toBe(200);
      expect((await response.json()).data.itemCount).toBe(15);
    });

    it("allows editing an existing number after the configured prefix changes", async () => {
      const saved = await postOne({ receipt: "incomplete", note: "missing" });
      state.db.docs.set("store_settings/default", { ...settingsDoc, documents: { transfer: { prefix: "TF", pattern: "dash", digits: 4, reset: "none" } } });
      const response = await call("PUT", { id: saved.id, ...row({ receipt: "incomplete", note: "corrected" }), reason: "แก้ไข" });
      expect(response.status).toBe(200);
      expect((await response.json()).data).toMatchObject({ transferNumber: "TR-0418", note: "corrected" });
    });

    it("rejects disabled or non-store preparers and uses the staff name from the server", async () => {
      state.db.docs.set("users/bad", { role: "sales", name: "Other" });
      expect((await call("POST", { rows: [row({ preparerUid: "bad" })] })).status).toBe(400);
      state.db.docs.set("users/bad", { role: "store", name: "Disabled", active: false });
      expect((await call("POST", { rows: [row({ preparerUid: "bad" })] })).status).toBe(400);
      const saved = await postOne({ preparerName: "ชื่อปลอม" });
      expect(saved.preparerName).toBe("สโตร์สอง");
    });

    it("rejects a preparer name with no uid so work cannot disappear from reports", async () => {
      expect((await call("POST", { rows: [row({ preparerUid: "" })] })).status).toBe(400);
      expect(transferPaths(state.db)).toHaveLength(0);
    });
  });

  describe("document dates", () => {
    it("creates last-year documents with real server timestamps and a backdate reason", async () => {
      const response = await call("POST", { serviceDate: "2025-12-31", backdateReason: "ตกหล่น", rows: [row()] });
      expect(response.status).toBe(200);
      const saved = (await response.json()).data[0];
      expect(saved).toMatchObject({ serviceDate: "2025-12-31", backdateReason: "ตกหล่น", createdByUid: "store-1" });
      expect(saved.createdAt).not.toContain("2025-12-31");
      expect((await (await call("GET", undefined, "?date=2025-12-31")).json()).data.items).toHaveLength(1);
    });

    it("requires a year-month number to match an explicitly selected document date", async () => {
      state.db.docs.set("store_settings/default", { ...settingsDoc, documents: { transfer: { prefix: "TR", pattern: "yymm", digits: 4, reset: "month" } } });
      expect((await call("POST", { serviceDate: "2024-12-31", backdateReason: "ตกหล่น", rows: [row({ transferNumber: "TR6911-0418" })] })).status).toBe(400);
      const response = await call("POST", { serviceDate: "2024-12-31", backdateReason: "ตกหล่น", rows: [row({ transferNumber: "TR6712-0418", requestRef: "STK-TRF6601-0001" })] });
      expect(response.status).toBe(200);
      const saved = (await response.json()).data[0];
      expect(saved).toMatchObject({ serviceDate: "2024-12-31", requestRef: "STK-TRF6601-0001" });
      expect((await call("PUT", { id: saved.id, ...row({ transferNumber: "TR6712-0418" }), serviceDate: "2024-11-30", reason: "ผิดเดือน", baseUpdatedAt: saved.updatedAt })).status).toBe(400);
    });

    it("rejects invalid dates and missing backdate reasons without writes", async () => {
      for (const serviceDate of ["2025-02-29", "2025-12-31"]) {
        expect((await call("POST", { serviceDate, rows: [row()] })).status).toBe(400);
      }
      expect(transferPaths(state.db)).toHaveLength(0);
    });

    it("moves a monthly registry on a date-only edit and keeps resolution timestamps", async () => {
      state.db.docs.set("store_settings/default", { ...settingsDoc, documents: { transfer: { reset: "month" } } });
      const saved = await postOne({ receipt: "incomplete", note: "ขาด" });
      await call("PATCH", { id: saved.id, action: "resolve", text: "รับเพิ่ม" });
      const before = state.db.docs.get(`store_transfers/${saved.id}`);
      const response = await call("PUT", { id: saved.id, ...row({ receipt: "incomplete", note: "ขาด" }), serviceDate: "2025-12-31", reason: "แก้วันที่", baseUpdatedAt: before.updatedAt });
      expect(response.status).toBe(200);
      expect(state.db.docs.get(`store_transfers/${saved.id}`)).toMatchObject({ serviceDate: "2025-12-31", resolution: before.resolution, resolvedServiceDate: before.resolvedServiceDate });
      expect(registryPaths(state.db)).toEqual(["store_document_registry/transfer__2025-12__TR-0418"]);
    });

    it("rejects a date move into an occupied period without releasing either number", async () => {
      state.db.docs.set("store_settings/default", { ...settingsDoc, documents: { transfer: { reset: "month" } } });
      const saved = await postOne({});
      state.db.docs.set("store_document_registry/transfer__2025-12__TR-0418", { sourceId: "other" });
      expect((await call("PUT", { id: saved.id, ...row(), serviceDate: "2025-12-31", reason: "แก้วันที่", baseUpdatedAt: saved.updatedAt })).status).toBe(409);
      expect(registryPaths(state.db)).toHaveLength(2);
      expect(state.db.docs.get(`store_transfers/${saved.id}`).serviceDate).toBe(saved.serviceDate);
    });

    it("rejects new future document dates and keeps an existing legacy future date", async () => {
      expect((await call("POST", { serviceDate: "2099-01-01", rows: [row()] })).status).toBe(400);
      const saved = await postOne({});
      expect((await call("PUT", { id: saved.id, ...row(), serviceDate: "2099-01-01", reason: "แก้วันที่", baseUpdatedAt: saved.updatedAt })).status).toBe(400);
      state.db.docs.set(`store_transfers/${saved.id}`, { ...saved, serviceDate: "2099-01-01" });
      expect((await call("PUT", { id: saved.id, ...row(), serviceDate: "2099-01-01", reason: "แก้ข้อความ", baseUpdatedAt: saved.updatedAt })).status).toBe(200);
    });

    it("requires a current base version for a document date change", async () => {
      const saved = await postOne({});
      expect((await call("PUT", { id: saved.id, ...row(), serviceDate: "2025-12-31", reason: "แก้วันที่" })).status).toBe(409);
    });

    it("refuses to release a registry owned by another document", async () => {
      const saved = await postOne({});
      state.db.docs.set(`store_document_registry/${saved.registryId}`, { sourceId: "another" });
      expect((await call("PUT", { id: saved.id, ...row({ transferNumber: "TR-0999" }), reason: "แก้เลข" })).status).toBe(409);
      expect(state.db.docs.get(`store_transfers/${saved.id}`).transferNumber).toBe("TR-0418");
    });
  });

  describe("POST", () => {
    it("writes the document, a created history event and the registry row", async () => {
      const response = await call("POST", { rows: [row({ receipt: "incomplete", note: "แก้วขาด 100 ใบ" })] });
      const { data } = await response.json();
      expect(response.status).toBe(200);
      expect(data).toHaveLength(1);
      expect(data[0]).toMatchObject({ transferNumber: "TR-0418", issueState: "open", createdByUid: "store-1", fromBranchName: "คลังหลัก", toBranchName: "สาขา 01", registryId: "transfer__all__TR-0418" });
      expect(transferPaths(state.db)).toHaveLength(1);
      expect(state.db.docs.get("store_document_registry/transfer__all__TR-0418")).toMatchObject({ kind: "transfer", number: "TR-0418", periodKey: "all", sourceId: data[0].id });
      const [historyPath] = historyPaths(state.db);
      expect(state.db.docs.get(historyPath)).toMatchObject({ event: "created", byUid: "store-1" });
    });

    it("uses the recorder when the preparer field is hidden", async () => {
      state.db.docs.set("store_settings/default", { ...settingsDoc, documents: { transfer: { fields: [{ id: "preparer", show: false }] } } });
      const saved = await postOne({ preparerName: "", preparerUid: "" });
      expect(saved).toMatchObject({ preparerUid: "store-1", preparerName: "สโตร์หนึ่ง" });
    });

    it("skips blank rows and answers 400 when nothing is left", async () => {
      expect((await call("POST", { rows: [{ fromBranchCode: "WH", toBranchCode: "BR01", receipt: "complete" }] })).status).toBe(400);
      expect((await call("POST", { rows: [] })).status).toBe(400);
      const response = await call("POST", { rows: [{ receipt: "complete" }, row()] });
      expect((await response.json()).data).toHaveLength(1);
    });

    it("rejects more than 50 rows and malformed bodies", async () => {
      expect((await call("POST", { rows: Array.from({ length: 51 }, (_, i) => row({ transferNumber: `TR-${String(1000 + i)}` })) })).status).toBe(400);
      const bad = await route.POST(new Request("http://localhost/api/store/transfers", { method: "POST", headers: { Authorization: "Bearer test" }, body: "{" }));
      expect(bad.status).toBe(400);
    });

    it("validates each field with 400", async () => {
      const cases = [
        [{ transferNumber: "418" }, "เลขที่ใบโอนต้องอยู่ในรูปแบบ TR-0418"],
        [{ requestRef: "XX" }, "เลขที่ใบขอโอนต้องอยู่ในรูปแบบ STK-TRF6910-0001"],
        [{ toBranchCode: "WH" }, "ต้นทางและปลายทางต้องเป็นคนละสาขา"],
        [{ preparerName: "", preparerUid: "" }, "กรุณาเลือกผู้จัดใบโอน"],
        [{ receipt: "incomplete", note: "" }, "กรณีสินค้าไม่ครบ ต้องระบุหมายเหตุว่าขาดอะไร"],
        [{ toBranchCode: "NOPE" }, "สาขาต้นทาง/ปลายทางไม่ถูกต้องหรือถูกปิดใช้งาน"]
      ];
      for (const [overrides, message] of cases) {
        const response = await call("POST", { rows: [row(overrides)] });
        expect(response.status).toBe(400);
        expect((await response.json()).error).toBe(message);
      }
      expect(transferPaths(state.db)).toHaveLength(0);
    });

    it("answers 409 and writes nothing when a number repeats inside the payload", async () => {
      const response = await call("POST", { rows: [row(), row({ transferNumber: "TR-0419" }), row({ transferNumber: "tr-0418" })] });
      expect(response.status).toBe(409);
      expect((await response.json()).error).toBe("เลขที่ใบโอน TR-0418 ซ้ำกันในรายการที่กำลังบันทึก");
      expect(transferPaths(state.db)).toHaveLength(0);
      expect(registryPaths(state.db)).toHaveLength(0);
    });

    it("answers 409 and writes nothing for the other rows when one number is already registered", async () => {
      await postOne({ transferNumber: "TR-0500" });
      const before = state.db.docs.size;
      const response = await call("POST", { rows: [row({ transferNumber: "TR-0501" }), row({ transferNumber: "TR-0500" })] });
      expect(response.status).toBe(409);
      expect((await response.json()).error).toBe("เลขที่ใบโอน TR-0500 ถูกบันทึกแล้ว");
      expect(state.db.docs.size).toBe(before);
    });
  });

  describe("GET", () => {
    it("lists a day sorted open first with a summary that ignores deleted documents", async () => {
      const complete = await postOne({ transferNumber: "TR-0001" });
      const open = await postOne({ transferNumber: "TR-0002", receipt: "incomplete", note: "ขาด" });
      const gone = await postOne({ transferNumber: "TR-0003" });
      await call("DELETE", { id: gone.id, reason: "ผิดเลข" });
      const today = complete.serviceDate;
      const response = await call("GET", undefined, `?date=${today}`);
      const { data } = await response.json();
      expect(data.items.map((item) => item.id)).toEqual([open.id, complete.id]);
      expect(data.summary).toEqual({ total: 2, complete: 1, open: 1, resolved: 0, incomplete: 1 });
      const withDeleted = (await (await call("GET", undefined, `?date=${today}&includeDeleted=true`)).json()).data;
      expect(withDeleted.items).toHaveLength(3);
    });

    it("rejects a malformed date and answers 422 over the day cap", async () => {
      expect((await call("GET", undefined, "?date=28-10-2026")).status).toBe(400);
      const seed = { "store_settings/default": settingsDoc };
      for (let i = 0; i < 251; i += 1) seed[`store_transfers/t${i}`] = { serviceDate: "2026-10-28", receipt: "complete", createdAt: "2026-10-28T01:00:00.000Z" };
      state.db = createDb(seed);
      expect((await call("GET", undefined, "?date=2026-10-28")).status).toBe(422);
    });

    it("searches without a date across number, reference, note and resolution text", async () => {
      await postOne({ transferNumber: "TR-0001", requestRef: "RQ-1111" });
      await postOne({ transferNumber: "TR-0002", receipt: "incomplete", note: "นมโอ๊ตขาด" });
      const byNote = (await (await call("GET", undefined, `?q=${encodeURIComponent("นมโอ๊ต")}`)).json()).data.items;
      expect(byNote.map((item) => item.transferNumber)).toEqual(["TR-0002"]);
      const byRef = (await (await call("GET", undefined, "?q=rq-1111")).json()).data.items;
      expect(byRef.map((item) => item.transferNumber)).toEqual(["TR-0001"]);
    });

    it("returns open alerts across days without deleted ones", async () => {
      const open = await postOne({ transferNumber: "TR-0001", receipt: "incomplete", note: "ขาด" });
      const deleted = await postOne({ transferNumber: "TR-0002", receipt: "incomplete", note: "ขาด" });
      await postOne({ transferNumber: "TR-0003" });
      await call("DELETE", { id: deleted.id, reason: "ผิด" });
      const { data } = await (await call("GET", undefined, "?alerts=true")).json();
      expect(data.count).toBe(1);
      expect(data.items[0].id).toBe(open.id);
      expect(data.capped).toBe(false);
    });

    it("returns one document with its history, or 404", async () => {
      const saved = await postOne({});
      const { data } = await (await call("GET", undefined, `?id=${saved.id}`)).json();
      expect(data).toMatchObject({ id: saved.id, transferNumber: "TR-0418" });
      expect(data.history.map((event) => event.event)).toEqual(["created"]);
      expect((await call("GET", undefined, "?id=missing")).status).toBe(404);
    });
  });

  describe("canonical case synchronization", () => {
    it("reopens a resolved legacy transfer without moving its origin or losing its original close activity", async () => {
      const createdAt = "2026-01-01T02:00:00.000Z";
      const resolvedAt = "2026-02-01T03:00:00.000Z";
      state.db.docs.set("store_transfers/legacy", { ...row({ receipt: "incomplete", note: "ขาด" }), issueState: "resolved", createdAt, updatedAt: resolvedAt, resolution: { at: resolvedAt, byUid: "old-solver", byName: "ผู้แก้เดิม", text: "ส่งเพิ่มแล้ว" } });
      expect((await call("PATCH", { id: "legacy", action: "reopen" })).status).toBe(200);
      const value = state.db.docs.get("store_cases/transfer_legacy");
      expect(value).toMatchObject({ status: "reopened", createdAt, sourceCreatedAt: createdAt, originDateEstimated: true, discoveredAt: "" });
      expect(value.history.filter((event) => event.action === "closed")).toMatchObject([{ effectiveAt: resolvedAt, actorUid: "old-solver", actorName: "ผู้แก้เดิม", note: "ส่งเพิ่มแล้ว", legacyImported: true, closure: "exception" }]);
      expect(value.history.find((event) => event.action === "closed").recordedAt).not.toBe(resolvedAt);
    });

    it("creates an incomplete transfer case immediately and retains the same case after resolve and reopen", async () => {
      const saved = await postOne({ receipt: "incomplete", note: "ขาดแก้ว" });
      const casePath = `store_cases/transfer_${saved.id}`;
      expect(state.db.docs.get(casePath)).toMatchObject({ sourceType: "transfer", sourceId: saved.id, sourceNumber: "TR-0418", status: "open", lines: [], createdAt: saved.createdAt, originDateEstimated: false });
      expect((await call("PATCH", { id: saved.id, action: "resolve", text: "ตรวจรับแล้ว" })).status).toBe(200);
      expect(state.db.docs.get(casePath)).toMatchObject({ status: "closed", closure: "exception", closureReason: "ตรวจรับแล้ว" });
      expect((await call("PATCH", { id: saved.id, action: "reopen" })).status).toBe(200);
      expect(state.db.docs.get(casePath).status).toBe("reopened");
      expect([...state.db.docs.keys()].filter((path) => path.startsWith("store_cases/"))).toEqual([casePath]);
    });
    it("does not leave duplicate source cases behind when Firestore retries a create transaction", async () => {
      const run = state.db.runTransaction.bind(state.db);
      state.db.runTransaction = async (callback) => {
        await callback({ get: (ref) => ref.get(), set() {}, update() {}, create() {}, delete() {} });
        return run(callback);
      };
      const saved = await postOne({ receipt: "incomplete", note: "ขาด" });
      expect(transferPaths(state.db)).toEqual([`store_transfers/${saved.id}`]);
      expect([...state.db.docs.keys()].filter((path) => path.startsWith("store_cases/"))).toEqual([`store_cases/transfer_${saved.id}`]);
      expect(state.db.docs.get(`store_cases/transfer_${saved.id}`).sourceId).toBe(saved.id);
    });
    it("creates a first-problem case when an initially complete transfer is corrected", async () => {
      const saved = await postOne({});
      expect(state.db.docs.has(`store_cases/transfer_${saved.id}`)).toBe(false);
      expect((await call("PUT", { id: saved.id, ...row({ receipt: "incomplete", note: "พบขาด" }), reason: "นับใหม่", baseUpdatedAt: saved.updatedAt })).status).toBe(200);
      expect(state.db.docs.get(`store_cases/transfer_${saved.id}`)).toMatchObject({ sourceId: saved.id, status: "open", originDateEstimated: false, sourceCreatedAt: saved.createdAt });
    });
    it("advances the source version on a mutation even if its old version is ahead of the request clock", async () => {
      const saved = await postOne({ receipt: "incomplete", note: "ขาด" });
      const future = "2099-01-01T00:00:00.000Z";
      state.db.docs.set(`store_transfers/${saved.id}`, { ...saved, updatedAt: future });
      expect((await call("PATCH", { id: saved.id, action: "resolve", text: "รับแล้ว" })).status).toBe(200);
      expect(Date.parse(state.db.docs.get(`store_transfers/${saved.id}`).updatedAt)).toBeGreaterThan(Date.parse(future));
      expect(state.db.docs.get(`store_transfers/${saved.id}`).createdAt).toBe(saved.createdAt);
    });

    it("blocks legacy resolve while known goods are outstanding", async () => {
      const saved = await postOne({ receipt: "incomplete", note: "ขาด" });
      state.db.docs.set(`store_cases/transfer_${saved.id}`, { status: "open", note: "ขาด", lines: [{ id: "a", required: 5, received: 1, cancelled: 0 }], history: [] });
      expect((await call("PATCH", { id: saved.id, action: "resolve", text: "ปิด" })).status).toBe(400);
      expect(state.db.docs.get(`store_transfers/${saved.id}`).issueState).toBe("open");
    });
    it("closes and reopens the same canonical case in the source transaction", async () => {
      const saved = await postOne({ receipt: "incomplete", note: "ขาด" });
      state.db.docs.set(`store_cases/transfer_${saved.id}`, { status: "open", note: "ขาด", sourceId: saved.id, lines: [{ id: "a", required: 5, received: 5, cancelled: 0 }], history: [] });
      expect((await call("PATCH", { id: saved.id, action: "resolve", text: "รับครบ" })).status).toBe(200);
      expect(state.db.docs.get(`store_cases/transfer_${saved.id}`)).toMatchObject({ status: "closed", closure: "fulfilled", sourceId: saved.id });
      expect((await call("PATCH", { id: saved.id, action: "reopen" })).status).toBe(200);
      expect(state.db.docs.get(`store_cases/transfer_${saved.id}`)).toMatchObject({ status: "reopened", closure: "" });
    });
    it("marks the canonical case as an exception when its source is deleted", async () => {
      const saved = await postOne({ receipt: "incomplete", note: "ขาด" });
      state.db.docs.set(`store_cases/transfer_${saved.id}`, { status: "open", lines: [], history: [] });
      expect((await call("DELETE", { id: saved.id, reason: "เอกสารผิด" })).status).toBe(200);
      expect(state.db.docs.get(`store_cases/transfer_${saved.id}`)).toMatchObject({ status: "closed", closure: "exception" });
    });
  });

  describe("PATCH resolve / reopen", () => {
    it("requires resolution text, resolves once, then answers 409", async () => {
      const open = await postOne({ receipt: "incomplete", note: "ขาด" });
      expect((await call("PATCH", { id: open.id, action: "resolve", text: "  " })).status).toBe(400);
      const response = await call("PATCH", { id: open.id, action: "resolve", text: "ส่งเพิ่มรอบบ่าย" });
      expect(response.status).toBe(200);
      expect(state.db.docs.get(`store_transfers/${open.id}`)).toMatchObject({ issueState: "resolved", resolution: { text: "ส่งเพิ่มรอบบ่าย", byUid: "store-1", byName: "สโตร์หนึ่ง" } });
      expect(state.db.docs.get(`store_transfers/${open.id}`).resolvedServiceDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      const again = await call("PATCH", { id: open.id, action: "resolve", text: "อีกที" });
      expect(again.status).toBe(409);
      expect(state.db.docs.get(`store_transfers/${open.id}`).resolution.text).toBe("ส่งเพิ่มรอบบ่าย");
    });

    it("lets any store user resolve and records the resolver", async () => {
      const open = await postOne({ receipt: "incomplete", note: "ขาด" });
      state.uid = "store-9";
      expect((await call("PATCH", { id: open.id, action: "resolve", text: "ปิดเรื่อง" })).status).toBe(200);
      expect(state.db.docs.get(`store_transfers/${open.id}`).resolution.byUid).toBe("store-9");
    });

    it("refuses to resolve complete documents and unknown ids", async () => {
      const complete = await postOne({});
      expect((await call("PATCH", { id: complete.id, action: "resolve", text: "x" })).status).toBe(409);
      expect((await call("PATCH", { id: "missing", action: "resolve", text: "x" })).status).toBe(404);
      expect((await call("PATCH", { id: complete.id, action: "explode" })).status).toBe(400);
    });

    it("reopens a resolved document and logs both events", async () => {
      const open = await postOne({ receipt: "incomplete", note: "ขาด" });
      expect((await call("PATCH", { id: open.id, action: "reopen" })).status).toBe(409);
      await call("PATCH", { id: open.id, action: "resolve", text: "แก้แล้ว" });
      const response = await call("PATCH", { id: open.id, action: "reopen", reason: "ของยังไม่มา" });
      expect(response.status).toBe(200);
      expect(state.db.docs.get(`store_transfers/${open.id}`)).toMatchObject({ issueState: "open", resolution: null, resolvedServiceDate: "" });
      const events = historyPaths(state.db).map((p) => state.db.docs.get(p).event).sort();
      expect(events).toEqual(["created", "reopened", "resolved"]);
    });
  });

  describe("PUT", () => {
    it("saves both warehouses and preserves their names on later edits and old clients", async () => {
      const branches = [
        { ...settingsDoc.branches[0], warehouses: [{ id: "w1", name: "คลังหนึ่ง", active: true }] },
        { ...settingsDoc.branches[1], warehouses: [{ id: "w2", name: "คลังสอง", active: true }] }
      ];
      state.db.docs.set("store_settings/default", { ...settingsDoc, branches });
      const saved = await postOne({ fromWarehouseId: "w1", toWarehouseId: "w2" });
      expect(saved).toMatchObject({ fromWarehouseId: "w1", fromWarehouseName: "คลังหนึ่ง", toWarehouseId: "w2", toWarehouseName: "คลังสอง" });
      branches[0].warehouses[0] = { id: "w1", name: "ชื่อใหม่", active: false };
      const response = await call("PUT", { id: saved.id, ...row(), reason: "แก้ไข" });
      expect(response.status).toBe(200);
      expect(state.db.docs.get(`store_transfers/${saved.id}`)).toMatchObject({ fromWarehouseId: "w1", fromWarehouseName: "คลังหนึ่ง", toWarehouseId: "w2", toWarehouseName: "คลังสอง" });
      const event = historyPaths(state.db).map((p) => state.db.docs.get(p)).find((entry) => entry.event === "updated");
      expect(event).toMatchObject({ before: { fromWarehouseId: "w1" }, after: { fromWarehouseId: "w1" } });
    });

    it("clears an old warehouse when an older client changes its branch", async () => {
      state.db.docs.set("store_settings/default", { ...settingsDoc, branches: [{ ...settingsDoc.branches[0], warehouses: [{ id: "w1", name: "คลังหนึ่ง", active: true }] }, settingsDoc.branches[1]] });
      const saved = await postOne({ fromWarehouseId: "w1" });
      const response = await call("PUT", { id: saved.id, ...row({ fromBranchCode: "BR01", toBranchCode: "WH" }), reason: "สลับสาขา" });
      expect(response.status).toBe(200);
      expect(state.db.docs.get(`store_transfers/${saved.id}`)).toMatchObject({ fromBranchCode: "BR01", fromWarehouseId: "", fromWarehouseName: "" });
    });
    it("lets another store account correct branches and keeps the editor and before/after history", async () => {
      const saved = await postOne({});
      state.uid = "store-9";
      const edit = { id: saved.id, ...row({ fromBranchCode: "BR01", toBranchCode: "WH" }) };
      const noReason = await call("PUT", edit);
      expect(noReason.status).toBe(400);
      expect((await noReason.json()).error).toBe("กรุณาระบุเหตุผลในการแก้ไข");
      expect((await call("PUT", { ...edit, reason: "เลือกสาขาผิด" })).status).toBe(200);
      expect(state.db.docs.get(`store_transfers/${saved.id}`)).toMatchObject({ createdByUid: "store-1", fromBranchCode: "BR01", fromBranchName: "สาขา 01", toBranchCode: "WH", toBranchName: "คลังหลัก" });
      const event = historyPaths(state.db).map((p) => state.db.docs.get(p)).find((item) => item.event === "updated");
      expect(event).toMatchObject({ byUid: "store-9", reason: "เลือกสาขาผิด", before: { fromBranchCode: "WH", toBranchCode: "BR01" }, after: { fromBranchCode: "BR01", toBranchCode: "WH" } });
    });

    it("rejects stale edits without overwriting a later change", async () => {
      const saved = await postOne({});
      state.db.docs.set(`store_transfers/${saved.id}`, { ...saved, updatedAt: "2099-01-01T00:00:00.000Z" });
      const response = await call("PUT", { id: saved.id, ...row({ toBranchCode: "WH" }), reason: "แก้ไข", baseUpdatedAt: saved.updatedAt });
      expect(response.status).toBe(409);
      expect(state.db.docs.get(`store_transfers/${saved.id}`).updatedAt).toBe("2099-01-01T00:00:00.000Z");
    });

    it("keeps the original inactive preparer when correcting other fields", async () => {
      const saved = await postOne({});
      state.db.docs.set("users/store-2", { role: "store", name: "สโตร์สอง", active: false });
      const response = await call("PUT", { id: saved.id, ...row({ fromBranchCode: "BR01", toBranchCode: "WH" }), reason: "เลือกสาขาผิด" });
      expect(response.status).toBe(200);
      expect(state.db.docs.get(`store_transfers/${saved.id}`)).toMatchObject({ preparerUid: "store-2", preparerName: "สโตร์สอง" });
    });

    it("rejects a change to an inactive preparer while allowing the original one", async () => {
      const saved = await postOne({});
      state.db.docs.set("users/store-3", { role: "store", name: "เลิกใช้งาน", active: false });
      const response = await call("PUT", { id: saved.id, ...row({ preparerUid: "store-3", preparerName: "เลิกใช้งาน" }), reason: "แก้ผู้จัด" });
      expect(response.status).toBe(400);
      expect(state.db.docs.get(`store_transfers/${saved.id}`).preparerUid).toBe("store-2");
    });

    it("changes the number by reserving the new one and releasing the old one", async () => {
      const saved = await postOne({});
      const response = await call("PUT", { id: saved.id, ...row({ transferNumber: "TR-0999" }), reason: "พิมพ์ผิด" });
      expect(response.status).toBe(200);
      expect(registryPaths(state.db)).toEqual(["store_document_registry/transfer__all__TR-0999"]);
      expect(state.db.docs.get(`store_transfers/${saved.id}`)).toMatchObject({ transferNumber: "TR-0999", registryId: "transfer__all__TR-0999" });
      const updated = historyPaths(state.db).map((p) => state.db.docs.get(p)).find((event) => event.event === "updated");
      expect(updated).toMatchObject({ reason: "พิมพ์ผิด", before: { transferNumber: "TR-0418" }, after: { transferNumber: "TR-0999" } });
    });

    it("answers 409 without changes when the new number is taken", async () => {
      const first = await postOne({ transferNumber: "TR-0001" });
      await postOne({ transferNumber: "TR-0002" });
      const response = await call("PUT", { id: first.id, ...row({ transferNumber: "TR-0002" }), reason: "x" });
      expect(response.status).toBe(409);
      expect(state.db.docs.get(`store_transfers/${first.id}`).transferNumber).toBe("TR-0001");
      expect(registryPaths(state.db)).toHaveLength(2);
    });

    it("switches the follow-up state when the receipt result changes", async () => {
      const saved = await postOne({});
      await call("PUT", { id: saved.id, ...row({ receipt: "incomplete", note: "ขาด 1" }), reason: "นับใหม่" });
      expect(state.db.docs.get(`store_transfers/${saved.id}`)).toMatchObject({ receipt: "incomplete", issueState: "open", note: "ขาด 1" });
      await call("PATCH", { id: saved.id, action: "resolve", text: "ส่งแล้ว" });
      await call("PUT", { id: saved.id, ...row({ receipt: "complete" }), reason: "ครบแล้ว" });
      expect(state.db.docs.get(`store_transfers/${saved.id}`)).toMatchObject({ receipt: "complete", issueState: "", resolution: null, note: "" });
    });

    it("validates the edited row and refuses deleted documents", async () => {
      const saved = await postOne({});
      expect((await call("PUT", { id: saved.id, ...row({ toBranchCode: "WH" }), reason: "x" })).status).toBe(400);
      await call("DELETE", { id: saved.id, reason: "ลบ" });
      expect((await call("PUT", { id: saved.id, ...row(), reason: "x" })).status).toBe(403);
    });
  });

  describe("DELETE", () => {
    it("soft-deletes with a reason, releases the number and allows keying it again", async () => {
      const saved = await postOne({});
      state.uid = "store-9";
      expect((await call("DELETE", { id: saved.id, reason: "x" })).status).toBe(403);
      state.uid = "store-1";
      const noReason = await call("DELETE", { id: saved.id });
      expect(noReason.status).toBe(400);
      expect((await noReason.json()).error).toBe("กรุณาระบุเหตุผลในการลบ");

      const response = await call("DELETE", { id: saved.id, reason: "ผิดใบ" });
      expect(response.status).toBe(200);
      expect(state.db.docs.get(`store_transfers/${saved.id}`)).toMatchObject({ deletedBy: "สโตร์หนึ่ง", deleteReason: "ผิดใบ" });
      expect(registryPaths(state.db)).toHaveLength(0);

      const again = await postOne({});
      expect(again.id).not.toBe(saved.id);
      expect(registryPaths(state.db)).toHaveLength(1);
      expect((await call("DELETE", { id: saved.id, reason: "อีก" })).status).toBe(403);
    });
  });
});
