import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ db: null, role: "store" }));

vi.mock("../../lib/workflowAuth.js", () => ({
  requireProfile: async (_request, roles) => {
    if (!roles.includes(state.role)) throw Object.assign(new Error("Forbidden"), { status: 403 });
    return { profile: { uid: `${state.role}-1`, role: state.role, name: "สโตร์หนึ่ง", email: "s@hillkoff.com" }, db: state.db };
  },
  errorResponse: (error) => Response.json({ ok: false, error: error.message }, { status: error.status || 500 })
}));

const at = (date, hhmm) => new Date(`${date}T${hhmm}:00+07:00`).toISOString();
const DATE = "2026-10-28";

// Minimal in-memory Firestore: evaluates single-field where/orderBy/limit and records every query.
function createDb(collections, log) {
  const compare = { "==": (a, b) => a === b, ">=": (a, b) => a >= b, "<=": (a, b) => a <= b, "<": (a, b) => a < b, ">": (a, b) => a > b };
  const build = (name, wheres = [], order = [], selected = null, max = null) => ({
    doc: (id) => ({ get: async () => ({ exists: Boolean(collections[name]?.[id]), data: () => collections[name]?.[id] }) }),
    where: (field, op, value) => build(name, [...wheres, [field, op, value]], order, selected, max),
    orderBy: (field) => build(name, wheres, [...order, field], selected, max),
    select: (...fields) => build(name, wheres, order, fields, max),
    limit: (n) => build(name, wheres, order, selected, n),
    get: async () => {
      log.push({ name, wheres, order, selected, max });
      let rows = Object.entries(collections[name] || {}).filter(([, data]) => wheres.every(([f, op, v]) => data[f] !== undefined && compare[op](data[f], v)));
      if (order[0]) rows = rows.sort(([, a], [, b]) => String(a[order[0]]).localeCompare(String(b[order[0]])));
      if (max !== null) rows = rows.slice(0, max);
      const docs = rows.map(([id, data]) => ({ id, data: () => (selected ? Object.fromEntries(selected.filter((f) => f in data).map((f) => [f, data[f]])) : data) }));
      return { docs, size: docs.length };
    }
  });
  return { collection: (name) => build(name) };
}

function request(query) {
  return new Request(`http://localhost/api/store/daily-report?${query}`, { headers: { Authorization: "Bearer test" } });
}

function sampleData() {
  return {
    users: {
      u1: { role: "store", name: "สโตร์ 1", email: "one@hillkoff.com", phone: "0811111111", phoneDigits: "0811111111" },
      u2: { role: "store", name: "สโตร์ 2", email: "two@hillkoff.com", phone: "0822222222" },
      u3: { role: "store", username: "ผู้ใช้สาม", email: "three@hillkoff.com", active: false }
    },
    store_reports: {
      r1: { type: "booking", createdByUid: "u1", createdBy: "สโตร์ 1", storeCheckerName: "สโตร์ 1", serviceDate: DATE, createdAt: at(DATE, "08:32"), confirmedAt: at(DATE, "08:32"), bookingNumber: "SO-1" },
      r2: { type: "online", createdByUid: "u2", createdBy: "สโตร์ 2", storeCheckerName: "สโตร์ 2", serviceDate: DATE, createdAt: at(DATE, "09:00"), confirmedAt: at(DATE, "09:00") },
      old: { type: "booking", createdByUid: "u1", createdBy: "สโตร์ 1", storeCheckerName: "สโตร์ 1", serviceDate: "2026-10-01", createdAt: at("2026-10-01", "09:00"), confirmedAt: at("2026-10-01", "09:00") }
    },
    store_transfers: {
      t1: { preparerUid: "u2", preparerName: "สโตร์ 2", transferNumber: "TR-1", fromBranchName: "A", toBranchName: "B", receipt: "incomplete", note: "ขาด", issueState: "open", resolvedServiceDate: "", resolution: null, serviceDate: DATE, createdAt: at(DATE, "10:00") },
      t2: { preparerUid: "u1", preparerName: "สโตร์ 1", transferNumber: "TR-2", fromBranchName: "A", toBranchName: "B", receipt: "incomplete", note: "ผิด", issueState: "resolved", resolvedServiceDate: DATE, resolution: { text: "แก้แล้ว", byUid: "u2", byName: "สโตร์ 2", at: at(DATE, "11:00") }, serviceDate: "2026-10-20", createdAt: at("2026-10-20", "10:00") }
    },
    store_audits: {
      a1: { documentNumber: "AU-1", createdByUid: "u1", createdBy: "สโตร์ 1", branchName: "A", total: 100, mismatch: 2, serviceDate: DATE, createdAt: at(DATE, "13:00") }
    },
    orders: {
      o1: { customerName: "ร้านก", storeStatus: "checked", status: "secret", address: "ที่อยู่ลับ", updatedAt: at(DATE, "09:30"), workflowHistory: [{ role: "store", action: "store_update", uid: "u1", name: "สโตร์ 1", at: at(DATE, "09:30") }] },
      o2: { customerName: "ร้านข", storeStatus: "pending", updatedAt: at("2026-10-20", "09:30"), workflowHistory: [] }
    }
  };
}

let log;
beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(at(DATE, "15:00")));
  state.role = "store";
  log = [];
  state.db = createDb(sampleData(), log);
});
afterEach(() => vi.useRealTimers());

async function get(query) {
  const { GET } = await import("../../app/api/store/daily-report/route.js");
  return GET(request(query));
}

describe("GET /api/store/daily-report roles and validation", () => {
  it("includes configured active staff and retains former staff with recorded work", async () => {
    const data = sampleData();
    data.store_settings = { default: { staff: [{ id: "staff_1", name: "สมชาย", active: false }, { id: "staff_2", name: "สมหญิง", active: true }] } };
    data.store_transfers.t3 = { preparerUid: "staff_1", preparerName: "สมชาย", serviceDate: DATE, createdAt: at(DATE, "12:00"), receipt: "complete" };
    state.db = createDb(data, log);
    const result = await (await get(`date=${DATE}`)).json();
    expect(result.data.people).toContainEqual(expect.objectContaining({ uid: "staff_1", name: "สมชาย", transfer: 1 }));
    expect(result.data.people).toContainEqual(expect.objectContaining({ uid: "staff_2", name: "สมหญิง" }));
  });
  it.each(["store", "admin"])("allows %s", async (role) => {
    state.role = role;
    expect((await get(`date=${DATE}`)).status).toBe(200);
  });

  it.each(["pack", "sales"])("rejects %s with 403", async (role) => {
    state.role = role;
    const response = await get(`date=${DATE}`);
    expect(response.status).toBe(403);
    expect(log).toHaveLength(0);
  });

  it.each(["", "date=", "date=2026-13-01", "date=2026-02-30", "date=abc"])("rejects bad date query '%s'", async (query) => {
    const response = await get(query);
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ ok: false, error: "วันที่ไม่ถูกต้อง" });
  });

  it.each(["month=", "month=2026-13", "month=2026-1", "month=abc"])("rejects bad month query '%s'", async (query) => {
    const response = await get(query);
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ ok: false, error: "เดือนไม่ถูกต้อง" });
  });
});

describe("GET /api/store/daily-report?date=", () => {
  it("returns people, team, open issues and a seven day week", async () => {
    const response = await get(`date=${DATE}`);
    const { ok, data } = await response.json();
    expect(ok).toBe(true);
    expect(data).toMatchObject({ date: DATE, isToday: true });
    expect(typeof data.generatedAt).toBe("string");
    expect(data.people.map((p) => p.uid)).toEqual(["u1", "u2"]);
    const [u1, u2] = data.people;
    expect(u1).toMatchObject({ name: "สโตร์ 1", booking: 1, auditDocs: 1, auditItems: 100, mismatch: 2, resolved: 0, orderChecks: 1 });
    expect(u2).toMatchObject({ name: "สโตร์ 2", online: 1, transfer: 1, issues: 1, openIssues: 1, resolved: 1 });
    expect(data.openIssues).toEqual([{ no: "TR-1", note: "ขาด", owner: "สโตร์ 2" }]);
    expect(data.week).toHaveLength(7);
    expect(data.week[6].date).toBe(DATE);
  });

  it("marks a past date as not today", async () => {
    const { data } = await (await get("date=2026-10-27")).json();
    expect(data.isToday).toBe(false);
  });

  it("uses only single-field queries and reads orders with a field projection", async () => {
    await get(`date=${DATE}`);
    log.forEach((query) => {
      const fields = new Set(query.wheres.map(([field]) => field));
      expect(fields.size).toBe(1);
      if (query.order.length) expect(query.order).toEqual([[...fields][0]]);
    });
    const byName = (name) => log.filter((query) => query.name === name);
    expect(byName("store_reports")).toHaveLength(2);
    expect(byName("store_reports")[0]).toMatchObject({ order: ["createdAt"], max: 1501 });
    expect(byName("store_reports")[1]).toMatchObject({ order: ["serviceDate"], max: 1501 });
    expect(byName("store_transfers").map((q) => q.wheres[0][0]).sort()).toEqual(["issueState", "resolvedServiceDate", "serviceDate"]);
    expect(byName("store_audits")[0]).toMatchObject({ order: ["serviceDate"], max: 1001 });
    expect(byName("orders")).toHaveLength(1);
    expect(byName("orders")[0]).toMatchObject({ order: ["updatedAt"], selected: ["workflowHistory", "customerName", "storeStatus"], max: 801 });
    expect(byName("users")[0]).toMatchObject({ wheres: [["role", "==", "store"]], max: 101 });
  });

  it("does not leak emails, phones or other user fields", async () => {
    const body = await (await get(`date=${DATE}`)).text();
    expect(body).not.toContain("@hillkoff.com");
    expect(body).not.toContain("0811111111");
    expect(body).not.toContain("0822222222");
    expect(body).not.toContain("phone");
    expect(body).not.toContain("email");
    expect(body).not.toContain("ที่อยู่ลับ");
  });

  it("excludes disabled roster members", async () => {
    const { data } = await (await get(`date=${DATE}`)).json();
    expect(data.people.find((p) => p.uid === "u3")).toBeUndefined();
  });

  it.each([
    ["store_reports", "reports", 1500],
    ["store_transfers", "transfers", 1000],
    ["store_audits", "audits", 1000],
    ["users", "users", 100]
  ])("returns 422 when %s exceeds its cap", async (name, _label, cap) => {
    const big = Object.fromEntries(Array.from({ length: cap + 1 }, (_, i) => [`x${i}`, name === "users" ? { role: "store", name: `n${i}` } : { createdAt: at(DATE, "09:00"), serviceDate: DATE, resolvedServiceDate: DATE, updatedAt: at(DATE, "09:00"), issueState: "open" }]));
    state.db = createDb({ ...sampleData(), [name]: big }, log);
    const response = await get(`date=${DATE}`);
    expect(response.status).toBe(422);
    expect(await response.json()).toEqual({ ok: false, error: "ข้อมูลมากเกินขีดจำกัด กรุณาเลือกช่วงให้สั้นลง" });
  });

  it("keeps the report available and marks optional order and open-issue lists as incomplete", async () => {
    const data = sampleData();
    data.orders = Object.fromEntries(Array.from({ length: 801 }, (_, i) => [`o${i}`, { updatedAt: at(DATE, "09:00"), workflowHistory: [] }]));
    data.store_transfers = Object.fromEntries(Array.from({ length: 201 }, (_, i) => [`t${i}`, { issueState: "open", serviceDate: "2026-01-01", createdAt: at("2026-01-01", "09:00") }]));
    state.db = createDb(data, log);
    const response = await get(`date=${DATE}`);
    expect(response.status).toBe(200);
    expect((await response.json()).data).toMatchObject({ ordersCapped: true, openIssuesCapped: true });
  });

  it("accepts exactly the cap without failing", async () => {
    const edge = Object.fromEntries(Array.from({ length: 1000 }, (_, i) => [`x${i}`, { preparerUid: "u1", serviceDate: DATE, createdAt: at(DATE, "09:00") }]));
    state.db = createDb({ ...sampleData(), store_transfers: edge }, log);
    expect((await get(`date=${DATE}`)).status).toBe(200);
  });
});

describe("GET /api/store/daily-report?month=", () => {
  it("finds a report by its service date when created in another month and does not count it twice", async () => {
    const data = sampleData();
    data.store_reports.cross = { type: "booking", storeCheckerName: "สโตร์ 1", serviceDate: DATE, createdAt: at("2026-09-30", "09:00"), confirmedAt: at(DATE, "09:00") };
    state.db = createDb(data, log);
    const day = (await (await get(`date=${DATE}`)).json()).data;
    const month = (await (await get("month=2026-10")).json()).data;
    expect(day.people.find((p) => p.uid === "u1").booking).toBe(2);
    expect(month.people.find((p) => p.uid === "u1").booking).toBe(3);
  });
  it("returns month rows for the current month up to today without reading orders", async () => {
    const response = await get("month=2026-10");
    const { ok, data } = await response.json();
    expect(ok).toBe(true);
    expect(data.month).toBe("2026-10");
    expect(data.rangeLabel).toBe("ต.ค. 2569 (1–28)");
    expect(data.people[0]).toMatchObject({ uid: "u1", name: "สโตร์ 1", booking: 2, transfer: 1, issues: 1, resolved: 1, auditDocs: 1, auditItems: 100, mismatch: 2 });
    expect(data.people[1]).toMatchObject({ uid: "u2", online: 1, transfer: 1, issues: 1, resolved: 0 });
    expect(log.some((query) => query.name === "orders")).toBe(false);
    expect(log.some((query) => query.wheres.some(([field]) => field === "issueState"))).toBe(false);
  });

  it("labels a finished month to its last day and uses the month caps", async () => {
    const { data } = await (await get("month=2026-09")).json();
    expect(data.rangeLabel).toBe("ก.ย. 2569 (1–30)");
    expect(log.find((q) => q.name === "store_reports").max).toBe(6001);
    expect(log.find((q) => q.name === "store_transfers").max).toBe(3001);
    expect(log.find((q) => q.name === "store_audits").max).toBe(3001);
  });

  it("returns 422 when the month has too many reports", async () => {
    const big = Object.fromEntries(Array.from({ length: 6001 }, (_, i) => [`x${i}`, { createdAt: at(DATE, "09:00") }]));
    state.db = createDb({ ...sampleData(), store_reports: big }, log);
    const response = await get("month=2026-10");
    expect(response.status).toBe(422);
  });

  it("does not leak personal fields", async () => {
    const body = await (await get("month=2026-10")).text();
    expect(body).not.toContain("@hillkoff.com");
    expect(body).not.toContain("0811111111");
  });
});
