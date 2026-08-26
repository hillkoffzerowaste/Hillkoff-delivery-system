import { describe, expect, it } from "vitest";
import { ORDER_REGISTRY_SOURCE, bookingRegistryRecord, isOrderRegistrySource } from "../../lib/bookingRegistry.js";

describe("isOrderRegistrySource", () => {
  it("accepts the canonical value written by the order routes", () => {
    expect(isOrderRegistrySource(ORDER_REGISTRY_SOURCE)).toBe(true);
    expect(ORDER_REGISTRY_SOURCE).toBe("orders");
  });

  it("still accepts the legacy singular value so old reservations can be released", () => {
    expect(isOrderRegistrySource("order")).toBe(true);
  });

  it("rejects reservations owned by store reports and blank values", () => {
    expect(isOrderRegistrySource("store_reports")).toBe(false);
    expect(isOrderRegistrySource("")).toBe(false);
    expect(isOrderRegistrySource(undefined)).toBe(false);
  });

  it("records built for an order are recognised as order-owned", () => {
    const record = bookingRegistryRecord({
      serviceDate: "2026-08-26",
      bookingNumber: "csp-1234",
      source: ORDER_REGISTRY_SOURCE,
      sourceId: "ORDER-1"
    });
    expect(record).toMatchObject({ monthKey: "2026-08", bookingNumber: "CSP-1234", sourceId: "ORDER-1" });
    expect(isOrderRegistrySource(record.source)).toBe(true);
  });
});
