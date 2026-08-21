import { describe, expect, it } from "vitest";
import { getPackStoreCheckingOrders, isStoreCheckingForPack } from "../../lib/packStoreChecking";

const storeOrder = (overrides = {}) => ({
  deliveryMethod: "company_driver",
  workflowType: "store_route",
  queueStatus: "preparing",
  storeStatus: "pending",
  createdAt: "2026-08-21T01:00:00.000Z",
  ...overrides
});

describe("Pack Store-checking strip", () => {
  it("shows only unfinished Chiang Mai orders that are still at Store", () => {
    expect(isStoreCheckingForPack(storeOrder())).toBe(true);
    expect(isStoreCheckingForPack(storeOrder({ storeStatus: "working" }))).toBe(true);
    expect(isStoreCheckingForPack(storeOrder({ storeStatus: "checked" }))).toBe(false);
    expect(isStoreCheckingForPack(storeOrder({ storeStatus: "partial" }))).toBe(false);
    expect(isStoreCheckingForPack(storeOrder({ workflowType: "direct_pack" }))).toBe(false);
    expect(isStoreCheckingForPack(storeOrder({ deliveryMethod: "outstation" }))).toBe(false);
    expect(isStoreCheckingForPack(storeOrder({ queueStatus: "queued" }))).toBe(false);
  });

  it("puts active Store work ahead of jobs waiting to start", () => {
    const result = getPackStoreCheckingOrders([
      storeOrder({ id: "pending", storeStatus: "pending" }),
      storeOrder({ id: "working", storeStatus: "working" }),
      storeOrder({ id: "waiting", storeStatus: "waiting" })
    ]);
    expect(result.map((order) => order.id)).toEqual(["working", "waiting", "pending"]);
  });
});
