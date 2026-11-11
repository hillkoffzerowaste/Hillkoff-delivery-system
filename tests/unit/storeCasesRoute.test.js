vi.mock("../../lib/storeRoster.js", () => ({ readStoreRoster: async () => [{ uid: "u", name: "Store" }] }));
import { beforeEach, describe, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({ role: "store", db: null }));
vi.mock("../../lib/workflowAuth", () => ({ requireProfile: async (_req, roles) => { if (!roles.includes(state.role)) throw Object.assign(new Error("Forbidden"), { status: 403 }); return { db: state.db, profile: { uid: "u", name: "Store" } }; }, errorResponse: (e) => Response.json({ ok: false, error: e.message }, { status: e.status || 500 }) }));
function database() {
  const data = { store_transfers: new Map([["t1", { receipt: "incomplete", issueState: "open", note: "ขาด", createdAt: "2026-11-01T00:00:00Z", transferNumber: "TR1" }]]), store_cases: new Map(), store_reports: new Map(), store_audits: new Map() };
  const query = (name, filters = [], cap = Infinity) => ({ where: (field, op, value) => query(name, [...filters, [field, op, value]], cap), limit: (n) => query(name, filters, n), get: async () => ({ docs: [...data[name]].filter(([, row]) => filters.every(([f, op, v]) => op === "in" ? v.includes(row[f]) : op === ">" ? row[f] > v : row[f] === v)).slice(0, cap).map(([id, row]) => ({ id, data: () => row })) }) });
  const db = { data, collection: (name) => ({ ...query(name), doc: (id) => ({ name, id }), limit: (cap) => ({ get: async () => ({ docs: [...data[name]].slice(0, cap).map(([id, v]) => ({ id, data: () => v })) }) }) }), runTransaction: async (fn) => {
    const ops = [];
    const result = await fn({ get: async ({ name, id }) => ({ exists: data[name].has(id), data: () => data[name].get(id) }), set: (r, value) => ops.push(() => data[r.name].set(r.id, value)), update: (r, patch) => ops.push(() => data[r.name].set(r.id, { ...data[r.name].get(r.id), ...patch })) });
    ops.forEach((f) => f()); return result;
  } }; return db;
}
const body = { sourceType: "transfer", sourceId: "t1", baseUpdatedAt: "", status: "open", category: "shortage", lines: [{ id: "l1", name: "กาแฟ", sku: "A", unit: "ถุง", required: 5, received: 0, cancelled: 0 }] };
const call = async (method, input) => { const route = await import("../../app/api/store/cases/route.js"); return route[method](new Request("http://localhost/api/store/cases?from=2026-11-01&to=2026-11-10", { method, ...(input ? { body: JSON.stringify(input), headers: { "Content-Type": "application/json" } } : {}) })); };
beforeEach(() => { state.db = database(); state.role = "store"; });
describe("store cases API", () => {
  it("persists a deterministic case, rejects stale edits and closes source atomically", async () => {
    const created = await call("POST", body); expect(created.status).toBe(200);
    const item = (await created.json()).data;
    expect(item.createdAt).toBeTruthy(); expect(item.history[0].recordedAt).toBeTruthy();
    expect((await call("POST", body)).status).toBe(409);
    const closed = await call("POST", { ...body, baseUpdatedAt: item.updatedAt, status: "closed", closure: "fulfilled", lines: [{ ...body.lines[0], received: 5 }] });
    expect(closed.status).toBe(200); expect(state.db.data.store_cases.size).toBe(1);
    expect(state.db.data.store_transfers.get("t1").issueState).toBe("resolved");
  });
  it("returns legacy unknown lines and rejects oversize scans", async () => {
    const result = await call("GET"); expect(result.status).toBe(200);
    expect((await result.json()).data.items[0]).toMatchObject({ legacy: true, lines: [] });
    for (let i = 0; i < 6001; i++) state.db.data.store_cases.set(`c${i}`, {});
    expect((await call("GET")).status).toBe(422);
  });
  it("rejects unknown sources, client timestamps, malformed JSON and unauthorized roles", async () => {
    expect((await call("POST", { ...body, sourceId: "missing" })).status).toBe(404);
    expect((await call("POST", { ...body, createdAt: "2000-01-01" })).status).toBe(400);
    state.role = "driver"; expect((await call("GET")).status).toBe(403);
    state.role = "admin"; expect((await call("POST", body)).status).toBe(403);
  });
});


it("does not count a legacy case as newly created when adding detail", async () => {
  const item = (await (await call("POST", body)).json()).data;
  expect(item.createdAt).toBe("2026-11-01T00:00:00Z");
  expect(item.originDateEstimated).toBe(true);
});
it("rejects a fabricated responsible person", async () => {
  expect((await call("POST", { ...body, responsibleId: "fake", responsibleName: "ปลอม" })).status).toBe(400);
});


it("preserves the actual resolution when detailing an already closed legacy case", async () => {
  const at = "2026-10-20T04:00:00.000Z";
  state.db.data.store_transfers.get("t1").issueState = "resolved";
  state.db.data.store_transfers.get("t1").resolution = { at, text: "แก้แล้ว", byUid: "old" };
  const result = await call("POST", { ...body, status: "closed", closure: "exception", closureReason: "ข้อมูลเดิม", lines: [] });
  expect(result.status).toBe(200);
  const item = (await result.json()).data;
  expect(item.resolvedAt).toBe(at); expect(item.history.filter((e) => e.action === "closed")).toMatchObject([{ effectiveAt: at, legacyImported: true }]);
  expect(state.db.data.store_transfers.get("t1").resolution.at).toBe(at);
});
it("preserves an inactive historical case owner while editing metadata", async () => {
  const first = (await (await call("POST", body)).json()).data;
  state.db.data.store_cases.get(first.id).responsibleId = "retired";
  state.db.data.store_cases.get(first.id).responsibleName = "พนักงานเดิม";
  const result = await call("POST", { ...body, baseUpdatedAt: first.updatedAt, responsibleId: "retired", responsibleName: "ปลอม" });
  expect(result.status).toBe(200); expect((await result.json()).data.responsibleName).toBe("พนักงานเดิม");
});
it("does not scan healthy source documents into the problem cap", async () => {
  for (let i = 0; i < 6001; i++) state.db.data.store_reports.set(`r${i}`, { status: "saved", packStatus: "checked" });
  expect((await call("GET")).status).toBe(200);
});


it("filters GET closure activities by the selected actor including unknown actors", async () => {
  state.db.data.store_cases.set("online_a", { sourceType: "online", sourceId: "a", responsibleId: "different-owner", status: "closed", createdAt: "2026-11-01T01:00:00Z", history: [{ action: "closed", closure: "fulfilled", actorUid: "u", effectiveAt: "2026-11-10T03:00:00Z" }] });
  state.db.data.store_cases.set("online_b", { sourceType: "online", sourceId: "b", status: "closed", createdAt: "2026-11-01T01:00:00Z", closure: "exception", resolvedAt: "2026-11-10T03:00:00Z" });
  const { GET } = await import("../../app/api/store/cases/route.js");
  const summary = async (staffId) => (await (await GET(new Request(`http://localhost/api/store/cases?from=2026-11-10&to=2026-11-10&staffId=${staffId}`))).json()).data.summary;
  expect(await summary("")).toMatchObject({ resolvedActivities: 1, exceptionActivities: 1 });
  expect(await summary("u")).toMatchObject({ resolvedActivities: 1, exceptionActivities: 0 });
  expect(await summary("unknown")).toMatchObject({ resolvedActivities: 0, exceptionActivities: 1 });
});
