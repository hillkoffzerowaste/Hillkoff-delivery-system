import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ db: null }));
vi.mock("../../lib/workflowAuth.js", () => ({
  requireProfile: async () => ({ db: state.db, profile: { uid: "store-1", name: "สโตร์" } }),
  errorResponse: (error) => Response.json({ ok: false, error: error.message }, { status: error.status || 500 })
}));
import { POST } from "../../app/api/store/production/route.js";

const record = { branchCode: "HK1", serviceDate: "2026-11-19", documentNumber: "P1", note: "เช้า", items: [{ code: "A", name: "กาแฟ", unit: "kg", qty: 2, sold: 0 }] };
const request = (records) => new Request("http://localhost/api/store/production", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ requestId: "retry_12345", records }) });

describe("production save retry integrity", () => {
  let docs;
  beforeEach(() => {
    docs = new Map([["store_settings/default", { branches: [{ code: "HK1", name: "ช้างเผือก", type: "สาขา", active: true }, { code: "HQ", name: "สำนักงานใหญ่", type: "สาขา", active: true }] }]]);
    const ref = (path) => ({ path, id: path.split("/")[1], get: async () => ({ exists: docs.has(path), data: () => structuredClone(docs.get(path)) }) });
    state.db = {
      collection: (name) => ({ doc: (id) => ref(`${name}/${id}`) }),
      runTransaction: async (fn) => {
        const writes = [];
        const result = await fn({ get: (r) => r.get(), set: (r, data) => writes.push(() => docs.set(r.path, data)) });
        writes.forEach((write) => write());
        return result;
      }
    };
  });
  it("returns the same save for unchanged retries", async () => {
    const first = await (await POST(request([record]))).json();
    const retry = await POST(request([record]));
    expect(retry.status).toBe(200);
    expect((await retry.json()).data.created).toEqual(first.data.created);
  });
  it.each(["unit", "documentNumber", "note"])("rejects changed %s with 409", async (field) => {
    expect((await POST(request([record]))).status).toBe(200);
    const changed = field === "unit" ? { ...record, items: [{ ...record.items[0], unit: "ถุง" }] } : { ...record, [field]: "changed" };
    expect((await POST(request([changed]))).status).toBe(409);
  });
  it.each(["append", "truncate"])("rejects %s batch shape changes without writing", async (change) => {
    const initial = change === "append" ? [record] : [record, record];
    expect((await POST(request(initial))).status).toBe(200);
    const before = structuredClone([...docs.entries()]);
    expect((await POST(request(change === "append" ? [record, record] : [record]))).status).toBe(409);
    expect([...docs.entries()]).toEqual(before);
  });
  it("rejects a retry after the saved record was deleted", async () => {
    expect((await POST(request([record]))).status).toBe(200);
    docs.get("store_production/retry_12345_0").deletedAt = "2026-11-19T01:00:00Z";
    expect((await POST(request([record]))).status).toBe(409);
  });
  it.each(["unchanged", "append", "truncate"])("checks %s retries for legacy saves without batch metadata", async (change) => {
    const initial = change === "truncate" ? [record, record] : [record];
    expect((await POST(request(initial))).status).toBe(200);
    for (const [path, doc] of docs) if (path.startsWith("store_production/")) delete doc.requestRecordCount;
    const next = change === "append" ? [record, record] : [record];
    expect((await POST(request(next))).status).toBe(change === "unchanged" ? 200 : 409);
  });
});
