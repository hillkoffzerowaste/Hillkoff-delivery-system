import { describe, expect, it } from "vitest";
import * as cases from "../../lib/storeCases.js";
const line = { id: "l1", sku: "A", name: "กาแฟ", unit: "ถุง", required: 10, received: 3, cancelled: 2, cancellationReason: "ลูกค้ายกเลิก", allocations: [] };
const base = { sourceType: "transfer", sourceId: "t1", status: "open", category: "shortage", cause: "รอสินค้า", responsibleId: "u1", lines: [line] };
describe("canonical store cases", () => {
  it("uses an unambiguous stable source key", () => {
    expect(cases.caseId("transfer", "a_b")).not.toBe(cases.caseId("booking", "a_b"));
    expect(cases.caseId("transfer", "a_b")).toBe(cases.caseId("transfer", "a_b"));
  });
  it("keeps unknown legacy lines unknown and replaces projections with canonical state", () => {
    const transfer = { id: "t1", receipt: "incomplete", issueState: "open", note: "ขาดกาแฟ", createdAt: "2026-11-01T02:00:00Z" };
    const projected = cases.mergeStoreCases({ transfers: [transfer] });
    expect(projected[0]).toMatchObject({ sourceType: "transfer", sourceId: "t1", legacy: true, lines: [] });
    const merged = cases.mergeStoreCases({ transfers: [transfer], cases: [{ ...base, id: cases.caseId("transfer", "t1"), status: "closed", closure: "exception" }] });
    expect(merged).toHaveLength(1);
    expect(merged[0]).toMatchObject({ status: "closed", sourceStatusMismatch: true });
  });
  it("calculates remaining without treating a PO as receipt", () => {
    expect(cases.remainingOf(line)).toBe(5);
    const checked = cases.validateCase({ ...base, lines: [{ ...line, allocations: [{ quantity: 5, kind: "supplier", po: "PO1" }] }] });
    expect(checked.ok).toBe(true);
    expect(checked.value.status).toBe("open");
  });
  it.each([
    { lines: [{ ...line, received: 11 }] },
    { lines: [{ ...line, cancelled: 8 }] },
    { lines: [{ ...line, cancellationReason: "" }] },
    { lines: [{ ...line, allocations: [{ quantity: 6 }] }] },
    { status: "closed", closure: "fulfilled" },
    { status: "closed", closure: "fulfilled", lines: [] },
    { status: "closed", closure: "exception", closureReason: "" },
    { lines: [{ ...line, required: null }] }
  ])("rejects unsafe quantities or closure %j", (patch) => {
    expect(cases.validateCase({ ...base, ...patch }).ok).toBe(false);
  });
  it("separates created cohort, resolution activity, cancellation and old backlog", () => {
    const rows = [
      { ...base, id: "a", createdAt: "2026-11-10T01:00:00Z" },
      { ...base, id: "b", createdAt: "2026-11-10T02:00:00Z", status: "closed", closure: "fulfilled", resolvedAt: "2026-11-10T03:00:00Z" },
      { ...base, id: "c", createdAt: "2026-11-01T01:00:00Z", status: "closed", closure: "cancelled", resolvedAt: "2026-11-10T03:00:00Z" },
      { ...base, id: "d", createdAt: "2026-11-01T01:00:00Z" }
    ];
    expect(cases.summarizeCases(rows, { from: "2026-11-10", to: "2026-11-10" })).toMatchObject({ created: 2, cohortOpen: 1, cohortClosed: 1, resolvedActivities: 1, cancelledActivities: 1, backlog: 2, historicalSnapshot: false });
  });
});

it("retains historical close activities after reopening", () => {
  const rows = [{ ...base, createdAt: "2026-11-01T00:00:00Z", status: "reopened", history: [{ action: "closed", closure: "fulfilled", actorUid: "solver", effectiveAt: "2026-11-10T03:00:00Z" }] }];
  expect(cases.summarizeCases(rows, { from: "2026-11-10", to: "2026-11-10", activityActorId: "solver" }).resolvedActivities).toBe(1);
});

it("rejects tracking states that claim complete or cancelled while goods remain", () => {
  expect(cases.validateCase({ ...base, lines: [{ ...line, trackingStatus: "complete" }] }).ok).toBe(false);
  expect(cases.validateCase({ ...base, lines: [{ ...line, trackingStatus: "cancelled" }] }).ok).toBe(false);
});
it("analyzes unknown groups and prioritizes known overdue sources", () => {
  const result = cases.analyzeCases([{ ...base, id: "a", createdAt: "2026-11-01T00:00:00Z", branchCode: "HQ", lines: [{ ...line, allocations: [{ quantity: 5, supplier: "S", eta: "2026-11-09" }] }] }], "2026-11-10");
  expect(result.overdue).toBe(1); expect(result.byBranch).toEqual([{ key: "HQ", count: 1 }]);
  expect(result.byProduct[0]).toMatchObject({ key: "A · กาแฟ", count: 1 });
});

it.each([null, 1, "bad", { ...base, lines: [null] }, { ...base, lines: [1] }, { ...base, lines: [{ ...line, allocations: [null] }] }])("rejects malformed input without throwing %j", (input) => {
  expect(() => cases.validateCase(input)).not.toThrow();
  expect(cases.validateCase(input).ok).toBe(false);
});
it("prioritizes overdue cases before older cases without a known ETA", () => {
  const rows = [{ ...base, id: "old", createdAt: "2026-10-01T00:00:00Z" }, { ...base, id: "due", createdAt: "2026-11-09T00:00:00Z", lines: [{ ...line, allocations: [{ eta: "2026-11-09" }] }] }];
  expect(cases.summarizeCases(rows, { from: "2026-11-10", to: "2026-11-10", today: "2026-11-10" }).urgent[0].id).toBe("due");
});

it("requires cancelled quantities to settle known lines before cancelling a case", () => {
  expect(cases.validateCase({ ...base, status: "closed", closure: "cancelled", closureReason: "ไม่ใช้แล้ว" }).ok).toBe(false);
  expect(cases.validateCase({ ...base, status: "closed", closure: "cancelled", closureReason: "ไม่ใช้แล้ว", lines: [{ ...line, received: 3, cancelled: 7 }] }).ok).toBe(true);
});

it("retains an issue category for each item in a multi-issue case", () => {
  expect(cases.validateCase({ ...base, lines: [{ ...line, category: "damaged" }] }).value.lines[0].category).toBe("damaged");
});

it("rejects a fulfilled product line with an unspecified zero requirement", () => {
  expect(cases.validateCase({ ...base, status: "closed", closure: "fulfilled", lines: [{ ...line, required: 0, received: 0, cancelled: 0 }] }).ok).toBe(false);
});

it("filters unassigned cases using the same unknown-person choice as documents", () => {
  const rows = [{ ...base, responsibleId: "", createdAt: "2026-11-10T03:00:00Z" }, { ...base, responsibleId: "u1", createdAt: "2026-11-10T03:00:00Z" }];
  expect(cases.summarizeCases(rows, { from: "2026-11-10", to: "2026-11-10", staffId: "unknown" }).created).toBe(1);
});


it("separates all, unknown and known closure actors without filtering activity by case owner", () => {
  const rows = [
    { ...base, responsibleId: "owner", createdAt: "2026-11-10T01:00:00Z", status: "closed", history: [{ action: "closed", closure: "fulfilled", effectiveAt: "2026-11-10T03:00:00Z", actorUid: "solver" }] },
    { ...base, responsibleId: "", createdAt: "2026-11-10T01:00:00Z", status: "closed", history: [{ action: "closed", closure: "cancelled", effectiveAt: "2026-11-10T03:00:00Z", actorUid: "" }] },
    { ...base, responsibleId: "owner", createdAt: "2026-11-01T01:00:00Z", status: "closed", closure: "exception", resolvedAt: "2026-11-10T04:00:00Z" }
  ];
  const range = { from: "2026-11-10", to: "2026-11-10" };
  expect(cases.summarizeCases(rows, range)).toMatchObject({ created: 2, resolvedActivities: 1, cancelledActivities: 1, exceptionActivities: 1 });
  expect(cases.summarizeCases(rows, { ...range, staffId: "unknown", activityActorId: "unknown" })).toMatchObject({ created: 1, resolvedActivities: 0, cancelledActivities: 1, exceptionActivities: 1 });
  expect(cases.summarizeCases(rows, { ...range, staffId: "solver", activityActorId: "solver" })).toMatchObject({ created: 0, resolvedActivities: 1, cancelledActivities: 0, exceptionActivities: 0 });
});
