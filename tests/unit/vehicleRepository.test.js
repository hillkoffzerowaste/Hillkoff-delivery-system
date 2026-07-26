import { describe, expect, it, vi } from "vitest";
import { listVehicles, resolveVehicle } from "../../lib/vehicleRepository.js";

describe("vehicle repository", () => {
  it("uses active Firestore vehicles when present", async () => {
    const get = vi.fn().mockResolvedValue({
      empty: false,
      docs: [
        { id: "V1", data: () => ({ plate: "กข 1", active: true }) },
        { id: "V2", data: () => ({ plate: "กข 2", active: false }) }
      ]
    });
    const db = { collection: () => ({ get, doc: () => ({ get: vi.fn() }) }) };
    await expect(listVehicles(db)).resolves.toEqual([expect.objectContaining({ id: "V1" })]);
  });

  it("falls back to the static master when the live master is empty", async () => {
    const db = {
      collection: () => ({
        get: vi.fn().mockResolvedValue({ empty: true, docs: [] }),
        doc: () => ({ get: vi.fn().mockResolvedValue({ exists: false }) })
      })
    };
    await expect(resolveVehicle(db, "AS541-6101-0001")).resolves.toMatchObject({ brand: "TOYOTA" });
  });
});
