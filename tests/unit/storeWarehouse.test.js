import { describe, expect, it } from "vitest";
import { getDefaultStoreSettings, normalizeStoreSettings, validateStoreSettings } from "../../lib/storeSettings.js";
import { validateTransferRow } from "../../lib/storeTransfers.js";

function settings() {
  const value = getDefaultStoreSettings();
  value.branches = [
    { code: "WH", name: "สาขา A", type: "สาขา", active: true, warehouses: [{ id: "w1", name: "คลังหนึ่ง", active: true }, { id: "w2", name: "คลังสอง", active: true }, { id: "old", name: "คลังเก่า", active: false }] },
    { code: "BR", name: "สาขา B", type: "สาขา", active: true, warehouses: [{ id: "w3", name: "คลังสาม", active: true }] }
  ];
  return value;
}
const row = { transferNumber: "TR-0001", fromBranchCode: "WH", toBranchCode: "BR", preparerUid: "u1", preparerName: "พนักงาน", receipt: "complete" };

describe("branch warehouses", () => {
  it("persists warehouse settings and rejects duplicate warehouse IDs", () => {
    const value = settings();
    expect(normalizeStoreSettings(value).branches[0].warehouses).toEqual(value.branches[0].warehouses);
    expect(validateStoreSettings(value).value.branches[1].warehouses).toEqual(value.branches[1].warehouses);
    value.branches[0].warehouses.push({ id: "w1", name: "ซ้ำ", active: true });
    expect(validateStoreSettings(value).ok).toBe(false);
  });
  it("accepts warehouses only under their own branch and snapshots their names", () => {
    const cfg = normalizeStoreSettings(settings());
    const result = validateTransferRow({ ...row, fromWarehouseId: "w1", toWarehouseId: "w3" }, { settings: cfg });
    expect(result.value).toMatchObject({ fromWarehouseId: "w1", fromWarehouseName: "คลังหนึ่ง", toWarehouseId: "w3", toWarehouseName: "คลังสาม" });
    expect(validateTransferRow({ ...row, fromWarehouseId: "w3" }, { settings: cfg }).ok).toBe(false);
    expect(validateTransferRow({ ...row, fromWarehouseId: "old" }, { settings: cfg }).ok).toBe(false);
  });
  it("permits a transfer between distinct warehouses of the same branch", () => {
    const result = validateTransferRow({ ...row, toBranchCode: "WH", fromWarehouseId: "w1", toWarehouseId: "w2" }, { settings: normalizeStoreSettings(settings()) });
    expect(result.ok).toBe(true);
    expect(validateTransferRow({ ...row, toBranchCode: "WH", fromWarehouseId: "w1", toWarehouseId: "w1" }, { settings: normalizeStoreSettings(settings()) }).ok).toBe(false);
  });
});
