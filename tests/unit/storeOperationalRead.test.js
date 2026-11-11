import { expect, it, vi } from "vitest";
vi.mock("../../lib/storeRoster.js", () => ({ readStoreRoster: vi.fn(async () => [{ uid: "a", name: "A" }]) }));
import { readOperationalDashboard } from "../../lib/storeOperationalRead.js";
import { readStoreRoster } from "../../lib/storeRoster.js";

function database(rows = {}, overflow = false) {
  const calls = [];
  const query = (name, filters = [], cap = Infinity) => ({
    where: (field, op, value) => query(name, [...filters, [field, op, value]], cap), orderBy: () => query(name, filters, cap), limit: (n) => query(name, filters, n),
    get: async () => { calls.push({ name, filters, cap }); return { docs: (overflow ? Array.from({ length: cap }, (_, id) => ({ id })) : (rows[name] || []).filter((row) => filters.every(([field, op, value]) => op === "in" ? value.includes(row[field]) : op === ">=" ? row[field] >= value : op === "<=" ? row[field] <= value : op === "<" ? row[field] < value : op === ">" ? row[field] > value : row[field] === value))).slice(0, cap).map((row) => ({ id: String(row.id), data: () => row })) }; }
  });
  return { calls, collection: (name) => query(name) };
}
it("unions created and service-date reads once and merges global issues with canonical cases", async () => {
  vi.mocked(readStoreRoster).mockClear();
  const row = { id: "r", type: "booking", confirmedAt: "2026-11-11T01:00:00Z", createdAt: "2026-11-10T01:00:00Z", serviceDate: "2026-11-10", storeCheckerName: "A", status: "partial" };
  const db = database({ store_reports: [row], store_transfers: [{ id: "old", createdAt: "2026-10-01T00:00:00Z", receipt: "incomplete", issueState: "open" }], store_cases: [{ id: "canonical", sourceType: "booking", sourceId: "r", status: "closed", closure: "fulfilled", lines: [] }] });
  const data = await readOperationalDashboard(db, { from: "2026-11-10", to: "2026-11-10" });
  expect(data.documents).toHaveLength(1); expect(data.cases).toHaveLength(2);
  expect(data.cases.find((row) => row.sourceId === "r").legacy).toBe(false);
  expect(readStoreRoster).toHaveBeenCalledTimes(1);
  expect(db.calls.filter((call) => call.name === "store_reports" && call.filters.some(([field]) => field === "createdAt"))).toHaveLength(1);
  expect(db.calls.every((call) => Number.isFinite(call.cap))).toBe(true);
});
it("rejects cap+1 instead of returning misleading partial totals", async () => {
  await expect(readOperationalDashboard(database({}, true), { from: "2026-11-10", to: "2026-11-10" })).rejects.toMatchObject({ status: 422 });
});
