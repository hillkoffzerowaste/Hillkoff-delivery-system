import { describe, expect, it } from "vitest";
import {
  buildChiangmaiRoundGroups,
  buildSalesChiangmaiCompletionPatch,
  canSalesCompleteChiangmaiOrder,
  isNormalChiangmaiOrder,
  resolveNextRoundDate,
  resolveOptionalChiangmaiRound,
  validateChiangmaiRound
} from "../../lib/preparationWorkflow.js";

describe("Chiang Mai sales rounds", () => {
  it("allows sales completion only after both store and pack checks and before driver queueing", () => {
    const ready = {
      deliveryMethod: "company_driver",
      workflowType: "store_route",
      storeStatus: "checked",
      packStatus: "checked",
      queueStatus: "ready",
      driverId: "",
      reworkRequired: false
    };

    expect(canSalesCompleteChiangmaiOrder(ready)).toBe(true);
    expect(canSalesCompleteChiangmaiOrder({ ...ready, storeStatus: "partial" })).toBe(false);
    expect(canSalesCompleteChiangmaiOrder({ ...ready, packStatus: "partial" })).toBe(false);
    expect(canSalesCompleteChiangmaiOrder({ ...ready, queueStatus: "queued" })).toBe(false);
    expect(canSalesCompleteChiangmaiOrder({ ...ready, driverId: "driver-1" })).toBe(false);
    expect(canSalesCompleteChiangmaiOrder({ ...ready, deliveryMethod: "outstation" })).toBe(false);
    expect(canSalesCompleteChiangmaiOrder({ ...ready, reworkRequired: true })).toBe(false);
  });

  it("records a sales-completed order without inventing driver delivery evidence", () => {
    const result = buildSalesChiangmaiCompletionPatch(
      { deliveryAttemptNumber: 2, workflowHistory: [{ action: "pack_update" }] },
      { uid: "sales-1", name: "ฝ่ายขายหนึ่ง", email: "sales@hillkoff.com", role: "sales" },
      "2026-08-12T12:00:00.000Z",
      "batch-1"
    );

    expect(result.patch).toMatchObject({
      status: "ส่งสำเร็จ",
      queueStatus: "completed",
      deliveryCompleteness: "complete",
      salesCompletedAt: "2026-08-12T12:00:00.000Z",
      salesCompletedBy: "ฝ่ายขายหนึ่ง",
      salesCompletionBatchId: "batch-1",
      deliveryAttemptNumber: 2
    });
    expect(result.patch).not.toHaveProperty("driverId");
    expect(result.patch).not.toHaveProperty("podPhotoCount");
    expect(result.patch.workflowHistory).toEqual([
      { action: "pack_update" },
      expect.objectContaining({ action: "sales_complete", batchId: "batch-1" })
    ]);
    expect(result.history).toMatchObject({ action: "sales_complete", result: "completed_by_sales", uid: "sales-1", role: "sales", batchId: "batch-1" });
  });

  it("resolves the next Tuesday, Wednesday and Friday from the created date", () => {
    expect(resolveNextRoundDate("2026-07-26", "tuesday")).toBe("2026-07-28");
    expect(resolveNextRoundDate("2026-07-26", "wednesday")).toBe("2026-07-29");
    expect(resolveNextRoundDate("2026-07-26", "friday")).toBe("2026-07-31");
  });

  it("accepts only one valid round for an active Chiang Mai company-driver order", () => {
    expect(validateChiangmaiRound({ deliveryMethod: "company_driver", queueStatus: "preparing" }, "tuesday")).toBe("tuesday");
    expect(() => validateChiangmaiRound({ deliveryMethod: "outstation" }, "tuesday")).toThrow(/Chiang Mai/i);
    expect(() => validateChiangmaiRound({ deliveryMethod: "company_driver" }, "monday")).toThrow(/round/i);
  });

  it("keeps an empty round as a normal Chiang Mai order", () => {
    const order = { deliveryMethod: "company_driver", queueStatus: "preparing" };
    expect(resolveOptionalChiangmaiRound(order, "")).toBe("");
    expect(isNormalChiangmaiOrder(order)).toBe(true);
    expect(isNormalChiangmaiOrder({ ...order, chiangmaiRoundCode: "tuesday" })).toBe(false);
  });

  it("groups only scheduled orders and exposes selectable ready order ids", () => {
    const groups = buildChiangmaiRoundGroups([
      { id: "NORMAL", deliveryMethod: "company_driver", queueStatus: "preparing", packStatus: "checked" },
      { id: "OUTSTATION", deliveryMethod: "outstation", queueStatus: "preparing", packStatus: "checked", chiangmaiRoundCode: "tuesday", chiangmaiRoundDate: "2026-07-28" },
      { id: "READY", deliveryMethod: "company_driver", queueStatus: "preparing", packStatus: "checked", chiangmaiRoundCode: "tuesday", chiangmaiRoundDate: "2026-07-28" },
      { id: "WAIT", deliveryMethod: "company_driver", queueStatus: "preparing", packStatus: "waiting", chiangmaiRoundCode: "tuesday", chiangmaiRoundDate: "2026-07-28" }
    ]);
    expect(groups).toHaveLength(1);
    expect(groups[0]).toMatchObject({
      roundCode: "tuesday",
      roundDate: "2026-07-28",
      total: 2,
      ready: 1,
      selectableIds: ["READY"]
    });
    expect(groups[0].orders.map((order) => order.id)).not.toContain("NORMAL");
    expect(groups[0].orders.map((order) => order.id)).not.toContain("OUTSTATION");
  });
});
