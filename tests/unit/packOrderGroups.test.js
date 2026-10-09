import { describe, expect, it } from "vitest";
import { groupPackOrders } from "../../lib/packOrderGroups";

const order = (overrides = {}) => ({
  id: "BAG-1",
  customerId: "customer-1",
  customerName: "ร้านกาแฟผสม",
  serviceDate: "2026-10-09",
  bookingNumber: "CSP-1234",
  boxes: 1,
  packageUnit: "bag",
  packStatus: "pending",
  ...overrides
});

describe("Pack order groups", () => {
  it("combines split bags from the same booking into one actionable group", () => {
    const groups = groupPackOrders([
      order({ id: "BAG-1", boxes: 2 }),
      order({ id: "BAG-2", boxes: 3 })
    ]);

    expect(groups).toHaveLength(1);
    expect(groups[0]).toMatchObject({
      orderIds: ["BAG-1", "BAG-2"],
      totalBoxes: 5,
      packageUnit: "bag",
      isBatch: true
    });
  });

  it("does not combine different customers or different bookings", () => {
    const groups = groupPackOrders([
      order({ id: "A", bookingNumber: "CSP-1234" }),
      order({ id: "B", bookingNumber: "CSP-1234", customerId: "customer-2" }),
      order({ id: "C", bookingNumber: "CSP-5678" }),
      order({ id: "D", bookingNumber: "" })
    ]);

    expect(groups.map((group) => group.orderIds)).toEqual([["A"], ["B"], ["C"], ["D"]]);
  });

  it("uses an explicit batch id when a split set has no booking number", () => {
    const groups = groupPackOrders([
      order({ id: "A", bookingNumber: "", packBatchId: "blend-1" }),
      order({ id: "B", bookingNumber: "", packBatchId: "blend-1" }),
      order({ id: "C", bookingNumber: "", packBatchId: "blend-2" })
    ]);

    expect(groups.map((group) => group.orderIds)).toEqual([["A", "B"], ["C"]]);
  });

  it("keeps an order with an existing quantity as one group", () => {
    const groups = groupPackOrders([order({ id: "WHOLE-ORDER", boxes: 8 })]);

    expect(groups[0]).toMatchObject({ orderIds: ["WHOLE-ORDER"], totalBoxes: 8, isBatch: false });
  });
});
