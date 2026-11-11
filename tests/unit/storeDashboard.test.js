import { it, expect } from "vitest";
import * as dashboard from "../../lib/storeDashboard.js";
it("shares document totals and drilldown with branch and person filters", () => {
  const input = { from: "2026-11-10", to: "2026-11-10", roster: [{ uid: "u", name: "A" }], transfers: [{ id: "t", serviceDate: "2026-11-10", preparerUid: "u", preparerName: "A", toBranchCode: "HQ" }], audits: [{ id: "a", serviceDate: "2026-11-10", checkerName: "A", branchCode: "CP", total: 10 }], reports: [] };
  const full = dashboard.buildDocumentDashboard(input);
  expect(full.total).toBe(2); expect(full.people[0]).toMatchObject({ transfer: 1, auditDocs: 1 });
  const filtered = dashboard.buildDocumentDashboard({ ...input, branchCode: "HQ", staffId: "u" });
  expect(filtered.total).toBe(1); expect(filtered.documents.map((d) => d.id)).toEqual(["t"]);
});
