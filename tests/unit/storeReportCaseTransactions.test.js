import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ db: null, role: "store" }));
vi.mock("../../lib/workflowAuth.js", () => ({
  requireProfile: async (_request, roles) => {
    if (!roles.includes(state.role)) throw Object.assign(new Error("Forbidden"), { status: 403 });
    return { profile: { uid: "store-1", role: state.role, name: "หนึ่ง", email: "s@hillkoff.com" }, db: state.db };
  },
  errorResponse: (error) => Response.json({ ok: false, error: error.message }, { status: error.status || 500 })
}));

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


const report = { type: "online", status: "partial", packStatus: "partial", serviceDate: "2026-11-10", createdByUid: "store-1", createdAt: "2026-11-10T01:00:00.000Z", updatedAt: "2026-11-10T02:00:00.000Z", note: "ขาด", workflowHistory: [] };
const knownCase = (remaining = 0) => ({ sourceType: "online", sourceId: "r1", status: "working", note: "ขาด", lines: [{ id: "a", required: 5, received: 5 - remaining, cancelled: 0 }], history: [] });
let route;
const call = (method, body) => route[method](new Request("http://localhost/api/store/reports", { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }));
const pack = (packStatus, extra = {}) => call("PATCH", { id: "r1", packStatus, checkerName: "ห้องแพ็ค", ...extra });
const savedCase = () => state.db.docs.get("store_cases/online_r1");

describe("report source and canonical case transactions", () => {
  beforeEach(async () => {
    state.role = "pack";
    state.db = createDb({ "store_reports/r1": report, "store_cases/online_r1": knownCase() });
    // These endpoints formerly used write batches; support them so a missing transaction
    // fails on observable case state, rather than on a missing Firestore method.
    state.db.getAll = (...refs) => Promise.all(refs.map((ref) => ref.get()));
    state.db.batch = () => {
      const writes = [];
      return { set: (ref, value, options) => writes.push(() => state.db.docs.set(ref.path, options?.merge ? { ...state.db.docs.get(ref.path), ...value } : value)), update: (ref, value) => writes.push(() => state.db.docs.set(ref.path, { ...state.db.docs.get(ref.path), ...value })), commit: async () => { writes.forEach((write) => write()); } };
    };
    route = await import("../../app/api/store/reports/route.js");
  });

  it("retains a first pack problem after checking without requiring a visit to the case page", async () => {
    state.db.docs.delete("store_cases/online_r1");
    state.db.docs.set("store_reports/r1", { ...report, status: "saved", packStatus: "pending" });
    expect((await pack("partial")).status).toBe(200);
    expect(savedCase()).toMatchObject({ sourceType: "online", sourceId: "r1", status: "open", originDateEstimated: false, sourceCreatedAt: report.createdAt });
    const createdAt = savedCase().createdAt;
    expect((await pack("checked")).status).toBe(200);
    expect(savedCase()).toMatchObject({ status: "closed", closure: "exception", createdAt });
    expect((await pack("returned", { reason: "พบขาดอีก" })).status).toBe(200);
    expect(savedCase()).toMatchObject({ status: "reopened", createdAt });
    expect([...state.db.docs.keys()].filter((path) => path.startsWith("store_cases/"))).toEqual(["store_cases/online_r1"]);
  });
  it("creates cases for reports initially saved with partial or waiting status", async () => {
    state.role = "store";
    const response = await call("POST", { type: "online", checkerName: "สโตร์", rows: [{ detail: "ขาดหนึ่ง", status: "partial" }, { detail: "รอของ", status: "waiting" }, { detail: "ครบ", status: "saved" }] });
    expect(response.status).toBe(200);
    const saved = (await response.json()).data;
    for (const source of saved.slice(0, 2)) expect(state.db.docs.get(`store_cases/online_${source.id}`)).toMatchObject({ sourceId: source.id, status: "open", createdAt: source.createdAt, originDateEstimated: false });
    expect(state.db.docs.has(`store_cases/online_${saved[2].id}`)).toBe(false);
  });
  it("never regresses the report version when the request clock is older", async () => {
    const future = "2099-01-01T00:00:00.000Z";
    state.db.docs.set("store_reports/r1", { ...report, updatedAt: future });
    expect((await pack("checked")).status).toBe(200);
    expect(Date.parse(state.db.docs.get("store_reports/r1").updatedAt)).toBeGreaterThan(Date.parse(future));
  });
  it("closes a fulfilled case when pack confirms the source", async () => {
    expect((await pack("checked")).status).toBe(200);
    expect(savedCase()).toMatchObject({ status: "closed", closure: "fulfilled" });
    expect(state.db.docs.get("store_reports/r1").packStatus).toBe("checked");
  });
  it("rejects pack confirmation atomically when goods remain outstanding", async () => {
    state.db.docs.set("store_cases/online_r1", knownCase(2));
    expect((await pack("checked")).status).toBe(400);
    expect(state.db.docs.get("store_reports/r1").packStatus).toBe("partial");
    expect(savedCase().status).toBe("working");
  });
  it("reopens the canonical case when pack returns the source", async () => {
    state.db.docs.set("store_cases/online_r1", { ...knownCase(), status: "closed", closure: "fulfilled" });
    expect((await pack("returned", { reason: "พบปัญหาใหม่" })).status).toBe(200);
    expect(savedCase()).toMatchObject({ status: "reopened", closure: "" });
  });
  it("keeps the case open while a correction waits for pack confirmation", async () => {
    state.role = "store";
    expect((await call("PATCH", { action: "resubmit", id: "r1", checkerName: "สโตร์" })).status).toBe(200);
    expect(savedCase().status).not.toBe("closed");
    expect(state.db.docs.get("store_reports/r1").packStatus).toBe("pending");
  });
  it("updates source metadata without losing canonical item quantities", async () => {
    state.role = "store";
    expect((await call("PUT", { id: "r1", bookingNumber: "", status: "partial", note: "ตรวจใหม่", detail: "รายละเอียด", reason: "แก้ข้อความ" })).status).toBe(200);
    expect(savedCase()).toMatchObject({ note: "ตรวจใหม่", lines: [{ id: "a", required: 5, received: 5, cancelled: 0 }] });
  });
  it("does not reopen a closed case when an unchanged source stage accompanies a metadata edit", async () => {
    state.role = "store";
    state.db.docs.set("store_cases/online_r1", { ...knownCase(), status: "closed", closure: "fulfilled" });
    expect((await call("PUT", { id: "r1", bookingNumber: "", status: "partial", note: "ตรวจใหม่", reason: "แก้ข้อความ" })).status).toBe(200);
    expect(savedCase()).toMatchObject({ status: "closed", closure: "fulfilled" });
  });
  it("rejects a source changed after validation without overwriting the newer source or case", async () => {
    const original = state.db.runTransaction.bind(state.db);
    state.db.runTransaction = async (callback) => {
      state.db.docs.set("store_reports/r1", { ...report, updatedAt: "2026-11-10T03:00:00.000Z", note: "ใหม่กว่า" });
      return original(callback);
    };
    expect((await pack("checked")).status).toBe(409);
    expect(state.db.docs.get("store_reports/r1").note).toBe("ใหม่กว่า");
    expect(savedCase().status).toBe("working");
  });
  it("closes the case by exception when the source is deleted", async () => {
    state.role = "store";
    expect((await call("DELETE", { id: "r1", reason: "เอกสารผิด" })).status).toBe(200);
    expect(savedCase()).toMatchObject({ status: "closed", closure: "exception" });
  });
  it("keeps every report unchanged when one bulk confirmation has outstanding goods", async () => {
    state.db.docs.set("store_reports/r1", { ...report, packStatus: "pending" });
    state.db.docs.set("store_reports/r2", { ...report, packStatus: "pending" });
    state.db.docs.set("store_cases/online_r2", { ...knownCase(1), sourceId: "r2" });
    expect((await call("PATCH", { action: "bulk_confirm", ids: ["r1", "r2"], type: "online", checkerName: "ห้องแพ็ค" })).status).toBe(400);
    expect(state.db.docs.get("store_reports/r1").packStatus).toBe("pending");
    expect(state.db.docs.get("store_reports/r2").packStatus).toBe("pending");
  });
});
