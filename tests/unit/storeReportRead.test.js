import { describe, expect, it } from "vitest";
import { SERVICE_DATE_SINCE, readStoreReportsByDate } from "../../lib/storeReportRead.js";

function createDb(rows) {
  const log = [];
  return {
    log,
    collection(name) {
      const q = { wheres: [], selected: null };
      const query = {
        where(field, op, value) { q.wheres.push([field, op, value]); return query; },
        orderBy(field) { q.order = field; return query; },
        select(...fields) { q.selected = fields; return query; },
        limit(n) { q.max = n; return query; },
        async get() {
          log.push({ name, ...q });
          const docs = Object.entries(rows).filter(([, row]) => q.wheres.every(([f, op, v]) => (op === ">=" ? row[f] >= v : op === "<=" ? row[f] <= v : op === "<" ? row[f] < v : false)));
          return { docs: docs.slice(0, q.max).map(([id, row]) => ({ id, data: () => row })) };
        }
      };
      return query;
    }
  };
}

describe("readStoreReportsByDate", () => {
  const rows = {
    old: { createdAt: "2026-07-13T03:00:00.000Z" },
    early: { serviceDate: "2026-07-15", createdAt: "2026-07-15T03:00:00.000Z" },
    now: { serviceDate: "2026-11-19", createdAt: "2026-11-19T03:00:00.000Z" },
    backdated: { serviceDate: "2026-11-01", createdAt: "2026-11-19T04:00:00.000Z" }
  };

  it("reads recent ranges once, by service date, with an optional projection", async () => {
    const db = createDb(rows);
    const result = await readStoreReportsByDate(db, { from: "2026-11-01", to: "2026-11-30", cap: 10, fields: ["type"] });
    expect(result.map((r) => r.id).sort()).toEqual(["backdated", "now"]);
    expect(db.log).toHaveLength(1);
    expect(db.log[0]).toMatchObject({ order: "serviceDate", selected: ["type"], max: 11 });
  });

  it("also reads by creation time when the range reaches the first days of the system", async () => {
    const db = createDb(rows);
    expect(SERVICE_DATE_SINCE).toBe("2026-07-16");
    const result = await readStoreReportsByDate(db, { from: "2026-07-01", to: "2026-07-31", cap: 10 });
    expect(result.map((r) => r.id).sort()).toEqual(["early", "old"]);
    expect(db.log.map((q) => q.order)).toEqual(["serviceDate", "createdAt"]);
  });

  it("refuses more than the cap", async () => {
    const db = createDb(rows);
    await expect(readStoreReportsByDate(db, { from: "2026-11-01", to: "2026-11-30", cap: 1 })).rejects.toMatchObject({ status: 422 });
  });
});
