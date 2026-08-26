import { describe, expect, it } from "vitest";
import { bookingRegistryRecord, canReleaseStoreReportReservation } from "../../lib/bookingRegistry.js";

function storeReportRegistry(overrides = {}) {
  return {
    ...bookingRegistryRecord({
      serviceDate: "2026-08-26",
      bookingNumber: "CSP-1234",
      source: "store_reports",
      sourceId: "report-1"
    }),
    ...overrides
  };
}

describe("canReleaseStoreReportReservation", () => {
  it("releases a reservation the report owns and nobody borrowed", () => {
    expect(canReleaseStoreReportReservation(storeReportRegistry(), "report-1")).toBe(true);
  });

  it("keeps a reservation that a pack-assist order is borrowing", () => {
    const registry = storeReportRegistry({ sharedWithOrderIds: ["DO-260826-120000000-ABCD1234"] });
    expect(canReleaseStoreReportReservation(registry, "report-1")).toBe(false);
  });

  it("keeps legacy reservations that predate share tracking, since sharing cannot be ruled out", () => {
    const registry = storeReportRegistry();
    delete registry.sharedWithOrderIds;
    expect(canReleaseStoreReportReservation(registry, "report-1")).toBe(false);
  });

  it("never releases a reservation owned by a different report", () => {
    expect(canReleaseStoreReportReservation(storeReportRegistry(), "report-2")).toBe(false);
  });

  it("never releases an order-owned reservation", () => {
    const registry = storeReportRegistry({ source: "orders", sourceId: "report-1" });
    expect(canReleaseStoreReportReservation(registry, "report-1")).toBe(false);
  });

  it("new records start with an empty borrower list", () => {
    expect(bookingRegistryRecord({ serviceDate: "2026-08-26", bookingNumber: "CSP-1234", source: "store_reports", sourceId: "r" }).sharedWithOrderIds).toEqual([]);
  });
});
