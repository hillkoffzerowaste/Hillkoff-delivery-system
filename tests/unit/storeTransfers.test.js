import { describe, expect, it } from "vitest";
import { getDefaultStoreSettings, normalizeStoreSettings } from "../../lib/storeSettings.js";
import {
  applyTransferReopen,
  applyTransferResolve,
  buildTransferDoc,
  buildTransferHistoryEvent,
  filterTransfers,
  isBlankTransferRow,
  sortTransfersForDisplay,
  summarizeTransfers,
  transferResolveHours,
  transferStatus,
  validateTransferRow
} from "../../lib/storeTransfers.js";

function settingsWith(mutate = () => {}) {
  const settings = getDefaultStoreSettings();
  settings.branches = [
    { code: "WH", name: "คลังหลัก", type: "คลังสินค้า", active: true },
    { code: "BR01", name: "สาขา 01", type: "สาขา", active: true },
    { code: "BR09", name: "สาขาปิด", type: "สาขา", active: false }
  ];
  mutate(settings);
  return normalizeStoreSettings(settings);
}

const recorder = { uid: "store-1", name: "สโตร์หนึ่ง", email: "s@hillkoff.com" };
const goodRow = {
  transferNumber: "tr-0418",
  requestRef: "rq-0395",
  fromBranchCode: "WH",
  toBranchCode: "BR01",
  preparerUid: "store-2",
  preparerName: "สโตร์สอง",
  receipt: "complete",
  note: ""
};

function check(row, settings = settingsWith(), options = {}) {
  return validateTransferRow({ ...goodRow, ...row }, { settings, profile: recorder, ...options });
}

describe("validateTransferRow", () => {
  it("normalizes a valid row and snapshots branch names", () => {
    const result = check({});
    expect(result).toEqual({
      ok: true,
      value: {
        transferNumber: "TR-0418",
        requestRef: "RQ-0395",
        fromBranchCode: "WH",
        fromBranchName: "คลังหลัก",
        toBranchCode: "BR01",
        toBranchName: "สาขา 01",
        itemCount: null,
        preparerUid: "store-2",
        preparerName: "สโตร์สอง",
        receipt: "complete",
        note: ""
      }
    });
  });

  it("checks the transferred item count: optional by default, a whole number 1–9999, required when set", () => {
    expect(check({ itemCount: "12" }).value.itemCount).toBe(12);
    expect(check({ itemCount: 7 }).value.itemCount).toBe(7);
    expect(check({ itemCount: "" }).value.itemCount).toBeNull();
    for (const bad of ["0", "1.5", "-3", "abc", "10000"]) expect(check({ itemCount: bad })).toMatchObject({ ok: false, status: 400, error: "จำนวนรายการที่โอนต้องเป็นตัวเลข 1–9999" });
    const required = settingsWith((s) => { s.documents.transfer.fields.find((f) => f.id === "items").required = true; });
    expect(check({ itemCount: "" }, required)).toMatchObject({ ok: false, error: "กรุณาระบุจำนวนรายการที่โอน" });
    const hidden = settingsWith((s) => { Object.assign(s.documents.transfer.fields.find((f) => f.id === "items"), { show: false, required: false }); });
    expect(check({ itemCount: "abc" }, hidden).value.itemCount).toBeNull();
    expect(isBlankTransferRow({ itemCount: "3" })).toBe(false);
  });

  it("rejects a number that does not match the configured pattern", () => {
    expect(check({ transferNumber: "418" })).toMatchObject({ ok: false, status: 400, error: "เลขที่ใบโอนต้องอยู่ในรูปแบบ TR-0418" });
    expect(check({ transferNumber: "" })).toMatchObject({ ok: false, status: 400 });
  });

  it("follows a changed prefix and digits setting", () => {
    const settings = settingsWith((s) => { s.documents.transfer.prefix = "TF"; s.documents.transfer.digits = 5; });
    expect(check({ transferNumber: "TR-0418" }, settings)).toMatchObject({ ok: false, error: "เลขที่ใบโอนต้องอยู่ในรูปแบบ TF-00418" });
    expect(check({ transferNumber: "TF-00418" }, settings).ok).toBe(true);
  });

  it("validates the request reference only when it is filled in", () => {
    expect(check({ requestRef: "" }).value.requestRef).toBe("");
    expect(check({ requestRef: "RQ-39" })).toMatchObject({ ok: false, error: "เลขที่ใบขอโอนต้องอยู่ในรูปแบบ STK-TRF6910-0001" });
  });

  it("requires the request reference when settings say so and ignores it when hidden", () => {
    const required = settingsWith((s) => { s.documents.transfer.fields.find((f) => f.id === "ref").required = true; });
    expect(check({ requestRef: "" }, required)).toMatchObject({ ok: false, error: "กรุณาระบุอ้างอิงใบขอโอน" });
    const hidden = settingsWith((s) => { s.documents.transfer.fields.find((f) => f.id === "ref").show = false; });
    expect(check({ requestRef: "garbage" }, hidden).value.requestRef).toBe("");
  });

  it("rejects the same source and destination", () => {
    expect(check({ toBranchCode: "WH" })).toMatchObject({ ok: false, status: 400, error: "ต้นทางและปลายทางต้องเป็นคนละสาขา" });
  });

  it("rejects unknown or deactivated branches but lets an edit keep a branch it already had", () => {
    const message = "สาขาต้นทาง/ปลายทางไม่ถูกต้องหรือถูกปิดใช้งาน";
    expect(check({ toBranchCode: "BR09" })).toMatchObject({ ok: false, error: message });
    expect(check({ fromBranchCode: "XX" })).toMatchObject({ ok: false, error: message });
    expect(check({ toBranchCode: "" })).toMatchObject({ ok: false, error: message });
    expect(check({ toBranchCode: "BR09" }, settingsWith(), { keepBranchCodes: ["BR09"] }).ok).toBe(true);
  });

  it("requires a preparer when the field is required", () => {
    expect(check({ preparerName: "", preparerUid: "" })).toMatchObject({ ok: false, error: "กรุณาเลือกผู้จัดใบโอน" });
  });

  it("falls back to the recorder when the preparer field is hidden or optional", () => {
    const hidden = settingsWith((s) => { s.documents.transfer.fields.find((f) => f.id === "preparer").show = false; });
    expect(check({ preparerName: "คนอื่น", preparerUid: "x" }, hidden).value).toMatchObject({ preparerUid: "store-1", preparerName: "สโตร์หนึ่ง" });
    const optional = settingsWith((s) => { s.documents.transfer.fields.find((f) => f.id === "preparer").required = false; });
    expect(check({ preparerName: "", preparerUid: "" }, optional).value).toMatchObject({ preparerUid: "store-1", preparerName: "สโตร์หนึ่ง" });
  });

  it("requires a note when goods are incomplete whatever the settings say", () => {
    expect(check({ receipt: "incomplete", note: "  " })).toMatchObject({ ok: false, status: 400, error: "กรณีสินค้าไม่ครบ ต้องระบุหมายเหตุว่าขาดอะไร" });
    const hidden = settingsWith((s) => { s.documents.transfer.fields.find((f) => f.id === "note").show = false; });
    expect(check({ receipt: "incomplete", note: "" }, hidden).ok).toBe(false);
    expect(check({ receipt: "incomplete", note: "แก้ว 16 oz ขาด 100 ใบ" }).value.note).toBe("แก้ว 16 oz ขาด 100 ใบ");
  });

  it("drops the note when goods are complete", () => {
    expect(check({ receipt: "complete", note: "ลืมลบ" }).value.note).toBe("");
  });

  it("rejects an unknown receipt result", () => {
    expect(check({ receipt: "" })).toMatchObject({ ok: false, error: "กรุณาเลือกผลรับสินค้า" });
    expect(check({ receipt: "maybe" }).ok).toBe(false);
  });
});

describe("isBlankTransferRow", () => {
  it("treats rows with only default selects as blank", () => {
    expect(isBlankTransferRow({ fromBranchCode: "WH", toBranchCode: "BR01", receipt: "complete" })).toBe(true);
    expect(isBlankTransferRow({ transferNumber: "TR-1" })).toBe(false);
    expect(isBlankTransferRow({ note: "x" })).toBe(false);
  });
});

describe("transfer state", () => {
  const value = check({ receipt: "incomplete", note: "ขาด 2 กล่อง" }).value;
  const open = buildTransferDoc(value, { profile: recorder, now: "2026-10-28T03:00:00.000Z", serviceDate: "2026-10-28", registryId: "transfer__all__TR-0418" });

  it("builds an open document for incomplete goods and a closed one for complete goods", () => {
    expect(open).toMatchObject({ issueState: "open", resolution: null, resolvedServiceDate: "", serviceDate: "2026-10-28", createdByUid: "store-1", createdBy: "สโตร์หนึ่ง", confirmedAt: "2026-10-28T03:00:00.000Z", registryId: "transfer__all__TR-0418" });
    const complete = buildTransferDoc(check({}).value, { profile: recorder, now: "2026-10-28T03:00:00.000Z", serviceDate: "2026-10-28", registryId: "r" });
    expect(complete.issueState).toBe("");
    expect(transferStatus(complete)).toBe("complete");
    expect(transferStatus(open)).toBe("open");
  });

  it("resolves an open document with text, actor and the Bangkok date of the resolution", () => {
    const patch = applyTransferResolve(open, { text: "  ส่งเพิ่มรอบบ่าย  ", profile: { uid: "store-2", name: "สโตร์สอง" }, now: "2026-10-28T18:00:00.000Z" });
    expect(patch).toMatchObject({
      issueState: "resolved",
      resolution: { text: "ส่งเพิ่มรอบบ่าย", byUid: "store-2", byName: "สโตร์สอง", at: "2026-10-28T18:00:00.000Z" },
      resolvedServiceDate: "2026-10-29"
    });
    expect(transferStatus({ ...open, ...patch })).toBe("resolved");
  });

  it("requires resolution text and refuses to resolve twice, complete or deleted documents", () => {
    const ctx = { profile: recorder, now: "2026-10-28T05:00:00.000Z" };
    expect(() => applyTransferResolve(open, { ...ctx, text: "  " })).toThrowError(expect.objectContaining({ status: 400, message: "กรุณาระบุวิธีแก้ไข / ผลการดำเนินการ" }));
    const resolved = { ...open, ...applyTransferResolve(open, { ...ctx, text: "แก้แล้ว" }) };
    expect(() => applyTransferResolve(resolved, { ...ctx, text: "อีกที" })).toThrowError(expect.objectContaining({ status: 409, message: "ใบโอนนี้ไม่มีรายการค้างแก้ไข" }));
    expect(() => applyTransferResolve({ receipt: "complete", issueState: "" }, { ...ctx, text: "x" })).toThrowError(expect.objectContaining({ status: 409 }));
    expect(() => applyTransferResolve({ ...open, deletedAt: "x" }, { ...ctx, text: "x" })).toThrowError(expect.objectContaining({ status: 409 }));
  });

  it("reopens only a resolved document and clears the resolution", () => {
    const ctx = { profile: recorder, now: "2026-10-28T06:00:00.000Z" };
    expect(() => applyTransferReopen(open, ctx)).toThrowError(expect.objectContaining({ status: 409 }));
    const resolved = { ...open, ...applyTransferResolve(open, { ...ctx, text: "แก้แล้ว" }) };
    expect(applyTransferReopen(resolved, ctx)).toMatchObject({ issueState: "open", resolution: null, resolvedServiceDate: "" });
  });

  it("computes hours between creation and resolution", () => {
    expect(transferResolveHours(open)).toBeNull();
    const resolved = { ...open, resolution: { at: "2026-10-28T04:30:00.000Z" } };
    expect(transferResolveHours(resolved)).toBe(1.5);
  });

  it("builds history events without undefined values", () => {
    const event = buildTransferHistoryEvent("deleted", recorder, "2026-10-28T03:00:00.000Z", { reason: " ผิดเลข " });
    expect(event).toEqual({ event: "deleted", at: "2026-10-28T03:00:00.000Z", by: "สโตร์หนึ่ง", byUid: "store-1", reason: "ผิดเลข", before: null, after: null });
  });
});

describe("transfer lists", () => {
  const rows = [
    { id: "a", transferNumber: "TR-0001", receipt: "complete", createdAt: "2026-10-28T01:00:00.000Z", fromBranchCode: "WH", toBranchCode: "BR01", fromBranchName: "คลังหลัก", toBranchName: "สาขา 01", preparerName: "สโตร์หนึ่ง" },
    { id: "b", transferNumber: "TR-0002", receipt: "incomplete", issueState: "open", note: "แก้ว ขาด", createdAt: "2026-10-28T03:00:00.000Z", fromBranchCode: "WH", toBranchCode: "BR02", fromBranchName: "คลังหลัก", toBranchName: "สาขา 02" },
    { id: "c", transferNumber: "TR-0003", receipt: "incomplete", issueState: "resolved", resolution: { text: "ส่งเพิ่ม" }, createdAt: "2026-10-28T02:00:00.000Z", fromBranchCode: "BR01", toBranchCode: "BR02" },
    { id: "d", transferNumber: "TR-0004", receipt: "incomplete", issueState: "open", createdAt: "2026-10-28T00:30:00.000Z", fromBranchCode: "WH", toBranchCode: "BR01" },
    { id: "e", transferNumber: "TR-0005", receipt: "incomplete", issueState: "open", deletedAt: "2026-10-28T04:00:00.000Z", createdAt: "2026-10-28T00:00:00.000Z" }
  ];

  it("summarizes without counting deleted documents", () => {
    expect(summarizeTransfers(rows)).toEqual({ total: 4, complete: 1, open: 2, resolved: 1, incomplete: 3 });
  });

  it("sorts open, resolved, complete and oldest first inside a group without mutating input", () => {
    const copy = [...rows];
    expect(sortTransfersForDisplay(rows).map((row) => row.id)).toEqual(["e", "d", "b", "c", "a"]);
    expect(rows).toEqual(copy);
  });

  it("filters by status, branch (from or to) and text", () => {
    expect(filterTransfers(rows, { status: "open" }).map((r) => r.id)).toEqual(["b", "d", "e"]);
    expect(filterTransfers(rows, { branchCode: "BR01" }).map((r) => r.id)).toEqual(["a", "c", "d"]);
    expect(filterTransfers(rows, { query: "ส่งเพิ่ม" }).map((r) => r.id)).toEqual(["c"]);
    expect(filterTransfers(rows, { query: "tr-0001" }).map((r) => r.id)).toEqual(["a"]);
    expect(filterTransfers(rows, {}).length).toBe(5);
  });
});
