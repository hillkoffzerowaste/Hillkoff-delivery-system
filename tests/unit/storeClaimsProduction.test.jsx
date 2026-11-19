import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  claimDocId,
  parseAmount,
  parseClaimPaste,
  parseProductionPaste,
  parseRecordDate,
  recordDateWindow,
  resolveBranch,
  sameProductionRecord,
  storeMainBranches,
  typedAmount,
  validateClaimDocument,
  validateProductionRecord
} from "../../lib/storeClaimsProduction.js";
import { buildWarehouseDashboard } from "../../lib/storeWarehouseDashboard.js";
import { StoreClaimsPanel, StoreProductionPanel } from "../../app/components/store/StoreRecordsPanels.jsx";

const state = vi.hoisted(() => ({ db: null, role: "store" }));
vi.mock("../../lib/workflowAuth.js", () => ({
  requireProfile: async (_req, roles) => {
    if (!roles.includes(state.role)) throw Object.assign(new Error("Forbidden"), { status: 403 });
    return { profile: { uid: `${state.role}-1`, role: state.role, name: "สโตร์หนึ่ง" }, db: state.db };
  },
  errorResponse: (error) => Response.json({ ok: false, error: error.message }, { status: error.status || 500 })
}));

const branches = [
  { code: "CP", name: "สาขาช้างเผือก", active: true },
  { code: "HQ", name: "สาขาสำนักงานใหญ่", active: true },
  { code: "PP", name: "สาขาป่าแพ่ง", active: true },
  { code: "MH", name: "สาขามหิดล", active: true }
];
const settings = { branches };

describe("parsing helpers", () => {
  it("reads ERP Buddhist dates, short years and ISO dates", () => {
    expect(parseRecordDate("01/09/2569")).toBe("2026-09-01");
    expect(parseRecordDate("1/9/69")).toBe("2026-09-01");
    expect(parseRecordDate("2026-09-30")).toBe("2026-09-30");
    expect(parseRecordDate("31/02/2569")).toBe("");
    expect(parseRecordDate("abc")).toBe("");
  });

  it("reads two-digit years as Buddhist or Christian, whichever falls in the last two years", () => {
    expect(parseRecordDate("1/9/26", "2026-11-19")).toBe("2026-09-01");
    expect(parseRecordDate("1/9/69", "2026-11-19")).toBe("2026-09-01");
    expect(parseRecordDate("1/9/50", "2026-11-19")).toBe("");
    expect(recordDateWindow("2026-11-19")).toEqual({ min: "2024-11-19", max: "2026-11-20" });
  });

  it("reads amounts with commas and baht signs", () => {
    expect(parseAmount("1,234.50")).toBe(1234.5);
    expect(parseAmount("฿ 12")).toBe(12);
    expect(parseAmount("")).toBeNull();
    expect(parseAmount("x1")).toBeNaN();
    expect(parseAmount("-")).toBe(0);
  });

  it("matches ERP branch codes and keeps only the three main store branches", () => {
    expect(resolveBranch(branches, "MHD").code).toBe("MH");
    expect(resolveBranch(branches, "สาขาช้างเผือก").code).toBe("CP");
    expect(resolveBranch(branches, "ZZ")).toBeNull();
    expect(resolveBranch(branches, "CPW")).toBeNull();
    expect(resolveBranch(branches, "H")).toBeNull();
    expect(resolveBranch([{ code: "MHD", name: "MHD" }], "MH").code).toBe("MHD");
    expect(storeMainBranches(branches).map((b) => b.code)).toEqual(["CP", "HQ", "MH"]);
    expect(storeMainBranches([{ code: "MHD", name: "MHD", active: true }, ...branches]).map((b) => b.code)).toEqual(["CP", "HQ", "MHD"]);
    expect(storeMainBranches([{ code: "X1", name: "อื่น" }]).map((b) => b.code)).toEqual(["X1"]);
  });
});

describe("paste import", () => {
  it("groups claimable rows by document and skips the header", () => {
    const text = [
      "วันที่\tเลขที่\tรหัส\tชื่อ\tจำนวน\tราคา\tมูลค่า",
      "01/09/2569\tCRR6909-0001\tSY-MO-0001\tMolle Caramel\t24\t135\t3,240",
      "01/09/2569\tCRR6909-0001\tSY-MO-0002\tMolle Blue\t52\t135\t7020",
      "19/09/2569\tCRR6909-0002\tCS-PD-0167\tMACO Vanilla\t3\t110\t330"
    ].join("\n");
    const { documents, errors } = parseClaimPaste("claimable", text, branches);
    expect(errors).toEqual([]);
    expect(documents.map((d) => [d.documentNumber, d.serviceDate, d.items.length])).toEqual([["CRR6909-0001", "2026-09-01", 2], ["CRR6909-0002", "2026-09-19", 1]]);
    const checked = validateClaimDocument(documents[0], { settings });
    expect(checked.ok).toBe(true);
    expect(checked.value).toMatchObject({ totalQty: 76, totalAmount: 10260, branchCode: "" });
  });

  it("maps unclaimable branch codes and reports bad rows by line", () => {
    const text = [
      "04/08/2569\tSTK-SIE6908-0001\tของแถม\tDF-BN-0016\tกล้วยตาก\tพรศิริ\tHQ\t43\t221.02\t9503.86",
      "09/08/2569\tSTK-SIE6908-0003\tหมดอายุ\tIG-HK-0574\tข้าวแผ่น\tพิชญาภรณ์\tMHD\t5\t167\t835",
      "12/08/2569\tSTK-SIE6908-0004\tสีคล้ำ\tDF-MG-0009\tมะม่วง\tพิชญาภรณ์\tPP\t3\t10.08\t30.24",
      "xx\tSTK-SIE6908-0005\tเหตุ\tA\tB\tC\tCP\t1\t1\t1"
    ].join("\n");
    const { documents, errors } = parseClaimPaste("unclaimable", text, branches);
    expect(documents.map((d) => [d.documentNumber, d.branchCode, d.reason])).toEqual([["STK-SIE6908-0001", "HQ", "ของแถม"], ["STK-SIE6908-0003", "MH", "หมดอายุ"]]);
    expect(errors.map((e) => e.line)).toEqual([3, 4]);
    expect(validateClaimDocument(documents[0], { settings }).value.totalAmount).toBe(9503.86);
  });

  it("parses production rows with optional sales", () => {
    const { items, errors } = parseProductionPaste("รหัส\tชื่อ\tหน่วย\tผลิต\tขาย\nRB-HK-0200\tSexy Wine 500 g.\tPcs\t28\t25\nRB-HK-0201\tSexy Wine 200 g.\tPcs\t89\t\nX\tY\tPcs\tabc\t1");
    expect(items).toEqual([{ code: "RB-HK-0200", name: "Sexy Wine 500 g.", unit: "Pcs", qty: 28, sold: 25 }, { code: "RB-HK-0201", name: "Sexy Wine 200 g.", unit: "Pcs", qty: 89, sold: null }]);
    expect(errors).toEqual([{ line: 4, message: "จำนวนผลิตไม่ใช่ตัวเลข" }]);
  });
});

describe("validation", () => {
  const claim = { kind: "unclaimable", documentNumber: "stk-sie6911-0001", serviceDate: "2026-11-02", branchCode: "CP", reason: "หมดอายุ", items: [{ code: "a", name: "สินค้า", qty: "2", unitPrice: "10.5" }] };

  it("normalises a claim and computes totals", () => {
    const checked = validateClaimDocument(claim, { settings });
    expect(checked.ok).toBe(true);
    expect(checked.value).toMatchObject({ documentNumber: "STK-SIE6911-0001", branchName: "สาขาช้างเผือก", totalQty: 2, totalAmount: 21, items: [{ code: "A", amount: 21 }] });
  });

  it("rejects missing reason, non-main branches, bad quantities and kinds", () => {
    expect(validateClaimDocument({ ...claim, reason: "" }, { settings }).error).toContain("สาเหตุ");
    expect(validateClaimDocument({ ...claim, branchCode: "PP" }, { settings }).error).toContain("สาขาหลัก");
    expect(validateClaimDocument({ ...claim, branchCode: "" }, { settings }).ok).toBe(false);
    expect(validateClaimDocument({ ...claim, items: [{ name: "x", qty: 0 }] }, { settings }).ok).toBe(false);
    expect(validateClaimDocument({ ...claim, kind: "other" }, { settings }).ok).toBe(false);
    expect(validateClaimDocument({ ...claim, kind: "claimable", branchCode: "", reason: "" }, { settings }).ok).toBe(true);
  });

  it("keeps the stored kind and number when editing", () => {
    const keep = { kind: "unclaimable", documentNumber: "STK-SIE6911-0001", branchCode: "CP" };
    const checked = validateClaimDocument({ ...claim, kind: "claimable", documentNumber: "OTHER" }, { settings, keep });
    expect(checked.value).toMatchObject({ kind: "unclaimable", documentNumber: "STK-SIE6911-0001" });
  });

  it("rejects document dates outside the last two years or in the future", () => {
    expect(validateClaimDocument({ ...claim, serviceDate: "2020-01-01" }, { settings, today: "2026-11-19" }).ok).toBe(false);
    expect(validateClaimDocument({ ...claim, serviceDate: "2026-12-01" }, { settings, today: "2026-11-19" }).ok).toBe(false);
    // An edit may keep the stored date even when it is now outside the window.
    const keep = { kind: "unclaimable", documentNumber: "STK-SIE6911-0001", branchCode: "CP", serviceDate: "2020-01-01" };
    expect(validateClaimDocument({ ...claim, serviceDate: "2020-01-01" }, { settings, keep, today: "2026-11-19" }).ok).toBe(true);
    expect(validateClaimDocument({ ...claim, items: [{ name: "x", qty: "0.001" }] }, { settings }).ok).toBe(false);
  });

  it("recalculates claim amounts on edit unless the amount was typed", () => {
    expect(typedAmount({ qty: 2, unitPrice: 10, amount: 20 })).toBe("");
    expect(typedAmount({ qty: 43, unitPrice: 221.02, amount: 9503.86 })).toBe("");
    expect(typedAmount({ qty: 2, unitPrice: 10, amount: 25 })).toBe("25");
    const edited = validateClaimDocument({ ...claim, items: [{ name: "สินค้า", qty: "3", unitPrice: "10", amount: typedAmount({ qty: 2, unitPrice: 10, amount: 20 }) }] }, { settings });
    expect(edited.value.totalAmount).toBe(30);
  });

  it("compares production saves by branch, date and lines", () => {
    const a = { branchCode: "MH", serviceDate: "2026-11-05", items: [{ code: "A", name: "x", qty: 1, sold: null }] };
    expect(sameProductionRecord(a, structuredClone(a))).toBe(true);
    expect(sameProductionRecord(a, { ...a, branchCode: "CP" })).toBe(false);
    expect(sameProductionRecord(a, { ...a, items: [{ code: "A", name: "x", qty: 2, sold: null }] })).toBe(false);
  });

  it("validates production records", () => {
    const ok = validateProductionRecord({ serviceDate: "30/09/2569", branchCode: "MH", items: [{ name: "Sexy Wine", qty: "28", sold: "25" }, { name: "Kanom", qty: 4 }] }, { settings });
    expect(ok.value).toMatchObject({ serviceDate: "2026-09-30", branchCode: "MH", totalQty: 32, totalSold: 25, itemCount: 2 });
    expect(validateProductionRecord({ serviceDate: "2026-09-30", branchCode: "", items: [{ name: "a", qty: 1 }] }, { settings }).ok).toBe(false);
    expect(validateProductionRecord({ serviceDate: "2026-09-30", branchCode: "HQ", items: [] }, { settings }).ok).toBe(false);
  });
});

describe("dashboard aggregation", () => {
  it("adds unclaimable claims and production per branch, claimable claims store-wide", () => {
    const data = buildWarehouseDashboard({
      from: "2026-11-01", to: "2026-11-10", today: "2026-11-10",
      branchList: [{ code: "CP", name: "ช้างเผือก" }, { code: "HQ", name: "สำนักงานใหญ่" }, { code: "MH", name: "มหิดล" }],
      claims: [
        { id: "1", kind: "unclaimable", documentNumber: "S1", serviceDate: "2026-11-02", branchCode: "HQ", reason: "แถม", items: [{ name: "ก", qty: 43, unitPrice: 221.02, amount: 9503.86 }], totalQty: 43, totalAmount: 9503.86 },
        { id: "2", kind: "unclaimable", documentNumber: "S2", serviceDate: "2026-11-03", branchCode: "MH", reason: "หมดอายุ", items: [{ name: "ข", qty: 5, unitPrice: 167, amount: 835 }], totalQty: 5, totalAmount: 835 },
        { id: "3", kind: "unclaimable", documentNumber: "S3", serviceDate: "2026-11-03", branchCode: "MH", reason: "หมดอายุ", items: [{ name: "ค", qty: 1, amount: 1 }], totalQty: 1, totalAmount: 1, deletedAt: "x" },
        { id: "4", kind: "claimable", documentNumber: "C1", serviceDate: "2026-11-04", items: [{ code: "A", name: "Molle", qty: 24, amount: 3240 }, { code: "B", name: "Blue", qty: 2, amount: 270 }], totalQty: 26, totalAmount: 3510 },
        { id: "5", kind: "claimable", documentNumber: "C0", serviceDate: "2026-10-31", items: [{ name: "old", qty: 1, amount: 1 }], totalQty: 1, totalAmount: 1 }
      ],
      production: [
        { id: "p1", serviceDate: "2026-11-05", branchCode: "MH", items: [{ code: "RB1", name: "Sexy Wine", unit: "Pcs", qty: 20, sold: 10 }, { code: "RB2", name: "Kanom", qty: 4, sold: null }] },
        { id: "p2", serviceDate: "2026-11-06", branchCode: "MH", items: [{ code: "RB1", name: "Sexy Wine", unit: "Pcs", qty: 8, sold: 15 }] }
      ]
    });
    const by = (code) => data.branches.find((b) => b.code === code);
    expect(by("HQ").claims).toMatchObject({ docs: 1, qty: 43, amount: 9503.86 });
    expect(by("MH").claims).toMatchObject({ docs: 1, qty: 5, amount: 835 });
    expect(data.claims.unclaimable).toMatchObject({ docs: 2, amount: 10338.86 });
    expect(data.claims.unclaimable.reasons[0]).toMatchObject({ reason: "แถม", docs: 1 });
    expect(data.claims.claimable).toMatchObject({ qty: 26, amount: 3510 });
    expect(data.claims.claimable.topItems[0]).toMatchObject({ name: "Molle", amount: 3240 });
    expect(by("MH").production).toMatchObject({ records: 2, sku: 2, qty: 32, sold: 25, soldKnown: true });
    expect(by("MH").production.items[0]).toMatchObject({ name: "Sexy Wine", qty: 28, sold: 25 });
    expect(by("MH").production.items[1]).toMatchObject({ name: "Kanom", sold: null });
    expect(by("CP").production).toMatchObject({ records: 0, sku: 0 });
  });
});

describe("panels", () => {
  const apiFetch = async () => new Response(JSON.stringify({ ok: true, data: { items: [] } }));
  it("renders the claim entry page with both kinds, paste mode and main branches only", () => {
    const html = renderToStaticMarkup(<StoreClaimsPanel apiFetch={apiFetch} settings={settings} />);
    ["เคลมได้", "เคลมไม่ได้", "บันทึกทีละเอกสาร", "วางจาก Excel (หลายเอกสาร)", "สาเหตุที่เคลมไม่ได้"].forEach((text) => expect(html).toContain(text));
    expect(html).toContain("CP สาขาช้างเผือก");
    expect(html).toContain("MH สาขามหิดล");
    expect(html).not.toContain("PP สาขาป่าแพ่ง");
  });
  it("renders the production entry page", () => {
    const html = renderToStaticMarkup(<StoreProductionPanel apiFetch={apiFetch} settings={settings} />);
    ["บันทึกการผลิต", "จำนวนผลิต", "ยอดขาย (ถ้ามี)", "วางรายการสินค้าจาก Excel"].forEach((text) => expect(html).toContain(text));
  });
});

// In-memory Firestore with transactions, enough for the record routes.
function createDb(seed = {}) {
  const data = new Map(Object.entries(seed).flatMap(([col, docs]) => Object.entries(docs).map(([id, doc]) => [`${col}/${id}`, structuredClone(doc)])));
  const docRef = (col, id) => ({
    id,
    path: `${col}/${id}`,
    async get() { const v = data.get(`${col}/${id}`); return { exists: Boolean(v), id, data: () => structuredClone(v) }; }
  });
  const db = {
    data,
    collection(col) {
      const filters = [];
      const q = {
        doc: (id) => docRef(col, id),
        where(field, op, value) { filters.push([field, op, value]); return q; },
        orderBy() { return q; },
        limit(n) { q.max = n; return q; },
        async get() {
          const docs = [...data.entries()].filter(([key]) => key.startsWith(`${col}/`)).map(([key, v]) => ({ id: key.slice(col.length + 1), v }))
            .filter(({ v }) => filters.every(([f, op, val]) => (op === ">=" ? v[f] >= val : op === "<=" ? v[f] <= val : op === "==" ? v[f] === val : false)))
            .slice(0, q.max).map(({ id, v }) => ({ id, data: () => structuredClone(v) }));
          return { docs };
        }
      };
      return q;
    },
    async runTransaction(fn) {
      const writes = [];
      const tx = {
        get: (ref) => ref.get(),
        set: (ref, doc) => writes.push(() => data.set(ref.path, structuredClone(doc))),
        update: (ref, patch) => writes.push(() => data.set(ref.path, { ...data.get(ref.path), ...structuredClone(patch) }))
      };
      const result = await fn(tx);
      writes.forEach((w) => w());
      return result;
    }
  };
  return db;
}

const req = (url, method = "GET", body) => new Request(`http://localhost${url}`, { method, headers: { "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });

describe("claims route", () => {
  beforeEach(() => {
    state.role = "store";
    state.db = createDb({ store_settings: { default: { branches: branches.map((b) => ({ ...b, type: "สาขา" })) } } });
  });

  const doc = { kind: "unclaimable", documentNumber: "STK-SIE6911-0001", serviceDate: "2026-11-02", branchCode: "CP", reason: "หมดอายุ", items: [{ name: "สินค้า", qty: 2, unitPrice: 10 }] };

  it("creates, skips duplicates, lists, edits and soft-deletes claim documents", async () => {
    const route = await import("../../app/api/store/claims/route.js");
    let res = await route.POST(req("/api/store/claims", "POST", { documents: [doc, { ...doc, kind: "claimable", documentNumber: "CRR6911-0001", branchCode: "", reason: "" }] }));
    let json = await res.json();
    expect(res.status).toBe(200);
    expect(json.data.created).toHaveLength(2);
    expect(json.data.skipped).toEqual([]);

    json = await (await route.POST(req("/api/store/claims", "POST", { documents: [doc] }))).json();
    expect(json.data).toMatchObject({ created: [], skipped: ["STK-SIE6911-0001"] });

    json = await (await route.GET(req("/api/store/claims?from=2026-11-01&to=2026-11-30&kind=unclaimable"))).json();
    expect(json.data.items).toHaveLength(1);
    const saved = json.data.items[0];
    expect(saved).toMatchObject({ id: claimDocId("unclaimable", "STK-SIE6911-0001"), totalAmount: 20, historyCount: 1 });
    expect(saved).not.toHaveProperty("history");

    res = await route.PATCH(req("/api/store/claims", "PATCH", { id: saved.id, baseUpdatedAt: "stale", document: doc }));
    expect(res.status).toBe(409);
    json = await (await route.PATCH(req("/api/store/claims", "PATCH", { id: saved.id, baseUpdatedAt: saved.updatedAt, document: { ...doc, items: [{ name: "สินค้า", qty: 3, unitPrice: 10 }] } }))).json();
    expect(json.data).toMatchObject({ totalQty: 3, totalAmount: 30 });

    expect((await route.DELETE(req("/api/store/claims", "DELETE", { id: saved.id }))).status).toBe(400);
    expect((await route.DELETE(req("/api/store/claims", "DELETE", { id: saved.id, reason: "คีย์ผิด" }))).status).toBe(200);
    json = await (await route.GET(req("/api/store/claims?from=2026-11-01&to=2026-11-30"))).json();
    expect(json.data.items.map((r) => r.documentNumber)).toEqual(["CRR6911-0001"]);
    // A deleted number can be saved again and keeps its history.
    json = await (await route.POST(req("/api/store/claims", "POST", { documents: [doc] }))).json();
    expect(json.data.created).toHaveLength(1);
    expect(state.db.data.get(`store_claims/${saved.id}`).history.map((h) => h.event)).toEqual(["created", "updated", "deleted", "recreated"]);
    // Branches stay within the three main ones on edit.
    const again = (await (await route.GET(req("/api/store/claims?from=2026-11-01&to=2026-11-30&kind=unclaimable"))).json()).data.items[0];
    expect((await route.PATCH(req("/api/store/claims", "PATCH", { id: again.id, baseUpdatedAt: again.updatedAt, document: { ...doc, branchCode: "PP" } }))).status).toBe(400);
    expect((await route.PATCH(req("/api/store/claims", "PATCH", { id: "__bad__", baseUpdatedAt: "", document: doc }))).status).toBe(404);
  });

  it("rejects bad input, long ranges and non-store writers", async () => {
    const route = await import("../../app/api/store/claims/route.js");
    expect((await route.POST(req("/api/store/claims", "POST", { documents: [{ ...doc, reason: "" }] }))).status).toBe(400);
    expect((await route.POST(req("/api/store/claims", "POST", { documents: [doc, doc] }))).status).toBe(400);
    expect((await route.GET(req("/api/store/claims?from=2026-01-01&to=2026-11-30"))).status).toBe(400);
    state.role = "admin";
    expect((await route.GET(req("/api/store/claims?from=2026-11-01&to=2026-11-30"))).status).toBe(200);
    expect((await route.POST(req("/api/store/claims", "POST", { documents: [doc] }))).status).toBe(403);
  });
});

describe("production route", () => {
  beforeEach(() => {
    state.role = "store";
    state.db = createDb({ store_settings: { default: { branches: branches.map((b) => ({ ...b, type: "สาขา" })) } } });
  });
  const record = { serviceDate: "2026-11-05", branchCode: "MH", items: [{ name: "Sexy Wine", qty: 28, sold: 25 }] };

  it("creates idempotently, edits and deletes production records", async () => {
    const route = await import("../../app/api/store/production/route.js");
    expect((await route.POST(req("/api/store/production", "POST", { records: [record] }))).status).toBe(400);
    let json = await (await route.POST(req("/api/store/production", "POST", { requestId: "req_12345678", records: [record] }))).json();
    expect(json.data.created[0]).toMatchObject({ id: "req_12345678_0", totalQty: 28, totalSold: 25 });
    // A retry of the same save returns the stored record; the same id with other content is refused.
    json = await (await route.POST(req("/api/store/production", "POST", { requestId: "req_12345678", records: [record] }))).json();
    expect(json.data.created[0]).toMatchObject({ id: "req_12345678_0", totalQty: 28 });
    expect((await route.POST(req("/api/store/production", "POST", { requestId: "req_12345678", records: [{ ...record, items: [{ name: "x", qty: 1 }] }] }))).status).toBe(409);
    json = await (await route.GET(req("/api/store/production?from=2026-11-01&to=2026-11-30"))).json();
    expect(json.data.items).toHaveLength(1);
    const saved = json.data.items[0];
    json = await (await route.PATCH(req("/api/store/production", "PATCH", { id: saved.id, baseUpdatedAt: saved.updatedAt, record: { ...record, items: [{ name: "Sexy Wine", qty: 30 }] } }))).json();
    expect(json.data).toMatchObject({ totalQty: 30, totalSold: null });
    expect((await route.DELETE(req("/api/store/production", "DELETE", { id: saved.id, reason: "ซ้ำ" }))).status).toBe(200);
    json = await (await route.GET(req("/api/store/production?from=2026-11-01&to=2026-11-30"))).json();
    expect(json.data.items).toHaveLength(0);
  });

  it("refuses branches outside the three main ones", async () => {
    const route = await import("../../app/api/store/production/route.js");
    const res = await route.POST(req("/api/store/production", "POST", { requestId: "req_abcdefgh", records: [{ ...record, branchCode: "PP" }] }));
    expect(res.status).toBe(400);
  });
});
