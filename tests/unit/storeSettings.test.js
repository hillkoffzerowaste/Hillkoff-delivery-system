import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  ALWAYS_ENABLED_MODULE_IDS,
  FIELD_DEFINITIONS,
  STORE_MODULE_GROUPS,
  STORE_MODULE_IDS,
  STORE_SETTINGS_TAB_ID,
  documentCounterId,
  documentPeriodKey,
  documentRegistryId,
  findBranch,
  formatDocumentNumber,
  getActiveBranches,
  getDefaultStoreSettings,
  getEnabledStoreModules,
  getFirstEnabledStoreTab,
  isStoreTabAllowed,
  normalizeDocumentNumber,
  normalizeStoreSettings,
  parseDocumentSequence,
  removedBranchCodes,
  resolveStoreDisplayTab,
  sampleDocumentNumber,
  validateDocumentNumber,
  validateStoreSettings
} from "../../lib/storeSettings.js";

const branch = (code, extra = {}) => ({ code, name: `สาขา ${code}`, type: "สาขา", active: true, ...extra });
const validInput = (mutate) => {
  const input = getDefaultStoreSettings();
  mutate?.(input);
  return input;
};
const errorPaths = (result) => result.errors.map((e) => e.path);

describe("defaults and normalize", () => {
  it("has the six store modules in the default order, all enabled", () => {
    const { modules } = getDefaultStoreSettings();
    expect(modules.map((m) => m.id)).toEqual([
      "store-booking",
      "store-online",
      "store-dashboard",
      "store-transfer",
      "store-audit",
      "store-overview"
    ]);
    expect(modules.map((m) => m.id)).toEqual(STORE_MODULE_IDS);
    expect(modules.map((m) => m.name)).toEqual([
      "ใบสั่งจอง",
      "ใบขายออนไลน์",
      "รายงานประจำวัน",
      "ใบโอนสินค้า",
      "Internal Audit",
      "รายงานแดชบอร์ด"
    ]);
    expect(modules.map((m) => m.order)).toEqual([0, 1, 2, 3, 4, 5]);
    expect(modules.every((m) => m.enabled)).toBe(true);
    expect(getDefaultStoreSettings()).not.toBe(getDefaultStoreSettings());
  });

  it("groups every module exactly once", () => {
    const ids = STORE_MODULE_GROUPS.flatMap((g) => g.moduleIds);
    expect([...ids].sort()).toEqual([...STORE_MODULE_IDS].sort());
    expect(STORE_MODULE_GROUPS.map((g) => g.id)).toEqual(["core", "addon", "report"]);
  });

  it("normalizes undefined and junk to the defaults", () => {
    expect(normalizeStoreSettings(undefined)).toEqual(getDefaultStoreSettings());
    expect(normalizeStoreSettings("x")).toEqual(getDefaultStoreSettings());
  });

  it("drops unknown/old module ids, appends missing ones and forces booking/online on", () => {
    const normalized = normalizeStoreSettings({
      modules: [
        { id: "store-work", name: "เชียงใหม่", enabled: true, order: 0 },
        { id: "store-pickup", name: "Grab", enabled: true, order: 1 },
        { id: "store-audit", name: "ตรวจนับ", enabled: false, order: 2 },
        { id: "store-booking", name: "", enabled: false, order: 3 },
        { id: "store-audit", name: "ซ้ำ", enabled: true, order: 4 }
      ]
    });
    expect(normalized.modules.map((m) => m.id)).toEqual([
      "store-audit",
      "store-booking",
      "store-online",
      "store-dashboard",
      "store-transfer",
      "store-overview"
    ]);
    expect(normalized.modules[0]).toMatchObject({ name: "ตรวจนับ", enabled: false, order: 0 });
    expect(normalized.modules[1]).toMatchObject({ name: "ใบสั่งจอง", enabled: true });
    expect(normalized.modules.map((m) => m.order)).toEqual([0, 1, 2, 3, 4, 5]);
  });

  it("keeps only valid branches and tolerant document fields", () => {
    const normalized = normalizeStoreSettings({
      branches: [branch("wh"), branch("WH"), { code: "X", name: "bad" }, { code: "BR01", name: "" }],
      documents: {
        transfer: { prefix: "bad1", digits: 9, fields: [{ id: "no", show: false, label: "เลข" }, { id: "zzz" }] }
      }
    });
    expect(normalized.branches).toEqual([branch("wh", { code: "WH" })]);
    expect(normalized.documents.transfer.prefix).toBe("TR");
    expect(normalized.documents.transfer.digits).toBe(4);
    const no = normalized.documents.transfer.fields.find((f) => f.id === "no");
    expect(no).toMatchObject({ label: "เลข", show: true, required: true });
    expect(normalized.documents.transfer.fields).toHaveLength(FIELD_DEFINITIONS.transfer.length);
  });

  it("makes the audit branch field locked", () => {
    const area = FIELD_DEFINITIONS.audit.find((f) => f.id === "area");
    expect(area).toMatchObject({ locked: true, requiredLocked: true });
    const normalized = normalizeStoreSettings({
      documents: { audit: { fields: [{ id: "area", show: false, required: false }] } }
    });
    expect(normalized.documents.audit.fields.find((f) => f.id === "area")).toMatchObject({ show: true, required: true });
  });

  it("does not import Node built-ins in client-safe modules", () => {
    for (const file of ["lib/storeSettings.js", "lib/storeFormat.js"]) {
      const source = readFileSync(new URL(`../../${file}`, import.meta.url), "utf8");
      expect(source).not.toMatch(/from\s+["'](node:|crypto|fs|path)/);
    }
  });
});

describe("tab resolution", () => {
  it("defaults to store-booking and passes settings through", () => {
    const defaults = getDefaultStoreSettings();
    expect(getFirstEnabledStoreTab(defaults)).toBe("store-booking");
    expect(resolveStoreDisplayTab("store-work", defaults)).toBe("store-booking");
    expect(resolveStoreDisplayTab("store-pickup", defaults)).toBe("store-booking");
    expect(resolveStoreDisplayTab("nonsense", defaults)).toBe("store-booking");
    expect(resolveStoreDisplayTab("store-settings", defaults)).toBe(STORE_SETTINGS_TAB_ID);
    expect(resolveStoreDisplayTab("store-audit", defaults)).toBe("store-audit");
  });

  it("falls back when a module is disabled and filters enabled modules", () => {
    const settings = getDefaultStoreSettings();
    settings.modules.find((m) => m.id === "store-audit").enabled = false;
    expect(resolveStoreDisplayTab("store-audit", settings)).toBe("store-booking");
    expect(isStoreTabAllowed(settings, "store-audit")).toBe(false);
    expect(isStoreTabAllowed(settings, "store-transfer")).toBe(true);
    expect(getEnabledStoreModules(settings).map((m) => m.id)).not.toContain("store-audit");
  });

  it("never returns undefined even if booking/online are marked disabled", () => {
    const settings = getDefaultStoreSettings();
    settings.modules.forEach((m) => {
      m.enabled = false;
    });
    expect(ALWAYS_ENABLED_MODULE_IDS).toContain(getFirstEnabledStoreTab(settings));
  });

  it("looks up branches", () => {
    const settings = { branches: [branch("WH"), branch("BR", { active: false })] };
    expect(getActiveBranches(settings).map((b) => b.code)).toEqual(["WH"]);
    expect(findBranch(settings, " br ").code).toBe("BR");
    expect(findBranch(settings, "ZZ")).toBeNull();
  });
});

describe("validateStoreSettings", () => {
  it("accepts defaults and returns a normalized value", () => {
    const result = validateStoreSettings(validInput((s) => s.branches.push(branch("wh"))));
    expect(result.ok).toBe(true);
    expect(result.value.branches.some((item) => item.code === "WH")).toBe(true);
    expect(result.value.modules.map((m) => m.order)).toEqual([0, 1, 2, 3, 4, 5]);
  });

  it("forces booking/online enabled and locked fields", () => {
    const result = validateStoreSettings(
      validInput((s) => {
        s.modules[0].enabled = false;
        s.modules[1].enabled = false;
        s.documents.transfer.fields.find((f) => f.id === "no").show = false;
        s.documents.audit.fields.find((f) => f.id === "mismatch").required = true;
        s.documents.audit.fields.find((f) => f.id === "area").show = false;
      })
    );
    expect(result.ok).toBe(true);
    expect(result.value.modules[0].enabled).toBe(true);
    expect(result.value.modules[1].enabled).toBe(true);
    expect(result.value.documents.transfer.fields.find((f) => f.id === "no")).toMatchObject({ show: true, required: true });
    expect(result.value.documents.audit.fields.find((f) => f.id === "mismatch")).toMatchObject({ show: true, required: false });
    expect(result.value.documents.audit.fields.find((f) => f.id === "area")).toMatchObject({ show: true, required: true });
  });

  it("rejects bad modules", () => {
    expect(validateStoreSettings(validInput((s) => s.modules.pop())).ok).toBe(false);
    expect(validateStoreSettings(validInput((s) => s.modules.push({ ...s.modules[0] }))).ok).toBe(false);
    expect(validateStoreSettings(validInput((s) => (s.modules[0].id = "store-work"))).ok).toBe(false);
    expect(validateStoreSettings(validInput((s) => (s.modules[2].name = "  "))).ok).toBe(false);
    expect(validateStoreSettings(validInput((s) => (s.modules[2].name = "ก".repeat(41)))).ok).toBe(false);
  });

  it("rejects bad branches with Thai messages", () => {
    const bad = (b) => validateStoreSettings(validInput((s) => s.branches.push(b)));
    expect(bad(branch("A")).errors[0].message).toBe("รหัสสาขาต้องเป็นอักษรอังกฤษหรือตัวเลข 2–6 ตัว");
    expect(bad(branch("AB-1")).ok).toBe(false);
    expect(bad(branch("WH", { name: "" })).errors[0].message).toBe("กรุณาระบุชื่อสาขา");
    expect(bad(branch("WH", { name: "ก".repeat(61) })).ok).toBe(false);
    expect(bad(branch("WH", { type: "อื่น" })).ok).toBe(false);
    const dup = validateStoreSettings(validInput((s) => s.branches.push(branch("WH"), branch("wh"))));
    expect(dup.errors[0].message).toBe("รหัสสาขา WH มีอยู่แล้ว");
  });

  it("rejects bad document settings", () => {
    const bad = (mutate) => validateStoreSettings(validInput(mutate));
    expect(bad((s) => (s.documents.transfer.prefix = "T1")).errors[0].message).toBe("อักษรนำหน้าต้องเป็นภาษาอังกฤษ 1–6 ตัว คั่นด้วยขีดได้ 1 ครั้ง เช่น STK-TRF");
    expect(bad((s) => (s.documents.transfer.prefix = "TOOLONGX")).ok).toBe(false);
    expect(bad((s) => (s.documents.audit.prefix = "tr")).errors[0].message).toBe("อักษรนำหน้า TR ถูกใช้แล้ว");
    expect(bad((s) => (s.documents.audit.digits = 2)).ok).toBe(false);
    expect(bad((s) => (s.documents.audit.digits = 6)).ok).toBe(false);
    expect(bad((s) => (s.documents.audit.pattern = "x")).ok).toBe(false);
    expect(bad((s) => (s.documents.audit.reset = "week")).ok).toBe(false);
    expect(bad((s) => (s.documents.audit.fields[2].label = "")).ok).toBe(false);
    expect(bad((s) => (s.documents.audit.fields[2].label = "ก".repeat(41))).ok).toBe(false);
    expect(bad((s) => (s.documents.audit.fields[2].id = "ghost")).ok).toBe(false);
    expect(bad((s) => (s.header.address = "ก".repeat(201))).ok).toBe(false);
    expect(errorPaths(bad((s) => (s.header.company = "x".repeat(201))))).toEqual(["header.company"]);
    expect(validateStoreSettings(null).ok).toBe(false);
  });

  it("lists branch codes removed between versions", () => {
    const previous = { branches: [branch("WH"), branch("BR")] };
    expect(removedBranchCodes(previous, { branches: [branch("WH")] })).toEqual(["BR"]);
    expect(removedBranchCodes(previous, previous)).toEqual([]);
    expect(removedBranchCodes(undefined, previous)).toEqual([]);
  });
});

describe("document numbers", () => {
  const cfg = (extra) => ({ prefix: "TR", pattern: "dash", digits: 4, reset: "none", ...extra });

  it("formats all three patterns", () => {
    const base = { prefix: "TR", digits: 4, sequence: 418, branchCode: "wh", serviceDate: "2026-10-28" };
    expect(formatDocumentNumber({ ...base, pattern: "dash" })).toBe("TR-0418");
    expect(formatDocumentNumber({ ...base, pattern: "yymm" })).toBe("TR6910-0418");
    expect(formatDocumentNumber({ ...base, pattern: "branch" })).toBe("TR-WH-0418");
    expect(formatDocumentNumber({ ...base, pattern: "dash", digits: 3, sequence: 5 })).toBe("TR-005");
    expect(formatDocumentNumber({ ...base, pattern: "dash", digits: 5 })).toBe("TR-00418");
  });

  it("builds samples for the settings page", () => {
    expect(sampleDocumentNumber(cfg())).toBe("TR-0418");
    expect(sampleDocumentNumber(cfg({ pattern: "yymm" }))).toBe("TR6910-0418");
    expect(sampleDocumentNumber(cfg({ pattern: "branch" }))).toBe("TR-WH-0418");
    expect(sampleDocumentNumber(cfg({ digits: 5 }))).toBe("TR-00418");
  });

  it("validates numbers and normalizes case/spaces", () => {
    expect(validateDocumentNumber(" tr-0418 ", cfg())).toEqual({ ok: true, number: "TR-0418" });
    expect(validateDocumentNumber("TR-12345678", cfg())).toMatchObject({ ok: true });
    expect(validateDocumentNumber("AU-0418", cfg())).toEqual({
      ok: false,
      error: "เลขที่เอกสารต้องอยู่ในรูปแบบ TR-0418"
    });
    expect(validateDocumentNumber("TR-418", cfg()).ok).toBe(false);
    expect(validateDocumentNumber("TR-123456789", cfg()).ok).toBe(false);
    expect(validateDocumentNumber("TR6910-0418", cfg({ pattern: "yymm" })).ok).toBe(true);
    expect(validateDocumentNumber("TR6913-0418", cfg({ pattern: "yymm" })).ok).toBe(false);
    expect(validateDocumentNumber("TR-WH-0418", cfg({ pattern: "branch" }), { branchCodes: ["WH"] }).ok).toBe(true);
    expect(validateDocumentNumber("tr-wh-0418", cfg({ pattern: "branch" }), { branchCodes: ["wh"] }).ok).toBe(true);
    expect(validateDocumentNumber("TR-ZZ-0418", cfg({ pattern: "branch" }), { branchCodes: ["WH"] }).ok).toBe(false);
  });

  it("parses sequences", () => {
    expect(parseDocumentSequence("TR-0418", cfg())).toBe(418);
    expect(parseDocumentSequence("TR6910-0007", cfg({ pattern: "yymm" }))).toBe(7);
    expect(parseDocumentSequence("TR-WH-0123", cfg({ pattern: "branch" }))).toBe(123);
    expect(parseDocumentSequence("XX-0001", cfg())).toBeNull();
    expect(normalizeDocumentNumber(" a u-0 1 ")).toBe("AU-01");
  });

  it("builds period keys, registry ids and counter ids", () => {
    expect(documentPeriodKey("none", "2026-10-28")).toBe("all");
    expect(documentPeriodKey("month", "2026-10-28")).toBe("2026-10");
    expect(documentPeriodKey("year", "2026-10-28")).toBe("2026");
    expect(documentRegistryId("transfer", "TR-0418", { reset: "none", serviceDate: "2026-10-28" })).toBe("transfer__all__TR-0418");
    const oct = documentRegistryId("audit", "AU-0001", { reset: "month", serviceDate: "2026-10-28" });
    const nov = documentRegistryId("audit", "AU-0001", { reset: "month", serviceDate: "2026-11-02" });
    expect(oct).toBe("audit__2026-10__AU-0001");
    expect(nov).not.toBe(oct);
    expect(documentRegistryId("audit", "AU-0001", { reset: "year", serviceDate: "2026-10-28" })).toBe("audit__2026__AU-0001");
    expect(documentCounterId("audit", { reset: "month", serviceDate: "2026-10-28" })).toBe("audit__2026-10");
  });
});
