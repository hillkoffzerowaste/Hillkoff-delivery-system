import { describe, it, expect } from "vitest";
import { getDefaultStoreSettings, normalizeStoreSettings, validateStoreSettings, getBranchHeader } from "../../lib/storeSettings.js";

describe("staff directory and branch document headers", () => {
  it("retains staff names and separate branch header details when settings are saved and reloaded", () => {
    const settings = getDefaultStoreSettings();
    settings.staff = [{ id: "staff_123", name: "สมชาย", active: true }];
    settings.branches[0].header = { company: "สาขาช้างเผือก", address: "ที่อยู่สาขา", taxId: "123", phone: "053123456" };
    const checked = validateStoreSettings(settings);
    expect(checked.ok).toBe(true);
    const restored = normalizeStoreSettings(checked.value);
    expect(restored.staff).toEqual(settings.staff);
    expect(getBranchHeader(restored, "CP")).toMatchObject(settings.branches[0].header);
    expect(getBranchHeader(restored, "HQ").company).toBe(settings.header.company);
  });
  it("rejects duplicate IDs, blank names and excessive branch header text", () => {
    const settings = getDefaultStoreSettings();
    settings.staff = [{ id: "staff_123", name: "สมชาย" }, { id: "staff_123", name: "" }];
    settings.branches[0].header = { company: "x".repeat(201) };
    expect(validateStoreSettings(settings).ok).toBe(false);
  });
});
