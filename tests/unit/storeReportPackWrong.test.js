import { beforeEach, describe, expect, it, vi } from "vitest";
import { isReportProblem } from "../../lib/storeReportStats.js";
import { prepareSourceCaseUpsert } from "../../lib/storeCaseTransactions.js";
import { buildWarehouseDashboard } from "../../lib/storeWarehouseDashboard.js";

const state = vi.hoisted(() => ({ db: null, role: "pack" }));
vi.mock("../../lib/workflowAuth", () => ({
  requireProfile: async (_req, roles) => {
    if (!roles.includes(state.role)) throw Object.assign(new Error("Forbidden"), { status: 403 });
    return { profile: { uid: `${state.role}-1`, role: state.role, name: "ผู้ใช้" }, db: state.db };
  },
  errorResponse: (error) => Response.json({ ok: false, error: error.message }, { status: error.status || 500 })
}));

// Small in-memory Firestore: docs, sub-collections, ==/in queries, transactions.
function createDb(seed = {}) {
  const data = new Map(Object.entries(seed).map(([path, doc]) => [path, structuredClone(doc)]));
  let auto = 0;
  const docRef = (path) => ({
    id: path.split("/").pop(),
    path,
    collection: (name) => collectionRef(`${path}/${name}`),
    async get() { return snapshot(path); },
    async set(value, opts) { data.set(path, opts?.merge ? { ...(data.get(path) || {}), ...structuredClone(value) } : structuredClone(value)); }
  });
  const snapshot = (path) => ({ exists: data.has(path), id: path.split("/").pop(), ref: docRef(path), data: () => structuredClone(data.get(path)) });
  const collectionRef = (col) => {
    const filters = [];
    const q = {
      doc: (id) => docRef(`${col}/${id || `auto${++auto}`}`),
      where(field, op, value) { filters.push([field, op, value]); return q; },
      orderBy(field, dir) { q.order = [field, dir]; return q; },
      startAfter(doc) { q.after = doc.id; return q; },
      startAt() { return q; },
      endAt() { return q; },
      select() { return q; },
      limit(n) { q.max = n; return q; },
      async get() {
        let keys = [...data.keys()].filter((key) => key.startsWith(`${col}/`) && !key.slice(col.length + 1).includes("/"))
          .filter((key) => filters.every(([f, op, v]) => { const x = data.get(key)[f]; return op === "==" ? x === v : op === "in" ? v.includes(x) : op === ">=" ? x >= v : op === "<=" ? x <= v : op === "<" ? x < v : false; }));
        if (q.order) keys.sort((a, b) => String(data.get(a)[q.order[0]]).localeCompare(String(data.get(b)[q.order[0]])) * (q.order[1] === "desc" ? -1 : 1) || a.localeCompare(b));
        if (q.after) keys = keys.slice(keys.findIndex((key) => key.endsWith(`/${q.after}`)) + 1);
        const docs = keys.slice(0, q.max ?? Infinity).map(snapshot);
        return { docs, size: docs.length, empty: !docs.length };
      }
    };
    return q;
  };
  return {
    data,
    collection: collectionRef,
    async getAll(...refs) { return refs.map((ref) => snapshot(ref.path)); },
    async runTransaction(fn) {
      const writes = [];
      const result = await fn({
        get: (ref) => (ref.get ? ref.get() : ref),
        set: (ref, value, opts) => writes.push(() => ref.set(value, opts)),
        update: (ref, value) => writes.push(() => ref.set(value, { merge: true }))
      });
      for (const write of writes) await write();
      return result;
    }
  };
}

const report = (over = {}) => ({ type: "online", status: "saved", packStatus: "pending", serviceDate: "2026-11-18", createdAt: "2026-11-18T03:00:00.000Z", updatedAt: "2026-11-18T03:00:00.000Z", confirmedAt: "2026-11-18T03:00:00.000Z", bookingNumber: "ON-1", storeCheckerName: "เล็ก", workflowHistory: [], ...over });
const patchReq = (body) => new Request("http://localhost/api/store/reports", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });

describe("pack reports wrongly picked goods", () => {
  beforeEach(() => {
    state.role = "pack";
    state.db = createDb({ "store_reports/r1": report(), "store_jobs/pack_auto_check": { lastRunDate: "2999-01-01" } });
  });

  it("needs a description, then waits for the store like a return", async () => {
    const { PATCH } = await import("../../app/api/store/reports/route.js");
    expect((await PATCH(patchReq({ id: "r1", packStatus: "wrong", checkerName: "ณัฐ" }))).status).toBe(400);
    const res = await PATCH(patchReq({ id: "r1", packStatus: "wrong", checkerName: "ณัฐ", reason: "จัด Vanilla แทน Caramel" }));
    expect(res.status).toBe(200);
    const saved = state.db.data.get("store_reports/r1");
    expect(saved).toMatchObject({ packStatus: "wrong", status: "waiting", returnReason: "จัด Vanilla แทน Caramel", packCheckerName: "ณัฐ" });
    expect(saved.workflowHistory.at(-1)).toMatchObject({ action: "pack_wrong", result: "wrong", toStatus: "wrong" });
    const caseDoc = state.db.data.get("store_cases/online_r1");
    expect(caseDoc).toMatchObject({ status: "open", category: "wrong", cause: "ห้องแพ็คแจ้งจัดสินค้าผิด" });
    expect(isReportProblem(saved)).toBe(true);
  });

  it("lets the store fix it and send it back for checking", async () => {
    const { PATCH } = await import("../../app/api/store/reports/route.js");
    await PATCH(patchReq({ id: "r1", packStatus: "wrong", checkerName: "ณัฐ", reason: "ผิดรส" }));
    state.role = "store";
    const res = await PATCH(patchReq({ action: "resubmit", id: "r1", checkerName: "เล็ก" }));
    expect(res.status).toBe(200);
    expect(state.db.data.get("store_reports/r1")).toMatchObject({ packStatus: "pending", status: "saved", returnReason: "" });
  });

  it("preserves first and recent evidence with original checker through correction and another problem", async () => {
    const { PATCH } = await import("../../app/api/store/reports/route.js");
    for (let i = 0; i < 22; i += 1) {
      const res = await PATCH(patchReq({ id: "r1", packStatus: "wrong", checkerName: "ณัฐ", reason: `ผิดรส ${i}` }));
      expect(res.status).toBe(200);
    }
    state.role = "store";
    expect((await PATCH(patchReq({ action: "resubmit", id: "r1", checkerName: "ผู้แก้" }))).status).toBe(200);
    const saved = state.db.data.get("store_reports/r1");
    expect(saved.packIssueHistory).toHaveLength(20);
    expect(saved.packIssueHistory[0]).toMatchObject({ reason: "ผิดรส 0", storeCheckerName: "เล็ก" });
    expect(saved.packIssueHistory.at(-1)).toMatchObject({ reason: "ผิดรส 21", storeCheckerName: "เล็ก" });
    expect([...state.db.data.keys()].filter((key) => key.startsWith("store_reports/r1/history/"))).toHaveLength(23);
    for (const [path, event] of state.db.data) {
      if (path.startsWith("store_reports/r1/history/")) {
        expect(event.after.packIssueHistory).toBeUndefined();
        expect(event.before?.packIssueHistory).toBeUndefined();
      }
    }
  });
  it("retains a known legacy problem before checking it complete without inventing its timestamp", async () => {
    state.db = createDb({ "store_reports/r1": report({ packStatus: "partial", status: "partial" }), "store_jobs/pack_auto_check": { lastRunDate: "2999-01-01" } });
    const { PATCH } = await import("../../app/api/store/reports/route.js");
    expect((await PATCH(patchReq({ id: "r1", packStatus: "checked", checkerName: "ณัฐ" }))).status).toBe(200);
    const saved = state.db.data.get("store_reports/r1");
    expect(saved.packIssueHistory[0]).toMatchObject({ action: "pack_partial", at: "", checkerName: "" });
    expect(buildWarehouseDashboard({ from: "2026-11-18", to: "2026-11-18", reports: [{ id: "r1", ...saved }] }).reports.quality).toMatchObject({ documents: 1, resolved: 1 });
  });
});

describe("pending reports count as complete once the day they were sent to pack has passed", () => {
  // Policy starts on 2026-11-19 (Bangkok): older pending reports are left alone.
  const sent = (day, over = {}) => report({ serviceDate: day, createdAt: `${day}T03:00:00.000Z`, confirmedAt: `${day}T03:00:00.000Z`, updatedAt: `${day}T03:00:00.000Z`, ...over });
  const seed = () => ({
    "store_reports/due": sent("2026-11-19", { bookingNumber: "DUE" }),
    "store_reports/late": sent("2026-11-19", { confirmedAt: "2026-11-19T16:50:00.000Z", bookingNumber: "LATE" }), // 23:50 Bangkok on the 19th
    "store_reports/backdated": sent("2026-11-19", { serviceDate: "2026-11-10", bookingNumber: "BACK" }),
    "store_reports/resent": sent("2026-11-19", { resubmittedAt: "2026-11-20T02:00:00.000Z", bookingNumber: "RESENT" }), // sent again on the 20th
    "store_reports/today": sent("2026-11-20", { bookingNumber: "TODAY" }),
    "store_reports/beforePolicy": sent("2026-11-18", { bookingNumber: "OLD" }),
    "store_reports/waiting": sent("2026-11-19", { status: "waiting" }),
    "store_reports/partial": sent("2026-11-19", { packStatus: "partial", status: "partial" }),
    "store_reports/draft": sent("2026-11-19", { status: "draft", packStatus: "blocked", confirmedAt: "" }),
    "store_reports/deleted": sent("2026-11-19", { deletedAt: "2026-11-19T05:00:00.000Z" })
  });
  const now = Date.parse("2026-11-20T01:00:00.000Z"); // 08:00 Bangkok on the 20th

  beforeEach(async () => { (await import("../../app/api/store/reports/route.js")).resetAutoCheckMemo(); });

  it("confirms only reports the store sent before today, from the start date on, once a day", async () => {
    const { autoCheckPastPending, isAutoCheckDue } = await import("../../app/api/store/reports/route.js");
    state.db = createDb(seed());
    expect(isAutoCheckDue(sent("2026-11-19"), "2026-11-20")).toBe(true);
    expect(isAutoCheckDue(sent("2026-11-19"), "2026-11-19")).toBe(false);
    const result = await autoCheckPastPending(state.db, now);
    expect(result).toMatchObject({ ran: true, checked: 3, failed: 0, more: false });
    for (const id of ["due", "late", "backdated"]) expect(state.db.data.get(`store_reports/${id}`)).toMatchObject({ packStatus: "checked", packAutoConfirmed: true, status: "saved", packCheckerName: "" });
    expect(state.db.data.get("store_reports/due").workflowHistory.at(-1)).toMatchObject({ action: "pack_auto_checked", role: "system", toStatus: "checked" });
    for (const id of ["resent", "today", "beforePolicy", "waiting"]) expect(state.db.data.get(`store_reports/${id}`).packStatus).toBe("pending");
    expect(state.db.data.get("store_reports/partial").packStatus).toBe("partial");
    expect(state.db.data.get("store_reports/draft").packStatus).toBe("blocked");
    expect(state.db.data.get("store_reports/deleted").packStatus).toBe("pending");
    expect(state.db.data.get("store_jobs/pack_auto_check")).toMatchObject({ lastRunDate: "2026-11-20", checked: 3 });
    expect(await autoCheckPastPending(state.db, now)).toEqual({ ran: false });
  });

  it("closes a resubmitted report's case with a system reason, and keeps cases with goods missing open", async () => {
    const { autoCheckPastPending } = await import("../../app/api/store/reports/route.js");
    state.db = createDb({
      "store_reports/fixed": sent("2026-11-19"),
      "store_cases/online_fixed": { sourceType: "online", sourceId: "fixed", status: "open", category: "wrong", lines: [], history: [], updatedAt: "2026-11-19T04:00:00.000Z" },
      "store_reports/missing": sent("2026-11-19"),
      "store_cases/online_missing": { sourceType: "online", sourceId: "missing", status: "open", lines: [{ id: "l", name: "x", unit: "u", required: 2, received: 0, cancelled: 0 }], history: [], updatedAt: "2026-11-19T04:00:00.000Z" }
    });
    const result = await autoCheckPastPending(state.db, now);
    expect(result).toMatchObject({ checked: 1, failed: 1 });
    expect(state.db.data.get("store_cases/online_fixed")).toMatchObject({ status: "closed", closureReason: "ระบบถือว่าครบ (ผ่านวันที่ส่งตรวจ ห้องแพ็คไม่ได้ตรวจซ้ำ)" });
    expect(state.db.data.get("store_reports/missing").packStatus).toBe("pending");
    expect(state.db.data.get("store_cases/online_missing").status).toBe("open");
  });

  it("pages past reports it cannot confirm", async () => {
    const route = await import("../../app/api/store/reports/route.js");
    const docs = {};
    for (let i = 0; i < route.AUTO_CHECK_PAGE + 5; i += 1) docs[`store_reports/w${String(i).padStart(3, "0")}`] = sent("2026-11-19", { status: "waiting", createdAt: `2026-11-19T0${(i % 9) + 1}:00:00.000Z` });
    docs["store_reports/z_due"] = sent("2026-11-19", { createdAt: "2026-11-19T00:30:00.000Z" });
    state.db = createDb(docs);
    const result = await route.autoCheckPastPending(state.db, now);
    expect(result).toMatchObject({ checked: 1, more: false });
    expect(state.db.data.get("store_reports/z_due").packStatus).toBe("checked");
  });

  it("runs from the reports list without breaking it when the job fails", async () => {
    const { GET } = await import("../../app/api/store/reports/route.js");
    state.role = "pack";
    state.db = createDb(seed());
    state.db.runTransaction = async () => { throw new Error("boom"); };
    const logged = vi.spyOn(console, "error").mockImplementation(() => {});
    const res = await GET(new Request("http://localhost/api/store/reports?type=online&date=2026-11-19"));
    const json = await res.json();
    // The job failure is logged; the list itself still answers.
    expect(res.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(logged).toHaveBeenCalledWith("pack auto-check failed", "boom");
    logged.mockRestore();
  });
});

describe("the store closing the case ends the report", () => {
  it("is no longer a problem once the case is closed after the pack result", () => {
    const partial = report({ packStatus: "partial", status: "partial", packUpdatedAt: "2026-11-19T04:00:00.000Z" });
    expect(isReportProblem(partial)).toBe(true);
    expect(isReportProblem({ ...partial, caseStatus: "closed", caseUpdatedAt: "2026-11-19T06:00:00.000Z" })).toBe(false);
    // A newer pack result after the closure is a new problem.
    expect(isReportProblem({ ...partial, caseStatus: "closed", caseUpdatedAt: "2026-11-19T03:00:00.000Z" })).toBe(true);
    const data = buildWarehouseDashboard({ from: "2026-11-18", to: "2026-11-18", reports: [{ ...partial, caseStatus: "closed", caseUpdatedAt: "2026-11-19T06:00:00.000Z" }] });
    expect(data.reports.statuses.find((s) => s.id === "closedByStore").count).toBe(1);
  });

  it("drops store-closed reports from the pack room's to-do list", async () => {
    const { filterPackReports } = await import("../../lib/packReportHistory.js");
    const partial = report({ packStatus: "partial", status: "partial", packUpdatedAt: "2026-11-19T04:00:00.000Z" });
    const closed = { ...partial, id: "c", caseStatus: "closed", caseUpdatedAt: "2026-11-19T06:00:00.000Z" };
    expect(filterPackReports([{ ...partial, id: "p" }, closed], { type: "online", status: "active" }).map((r) => r.id)).toEqual(["p"]);
  });

  it("lets a later wrong-goods report reclassify an uncategorised case", async () => {
    const { prepareSourceCasePatch } = await import("../../lib/storeCaseTransactions.js");
    const patch = prepareSourceCasePatch({ status: "closed", category: "unknown", lines: [], history: [], updatedAt: "2026-11-19T04:00:00.000Z" }, { packStatus: "wrong", status: "waiting" }, "2026-11-19T05:00:00.000Z", { uid: "p" });
    expect(patch).toMatchObject({ status: "reopened", category: "wrong" });
  });
});

describe("shared rules", () => {
  it("opens a 'wrong goods' case for a new problem", () => {
    const before = report();
    const created = prepareSourceCaseUpsert(null, "online", "r9", before, { packStatus: "wrong", status: "waiting", returnReason: "ผิดขนาด" }, "2026-11-19T01:00:00.000Z", { uid: "p", name: "ณัฐ" });
    expect(created).toMatchObject({ category: "wrong", status: "open", note: "ผิดขนาด" });
  });

  it("shows wrong picks and automatic completions in the dashboard status table", () => {
    const data = buildWarehouseDashboard({ from: "2026-11-18", to: "2026-11-18", reports: [report({ packStatus: "wrong", status: "waiting" }), report({ packStatus: "checked", packAutoConfirmed: true }), report({ packStatus: "checked" })] });
    const counts = Object.fromEntries(data.reports.statuses.map((s) => [s.id, s.count]));
    expect(counts).toMatchObject({ wrong: 1, autoChecked: 1, checked: 1, shortage: 0 });
  });
});
