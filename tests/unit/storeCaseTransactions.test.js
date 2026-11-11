import { afterEach, beforeEach, describe, it, expect, vi } from "vitest";
import * as transactions from "../../lib/storeCaseTransactions.js";
beforeEach(() => { vi.useFakeTimers({ toFake: ["Date"] }); vi.setSystemTime(new Date("2026-11-10T02:00:00Z")); });
afterEach(() => vi.useRealTimers());
const actor = { uid: "u", name: "A" };
const now = "2026-11-10T02:00:00.000Z";
const existing = { status: "open", lines: [{ required: 5, received: 2, cancelled: 0 }], history: [] };
describe("transfer case transaction compatibility", () => {
  it("blocks legacy resolve while known goods remain outstanding", () => {
    expect(() => transactions.prepareTransferCasePatch(existing, { issueState: "resolved", resolution: { note: "done" } }, now, actor)).toThrow(/ค้าง/);
  });
  it("reopens the same case and records both event times", () => {
    expect(transactions.prepareTransferCasePatch({ ...existing, status: "closed" }, { issueState: "open" }, now, actor)).toMatchObject({ status: "reopened", resolvedAt: "", history: [{ recordedAt: now, effectiveAt: now }] });
  });
  it("allows notes-only legacy resolution as exception with a reason", () => {
    expect(transactions.prepareTransferCasePatch({ ...existing, lines: [] }, { issueState: "resolved", resolution: { note: "ตรวจเอกสารแล้ว" } }, now, actor)).toMatchObject({ status: "closed", closure: "exception", closureReason: "ตรวจเอกสารแล้ว" });
  });
});

it("treats receipt complete as a resolution and blocks pending goods", () => {
  expect(() => transactions.prepareTransferCasePatch(existing, { receipt: "complete", issueState: "" }, now, actor)).toThrow(/ค้าง/);
});
it("reads legacy resolution.text and records close events once", () => {
  const patch = transactions.prepareTransferCasePatch({ ...existing, lines: [] }, { issueState: "resolved", resolution: { text: "ตรวจแล้ว" } }, now, actor);
  expect(patch).toMatchObject({ closureReason: "ตรวจแล้ว", history: [{ action: "closed", closure: "exception" }] });
});
it("keeps a resubmitted report case open until pack checks it", () => {
  expect(transactions.prepareSourceCasePatch(existing, { packStatus: "pending" }, now, actor)).toMatchObject({ status: "open" });
  expect(transactions.prepareSourceCasePatch({ ...existing, lines: [] }, { packStatus: "checked", note: "ตรวจแล้ว" }, now, actor)).toMatchObject({ status: "closed", closure: "exception" });
});

it("preserves an existing closure timestamp and classification on metadata edits", () => {
  const old = { ...existing, status: "closed", closure: "cancelled", closureReason: "ไม่ใช้แล้ว", resolvedAt: "2026-11-01T00:00:00Z", lines: [] };
  const patch = transactions.prepareTransferCasePatch(old, { receipt: "complete", issueState: "", note: "แก้ชื่อ" }, now, actor);
  expect(patch.resolvedAt).toBeUndefined(); expect(patch.closure).toBeUndefined();
});
it("keeps report numbers in the canonical source projection", () => {
  expect(transactions.prepareSourceCasePatch(existing, { bookingNumber: "SO-NEW" }, now, actor).sourceNumber).toBe("SO-NEW");
});

it("never regresses a case version when a source transaction retries", () => {
  const old = { ...existing, updatedAt: "2099-11-10T02:00:00Z" };
  const result = transactions.prepareTransferCasePatch(old, { note: "ใหม่" }, now, actor);
  expect(Date.parse(result.updatedAt)).toBeGreaterThan(Date.parse(old.updatedAt));
});




describe("first source problem materialization", () => {
  it("dates a newly discovered problem by detection time and retains the source creation time", () => {
    const before = { type: "online", status: "saved", packStatus: "pending", createdAt: "2026-10-01T01:00:00.000Z", createdByUid: "u", createdBy: "A" };
    const value = transactions.prepareSourceCaseUpsert(null, "online", "r1", before, { packStatus: "partial", status: "partial", note: "ขาด" }, now, actor);
    expect(value).toMatchObject({ sourceType: "online", sourceId: "r1", sourceNumber: "r1", status: "open", lines: [], createdAt: now, discoveredAt: now, sourceCreatedAt: "2026-10-01T01:00:00.000Z", originDateEstimated: false, createdByUid: "u", recordedAt: now, effectiveAt: now, history: [{ recordedAt: now, effectiveAt: now }] });
  });
  it("preserves unknown legacy origin and closes a notes-only case as exception", () => {
    const before = { type: "online", status: "partial", packStatus: "partial", createdAt: "2026-10-01T01:00:00.000Z", note: "ขาด" };
    const value = transactions.prepareSourceCaseUpsert(null, "online", "r1", before, { packStatus: "checked" }, now, actor);
    expect(value).toMatchObject({ status: "closed", closure: "exception", createdAt: "2026-10-01T01:00:00.000Z", originDateEstimated: true, discoveredAt: "", lines: [] });
  });
  it("uses the first recorded problem event as a known legacy origin", () => {
    const before = { status: "partial", createdAt: "2026-10-01T01:00:00.000Z", workflowHistory: [{ action: "pack_partial", at: "2026-11-01T03:00:00.000Z" }, { action: "pack_returned", at: "2026-11-02T03:00:00.000Z" }] };
    expect(transactions.prepareSourceCaseUpsert(null, "booking", "r1", before, { note: "แก้ข้อความ" }, now, actor)).toMatchObject({ createdAt: "2026-11-01T03:00:00.000Z", discoveredAt: "2026-11-01T03:00:00.000Z", originDateEstimated: false });
  });
  it("does not create cases for sources without problems", () => {
    expect(transactions.prepareSourceCaseUpsert(null, "transfer", "t1", null, { receipt: "complete" }, now, actor)).toBeNull();
    expect(transactions.prepareSourceCaseUpsert(null, "audit", "a1", null, { mismatch: 0 }, now, actor)).toBeNull();
  });
  it("removes an obsolete report number when the field is explicitly cleared", () => {
    expect(transactions.prepareSourceCasePatch({ ...existing, sourceId: "r1", sourceNumber: "SO-OLD" }, { bookingNumber: "" }, now, actor).sourceNumber).toBe("r1");
  });
});

it("does not claim fulfillment when a source case line has an unspecified zero requirement", () => {
  const old = { ...existing, lines: [{ required: 0, received: 0, cancelled: 0 }] };
  expect(transactions.prepareSourceCasePatch(old, { packStatus: "checked" }, now, actor)).toMatchObject({ status: "closed", closure: "exception" });
});
