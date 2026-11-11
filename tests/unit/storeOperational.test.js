import { expect, it } from "vitest";
import { buildOperationalDashboard, selectOperationalScope } from "../../lib/storeDashboard.js";
import { analyzeCases } from "../../lib/storeCases.js";

const range = { from: "2026-11-10", to: "2026-11-10", today: "2026-11-11" };
const line = { id: "l", name: "Coffee", required: 5, received: 0, cancelled: 0, unit: "bag" };
const item = { id: "transfer_t", sourceType: "transfer", sourceId: "t", responsibleId: "a", responsibleName: "A", createdAt: "2026-11-10T01:00:00Z", status: "open", lines: [line] };
it("separates creation cohort, all-date backlog and closure actors including repeated closures", () => {
  const data = buildOperationalDashboard({ ...range, cases: [item, { ...item, id: "old", createdAt: "2026-10-01T00:00:00Z", status: "reopened", history: [1, 2].map((n) => ({ action: "closed", effectiveAt: `2026-11-10T0${n}:00:00Z`, actorUid: "b", closure: "fulfilled" })) }] });
  const a = selectOperationalScope(data, { staffId: "a" });
  const b = selectOperationalScope(data, { staffId: "b" });
  expect(a.cohort).toHaveLength(1); expect(a.backlog).toHaveLength(2); expect(a.activities).toHaveLength(0);
  expect(b.cohort).toHaveLength(0); expect(b.activities).toHaveLength(2);
  expect(new Set(b.activities.map((row) => row.key)).size).toBe(2);
});
it("uses disjoint line counts, separates unknown cases, and never calls cancelled goods complete", () => {
  const data = buildOperationalDashboard({ ...range, cases: [item, { ...item, id: "mixed", lines: [{ ...line, received: 3, cancelled: 2 }] }, { ...item, id: "done", status: "closed", lines: [{ ...line, received: 5 }] }, { ...item, id: "unknown", lines: [] }] });
  const scope = selectOperationalScope(data);
  expect(scope.receiving.map((part) => [part.id, part.rows.length])).toEqual([["complete", 1], ["partial", 0], ["not_received", 1], ["cancelled", 1]]);
  expect(scope.unknownReceiving).toHaveLength(1); expect(scope.shortages).toHaveLength(1);
});
it("partitions quality by one category and cause per case, retaining unknown values", () => {
  const scope = selectOperationalScope(buildOperationalDashboard({ ...range, cases: [item, { ...item, id: "second", category: "shortage", cause: "Supplier late", lines: [{ ...line, received: 2 }] }] }));
  expect(scope.receiving.find((part) => part.id === "partial").rows).toHaveLength(1);
  expect(scope.categoryParts.map((part) => part.rows.length).reduce((a, b) => a + b, 0)).toBe(2);
  expect(scope.causeParts.map((part) => part.rows.length).reduce((a, b) => a + b, 0)).toBe(2);
  expect(scope.causeParts.find((part) => part.label === "ไม่ระบุสาเหตุ").rows[0].id).toBe(item.id);
});
it("keeps late service-day attribution and stable source keys with exact filtered drilldown", () => {
  const data = buildOperationalDashboard({ ...range, roster: [{ uid: "a", name: "A" }], reports: [{ id: "same", type: "booking", confirmedAt: "2026-11-11T01:00:00Z", createdAt: "2026-11-11T01:00:00Z", serviceDate: "2026-11-10", storeCheckerName: "A", branchCode: "HQ" }], transfers: [{ id: "same", preparerUid: "a", preparerName: "A", serviceDate: "2026-11-10", toBranchCode: "HQ" }, { id: "unknown", serviceDate: "2026-11-10", toBranchCode: "CP" }] });
  expect(data.documents.map((row) => row.key)).toEqual(["booking:same", "transfer:same", "transfer:unknown"]);
  const scoped = selectOperationalScope(data, { staffId: "a", branchCode: "HQ", type: "transfer" });
  expect(scoped.documents).toHaveLength(1); expect(scoped.documentParts.reduce((n, p) => n + p.rows.length, 0)).toBe(1);
  expect(selectOperationalScope(data, { staffId: "unknown" }).documents).toHaveLength(1);
});
it("ignores settled allocations when calculating overdue and current sources", () => {
  expect(analyzeCases([{ ...item, lines: [{ ...line, received: 5, allocations: [{ supplier: "Old", eta: "2020-01-01" }] }] }], range.today).overdue).toBe(0);
});
it("keeps fulfilled, cancellation, exception and unknown closures separate in the cohort", () => {
  const cases = ["fulfilled", "cancelled", "exception", ""].map((closure, index) => ({ ...item, id: String(index), status: "closed", closure }));
  const scope = selectOperationalScope(buildOperationalDashboard({ ...range, cases }));
  expect(scope.caseParts.map((part) => part.rows.length)).toEqual([0, 1, 1, 1, 1]);
  expect(scope.backlog).toHaveLength(0);
});
it("handles thousands of distinct lines without losing unknown-data membership", () => {
  const cases = Array.from({ length: 1000 }, (_, index) => ({ ...item, id: String(index), lines: Array.from({ length: 10 }, (_, n) => ({ ...line, id: String(n), unit: n % 2 ? "kg" : "bag" })) }));
  cases[999].lines[9].required = undefined;
  const scope = selectOperationalScope(buildOperationalDashboard({ ...range, cases }));
  expect(scope.receiving.reduce((sum, part) => sum + part.rows.length, 0)).toBe(9999);
  expect(scope.unknownReceiving.map((row) => row.id)).toEqual(["999"]);
});
