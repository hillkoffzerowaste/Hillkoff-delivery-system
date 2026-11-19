import { describe, expect, it } from "vitest";
import { CLAIM_KINDS, PRODUCTION_COLUMNS, parseClaimPaste, parseProductionPaste, resolveBranch, sameProductionRecord, storeMainBranches, validateProductionRecord } from "../../lib/storeClaimsProduction.js";
import { buildWarehouseDashboard } from "../../lib/storeWarehouseDashboard.js";

describe("store data completeness", () => {
  const branches = [{ code: "HK1", name: "ช้างเผือก" }, { code: "HQ", name: "สำนักงานใหญ่" }, { code: "MHD", name: "มหิดล" }, { code: "PP", name: "ป่าแพ่ง" }];
  it("resolves the configured Chang Phueak identity without expanding main branches", () => {
    expect(resolveBranch(branches, "CP")?.code).toBe("HK1");
    expect(resolveBranch([{ code: "CP" }, ...branches], "CP").code).toBe("CP");
    expect(storeMainBranches(branches).map((b) => b.code)).toEqual(["HK1", "HQ", "MHD"]);
    expect(storeMainBranches(branches.map((b) => ({ ...b, active: b.code !== "HK1" }))).map((b) => b.code)).toEqual(["HQ", "MHD"]);
    expect(validateProductionRecord({ serviceDate: "2026-11-19", branchCode: "HK1", items: [{ name: "กาแฟ", qty: 1 }] }, { settings: { branches }, today: "2026-11-19" }).ok).toBe(true);
  });

  it.each(["abc", ""])("reports invalid first and later production quantities (%s)", (quantity) => {
    const result = parseProductionPaste(`A\tกาแฟ\tkg\t${quantity}\nB\tชา\tถุง\t${quantity}`);
    expect(result.items).toEqual([]);
    expect(result.errors.map((e) => e.line)).toEqual([1, 2]);
  });
  it.each(["claimable", "unclaimable"])("reports incomplete %s data rows while accepting real headers", (kind) => {
    const cells = kind === "claimable" ? ["2026-11-19", "C1", "A", "กาแฟ", ""] : ["2026-11-19", "C1", "ชำรุด", "A", "กาแฟ", "คน", "CP", ""];
    const result = parseClaimPaste(kind, `${cells.join("\t")}\n${CLAIM_KINDS[kind].columns.join("\t")}\n${cells.join("\t")}`, branches, "2026-11-19");
    expect(result.documents).toEqual([]);
    expect(result.errors.map((e) => e.line)).toEqual([1, 3]);
    expect(parseProductionPaste(PRODUCTION_COLUMNS.join("\t")).errors).toEqual([]);
  });

  const saved = { branchCode: "HK1", serviceDate: "2026-11-19", documentNumber: "P1", note: "เช้า", items: [{ code: "A", name: "กาแฟ", unit: "kg", qty: 2, sold: 0 }] };
  it("accepts unchanged saves and rejects changed document details", () => {
    expect(sameProductionRecord(saved, structuredClone(saved))).toBe(true);
    for (const changed of [{ ...saved, documentNumber: "P2" }, { ...saved, note: "บ่าย" }, { ...saved, items: [{ ...saved.items[0], unit: "ถุง" }] }]) expect(sameProductionRecord(saved, changed)).toBe(false);
  });

  it("separates production units and tracks partial sales coverage including known zero", () => {
    const data = buildWarehouseDashboard({ from: "2026-11-19", to: "2026-11-19", branchList: branches, production: [saved, { ...saved, items: [{ ...saved.items[0], sold: null }, { ...saved.items[0], unit: "ถุง", qty: 5, sold: 3 }] }] });
    const production = data.branches.find((b) => b.code === "HK1").production;
    expect(production.items).toHaveLength(2);
    expect(production.items.find((i) => i.unit === "kg")).toMatchObject({ qty: 4, sold: 0, soldKnownLines: 1, soldMissingLines: 1, soldComplete: false });
    expect(production).toMatchObject({ soldKnownLines: 2, soldMissingLines: 1, soldComplete: false });
    expect(production.totalsPerUnit).toEqual(expect.arrayContaining([{ unit: "kg", qty: 4, sold: 0, soldKnown: true, soldKnownLines: 1, soldMissingLines: 1, soldComplete: false }, { unit: "ถุง", qty: 5, sold: 3, soldKnown: true, soldKnownLines: 1, soldMissingLines: 0, soldComplete: true }]));
  });
  it("groups historical aliases under the configured identity without merging exact configured codes", () => {
    const input = { from: "2026-11-19", to: "2026-11-19", branchList: branches, production: [{ ...saved, branchCode: "CP" }], transfers: [{ serviceDate: "2026-11-19", fromBranchCode: "CP", toBranchCode: "MHD", itemCount: 1 }], audits: [{ serviceDate: "2026-11-19", branchCode: "CP", total: 2, mismatch: 0 }], claims: [{ kind: "claimable", serviceDate: "2026-11-19", branchCode: "CP", items: [], totalQty: 0, totalAmount: 0 }] };
    const data = buildWarehouseDashboard(input);
    expect(data.branches.map((b) => b.code)).not.toContain("CP");
    expect(data.branches.find((b) => b.code === "HK1")).toMatchObject({ transfers: { total: 1 }, audits: { docs: 1 }, production: { records: 1 } });
    expect(data.claims.claimable.docs[0].branchCode).toBe("HK1");
    const exact = buildWarehouseDashboard({ ...input, branchList: [{ code: "CP", name: "CP" }, ...branches] });
    expect(exact.branches.find((b) => b.code === "CP").production.records).toBe(1);
    const inactive = buildWarehouseDashboard({ ...input, branchNames: { CP: "ช้างเผือกเดิม" } });
    expect(inactive.branches.find((b) => b.code === "CP")?.production.records).toBe(1);
  });
});
